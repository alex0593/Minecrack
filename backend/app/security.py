from datetime import datetime, timedelta, timezone
import hmac

import jwt
from fastapi import Cookie, Header, HTTPException, status
from pwdlib import PasswordHash

from .settings import settings


password_hash = PasswordHash.recommended()
_admin_hash = password_hash.hash(settings.admin_password)


def authenticate(username: str, password: str) -> bool:
    return hmac.compare_digest(username, settings.admin_username) and password_hash.verify(password, _admin_hash)


def create_session() -> tuple[str, str]:
    csrf = __import__("secrets").token_urlsafe(24)
    payload = {
        "sub": settings.admin_username,
        "csrf": csrf,
        "exp": datetime.now(timezone.utc) + timedelta(hours=8),
    }
    return jwt.encode(payload, settings.session_secret, algorithm="HS256"), csrf


async def require_admin(
    minecrack_session: str | None = Cookie(default=None),
    x_csrf_token: str | None = Header(default=None),
) -> dict:
    if not minecrack_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        payload = jwt.decode(minecrack_session, settings.session_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session") from exc
    if not x_csrf_token or not hmac.compare_digest(x_csrf_token, payload.get("csrf", "")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token")
    return payload
