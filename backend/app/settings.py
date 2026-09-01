from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./minecrack.db")
    storage_dir: Path = Path(os.getenv("STORAGE_DIR", "./data/files")).resolve()
    admin_username: str = os.getenv("ADMIN_USERNAME", "admin")
    admin_password: str = os.getenv("ADMIN_PASSWORD", "change-me")
    session_secret: str = os.getenv("SESSION_SECRET", "dev-only-secret-change-before-deploy")
    cookie_secure: bool = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    public_base_url: str = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")
    auto_create_schema: bool = os.getenv("AUTO_CREATE_SCHEMA", "true").lower() == "true"


settings = Settings()
