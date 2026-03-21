from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from .models import (
    ActivityFilter,
    ActivityView,
    AssessmentAnswerRequest,
    AssessmentSessionResponse,
    AssessmentStartRequest,
    AssessmentStatus,
    ChallengeCatalogItem,
    ChallengeCatalogDetailResponse,
    ChallengeDayExecuteRequest,
    ChallengeDayLogRequest,
    ChallengeDayLogResponse,
    ChallengeDayStatus,
    ChallengeEnrollmentCreateRequest,
    ChallengeEnrollmentDetailResponse,
    ChallengeEnrollmentResponse,
    ChallengeEnrollmentUpdateRequest,
    ChallengeProgramType,
    ChallengeRecommendationItem,
    ChallengeReflectionRequest,
    ChallengeSessionStatus,
    ChallengeStatus,
    ChallengeType,
    CheckinFeatureBundleResponse,
    CheckinPayload,
    CheckinRecordResponse,
    CheckinStatus,
    JournalCreateRequest,
    JournalCategoryOptionsResponse,
    JournalEntryResponse,
    JournalListItemResponse,
    JournalStatus,
    JournalUpdateRequest,
    SleepTotalBucket,
    UserDayActivityItem,
    UserDayActivityLogResponse,
    UserDayActivitySummary,
)

INSTRUMENT_ITEMS: dict[str, tuple[list[str], int]] = {
    "phq9": ([f"PHQ9_{index}" for index in range(1, 10)], 3),
    "gad7": ([f"GAD7_{index}" for index in range(1, 8)], 3),
    "isi": ([f"ISI_{index}" for index in range(1, 8)], 4),
}

CHALLENGE_CATALOG_SEED = [
    {
        "challenge_id": "CH_SLEEP_001",
        "name_ko": "수면 패턴 만들기",
        "status": "core",
        "domain": "sleep",
        "challenge_type": "sustained",
        "program_type": "bundle_weekly",
        "default_target_days": 7,
        "difficulty_level": "medium",
        "summary_ko": "기상시간과 밤 루틴을 일정하게 맞추는 수면 루틴",
    },
    {
        "challenge_id": "CH_ACT_001",
        "name_ko": "모닝 패턴 만들기",
        "status": "core",
        "domain": "activation",
        "challenge_type": "sustained",
        "program_type": "step_up",
        "default_target_days": 5,
        "difficulty_level": "easy",
        "summary_ko": "기상 직후 작은 루틴으로 하루를 안정적으로 시작",
    },
    {
        "challenge_id": "CH_ACT_002",
        "name_ko": "햇빛 10분",
        "status": "core",
        "domain": "activation",
        "challenge_type": "sustained",
        "program_type": "streak",
        "default_target_days": 2,
        "difficulty_level": "easy",
        "summary_ko": "하루 10분, 자연광으로 기분을 바꿔보세요",
    },
    {
        "challenge_id": "CH_ACT_003",
        "name_ko": "산책 10분",
        "status": "core",
        "domain": "activation",
        "challenge_type": "sustained",
        "program_type": "streak",
        "default_target_days": 3,
        "difficulty_level": "easy",
        "summary_ko": "실외 10분 이상",
    },
    {
        "challenge_id": "CH_ACT_005",
        "name_ko": "5분 명상",
        "status": "core",
        "domain": "regulation",
        "challenge_type": "sustained",
        "program_type": "streak",
        "default_target_days": 7,
        "difficulty_level": "medium",
        "summary_ko": "하루 5분, 조용히 앉아 호흡에 집중해보세요",
    },
    {
        "challenge_id": "water-intake",
        "name_ko": "내 물고기를 살려줘",
        "status": "core",
        "domain": "activation",
        "challenge_type": "sustained",
        "program_type": "streak",
        "default_target_days": 7,
        "difficulty_level": "easy",
        "summary_ko": "물 한 잔마다 물고기가 살아나요 🐠",
    },
    {
        "challenge_id": "CH_REG_002",
        "name_ko": "감각 탐험 5-4-3-2-1",
        "status": "core",
        "domain": "regulation",
        "challenge_type": "one_time",
        "program_type": "guided_reflection",
        "default_target_days": 1,
        "difficulty_level": "easy",
        "summary_ko": "지금 이 순간, 5가지 감각으로 현실에 닻을 내려요",
    },
    {
        "challenge_id": "CH_SOC_001",
        "name_ko": "대인관계 지도",
        "status": "core",
        "domain": "social",
        "challenge_type": "one_time",
        "program_type": "one_time",
        "default_target_days": 2,
        "difficulty_level": "medium",
        "summary_ko": "내 주변 관계를 정리하고 핵심 지지자를 찾아보세요",
    },
    {
        "challenge_id": "CH_WELL_001",
        "name_ko": "자신감 리스트",
        "status": "core",
        "domain": "wellbeing",
        "challenge_type": "one_time",
        "program_type": "guided_reflection",
        "default_target_days": 2,
        "difficulty_level": "easy",
        "summary_ko": "내 강점과 성취를 기록하며 자기 효능감을 키워보세요",
    },
]

CHALLENGE_REASON_BY_ID: dict[str, tuple[str, str]] = {
    "CH_SLEEP_001": ("ins_high_wake_irregular", "최근 수면 리듬이 흔들려 있어, 패턴 안정화 루틴이 도움이 될 수 있습니다."),
    "CH_ACT_001": ("dep_low_energy", "아침 에너지 저하가 관찰되어, 작은 모닝 루틴부터 시작해 보세요."),
    "CH_ACT_002": ("dep_low_daylight", "햇빛 노출이 부족해 보여, 10분 햇빛 루틴을 추천합니다."),
    "CH_ACT_003": ("dep_low_activity", "최근 활동량이 낮아, 짧은 산책 루틴으로 부담 없이 시작할 수 있습니다."),
    "CH_ACT_005": ("anx_high_anxiety", "하루 5분 명상으로 호흡에 집중하며 긴장을 낮춰보세요."),
    "water-intake": ("low_hydration", "수분 섭취가 부족해 보여요. 물고기 챌린지로 물 습관을 만들어보세요."),
    "CH_REG_002": ("acute_anxiety_spike", "불안이 급격히 올라온 날에는 감각 안정 루틴이 도움이 될 수 있습니다."),
    "CH_SOC_001": ("low_social_contact", "최근 지지 연결이 적어, 지지자를 떠올리고 연결 계획을 세워보세요."),
    "CH_WELL_001": ("low_self_confidence", "자기평가가 낮을 때, 해낸 경험을 정리하는 자신감 리스트가 도움이 될 수 있습니다."),
}

CHALLENGE_TEMPLATE_STEPS: dict[str, list[str]] = {
    "CH_SLEEP_001": ["기상시간 고정하기", "늦은 카페인 줄이기", "취침 전 루틴 기록하기"],
    "CH_ACT_001": ["기상 후 첫 행동 정하기", "아침 루틴 체크", "일주일 패턴 확인"],
    "CH_ACT_002": [
        "S1: 컨디션 & 날씨 확인",
        "S2: 햇빛 타이머",
        "S3: 오늘의 햇빛 후기",
    ],
    "CH_ACT_003": ["실외 산책 10분 이상"],
    "CH_ACT_005": ["조용한 공간 찾기", "눈 감고 호흡 집중", "5분간 유지하기"],
    "water-intake": [
        "S1: 오늘의 목표 설정",
        "S2: 물 마시기 기록",
        "S3: 하루 마무리",
    ],
    "CH_REG_002": [
        "S1: 👀 보이는 것 5가지",
        "S2: 🤲 만져지는 것 4가지",
        "S3: 👂 들리는 것 3가지",
        "S4: 👃 맡아지는 것 2가지",
        "S5: 👅 느껴지는 것 1가지",
        "S6: 🌟 감각 지도 완성",
    ],
    "CH_SOC_001": [
        "S1: 현재 상태 체크",
        "S2: 주변 사람 떠올리기",
        "S3: 관계 영역 배치",
        "S4: 핵심 관계 선택",
        "S5: 관계 심화 기록 1",
        "S6: 관계 심화 기록 2",
        "S7: 현재 초점 선택",
        "S8: 다음 행동 설정",
        "S9: 사후 체크 및 완료",
    ],
    "CH_WELL_001": [
        "S1: 최근 잘한 일 떠올리기",
        "S2: 강점 발견",
        "S3: 나만의 강점 카드",
        "S4: 앞으로의 한 걸음",
    ],
}

DEFAULT_ONE_LINE_JOURNAL_CATEGORY_TAGS: list[str] = [
    "감사한 일",
    "아쉬운 일",
    "속상한 일",
    "화나는 일",
    "기쁜 일",
    "후회되는 일",
]


class CoreInputStore:
    def __init__(self, database_path: Path):
        self.database_path = database_path
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(UTC).isoformat()

    def _initialize_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS daily_checkin (
                  user_id TEXT NOT NULL,
                  date TEXT NOT NULL,
                  timezone TEXT NOT NULL,
                  checked_at TEXT NOT NULL,
                  status TEXT NOT NULL,
                  current_version_id TEXT NOT NULL,
                  current_version_no INTEGER NOT NULL,
                  PRIMARY KEY (user_id, date)
                );

                CREATE TABLE IF NOT EXISTS daily_checkin_version (
                  checkin_version_id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL,
                  date TEXT NOT NULL,
                  version_no INTEGER NOT NULL,
                  payload_json TEXT NOT NULL,
                  completion_mode TEXT NOT NULL,
                  submitted_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS daily_checkin_features_daily (
                  user_id TEXT NOT NULL,
                  date TEXT NOT NULL,
                  mood_1_5 INTEGER,
                  anxiety_1_5 INTEGER,
                  energy_1_5 INTEGER,
                  sleep_total_midpoint_hours REAL,
                  sleep_latency_midpoint_minutes REAL,
                  days_since_prev_checkin INTEGER,
                  missing_checkin_days_7d INTEGER NOT NULL,
                  missing_checkin_days_28d INTEGER NOT NULL,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  PRIMARY KEY (user_id, date)
                );

                CREATE TABLE IF NOT EXISTS daily_checkin_event_log (
                  event_id TEXT PRIMARY KEY,
                  event_name TEXT NOT NULL,
                  user_id TEXT NOT NULL,
                  date TEXT NOT NULL,
                  payload_json TEXT,
                  created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS periodic_assessment (
                  assessment_id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL,
                  scheduled_for TEXT,
                  started_at TEXT NOT NULL,
                  completed_at TEXT,
                  status TEXT NOT NULL,
                  recommended_cycle_days INTEGER NOT NULL DEFAULT 28,
                  source TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS assessment_item_response (
                  assessment_id TEXT NOT NULL,
                  instrument TEXT NOT NULL,
                  item_code TEXT NOT NULL,
                  display_order INTEGER NOT NULL,
                  response_score INTEGER NOT NULL,
                  response_label TEXT,
                  answered_at TEXT NOT NULL,
                  PRIMARY KEY (assessment_id, instrument, item_code)
                );

                CREATE TABLE IF NOT EXISTS assessment_score (
                  assessment_id TEXT PRIMARY KEY,
                  phq9_total INTEGER,
                  gad7_total INTEGER,
                  isi_total INTEGER,
                  phq9_band TEXT,
                  gad7_band TEXT,
                  isi_band TEXT,
                  phq9_item9_nonzero INTEGER DEFAULT 0,
                  computed_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS challenge_catalog (
                  challenge_id TEXT PRIMARY KEY,
                  name_ko TEXT NOT NULL,
                  status TEXT NOT NULL,
                  domain TEXT NOT NULL,
                  challenge_type TEXT NOT NULL,
                  program_type TEXT NOT NULL DEFAULT 'streak',
                  default_target_days INTEGER NOT NULL,
                  difficulty_level TEXT NOT NULL,
                  summary_ko TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS challenge_exposure (
                  exposure_id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL,
                  challenge_id TEXT NOT NULL,
                  date TEXT NOT NULL,
                  exposure_type TEXT NOT NULL,
                  response_type TEXT,
                  reason_text TEXT,
                  created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS challenge_enrollment (
                  enrollment_id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL,
                  challenge_id TEXT NOT NULL,
                  status TEXT NOT NULL,
                  target_days INTEGER NOT NULL DEFAULT 1,
                  scheduled_start_date TEXT,
                  scheduled_end_date TEXT,
                  reminder_time_local TEXT,
                  motivation_note TEXT,
                  assigned_by TEXT NOT NULL DEFAULT 'user',
                  started_at TEXT NOT NULL,
                  paused_at TEXT,
                  ended_at TEXT
                );

                CREATE TABLE IF NOT EXISTS challenge_day_log (
                  log_id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL,
                  enrollment_id TEXT NOT NULL,
                  challenge_id TEXT NOT NULL,
                  date TEXT NOT NULL,
                  completed_flag INTEGER NOT NULL,
                  helpfulness_score_1_5 INTEGER,
                  day_status TEXT NOT NULL DEFAULT 'pending',
                  pre_mood_1_5 INTEGER,
                  pre_anxiety_1_5 INTEGER,
                  post_mood_1_5 INTEGER,
                  post_anxiety_1_5 INTEGER,
                  helpfulness_0_10 INTEGER,
                  effort_0_10 INTEGER,
                  reflection_note TEXT,
                  skipped_reason_code TEXT,
                  dropout_reason_code TEXT,
                  executed_at TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  UNIQUE (user_id, enrollment_id, date)
                );

                CREATE TABLE IF NOT EXISTS journal_entry (
                  journal_id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL,
                  entry_date TEXT NOT NULL,
                  title TEXT,
                  category_tags_json TEXT NOT NULL DEFAULT '[]',
                  body TEXT NOT NULL,
                  preview_text TEXT NOT NULL,
                  status TEXT NOT NULL DEFAULT 'active',
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS cbt_session_summary (
                  session_id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL,
                  date TEXT NOT NULL,
                  summary_label TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS user_day_activity_log (
                  user_id TEXT NOT NULL,
                  date TEXT NOT NULL,
                  has_checkin INTEGER NOT NULL DEFAULT 0,
                  has_challenge_activity INTEGER NOT NULL DEFAULT 0,
                  challenge_completed_count INTEGER NOT NULL DEFAULT 0,
                  active_challenge_count INTEGER NOT NULL DEFAULT 0,
                  has_cbt_activity INTEGER NOT NULL DEFAULT 0,
                  cbt_session_count INTEGER NOT NULL DEFAULT 0,
                  has_journal_entry INTEGER NOT NULL DEFAULT 0,
                  journal_entry_count INTEGER NOT NULL DEFAULT 0,
                  has_assessment INTEGER NOT NULL DEFAULT 0,
                  activity_count_total INTEGER NOT NULL DEFAULT 0,
                  PRIMARY KEY (user_id, date)
                );

                CREATE TABLE IF NOT EXISTS user_day_activity_log_item (
                  user_id TEXT NOT NULL,
                  date TEXT NOT NULL,
                  activity_type TEXT NOT NULL,
                  source_id TEXT,
                  display_label TEXT NOT NULL,
                  preview_text TEXT,
                  count_value INTEGER,
                  detail_route TEXT NOT NULL,
                  PRIMARY KEY (user_id, date, activity_type, detail_route)
                );

                CREATE INDEX IF NOT EXISTS idx_checkin_version_user_date
                ON daily_checkin_version(user_id, date, version_no DESC);

                CREATE INDEX IF NOT EXISTS idx_assessment_user_started
                ON periodic_assessment(user_id, started_at DESC);

                CREATE INDEX IF NOT EXISTS idx_challenge_day_log_user_date
                ON challenge_day_log(user_id, date DESC);

                CREATE INDEX IF NOT EXISTS idx_challenge_enrollment_user_status
                ON challenge_enrollment(user_id, status, started_at DESC);

                CREATE INDEX IF NOT EXISTS idx_journal_user_date
                ON journal_entry(user_id, entry_date DESC);
                """
            )
            self._ensure_challenge_schema(conn)
            self._ensure_journal_schema(conn)
            self._seed_challenge_catalog(conn)
            conn.commit()

    @staticmethod
    def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            (table_name,),
        ).fetchone()
        return row is not None

    @staticmethod
    def _table_has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
        rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
        return any(str(row["name"]) == column for row in rows)

    @classmethod
    def _ensure_column(cls, conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
        if cls._table_has_column(conn, table, column):
            return
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    @classmethod
    def _ensure_challenge_schema(cls, conn: sqlite3.Connection) -> None:
        cls._ensure_column(conn, "challenge_catalog", "program_type", "TEXT NOT NULL DEFAULT 'streak'")

        cls._ensure_column(conn, "challenge_enrollment", "target_days", "INTEGER NOT NULL DEFAULT 1")
        cls._ensure_column(conn, "challenge_enrollment", "scheduled_start_date", "TEXT")
        cls._ensure_column(conn, "challenge_enrollment", "scheduled_end_date", "TEXT")
        cls._ensure_column(conn, "challenge_enrollment", "reminder_time_local", "TEXT")
        cls._ensure_column(conn, "challenge_enrollment", "motivation_note", "TEXT")
        cls._ensure_column(conn, "challenge_enrollment", "assigned_by", "TEXT NOT NULL DEFAULT 'user'")
        cls._ensure_column(conn, "challenge_enrollment", "paused_at", "TEXT")

        cls._ensure_column(conn, "challenge_day_log", "day_status", "TEXT NOT NULL DEFAULT 'pending'")
        cls._ensure_column(conn, "challenge_day_log", "pre_mood_1_5", "INTEGER")
        cls._ensure_column(conn, "challenge_day_log", "pre_anxiety_1_5", "INTEGER")
        cls._ensure_column(conn, "challenge_day_log", "post_mood_1_5", "INTEGER")
        cls._ensure_column(conn, "challenge_day_log", "post_anxiety_1_5", "INTEGER")
        cls._ensure_column(conn, "challenge_day_log", "helpfulness_0_10", "INTEGER")
        cls._ensure_column(conn, "challenge_day_log", "effort_0_10", "INTEGER")
        cls._ensure_column(conn, "challenge_day_log", "reflection_note", "TEXT")
        cls._ensure_column(conn, "challenge_day_log", "skipped_reason_code", "TEXT")
        cls._ensure_column(conn, "challenge_day_log", "dropout_reason_code", "TEXT")
        cls._ensure_column(conn, "challenge_day_log", "executed_at", "TEXT")

    @classmethod
    def _ensure_journal_schema(cls, conn: sqlite3.Connection) -> None:
        cls._ensure_column(conn, "journal_entry", "category_tags_json", "TEXT NOT NULL DEFAULT '[]'")

    @staticmethod
    def _seed_challenge_catalog(conn: sqlite3.Connection) -> None:
        for item in CHALLENGE_CATALOG_SEED:
            conn.execute(
                """
                INSERT INTO challenge_catalog (
                  challenge_id,
                  name_ko,
                  status,
                  domain,
                  challenge_type,
                  program_type,
                  default_target_days,
                  difficulty_level,
                  summary_ko
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(challenge_id) DO UPDATE SET
                  name_ko = excluded.name_ko,
                  status = excluded.status,
                  domain = excluded.domain,
                  challenge_type = excluded.challenge_type,
                  program_type = excluded.program_type,
                  default_target_days = excluded.default_target_days,
                  difficulty_level = excluded.difficulty_level,
                  summary_ko = excluded.summary_ko
                """,
                (
                    item["challenge_id"],
                    item["name_ko"],
                    item["status"],
                    item["domain"],
                    item["challenge_type"],
                    item["program_type"],
                    item["default_target_days"],
                    item["difficulty_level"],
                    item["summary_ko"],
                ),
            )
        conn.execute(
            """
            DELETE FROM challenge_catalog
            WHERE challenge_id = 'CH_REG_001'
            """
        )

    @staticmethod
    def _sleep_total_midpoint(bucket: SleepTotalBucket) -> float:
        mapping = {
            SleepTotalBucket.lt_4h: 3.5,
            SleepTotalBucket.h4_5: 4.5,
            SleepTotalBucket.h5_6: 5.5,
            SleepTotalBucket.h6_7: 6.5,
            SleepTotalBucket.h7_8: 7.5,
            SleepTotalBucket.ge_8h: 8.5,
        }
        return mapping[bucket]

    @staticmethod
    def _sleep_latency_midpoint(bucket: str) -> float:
        mapping = {
            "le_15m": 7.5,
            "m15_30": 22.5,
            "m30_60": 45.0,
            "ge_60m": 75.0,
        }
        return mapping[str(bucket)]

    @staticmethod
    def _journal_preview(body: str) -> str:
        first_line = ""
        for line in body.splitlines():
            if line.strip():
                first_line = line.strip()
                break

        if not first_line:
            first_line = body.strip()

        return first_line[:30]

    @staticmethod
    def _normalize_journal_category_tags(values: list[str] | None) -> list[str]:
        if not values:
            return []

        normalized: list[str] = []
        seen: set[str] = set()
        for raw in values:
            candidate = str(raw).strip()
            if not candidate:
                continue
            candidate = candidate[:24]
            if candidate in seen:
                continue
            seen.add(candidate)
            normalized.append(candidate)

        return normalized[:8]

    @classmethod
    def _parse_category_tags_json(cls, raw: Any) -> list[str]:
        if isinstance(raw, str):
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                return []
        elif isinstance(raw, list):
            parsed = raw
        else:
            return []

        if not isinstance(parsed, list):
            return []
        return cls._normalize_journal_category_tags([str(item) for item in parsed])

    @classmethod
    def _load_active_journal_category_tags(cls, conn: sqlite3.Connection) -> list[str]:
        if not cls._table_exists(conn, "admin_policy_change"):
            return list(DEFAULT_ONE_LINE_JOURNAL_CATEGORY_TAGS)

        row = conn.execute(
            """
            SELECT draft_json
            FROM admin_policy_change
            WHERE policy_domain = 'journal_policy' AND status = 'applied'
            ORDER BY COALESCE(applied_at, requested_at) DESC
            LIMIT 1
            """,
        ).fetchone()

        if not row:
            return list(DEFAULT_ONE_LINE_JOURNAL_CATEGORY_TAGS)

        try:
            draft = json.loads(str(row["draft_json"]))
        except json.JSONDecodeError:
            return list(DEFAULT_ONE_LINE_JOURNAL_CATEGORY_TAGS)

        if not isinstance(draft, dict):
            return list(DEFAULT_ONE_LINE_JOURNAL_CATEGORY_TAGS)

        configured = cls._normalize_journal_category_tags(
            [str(value) for value in (draft.get("active_category_tags") or [])],
        )
        return configured or list(DEFAULT_ONE_LINE_JOURNAL_CATEGORY_TAGS)

    @staticmethod
    def _searchable_category_tags(category_tags: list[str], active_tags: set[str]) -> list[str]:
        return [tag for tag in category_tags if tag in active_tags]

    def get_checkin_today(self, user_id: str, target_date: date) -> CheckinRecordResponse:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT
                  dc.date,
                  dc.status,
                  dc.current_version_no,
                  dc.checked_at,
                  dcv.payload_json
                FROM daily_checkin dc
                LEFT JOIN daily_checkin_version dcv
                  ON dcv.checkin_version_id = dc.current_version_id
                WHERE dc.user_id = ? AND dc.date = ?
                """,
                (user_id, target_date.isoformat()),
            ).fetchone()

            if not row:
                return CheckinRecordResponse(
                    date=target_date,
                    status=CheckinStatus.draft,
                    current_version_no=0,
                    payload=None,
                    checked_at=None,
                )

            payload = json.loads(str(row["payload_json"])) if row["payload_json"] else None
            parsed_payload = CheckinPayload.model_validate(payload) if payload else None
            checked_at = datetime.fromisoformat(str(row["checked_at"])) if row["checked_at"] else None

            return CheckinRecordResponse(
                date=target_date,
                status=CheckinStatus(str(row["status"])),
                current_version_no=int(row["current_version_no"]),
                payload=parsed_payload,
                checked_at=checked_at,
            )

    def save_checkin(self, user_id: str, payload: CheckinPayload, allow_edit: bool) -> CheckinRecordResponse:
        checkin_date = payload.date
        with self._connect() as conn:
            existing = conn.execute(
                """
                SELECT current_version_no, status
                FROM daily_checkin
                WHERE user_id = ? AND date = ?
                """,
                (user_id, checkin_date.isoformat()),
            ).fetchone()

            if existing and not allow_edit:
                raise ValueError("checkin_already_exists")

            current_version_no = int(existing["current_version_no"]) if existing else 0
            next_version_no = current_version_no + 1
            version_id = f"ckv_{uuid.uuid4().hex}"
            now_iso = self._now_iso()

            conn.execute(
                """
                INSERT INTO daily_checkin_version (
                  checkin_version_id,
                  user_id,
                  date,
                  version_no,
                  payload_json,
                  completion_mode,
                  submitted_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    version_id,
                    user_id,
                    checkin_date.isoformat(),
                    next_version_no,
                    payload.model_dump_json(),
                    payload.completion_mode.value,
                    now_iso,
                ),
            )

            if existing:
                conn.execute(
                    """
                    UPDATE daily_checkin
                    SET timezone = ?, checked_at = ?, status = ?,
                        current_version_id = ?, current_version_no = ?
                    WHERE user_id = ? AND date = ?
                    """,
                    (
                        payload.timezone,
                        now_iso,
                        CheckinStatus.submitted.value,
                        version_id,
                        next_version_no,
                        user_id,
                        checkin_date.isoformat(),
                    ),
                )
                event_name = "checkin_edited"
            else:
                conn.execute(
                    """
                    INSERT INTO daily_checkin (
                      user_id, date, timezone, checked_at, status,
                      current_version_id, current_version_no
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user_id,
                        checkin_date.isoformat(),
                        payload.timezone,
                        now_iso,
                        CheckinStatus.submitted.value,
                        version_id,
                        next_version_no,
                    ),
                )
                event_name = "checkin_submitted"

            self._upsert_checkin_features(conn, user_id, checkin_date, payload)
            conn.execute(
                """
                INSERT INTO daily_checkin_event_log (
                  event_id, event_name, user_id, date, payload_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    f"evt_{uuid.uuid4().hex}",
                    event_name,
                    user_id,
                    checkin_date.isoformat(),
                    json.dumps({"version": next_version_no}),
                    now_iso,
                ),
            )

            self._recalculate_user_day_activity_log(conn, user_id, checkin_date)
            conn.commit()

        return self.get_checkin_today(user_id, checkin_date)

    def _upsert_checkin_features(
        self,
        conn: sqlite3.Connection,
        user_id: str,
        target_date: date,
        payload: CheckinPayload,
    ) -> None:
        prev_row = conn.execute(
            """
            SELECT date
            FROM daily_checkin
            WHERE user_id = ?
              AND status = 'submitted'
              AND date < ?
            ORDER BY date DESC
            LIMIT 1
            """,
            (user_id, target_date.isoformat()),
        ).fetchone()

        prev_date: date | None = None
        if prev_row:
            prev_date = date.fromisoformat(str(prev_row["date"]))

        days_since_prev_checkin = (target_date - prev_date).days if prev_date else None

        start_7d = (target_date - timedelta(days=6)).isoformat()
        start_28d = (target_date - timedelta(days=27)).isoformat()

        count_7d = conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM daily_checkin
            WHERE user_id = ?
              AND status = 'submitted'
              AND date BETWEEN ? AND ?
            """,
            (user_id, start_7d, target_date.isoformat()),
        ).fetchone()
        submitted_7d = int(count_7d["cnt"]) if count_7d else 0

        count_28d = conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM daily_checkin
            WHERE user_id = ?
              AND status = 'submitted'
              AND date BETWEEN ? AND ?
            """,
            (user_id, start_28d, target_date.isoformat()),
        ).fetchone()
        submitted_28d = int(count_28d["cnt"]) if count_28d else 0

        now_iso = self._now_iso()
        conn.execute(
            """
            INSERT INTO daily_checkin_features_daily (
              user_id,
              date,
              mood_1_5,
              anxiety_1_5,
              energy_1_5,
              sleep_total_midpoint_hours,
              sleep_latency_midpoint_minutes,
              days_since_prev_checkin,
              missing_checkin_days_7d,
              missing_checkin_days_28d,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, date) DO UPDATE SET
              mood_1_5 = excluded.mood_1_5,
              anxiety_1_5 = excluded.anxiety_1_5,
              energy_1_5 = excluded.energy_1_5,
              sleep_total_midpoint_hours = excluded.sleep_total_midpoint_hours,
              sleep_latency_midpoint_minutes = excluded.sleep_latency_midpoint_minutes,
              days_since_prev_checkin = excluded.days_since_prev_checkin,
              missing_checkin_days_7d = excluded.missing_checkin_days_7d,
              missing_checkin_days_28d = excluded.missing_checkin_days_28d,
              updated_at = excluded.updated_at
            """,
            (
                user_id,
                target_date.isoformat(),
                payload.mood_1_5,
                payload.anxiety_1_5,
                payload.energy_1_5,
                self._sleep_total_midpoint(payload.sleep_total_bucket),
                self._sleep_latency_midpoint(payload.sleep_latency_bucket.value),
                days_since_prev_checkin,
                max(0, 7 - submitted_7d),
                max(0, 28 - submitted_28d),
                now_iso,
                now_iso,
            ),
        )

    def get_checkin_features_today(self, user_id: str, target_date: date) -> CheckinFeatureBundleResponse:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT
                  date,
                  mood_1_5,
                  anxiety_1_5,
                  energy_1_5,
                  sleep_total_midpoint_hours,
                  sleep_latency_midpoint_minutes,
                  days_since_prev_checkin,
                  missing_checkin_days_7d,
                  missing_checkin_days_28d
                FROM daily_checkin_features_daily
                WHERE user_id = ? AND date = ?
                """,
                (user_id, target_date.isoformat()),
            ).fetchone()

            if not row:
                return CheckinFeatureBundleResponse(
                    date=target_date,
                    mood_1_5=None,
                    anxiety_1_5=None,
                    energy_1_5=None,
                    sleep_total_midpoint_hours=None,
                    sleep_latency_midpoint_minutes=None,
                    days_since_prev_checkin=None,
                    missing_checkin_days_7d=7,
                    missing_checkin_days_28d=28,
                )

            return CheckinFeatureBundleResponse(
                date=date.fromisoformat(str(row["date"])),
                mood_1_5=row["mood_1_5"],
                anxiety_1_5=row["anxiety_1_5"],
                energy_1_5=row["energy_1_5"],
                sleep_total_midpoint_hours=row["sleep_total_midpoint_hours"],
                sleep_latency_midpoint_minutes=row["sleep_latency_midpoint_minutes"],
                days_since_prev_checkin=row["days_since_prev_checkin"],
                missing_checkin_days_7d=int(row["missing_checkin_days_7d"]),
                missing_checkin_days_28d=int(row["missing_checkin_days_28d"]),
            )

    def list_checkin_features(
        self,
        user_id: str,
        start_date: date,
        end_date: date,
    ) -> list[CheckinFeatureBundleResponse]:
        if end_date < start_date:
            raise ValueError("invalid_date_range")

        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT
                  date,
                  mood_1_5,
                  anxiety_1_5,
                  energy_1_5,
                  sleep_total_midpoint_hours,
                  sleep_latency_midpoint_minutes,
                  days_since_prev_checkin,
                  missing_checkin_days_7d,
                  missing_checkin_days_28d
                FROM daily_checkin_features_daily
                WHERE user_id = ?
                  AND date BETWEEN ? AND ?
                ORDER BY date DESC
                """,
                (user_id, start_date.isoformat(), end_date.isoformat()),
            ).fetchall()

            response: list[CheckinFeatureBundleResponse] = []
            for row in rows:
                response.append(
                    CheckinFeatureBundleResponse(
                        date=date.fromisoformat(str(row["date"])),
                        mood_1_5=int(row["mood_1_5"]) if row["mood_1_5"] is not None else None,
                        anxiety_1_5=int(row["anxiety_1_5"]) if row["anxiety_1_5"] is not None else None,
                        energy_1_5=int(row["energy_1_5"]) if row["energy_1_5"] is not None else None,
                        sleep_total_midpoint_hours=(
                            float(row["sleep_total_midpoint_hours"])
                            if row["sleep_total_midpoint_hours"] is not None
                            else None
                        ),
                        sleep_latency_midpoint_minutes=(
                            float(row["sleep_latency_midpoint_minutes"])
                            if row["sleep_latency_midpoint_minutes"] is not None
                            else None
                        ),
                        days_since_prev_checkin=(
                            int(row["days_since_prev_checkin"])
                            if row["days_since_prev_checkin"] is not None
                            else None
                        ),
                        missing_checkin_days_7d=int(row["missing_checkin_days_7d"]),
                        missing_checkin_days_28d=int(row["missing_checkin_days_28d"]),
                    )
                )
            return response

    def start_assessment(self, user_id: str, payload: AssessmentStartRequest) -> AssessmentSessionResponse:
        assessment_id = f"asm_{uuid.uuid4().hex}"
        now_iso = self._now_iso()

        with self._connect() as conn:
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
                ) VALUES (?, ?, ?, ?, NULL, ?, 28, ?, ?)
                """,
                (
                    assessment_id,
                    user_id,
                    payload.scheduled_for.isoformat() if payload.scheduled_for else None,
                    now_iso,
                    AssessmentStatus.draft.value,
                    payload.source.value,
                    now_iso,
                ),
            )
            conn.commit()

        return self.get_assessment_session(user_id, assessment_id)

    def save_assessment_answer(
        self,
        user_id: str,
        assessment_id: str,
        payload: AssessmentAnswerRequest,
    ) -> dict[str, str | int | None]:
        items, max_score = INSTRUMENT_ITEMS[payload.instrument.value]
        if payload.item_code not in items:
            raise ValueError("invalid_item_code")
        if payload.response_score < 0 or payload.response_score > max_score:
            raise ValueError("invalid_response_score")

        with self._connect() as conn:
            session = conn.execute(
                """
                SELECT user_id, status
                FROM periodic_assessment
                WHERE assessment_id = ?
                """,
                (assessment_id,),
            ).fetchone()
            if not session or str(session["user_id"]) != user_id:
                raise ValueError("assessment_not_found")
            if str(session["status"]) != AssessmentStatus.draft.value:
                raise ValueError("assessment_not_editable")

            display_order = items.index(payload.item_code) + 1
            response_label = str(payload.response_score)
            conn.execute(
                """
                INSERT INTO assessment_item_response (
                  assessment_id,
                  instrument,
                  item_code,
                  display_order,
                  response_score,
                  response_label,
                  answered_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(assessment_id, instrument, item_code) DO UPDATE SET
                  response_score = excluded.response_score,
                  response_label = excluded.response_label,
                  answered_at = excluded.answered_at
                """,
                (
                    assessment_id,
                    payload.instrument.value,
                    payload.item_code,
                    display_order,
                    payload.response_score,
                    response_label,
                    self._now_iso(),
                ),
            )
            conn.commit()

        next_item: str | None = None
        try:
            next_item = items[items.index(payload.item_code) + 1]
        except IndexError:
            next_item = None

        return {
            "assessment_id": assessment_id,
            "instrument": payload.instrument.value,
            "item_code": payload.item_code,
            "next_item_code": next_item,
        }

    @staticmethod
    def _band_from_total(instrument: str, total: int | None) -> str | None:
        if total is None:
            return None

        if instrument == "phq9":
            if total <= 4:
                return "minimal"
            if total <= 9:
                return "mild"
            if total <= 14:
                return "moderate"
            if total <= 19:
                return "moderately_severe"
            return "severe"

        if instrument == "gad7":
            if total <= 4:
                return "minimal"
            if total <= 9:
                return "mild"
            if total <= 14:
                return "moderate"
            return "severe"

        if instrument == "isi":
            if total <= 7:
                return "none"
            if total <= 14:
                return "subthreshold"
            if total <= 21:
                return "moderate"
            return "severe"

        return None

    def complete_assessment(self, user_id: str, assessment_id: str) -> AssessmentSessionResponse:
        with self._connect() as conn:
            session = conn.execute(
                """
                SELECT user_id, status
                FROM periodic_assessment
                WHERE assessment_id = ?
                """,
                (assessment_id,),
            ).fetchone()
            if not session or str(session["user_id"]) != user_id:
                raise ValueError("assessment_not_found")
            if str(session["status"]) not in {AssessmentStatus.draft.value, AssessmentStatus.completed.value}:
                raise ValueError("assessment_not_editable")

            response_rows = conn.execute(
                """
                SELECT instrument, item_code, response_score
                FROM assessment_item_response
                WHERE assessment_id = ?
                """,
                (assessment_id,),
            ).fetchall()

            totals: dict[str, int | None] = {"phq9": None, "gad7": None, "isi": None}
            if response_rows:
                grouped: dict[str, list[int]] = {"phq9": [], "gad7": [], "isi": []}
                for row in response_rows:
                    grouped[str(row["instrument"])].append(int(row["response_score"]))
                for instrument in ["phq9", "gad7", "isi"]:
                    if grouped[instrument]:
                        totals[instrument] = sum(grouped[instrument])

            phq9_item9_nonzero = conn.execute(
                """
                SELECT response_score
                FROM assessment_item_response
                WHERE assessment_id = ?
                  AND instrument = 'phq9'
                  AND item_code = 'PHQ9_9'
                """,
                (assessment_id,),
            ).fetchone()
            item9_nonzero = int(phq9_item9_nonzero["response_score"]) > 0 if phq9_item9_nonzero else False

            now_iso = self._now_iso()
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
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(assessment_id) DO UPDATE SET
                  phq9_total = excluded.phq9_total,
                  gad7_total = excluded.gad7_total,
                  isi_total = excluded.isi_total,
                  phq9_band = excluded.phq9_band,
                  gad7_band = excluded.gad7_band,
                  isi_band = excluded.isi_band,
                  phq9_item9_nonzero = excluded.phq9_item9_nonzero,
                  computed_at = excluded.computed_at
                """,
                (
                    assessment_id,
                    totals["phq9"],
                    totals["gad7"],
                    totals["isi"],
                    self._band_from_total("phq9", totals["phq9"]),
                    self._band_from_total("gad7", totals["gad7"]),
                    self._band_from_total("isi", totals["isi"]),
                    int(item9_nonzero),
                    now_iso,
                ),
            )
            conn.execute(
                """
                UPDATE periodic_assessment
                SET status = ?, completed_at = ?
                WHERE assessment_id = ?
                """,
                (AssessmentStatus.completed.value, now_iso, assessment_id),
            )

            self._recalculate_user_day_activity_log(conn, user_id, datetime.fromisoformat(now_iso).date())
            conn.commit()

        return self.get_assessment_session(user_id, assessment_id)

    def get_assessment_session(self, user_id: str, assessment_id: str) -> AssessmentSessionResponse:
        with self._connect() as conn:
            session = conn.execute(
                """
                SELECT
                  pa.assessment_id,
                  pa.user_id,
                  pa.scheduled_for,
                  pa.started_at,
                  pa.completed_at,
                  pa.status,
                  pa.recommended_cycle_days,
                  pa.source,
                  sc.phq9_total,
                  sc.gad7_total,
                  sc.isi_total,
                  sc.phq9_band,
                  sc.gad7_band,
                  sc.isi_band,
                  sc.phq9_item9_nonzero
                FROM periodic_assessment pa
                LEFT JOIN assessment_score sc ON sc.assessment_id = pa.assessment_id
                WHERE pa.assessment_id = ?
                """,
                (assessment_id,),
            ).fetchone()
            if not session or str(session["user_id"]) != user_id:
                raise ValueError("assessment_not_found")

            return AssessmentSessionResponse(
                assessment_id=str(session["assessment_id"]),
                user_id=str(session["user_id"]),
                scheduled_for=date.fromisoformat(str(session["scheduled_for"])) if session["scheduled_for"] else None,
                started_at=datetime.fromisoformat(str(session["started_at"])),
                completed_at=datetime.fromisoformat(str(session["completed_at"])) if session["completed_at"] else None,
                status=AssessmentStatus(str(session["status"])),
                recommended_cycle_days=int(session["recommended_cycle_days"]),
                source=session["source"],
                scores={
                    "phq9_total": session["phq9_total"],
                    "gad7_total": session["gad7_total"],
                    "isi_total": session["isi_total"],
                    "phq9_band": session["phq9_band"],
                    "gad7_band": session["gad7_band"],
                    "isi_band": session["isi_band"],
                    "phq9_item9_nonzero": bool(session["phq9_item9_nonzero"] or 0),
                },
            )

    def list_assessment_history(self, user_id: str, limit: int) -> list[AssessmentSessionResponse]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT pa.assessment_id
                FROM periodic_assessment pa
                WHERE pa.user_id = ?
                ORDER BY pa.started_at DESC
                LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()

        return [self.get_assessment_session(user_id, str(row["assessment_id"])) for row in rows]

    def list_challenge_catalog(self) -> list[ChallengeCatalogItem]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT challenge_id, name_ko, status, domain, challenge_type, program_type,
                       default_target_days, difficulty_level, summary_ko
                FROM challenge_catalog
                ORDER BY challenge_id
                """
            ).fetchall()

        return [self._row_to_catalog_item(row) for row in rows]

    @staticmethod
    def _row_to_catalog_item(row: sqlite3.Row) -> ChallengeCatalogItem:
        return ChallengeCatalogItem(
            challenge_id=str(row["challenge_id"]),
            name_ko=str(row["name_ko"]),
            status=str(row["status"]),
            domain=str(row["domain"]),
            challenge_type=ChallengeType(str(row["challenge_type"])),
            program_type=ChallengeProgramType(str(row["program_type"])),
            default_target_days=int(row["default_target_days"]),
            difficulty_level=str(row["difficulty_level"]),
            summary_ko=str(row["summary_ko"]),
        )

    @staticmethod
    def _normalize_challenge_status(raw: str) -> ChallengeStatus:
        normalized = raw if raw in {item.value for item in ChallengeStatus} else "active"
        return ChallengeStatus(normalized)

    @staticmethod
    def _session_status_from_enrollment(status: ChallengeStatus) -> ChallengeSessionStatus:
        return ChallengeSessionStatus(status.value)

    @staticmethod
    def _parse_date_or_default(value: str | None, fallback: date) -> date:
        if not value:
            return fallback
        return date.fromisoformat(value)

    def _row_to_enrollment_response(self, row: sqlite3.Row) -> ChallengeEnrollmentResponse:
        started_at = datetime.fromisoformat(str(row["started_at"]))
        target_days = int(row["target_days"] or 1)
        scheduled_start = self._parse_date_or_default(
            str(row["scheduled_start_date"]) if row["scheduled_start_date"] else None,
            started_at.date(),
        )
        scheduled_end = self._parse_date_or_default(
            str(row["scheduled_end_date"]) if row["scheduled_end_date"] else None,
            scheduled_start + timedelta(days=max(target_days - 1, 0)),
        )
        status = self._normalize_challenge_status(str(row["status"]))
        done_days = int(row["done_days"] or 0) if "done_days" in row.keys() else None
        last_completed_date = (
            date.fromisoformat(str(row["last_completed_date"]))
            if "last_completed_date" in row.keys() and row["last_completed_date"]
            else None
        )
        today_iso = date.today().isoformat()
        completed_today_flag = bool(
            done_days is not None
            and done_days >= target_days
            and last_completed_date is not None
            and last_completed_date.isoformat() == today_iso
        )
        stale_after_today_flag = bool(
            done_days is not None
            and done_days >= target_days
            and last_completed_date is not None
            and last_completed_date.isoformat() < today_iso
            and (
                str(row["challenge_type"]) == ChallengeType.one_time.value
                or target_days == 1
            )
        )
        return ChallengeEnrollmentResponse(
            enrollment_id=str(row["enrollment_id"]),
            challenge_id=str(row["challenge_id"]),
            challenge_name=str(row["name_ko"]),
            domain=str(row["domain"]),
            challenge_type=ChallengeType(str(row["challenge_type"])),
            program_type=ChallengeProgramType(str(row["program_type"])),
            status=status,
            session_status=self._session_status_from_enrollment(status),
            target_days=target_days,
            scheduled_start_date=scheduled_start,
            scheduled_end_date=scheduled_end,
            reminder_time_local=str(row["reminder_time_local"]) if row["reminder_time_local"] else None,
            started_at=started_at,
            ended_at=datetime.fromisoformat(str(row["ended_at"])) if row["ended_at"] else None,
            done_days=done_days,
            last_completed_date=last_completed_date,
            completed_today_flag=completed_today_flag if done_days is not None else None,
            stale_after_today_flag=stale_after_today_flag if done_days is not None else None,
        )

    def list_challenge_enrollments(
        self,
        user_id: str,
        statuses: list[ChallengeStatus] | None = None,
    ) -> list[ChallengeEnrollmentResponse]:
        query = """
            SELECT
              ce.enrollment_id,
              ce.challenge_id,
              cc.name_ko,
              cc.domain,
              cc.challenge_type,
              cc.program_type,
              ce.status,
              ce.target_days,
              ce.scheduled_start_date,
              ce.scheduled_end_date,
              ce.reminder_time_local,
              ce.started_at,
              ce.ended_at,
              (
                SELECT COUNT(*)
                FROM challenge_day_log cdl
                WHERE cdl.enrollment_id = ce.enrollment_id
                  AND cdl.completed_flag = 1
              ) AS done_days,
              (
                SELECT MAX(cdl.date)
                FROM challenge_day_log cdl
                WHERE cdl.enrollment_id = ce.enrollment_id
                  AND cdl.completed_flag = 1
              ) AS last_completed_date
            FROM challenge_enrollment ce
            JOIN challenge_catalog cc ON cc.challenge_id = ce.challenge_id
            WHERE ce.user_id = ?
        """
        params: list[object] = [user_id]
        if statuses:
            placeholders = ", ".join(["?"] * len(statuses))
            query += f" AND ce.status IN ({placeholders})"
            params.extend([status.value for status in statuses])
        query += " ORDER BY ce.started_at DESC"

        with self._connect() as conn:
            rows = conn.execute(query, tuple(params)).fetchall()

        return [self._row_to_enrollment_response(row) for row in rows]

    def list_active_enrollments(self, user_id: str) -> list[ChallengeEnrollmentResponse]:
        return self.list_challenge_enrollments(user_id, statuses=[ChallengeStatus.active])

    def _risk_level_for_challenge(self, conn: sqlite3.Connection, user_id: str) -> int:
        if self._table_exists(conn, "cbt_risk_signal"):
            recent_cutoff_iso = (datetime.now(UTC) - timedelta(days=14)).isoformat()
            risk_row = conn.execute(
                """
                SELECT self_harm_flag, suicide_risk_level, violence_risk_flag, functional_impairment_flag
                FROM cbt_risk_signal
                WHERE user_id = ?
                  AND datetime(created_at) >= datetime(?)
                ORDER BY datetime(created_at) DESC
                LIMIT 1
                """,
                (user_id, recent_cutoff_iso),
            ).fetchone()
            if risk_row:
                self_harm_flag = bool(risk_row["self_harm_flag"])
                violence_risk_flag = bool(risk_row["violence_risk_flag"])
                suicide_risk_level = int(risk_row["suicide_risk_level"] or 0)
                functional_impairment_flag = bool(risk_row["functional_impairment_flag"])
                if self_harm_flag or violence_risk_flag or suicide_risk_level >= 2:
                    return 3
                if functional_impairment_flag or suicide_risk_level == 1:
                    return 2

        row = conn.execute(
            """
            SELECT sc.phq9_total, sc.phq9_item9_nonzero
            FROM periodic_assessment pa
            JOIN assessment_score sc ON sc.assessment_id = pa.assessment_id
            WHERE pa.user_id = ?
            ORDER BY pa.completed_at DESC
            LIMIT 1
            """,
            (user_id,),
        ).fetchone()

        if not row:
            return 0

        phq9_item9_nonzero = int(row["phq9_item9_nonzero"] or 0)
        phq9_total = int(row["phq9_total"] or 0)
        if phq9_item9_nonzero > 0 and phq9_total >= 20:
            return 3

        if phq9_total >= 20:
            return 2
        if phq9_total >= 10 or phq9_item9_nonzero > 0:
            return 1
        return 0

    @staticmethod
    def _challenge_safety_message() -> str:
        return (
            "지금은 새로운 챌린지를 늘리기보다 안전을 먼저 확인하는 편이 좋아요. "
            "오늘 안에 가까운 정신건강의학과나 상담센터에 연락해 상담 일정을 잡아보세요. "
            "혼자 버티기 어렵게 느껴지면 신뢰하는 사람 한 명에게 지금 상태를 알리고 도움을 요청해 주세요. "
            "즉시 위험하다고 느껴지면 112 또는 119로 바로 도움을 요청하세요."
        )

    def _resolve_challenge_signal(
        self,
        conn: sqlite3.Connection,
        user_id: str,
    ) -> dict[str, object]:
        if self._table_exists(conn, "model_nowcast_prediction"):
            prediction = conn.execute(
                """
                SELECT dep_score, anx_score, ins_score, created_at
                FROM model_nowcast_prediction
                WHERE user_id = ?
                ORDER BY datetime(created_at) DESC
                LIMIT 1
                """,
                (user_id,),
            ).fetchone()
            if prediction:
                dep = float(prediction["dep_score"] or 0.0)
                anx = float(prediction["anx_score"] or 0.0)
                ins = float(prediction["ins_score"] or 0.0)
                ordered = sorted(
                    [("dep", dep), ("anx", anx), ("ins", ins)],
                    key=lambda item: item[1],
                    reverse=True,
                )
                return {
                    "source": "model_nowcast",
                    "scores": {"dep": round(dep, 2), "anx": round(anx, 2), "ins": round(ins, 2)},
                    "ordered_dimensions": [item[0] for item in ordered],
                }

        if self._table_exists(conn, "periodic_assessment") and self._table_exists(conn, "assessment_score"):
            latest_assessment = conn.execute(
                """
                SELECT sc.phq9_total, sc.gad7_total, sc.isi_total
                FROM periodic_assessment pa
                JOIN assessment_score sc ON sc.assessment_id = pa.assessment_id
                WHERE pa.user_id = ?
                  AND pa.status IN ('completed', 'late')
                  AND pa.completed_at IS NOT NULL
                ORDER BY datetime(pa.completed_at) DESC
                LIMIT 1
                """,
                (user_id,),
            ).fetchone()
            if latest_assessment:
                dep = min(100.0, max(0.0, float(latest_assessment["phq9_total"] or 0) * (100.0 / 27.0)))
                anx = min(100.0, max(0.0, float(latest_assessment["gad7_total"] or 0) * (100.0 / 21.0)))
                ins = min(100.0, max(0.0, float(latest_assessment["isi_total"] or 0) * (100.0 / 28.0)))
                ordered = sorted(
                    [("dep", dep), ("anx", anx), ("ins", ins)],
                    key=lambda item: item[1],
                    reverse=True,
                )
                return {
                    "source": "assessment_score",
                    "scores": {"dep": round(dep, 2), "anx": round(anx, 2), "ins": round(ins, 2)},
                    "ordered_dimensions": [item[0] for item in ordered],
                }

        return {
            "source": "baseline",
            "scores": {"dep": 0.0, "anx": 0.0, "ins": 0.0},
            "ordered_dimensions": ["dep", "anx", "ins"],
        }

    def get_today_recommendations(self, user_id: str) -> dict[str, object]:
        with self._connect() as conn:
            risk_level = self._risk_level_for_challenge(conn, user_id)
            if risk_level >= 3:
                return {
                    "risk_level": risk_level,
                    "suppressed": True,
                    "reason": "safety_gate",
                    "safety_message": self._challenge_safety_message(),
                    "signal_source": "safety_gate",
                    "signal_scores": {"dep": 0.0, "anx": 0.0, "ins": 0.0},
                    "items": [],
                }

            signal = self._resolve_challenge_signal(conn, user_id)
            signal_source = str(signal.get("source") or "baseline")
            signal_scores = signal.get("scores")
            signal_scores_map = signal_scores if isinstance(signal_scores, dict) else {}
            ordered_dimensions = signal.get("ordered_dimensions")
            ordered_dims = (
                [str(value) for value in ordered_dimensions if isinstance(value, str)]
                if isinstance(ordered_dimensions, list)
                else ["dep", "anx", "ins"]
            )
            primary_dim = ordered_dims[0] if ordered_dims else "dep"

            challenge_priority_by_dimension: dict[str, list[str]] = {
                "dep": ["CH_ACT_001", "CH_ACT_002", "CH_ACT_003", "water-intake", "CH_WELL_001", "CH_SOC_001"],
                "anx": ["CH_REG_002", "CH_SOC_001", "CH_SLEEP_001", "CH_ACT_005", "water-intake"],
                "ins": ["CH_SLEEP_001", "CH_ACT_002", "CH_REG_002", "CH_ACT_005", "water-intake"],
            }
            priority_order: list[str] = []
            for dimension in ordered_dims:
                for challenge_id in challenge_priority_by_dimension.get(dimension, []):
                    if challenge_id not in priority_order:
                        priority_order.append(challenge_id)
            for challenge_id in CHALLENGE_REASON_BY_ID:
                if challenge_id not in priority_order:
                    priority_order.append(challenge_id)
            priority_index = {challenge_id: index for index, challenge_id in enumerate(priority_order)}
            primary_signal_label = {"dep": "기분·활기", "anx": "긴장·불안", "ins": "수면"}.get(primary_dim, "최근 상태")
            primary_signal_score = signal_scores_map.get(primary_dim)
            if isinstance(primary_signal_score, (int, float)):
                reason_prefix = f"최근 {primary_signal_label} 지표({float(primary_signal_score):.1f})를 기준으로"
            else:
                reason_prefix = f"최근 {primary_signal_label} 신호를 기준으로"

            active_rows = conn.execute(
                """
                SELECT cc.domain, cc.challenge_type
                FROM challenge_enrollment ce
                JOIN challenge_catalog cc ON cc.challenge_id = ce.challenge_id
                WHERE ce.user_id = ? AND ce.status = 'active'
                """,
                (user_id,),
            ).fetchall()

            active_sustained = [row for row in active_rows if str(row["challenge_type"]) == "sustained"]
            active_domains = {str(row["domain"]) for row in active_sustained}

            catalog = conn.execute(
                """
                SELECT challenge_id, name_ko, status, domain, challenge_type, program_type,
                       default_target_days, difficulty_level, summary_ko
                FROM challenge_catalog
                ORDER BY CASE status WHEN 'core' THEN 0 ELSE 1 END, challenge_id
                """
            ).fetchall()

            candidate_rows: list[tuple[int, int, sqlite3.Row]] = []
            for row in catalog:
                challenge_type = str(row["challenge_type"])
                difficulty_level = str(row["difficulty_level"])
                domain = str(row["domain"])
                challenge_id = str(row["challenge_id"])

                if challenge_type == "sustained":
                    if len(active_sustained) >= 3:
                        continue
                    if domain in active_domains:
                        continue
                    if risk_level >= 2 and difficulty_level in {"medium", "hard"}:
                        continue

                catalog_priority = 0 if str(row["status"]) == "core" else 1
                model_priority = priority_index.get(challenge_id, len(priority_index) + 100)
                candidate_rows.append((model_priority, catalog_priority, row))

            candidate_rows.sort(key=lambda item: (item[0], item[1], str(item[2]["challenge_id"])))
            selected: list[ChallengeRecommendationItem] = []
            for _, _, row in candidate_rows:
                challenge_id = str(row["challenge_id"])
                base_reason = CHALLENGE_REASON_BY_ID.get(challenge_id, (None, None))
                reason_code = base_reason[0]
                reason_copy = base_reason[1]

                if signal_source in {"model_nowcast", "assessment_score"} and challenge_id in priority_index:
                    reason_code = f"{signal_source}_{primary_dim}"
                    reason_copy = f"{reason_prefix} '{str(row['name_ko'])}'를 추천합니다."

                selected.append(
                    ChallengeRecommendationItem(
                        challenge_id=challenge_id,
                        name_ko=str(row["name_ko"]),
                        status=str(row["status"]),
                        domain=str(row["domain"]),
                        challenge_type=ChallengeType(str(row["challenge_type"])),
                        program_type=ChallengeProgramType(str(row["program_type"])),
                        default_target_days=int(row["default_target_days"]),
                        difficulty_level=str(row["difficulty_level"]),
                        summary_ko=str(row["summary_ko"]),
                        session_status=ChallengeSessionStatus.recommended,
                        reason_code=reason_code,
                        reason_copy_ko=reason_copy,
                    )
                )
                if len(selected) >= 3:
                    break

            return {
                "risk_level": risk_level,
                "suppressed": False,
                "reason": None,
                "signal_source": signal_source,
                "signal_scores": signal_scores_map,
                "items": [item.model_dump(mode="json") for item in selected],
            }

    def get_challenge_catalog_detail(
        self,
        user_id: str,
        challenge_id: str,
    ) -> ChallengeCatalogDetailResponse:
        with self._connect() as conn:
            challenge_row = conn.execute(
                """
                SELECT challenge_id, name_ko, status, domain, challenge_type, program_type,
                       default_target_days, difficulty_level, summary_ko
                FROM challenge_catalog
                WHERE challenge_id = ?
                """,
                (challenge_id,),
            ).fetchone()
            if not challenge_row:
                raise ValueError("challenge_not_found")

            enrollment_rows = conn.execute(
                """
                SELECT
                  ce.enrollment_id,
                  ce.challenge_id,
                  ce.status,
                  ce.target_days,
                  ce.scheduled_start_date,
                  ce.scheduled_end_date,
                  ce.reminder_time_local,
                  ce.started_at,
                  ce.ended_at,
                  cc.name_ko,
                  cc.domain,
                  cc.challenge_type,
                  cc.program_type
                FROM challenge_enrollment ce
                JOIN challenge_catalog cc ON cc.challenge_id = ce.challenge_id
                WHERE ce.user_id = ? AND ce.challenge_id = ?
                ORDER BY ce.started_at DESC
                """,
                (user_id, challenge_id),
            ).fetchall()

        challenge = self._row_to_catalog_item(challenge_row)
        recommendations = self.get_today_recommendations(user_id)
        recommended_items = recommendations.get("items", [])
        recommended_item = next(
            (item for item in recommended_items if str(item.get("challenge_id")) == challenge_id),
            None,
        )

        active_enrollment = None
        latest_enrollment = None
        if enrollment_rows:
            latest_enrollment = self._row_to_enrollment_response(enrollment_rows[0])
            for row in enrollment_rows:
                row_status = str(row["status"])
                if row_status in {ChallengeStatus.active.value, ChallengeStatus.paused.value}:
                    active_enrollment = self._row_to_enrollment_response(row)
                    break

        if active_enrollment:
            session_status = active_enrollment.session_status
        elif recommended_item:
            session_status = ChallengeSessionStatus.recommended
        elif latest_enrollment:
            session_status = latest_enrollment.session_status
        else:
            session_status = ChallengeSessionStatus.available

        recommendation = None
        if recommended_item:
            recommendation = ChallengeRecommendationItem(
                challenge_id=str(recommended_item["challenge_id"]),
                name_ko=str(recommended_item["name_ko"]),
                status=str(recommended_item["status"]),
                domain=str(recommended_item["domain"]),
                challenge_type=ChallengeType(str(recommended_item["challenge_type"])),
                program_type=ChallengeProgramType(str(recommended_item["program_type"])),
                default_target_days=int(recommended_item["default_target_days"]),
                difficulty_level=str(recommended_item["difficulty_level"]),
                summary_ko=str(recommended_item["summary_ko"]),
                session_status=ChallengeSessionStatus(str(recommended_item["session_status"])),
                reason_code=str(recommended_item["reason_code"]) if recommended_item.get("reason_code") else None,
                reason_copy_ko=(
                    str(recommended_item["reason_copy_ko"])
                    if recommended_item.get("reason_copy_ko")
                    else None
                ),
            )

        return ChallengeCatalogDetailResponse(
            challenge=challenge,
            session_status=session_status,
            recommendation=recommendation,
            active_enrollment=active_enrollment,
            latest_enrollment=latest_enrollment,
            template_steps=CHALLENGE_TEMPLATE_STEPS.get(challenge_id, []),
        )

    def log_challenge_exposure(
        self,
        user_id: str,
        challenge_id: str,
        exposure_type: str,
        response_type: str | None,
        reason_text: str | None,
    ) -> dict[str, str]:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO challenge_exposure (
                  exposure_id, user_id, challenge_id, date,
                  exposure_type, response_type, reason_text, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"cex_{uuid.uuid4().hex}",
                    user_id,
                    challenge_id,
                    date.today().isoformat(),
                    exposure_type,
                    response_type,
                    reason_text,
                    self._now_iso(),
                ),
            )
            conn.commit()

        return {"result": "ok"}

    def create_challenge_enrollment(
        self,
        user_id: str,
        payload: ChallengeEnrollmentCreateRequest,
    ) -> ChallengeEnrollmentResponse:
        with self._connect() as conn:
            catalog = conn.execute(
                """
                SELECT challenge_id, name_ko, domain, challenge_type, program_type, default_target_days
                FROM challenge_catalog
                WHERE challenge_id = ?
                """,
                (payload.challenge_id,),
            ).fetchone()
            if not catalog:
                raise ValueError("challenge_not_found")

            challenge_type = str(catalog["challenge_type"])
            domain = str(catalog["domain"])

            if challenge_type == ChallengeType.sustained.value:
                active_sustained_rows = conn.execute(
                    """
                    SELECT cc.domain
                    FROM challenge_enrollment ce
                    JOIN challenge_catalog cc ON cc.challenge_id = ce.challenge_id
                    WHERE ce.user_id = ?
                      AND ce.status = 'active'
                      AND cc.challenge_type = 'sustained'
                    """,
                    (user_id,),
                ).fetchall()

                if len(active_sustained_rows) >= 3:
                    raise ValueError("active_sustained_limit_reached")

            enrollment_id = f"cen_{uuid.uuid4().hex}"
            now_iso = self._now_iso()
            started_at = datetime.fromisoformat(now_iso)
            target_days = payload.target_days or int(catalog["default_target_days"] or 1)
            scheduled_start_date = payload.start_date or started_at.date()
            scheduled_end_date = scheduled_start_date + timedelta(days=max(target_days - 1, 0))
            conn.execute(
                """
                INSERT INTO challenge_enrollment (
                  enrollment_id,
                  user_id,
                  challenge_id,
                  status,
                  target_days,
                  scheduled_start_date,
                  scheduled_end_date,
                  reminder_time_local,
                  motivation_note,
                  assigned_by,
                  started_at,
                  paused_at,
                  ended_at
                ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, 'user', ?, NULL, NULL)
                """,
                (
                    enrollment_id,
                    user_id,
                    payload.challenge_id,
                    target_days,
                    scheduled_start_date.isoformat(),
                    scheduled_end_date.isoformat(),
                    payload.reminder_time_local,
                    payload.motivation_note,
                    now_iso,
                ),
            )

            self._recalculate_user_day_activity_log(conn, user_id, started_at.date())
            conn.commit()

        return ChallengeEnrollmentResponse(
            enrollment_id=enrollment_id,
            challenge_id=str(catalog["challenge_id"]),
            challenge_name=str(catalog["name_ko"]),
            domain=domain,
            challenge_type=ChallengeType(challenge_type),
            program_type=ChallengeProgramType(str(catalog["program_type"])),
            status=ChallengeStatus.active,
            session_status=ChallengeSessionStatus.active,
            target_days=target_days,
            scheduled_start_date=scheduled_start_date,
            scheduled_end_date=scheduled_end_date,
            reminder_time_local=payload.reminder_time_local,
            started_at=started_at,
            ended_at=None,
        )

    def update_challenge_enrollment(
        self,
        user_id: str,
        enrollment_id: str,
        payload: ChallengeEnrollmentUpdateRequest,
    ) -> ChallengeEnrollmentResponse:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT
                  ce.enrollment_id,
                  ce.challenge_id,
                  ce.status,
                  ce.target_days,
                  ce.scheduled_start_date,
                  ce.scheduled_end_date,
                  ce.reminder_time_local,
                  ce.started_at,
                  ce.paused_at,
                  ce.ended_at,
                  cc.name_ko,
                  cc.domain,
                  cc.challenge_type,
                  cc.program_type
                FROM challenge_enrollment ce
                JOIN challenge_catalog cc ON cc.challenge_id = ce.challenge_id
                WHERE ce.enrollment_id = ? AND ce.user_id = ?
                """,
                (enrollment_id, user_id),
            ).fetchone()
            if not row:
                raise ValueError("enrollment_not_found")

            ended_at = str(row["ended_at"]) if row["ended_at"] else None
            paused_at = str(row["paused_at"]) if row["paused_at"] else None
            now_iso = self._now_iso()
            if payload.status in {ChallengeStatus.completed, ChallengeStatus.dropped}:
                ended_at = now_iso
            if payload.status == ChallengeStatus.paused:
                paused_at = now_iso
            if payload.status == ChallengeStatus.active:
                paused_at = None

            conn.execute(
                """
                UPDATE challenge_enrollment
                SET status = ?, paused_at = ?, ended_at = ?
                WHERE enrollment_id = ? AND user_id = ?
                """,
                (payload.status.value, paused_at, ended_at, enrollment_id, user_id),
            )
            if payload.status == ChallengeStatus.dropped:
                self._upsert_challenge_day_log(
                    conn=conn,
                    user_id=user_id,
                    enrollment_id=enrollment_id,
                    challenge_id=str(row["challenge_id"]),
                    target_date=date.today(),
                    day_status=ChallengeDayStatus.skipped,
                    completed_flag=False,
                    skipped_reason_code=payload.dropout_reason_code or "dropped_by_user",
                    dropout_reason_code=payload.dropout_reason_code or "dropped_by_user",
                )
            self._recalculate_user_day_activity_log(conn, user_id, date.today())
            conn.commit()

        with self._connect() as conn:
            refreshed = conn.execute(
                """
                SELECT
                  ce.enrollment_id,
                  ce.challenge_id,
                  ce.status,
                  ce.target_days,
                  ce.scheduled_start_date,
                  ce.scheduled_end_date,
                  ce.reminder_time_local,
                  ce.started_at,
                  ce.ended_at,
                  cc.name_ko,
                  cc.domain,
                  cc.challenge_type,
                  cc.program_type
                FROM challenge_enrollment ce
                JOIN challenge_catalog cc ON cc.challenge_id = ce.challenge_id
                WHERE ce.enrollment_id = ? AND ce.user_id = ?
                """,
                (enrollment_id, user_id),
            ).fetchone()

        if not refreshed:
            raise ValueError("enrollment_not_found")
        return self._row_to_enrollment_response(refreshed)

    def _upsert_challenge_day_log(
        self,
        conn: sqlite3.Connection,
        user_id: str,
        enrollment_id: str,
        challenge_id: str,
        target_date: date,
        day_status: ChallengeDayStatus,
        completed_flag: bool,
        helpfulness_score_1_5: int | None = None,
        pre_mood_1_5: int | None = None,
        pre_anxiety_1_5: int | None = None,
        post_mood_1_5: int | None = None,
        post_anxiety_1_5: int | None = None,
        helpfulness_0_10: int | None = None,
        effort_0_10: int | None = None,
        reflection_note: str | None = None,
        skipped_reason_code: str | None = None,
        dropout_reason_code: str | None = None,
    ) -> ChallengeDayLogResponse:
        now_iso = self._now_iso()
        conn.execute(
            """
            INSERT INTO challenge_day_log (
              log_id,
              user_id,
              enrollment_id,
              challenge_id,
              date,
              completed_flag,
              helpfulness_score_1_5,
              day_status,
              pre_mood_1_5,
              pre_anxiety_1_5,
              post_mood_1_5,
              post_anxiety_1_5,
              helpfulness_0_10,
              effort_0_10,
              reflection_note,
              skipped_reason_code,
              dropout_reason_code,
              executed_at,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, enrollment_id, date) DO UPDATE SET
              completed_flag = excluded.completed_flag,
              helpfulness_score_1_5 = COALESCE(excluded.helpfulness_score_1_5, challenge_day_log.helpfulness_score_1_5),
              day_status = excluded.day_status,
              pre_mood_1_5 = COALESCE(excluded.pre_mood_1_5, challenge_day_log.pre_mood_1_5),
              pre_anxiety_1_5 = COALESCE(excluded.pre_anxiety_1_5, challenge_day_log.pre_anxiety_1_5),
              post_mood_1_5 = COALESCE(excluded.post_mood_1_5, challenge_day_log.post_mood_1_5),
              post_anxiety_1_5 = COALESCE(excluded.post_anxiety_1_5, challenge_day_log.post_anxiety_1_5),
              helpfulness_0_10 = COALESCE(excluded.helpfulness_0_10, challenge_day_log.helpfulness_0_10),
              effort_0_10 = COALESCE(excluded.effort_0_10, challenge_day_log.effort_0_10),
              reflection_note = COALESCE(excluded.reflection_note, challenge_day_log.reflection_note),
              skipped_reason_code = COALESCE(excluded.skipped_reason_code, challenge_day_log.skipped_reason_code),
              dropout_reason_code = COALESCE(excluded.dropout_reason_code, challenge_day_log.dropout_reason_code),
              executed_at = excluded.executed_at,
              updated_at = excluded.updated_at
            """,
            (
                f"cdl_{uuid.uuid4().hex}",
                user_id,
                enrollment_id,
                challenge_id,
                target_date.isoformat(),
                int(completed_flag),
                helpfulness_score_1_5,
                day_status.value,
                pre_mood_1_5,
                pre_anxiety_1_5,
                post_mood_1_5,
                post_anxiety_1_5,
                helpfulness_0_10,
                effort_0_10,
                reflection_note,
                skipped_reason_code,
                dropout_reason_code,
                now_iso,
                now_iso,
                now_iso,
            ),
        )
        row = conn.execute(
            """
            SELECT
              log_id,
              enrollment_id,
              challenge_id,
              date,
              day_status,
              completed_flag,
              pre_mood_1_5,
              pre_anxiety_1_5,
              post_mood_1_5,
              post_anxiety_1_5,
              helpfulness_0_10,
              effort_0_10,
              reflection_note,
              skipped_reason_code,
              created_at,
              updated_at
            FROM challenge_day_log
            WHERE user_id = ? AND enrollment_id = ? AND date = ?
            """,
            (user_id, enrollment_id, target_date.isoformat()),
        ).fetchone()
        if not row:
            raise ValueError("day_log_not_found")
        return ChallengeDayLogResponse(
            day_log_id=str(row["log_id"]),
            enrollment_id=str(row["enrollment_id"]),
            challenge_id=str(row["challenge_id"]),
            date=date.fromisoformat(str(row["date"])),
            day_status=ChallengeDayStatus(str(row["day_status"])),
            completed_flag=bool(row["completed_flag"]),
            pre_mood_1_5=int(row["pre_mood_1_5"]) if row["pre_mood_1_5"] is not None else None,
            pre_anxiety_1_5=int(row["pre_anxiety_1_5"]) if row["pre_anxiety_1_5"] is not None else None,
            post_mood_1_5=int(row["post_mood_1_5"]) if row["post_mood_1_5"] is not None else None,
            post_anxiety_1_5=int(row["post_anxiety_1_5"]) if row["post_anxiety_1_5"] is not None else None,
            helpfulness_0_10=int(row["helpfulness_0_10"]) if row["helpfulness_0_10"] is not None else None,
            effort_0_10=int(row["effort_0_10"]) if row["effort_0_10"] is not None else None,
            reflection_note=str(row["reflection_note"]) if row["reflection_note"] else None,
            skipped_reason_code=str(row["skipped_reason_code"]) if row["skipped_reason_code"] else None,
            created_at=datetime.fromisoformat(str(row["created_at"])),
            updated_at=datetime.fromisoformat(str(row["updated_at"])),
        )

    def execute_challenge_day(
        self,
        user_id: str,
        enrollment_id: str,
        payload: ChallengeDayExecuteRequest,
    ) -> ChallengeDayLogResponse:
        with self._connect() as conn:
            enrollment = conn.execute(
                """
                SELECT challenge_id, status
                FROM challenge_enrollment
                WHERE enrollment_id = ? AND user_id = ?
                """,
                (enrollment_id, user_id),
            ).fetchone()
            if not enrollment:
                raise ValueError("enrollment_not_found")
            if str(enrollment["status"]) != ChallengeStatus.active.value:
                raise ValueError("enrollment_not_active")

            day_status = payload.day_status
            completed_flag = day_status in {ChallengeDayStatus.done, ChallengeDayStatus.late}
            if payload.day_status == ChallengeDayStatus.done and payload.date < date.today():
                day_status = ChallengeDayStatus.late
                completed_flag = True

            log = self._upsert_challenge_day_log(
                conn=conn,
                user_id=user_id,
                enrollment_id=enrollment_id,
                challenge_id=str(enrollment["challenge_id"]),
                target_date=payload.date,
                day_status=day_status,
                completed_flag=completed_flag,
                pre_mood_1_5=payload.pre_mood_1_5,
                pre_anxiety_1_5=payload.pre_anxiety_1_5,
                skipped_reason_code=payload.skipped_reason_code,
            )
            self._recalculate_user_day_activity_log(conn, user_id, payload.date)
            conn.commit()
            return log

    def save_challenge_reflection(
        self,
        user_id: str,
        enrollment_id: str,
        payload: ChallengeReflectionRequest,
    ) -> ChallengeDayLogResponse:
        with self._connect() as conn:
            enrollment = conn.execute(
                """
                SELECT challenge_id
                FROM challenge_enrollment
                WHERE enrollment_id = ? AND user_id = ?
                """,
                (enrollment_id, user_id),
            ).fetchone()
            if not enrollment:
                raise ValueError("enrollment_not_found")

            status = payload.result_status
            if status == ChallengeDayStatus.done and payload.date < date.today():
                status = ChallengeDayStatus.late

            helpfulness_score_1_5 = payload.helpfulness_0_10
            if helpfulness_score_1_5 is not None:
                helpfulness_score_1_5 = max(1, min(5, round(helpfulness_score_1_5 / 2)))

            log = self._upsert_challenge_day_log(
                conn=conn,
                user_id=user_id,
                enrollment_id=enrollment_id,
                challenge_id=str(enrollment["challenge_id"]),
                target_date=payload.date,
                day_status=status,
                completed_flag=status in {ChallengeDayStatus.done, ChallengeDayStatus.late},
                helpfulness_score_1_5=helpfulness_score_1_5,
                post_mood_1_5=payload.post_mood_1_5,
                post_anxiety_1_5=payload.post_anxiety_1_5,
                helpfulness_0_10=payload.helpfulness_0_10,
                effort_0_10=payload.effort_0_10,
                reflection_note=payload.reflection_note,
                skipped_reason_code=payload.skipped_reason_code,
            )
            self._recalculate_user_day_activity_log(conn, user_id, payload.date)
            conn.commit()
            return log

    def log_challenge_day(
        self,
        user_id: str,
        payload: ChallengeDayLogRequest,
    ) -> dict[str, str]:
        with self._connect() as conn:
            enrollment = conn.execute(
                """
                SELECT challenge_id
                FROM challenge_enrollment
                WHERE enrollment_id = ? AND user_id = ?
                """,
                (payload.enrollment_id, user_id),
            ).fetchone()
            if not enrollment:
                raise ValueError("enrollment_not_found")

            if payload.day_status is not None:
                day_status = payload.day_status
            elif payload.completed_flag:
                day_status = ChallengeDayStatus.done
            else:
                day_status = ChallengeDayStatus.pending
            if day_status == ChallengeDayStatus.done and payload.date < date.today():
                day_status = ChallengeDayStatus.late

            helpfulness_score_1_5 = payload.helpfulness_score_1_5
            if helpfulness_score_1_5 is None and payload.helpfulness_0_10 is not None:
                helpfulness_score_1_5 = max(1, min(5, round(payload.helpfulness_0_10 / 2)))

            self._upsert_challenge_day_log(
                conn=conn,
                user_id=user_id,
                enrollment_id=payload.enrollment_id,
                challenge_id=str(enrollment["challenge_id"]),
                target_date=payload.date,
                day_status=day_status,
                completed_flag=payload.completed_flag,
                helpfulness_score_1_5=helpfulness_score_1_5,
                pre_mood_1_5=payload.pre_mood_1_5,
                pre_anxiety_1_5=payload.pre_anxiety_1_5,
                post_mood_1_5=payload.post_mood_1_5,
                post_anxiety_1_5=payload.post_anxiety_1_5,
                helpfulness_0_10=payload.helpfulness_0_10,
                effort_0_10=payload.effort_0_10,
                reflection_note=payload.reflection_note,
                skipped_reason_code=payload.skipped_reason_code,
            )
            self._recalculate_user_day_activity_log(conn, user_id, payload.date)
            conn.commit()

        return {"result": "ok"}

    def get_challenge_enrollment_detail(
        self,
        user_id: str,
        enrollment_id: str,
    ) -> ChallengeEnrollmentDetailResponse:
        with self._connect() as conn:
            enrollment_row = conn.execute(
                """
                SELECT
                  ce.enrollment_id,
                  ce.challenge_id,
                  ce.status,
                  ce.target_days,
                  ce.scheduled_start_date,
                  ce.scheduled_end_date,
                  ce.reminder_time_local,
                  ce.started_at,
                  ce.ended_at,
                  cc.name_ko,
                  cc.status,
                  cc.domain,
                  cc.challenge_type,
                  cc.program_type,
                  cc.default_target_days,
                  cc.difficulty_level,
                  cc.summary_ko
                FROM challenge_enrollment ce
                JOIN challenge_catalog cc ON cc.challenge_id = ce.challenge_id
                WHERE ce.user_id = ? AND ce.enrollment_id = ?
                """,
                (user_id, enrollment_id),
            ).fetchone()
            if not enrollment_row:
                raise ValueError("enrollment_not_found")

            enrollment = self._row_to_enrollment_response(enrollment_row)
            challenge = ChallengeCatalogItem(
                challenge_id=str(enrollment_row["challenge_id"]),
                name_ko=str(enrollment_row["name_ko"]),
                status=str(enrollment_row["status"]),
                domain=str(enrollment_row["domain"]),
                challenge_type=ChallengeType(str(enrollment_row["challenge_type"])),
                program_type=ChallengeProgramType(str(enrollment_row["program_type"])),
                default_target_days=int(enrollment_row["default_target_days"]),
                difficulty_level=str(enrollment_row["difficulty_level"]),
                summary_ko=str(enrollment_row["summary_ko"]),
            )
            reason_tuple = CHALLENGE_REASON_BY_ID.get(challenge.challenge_id)
            recommendation = (
                ChallengeRecommendationItem(
                    **challenge.model_dump(),
                    session_status=ChallengeSessionStatus.recommended,
                    reason_code=reason_tuple[0] if reason_tuple else None,
                    reason_copy_ko=reason_tuple[1] if reason_tuple else None,
                )
                if reason_tuple
                else None
            )

            day_rows = conn.execute(
                """
                SELECT
                  log_id,
                  enrollment_id,
                  challenge_id,
                  date,
                  day_status,
                  completed_flag,
                  pre_mood_1_5,
                  pre_anxiety_1_5,
                  post_mood_1_5,
                  post_anxiety_1_5,
                  helpfulness_0_10,
                  effort_0_10,
                  reflection_note,
                  skipped_reason_code,
                  created_at,
                  updated_at
                FROM challenge_day_log
                WHERE user_id = ? AND enrollment_id = ?
                ORDER BY date ASC
                """,
                (user_id, enrollment_id),
            ).fetchall()

        day_log_map: dict[str, ChallengeDayLogResponse] = {}
        for row in day_rows:
            item = ChallengeDayLogResponse(
                day_log_id=str(row["log_id"]),
                enrollment_id=str(row["enrollment_id"]),
                challenge_id=str(row["challenge_id"]),
                date=date.fromisoformat(str(row["date"])),
                day_status=ChallengeDayStatus(str(row["day_status"])),
                completed_flag=bool(row["completed_flag"]),
                pre_mood_1_5=int(row["pre_mood_1_5"]) if row["pre_mood_1_5"] is not None else None,
                pre_anxiety_1_5=int(row["pre_anxiety_1_5"]) if row["pre_anxiety_1_5"] is not None else None,
                post_mood_1_5=int(row["post_mood_1_5"]) if row["post_mood_1_5"] is not None else None,
                post_anxiety_1_5=int(row["post_anxiety_1_5"]) if row["post_anxiety_1_5"] is not None else None,
                helpfulness_0_10=int(row["helpfulness_0_10"]) if row["helpfulness_0_10"] is not None else None,
                effort_0_10=int(row["effort_0_10"]) if row["effort_0_10"] is not None else None,
                reflection_note=str(row["reflection_note"]) if row["reflection_note"] else None,
                skipped_reason_code=str(row["skipped_reason_code"]) if row["skipped_reason_code"] else None,
                created_at=datetime.fromisoformat(str(row["created_at"])),
                updated_at=datetime.fromisoformat(str(row["updated_at"])),
            )
            day_log_map[item.date.isoformat()] = item

        progress_days = []
        done_days = 0
        today_local = date.today()
        for index in range(enrollment.target_days):
            target_date = enrollment.scheduled_start_date + timedelta(days=index)
            target_key = target_date.isoformat()
            detail = day_log_map.get(target_key)

            if detail:
                status = detail.day_status
            elif target_date < today_local:
                status = ChallengeDayStatus.missed
            else:
                status = ChallengeDayStatus.pending

            completed_flag = status in {ChallengeDayStatus.done, ChallengeDayStatus.late}
            if completed_flag:
                done_days += 1

            progress_days.append(
                {
                    "date": target_date,
                    "day_number": index + 1,
                    "day_status": status,
                    "completed_flag": completed_flag,
                    "detail": detail,
                }
            )

        progress_ratio = round(done_days / max(enrollment.target_days, 1), 4)
        remaining_days = max(enrollment.target_days - done_days, 0)
        return ChallengeEnrollmentDetailResponse(
            enrollment=enrollment,
            challenge=challenge,
            recommendation=recommendation,
            template_steps=CHALLENGE_TEMPLATE_STEPS.get(challenge.challenge_id, []),
            progress_days=progress_days,
            progress_ratio=progress_ratio,
            done_days=done_days,
            remaining_days=remaining_days,
        )

    def create_journal(self, user_id: str, payload: JournalCreateRequest) -> JournalEntryResponse:
        entry_date = payload.entry_date or date.today()
        title = payload.title.strip() if payload.title else None
        category_tags = self._normalize_journal_category_tags(payload.category_tags)
        preview_text = self._journal_preview(payload.body)
        journal_id = f"jrn_{uuid.uuid4().hex}"
        now_iso = self._now_iso()

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO journal_entry (
                  journal_id,
                  user_id,
                  entry_date,
                  title,
                  category_tags_json,
                  body,
                  preview_text,
                  status,
                  created_at,
                  updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    journal_id,
                    user_id,
                    entry_date.isoformat(),
                    title,
                    json.dumps(category_tags, ensure_ascii=False),
                    payload.body,
                    preview_text,
                    JournalStatus.active.value,
                    now_iso,
                    now_iso,
                ),
            )
            self._recalculate_user_day_activity_log(conn, user_id, entry_date)
            conn.commit()

        return self.get_journal_detail(user_id, journal_id)

    def list_journal(
        self,
        user_id: str,
        query: str | None,
        start_date: date | None,
        end_date: date | None,
        category_tags: list[str] | None = None,
    ) -> list[JournalListItemResponse]:
        filters = ["user_id = ?", "status = 'active'"]
        params: list[object] = [user_id]
        selected_tags = self._normalize_journal_category_tags(category_tags)

        if query:
            filters.append("(title LIKE ? OR body LIKE ?)")
            like_query = f"%{query}%"
            params.extend([like_query, like_query])

        if start_date:
            filters.append("entry_date >= ?")
            params.append(start_date.isoformat())

        if end_date:
            filters.append("entry_date <= ?")
            params.append(end_date.isoformat())

        where_clause = " AND ".join(filters)

        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT
                  journal_id,
                  user_id,
                  entry_date,
                  title,
                  category_tags_json,
                  preview_text,
                  status,
                  created_at,
                  updated_at
                FROM journal_entry
                WHERE {where_clause}
                ORDER BY entry_date DESC, updated_at DESC
                """,
                params,
            ).fetchall()

            active_tags = set(self._load_active_journal_category_tags(conn))

        items: list[JournalListItemResponse] = []
        for row in rows:
            parsed_tags = self._parse_category_tags_json(row["category_tags_json"])
            searchable_tags = self._searchable_category_tags(parsed_tags, active_tags)
            if selected_tags and not any(tag in searchable_tags for tag in selected_tags):
                continue

            items.append(
                JournalListItemResponse(
                    journal_id=str(row["journal_id"]),
                    user_id=str(row["user_id"]),
                    entry_date=date.fromisoformat(str(row["entry_date"])),
                    title=row["title"],
                    category_tags=parsed_tags,
                    searchable_category_tags=searchable_tags,
                    preview_text=str(row["preview_text"]),
                    status=JournalStatus(str(row["status"])),
                    created_at=datetime.fromisoformat(str(row["created_at"])),
                    updated_at=datetime.fromisoformat(str(row["updated_at"])),
                )
            )

        return items

    def get_journal_detail(self, user_id: str, journal_id: str) -> JournalEntryResponse:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT
                  journal_id,
                  user_id,
                  entry_date,
                  title,
                  category_tags_json,
                  body,
                  preview_text,
                  status,
                  created_at,
                  updated_at
                FROM journal_entry
                WHERE journal_id = ? AND user_id = ?
                """,
                (journal_id, user_id),
            ).fetchone()

            if not row:
                raise ValueError("journal_not_found")

            active_tags = set(self._load_active_journal_category_tags(conn))
            parsed_tags = self._parse_category_tags_json(row["category_tags_json"])

            return JournalEntryResponse(
                journal_id=str(row["journal_id"]),
                user_id=str(row["user_id"]),
                entry_date=date.fromisoformat(str(row["entry_date"])),
                title=row["title"],
                category_tags=parsed_tags,
                searchable_category_tags=self._searchable_category_tags(parsed_tags, active_tags),
                body=str(row["body"]),
                preview_text=str(row["preview_text"]),
                status=JournalStatus(str(row["status"])),
                created_at=datetime.fromisoformat(str(row["created_at"])),
                updated_at=datetime.fromisoformat(str(row["updated_at"])),
            )

    def update_journal(
        self,
        user_id: str,
        journal_id: str,
        payload: JournalUpdateRequest,
    ) -> JournalEntryResponse:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT entry_date, title, body, status, category_tags_json
                FROM journal_entry
                WHERE journal_id = ? AND user_id = ?
                """,
                (journal_id, user_id),
            ).fetchone()
            if not row:
                raise ValueError("journal_not_found")

            old_entry_date = date.fromisoformat(str(row["entry_date"]))

            next_entry_date = payload.entry_date or old_entry_date
            next_title = payload.title.strip() if payload.title is not None and payload.title else None
            next_body = payload.body if payload.body is not None else str(row["body"])
            next_category_tags = (
                self._normalize_journal_category_tags(payload.category_tags)
                if payload.category_tags is not None
                else self._parse_category_tags_json(row["category_tags_json"])
            )
            next_preview = self._journal_preview(next_body)

            conn.execute(
                """
                UPDATE journal_entry
                SET entry_date = ?, title = ?, category_tags_json = ?, body = ?, preview_text = ?, updated_at = ?
                WHERE journal_id = ? AND user_id = ?
                """,
                (
                    next_entry_date.isoformat(),
                    next_title,
                    json.dumps(next_category_tags, ensure_ascii=False),
                    next_body,
                    next_preview,
                    self._now_iso(),
                    journal_id,
                    user_id,
                ),
            )
            self._recalculate_user_day_activity_log(conn, user_id, old_entry_date)
            self._recalculate_user_day_activity_log(conn, user_id, next_entry_date)
            conn.commit()

        return self.get_journal_detail(user_id, journal_id)

    def delete_journal(self, user_id: str, journal_id: str) -> dict[str, str]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT entry_date
                FROM journal_entry
                WHERE journal_id = ? AND user_id = ?
                """,
                (journal_id, user_id),
            ).fetchone()
            if not row:
                raise ValueError("journal_not_found")

            entry_date = date.fromisoformat(str(row["entry_date"]))
            conn.execute(
                """
                UPDATE journal_entry
                SET status = ?, updated_at = ?
                WHERE journal_id = ? AND user_id = ?
                """,
                (JournalStatus.deleted.value, self._now_iso(), journal_id, user_id),
            )
            self._recalculate_user_day_activity_log(conn, user_id, entry_date)
            conn.commit()

        return {"result": "deleted"}

    def get_journal_category_options(self, user_id: str) -> JournalCategoryOptionsResponse:
        with self._connect() as conn:
            active_tags = self._load_active_journal_category_tags(conn)
            active_set = set(active_tags)

            rows = conn.execute(
                """
                SELECT category_tags_json
                FROM journal_entry
                WHERE user_id = ? AND status = 'active'
                """,
                (user_id,),
            ).fetchall()

        used_tags: set[str] = set()
        for row in rows:
            used_tags.update(self._parse_category_tags_json(row["category_tags_json"]))

        inactive_used_tags = sorted(tag for tag in used_tags if tag not in active_set)
        return JournalCategoryOptionsResponse(
            active_tags=active_tags,
            inactive_used_tags=inactive_used_tags,
        )

    def _recalculate_user_day_activity_log(
        self,
        conn: sqlite3.Connection,
        user_id: str,
        target_date: date,
    ) -> None:
        date_key = target_date.isoformat()

        checkin_row = conn.execute(
            """
            SELECT dc.current_version_id
            FROM daily_checkin dc
            WHERE dc.user_id = ? AND dc.date = ? AND dc.status = 'submitted'
            """,
            (user_id, date_key),
        ).fetchone()
        has_checkin = bool(checkin_row)
        checkin_preview = None
        if checkin_row:
            payload_row = conn.execute(
                """
                SELECT payload_json
                FROM daily_checkin_version
                WHERE checkin_version_id = ?
                """,
                (str(checkin_row["current_version_id"]),),
            ).fetchone()
            if payload_row:
                payload_json = json.loads(str(payload_row["payload_json"]))
                mood = payload_json.get("mood_1_5")
                anxiety = payload_json.get("anxiety_1_5")
                energy = payload_json.get("energy_1_5")
                checkin_preview = f"기분 {mood}/5 · 불안 {anxiety}/5 · 에너지 {energy}/5"

        challenge_completed_row = conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM challenge_day_log
            WHERE user_id = ? AND date = ? AND completed_flag = 1
            """,
            (user_id, date_key),
        ).fetchone()
        challenge_completed_count = int(challenge_completed_row["cnt"]) if challenge_completed_row else 0

        challenge_any_row = conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM challenge_day_log
            WHERE user_id = ? AND date = ?
            """,
            (user_id, date_key),
        ).fetchone()
        has_challenge_activity = int(challenge_any_row["cnt"]) > 0 if challenge_any_row else False

        active_challenge_row = conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM challenge_enrollment
            WHERE user_id = ?
              AND status = 'active'
              AND date(started_at) <= ?
              AND (ended_at IS NULL OR date(ended_at) >= ?)
            """,
            (user_id, date_key, date_key),
        ).fetchone()
        active_challenge_count = int(active_challenge_row["cnt"]) if active_challenge_row else 0

        cbt_row = conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM cbt_session_summary
            WHERE user_id = ? AND date = ?
            """,
            (user_id, date_key),
        ).fetchone()
        cbt_session_count = int(cbt_row["cnt"]) if cbt_row else 0
        has_cbt_activity = cbt_session_count > 0

        journal_rows = conn.execute(
            """
            SELECT journal_id, title, preview_text
            FROM journal_entry
            WHERE user_id = ? AND entry_date = ? AND status = 'active'
            ORDER BY updated_at DESC
            """,
            (user_id, date_key),
        ).fetchall()
        journal_entry_count = len(journal_rows)
        has_journal_entry = journal_entry_count > 0

        assessment_row = conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM periodic_assessment
            WHERE user_id = ?
              AND status IN ('completed', 'late')
              AND date(completed_at) = ?
            """,
            (user_id, date_key),
        ).fetchone()
        has_assessment = int(assessment_row["cnt"]) > 0 if assessment_row else False

        activity_count_total = sum(
            [
                1 if has_checkin else 0,
                1 if has_challenge_activity else 0,
                1 if has_cbt_activity else 0,
                1 if has_journal_entry else 0,
                1 if has_assessment else 0,
            ]
        )

        conn.execute(
            """
            INSERT INTO user_day_activity_log (
              user_id,
              date,
              has_checkin,
              has_challenge_activity,
              challenge_completed_count,
              active_challenge_count,
              has_cbt_activity,
              cbt_session_count,
              has_journal_entry,
              journal_entry_count,
              has_assessment,
              activity_count_total
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, date) DO UPDATE SET
              has_checkin = excluded.has_checkin,
              has_challenge_activity = excluded.has_challenge_activity,
              challenge_completed_count = excluded.challenge_completed_count,
              active_challenge_count = excluded.active_challenge_count,
              has_cbt_activity = excluded.has_cbt_activity,
              cbt_session_count = excluded.cbt_session_count,
              has_journal_entry = excluded.has_journal_entry,
              journal_entry_count = excluded.journal_entry_count,
              has_assessment = excluded.has_assessment,
              activity_count_total = excluded.activity_count_total
            """,
            (
                user_id,
                date_key,
                int(has_checkin),
                int(has_challenge_activity),
                challenge_completed_count,
                active_challenge_count,
                int(has_cbt_activity),
                cbt_session_count,
                int(has_journal_entry),
                journal_entry_count,
                int(has_assessment),
                activity_count_total,
            ),
        )

        conn.execute(
            """
            DELETE FROM user_day_activity_log_item
            WHERE user_id = ? AND date = ?
            """,
            (user_id, date_key),
        )

        if has_checkin:
            conn.execute(
                """
                INSERT INTO user_day_activity_log_item (
                  user_id, date, activity_type, source_id,
                  display_label, preview_text, count_value, detail_route
                ) VALUES (?, ?, 'checkin', NULL, ?, ?, NULL, '/checkin')
                """,
                (user_id, date_key, "체크인 완료", checkin_preview),
            )

        if has_challenge_activity:
            conn.execute(
                """
                INSERT INTO user_day_activity_log_item (
                  user_id, date, activity_type, source_id,
                  display_label, preview_text, count_value, detail_route
                ) VALUES (?, ?, 'challenge', NULL, ?, ?, ?, '/challenge')
                """,
                (
                    user_id,
                    date_key,
                    f"챌린지 수행 {challenge_completed_count}건",
                    "당일 수행 로그가 기록되었습니다.",
                    challenge_completed_count,
                ),
            )

        if has_cbt_activity:
            conn.execute(
                """
                INSERT INTO user_day_activity_log_item (
                  user_id, date, activity_type, source_id,
                  display_label, preview_text, count_value, detail_route
                ) VALUES (?, ?, 'cbt', NULL, ?, ?, ?, '/cbt')
                """,
                (
                    user_id,
                    date_key,
                    f"CBT 세션 {cbt_session_count}회",
                    "세션 요약은 CBT 상세에서 확인할 수 있습니다.",
                    cbt_session_count,
                ),
            )

        if has_journal_entry:
            first_journal = journal_rows[0]
            detail_route = "/journal"
            if journal_entry_count == 1:
                detail_route = f"/journal/{first_journal['journal_id']}"

            conn.execute(
                """
                INSERT INTO user_day_activity_log_item (
                  user_id, date, activity_type, source_id,
                  display_label, preview_text, count_value, detail_route
                ) VALUES (?, ?, 'journal', ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    date_key,
                    str(first_journal["journal_id"]),
                    f"한줄일기 {journal_entry_count}건 작성",
                    str(first_journal["preview_text"]),
                    journal_entry_count,
                    detail_route,
                ),
            )

        if has_assessment:
            latest_assessment = conn.execute(
                """
                SELECT pa.assessment_id, sc.phq9_total, sc.gad7_total, sc.isi_total
                FROM periodic_assessment pa
                LEFT JOIN assessment_score sc ON sc.assessment_id = pa.assessment_id
                WHERE pa.user_id = ?
                  AND pa.status IN ('completed', 'late')
                  AND date(pa.completed_at) = ?
                ORDER BY pa.completed_at DESC
                LIMIT 1
                """,
                (user_id, date_key),
            ).fetchone()
            preview = None
            source_id = None
            if latest_assessment:
                source_id = str(latest_assessment["assessment_id"])
                preview = (
                    f"PHQ-9 {latest_assessment['phq9_total']} · "
                    f"GAD-7 {latest_assessment['gad7_total']} · "
                    f"ISI {latest_assessment['isi_total']}"
                )

            conn.execute(
                """
                INSERT INTO user_day_activity_log_item (
                  user_id, date, activity_type, source_id,
                  display_label, preview_text, count_value, detail_route
                ) VALUES (?, ?, 'assessment', ?, ?, ?, 1, '/assessments')
                """,
                (
                    user_id,
                    date_key,
                    source_id,
                    "설문 1회 완료",
                    preview,
                ),
            )

    @staticmethod
    def _empty_day_summary() -> UserDayActivitySummary:
        return UserDayActivitySummary(
            has_checkin=False,
            has_challenge_activity=False,
            challenge_completed_count=0,
            active_challenge_count=0,
            has_cbt_activity=False,
            cbt_session_count=0,
            has_journal_entry=False,
            journal_entry_count=0,
            has_assessment=False,
            activity_count_total=0,
        )

    def _load_items(
        self,
        conn: sqlite3.Connection,
        user_id: str,
        target_date: date,
        activity_filter: ActivityFilter,
    ) -> list[UserDayActivityItem]:
        filters = ["user_id = ?", "date = ?"]
        params: list[object] = [user_id, target_date.isoformat()]

        if activity_filter != ActivityFilter.all:
            filters.append("activity_type = ?")
            params.append(activity_filter.value)

        where_clause = " AND ".join(filters)

        rows = conn.execute(
            f"""
            SELECT activity_type, display_label, preview_text, count_value, detail_route
            FROM user_day_activity_log_item
            WHERE {where_clause}
            ORDER BY activity_type ASC
            """,
            params,
        ).fetchall()

        return [
            UserDayActivityItem(
                activity_type=ActivityFilter(str(row["activity_type"])),
                display_label=str(row["display_label"]),
                preview_text=row["preview_text"],
                count=row["count_value"],
                detail_route=str(row["detail_route"]),
            )
            for row in rows
        ]

    def get_activity_log(
        self,
        user_id: str,
        start_date: date,
        end_date: date,
        activity_filter: ActivityFilter,
        view: ActivityView,
    ) -> list[UserDayActivityLogResponse]:
        if end_date < start_date:
            raise ValueError("invalid_date_range")

        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT
                  date,
                  has_checkin,
                  has_challenge_activity,
                  challenge_completed_count,
                  active_challenge_count,
                  has_cbt_activity,
                  cbt_session_count,
                  has_journal_entry,
                  journal_entry_count,
                  has_assessment,
                  activity_count_total
                FROM user_day_activity_log
                WHERE user_id = ? AND date BETWEEN ? AND ?
                ORDER BY date DESC
                """,
                (user_id, start_date.isoformat(), end_date.isoformat()),
            ).fetchall()

            row_map: dict[date, sqlite3.Row] = {
                date.fromisoformat(str(row["date"])): row for row in rows
            }

            selected_dates: list[date]
            if view == ActivityView.calendar:
                selected_dates = []
                cursor = start_date
                while cursor <= end_date:
                    selected_dates.append(cursor)
                    cursor += timedelta(days=1)
                selected_dates.sort(reverse=True)
            else:
                selected_dates = list(row_map.keys())
                selected_dates.sort(reverse=True)

            response: list[UserDayActivityLogResponse] = []
            for target_date in selected_dates:
                row = row_map.get(target_date)
                summary = (
                    UserDayActivitySummary(
                        has_checkin=bool(row["has_checkin"]),
                        has_challenge_activity=bool(row["has_challenge_activity"]),
                        challenge_completed_count=int(row["challenge_completed_count"]),
                        active_challenge_count=int(row["active_challenge_count"]),
                        has_cbt_activity=bool(row["has_cbt_activity"]),
                        cbt_session_count=int(row["cbt_session_count"]),
                        has_journal_entry=bool(row["has_journal_entry"]),
                        journal_entry_count=int(row["journal_entry_count"]),
                        has_assessment=bool(row["has_assessment"]),
                        activity_count_total=int(row["activity_count_total"]),
                    )
                    if row
                    else self._empty_day_summary()
                )

                if view == ActivityView.list:
                    if summary.activity_count_total == 0:
                        continue
                    if activity_filter != ActivityFilter.all:
                        flag_map = {
                            ActivityFilter.checkin: summary.has_checkin,
                            ActivityFilter.challenge: summary.has_challenge_activity,
                            ActivityFilter.cbt: summary.has_cbt_activity,
                            ActivityFilter.journal: summary.has_journal_entry,
                            ActivityFilter.assessment: summary.has_assessment,
                        }
                        if not flag_map[activity_filter]:
                            continue

                items = self._load_items(conn, user_id, target_date, activity_filter)
                response.append(
                    UserDayActivityLogResponse(
                        user_id=user_id,
                        date=target_date,
                        summary=summary,
                        items=items,
                    )
                )

            return response
