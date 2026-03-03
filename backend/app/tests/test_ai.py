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
os.environ["ADMIN_EMAILS"] = "admin@example.com"

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
async def test_nowcast_dashboard_user_endpoint_requires_auth_and_permission() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/auth/signup", json={"email": "u1@example.com", "password": "StrongPass123", "nickname": "u1"})
        await client.post("/auth/signup", json={"email": "u2@example.com", "password": "StrongPass123", "nickname": "u2"})

        login_u1 = await client.post("/auth/login", json={"email": "u1@example.com", "password": "StrongPass123"})
        login_u2 = await client.post("/auth/login", json={"email": "u2@example.com", "password": "StrongPass123"})
        u1_token = login_u1.json()["access_token"]
        u2_token = login_u2.json()["access_token"]

        me_u2 = await client.get("/auth/me", headers={"Authorization": f"Bearer {u2_token}"})
        u2_id = me_u2.json()["id"]

        no_auth = await client.get(f"/ai/nowcast/dashboard/{u2_id}")
        assert no_auth.status_code == 401

        forbidden = await client.get(f"/ai/nowcast/dashboard/{u2_id}", headers={"Authorization": f"Bearer {u1_token}"})
        assert forbidden.status_code == 403
