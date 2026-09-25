import asyncio
import io
import zipfile

import httpx
import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app import main
from app.database import get_session
from app.main import app
from app.security import create_session


def jar_bytes(marker="default"):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("META-INF/MANIFEST.MF", "Manifest-Version: 1.0\n")
        archive.writestr("payload.txt", marker)
    return stream.getvalue()


def _client():
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")


def _authenticate(client):
    """Attach a valid session cookie to the client and return the CSRF headers."""
    token, csrf = create_session()
    client.cookies.set("minecrack_session", token)
    return {"X-CSRF-Token": csrf}


@pytest.fixture
def ctx(tmp_path):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)

    async def session_override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = session_override
    old_root = main.storage.root
    main.storage.root = tmp_path
    yield
    main.storage.root = old_root
    app.dependency_overrides.clear()


def test_health_endpoints(ctx):
    async def scenario():
        async with _client() as client:
            assert (await client.get("/health/live")).json() == {"status": "ok"}
            assert (await client.get("/health/ready")).json() == {"status": "ready"}

    asyncio.run(scenario())


def test_admin_endpoints_require_session_and_csrf(ctx):
    async def scenario():
        async with _client() as client:
            assert (await client.get("/api/v1/admin/mods")).status_code == 401
            token, csrf = create_session()
            client.cookies.set("minecrack_session", token)
            assert (await client.get("/api/v1/admin/mods")).status_code == 403
            assert (
                await client.get("/api/v1/admin/mods", headers={"X-CSRF-Token": "wrong"})
            ).status_code == 403
            assert (
                await client.get("/api/v1/admin/mods", headers={"X-CSRF-Token": csrf})
            ).status_code == 200

    asyncio.run(scenario())


def test_logout_clears_session_cookie(ctx):
    async def scenario():
        async with _client() as client:
            login = await client.post(
                "/api/v1/admin/login", json={"username": "admin", "password": "change-me"}
            )
            assert login.status_code == 200
            assert client.cookies.get("minecrack_session")
            logout = await client.post("/api/v1/admin/logout")
            assert logout.status_code == 200
            first_attribute = logout.headers["set-cookie"].split(";")[0]
            assert first_attribute.split("=", 1)[1].strip('"') == ""

    asyncio.run(scenario())


def test_duplicate_slugs_conflict(ctx):
    async def scenario():
        async with _client() as client:
            headers = _authenticate(client)
            first = await client.post(
                "/api/v1/admin/mods", json={"slug": "dup", "name": "Dup"}, headers=headers
            )
            assert first.status_code == 201
            again = await client.post(
                "/api/v1/admin/mods", json={"slug": "dup", "name": "Other"}, headers=headers
            )
            assert again.status_code == 409
            pack = await client.post(
                "/api/v1/admin/modpacks", json={"slug": "dup", "name": "Dup"}, headers=headers
            )
            assert pack.status_code == 201
            pack_again = await client.post(
                "/api/v1/admin/modpacks", json={"slug": "dup", "name": "Other"}, headers=headers
            )
            assert pack_again.status_code == 409

    asyncio.run(scenario())


def test_admin_lists_return_created_entities(ctx):
    async def scenario():
        async with _client() as client:
            headers = _authenticate(client)
            mod = (await client.post(
                "/api/v1/admin/mods", json={"slug": "listed", "name": "Listed"}, headers=headers
            )).json()
            await client.post(
                f"/api/v1/admin/mods/{mod['id']}/versions?version=1.0&minecraft_version=1.20.1&loader=fabric",
                files={"upload": ("listed.jar", jar_bytes("listed"), "application/java-archive")},
                headers=headers,
            )
            pack = (await client.post(
                "/api/v1/admin/modpacks", json={"slug": "listed-pack", "name": "Pack"}, headers=headers
            )).json()
            release = (await client.post(
                f"/api/v1/admin/modpacks/{pack['id']}/releases",
                json={"version": "1.0", "minecraftVersion": "1.20.1", "loader": "fabric"},
                headers=headers,
            )).json()

            mods = (await client.get("/api/v1/admin/mods", headers=headers)).json()
            versions = (await client.get("/api/v1/admin/mod-versions", headers=headers)).json()
            packs = (await client.get("/api/v1/admin/modpacks", headers=headers)).json()
            releases = (await client.get(
                f"/api/v1/admin/modpacks/{pack['id']}/releases", headers=headers
            )).json()

            assert any(item["slug"] == "listed" for item in mods)
            assert len(versions) == 1
            assert any(item["slug"] == "listed-pack" for item in packs)
            assert any(item["id"] == release["id"] for item in releases)

    asyncio.run(scenario())


def test_release_validation_paths(ctx):
    async def scenario():
        async with _client() as client:
            headers = _authenticate(client)
            release_payload = {"version": "1.0", "minecraftVersion": "1.20.1", "loader": "fabric"}
            unknown_pack = await client.post(
                "/api/v1/admin/modpacks/9999/releases", json=release_payload, headers=headers
            )
            assert unknown_pack.status_code == 404

            pack = (await client.post(
                "/api/v1/admin/modpacks", json={"slug": "valid", "name": "Valid"}, headers=headers
            )).json()
            created = await client.post(
                f"/api/v1/admin/modpacks/{pack['id']}/releases", json=release_payload, headers=headers
            )
            assert created.status_code == 201
            release = created.json()
            duplicate = await client.post(
                f"/api/v1/admin/modpacks/{pack['id']}/releases", json=release_payload, headers=headers
            )
            assert duplicate.status_code == 409

            unknown_release = await client.post(
                "/api/v1/admin/releases/9999/publish", headers=headers
            )
            assert unknown_release.status_code == 404
            empty_publish = await client.post(
                f"/api/v1/admin/releases/{release['id']}/publish", headers=headers
            )
            assert empty_publish.status_code == 409
            link_unknown_release = await client.post(
                "/api/v1/admin/releases/9999/files/1", headers=headers
            )
            assert link_unknown_release.status_code == 404

            mod = (await client.post(
                "/api/v1/admin/mods", json={"slug": "linked", "name": "Linked"}, headers=headers
            )).json()
            fabric = (await client.post(
                f"/api/v1/admin/mods/{mod['id']}/versions?version=1.0&minecraft_version=1.20.1&loader=fabric",
                files={"upload": ("linked.jar", jar_bytes("fabric"), "application/java-archive")},
                headers=headers,
            )).json()
            link_unknown_version = await client.post(
                f"/api/v1/admin/releases/{release['id']}/files/9999", headers=headers
            )
            assert link_unknown_version.status_code == 404

            forge = (await client.post(
                f"/api/v1/admin/mods/{mod['id']}/versions?version=1.0&minecraft_version=1.20.1&loader=forge",
                files={"upload": ("linked-forge.jar", jar_bytes("forge"), "application/java-archive")},
                headers=headers,
            )).json()
            incompatible = await client.post(
                f"/api/v1/admin/releases/{release['id']}/files/{forge['id']}", headers=headers
            )
            assert incompatible.status_code == 422

            assert (await client.post(
                f"/api/v1/admin/releases/{release['id']}/files/{fabric['id']}", headers=headers
            )).status_code == 201
            duplicate_file = await client.post(
                f"/api/v1/admin/releases/{release['id']}/files/{fabric['id']}", headers=headers
            )
            assert duplicate_file.status_code == 409

    asyncio.run(scenario())


def test_public_endpoints_return_404_for_unknown_ids(ctx):
    async def scenario():
        async with _client() as client:
            assert (await client.get("/api/v1/modpacks/9999/active/manifest")).status_code == 404
            assert (await client.get("/api/v1/modpacks/9999/releases/9999/manifest")).status_code == 404
            verify = await client.post("/api/v1/releases/9999/verify", json={"files": []})
            assert verify.status_code == 404
            assert (await client.get(f"/api/v1/files/{'0' * 64}")).status_code == 404

            # Modpack existente pero sin release activa.
            headers = _authenticate(client)
            pack = (await client.post(
                "/api/v1/admin/modpacks", json={"slug": "quiet", "name": "Quiet"}, headers=headers
            )).json()
            assert (await client.get(f"/api/v1/modpacks/{pack['id']}/active/manifest")).status_code == 404

    asyncio.run(scenario())


def test_release_manifest_for_published_release(ctx):
    async def scenario():
        async with _client() as client:
            headers = _authenticate(client)
            mod = (await client.post(
                "/api/v1/admin/mods", json={"slug": "man", "name": "Man"}, headers=headers
            )).json()
            version = (await client.post(
                f"/api/v1/admin/mods/{mod['id']}/versions?version=1.0&minecraft_version=1.20.1&loader=fabric",
                files={"upload": ("manifest-jar.jar", jar_bytes("manifest"), "application/java-archive")},
                headers=headers,
            )).json()
            pack = (await client.post(
                "/api/v1/admin/modpacks", json={"slug": "man-pack", "name": "Man Pack"}, headers=headers
            )).json()
            release = (await client.post(
                f"/api/v1/admin/modpacks/{pack['id']}/releases",
                json={"version": "1.0", "minecraftVersion": "1.20.1", "loader": "fabric"},
                headers=headers,
            )).json()
            assert (await client.post(
                f"/api/v1/admin/releases/{release['id']}/files/{version['id']}", headers=headers
            )).status_code == 201
            assert (await client.post(
                f"/api/v1/admin/releases/{release['id']}/publish", headers=headers
            )).status_code == 200

            manifest = await client.get(f"/api/v1/modpacks/{pack['id']}/releases/{release['id']}/manifest")
            assert manifest.status_code == 200
            body = manifest.json()
            assert body["release"]["id"] == release["id"]
            assert body["files"][0]["fileName"] == "manifest-jar.jar"

            # Un release no pertenece a otro modpack.
            other = (await client.post(
                "/api/v1/admin/modpacks", json={"slug": "other", "name": "Other"}, headers=headers
            )).json()
            crossed = await client.get(f"/api/v1/modpacks/{other['id']}/releases/{release['id']}/manifest")
            assert crossed.status_code == 404

    asyncio.run(scenario())
