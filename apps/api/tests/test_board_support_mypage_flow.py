from __future__ import annotations

import os
from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.admin_console.deps import get_admin_console_store
from app.auth.firebase import get_auth_settings
from app.auth.router import get_auth_store
from app.community.deps import get_community_store
from app.core_inputs.deps import get_core_input_store
from app.insights.deps import get_insights_store
from app.main import app


def _headers(uid: str, email: str, verified: bool = True) -> dict[str, str]:
    return {
        "x-firebase-uid": uid,
        "x-firebase-email": email,
        "x-firebase-email-verified": str(verified).lower(),
    }


def test_board_support_mypage_flow(tmp_path) -> None:
    db_path = tmp_path / "board-support-mypage.sqlite3"

    os.environ["AUTH_DATABASE_PATH"] = str(db_path)
    os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = "127.0.0.1:9099"
    os.environ["AUTH_ALLOW_EMULATOR_UID_FALLBACK"] = "true"
    os.environ.pop("ADMIN_OWNER_EMAIL", None)
    os.environ.pop("ADMIN_OWNER_FIREBASE_UID", None)

    get_auth_settings.cache_clear()
    get_auth_store.cache_clear()
    get_core_input_store.cache_clear()
    get_insights_store.cache_clear()
    get_community_store.cache_clear()
    get_admin_console_store.cache_clear()

    client = TestClient(app)
    uid = "community-user-uid-0001"
    email = "community-user@example.com"
    admin_uid = "community-admin-uid-0001"
    admin_email = "community-admin@example.com"

    signup = client.post(
        "/v1/auth/signup",
        json={
            "firebase_uid": uid,
            "email": email,
            "nickname": "community-user",
            "terms_required": True,
            "privacy_required": True,
            "age_required": True,
        },
    )
    assert signup.status_code == 200

    admin_signup = client.post(
        "/v1/auth/signup",
        json={
            "firebase_uid": admin_uid,
            "email": admin_email,
            "nickname": "community-admin",
            "terms_required": True,
            "privacy_required": True,
            "age_required": True,
        },
    )
    assert admin_signup.status_code == 200

    bootstrap = client.post(
        "/v1/auth/session/bootstrap",
        json={"firebase_uid": uid},
        headers=_headers(uid, email, verified=True),
    )
    assert bootstrap.status_code == 200

    admin_bootstrap = client.post(
        "/v1/auth/session/bootstrap",
        json={"firebase_uid": admin_uid},
        headers=_headers(admin_uid, admin_email, verified=True),
    )
    assert admin_bootstrap.status_code == 200

    owner_bootstrap = client.get("/v1/admin/me", headers=_headers(admin_uid, admin_email))
    assert owner_bootstrap.status_code == 200

    create_post = client.post(
        "/v1/board/post",
        headers=_headers(uid, email),
        json={
            "title": "피드 테스트",
            "body_text": (
                "오늘은 힘들지만 괜찮아질 거야. hate 단어가 포함됩니다."
            ),
            "is_anonymous": False,
            "tag_ids": ["테스트", "일상"],
        },
    )
    assert create_post.status_code == 200
    post_json = create_post.json()
    post_id = post_json["post"]["post_id"]
    feed_public_id = post_json["post"]["feed_public_id"]

    feed = client.get(
        "/v1/board/feed",
        headers=_headers(uid, email),
        params={"limit": 15},
    )
    assert feed.status_code == 200
    feed_items = feed.json()["items"]
    assert len(feed_items) >= 1

    feed_search = client.get(
        "/v1/board/feed",
        headers=_headers(uid, email),
        params={"q": feed_public_id},
    )
    assert feed_search.status_code == 200
    assert any(
        item["post"]["feed_public_id"] == feed_public_id
        for item in feed_search.json()["items"]
    )

    toggle_like = client.post(f"/v1/board/post/{post_id}/like", headers=_headers(uid, email))
    assert toggle_like.status_code == 200
    assert toggle_like.json()["result"] == "liked"

    toggle_bookmark = client.post(
        f"/v1/board/post/{post_id}/bookmark",
        headers=_headers(uid, email),
    )
    assert toggle_bookmark.status_code == 200
    assert toggle_bookmark.json()["result"] == "bookmarked"

    bookmarks = client.get("/v1/board/bookmarks", headers=_headers(uid, email))
    assert bookmarks.status_code == 200
    assert any(item["post"]["post_id"] == post_id for item in bookmarks.json()["items"])

    comment = client.post(
        f"/v1/board/post/{post_id}/comments",
        headers=_headers(uid, email),
        json={
            "body_text": "혐오 표현은 금지이며 moderation 확인이 필요합니다.",
            "is_anonymous": False,
        },
    )
    assert comment.status_code == 200

    report = client.post(
        f"/v1/board/post/{post_id}/report",
        headers=_headers(uid, email),
        json={"reason_code": "self_harm_signal", "detail_text": "위험 신호가 있습니다."},
    )
    assert report.status_code == 200
    assert report.json()["result"] == "reported"

    queues = client.get("/v1/admin/moderation/queues", headers=_headers(admin_uid, admin_email))
    assert queues.status_code == 200
    queue_map = {group["queue_type"]: group for group in queues.json()["groups"]}
    assert queue_map["report"]["queued_count"] >= 1
    assert queue_map["hate"]["queued_count"] >= 1
    assert queue_map["safety"]["queued_count"] >= 1

    hate_item = queue_map["hate"]["items"][0]
    hate_queue_item_id = str(hate_item["queue_item_id"])
    moderation_detail = client.get(
        f"/v1/admin/moderation/queues/{hate_queue_item_id}",
        headers=_headers(admin_uid, admin_email),
    )
    assert moderation_detail.status_code == 200
    if hate_item["target_type"] == "post":
        assert moderation_detail.json()["post"]["post_id"] == post_id
        assert moderation_detail.json()["post"]["body_text"]
    else:
        assert moderation_detail.json()["comment"]["post_id"] == post_id
        assert moderation_detail.json()["comment"]["body_text"]

    moderation_action = client.post(
        f"/v1/admin/moderation/queues/{hate_queue_item_id}/action",
        headers=_headers(admin_uid, admin_email),
        json={"action_code": "hide"},
    )
    assert moderation_action.status_code == 200
    assert moderation_action.json()["result"] == "hide"
    if hate_item["target_type"] == "post":
        assert moderation_action.json()["post_visibility_status"] == "hidden_by_moderator"
    else:
        assert moderation_action.json()["comment_visibility_status"] == "hidden_by_moderator"

    ticket_create = client.post(
        "/v1/support/tickets",
        headers=_headers(uid, email),
        json={
            "ticket_type": "inquiry",
            "title": "문의 테스트",
            "category": "account",
            "related_feature": "board",
            "body": "로그인 이슈가 있고 확인 부탁드립니다.",
            "reply_requested": True,
        },
    )
    assert ticket_create.status_code == 200
    ticket_id = ticket_create.json()["ticket"]["ticket_id"]

    admin_reply = client.post(
        f"/v1/admin/support/tickets/{ticket_id}/reply",
        headers=_headers(admin_uid, admin_email),
        json={"body": "확인했고 조치했습니다.", "status": "answered"},
    )
    assert admin_reply.status_code == 200
    assert admin_reply.json()["ticket"]["status"] == "answered"

    notifications = client.get("/v1/support/notifications", headers=_headers(uid, email))
    assert notifications.status_code == 200
    notification_items = notifications.json()["items"]
    assert any(item["event_type"] == "admin_reply" for item in notification_items)

    followup = client.post(
        f"/v1/support/tickets/{ticket_id}/followup",
        headers=_headers(uid, email),
        json={"body": "추가문의가 있습니다. 다시 확인해주세요."},
    )
    assert followup.status_code == 200
    assert followup.json()["ticket"]["status"] == "reopened"

    resolve = client.post(
        f"/v1/support/tickets/{ticket_id}/resolve",
        headers=_headers(uid, email),
    )
    assert resolve.status_code == 200
    assert resolve.json()["status"] == "resolved"

    support_tickets = client.get("/v1/mypage/support-tickets", headers=_headers(uid, email))
    assert support_tickets.status_code == 200
    assert len(support_tickets.json()) >= 1

    end_date = date.today()
    start_date = end_date - timedelta(days=6)
    export = client.post(
        "/v1/report/summary/export",
        headers=_headers(uid, email),
        json={
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "format": "pdf",
            "include_sensitive": False,
        },
    )
    assert export.status_code == 200

    mypage_home = client.get("/v1/mypage/home", headers=_headers(uid, email))
    assert mypage_home.status_code == 200
    mypage_home_json = mypage_home.json()
    assert "quick_links" in mypage_home_json
    assert mypage_home_json["report_summary"]["vault_count"] >= 1

    mypage_profile = client.patch(
        "/v1/mypage/profile",
        headers=_headers(uid, email),
        json={"nickname": "hub-user", "birth_year": 1994, "gender": "female"},
    )
    assert mypage_profile.status_code == 200
    assert mypage_profile.json()["nickname"] == "hub-user"

    mypage_consents = client.patch(
        "/v1/mypage/consents",
        headers=_headers(uid, email),
        json={"personalization_optional": True, "model_improvement_optional": True},
    )
    assert mypage_consents.status_code == 200
    assert mypage_consents.json()["personalization_optional"] is True
    assert mypage_consents.json()["model_improvement_optional"] is True

    report_vault = client.get("/v1/mypage/report-vault", headers=_headers(uid, email))
    assert report_vault.status_code == 200
    assert len(report_vault.json()) >= 1

    password_change = client.post(
        "/v1/mypage/security/password",
        headers=_headers(uid, email),
        json={
            "current_password": "old-password-123",
            "new_password": "new-password-123",
            "new_password_confirm": "new-password-123",
        },
    )
    assert password_change.status_code == 200
    assert password_change.json()["requires_firebase_action"] is True
