import asyncio

import httpx
import pytest

from app import ratelimit
from app.main import app


def _client():
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")


async def _attempt(client, username="admin", password="wrong-password"):
    return await client.post("/api/v1/admin/login", json={"username": username, "password": password})


@pytest.fixture(autouse=True)
def isolated_attempts():
    ratelimit.reset()
    yield
    ratelimit.reset()


def test_login_locked_after_max_failures(monkeypatch):
    monkeypatch.setattr(ratelimit, "MAX_ATTEMPTS", 3)

    async def scenario():
        async with _client() as client:
            for _ in range(3):
                assert (await _attempt(client)).status_code == 401
            response = await _attempt(client)
            assert response.status_code == 429
            assert int(response.headers["retry-after"]) >= 1

    asyncio.run(scenario())


def test_rate_limit_window_expires(monkeypatch):
    monkeypatch.setattr(ratelimit, "MAX_ATTEMPTS", 2)
    now = [1000.0]
    monkeypatch.setattr(ratelimit, "_clock", lambda: now[0])

    async def scenario():
        async with _client() as client:
            for _ in range(2):
                assert (await _attempt(client)).status_code == 401
            assert (await _attempt(client)).status_code == 429
            now[0] += ratelimit.WINDOW_SECONDS + 1
            # Tras la ventana vuelve a poder intentarlo (sigue con la clave mal).
            assert (await _attempt(client)).status_code == 401

    asyncio.run(scenario())


def test_successful_login_clears_failures(monkeypatch):
    monkeypatch.setattr(ratelimit, "MAX_ATTEMPTS", 3)

    async def scenario():
        async with _client() as client:
            assert (await _attempt(client)).status_code == 401
            assert (await _attempt(client)).status_code == 401
            ok = await client.post(
                "/api/v1/admin/login", json={"username": "admin", "password": "change-me"}
            )
            assert ok.status_code == 200
            # El contador empezó de cero: tres fallos más antes de bloquear.
            for _ in range(3):
                assert (await _attempt(client)).status_code == 401
            assert (await _attempt(client)).status_code == 429

    asyncio.run(scenario())


def test_rate_limit_scoped_per_username(monkeypatch):
    monkeypatch.setattr(ratelimit, "MAX_ATTEMPTS", 2)

    async def scenario():
        async with _client() as client:
            for _ in range(2):
                assert (await _attempt(client, username="admin")).status_code == 401
            assert (await _attempt(client, username="admin")).status_code == 429
            # Otro usuario no arrastra el bloqueo (la clave incluye el usuario).
            assert (await _attempt(client, username="other")).status_code == 401

    asyncio.run(scenario())
