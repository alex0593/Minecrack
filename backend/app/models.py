from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy import Column, String, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ReleaseStatus(str, Enum):
    draft = "draft"
    published = "published"
    retired = "retired"


class Mod(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True, max_length=100)
    name: str = Field(max_length=160)
    author: str = Field(default="", max_length=160)
    source_url: Optional[str] = Field(default=None, max_length=500)
    description: str = Field(default="")
    versions: list["ModVersion"] = Relationship(back_populates="mod")


class ModVersion(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("sha256", name="uq_modversion_sha256"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    mod_id: int = Field(foreign_key="mod.id", index=True)
    version_string: str = Field(max_length=100)
    minecraft_version: str = Field(index=True, max_length=40)
    loader: str = Field(index=True, max_length=30)
    file_name: str = Field(max_length=255)
    sha256: str = Field(sa_column=Column(String(64), index=True, nullable=False))
    file_size_bytes: int
    storage_key: str = Field(max_length=255)
    created_at: datetime = Field(default_factory=utcnow)
    mod: Optional[Mod] = Relationship(back_populates="versions")


class Modpack(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True, max_length=100)
    name: str = Field(max_length=160)
    description: str = Field(default="")
    active_release_id: Optional[int] = Field(default=None, foreign_key="modpackrelease.id")


class ModpackRelease(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("modpack_id", "version_string", name="uq_modpack_release_version"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    modpack_id: int = Field(foreign_key="modpack.id", index=True)
    version_string: str = Field(max_length=100)
    minecraft_version: str = Field(max_length=40)
    loader: str = Field(max_length=30)
    changelog: str = Field(default="")
    status: ReleaseStatus = Field(default=ReleaseStatus.draft, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    published_at: Optional[datetime] = None


class ReleaseFile(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("release_id", "file_name", name="uq_release_filename"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    release_id: int = Field(foreign_key="modpackrelease.id", index=True)
    mod_version_id: int = Field(foreign_key="modversion.id", index=True)
    file_name: str = Field(max_length=255)

