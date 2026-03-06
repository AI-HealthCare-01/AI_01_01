from __future__ import annotations

import os

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


def _signup_and_bootstrap(
    client: TestClient,
    uid: str,
    email: str,
    nickname: str,
) -> str:
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
    return str(bootstrap.json()["account"]["user_id"])


def test_admin_console_owner_approval_flow(tmp_path) -> None:
    db_path = tmp_path / "admin-console.sqlite3"

    os.environ["AUTH_DATABASE_PATH"] = str(db_path)
    os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = "127.0.0.1:9099"
    os.environ["AUTH_ALLOW_EMULATOR_UID_FALLBACK"] = "true"

    get_auth_settings.cache_clear()
    get_auth_store.cache_clear()
    get_core_input_store.cache_clear()
    get_insights_store.cache_clear()
    get_community_store.cache_clear()
    get_admin_console_store.cache_clear()

    client = TestClient(app)

    owner_uid = "admin-owner-uid-0001"
    owner_email = "owner@example.com"
    admin_uid = "admin-admin-uid-0002"
    admin_email = "admin@example.com"
    support_uid = "admin-support-uid-0003"
    support_email = "support@example.com"
    user_uid = "admin-user-uid-0004"
    user_email = "user@example.com"

    owner_user_id = _signup_and_bootstrap(client, owner_uid, owner_email, "owner-user")
    admin_user_id = _signup_and_bootstrap(client, admin_uid, admin_email, "admin-user")
    support_user_id = _signup_and_bootstrap(client, support_uid, support_email, "support-user")
    plain_user_id = _signup_and_bootstrap(client, user_uid, user_email, "plain-user")

    owner_me = client.get("/v1/admin/me", headers=_headers(owner_uid, owner_email))
    assert owner_me.status_code == 200
    assert owner_me.json()["actor"]["base_role"] == "owner"

    set_admin_role = client.post(
        f"/v1/admin/roles/{admin_user_id}",
        headers=_headers(owner_uid, owner_email),
        json={"base_role": "admin"},
    )
    assert set_admin_role.status_code == 200

    set_support_role = client.post(
        f"/v1/admin/roles/{support_user_id}",
        headers=_headers(owner_uid, owner_email),
        json={"base_role": "support"},
    )
    assert set_support_role.status_code == 200

    unassigned_admin_access = client.get(
        "/v1/admin/overview",
        headers=_headers(user_uid, user_email),
    )
    assert unassigned_admin_access.status_code == 403
    assert unassigned_admin_access.json()["detail"] == "admin_role_not_assigned"

    support_me = client.get("/v1/admin/me", headers=_headers(support_uid, support_email))
    assert support_me.status_code == 200
    assert support_me.json()["actor"]["base_role"] == "support"

    post_create = client.post(
        "/v1/board/post",
        headers=_headers(user_uid, user_email),
        json={
            "title": "모더레이션 대상 글",
            "body_text": "hate 표현과 safety 키워드를 포함한 테스트 본문",
            "is_anonymous": False,
            "tag_ids": ["테스트"],
        },
    )
    assert post_create.status_code == 200
    post_id = str(post_create.json()["post"]["post_id"])

    post_report = client.post(
        f"/v1/board/post/{post_id}/report",
        headers=_headers(user_uid, user_email),
        json={"reason_code": "self_harm_signal", "detail_text": "위험 신호"},
    )
    assert post_report.status_code == 200

    ticket_create = client.post(
        "/v1/support/tickets",
        headers=_headers(user_uid, user_email),
        json={
            "ticket_type": "inquiry",
            "title": "관리자 큐 테스트 문의",
            "category": "account",
            "related_feature": "admin_console",
            "body": "재오픈/알림 흐름 테스트",
            "reply_requested": True,
        },
    )
    assert ticket_create.status_code == 200

    users_list = client.get("/v1/admin/users", headers=_headers(owner_uid, owner_email))
    assert users_list.status_code == 200
    assert len(users_list.json()["items"]) >= 4
    assert all("ip" not in item for item in users_list.json()["items"])
    assert all("email" not in item for item in users_list.json()["items"])

    support_restriction_forbidden = client.post(
        "/v1/admin/restrictions",
        headers=_headers(support_uid, support_email),
        json={
            "target_user_id": plain_user_id,
            "block_account": True,
            "block_ip": False,
            "reason_code": "abuse",
        },
    )
    assert support_restriction_forbidden.status_code == 403

    support_ban_context_forbidden = client.get(
        f"/v1/admin/users/{plain_user_id}/ban-context",
        headers=_headers(support_uid, support_email),
    )
    assert support_ban_context_forbidden.status_code == 403

    support_users_list = client.get("/v1/admin/users", headers=_headers(support_uid, support_email))
    assert support_users_list.status_code == 200
    assert all("ip" not in item for item in support_users_list.json()["items"])
    assert all("email" not in item for item in support_users_list.json()["items"])

    ban_context_before = client.get(
        f"/v1/admin/users/{plain_user_id}/ban-context",
        headers=_headers(owner_uid, owner_email),
    )
    assert ban_context_before.status_code == 200
    assert ban_context_before.json()["email"] == user_email

    restriction = client.post(
        "/v1/admin/restrictions",
        headers=_headers(owner_uid, owner_email),
        json={
            "target_user_id": plain_user_id,
            "block_account": True,
            "block_ip": True,
            "target_ip": "203.0.113.10",
            "reason_code": "policy_violation",
            "reason_detail": "반복 신고로 제재",
        },
    )
    assert restriction.status_code == 200
    assert restriction.json()["block_account"] is True
    assert restriction.json()["block_ip"] is True

    owner_restriction_forbidden = client.post(
        "/v1/admin/restrictions",
        headers=_headers(owner_uid, owner_email),
        json={
            "target_user_id": owner_user_id,
            "block_account": True,
            "block_ip": False,
            "reason_code": "abuse",
        },
    )
    assert owner_restriction_forbidden.status_code == 403
    assert owner_restriction_forbidden.json()["detail"] == "owner_restriction_forbidden"

    ban_context_after = client.get(
        f"/v1/admin/users/{plain_user_id}/ban-context",
        headers=_headers(owner_uid, owner_email),
    )
    assert ban_context_after.status_code == 200
    assert "203.0.113.10" in ban_context_after.json()["recent_ips"]

    moderation_queues = client.get(
        "/v1/admin/moderation/queues",
        headers=_headers(admin_uid, admin_email),
    )
    assert moderation_queues.status_code == 200
    queue_groups = moderation_queues.json()["groups"]
    assert len(queue_groups) == 3

    support_queue = client.get("/v1/admin/support/queue", headers=_headers(admin_uid, admin_email))
    assert support_queue.status_code == 200
    assert len(support_queue.json()["items"]) >= 1

    policy_create = client.post(
        "/v1/admin/policies",
        headers=_headers(admin_uid, admin_email),
        json={
            "policy_domain": "board_policy",
            "title": "게시판 정책 v2",
            "draft_json": {"report_threshold": 3},
        },
    )
    assert policy_create.status_code == 200
    policy_change_id = str(policy_create.json()["policy_change_id"])

    policy_submit = client.post(
        "/v1/admin/owner-approval",
        headers=_headers(admin_uid, admin_email),
        json={"object_type": "policy_change", "object_id": policy_change_id},
    )
    assert policy_submit.status_code == 200

    policy_approvals = client.get(
        "/v1/admin/owner-approval",
        headers=_headers(owner_uid, owner_email),
        params={"status": "pending_owner_approval"},
    )
    assert policy_approvals.status_code == 200
    policy_approval = next(
        item
        for item in policy_approvals.json()
        if item["object_type"] == "policy_change" and item["object_id"] == policy_change_id
    )

    policy_decision = client.post(
        f"/v1/admin/owner-approval/{policy_approval['approval_id']}/decide",
        headers=_headers(owner_uid, owner_email),
        json={"decision": "approved", "decision_note": "승인"},
    )
    assert policy_decision.status_code == 200

    policy_apply = client.post(
        f"/v1/admin/policies/{policy_change_id}/apply",
        headers=_headers(owner_uid, owner_email),
    )
    assert policy_apply.status_code == 200
    assert policy_apply.json()["status"] == "applied"

    model_create = client.post(
        "/v1/admin/model-ops",
        headers=_headers(admin_uid, admin_email),
        json={
            "model_name": "mindsight-nowcast",
            "experiment_name": "exp-admin-001",
            "change_summary": "입력 feature 가중치 조정",
            "metrics_json": {"mae": 0.55, "coverage": 0.8},
        },
    )
    assert model_create.status_code == 200
    model_change_id = str(model_create.json()["model_change_id"])

    model_training = client.post(
        f"/v1/admin/model-ops/{model_change_id}/transition",
        headers=_headers(admin_uid, admin_email),
        json={"next_status": "training_running"},
    )
    assert model_training.status_code == 200

    model_eval = client.post(
        f"/v1/admin/model-ops/{model_change_id}/transition",
        headers=_headers(admin_uid, admin_email),
        json={"next_status": "evaluation_ready"},
    )
    assert model_eval.status_code == 200

    model_submit = client.post(
        "/v1/admin/owner-approval",
        headers=_headers(admin_uid, admin_email),
        json={"object_type": "model_change", "object_id": model_change_id},
    )
    assert model_submit.status_code == 200

    model_approvals = client.get(
        "/v1/admin/owner-approval",
        headers=_headers(owner_uid, owner_email),
        params={"status": "pending_owner_approval"},
    )
    assert model_approvals.status_code == 200
    model_approval = next(
        item
        for item in model_approvals.json()
        if item["object_type"] == "model_change" and item["object_id"] == model_change_id
    )

    model_decision = client.post(
        f"/v1/admin/owner-approval/{model_approval['approval_id']}/decide",
        headers=_headers(owner_uid, owner_email),
        json={"decision": "approved", "decision_note": "배포 승인"},
    )
    assert model_decision.status_code == 200

    model_deploy = client.post(
        f"/v1/admin/model-ops/{model_change_id}/transition",
        headers=_headers(owner_uid, owner_email),
        json={"next_status": "deployed"},
    )
    assert model_deploy.status_code == 200
    assert model_deploy.json()["status"] == "deployed"

    model_rollback = client.post(
        f"/v1/admin/model-ops/{model_change_id}/transition",
        headers=_headers(owner_uid, owner_email),
        json={"next_status": "rolled_back"},
    )
    assert model_rollback.status_code == 200
    assert model_rollback.json()["status"] == "rolled_back"

    extension_request = client.post(
        "/v1/admin/extensions/request",
        headers=_headers(support_uid, support_email),
        json={"extension_code": "analyst_ml_extension", "note": "모델 모니터링 필요"},
    )
    assert extension_request.status_code == 200
    extension_id = str(extension_request.json()["extension_id"])

    extension_decision = client.post(
        f"/v1/admin/extensions/{extension_id}/decide",
        headers=_headers(admin_uid, admin_email),
        json={"decision": "approved", "note": "업무 범위 승인"},
    )
    assert extension_decision.status_code == 200
    assert extension_decision.json()["status"] == "approved"

    support_model_create = client.post(
        "/v1/admin/model-ops",
        headers=_headers(support_uid, support_email),
        json={
            "model_name": "mindsight-nowcast",
            "experiment_name": "exp-support-001",
            "change_summary": "지원팀 실험 등록",
            "metrics_json": {"mae": 0.6},
        },
    )
    assert support_model_create.status_code == 200

    audit_log = client.get("/v1/admin/audit-log", headers=_headers(owner_uid, owner_email))
    assert audit_log.status_code == 200
    audit_actions = {item["action_type"] for item in audit_log.json()["items"]}
    assert "restriction_created" in audit_actions
    assert "owner_approval_decided" in audit_actions
    assert "admin_role_assigned" in audit_actions


def test_owner_seed_user_can_become_owner_even_with_existing_admin_roles(tmp_path) -> None:
    db_path = tmp_path / "admin-console-owner-seed.sqlite3"

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

    legacy_uid = "legacy-admin-uid-0001"
    legacy_email = "legacy-owner@example.com"
    seeded_uid = "seed-owner-uid-0002"
    seeded_email = "seed-owner@example.com"

    _signup_and_bootstrap(client, legacy_uid, legacy_email, "legacy-owner")
    legacy_me = client.get("/v1/admin/me", headers=_headers(legacy_uid, legacy_email))
    assert legacy_me.status_code == 200
    assert legacy_me.json()["actor"]["base_role"] == "owner"

    os.environ["ADMIN_OWNER_EMAIL"] = seeded_email

    _signup_and_bootstrap(client, seeded_uid, seeded_email, "seed-owner")
    seeded_me = client.get("/v1/admin/me", headers=_headers(seeded_uid, seeded_email))
    assert seeded_me.status_code == 200
    assert seeded_me.json()["actor"]["base_role"] == "owner"
