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


@pytest.mark.anyio
async def test_profile_update_nickname_and_password_only() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        signup_res = await client.post(
            "/auth/signup",
            json={
                "email": "profile1@example.com",
                "password": "StrongPass123",
                "nickname": "before",
            },
        )
        assert signup_res.status_code == 201

        login_res = await client.post(
            "/auth/login",
            json={"email": "profile1@example.com", "password": "StrongPass123"},
        )
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        patch_res = await client.patch(
            "/auth/me/profile",
            headers=headers,
            json={
                "nickname": "after",
                "current_password": "StrongPass123",
                "new_password": "EvenStrongPass456",
            },
        )
        assert patch_res.status_code == 200
        data = patch_res.json()
        assert data["nickname"] == "after"
        assert data["email"] == "profile1@example.com"

        relogin_old = await client.post(
            "/auth/login",
            json={"email": "profile1@example.com", "password": "StrongPass123"},
        )
        assert relogin_old.status_code == 401

        relogin_new = await client.post(
            "/auth/login",
            json={"email": "profile1@example.com", "password": "EvenStrongPass456"},
        )
        assert relogin_new.status_code == 200


@pytest.mark.anyio
async def test_verify_current_password_endpoint() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        signup_res = await client.post(
            "/auth/signup",
            json={"email": "verifypw@example.com", "password": "StrongPass123", "nickname": "verify"},
        )
        assert signup_res.status_code == 201

        login_res = await client.post(
            "/auth/login",
            json={"email": "verifypw@example.com", "password": "StrongPass123"},
        )
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        ok = await client.post("/auth/me/password/verify", headers=headers, json={"current_password": "StrongPass123"})
        assert ok.status_code == 200
        assert ok.json()["matched"] is True

        bad = await client.post("/auth/me/password/verify", headers=headers, json={"current_password": "WrongPass123"})
        assert bad.status_code == 401
