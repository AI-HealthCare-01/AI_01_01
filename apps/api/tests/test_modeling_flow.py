from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.admin_console.deps import get_admin_console_store
from app.auth.firebase import get_auth_settings
from app.auth.router import get_auth_store
from app.community.deps import get_community_store
from app.core_inputs.deps import get_core_input_store
from app.insights.deps import get_insights_store
from app.main import app
from app.modeling.deps import get_modeling_store


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


def test_modeling_nowcast_and_retraining_job_flow(tmp_path) -> None:
    pytest.importorskip("joblib")
    pytest.importorskip("pandas")
    pytest.importorskip("sklearn")

    db_path = tmp_path / "modeling-flow.sqlite3"
    model_bundle_dir = Path(__file__).resolve().parents[3] / "model"

    os.environ["AUTH_DATABASE_PATH"] = str(db_path)
    os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = "127.0.0.1:9099"
    os.environ["AUTH_ALLOW_EMULATOR_UID_FALLBACK"] = "true"
    os.environ["MODEL_BUNDLE_DIR"] = str(model_bundle_dir)
    os.environ.pop("ADMIN_OWNER_EMAIL", None)
    os.environ.pop("ADMIN_OWNER_FIREBASE_UID", None)

    get_auth_settings.cache_clear()
    get_auth_store.cache_clear()
    get_core_input_store.cache_clear()
    get_insights_store.cache_clear()
    get_community_store.cache_clear()
    get_admin_console_store.cache_clear()
    get_modeling_store.cache_clear()

    client = TestClient(app)

    owner_uid = "model-owner-uid"
    owner_email = "model-owner@example.com"
    admin_uid = "model-admin-uid"
    admin_email = "model-admin@example.com"
    user_uid = "model-user-uid"
    user_email = "model-user@example.com"

    owner_user_id = _signup_and_bootstrap(client, owner_uid, owner_email, "owner-user")
    admin_user_id = _signup_and_bootstrap(client, admin_uid, admin_email, "admin-user")
    user_user_id = _signup_and_bootstrap(client, user_uid, user_email, "normal-user")

    owner_me = client.get("/v1/admin/me", headers=_headers(owner_uid, owner_email))
    assert owner_me.status_code == 200
    assert owner_me.json()["actor"]["base_role"] == "owner"

    set_admin_role = client.post(
        f"/v1/admin/roles/{admin_user_id}",
        headers=_headers(owner_uid, owner_email),
        json={"base_role": "admin"},
    )
    assert set_admin_role.status_code == 200

    model_create = client.post(
        "/v1/admin/model-ops",
        headers=_headers(admin_uid, admin_email),
        json={
            "model_name": "mindsight-nowcast",
            "experiment_name": "exp-modeling-job-001",
            "change_summary": "real+synthetic retraining 후보",
            "metrics_json": {"mae": 0.45, "r2": 0.82},
        },
    )
    assert model_create.status_code == 200
    model_change_id = str(model_create.json()["model_change_id"])

    retraining_job_create = client.post(
        f"/v1/admin/model-ops/{model_change_id}/retraining-jobs",
        headers=_headers(admin_uid, admin_email),
        json={
            "mode": "dry_run",
            "training_window_days": 84,
            "include_synthetic_data": True,
            "dataset_snapshot_id": "snapshot-20260303",
            "note": "Owner 승인 전 대기",
        },
    )
    assert retraining_job_create.status_code == 200
    retraining_job_id = str(retraining_job_create.json()["job_id"])
    assert retraining_job_create.json()["status"] == "pending_owner_approval"

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

    pending_approvals = client.get(
        "/v1/admin/owner-approval",
        headers=_headers(owner_uid, owner_email),
        params={"status": "pending_owner_approval"},
    )
    assert pending_approvals.status_code == 200
    approval = next(
        item
        for item in pending_approvals.json()
        if item["object_type"] == "model_change" and item["object_id"] == model_change_id
    )

    approve = client.post(
        f"/v1/admin/owner-approval/{approval['approval_id']}/decide",
        headers=_headers(owner_uid, owner_email),
        json={"decision": "approved", "decision_note": "재학습 가능"},
    )
    assert approve.status_code == 200

    retraining_jobs = client.get(
        f"/v1/admin/model-ops/{model_change_id}/retraining-jobs",
        headers=_headers(admin_uid, admin_email),
    )
    assert retraining_jobs.status_code == 200
    assert len(retraining_jobs.json()) >= 1
    assert retraining_jobs.json()[0]["status"] == "queued"

    run_job = client.post(
        f"/v1/admin/model-ops/retraining-jobs/{retraining_job_id}/transition",
        headers=_headers(owner_uid, owner_email),
        json={"next_status": "running"},
    )
    assert run_job.status_code == 200
    assert run_job.json()["status"] == "running"

    complete_job = client.post(
        f"/v1/admin/model-ops/retraining-jobs/{retraining_job_id}/transition",
        headers=_headers(owner_uid, owner_email),
        json={
            "next_status": "completed",
            "artifact_uri": "s3://mindsight-staging/model/exp-modeling-job-001.tar.gz",
            "result_summary": {"mae": 0.42, "calibration": "ok"},
        },
    )
    assert complete_job.status_code == 200
    assert complete_job.json()["status"] == "completed"
    result_summary = complete_job.json()["result_summary"]
    assert isinstance(result_summary.get("operator_summary"), str)
    assert isinstance(result_summary.get("operator_recommendation_summary"), str)
    assert isinstance(result_summary.get("program_recommendations"), list)
    assert isinstance(result_summary.get("improvement_recommendations"), list)
    assert isinstance(result_summary.get("data_eligibility"), dict)

    runtime_status = client.get(
        "/v1/modeling/runtime",
        headers=_headers(user_uid, user_email),
    )
    assert runtime_status.status_code == 200
    assert runtime_status.json()["bundle_ready"] is True
    assert runtime_status.json()["feature_count"] > 0

    predict = client.post(
        "/v1/modeling/nowcast/predict",
        headers=_headers(user_uid, user_email),
        json={
            "feature_values": {
                "mood_1_5": 3,
                "anxiety_1_5": 2,
                "energy_1_5": 4,
                "sleep_total_bucket_num": 4,
                "unknown_feature_should_ignore": 99,
            }
        },
    )
    assert predict.status_code == 200
    assert predict.json()["user_id"] == user_user_id
    assert predict.json()["ml_subject_id"].startswith("real_ml_")
    assert "dep_target_state_today" in predict.json()["predictions"]
    assert predict.json()["feature_coverage"]["required_feature_count"] > 0
    assert "unknown_feature_should_ignore" in predict.json()["feature_coverage"]["unknown_features"]

    history = client.get(
        "/v1/modeling/nowcast/history",
        headers=_headers(user_uid, user_email),
    )
    assert history.status_code == 200
    assert len(history.json()) >= 1
    assert history.json()[0]["prediction_id"].startswith("nwc_")

    assert owner_user_id.startswith("usr_")
