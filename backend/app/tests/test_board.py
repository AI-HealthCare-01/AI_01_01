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


@pytest.mark.anyio
async def test_comment_available_for_all_types_and_admin_reply_scope() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/auth/signup", json={"email": "user@example.com", "password": "StrongPass123", "nickname": "user"})
        await client.post("/auth/signup", json={"email": "admin@example.com", "password": "StrongPass123", "nickname": "admin"})

        login_user = await client.post("/auth/login", json={"email": "user@example.com", "password": "StrongPass123"})
        login_admin = await client.post("/auth/login", json={"email": "admin@example.com", "password": "StrongPass123"})
        user_headers = {"Authorization": f"Bearer {login_user.json()['access_token']}"}
        admin_headers = {"Authorization": f"Bearer {login_admin.json()['access_token']}"}

        free_post = await client.post(
            "/board/posts",
            headers=user_headers,
            json={"category": "자유", "title": "자유 글", "content": "자유 내용", "is_notice": False},
        )
        inquiry_post = await client.post(
            "/board/posts",
            headers=user_headers,
            json={"category": "문의", "title": "문의 글", "content": "문의 내용", "is_notice": False},
        )
        assert free_post.status_code == 201
        assert inquiry_post.status_code == 201

        free_id = free_post.json()["id"]
        inquiry_id = inquiry_post.json()["id"]

        # 모든 유형 게시물은 댓글 가능
        ok_user_comment_free = await client.post(
            f"/board/posts/{free_id}/comments",
            headers=user_headers,
            json={"content": "일반 댓글"},
        )
        assert ok_user_comment_free.status_code == 201

        ok_admin_comment_free = await client.post(
            f"/board/posts/{free_id}/comments",
            headers=admin_headers,
            json={"content": "관리자 일반 댓글"},
        )
        assert ok_admin_comment_free.status_code == 201

        # 관리자답변 접두어는 문의/피드백에서만 허용
        denied_admin_reply_on_free = await client.post(
            f"/board/posts/{free_id}/comments",
            headers=admin_headers,
            json={"content": "[관리자답변] 자유글에는 관리자답변 불가"},
        )
        assert denied_admin_reply_on_free.status_code == 400

        denied_user_admin_reply = await client.post(
            f"/board/posts/{inquiry_id}/comments",
            headers=user_headers,
            json={"content": "[관리자답변] 일반 사용자는 불가"},
        )
        assert denied_user_admin_reply.status_code == 403

        allowed_admin_reply = await client.post(
            f"/board/posts/{inquiry_id}/comments",
            headers=admin_headers,
            json={"content": "[관리자답변] 확인했습니다."},
        )
        assert allowed_admin_reply.status_code == 201


@pytest.mark.anyio
async def test_pending_replies_only_unanswered_inquiry_feedback() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/auth/signup", json={"email": "user2@example.com", "password": "StrongPass123", "nickname": "user2"})
        await client.post("/auth/signup", json={"email": "admin@example.com", "password": "StrongPass123", "nickname": "admin"})

        login_user = await client.post("/auth/login", json={"email": "user2@example.com", "password": "StrongPass123"})
        login_admin = await client.post("/auth/login", json={"email": "admin@example.com", "password": "StrongPass123"})
        user_headers = {"Authorization": f"Bearer {login_user.json()['access_token']}"}
        admin_headers = {"Authorization": f"Bearer {login_admin.json()['access_token']}"}

        inquiry = await client.post(
            "/board/posts",
            headers=user_headers,
            json={"category": "문의", "title": "문의 A", "content": "내용 A", "is_notice": False},
        )
        feedback = await client.post(
            "/board/posts",
            headers=user_headers,
            json={"category": "피드백", "title": "피드백 B", "content": "내용 B", "is_notice": False},
        )
        free = await client.post(
            "/board/posts",
            headers=user_headers,
            json={"category": "자유", "title": "자유 C", "content": "내용 C", "is_notice": False},
        )
        legacy = await client.post(
            "/board/posts",
            headers=user_headers,
            json={"category": "질문", "title": "레거시 문의", "content": "내용 D", "is_notice": False},
        )

        assert inquiry.status_code == 201
        assert feedback.status_code == 201
        assert free.status_code == 201
        assert legacy.status_code == 201

        pending_before = await client.get("/admin/board/pending-replies?limit=100", headers=admin_headers)
        assert pending_before.status_code == 200
        before_items = pending_before.json()["items"]

        before_ids = {item["post_id"] for item in before_items}
        assert inquiry.json()["id"] in before_ids
        assert feedback.json()["id"] in before_ids
        assert legacy.json()["id"] in before_ids
        assert free.json()["id"] not in before_ids
        assert all(item["category"] in {"문의", "피드백"} for item in before_items)

        answered = await client.post(
            f"/board/posts/{inquiry.json()['id']}/comments",
            headers=admin_headers,
            json={"content": "[관리자답변] 문의 답변 완료"},
        )
        assert answered.status_code == 201

        pending_after = await client.get("/admin/board/pending-replies?limit=100", headers=admin_headers)
        assert pending_after.status_code == 200
        after_ids = {item["post_id"] for item in pending_after.json()["items"]}
        assert inquiry.json()["id"] not in after_ids
        assert feedback.json()["id"] in after_ids
        assert legacy.json()["id"] in after_ids
        assert free.json()["id"] not in after_ids


@pytest.mark.anyio
async def test_mental_post_admin_only_and_comment_delete_and_report() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/auth/signup", json={"email": "user3@example.com", "password": "StrongPass123", "nickname": "user3"})
        await client.post("/auth/signup", json={"email": "user4@example.com", "password": "StrongPass123", "nickname": "user4"})
        await client.post("/auth/signup", json={"email": "admin@example.com", "password": "StrongPass123", "nickname": "admin"})

        login_user3 = await client.post("/auth/login", json={"email": "user3@example.com", "password": "StrongPass123"})
        login_user4 = await client.post("/auth/login", json={"email": "user4@example.com", "password": "StrongPass123"})
        login_admin = await client.post("/auth/login", json={"email": "admin@example.com", "password": "StrongPass123"})

        h_user3 = {"Authorization": f"Bearer {login_user3.json()['access_token']}"}
        h_user4 = {"Authorization": f"Bearer {login_user4.json()['access_token']}"}
        h_admin = {"Authorization": f"Bearer {login_admin.json()['access_token']}"}

        denied_mental = await client.post(
            "/board/posts",
            headers=h_user3,
            json={
                "category": "꿀팁",
                "title": "일반 사용자의 정신건강 포스팅 시도",
                "content": "내용",
                "is_notice": False,
                "is_mental_health_post": True,
            },
        )
        assert denied_mental.status_code == 403

        allowed_mental = await client.post(
            "/board/posts",
            headers=h_admin,
            json={
                "category": "꿀팁",
                "title": "관리자 정신건강 포스팅",
                "content": "정신건강 관련 안내",
                "is_notice": False,
                "is_mental_health_post": True,
            },
        )
        assert allowed_mental.status_code == 201
        assert allowed_mental.json()["is_mental_health_post"] is True

        post_id = allowed_mental.json()["id"]

        comment = await client.post(
            f"/board/posts/{post_id}/comments",
            headers=h_user3,
            json={"content": "댓글 테스트"},
        )
        assert comment.status_code == 201
        comment_id = comment.json()["id"]

        denied_delete = await client.delete(f"/board/comments/{comment_id}", headers=h_user4)
        assert denied_delete.status_code == 403

        allowed_delete = await client.delete(f"/board/comments/{comment_id}", headers=h_admin)
        assert allowed_delete.status_code == 200

        report = await client.post(
            f"/board/posts/{post_id}/report",
            headers=h_user3,
            json={"reason": "부적절", "detail": "신고 테스트"},
        )
        assert report.status_code == 200

        notifications = await client.get("/admin/notifications?limit=20", headers=h_admin)
        assert notifications.status_code == 200
        assert notifications.json()["total"] >= 1
