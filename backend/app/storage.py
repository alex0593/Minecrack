import hashlib
from pathlib import Path
import tempfile
from typing import BinaryIO

from fastapi import HTTPException, UploadFile

from .settings import settings


MAX_UPLOAD_BYTES = 512 * 1024 * 1024


class LocalStorage:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    async def store_jar(self, upload: UploadFile) -> tuple[str, int, str]:
        name = Path(upload.filename or "").name
        if name != upload.filename or not name.lower().endswith(".jar"):
            raise HTTPException(status_code=422, detail="Only plain .jar file names are accepted")
        hasher = hashlib.sha256()
        size = 0
        signature = b""
        with tempfile.NamedTemporaryFile(dir=self.root, delete=False) as temp:
            temp_path = Path(temp.name)
            while chunk := await upload.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    temp_path.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail="File exceeds 512 MiB")
                hasher.update(chunk)
                if len(signature) < 4:
                    signature += chunk[:4 - len(signature)]
                temp.write(chunk)
        if signature != b"PK\x03\x04":
            temp_path.unlink(missing_ok=True)
            raise HTTPException(status_code=422, detail="The upload is not a valid JAR/ZIP container")
        digest = hasher.hexdigest()
        final_path = self.path_for(digest)
        final_path.parent.mkdir(parents=True, exist_ok=True)
        if final_path.exists():
            temp_path.unlink(missing_ok=True)
        else:
            temp_path.replace(final_path)
        return digest, size, digest

    def path_for(self, storage_key: str) -> Path:
        if len(storage_key) != 64 or any(c not in "0123456789abcdef" for c in storage_key):
            raise ValueError("Invalid storage key")
        return self.root / storage_key[:2] / storage_key

    def open(self, storage_key: str) -> BinaryIO:
        return self.path_for(storage_key).open("rb")


storage = LocalStorage(settings.storage_dir)
