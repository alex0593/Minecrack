import asyncio
import io
import zipfile

import pytest
from fastapi import HTTPException

from app import storage as storage_module
from app.security import create_session, require_admin
from app.storage import LocalStorage


class MemoryUpload:
    def __init__(self, name, content):
        self.filename = name
        self.file = io.BytesIO(content)

    async def read(self, size=-1):
        return self.file.read(size)


def upload(name, content):
    return MemoryUpload(name, content)


def jar_bytes():
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("META-INF/MANIFEST.MF", "Manifest-Version: 1.0\n")
    return stream.getvalue()


def test_storage_accepts_jar_and_is_content_addressed(tmp_path):
    store = LocalStorage(tmp_path)
    content = jar_bytes()
    digest, size, key = asyncio.run(store.store_jar(upload("safe.jar", content)))
    assert digest == key
    assert size > 0
    assert store.path_for(key).read_bytes() == content


@pytest.mark.parametrize("name,content", [
    ("../evil.jar", jar_bytes()),
    ("readme.txt", jar_bytes()),
    ("fake.jar", b"not a zip"),
])
def test_storage_rejects_unsafe_or_invalid_uploads(tmp_path, name, content):
    with pytest.raises(HTTPException) as error:
        asyncio.run(LocalStorage(tmp_path).store_jar(upload(name, content)))
    assert error.value.status_code == 422


def test_storage_enforces_upload_limit(tmp_path, monkeypatch):
    monkeypatch.setattr(storage_module, "MAX_UPLOAD_BYTES", 4)
    with pytest.raises(HTTPException) as error:
        asyncio.run(LocalStorage(tmp_path).store_jar(upload("large.jar", b"PK\x03\x04too-large")))
    assert error.value.status_code == 413
    assert not any(tmp_path.iterdir())


def test_admin_session_requires_matching_csrf():
    token, csrf = create_session()
    payload = asyncio.run(require_admin(minecrack_session=token, x_csrf_token=csrf))
    assert payload["csrf"] == csrf
    with pytest.raises(HTTPException) as error:
        asyncio.run(require_admin(minecrack_session=token, x_csrf_token="wrong"))
    assert error.value.status_code == 403
