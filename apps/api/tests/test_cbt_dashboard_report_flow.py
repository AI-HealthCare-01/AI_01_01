from __future__ import annotations

import os
from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.auth.firebase import get_auth_settings
from app.auth.router import get_auth_store
from app.core_inputs.deps import get_core_input_store
from app.insights.deps import get_insights_store
from app.main import app


def _headers(uid: str, email: str, verified: bool = True) -> dict[str, str]:
    return {
        "x-firebase-uid": uid,
        "x-firebase-email": email,
        "x-firebase-email-verified": str(verified).lower(),
    }


def _save_checkin(
    client: TestClient,
    uid: str,
    email: str,
    target_date: date,
    mood: int,
    anxiety: int,
) -> None:
    response = client.post(
        "/checkin/today",
        headers=_headers(uid, email, verified=True),
        json={
            "date": target_date.isoformat(),
            "sleep_total_bucket": "h6_7",
            "wake_time_local": "07:20",
            "sleep_latency_bucket": "m15_30",
            "mood_1_5": mood,
            "anxiety_1_5": anxiety,
            "energy_1_5": 3,
            "daylight_bucket": "m10_29",
            "exercise_bucket": "m1_9",
            "alcohol_bucket": "none",
            "caffeine_after_2pm_flag": False,
            "timezone": "Asia/Seoul",
            "completion_mode": "full",
        },
    )
    assert response.status_code == 200


def test_cbt_dashboard_report_flow(tmp_path) -> None:
    db_path = tmp_path / "cbt-dashboard-report.sqlite3"

    os.environ["AUTH_DATABASE_PATH"] = str(db_path)
    os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = "127.0.0.1:9099"
    os.environ["AUTH_ALLOW_EMULATOR_UID_FALLBACK"] = "true"

    get_auth_settings.cache_clear()
    get_auth_store.cache_clear()
    get_core_input_store.cache_clear()
    get_insights_store.cache_clear()

    client = TestClient(app)
    uid = "insight-user-uid-0001"
    email = "insight-user@example.com"

    signup = client.post(
        "/v1/auth/signup",
        json={
            "firebase_uid": uid,
            "email": email,
            "nickname": "insight-user",
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

    today = date.today()
    yesterday = today - timedelta(days=1)
    start_date = today - timedelta(days=6)

    _save_checkin(client, uid, email, today, mood=3, anxiety=2)
    _save_checkin(client, uid, email, yesterday, mood=2, anxiety=4)

    assessment_start = client.post(
        "/v1/assessments/start",
        headers=_headers(uid, email, verified=True),
        json={"source": "manual_start"},
    )
    assert assessment_start.status_code == 200
    assessment_id = assessment_start.json()["assessment_id"]

    assessment_answer = client.post(
        f"/v1/assessments/{assessment_id}/answer",
        headers=_headers(uid, email, verified=True),
        json={"instrument": "phq9", "item_code": "PHQ9_1", "response_score": 1},
    )
    assert assessment_answer.status_code == 200

    assessment_complete = client.post(
        f"/v1/assessments/{assessment_id}/complete",
        headers=_headers(uid, email, verified=True),
    )
    assert assessment_complete.status_code == 200

    enrollment = client.post(
        "/challenge/enrollments",
        headers=_headers(uid, email, verified=True),
        json={"challenge_id": "CH_ACT_001"},
    )
    assert enrollment.status_code == 200
    enrollment_id = enrollment.json()["enrollment_id"]

    challenge_log = client.post(
        "/challenge/day-log",
        headers=_headers(uid, email, verified=True),
        json={
            "enrollment_id": enrollment_id,
            "date": today.isoformat(),
            "completed_flag": True,
            "helpfulness_score_1_5": 4,
        },
    )
    assert challenge_log.status_code == 200

    cbt_session = client.post(
        "/v1/cbt/sessions",
        headers=_headers(uid, email, verified=True),
        json={
            "date": today.isoformat(),
            "duration_sec": 900,
            "emotion_intensity_pre_0_100": 74,
            "emotion_intensity_post_0_100": 52,
            "belief_pre_0_100": 80,
            "belief_post_0_100": 62,
            "reframe_quality_0_5": 3,
            "homework_commitment_0_10": 7,
            "homework_completed_prev_flag": True,
            "session_helpfulness_0_10": 8,
            "planner_action": "review_evidence",
            "state": {
                "situation": "업무 중 불안이 크게 올라왔다.",
                "automatic_thoughts": ["나는 또 실패할 거야"],
                "emotions": [{"name": "불안", "intensity": 80}],
                "behaviors": ["회피"],
                "evidence_for": ["최근 실수를 떠올림"],
                "evidence_against": ["과거에 해결한 경험이 있음"],
                "distortion_candidates": ["catastrophizing"],
                "intermediate_belief_hypotheses": [
                    {"text": "나는 실수하면 안 돼", "confidence": 0.4}
                ],
                "core_belief_hypotheses": [
                    {"text": "나는 부족하다", "confidence": 0.3, "expose_to_user": False}
                ],
                "risk_flags": {
                    "functional_impairment_flag": False,
                    "self_harm_flag": False,
                    "suicide_risk_level": 1,
                    "violence_risk_flag": False,
                },
            },
        },
    )
    assert cbt_session.status_code == 200
    cbt_session_json = cbt_session.json()
    assert cbt_session_json["summary"]["distortion_total_count"] == 1
    assert (
        cbt_session_json["structured_output"]["situation"]
        == "업무 중 불안이 크게 올라왔다."
    )

    cbt_turn = client.post(
        "/v1/cbt/conversation/turn",
        headers=_headers(uid, email, verified=True),
        json={
            "messages": [
                {"role": "assistant", "content": "오늘 어떤 점이 가장 부담스러웠나요?"},
                {"role": "user", "content": "회의 전에 긴장이 너무 올라와요."},
            ],
            "state": {},
        },
    )
    assert cbt_turn.status_code == 200
    turn_json = cbt_turn.json()
    assert turn_json["assistant_message"]
    assert "structured_state_draft" in turn_json

    cbt_session_from_conversation = client.post(
        "/v1/cbt/sessions",
        headers=_headers(uid, email, verified=True),
        json={
            "date": today.isoformat(),
            "conversation": [
                {"role": "assistant", "content": "오늘 어떤 점이 가장 부담스러웠나요?"},
                {"role": "user", "content": "회의 전에 긴장이 너무 올라와요."},
                {"role": "assistant", "content": turn_json["assistant_message"]},
                {"role": "user", "content": "자동으로 실패할 거라는 생각이 반복됩니다."},
            ],
        },
    )
    assert cbt_session_from_conversation.status_code == 200
    assert cbt_session_from_conversation.json()["structured_output"]["automatic_thoughts"] is not None

    cbt_session_without_todo = client.post(
        "/v1/cbt/sessions",
        headers=_headers(uid, email, verified=True),
        json={
            "date": today.isoformat(),
            "state": {
                "situation": "퇴근 후에도 머리가 복잡했다.",
                "automatic_thoughts": ["내가 다 망치고 있다"],
                "emotions": [{"name": "불안", "intensity": 74}],
                "behaviors": [],
                "balanced_statement": "",
                "evidence_for": [],
                "evidence_against": [],
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
            "selected_action_kind": "none",
            "selected_action_title": "정하지 않음",
        },
    )
    assert cbt_session_without_todo.status_code == 200
    no_todo_session_id = cbt_session_without_todo.json()["session_id"]

    todo_upsert = client.post(
        f"/v1/cbt/sessions/{no_todo_session_id}/todo",
        headers=_headers(uid, email, verified=True),
        json={
            "title": "오늘 8시에 10분 산책하기",
            "description": "집 앞 공원을 한 바퀴 걷기",
            "kind": "external",
            "route": None,
        },
    )
    assert todo_upsert.status_code == 200
    todo_upsert_json = todo_upsert.json()
    assert todo_upsert_json["summary"]["selected_action_kind"] == "external"
    assert todo_upsert_json["summary"]["selected_action_title"] == "오늘 8시에 10분 산책하기"
    assert todo_upsert_json["summary"]["reflection_status"] == "pending"

    session_id = cbt_session_json["session_id"]
    cbt_summary = client.get(
        f"/v1/cbt/sessions/{session_id}/summary",
        headers=_headers(uid, email, verified=True),
    )
    assert cbt_summary.status_code == 200

    symptom_7d = client.get(
        "/v1/dashboard/symptom",
        headers=_headers(uid, email, verified=True),
        params={"mode": "7d"},
    )
    assert symptom_7d.status_code == 200
    symptom_7d_json = symptom_7d.json()
    assert symptom_7d_json["mode"] == "7d"
    assert len(symptom_7d_json["series"]) == 3

    symptom_4w = client.get(
        "/v1/dashboard/symptom",
        headers=_headers(uid, email, verified=True),
        params={"mode": "4w_weekly_avg"},
    )
    assert symptom_4w.status_code == 200
    assert symptom_4w.json()["mode"] == "4w_weekly_avg"

    activity = client.get(
        "/v1/dashboard/activity",
        headers=_headers(uid, email, verified=True),
    )
    assert activity.status_code == 200
    activity_json = activity.json()
    assert activity_json["summary_cards"]["checkin_days_7d"] >= 1
    assert activity_json["summary_cards"]["cbt_sessions_7d"] >= 1

    report = client.get(
        "/v1/report/summary",
        headers=_headers(uid, email, verified=True),
        params={
            "start_date": start_date.isoformat(),
            "end_date": today.isoformat(),
            "include_sensitive": "true",
        },
    )
    assert report.status_code == 200
    report_json = report.json()
    assert report_json["period"]["start_date"] == start_date.isoformat()
    assert "risk_summary" in report_json["computed"]

    report_without_sensitive = client.get(
        "/v1/report/summary",
        headers=_headers(uid, email, verified=True),
        params={
            "start_date": start_date.isoformat(),
            "end_date": today.isoformat(),
            "include_sensitive": "false",
        },
    )
    assert report_without_sensitive.status_code == 200
    assert report_without_sensitive.json()["computed"]["risk_summary"]["events"] == []

    export_pdf = client.post(
        "/v1/report/summary/export",
        headers=_headers(uid, email, verified=True),
        json={
            "start_date": start_date.isoformat(),
            "end_date": today.isoformat(),
            "format": "pdf",
            "include_sensitive": True,
        },
    )
    assert export_pdf.status_code == 200
    assert export_pdf.headers["content-type"].startswith("application/pdf")
    assert len(export_pdf.content) > 100

    export_png = client.post(
        "/v1/report/summary/export",
        headers=_headers(uid, email, verified=True),
        json={
            "start_date": start_date.isoformat(),
            "end_date": today.isoformat(),
            "format": "png",
            "include_sensitive": False,
        },
    )
    assert export_png.status_code == 200
    assert export_png.headers["content-type"].startswith("image/png")
    assert export_png.content[:8] == b"\x89PNG\r\n\x1a\n"
