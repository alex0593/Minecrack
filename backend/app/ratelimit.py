"""Sliding-window tracker for failed admin login attempts.

Keys combine username and client address so one caller cannot lock out
everybody else. Blocked requests are not recorded, so a 429 storm cannot
extend the lock beyond the window.
"""
from collections import defaultdict, deque
import threading
import time

from .settings import settings

MAX_ATTEMPTS = settings.login_max_attempts
WINDOW_SECONDS = settings.login_window_seconds

_clock = time.monotonic
_failures: dict[str, deque[float]] = defaultdict(deque)
_lock = threading.Lock()


def login_key(username: str, client: str) -> str:
    return f"{username}\x00{client}"


def retry_after(key: str) -> float | None:
    """Seconds this key must wait, or None while attempts are allowed."""
    now = _clock()
    with _lock:
        attempts = _failures.get(key)
        if not attempts:
            return None
        while attempts and now - attempts[0] >= WINDOW_SECONDS:
            attempts.popleft()
        if len(attempts) < MAX_ATTEMPTS:
            return None
        return WINDOW_SECONDS - (now - attempts[0])


def record_failure(key: str) -> None:
    now = _clock()
    with _lock:
        # Purge fully expired keys so random usernames cannot grow memory forever.
        for stale in [k for k, v in _failures.items() if not v or now - v[-1] >= WINDOW_SECONDS]:
            del _failures[stale]
        _failures[key].append(now)


def clear(key: str) -> None:
    with _lock:
        _failures.pop(key, None)


def reset() -> None:
    """Drop all tracked attempts (test isolation / operational reset)."""
    with _lock:
        _failures.clear()
