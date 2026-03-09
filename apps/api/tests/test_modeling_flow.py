from __future__ import annotations

import os
from datetime import date
from pathlib import Path

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


def _save_checkin(
    client: TestClient,
    uid: str,
    email: str,
    target_date: str,
) -> None:
    response = client.post(
        "/checkin/today",
        headers=_headers(uid, email, verified=True),
        json={
            "date": target_date,
            "sleep_total_bucket": "h6_7",
            "wake_time_local": "07:20",
            "sleep_latency_bucket": "m15_30",
            "mood_1_5": 2,
            "anxiety_1_5": 4,
            "energy_1_5": 2,
            "daylight_bucket": "m1_9",
            "exercise_bucket": "m0",
            "alcohol_bucket": "none",
            "caffeine_after_2pm_flag": True,
            "timezone": "Asia/Seoul",
            "completion_mode": "full",
        },
    )
    assert response.status_code == 200


def test_modeling_nowcast_and_retraining_job_flow(tmp_path) -> None:
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
    assert predict.json()["used_backend"] in {"baseline", "artifact"}
    assert isinstance(predict.json()["schema_version"], str)
    assert isinstance(predict.json()["logic_version"], str)
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


def test_modeling_auto_refresh_for_dashboard_and_challenge_recommendation(tmp_path) -> None:
    db_path = tmp_path / "modeling-auto-refresh.sqlite3"
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
    uid = "modeling-auto-user-uid"
    email = "modeling-auto-user@example.com"

    _signup_and_bootstrap(client, uid, email, "model-auto-user")
    today = date.today().isoformat()

    _save_checkin(client, uid, email, today)

    cbt_session = client.post(
        "/v1/cbt/sessions",
        headers=_headers(uid, email, verified=True),
        json={
            "date": today,
            "duration_sec": 800,
            "state": {
                "situation": "프로젝트 마감 압박으로 긴장이 올라왔다.",
                "automatic_thoughts": ["나는 결국 실패할 거야"],
                "emotions": [{"name": "불안", "intensity": 82}],
                "behaviors": ["미루기"],
                "evidence_for": ["최근 일정이 빠듯했다."],
                "evidence_against": ["이전에도 비슷한 마감을 해낸 적이 있다."],
                "distortion_candidates": [],
                "intermediate_belief_hypotheses": [],
                "core_belief_hypotheses": [],
                "risk_flags": {
                    "functional_impairment_flag": False,
                    "self_harm_flag": False,
                    "suicide_risk_level": 0,
                    "violence_risk_flag": False,
                },
            },
            "session_helpfulness_0_10": 7,
            "homework_commitment_0_10": 6,
        },
    )
    assert cbt_session.status_code == 200

    nowcast_history = client.get(
        "/v1/modeling/nowcast/history",
        headers=_headers(uid, email, verified=True),
    )
    assert nowcast_history.status_code == 200
    history_rows = nowcast_history.json()
    assert len(history_rows) >= 2

    recommendations = client.get(
        "/challenge/recommendations/today",
        headers=_headers(uid, email, verified=True),
    )
    assert recommendations.status_code == 200
    recommendation_payload = recommendations.json()["recommendations"]
    assert recommendation_payload["signal_source"] == "model_nowcast"

    symptom = client.get(
        "/v1/dashboard/symptom",
        headers=_headers(uid, email, verified=True),
        params={"mode": "7d"},
    )
    assert symptom.status_code == 200
    series = symptom.json()["series"]
    score_by_metric = {str(item["metric"]): item["current_score"] for item in series}

    assert score_by_metric["dep"] is not None
    assert score_by_metric["anx"] is not None
    assert score_by_metric["ins"] is not None
    assert recommendation_payload["signal_scores"]["dep"] is not None
    assert recommendation_payload["signal_scores"]["anx"] is not None
    assert recommendation_payload["signal_scores"]["ins"] is not None


def test_modeling_artifact_backend_falls_back_to_baseline_when_artifact_missing(tmp_path) -> None:
    db_path = tmp_path / "modeling-artifact-fallback.sqlite3"
    model_bundle_dir = Path(__file__).resolve().parents[3] / "model"
    missing_artifact_path = tmp_path / "missing-artifact-dir"

    os.environ["AUTH_DATABASE_PATH"] = str(db_path)
    os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = "127.0.0.1:9099"
    os.environ["AUTH_ALLOW_EMULATOR_UID_FALLBACK"] = "true"
    os.environ["MODEL_BUNDLE_DIR"] = str(model_bundle_dir)
    os.environ["MODEL_BACKEND"] = "artifact"
    os.environ["MODEL_ARTIFACT_PATH"] = str(missing_artifact_path)
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
    uid = "model-fallback-user-uid"
    email = "model-fallback-user@example.com"
    _signup_and_bootstrap(client, uid, email, "model-fallback-user")

    predict = client.post(
        "/v1/modeling/nowcast/predict",
        headers=_headers(uid, email, verified=True),
        json={
            "feature_values": {
                "mood_1_5": 2,
                "anxiety_1_5": 3,
                "energy_1_5": 3,
                "sleep_total_bucket_num": 4,
            }
        },
    )
    assert predict.status_code == 200
    payload = predict.json()
    assert payload["used_backend"] == "baseline"
    assert any(
        str(item).startswith("artifact_fallback_to_baseline:")
        for item in payload.get("warnings", [])
    )
