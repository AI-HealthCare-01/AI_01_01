from __future__ import annotations

import os
from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.auth.firebase import get_auth_settings
from app.auth.router import get_auth_store
from app.core_inputs.deps import get_core_input_store
from app.main import app

PHQ9_ITEMS = [f"PHQ9_{index}" for index in range(1, 10)]
GAD7_ITEMS = [f"GAD7_{index}" for index in range(1, 8)]
ISI_ITEMS = [f"ISI_{index}" for index in range(1, 8)]


def _headers(uid: str, email: str | None = None, verified: bool = False) -> dict[str, str]:
    headers = {"x-firebase-uid": uid, "x-firebase-email-verified": str(verified).lower()}
    if email:
        headers["x-firebase-email"] = email
    return headers


def _complete_onboarding_assessment(
    client: TestClient,
    *,
    uid: str,
    email: str,
) -> str:
    start = client.post(
        "/v1/assessments/start",
        json={"source": "onboarding"},
        headers=_headers(uid=uid, email=email, verified=True),
    )
    assert start.status_code == 200
    assessment_id = start.json()["assessment_id"]

    for item_code in PHQ9_ITEMS:
        response = client.post(
            f"/v1/assessments/{assessment_id}/answer",
            json={"instrument": "phq9", "item_code": item_code, "response_score": 1},
            headers=_headers(uid=uid, email=email, verified=True),
        )
        assert response.status_code == 200

    for item_code in GAD7_ITEMS:
        response = client.post(
            f"/v1/assessments/{assessment_id}/answer",
            json={"instrument": "gad7", "item_code": item_code, "response_score": 1},
            headers=_headers(uid=uid, email=email, verified=True),
        )
        assert response.status_code == 200

    for item_code in ISI_ITEMS:
        response = client.post(
            f"/v1/assessments/{assessment_id}/answer",
            json={"instrument": "isi", "item_code": item_code, "response_score": 1},
            headers=_headers(uid=uid, email=email, verified=True),
        )
        assert response.status_code == 200

    complete = client.post(
        f"/v1/assessments/{assessment_id}/complete",
        headers=_headers(uid=uid, email=email, verified=True),
    )
    assert complete.status_code == 200

    return str(assessment_id)


def test_auth_onboarding_flow(tmp_path) -> None:
    db_path = tmp_path / "auth.sqlite3"

    os.environ["AUTH_DATABASE_PATH"] = str(db_path)
    os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = "127.0.0.1:9099"
    os.environ["AUTH_ALLOW_EMULATOR_UID_FALLBACK"] = "true"

    get_auth_settings.cache_clear()
    get_auth_store.cache_clear()
    get_core_input_store.cache_clear()

    client = TestClient(app)
    uid = "test-firebase-uid-0001"
    email = "user@example.com"

    signup = client.post(
        "/v1/auth/signup",
        json={
            "firebase_uid": uid,
            "email": email,
            "nickname": "mind-user",
            "terms_required": True,
            "privacy_required": True,
            "age_required": True,
        },
    )
    assert signup.status_code == 200
    signup_data = signup.json()

    assert signup_data["account"]["firebase_uid"] == uid
    assert signup_data["account"]["account_status"] == "pending_email_verification"
    assert signup_data["onboarding"]["onboarding_status"] == "not_started"
    assert signup_data["account"]["ml_subject_id"].startswith(
        f"real_ml_{datetime.now(UTC).year}_"
    )

    bootstrap_unverified = client.post(
        "/v1/auth/session/bootstrap",
        json={"firebase_uid": uid},
        headers=_headers(uid=uid, email=email, verified=False),
    )
    assert bootstrap_unverified.status_code == 200
    assert (
        bootstrap_unverified.json()["account"]["account_status"]
        == "pending_email_verification"
    )

    bootstrap_verified = client.post(
        "/v1/auth/session/bootstrap",
        json={"firebase_uid": uid},
        headers=_headers(uid=uid, email=email, verified=True),
    )
    assert bootstrap_verified.status_code == 200
    assert (
        bootstrap_verified.json()["account"]["account_status"]
        == "active_onboarding_required"
    )

    profile_reject = client.post(
        "/v1/onboarding/profile",
        json={
            "birth_year": 1998,
            "gender": "female",
            "consents": {
                "sensitive_data_required": False,
                "personalization_optional": False,
                "model_improvement_optional": False,
                "marketing_optional": False,
            },
        },
        headers=_headers(uid=uid, email=email, verified=True),
    )
    assert profile_reject.status_code == 400

    save_profile = client.post(
        "/v1/onboarding/profile",
        json={
            "birth_year": 1998,
            "gender": "female",
            "consents": {
                "sensitive_data_required": True,
                "personalization_optional": True,
                "model_improvement_optional": False,
                "marketing_optional": False,
            },
        },
        headers=_headers(uid=uid, email=email, verified=True),
    )
    assert save_profile.status_code == 200
    save_profile_data = save_profile.json()
    assert save_profile_data["profile"]["birth_year"] == 1998
    assert save_profile_data["onboarding"]["onboarding_status"] == "baseline_pending"

    baseline = client.post(
        "/v1/onboarding/baseline-assessment/complete",
        json={"assessment_id": _complete_onboarding_assessment(client, uid=uid, email=email)},
        headers=_headers(uid=uid, email=email, verified=True),
    )
    assert baseline.status_code == 200
    baseline_data = baseline.json()

    assert baseline_data["account"]["account_status"] == "active"
    assert baseline_data["onboarding"]["onboarding_status"] == "complete"
    assert baseline_data["onboarding"]["baseline_assessment_completed"] is True
    assert baseline_data["onboarding"]["dashboard_bootstrapped"] is True
    assert baseline_data["onboarding"]["model_bootstrapped"] is True


def test_session_bootstrap_recovers_account_shell(tmp_path) -> None:
    db_path = tmp_path / "auth-recovery.sqlite3"

    os.environ["AUTH_DATABASE_PATH"] = str(db_path)
    os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = "127.0.0.1:9099"
    os.environ["AUTH_ALLOW_EMULATOR_UID_FALLBACK"] = "true"

    get_auth_settings.cache_clear()
    get_auth_store.cache_clear()
    get_core_input_store.cache_clear()

    client = TestClient(app)
    uid = "recover-firebase-uid-0001"
    email = "recover-user@example.com"

    bootstrap = client.post(
        "/v1/auth/session/bootstrap",
        json={"firebase_uid": uid},
        headers=_headers(uid=uid, email=email, verified=True),
    )

    assert bootstrap.status_code == 200
    data = bootstrap.json()
    assert data["account"]["firebase_uid"] == uid
    assert data["account"]["email"] == email
    assert data["account"]["account_status"] == "active_onboarding_required"
    assert data["consents"]["terms_required"] is True
    assert data["consents"]["privacy_required"] is True


def test_session_bootstrap_relinks_same_email_new_uid(tmp_path) -> None:
    db_path = tmp_path / "auth-relink.sqlite3"

    os.environ["AUTH_DATABASE_PATH"] = str(db_path)
    os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = "127.0.0.1:9099"
    os.environ["AUTH_ALLOW_EMULATOR_UID_FALLBACK"] = "true"

    get_auth_settings.cache_clear()
    get_auth_store.cache_clear()
    get_core_input_store.cache_clear()

    client = TestClient(app)
    old_uid = "relink-old-firebase-uid-0001"
    new_uid = "relink-new-firebase-uid-0002"
    email = "relink-user@example.com"

    signup = client.post(
        "/v1/auth/signup",
        json={
            "firebase_uid": old_uid,
            "email": email,
            "nickname": "relink-user",
            "terms_required": True,
            "privacy_required": True,
            "age_required": True,
        },
    )
    assert signup.status_code == 200

    bootstrap = client.post(
        "/v1/auth/session/bootstrap",
        json={"firebase_uid": new_uid},
        headers=_headers(uid=new_uid, email=email, verified=True),
    )
    assert bootstrap.status_code == 200
    data = bootstrap.json()
    assert data["account"]["firebase_uid"] == new_uid
    assert data["account"]["email"] == email


def test_baseline_requires_onboarding_assessment_source(tmp_path) -> None:
    db_path = tmp_path / "auth-baseline-source.sqlite3"

    os.environ["AUTH_DATABASE_PATH"] = str(db_path)
    os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = "127.0.0.1:9099"
    os.environ["AUTH_ALLOW_EMULATOR_UID_FALLBACK"] = "true"

    get_auth_settings.cache_clear()
    get_auth_store.cache_clear()
    get_core_input_store.cache_clear()

    client = TestClient(app)
    uid = "baseline-source-uid-0001"
    email = "baseline-source@example.com"

    signup = client.post(
        "/v1/auth/signup",
        json={
            "firebase_uid": uid,
            "email": email,
            "nickname": "baseline-source",
            "terms_required": True,
            "privacy_required": True,
            "age_required": True,
        },
    )
    assert signup.status_code == 200

    bootstrap_verified = client.post(
        "/v1/auth/session/bootstrap",
        json={"firebase_uid": uid},
        headers=_headers(uid=uid, email=email, verified=True),
    )
    assert bootstrap_verified.status_code == 200

    save_profile = client.post(
        "/v1/onboarding/profile",
        json={
            "birth_year": 1995,
            "gender": "female",
            "consents": {
                "sensitive_data_required": True,
                "personalization_optional": False,
                "model_improvement_optional": False,
                "marketing_optional": False,
            },
        },
        headers=_headers(uid=uid, email=email, verified=True),
    )
    assert save_profile.status_code == 200

    start_manual = client.post(
        "/v1/assessments/start",
        json={"source": "manual_start"},
        headers=_headers(uid=uid, email=email, verified=True),
    )
    assert start_manual.status_code == 200
    assessment_id = str(start_manual.json()["assessment_id"])

    complete_manual = client.post(
        f"/v1/assessments/{assessment_id}/complete",
        headers=_headers(uid=uid, email=email, verified=True),
    )
    assert complete_manual.status_code == 200

    baseline = client.post(
        "/v1/onboarding/baseline-assessment/complete",
        json={"assessment_id": assessment_id},
        headers=_headers(uid=uid, email=email, verified=True),
    )
    assert baseline.status_code == 400
    assert baseline.json()["detail"] == "assessment_source_invalid"
