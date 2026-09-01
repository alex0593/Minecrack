from contextlib import asynccontextmanager
from datetime import timezone
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from .database import create_db_and_tables, get_session
from .models import Mod, Modpack, ModpackRelease, ModVersion, ReleaseFile, ReleaseStatus, utcnow
from .schemas import (
    LoginRequest, Manifest, ManifestFile, ManifestModpack, ManifestRelease, ModCreate,
    ModpackCreate, ReleaseCreate, VerifyDifference, VerifyRequest, VerifyResponse,
)
from .security import authenticate, create_session, require_admin
from .settings import settings
from .storage import storage


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    if settings.auto_create_schema:
        create_db_and_tables()
    yield


app = FastAPI(title="Minecrack Ecosystem API", version="1.0.0", lifespan=lifespan)


@app.get("/health/live")
async def live() -> dict:
    return {"status": "ok"}


@app.get("/health/ready")
async def ready(session: Session = Depends(get_session)) -> dict:
    session.exec(select(Modpack).limit(1)).all()
    return {"status": "ready"}


def _get_release(session: Session, release_id: int, require_published: bool = True) -> ModpackRelease:
    release = session.get(ModpackRelease, release_id)
    if not release or (require_published and release.status == ReleaseStatus.draft):
        raise HTTPException(status_code=404, detail="Release not found")
    return release


def _manifest(session: Session, pack: Modpack, release: ModpackRelease) -> Manifest:
    if not release.published_at:
        raise HTTPException(status_code=409, detail="Release has not been published")
    rows = session.exec(
        select(ReleaseFile, ModVersion)
        .join(ModVersion, ReleaseFile.mod_version_id == ModVersion.id)
        .where(ReleaseFile.release_id == release.id)
        .order_by(ReleaseFile.file_name)
    ).all()
    return Manifest(
        modpack=ManifestModpack(id=pack.id, slug=pack.slug, name=pack.name),
        release=ManifestRelease(
            id=release.id,
            version=release.version_string,
            minecraftVersion=release.minecraft_version,
            loader=release.loader,
            changelog=release.changelog,
            publishedAt=release.published_at,
        ),
        files=[
            ManifestFile(
                fileName=link.file_name,
                sha256=version.sha256,
                size=version.file_size_bytes,
                downloadUrl=f"{settings.public_base_url}/api/v1/files/{version.sha256}",
            )
            for link, version in rows
        ],
    )


@app.get("/api/v1/modpacks/{modpack_id}/active/manifest", response_model=Manifest)
async def active_manifest(modpack_id: int, session: Session = Depends(get_session)) -> Manifest:
    pack = session.get(Modpack, modpack_id)
    if not pack or not pack.active_release_id:
        raise HTTPException(status_code=404, detail="No active release")
    release = _get_release(session, pack.active_release_id)
    return _manifest(session, pack, release)


@app.get("/api/v1/modpacks/{modpack_id}/releases/{release_id}/manifest", response_model=Manifest)
async def release_manifest(modpack_id: int, release_id: int, session: Session = Depends(get_session)) -> Manifest:
    pack = session.get(Modpack, modpack_id)
    release = _get_release(session, release_id)
    if not pack or release.modpack_id != modpack_id:
        raise HTTPException(status_code=404, detail="Release not found")
    return _manifest(session, pack, release)


@app.post("/api/v1/releases/{release_id}/verify", response_model=VerifyResponse)
async def verify(release_id: int, payload: VerifyRequest, session: Session = Depends(get_session)) -> VerifyResponse:
    release = _get_release(session, release_id)
    pack = session.get(Modpack, release.modpack_id)
    manifest = _manifest(session, pack, release)
    expected = {item.fileName: item for item in manifest.files}
    actual = {item.fileName: item for item in payload.files}
    missing = [
        VerifyDifference(fileName=name, expectedSha256=item.sha256, size=item.size, downloadUrl=item.downloadUrl)
        for name, item in expected.items() if name not in actual
    ]
    corrupt = [
        VerifyDifference(
            fileName=name,
            expectedSha256=item.sha256,
            actualSha256=actual[name].sha256,
            size=item.size,
            downloadUrl=item.downloadUrl,
        )
        for name, item in expected.items()
        if name in actual and (actual[name].sha256.lower() != item.sha256 or actual[name].size != item.size)
    ]
    extra = [
        VerifyDifference(fileName=name, actualSha256=item.sha256, size=item.size)
        for name, item in actual.items() if name not in expected
    ]
    return VerifyResponse(releaseId=release_id, missing=missing, corrupt=corrupt, extra=extra)


def _parse_range(value: str | None, size: int) -> tuple[int, int, bool]:
    if not value:
        return 0, size - 1, False
    if not value.startswith("bytes=") or "," in value:
        raise HTTPException(status_code=416, detail="Invalid Range header", headers={"Content-Range": f"bytes */{size}"})
    start_text, end_text = value[6:].split("-", 1)
    try:
        if not start_text:
            suffix = int(end_text)
            if suffix <= 0:
                raise ValueError
            start, end = max(0, size - suffix), size - 1
        else:
            start = int(start_text)
            end = min(int(end_text), size - 1) if end_text else size - 1
    except ValueError as exc:
        raise HTTPException(status_code=416, detail="Invalid Range header", headers={"Content-Range": f"bytes */{size}"}) from exc
    if start < 0 or start >= size or end < start:
        raise HTTPException(status_code=416, detail="Range not satisfiable", headers={"Content-Range": f"bytes */{size}"})
    return start, end, True


@app.get("/api/v1/files/{sha256}")
async def download_file(sha256: str, request: Request, session: Session = Depends(get_session)) -> Response:
    version = session.exec(select(ModVersion).where(ModVersion.sha256 == sha256.lower())).first()
    if not version:
        raise HTTPException(status_code=404, detail="File not found")
    path = storage.path_for(version.storage_key)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Stored object not found")
    size = path.stat().st_size
    start, end, partial = _parse_range(request.headers.get("range"), size)

    async def iterator():
        with path.open("rb") as handle:
            handle.seek(start)
            remaining = end - start + 1
            while remaining:
                chunk = handle.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(end - start + 1),
        "Content-Disposition": f'attachment; filename="{version.file_name}"',
        "ETag": f'"{version.sha256}"',
    }
    if partial:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return StreamingResponse(iterator(), status_code=206 if partial else 200, media_type="application/java-archive", headers=headers)


@app.post("/api/v1/admin/login")
async def login(payload: LoginRequest, response: Response) -> dict:
    if not authenticate(payload.username, payload.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token, csrf = create_session()
    response.set_cookie(
        "minecrack_session", token, httponly=True, secure=settings.cookie_secure,
        samesite="lax", max_age=8 * 60 * 60, path="/",
    )
    return {"csrfToken": csrf, "username": settings.admin_username}


@app.post("/api/v1/admin/logout")
async def logout(response: Response) -> dict:
    response.delete_cookie("minecrack_session", path="/")
    return {"ok": True}


@app.get("/api/v1/admin/mods")
async def list_mods(_: dict = Depends(require_admin), session: Session = Depends(get_session)) -> list[Mod]:
    return list(session.exec(select(Mod).order_by(Mod.name)).all())


@app.get("/api/v1/admin/mod-versions")
async def list_mod_versions(_: dict = Depends(require_admin), session: Session = Depends(get_session)) -> list[ModVersion]:
    return list(session.exec(select(ModVersion).order_by(ModVersion.created_at.desc())).all())


@app.post("/api/v1/admin/mods", status_code=status.HTTP_201_CREATED)
async def create_mod(payload: ModCreate, _: dict = Depends(require_admin), session: Session = Depends(get_session)) -> Mod:
    mod = Mod(slug=payload.slug, name=payload.name, author=payload.author, source_url=payload.sourceUrl, description=payload.description)
    session.add(mod)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="Mod slug already exists") from exc
    session.refresh(mod)
    return mod


@app.post("/api/v1/admin/mods/{mod_id}/versions", status_code=status.HTTP_201_CREATED)
async def upload_mod_version(
    mod_id: int,
    version: str,
    minecraft_version: str,
    loader: str,
    upload: UploadFile = File(...),
    _: dict = Depends(require_admin),
    session: Session = Depends(get_session),
) -> ModVersion:
    if not session.get(Mod, mod_id):
        raise HTTPException(status_code=404, detail="Mod not found")
    digest, size, key = await storage.store_jar(upload)
    existing = session.exec(select(ModVersion).where(ModVersion.sha256 == digest)).first()
    if existing:
        return existing
    item = ModVersion(
        mod_id=mod_id, version_string=version, minecraft_version=minecraft_version,
        loader=loader, file_name=Path(upload.filename).name, sha256=digest,
        file_size_bytes=size, storage_key=key,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@app.get("/api/v1/admin/modpacks")
async def list_modpacks(_: dict = Depends(require_admin), session: Session = Depends(get_session)) -> list[Modpack]:
    return list(session.exec(select(Modpack).order_by(Modpack.name)).all())


@app.get("/api/v1/admin/modpacks/{modpack_id}/releases")
async def list_releases(modpack_id: int, _: dict = Depends(require_admin), session: Session = Depends(get_session)) -> list[ModpackRelease]:
    return list(session.exec(
        select(ModpackRelease)
        .where(ModpackRelease.modpack_id == modpack_id)
        .order_by(ModpackRelease.created_at.desc())
    ).all())


@app.post("/api/v1/admin/modpacks", status_code=status.HTTP_201_CREATED)
async def create_modpack(payload: ModpackCreate, _: dict = Depends(require_admin), session: Session = Depends(get_session)) -> Modpack:
    pack = Modpack(slug=payload.slug, name=payload.name, description=payload.description)
    session.add(pack)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="Modpack slug already exists") from exc
    session.refresh(pack)
    return pack


@app.post("/api/v1/admin/modpacks/{modpack_id}/releases", status_code=status.HTTP_201_CREATED)
async def create_release(modpack_id: int, payload: ReleaseCreate, _: dict = Depends(require_admin), session: Session = Depends(get_session)) -> ModpackRelease:
    if not session.get(Modpack, modpack_id):
        raise HTTPException(status_code=404, detail="Modpack not found")
    release = ModpackRelease(
        modpack_id=modpack_id, version_string=payload.version,
        minecraft_version=payload.minecraftVersion, loader=payload.loader, changelog=payload.changelog,
    )
    session.add(release)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="Release version already exists") from exc
    session.refresh(release)
    return release


@app.post("/api/v1/admin/releases/{release_id}/files/{mod_version_id}", status_code=status.HTTP_201_CREATED)
async def add_release_file(release_id: int, mod_version_id: int, _: dict = Depends(require_admin), session: Session = Depends(get_session)) -> ReleaseFile:
    release = _get_release(session, release_id, require_published=False)
    version = session.get(ModVersion, mod_version_id)
    if release.status != ReleaseStatus.draft:
        raise HTTPException(status_code=409, detail="Published releases are immutable")
    if not version:
        raise HTTPException(status_code=404, detail="Mod version not found")
    if version.minecraft_version != release.minecraft_version or version.loader != release.loader:
        raise HTTPException(status_code=422, detail="Mod version is incompatible with release")
    link = ReleaseFile(release_id=release_id, mod_version_id=mod_version_id, file_name=version.file_name)
    session.add(link)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="File name already exists in release") from exc
    session.refresh(link)
    return link


@app.post("/api/v1/admin/releases/{release_id}/publish")
async def publish_release(release_id: int, _: dict = Depends(require_admin), session: Session = Depends(get_session)) -> ModpackRelease:
    release = _get_release(session, release_id, require_published=False)
    if not session.exec(select(ReleaseFile).where(ReleaseFile.release_id == release_id)).first():
        raise HTTPException(status_code=409, detail="Cannot publish an empty release")
    pack = session.get(Modpack, release.modpack_id)
    if pack.active_release_id and pack.active_release_id != release_id:
        previous = session.get(ModpackRelease, pack.active_release_id)
        if previous:
            previous.status = ReleaseStatus.retired
            session.add(previous)
    release.status = ReleaseStatus.published
    release.published_at = release.published_at or utcnow()
    pack.active_release_id = release.id
    session.add(release)
    session.add(pack)
    session.commit()
    session.refresh(release)
    return release
