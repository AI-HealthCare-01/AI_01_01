from __future__ import annotations

import os

from fastapi.testclient import TestClient

from app.admin_console.deps import get_admin_console_store
from app.auth.firebase import get_auth_settings
from app.auth.router import get_auth_store
from app.community import deps as community_deps
from app.community.deps import get_community_store
from app.community.moderation import ToxicPrediction, load_toxic_moderation_settings
from app.core_inputs.deps import get_core_input_store
from app.insights.deps import get_insights_store
from app.main import app


def _headers(uid: str, email: str, verified: bool = True) -> dict[str, str]:
    return {
        "x-firebase-uid": uid,
        "x-firebase-email": email,
        "x-firebase-email-verified": str(verified).lower(),
    }


def _signup_and_bootstrap(client: TestClient, uid: str, email: str, nickname: str) -> None:
    signup = client.post(
        "/v1/auth/signup",
        json={
            "firebase_uid": uid,
            "email": email,
            "nickname": nickname,
            "terms_required": True,
            "privacy_required": True,
            "age_required": True,
        },
    )
    assert signup.status_code == 200

    bootstrap = client.post(
        "/v1/auth/session/bootstrap",
        json={"firebase_uid": uid},
        headers=_headers(uid, email, verified=True),
    )
    assert bootstrap.status_code == 200


class _FakeToxicClassifier:
    def classify(self, text: str) -> ToxicPrediction | None:
        if "개새끼" not in text:
            return None
        return ToxicPrediction(score=0.97, label="toxic")


def test_board_toxic_model_routes_korean_profanity_to_hate_queue(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "community-toxic-model.sqlite3"

    os.environ["AUTH_DATABASE_PATH"] = str(db_path)
    os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = "127.0.0.1:9099"
    os.environ["AUTH_ALLOW_EMULATOR_UID_FALLBACK"] = "true"
    os.environ["BOARD_TOXIC_MODEL_ENABLED"] = "true"
    os.environ.pop("ADMIN_OWNER_EMAIL", None)
    os.environ.pop("ADMIN_OWNER_FIREBASE_UID", None)

    monkeypatch.setattr(
        community_deps,
        "build_toxic_text_classifier",
        lambda: _FakeToxicClassifier(),
    )

    get_auth_settings.cache_clear()
    get_auth_store.cache_clear()
    get_core_input_store.cache_clear()
    get_insights_store.cache_clear()
    get_community_store.cache_clear()
    get_admin_console_store.cache_clear()
    load_toxic_moderation_settings.cache_clear()

    client = TestClient(app)
    user_uid = "toxic-user-uid-0001"
    user_email = "toxic-user@example.com"
    admin_uid = "toxic-admin-uid-0001"
    admin_email = "toxic-admin@example.com"

    _signup_and_bootstrap(client, user_uid, user_email, "toxic-user")
    _signup_and_bootstrap(client, admin_uid, admin_email, "toxic-admin")

    owner_me = client.get("/v1/admin/me", headers=_headers(admin_uid, admin_email))
    assert owner_me.status_code == 200

    post_create = client.post(
        "/v1/board/post",
        headers=_headers(user_uid, user_email),
        json={
            "title": "모델 감지",
            "body_text": "개새끼 같은 표현도 모델이 감지해야 합니다.",
            "is_anonymous": False,
            "tag_ids": ["테스트"],
        },
    )
    assert post_create.status_code == 200
    assert post_create.json()["post"]["moderation_status"] == "under_review"

    moderation_queues = client.get(
        "/v1/admin/moderation/queues",
        headers=_headers(admin_uid, admin_email),
    )
    assert moderation_queues.status_code == 200
    queue_map = {group["queue_type"]: group for group in moderation_queues.json()["groups"]}
    assert queue_map["hate"]["queued_count"] >= 1
    assert any(
        item["source_type"] in {"model_text_scan", "rule_model_text_scan"}
        for item in queue_map["hate"]["items"]
    )
