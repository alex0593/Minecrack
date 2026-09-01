import hashlib
import io
import zipfile
import asyncio

import httpx
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.database import get_session
from app.main import app
from app import main


def jar_bytes():
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("META-INF/MANIFEST.MF", "Manifest-Version: 1.0\n")
    return stream.getvalue()


def test_admin_publish_verify_and_download(tmp_path):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)

    async def session_override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = session_override
    old_root = main.storage.root
    main.storage.root = tmp_path
    try:
        async def workflow():
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                login = await client.post("/api/v1/admin/login", json={"username": "admin", "password": "change-me"})
                assert login.status_code == 200
                headers = {"X-CSRF-Token": login.json()["csrfToken"]}

                mod = (await client.post("/api/v1/admin/mods", headers=headers, json={"slug": "test-mod", "name": "Test Mod"})).json()
                content = jar_bytes()
                response = await client.post(
                    f"/api/v1/admin/mods/{mod['id']}/versions?version=1.0&minecraft_version=1.20.1&loader=fabric",
                    headers=headers, files={"upload": ("test-mod.jar", content, "application/java-archive")},
                )
                assert response.status_code == 201, response.text
                version = response.json()
                pack = (await client.post("/api/v1/admin/modpacks", headers=headers, json={"slug": "official", "name": "Official"})).json()
                release = (await client.post(
                    f"/api/v1/admin/modpacks/{pack['id']}/releases", headers=headers,
                    json={"version": "1.0", "minecraftVersion": "1.20.1", "loader": "fabric"},
                )).json()
                assert (await client.post(f"/api/v1/admin/releases/{release['id']}/files/{version['id']}", headers=headers)).status_code == 201
                assert (await client.post(f"/api/v1/admin/releases/{release['id']}/publish", headers=headers)).status_code == 200

                manifest = await client.get(f"/api/v1/modpacks/{pack['id']}/active/manifest")
                assert manifest.status_code == 200
                assert manifest.json()["files"][0]["sha256"] == hashlib.sha256(content).hexdigest()
                differences = (await client.post(f"/api/v1/releases/{release['id']}/verify", json={"files": []})).json()
                assert [item["fileName"] for item in differences["missing"]] == ["test-mod.jar"]

                local = [
                    {"fileName": "test-mod.jar", "sha256": "0" * 64, "size": len(content)},
                    {"fileName": "extra.jar", "sha256": "1" * 64, "size": 12},
                ]
                differences = (await client.post(
                    f"/api/v1/releases/{release['id']}/verify", json={"files": local},
                )).json()
                assert [item["fileName"] for item in differences["corrupt"]] == ["test-mod.jar"]
                assert [item["fileName"] for item in differences["extra"]] == ["extra.jar"]

                # Las releases publicadas son inmutables y una anterior puede reactivarse (rollback).
                assert (await client.post(
                    f"/api/v1/admin/releases/{release['id']}/files/{version['id']}", headers=headers,
                )).status_code == 409
                release2 = (await client.post(
                    f"/api/v1/admin/modpacks/{pack['id']}/releases", headers=headers,
                    json={"version": "2.0", "minecraftVersion": "1.20.1", "loader": "fabric"},
                )).json()
                assert (await client.post(
                    f"/api/v1/admin/releases/{release2['id']}/publish", headers=headers,
                )).status_code == 409
                assert (await client.post(
                    f"/api/v1/admin/releases/{release2['id']}/files/{version['id']}", headers=headers,
                )).status_code == 201
                assert (await client.post(
                    f"/api/v1/admin/releases/{release2['id']}/publish", headers=headers,
                )).status_code == 200
                assert (await client.post(
                    f"/api/v1/admin/releases/{release['id']}/publish", headers=headers,
                )).status_code == 200
                active = await client.get(f"/api/v1/modpacks/{pack['id']}/active/manifest")
                assert active.json()["release"]["id"] == release["id"]

                full = await client.get(f"/api/v1/files/{version['sha256']}")
                assert full.content == content
                partial = await client.get(f"/api/v1/files/{version['sha256']}", headers={"Range": "bytes=0-3"})
                assert partial.status_code == 206
                assert partial.content == content[:4]
                assert partial.headers["content-range"] == f"bytes 0-3/{len(content)}"

        asyncio.run(workflow())
    finally:
        main.storage.root = old_root
        app.dependency_overrides.clear()
