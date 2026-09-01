from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class ManifestModpack(BaseModel):
    id: int
    slug: str
    name: str


class ManifestRelease(BaseModel):
    id: int
    version: str
    minecraftVersion: str
    loader: str
    changelog: str
    publishedAt: datetime


class ManifestFile(BaseModel):
    fileName: str
    sha256: str
    size: int
    downloadUrl: str


class Manifest(BaseModel):
    schemaVersion: Literal[1] = 1
    modpack: ManifestModpack
    release: ManifestRelease
    files: list[ManifestFile]


class LocalFile(BaseModel):
    fileName: str = Field(max_length=255)
    sha256: str = Field(pattern=r"^[0-9a-fA-F]{64}$")
    size: int = Field(ge=0)

    @field_validator("fileName")
    @classmethod
    def safe_jar_name(cls, value: str) -> str:
        if "/" in value or "\\" in value or value in {".", ".."} or not value.lower().endswith(".jar"):
            raise ValueError("fileName must be a plain .jar file name")
        return value


class VerifyRequest(BaseModel):
    files: list[LocalFile] = Field(max_length=5000)


class VerifyDifference(BaseModel):
    fileName: str
    expectedSha256: Optional[str] = None
    actualSha256: Optional[str] = None
    size: Optional[int] = None
    downloadUrl: Optional[str] = None


class VerifyResponse(BaseModel):
    releaseId: int
    missing: list[VerifyDifference]
    corrupt: list[VerifyDifference]
    extra: list[VerifyDifference]


class LoginRequest(BaseModel):
    username: str
    password: str


class ModCreate(BaseModel):
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{1,99}$")
    name: str
    author: str = ""
    sourceUrl: Optional[str] = None
    description: str = ""


class ModpackCreate(BaseModel):
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{1,99}$")
    name: str
    description: str = ""


class ReleaseCreate(BaseModel):
    version: str
    minecraftVersion: str
    loader: Literal["fabric", "forge", "quilt", "neoforge", "vanilla"]
    changelog: str = ""

