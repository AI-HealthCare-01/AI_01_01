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
async def test_board_create_list_and_search() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/auth/signup", json={"email": "u1@example.com", "password": "StrongPass123", "nickname": "u1"})
        login = await client.post("/auth/login", json={"email": "u1@example.com", "password": "StrongPass123"})
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        create = await client.post(
            "/board/posts",
            headers=headers,
            json={"category": "자유", "title": "첫 글", "content": "게시판 테스트입니다.", "is_notice": False},
        )
        assert create.status_code == 201
        assert create.json()["category"] == "자유"

        listed = await client.get("/board/posts?page=1&page_size=10&q=테스트")
        assert listed.status_code == 200
        data = listed.json()
        assert data["total"] == 1
        assert data["items"][0]["title"] == "첫 글"


@pytest.mark.anyio
async def test_notice_requires_admin() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post(
            "/auth/signup",
            json={"email": "normal@example.com", "password": "StrongPass123", "nickname": "normal"},
        )
        login_normal = await client.post("/auth/login", json={"email": "normal@example.com", "password": "StrongPass123"})
        token_normal = login_normal.json()["access_token"]

        denied = await client.post(
            "/board/posts",
            headers={"Authorization": f"Bearer {token_normal}"},
            json={"category": "문의", "title": "공지 시도", "content": "안됨", "is_notice": True},
        )
        assert denied.status_code == 403

        await client.post(
            "/auth/signup",
            json={"email": "admin@example.com", "password": "StrongPass123", "nickname": "admin"},
        )
        login_admin = await client.post("/auth/login", json={"email": "admin@example.com", "password": "StrongPass123"})
        token_admin = login_admin.json()["access_token"]
        allowed = await client.post(
            "/board/posts",
            headers={"Authorization": f"Bearer {token_admin}"},
            json={"category": "문의", "title": "공지 등록", "content": "공지 내용", "is_notice": True},
        )
        assert allowed.status_code == 201
        assert allowed.json()["is_notice"] is True
