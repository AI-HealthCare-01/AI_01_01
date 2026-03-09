from __future__ import annotations

import sqlite3
from datetime import UTC, date, datetime

from app.admin_console.models import ModelRetrainingJobCreateRequest
from app.admin_console.store import AdminConsoleStore
from app.auth.store import AuthStore
from app.core_inputs.models import (
    AlcoholBucket,
    CheckinPayload,
    CompletionMode,
    DaylightBucket,
    ExerciseBucket,
    SleepLatencyBucket,
    SleepTotalBucket,
)
from app.core_inputs.store import CoreInputStore


def _insert_assessment_row(
    conn: sqlite3.Connection,
    *,
    assessment_id: str,
    user_id: str,
    completed_at: str,
    phq9_total: int,
    gad7_total: int,
    isi_total: int,
) -> None:
    conn.execute(
        """
        INSERT INTO periodic_assessment (
          assessment_id,
          user_id,
          scheduled_for,
          started_at,
          completed_at,
          status,
          recommended_cycle_days,
          source,
          created_at
        ) VALUES (?, ?, ?, ?, ?, 'completed', 28, 'manual_start', ?)
        """,
        (
            assessment_id,
            user_id,
            completed_at[:10],
            completed_at,
            completed_at,
            completed_at,
        ),
    )
    conn.execute(
        """
        INSERT INTO assessment_score (
          assessment_id,
          phq9_total,
          gad7_total,
          isi_total,
          phq9_band,
          gad7_band,
          isi_band,
          phq9_item9_nonzero,
          computed_at
        ) VALUES (?, ?, ?, ?, 'seed', 'seed', 'seed', 0, ?)
        """,
        (assessment_id, phq9_total, gad7_total, isi_total, completed_at),
    )


def test_retraining_uses_assessment_target_and_prior_28d_activity_window(tmp_path) -> None:
    db_path = tmp_path / "admin-retraining-window.sqlite3"
    auth_store = AuthStore(db_path)
    core_store = CoreInputStore(db_path)
    admin_store = AdminConsoleStore(db_path)

    session = auth_store.create_or_get_signup_shell(
        firebase_uid="uid_retrain_window",
        email="window-user@example.com",
        nickname="window-user",
        terms_required=True,
        privacy_required=True,
        age_required=True,
    )
    user_id = session.account.user_id

    # 28일 입력 윈도우 안의 체크인 입력.
    core_store.save_checkin(
        user_id=user_id,
        payload=CheckinPayload(
            date=date(2026, 2, 10),
            sleep_total_bucket=SleepTotalBucket.h6_7,
            wake_time_local="07:30",
            sleep_latency_bucket=SleepLatencyBucket.m15_30,
            mood_1_5=3,
            anxiety_1_5=4,
            energy_1_5=2,
            daylight_bucket=DaylightBucket.m10_29,
            exercise_bucket=ExerciseBucket.m1_9,
            alcohol_bucket=AlcoholBucket.none,
            caffeine_after_2pm_flag=True,
            timezone="Asia/Seoul",
            completion_mode=CompletionMode.full,
        ),
        allow_edit=True,
    )
    core_store.save_checkin(
        user_id=user_id,
        payload=CheckinPayload(
            date=date(2026, 2, 19),
            sleep_total_bucket=SleepTotalBucket.h7_8,
            wake_time_local="07:00",
            sleep_latency_bucket=SleepLatencyBucket.le_15m,
            mood_1_5=4,
            anxiety_1_5=3,
            energy_1_5=4,
            daylight_bucket=DaylightBucket.ge_30,
            exercise_bucket=ExerciseBucket.m10_29,
            alcohol_bucket=AlcoholBucket.one,
            caffeine_after_2pm_flag=False,
            timezone="Asia/Seoul",
            completion_mode=CompletionMode.full,
        ),
        allow_edit=True,
    )

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        _insert_assessment_row(
            conn,
            assessment_id="asmt_01",
            user_id=user_id,
            completed_at=datetime(2026, 1, 10, 9, 0, tzinfo=UTC).isoformat(),
            phq9_total=12,
            gad7_total=10,
            isi_total=11,
        )
        _insert_assessment_row(
            conn,
            assessment_id="asmt_02",
            user_id=user_id,
            completed_at=datetime(2026, 2, 20, 9, 0, tzinfo=UTC).isoformat(),
            phq9_total=8,
            gad7_total=7,
            isi_total=9,
        )

        conn.execute(
            """
            INSERT INTO challenge_day_log (
              log_id,
              user_id,
              enrollment_id,
              challenge_id,
              date,
              completed_flag,
              day_status,
              helpfulness_0_10,
              effort_0_10,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, 1, 'done', 8, 7, ?, ?)
            """,
            (
                "chl_01",
                user_id,
                "enr_01",
                "CH_ACT_002",
                "2026-02-12",
                datetime(2026, 2, 12, 8, 0, tzinfo=UTC).isoformat(),
                datetime(2026, 2, 12, 8, 0, tzinfo=UTC).isoformat(),
            ),
        )
        conn.execute(
            """
            INSERT INTO challenge_day_log (
              log_id,
              user_id,
              enrollment_id,
              challenge_id,
              date,
              completed_flag,
              day_status,
              helpfulness_0_10,
              effort_0_10,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, 1, 'done', 9, 8, ?, ?)
            """,
            (
                "chl_02",
                user_id,
                "enr_01",
                "CH_ACT_002",
                "2026-02-18",
                datetime(2026, 2, 18, 8, 0, tzinfo=UTC).isoformat(),
                datetime(2026, 2, 18, 8, 0, tzinfo=UTC).isoformat(),
            ),
        )
        conn.execute(
            """
            INSERT INTO cbt_session_summary (
              session_id,
              user_id,
              date,
              summary_label
            ) VALUES (?, ?, ?, ?)
            """,
            ("cbt_01", user_id, "2026-02-15", "핵심 생각 정리"),
        )
        conn.commit()

    payload = ModelRetrainingJobCreateRequest(
        mode="dry_run",
        training_window_days=84,
        data_range_start_date=date(2026, 2, 20),
        data_range_end_date=date(2026, 2, 20),
        include_synthetic_data=True,
        require_min_account_age_days_28=False,
        require_second_assessment_completion=True,
        use_pre_assessment_window_28d=False,
        keep_user_after_eligibility=True,
        selected_feature_keys=[],
    )

    config = admin_store._resolve_retraining_rule_config(payload)  # noqa: SLF001
    assert int(config["assessment_window_days"]) == 28
    assert bool(config["input_window_locked_28d"]) is True

    with admin_store._connect() as conn:  # noqa: SLF001
        eligible_user_ids = admin_store._build_retraining_eligible_user_ids(conn, payload)  # noqa: SLF001
        assert user_id in eligible_user_ids

        rows = admin_store._load_retraining_assessment_rows(  # noqa: SLF001
            conn,
            payload,
            eligible_user_ids,
        )

    assert len(rows) == 1
    row = rows[0]
    assert row["assessment_id"] == "asmt_02"
    assert row["dep_target"] == 8.0
    assert row["anx_target"] == 7.0
    assert row["ins_target"] == 9.0
    assert row["checkin_days_window"] == 2
    assert row["challenge_done_days_window"] == 2
    assert row["cbt_sessions_window"] == 1
    assert row["caffeine_after_2pm_days_window"] == 1
    assert isinstance(row["avg_daylight_bucket_num"], float)
    assert isinstance(row["avg_exercise_bucket_num"], float)
