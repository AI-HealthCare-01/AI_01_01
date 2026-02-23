import os
import sys
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_mvp.db"
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"] = "30"

from app.db.session import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(autouse=True)
async def setup_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest.mark.anyio
async def test_signup_login_and_me() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        signup_res = await client.post(
            "/auth/signup",
            json={"email": "user1@example.com", "password": "StrongPass123", "nickname": "mira"},
        )
        assert signup_res.status_code == 201
        assert signup_res.json()["email"] == "user1@example.com"
        assert signup_res.json()["nickname"] == "mira"

        login_res = await client.post(
            "/auth/login",
            json={"email": "user1@example.com", "password": "StrongPass123"},
        )
        assert login_res.status_code == 200
        data = login_res.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["expires_in"] == 1800

        me_res = await client.get("/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"})
        assert me_res.status_code == 200
        assert me_res.json()["email"] == "user1@example.com"


@pytest.mark.anyio
async def test_signup_duplicate_email_returns_409() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.post(
            "/auth/signup",
            json={"email": "dup@example.com", "password": "StrongPass123", "nickname": "a"},
        )
        assert first.status_code == 201

        second = await client.post(
            "/auth/signup",
            json={"email": "dup@example.com", "password": "StrongPass123", "nickname": "b"},
        )
        assert second.status_code == 409
        assert second.json()["detail"] == "이미 가입된 이메일입니다."
