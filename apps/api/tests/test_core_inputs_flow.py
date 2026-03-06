from __future__ import annotations

import os
from datetime import date

from fastapi.testclient import TestClient

from app.auth.firebase import get_auth_settings
from app.auth.router import get_auth_store
from app.core_inputs.deps import get_core_input_store
from app.main import app


def _headers(uid: str, email: str, verified: bool = True) -> dict[str, str]:
    return {
        "x-firebase-uid": uid,
        "x-firebase-email": email,
        "x-firebase-email-verified": str(verified).lower(),
    }


def test_core_inputs_and_activity_log_summary(tmp_path) -> None:
    db_path = tmp_path / "core-inputs.sqlite3"

    os.environ["AUTH_DATABASE_PATH"] = str(db_path)
    os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = "127.0.0.1:9099"
    os.environ["AUTH_ALLOW_EMULATOR_UID_FALLBACK"] = "true"

    get_auth_settings.cache_clear()
    get_auth_store.cache_clear()
    get_core_input_store.cache_clear()

    client = TestClient(app)
    uid = "core-user-uid-0001"
    email = "core-user@example.com"

    signup = client.post(
        "/v1/auth/signup",
        json={
            "firebase_uid": uid,
            "email": email,
            "nickname": "core-user",
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

    today = date.today().isoformat()

    checkin = client.post(
        "/checkin/today",
        headers=_headers(uid, email, verified=True),
        json={
            "date": today,
            "sleep_total_bucket": "h6_7",
            "wake_time_local": "07:30",
            "sleep_latency_bucket": "m15_30",
            "mood_1_5": 3,
            "anxiety_1_5": 2,
            "energy_1_5": 3,
            "daylight_bucket": "m10_29",
            "exercise_bucket": "m1_9",
            "alcohol_bucket": "none",
            "caffeine_after_2pm_flag": False,
            "timezone": "Asia/Seoul",
            "completion_mode": "full",
        },
    )
    assert checkin.status_code == 200

    checkin_edit = client.post(
        "/checkin/today/edit",
        headers=_headers(uid, email, verified=True),
        json={
            "date": today,
            "sleep_total_bucket": "h7_8",
            "wake_time_local": "07:10",
            "sleep_latency_bucket": "m15_30",
            "mood_1_5": 4,
            "anxiety_1_5": 2,
            "energy_1_5": 4,
            "daylight_bucket": "m10_29",
            "exercise_bucket": "m10_29",
            "alcohol_bucket": "none",
            "caffeine_after_2pm_flag": False,
            "timezone": "Asia/Seoul",
            "completion_mode": "full",
        },
    )
    assert checkin_edit.status_code == 200
    assert checkin_edit.json()["current_version_no"] == 2

    assessment_start = client.post(
        "/v1/assessments/start",
        headers=_headers(uid, email, verified=True),
        json={"source": "manual_start"},
    )
    assert assessment_start.status_code == 200
    assessment_id = assessment_start.json()["assessment_id"]

    answer_1 = client.post(
        f"/v1/assessments/{assessment_id}/answer",
        headers=_headers(uid, email, verified=True),
        json={"instrument": "phq9", "item_code": "PHQ9_1", "response_score": 1},
    )
    assert answer_1.status_code == 200

    answer_9 = client.post(
        f"/v1/assessments/{assessment_id}/answer",
        headers=_headers(uid, email, verified=True),
        json={"instrument": "phq9", "item_code": "PHQ9_9", "response_score": 1},
    )
    assert answer_9.status_code == 200

    assessment_complete = client.post(
        f"/v1/assessments/{assessment_id}/complete",
        headers=_headers(uid, email, verified=True),
    )
    assert assessment_complete.status_code == 200

    enroll = client.post(
        "/challenge/enrollments",
        headers=_headers(uid, email, verified=True),
        json={"challenge_id": "CH_REG_001"},
    )
    assert enroll.status_code == 200
    enrollment_id = enroll.json()["enrollment_id"]

    challenge_day = client.post(
        "/challenge/day-log",
        headers=_headers(uid, email, verified=True),
        json={
            "enrollment_id": enrollment_id,
            "date": today,
            "completed_flag": True,
            "helpfulness_score_1_5": 4,
        },
    )
    assert challenge_day.status_code == 200

    challenge_drop = client.patch(
        f"/challenge/enrollments/{enrollment_id}",
        headers=_headers(uid, email, verified=True),
        json={"status": "dropped"},
    )
    assert challenge_drop.status_code == 200
    assert challenge_drop.json()["status"] == "dropped"

    journal_create = client.post(
        "/v1/journal",
        headers=_headers(uid, email, verified=True),
        json={
            "entry_date": today,
            "title": "",
            "body": "오늘은 불안이 있었지만 산책으로 회복했다. 본문 전체는 활동로그에 노출되면 안 된다.",
        },
    )
    assert journal_create.status_code == 200
    journal_id = journal_create.json()["journal_id"]

    journal_patch = client.patch(
        f"/v1/journal/{journal_id}",
        headers=_headers(uid, email, verified=True),
        json={
            "title": "수정된 일기 제목",
            "body": "수정 본문",
        },
    )
    assert journal_patch.status_code == 200
    assert journal_patch.json()["title"] == "수정된 일기 제목"

    activity_log = client.get(
        "/v1/mypage/activity-log",
        headers=_headers(uid, email, verified=True),
        params={
            "start_date": today,
            "end_date": today,
            "filter": "all",
            "view": "list",
        },
    )
    assert activity_log.status_code == 200
    logs = activity_log.json()
    assert len(logs) == 1

    day_summary = logs[0]["summary"]
    assert day_summary["has_checkin"] is True
    assert day_summary["has_challenge_activity"] is True
    assert day_summary["has_journal_entry"] is True
    assert day_summary["has_assessment"] is True

    journal_items = [item for item in logs[0]["items"] if item["activity_type"] == "journal"]
    assert len(journal_items) == 1
    assert "본문 전체" not in (journal_items[0]["preview_text"] or "")

    journal_delete = client.delete(
        f"/v1/journal/{journal_id}",
        headers=_headers(uid, email, verified=True),
    )
    assert journal_delete.status_code == 200

    activity_log_after_delete = client.get(
        "/v1/mypage/activity-log",
        headers=_headers(uid, email, verified=True),
        params={
            "start_date": today,
            "end_date": today,
            "filter": "journal",
            "view": "list",
        },
    )
    assert activity_log_after_delete.status_code == 200
    assert activity_log_after_delete.json() == []


def test_challenge_program_flow_status_and_day_states(tmp_path) -> None:
    db_path = tmp_path / "challenge-program.sqlite3"

    os.environ["AUTH_DATABASE_PATH"] = str(db_path)
    os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = "127.0.0.1:9099"
    os.environ["AUTH_ALLOW_EMULATOR_UID_FALLBACK"] = "true"

    get_auth_settings.cache_clear()
    get_auth_store.cache_clear()
    get_core_input_store.cache_clear()

    client = TestClient(app)
    uid = "challenge-program-uid-0001"
    email = "challenge-program@example.com"

    signup = client.post(
        "/v1/auth/signup",
        json={
            "firebase_uid": uid,
            "email": email,
            "nickname": "challenge-user",
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

    today = date.today().isoformat()

    create_enrollment = client.post(
        "/challenge/enrollments",
        headers=_headers(uid, email, verified=True),
        json={
            "challenge_id": "CH_ACT_002",
            "start_date": today,
            "target_days": 3,
            "reminder_time_local": "08:30",
            "motivation_note": "아침에 햇빛 루틴을 만들고 싶습니다.",
        },
    )
    assert create_enrollment.status_code == 200
    enrollment = create_enrollment.json()
    enrollment_id = enrollment["enrollment_id"]
    assert enrollment["status"] == "active"
    assert enrollment["target_days"] == 3

    execute_day = client.post(
        f"/challenge/enrollments/{enrollment_id}/execute-day",
        headers=_headers(uid, email, verified=True),
        json={
            "date": today,
            "pre_mood_1_5": 3,
            "pre_anxiety_1_5": 4,
            "day_status": "pending",
        },
    )
    assert execute_day.status_code == 200
    assert execute_day.json()["day_status"] == "pending"

    reflection = client.post(
        f"/challenge/enrollments/{enrollment_id}/reflection",
        headers=_headers(uid, email, verified=True),
        json={
            "date": today,
            "result_status": "done",
            "post_mood_1_5": 4,
            "post_anxiety_1_5": 2,
            "helpfulness_0_10": 8,
            "effort_0_10": 7,
            "reflection_note": "짧게라도 햇빛을 보니 확실히 도움이 됐습니다.",
        },
    )
    assert reflection.status_code == 200
    assert reflection.json()["day_status"] in {"done", "late"}

    pause = client.patch(
        f"/challenge/enrollments/{enrollment_id}",
        headers=_headers(uid, email, verified=True),
        json={"status": "paused"},
    )
    assert pause.status_code == 200
    assert pause.json()["status"] == "paused"

    resume = client.patch(
        f"/challenge/enrollments/{enrollment_id}",
        headers=_headers(uid, email, verified=True),
        json={"status": "active"},
    )
    assert resume.status_code == 200
    assert resume.json()["status"] == "active"

    detail = client.get(
        f"/challenge/enrollments/{enrollment_id}",
        headers=_headers(uid, email, verified=True),
    )
    assert detail.status_code == 200
    detail_json = detail.json()
    assert detail_json["enrollment"]["session_status"] == "active"
    assert detail_json["progress_days"][0]["day_status"] in {"done", "late"}

    catalog_detail = client.get(
        "/challenge/catalog/CH_ACT_002",
        headers=_headers(uid, email, verified=True),
    )
    assert catalog_detail.status_code == 200
    assert catalog_detail.json()["challenge"]["name_ko"] == "햇빛 10분"

    list_active = client.get(
        "/challenge/enrollments",
        headers=_headers(uid, email, verified=True),
        params={"session_status": "active"},
    )
    assert list_active.status_code == 200
    assert len(list_active.json()) == 1

    complete = client.post(
        f"/challenge/enrollments/{enrollment_id}/complete",
        headers=_headers(uid, email, verified=True),
    )
    assert complete.status_code == 200
    assert complete.json()["status"] == "completed"
