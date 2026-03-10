from __future__ import annotations

import calendar
import json
import os
import sqlite3
import statistics
import uuid
import zlib
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from app.core_inputs.store import CoreInputStore

from .cbt.engine import CbtThoughtRecordEngine
from .models import (
    ActivityCalendar,
    ActivityCalendarDay,
    ActivityCbtSummary,
    ActivityChallengeSummary,
    ActivityDashboardResponse,
    ActivityDataDensity,
    ActivitySummaryCards,
    ActivitySurveySummary,
    CbtActionKind,
    CbtConversationBootstrapResponse,
    CbtConversationMessage,
    CbtConversationTurnRequest,
    CbtConversationTurnResponse,
    CbtPlannerAction,
    CbtReflectionStatus,
    CbtReflectionUpsertRequest,
    CbtRiskFlags,
    CbtRiskSignalResponse,
    CbtRiskSignalUpsertRequest,
    CbtSessionCreateRequest,
    CbtSessionResponse,
    CbtSessionSummaryCard,
    CbtTodoUpsertRequest,
    DashboardSymptomMode,
    DataDensity,
    ReportAssessments,
    ReportAssessmentsHistoryItem,
    ReportAssessmentsLatest,
    ReportCbtSummary,
    ReportChallengeCompletedItem,
    ReportChallengeDroppedItem,
    ReportChallengeSummary,
    ReportComputed,
    ReportExportFormat,
    ReportPeriod,
    ReportRiskEvent,
    ReportRiskSummary,
    ReportSourceDensity,
    ReportSummaryExportRequest,
    ReportSummaryResponse,
    ReportSummarySaveRequest,
    ReportSummarySaveResponse,
    ReportSymptomPoint,
    SymptomDashboardResponse,
    SymptomMetric,
    SymptomPoint,
    SymptomSeries,
    SymptomSummary,
)

SLEEP_TOTAL_TO_MINUTES = {
    "lt_4h": 210,
    "h4_5": 270,
    "h5_6": 330,
    "h6_7": 390,
    "h7_8": 450,
    "ge_8h": 510,
}

SLEEP_TOTAL_INSOMNIA_SCORE = {
    "lt_4h": 92,
    "h4_5": 78,
    "h5_6": 62,
    "h6_7": 46,
    "h7_8": 28,
    "ge_8h": 34,
}

SLEEP_LATENCY_TO_MINUTES = {
    "le_15m": 8,
    "m15_30": 23,
    "m30_60": 45,
    "ge_60m": 75,
}

SLEEP_LATENCY_INSOMNIA_SCORE = {
    "le_15m": 12,
    "m15_30": 28,
    "m30_60": 48,
    "ge_60m": 72,
}

ACTIVITY_BUCKET_TO_MINUTES = {
    "m0": 0,
    "m1_9": 5,
    "m10_29": 20,
    "ge_30": 35,
}


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


CBT_ACTION_DEFAULTS: dict[CbtPlannerAction, dict[str, str | None]] = {
    CbtPlannerAction.review_evidence: {
        "kind": CbtActionKind.external.value,
        "title": "생각 근거 정리",
        "description": "오늘 떠오른 생각의 맞는 이유와 다르게 볼 이유를 1개씩 적어보세요.",
        "route": None,
    },
    CbtPlannerAction.behavior_experiment: {
        "kind": CbtActionKind.external.value,
        "title": "작은 행동 실험",
        "description": "부담이 낮은 행동을 1회 시도하고 실제 결과를 짧게 기록해보세요.",
        "route": None,
    },
    CbtPlannerAction.grounding: {
        "kind": CbtActionKind.challenge.value,
        "title": "감각 안정 챌린지",
        "description": "호흡/감각 안정 루틴으로 긴장을 낮추는 챌린지를 시작해보세요.",
        "route": "/challenge",
    },
    CbtPlannerAction.activity_scheduling: {
        "kind": CbtActionKind.challenge.value,
        "title": "산책 10분 챌린지",
        "description": "짧은 활동 스케줄링으로 리듬을 회복하는 챌린지를 시도해보세요.",
        "route": "/challenge",
    },
    CbtPlannerAction.sleep_anchor: {
        "kind": CbtActionKind.challenge.value,
        "title": "수면 패턴 챌린지",
        "description": "취침/기상 루틴을 일정하게 유지하는 수면 챌린지를 시작해보세요.",
        "route": "/challenge",
    },
    CbtPlannerAction.support_contact: {
        "kind": CbtActionKind.external.value,
        "title": "지지자 연결",
        "description": "믿을 수 있는 사람에게 현재 상태를 짧게 공유해보세요.",
        "route": None,
    },
}


class InsightsStore:
    def __init__(self, database_path: Path):
        self.database_path = database_path
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._modeling_store = None
        # Reuse base schema from core input module.
        CoreInputStore(database_path)
        self._cbt_state_schema = self._load_cbt_state_schema()
        self._cbt_engine = CbtThoughtRecordEngine()
        self._initialize_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(UTC).isoformat()

    def _get_modeling_store(self):
        if self._modeling_store is not None:
            return self._modeling_store

        from app.modeling.store import ModelingStore

        default_bundle_dir = Path(__file__).resolve().parents[4] / "model"
        model_bundle_dir = Path(
            os.getenv("MODEL_BUNDLE_DIR", str(default_bundle_dir))
        ).resolve()
        self._modeling_store = ModelingStore(
            database_path=self.database_path,
            model_bundle_dir=model_bundle_dir,
        )
        return self._modeling_store

    def _refresh_nowcast_prediction(
        self,
        user_id: str,
        *,
        reference_date: date,
        force: bool,
    ) -> None:
        try:
            self._get_modeling_store().ensure_nowcast_prediction_from_sources(
                user_id=user_id,
                reference_date=reference_date,
                force=force,
            )
        except ValueError:
            return

    @staticmethod
    def _assistant_message(content: str, sender_name: str) -> CbtConversationMessage:
        return CbtConversationMessage(
            role="assistant",
            content=content,
            sender_name=sender_name,
            message_id=f"asst_{uuid.uuid4().hex}",
        )

    @staticmethod
    def _load_cbt_state_schema() -> dict[str, object]:
        schema_path = (
            Path(__file__).resolve().parents[4]
            / "blueprint"
            / "cbt"
            / "02_domain"
            / "cbt_state_schema.json"
        )
        with schema_path.open("r", encoding="utf-8-sig") as handle:
            return json.load(handle)

    @staticmethod
    def _ensure_columns(conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
        existing = {
            str(row["name"])
            for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
        }
        for column_name, column_def in columns.items():
            if column_name in existing:
                continue
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column_name} {column_def}")

    def _initialize_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS cbt_session_summary (
                  session_id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL,
                  date TEXT NOT NULL,
                  started_at TEXT NOT NULL,
                  ended_at TEXT,
                  status TEXT NOT NULL DEFAULT 'completed',
                  module_id TEXT NOT NULL DEFAULT 'thought_record',
                  context_text TEXT,
                  mood_label TEXT,
                  mood_intensity_0_100 INTEGER,
                  duration_sec INTEGER,
                  emotion_intensity_pre_0_100 INTEGER,
                  emotion_intensity_post_0_100 INTEGER,
                  belief_pre_0_100 INTEGER,
                  belief_post_0_100 INTEGER,
                  distortion_total_count INTEGER,
                  reframe_quality_0_5 INTEGER,
                  homework_commitment_0_10 INTEGER,
                  homework_completed_prev_flag INTEGER,
                  session_helpfulness_0_10 INTEGER,
                  planner_action TEXT,
                  topic_label TEXT,
                  summary_label TEXT,
                  selected_action_kind TEXT NOT NULL DEFAULT 'none',
                  selected_action_title TEXT,
                  selected_action_description TEXT,
                  selected_action_route TEXT,
                  reflection_status TEXT NOT NULL DEFAULT 'not_applicable',
                  reflection_performed_flag INTEGER,
                  reflection_note TEXT,
                  reflection_completed_at TEXT,
                  turn_log_json TEXT,
                  state_json TEXT,
                  created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS cbt_risk_signal (
                  risk_signal_id TEXT PRIMARY KEY,
                  session_id TEXT,
                  user_id TEXT NOT NULL,
                  date TEXT NOT NULL,
                  functional_impairment_flag INTEGER NOT NULL DEFAULT 0,
                  self_harm_flag INTEGER NOT NULL DEFAULT 0,
                  suicide_risk_level INTEGER NOT NULL DEFAULT 0,
                  violence_risk_flag INTEGER NOT NULL DEFAULT 0,
                  risk_source TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS cbt_case_memory (
                  hypothesis_id TEXT PRIMARY KEY,
                  session_id TEXT,
                  user_id TEXT NOT NULL,
                  date TEXT NOT NULL,
                  core_belief_text TEXT,
                  confidence REAL,
                  created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_cbt_summary_user_date
                ON cbt_session_summary(user_id, date DESC);

                CREATE INDEX IF NOT EXISTS idx_cbt_risk_user_date
                ON cbt_risk_signal(user_id, date DESC);

                CREATE TABLE IF NOT EXISTS report_export_vault (
                  report_id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL,
                  period_start TEXT NOT NULL,
                  period_end TEXT NOT NULL,
                  format TEXT NOT NULL,
                  file_name TEXT NOT NULL,
                  content_type TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );
                """
            )
            self._ensure_columns(
                conn,
                "cbt_session_summary",
                {
                    "started_at": "TEXT",
                    "ended_at": "TEXT",
                    "status": "TEXT NOT NULL DEFAULT 'completed'",
                    "module_id": "TEXT NOT NULL DEFAULT 'thought_record'",
                    "context_text": "TEXT",
                    "mood_label": "TEXT",
                    "mood_intensity_0_100": "INTEGER",
                    "duration_sec": "INTEGER",
                    "emotion_intensity_pre_0_100": "INTEGER",
                    "emotion_intensity_post_0_100": "INTEGER",
                    "belief_pre_0_100": "INTEGER",
                    "belief_post_0_100": "INTEGER",
                    "distortion_total_count": "INTEGER",
                    "reframe_quality_0_5": "INTEGER",
                    "homework_commitment_0_10": "INTEGER",
                    "homework_completed_prev_flag": "INTEGER",
                    "session_helpfulness_0_10": "INTEGER",
                    "planner_action": "TEXT",
                    "topic_label": "TEXT",
                    "summary_label": "TEXT",
                    "selected_action_kind": "TEXT",
                    "selected_action_title": "TEXT",
                    "selected_action_description": "TEXT",
                    "selected_action_route": "TEXT",
                    "reflection_status": "TEXT",
                    "reflection_performed_flag": "INTEGER",
                    "reflection_note": "TEXT",
                    "reflection_completed_at": "TEXT",
                    "turn_log_json": "TEXT",
                    "state_json": "TEXT",
                    "created_at": "TEXT",
                },
            )
            conn.execute(
                """
                UPDATE cbt_session_summary
                SET selected_action_kind = COALESCE(NULLIF(selected_action_kind, ''), 'none')
                """
            )
            conn.execute(
                """
                UPDATE cbt_session_summary
                SET reflection_status = COALESCE(NULLIF(reflection_status, ''), 'not_applicable')
                """
            )
            conn.commit()

    def _save_report_export_meta(
        self,
        user_id: str,
        period_start: date,
        period_end: date,
        export_format: str,
        file_name: str,
        content_type: str,
    ) -> ReportSummarySaveResponse:
        report_id = f"rpt_{uuid.uuid4().hex}"
        created_at = self._now_iso()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO report_export_vault (
                  report_id,
                  user_id,
                  period_start,
                  period_end,
                  format,
                  file_name,
                  content_type,
                  created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    report_id,
                    user_id,
                    period_start.isoformat(),
                    period_end.isoformat(),
                    export_format,
                    file_name,
                    content_type,
                    created_at,
                ),
            )
            conn.commit()

        return ReportSummarySaveResponse(
            report_id=report_id,
            period_start=period_start,
            period_end=period_end,
            format=export_format,
            file_name=file_name,
            content_type=content_type,
            created_at=datetime.fromisoformat(created_at),
        )

    def _validate_schema(self, schema: dict[str, object], payload: object, path: str = "$") -> None:
        schema_type = schema.get("type")

        if schema_type == "object":
            if not isinstance(payload, dict):
                raise ValueError(f"invalid_cbt_state_schema:{path}")

            properties = schema.get("properties", {})
            if isinstance(properties, dict):
                for key, value in payload.items():
                    if key not in properties:
                        continue
                    child = properties[key]
                    if isinstance(child, dict):
                        self._validate_schema(child, value, f"{path}.{key}")
            return

        if schema_type == "array":
            if not isinstance(payload, list):
                raise ValueError(f"invalid_cbt_state_schema:{path}")

            child_schema = schema.get("items")
            if isinstance(child_schema, dict):
                for index, item in enumerate(payload):
                    self._validate_schema(child_schema, item, f"{path}[{index}]")
            return

        if schema_type == "string" and not isinstance(payload, str):
            raise ValueError(f"invalid_cbt_state_schema:{path}")

        if schema_type == "integer" and (not isinstance(payload, int) or isinstance(payload, bool)):
            raise ValueError(f"invalid_cbt_state_schema:{path}")

        if schema_type == "number" and (
            not isinstance(payload, (int, float)) or isinstance(payload, bool)
        ):
            raise ValueError(f"invalid_cbt_state_schema:{path}")

        if schema_type == "boolean" and not isinstance(payload, bool):
            raise ValueError(f"invalid_cbt_state_schema:{path}")

    @staticmethod
    def _extract_risk_flags(state: dict[str, object]) -> CbtRiskFlags:
        raw = state.get("risk_flags")
        if not isinstance(raw, dict):
            return CbtRiskFlags()

        return CbtRiskFlags(
            functional_impairment_flag=bool(raw.get("functional_impairment_flag", False)),
            self_harm_flag=bool(raw.get("self_harm_flag", False)),
            suicide_risk_level=int(raw.get("suicide_risk_level", 0) or 0),
            violence_risk_flag=bool(raw.get("violence_risk_flag", False)),
        )

    @staticmethod
    def _resolve_risk_level(flags: CbtRiskFlags) -> int:
        level = flags.suicide_risk_level
        if flags.self_harm_flag:
            level = max(level, 2)
        if flags.violence_risk_flag:
            level = max(level, 2)
        if flags.functional_impairment_flag:
            level = max(level, 1)
        return int(_clamp(level, 0, 3))

    @staticmethod
    def _functional_impairment_detail(
        conn: sqlite3.Connection,
        user_id: str,
        target_date: str,
    ) -> str:
        row = conn.execute(
            """
            SELECT mood_1_5, anxiety_1_5, energy_1_5, sleep_total_midpoint_hours
            FROM daily_checkin_features_daily
            WHERE user_id = ?
              AND date = ?
            """,
            (user_id, target_date),
        ).fetchone()

        if not row:
            return "일상 기능 전반"

        areas: list[str] = []
        sleep_hours = row["sleep_total_midpoint_hours"]
        mood = row["mood_1_5"]
        anxiety = row["anxiety_1_5"]
        energy = row["energy_1_5"]

        if sleep_hours is not None and float(sleep_hours) < 6.0:
            areas.append("수면/피로")
        if energy is not None and int(energy) <= 2:
            areas.append("집중/활력")
        if anxiety is not None and int(anxiety) >= 4:
            areas.append("긴장/불안 조절")
        if mood is not None and int(mood) <= 2:
            areas.append("기분 회복")

        if not areas:
            return "일상 기능 전반"
        return ", ".join(areas)

    @staticmethod
    def _infer_topic_label(state: dict[str, object]) -> str:
        situation = str(state.get("situation") or "").lower()
        if any(keyword in situation for keyword in ["잠", "수면", "insomnia", "sleep"]):
            return "sleep"
        if any(keyword in situation for keyword in ["업무", "회사", "일", "work"]):
            return "work"
        if any(keyword in situation for keyword in ["관계", "대인", "가족", "friend"]):
            return "relationship"
        if any(keyword in situation for keyword in ["불안", "초조", "anxiety"]):
            return "anxiety"
        return "general"

    @staticmethod
    def _distortion_total_count(state: dict[str, object]) -> int:
        values = state.get("distortion_candidates")
        if isinstance(values, list):
            return len(values)
        return 0

    @staticmethod
    def _summary_label(state: dict[str, object]) -> str:
        thoughts = state.get("automatic_thoughts")
        if isinstance(thoughts, list):
            for thought in thoughts:
                if isinstance(thought, str) and thought.strip():
                    return thought.strip()[:120]

        situation = str(state.get("situation") or "").strip()
        if situation:
            return situation[:120]

        return "cbt_session"

    @staticmethod
    def _first_nonempty_text(values: object) -> str | None:
        if isinstance(values, list):
            for value in values:
                if isinstance(value, str) and value.strip():
                    return value.strip()
                if isinstance(value, dict):
                    candidate = str(value.get("text") or "").strip()
                    if candidate:
                        return candidate
        if isinstance(values, str) and values.strip():
            return values.strip()
        return None

    @staticmethod
    def _collect_text_candidates(values: object) -> list[str]:
        items: list[str] = []
        if isinstance(values, list):
            for value in values:
                if isinstance(value, str) and value.strip():
                    items.append(value.strip())
                    continue
                if isinstance(value, dict):
                    candidate = str(value.get("text") or "").strip()
                    if candidate:
                        items.append(candidate)
        elif isinstance(values, str) and values.strip():
            items.append(values.strip())
        return items

    @staticmethod
    def _normalize_for_compare(text: str | None) -> str:
        if not text:
            return ""
        compact = text.strip().lower().replace(" ", "")
        for token in ("\n", "\r", "\t", ".", ",", "!", "?", "…", ":", ";", "'", '"'):
            compact = compact.replace(token, "")
        return compact

    @staticmethod
    def _format_single_sentence(text: str) -> str:
        normalized = " ".join(text.replace("\n", " ").split()).strip()
        if len(normalized) <= 140:
            return normalized
        return normalized[:140].rstrip()

    @classmethod
    def _finalize_core_belief_sentence(cls, text: str) -> str:
        sentence = cls._format_single_sentence(text)
        compact = cls._normalize_for_compare(sentence)
        if not compact:
            return sentence

        if sentence.endswith("라는 믿음"):
            sentence = sentence[: -len("라는 믿음")]
        elif sentence.endswith("이라는 믿음"):
            sentence = sentence[: -len("이라는 믿음")]
        elif sentence.endswith("믿음"):
            sentence = sentence[: -len("믿음")]

        sentence = sentence.strip(" .")

        if sentence.endswith("이라는"):
            sentence = f"{sentence[: -len('이라는')]}이다"
        elif sentence.endswith("라는"):
            sentence = f"{sentence[: -len('라는')]}이다"
        elif sentence.endswith("다는"):
            sentence = f"{sentence[: -len('는')]}"
        elif sentence.endswith(("사람", "존재", "상태", "결론")):
            sentence = f"{sentence}이다"
        elif not sentence.endswith("다"):
            sentence = f"{sentence}다"

        return cls._format_single_sentence(sentence)

    @classmethod
    def _is_same_or_overlapping_sentence(cls, left: str | None, right: str | None) -> bool:
        left_norm = cls._normalize_for_compare(left)
        right_norm = cls._normalize_for_compare(right)
        if not left_norm or not right_norm:
            return False
        if left_norm == right_norm:
            return True
        shorter, longer = (
            (left_norm, right_norm) if len(left_norm) <= len(right_norm) else (right_norm, left_norm)
        )
        if len(shorter) < 6:
            return False
        if shorter in longer:
            return (len(shorter) / max(len(longer), 1)) >= 0.55
        return False

    @classmethod
    def _looks_like_situation_sentence(cls, sentence: str) -> bool:
        compact = cls._normalize_for_compare(sentence)
        if not compact:
            return False
        situation_markers = (
            "오늘",
            "어제",
            "회의",
            "통화",
            "출근",
            "퇴근",
            "상황",
            "사건",
            "일이",
            "에서",
            "동안",
            "했",
            "했다",
            "있었다",
            "발생",
        )
        thought_markers = (
            "생각",
            "느꼈",
            "느낌",
            "라고",
            "나는",
            "내가",
            "불안",
            "걱정",
            "실패",
            "가치",
            "부족",
            "못하면",
            "안될",
        )
        has_situation_marker = any(marker in compact for marker in situation_markers)
        has_thought_marker = any(marker in compact for marker in thought_markers)
        return has_situation_marker and not has_thought_marker

    @classmethod
    def _infer_belief_from_state(cls, state: dict[str, object], thought: str | None) -> str | None:
        situation = str(state.get("situation") or "")
        combined = f"{thought or ''} {situation}".lower()
        compact = combined.replace(" ", "")

        performance_keywords = (
            "성과",
            "실적",
            "결과",
            "평가",
            "인정",
            "프로젝트",
            "실패",
            "못했",
            "무능",
            "가치없",
        )
        rejection_keywords = ("거절", "무시", "외면", "버림", "관계", "혼자")
        control_keywords = ("통제", "망했", "끝장", "모든것이", "다잘못", "불안정", "무너")
        mistake_keywords = ("실수", "틀렸", "잘못", "부족", "못한다")

        if any(keyword in combined for keyword in performance_keywords):
            return "성과를 내지 못하면 나는 존재 가치가 없다"
        if any(keyword in combined for keyword in rejection_keywords):
            return "거절당하면 나는 사랑받기 어렵다"
        if any(keyword in combined for keyword in control_keywords) or "모든것이잘못" in compact:
            return "완벽하게 통제하지 못하면 모든 것이 무너진다"
        if any(keyword in combined for keyword in mistake_keywords):
            return "실수하면 나는 부족한 사람이다"

        thought_compact = cls._normalize_for_compare(thought)
        if thought_compact:
            if any(token in thought_compact for token in ("가치", "쓸모", "존재", "의미없")):
                return "성과나 평가가 낮으면 내 가치가 줄어든다"
            if any(token in thought_compact for token in ("거절", "버림", "혼자", "외면")):
                return "관계에서 거절당하면 결국 혼자가 된다"
            if any(token in thought_compact for token in ("실패", "잘못", "망", "끝")):
                return "한 번의 실패가 나 전체를 규정한다"
        return None

    @classmethod
    def _to_belief_sentence(cls, text: str, state: dict[str, object], thought: str | None) -> str | None:
        sentence = cls._format_single_sentence(text)
        compact = cls._normalize_for_compare(sentence)
        if not compact:
            return None

        belief_markers = ("믿음", "신념", "가치", "존재가치")
        conditional_markers = ("면", "하면", "않으면")
        too_surface_markers = ("모든것이잘못", "다망", "끝났", "아무의미없")

        if any(marker in compact for marker in too_surface_markers):
            inferred = cls._infer_belief_from_state(state, thought)
            return inferred or cls._finalize_core_belief_sentence(sentence)

        if any(marker in sentence for marker in belief_markers):
            return cls._finalize_core_belief_sentence(sentence)
        if any(marker in sentence for marker in conditional_markers):
            return cls._finalize_core_belief_sentence(sentence)

        inferred = cls._infer_belief_from_state(state, thought)
        if inferred:
            return inferred
        return cls._finalize_core_belief_sentence(sentence)

    @classmethod
    def _automatic_thought_summary(cls, state: dict[str, object]) -> str | None:
        situation = str(state.get("situation") or "").strip()
        situation_norm = cls._normalize_for_compare(situation)

        candidates = cls._collect_text_candidates(state.get("automatic_thoughts"))
        for candidate in candidates:
            candidate_norm = cls._normalize_for_compare(candidate)
            if not candidate_norm:
                continue
            if situation_norm and cls._is_same_or_overlapping_sentence(candidate, situation):
                continue
            if cls._looks_like_situation_sentence(candidate):
                continue
            return cls._format_single_sentence(candidate)

        return None

    @classmethod
    def _core_belief_summary(cls, state: dict[str, object]) -> str | None:
        thought = cls._automatic_thought_summary(state)
        core_message = str(state.get("core_message_text") or "").strip()
        if core_message:
            return cls._to_belief_sentence(core_message, state, thought)

        core = cls._first_nonempty_text(state.get("core_belief_hypotheses"))
        if core:
            return cls._to_belief_sentence(core, state, thought)

        intermediate = cls._first_nonempty_text(state.get("intermediate_belief_hypotheses"))
        if intermediate:
            return cls._to_belief_sentence(intermediate, state, thought)

        return cls._infer_belief_from_state(state, thought)

    @classmethod
    def _thought_summary(cls, state: dict[str, object]) -> str | None:
        # Product semantics: "핵심생각" is the deeper belief/pattern, not the raw situation sentence.
        core_belief = cls._core_belief_summary(state)
        if core_belief:
            return core_belief

        surface_thought = cls._automatic_thought_summary(state)
        if surface_thought:
            return cls._infer_belief_from_state(state, surface_thought)

        return cls._infer_belief_from_state(state, None)

    @classmethod
    def _balanced_statement_summary(cls, state: dict[str, object]) -> str | None:
        thought = cls._thought_summary(state)
        surface_thought = cls._automatic_thought_summary(state)
        evidence_for = cls._first_nonempty_text(state.get("evidence_for"))
        evidence_against = cls._first_nonempty_text(state.get("evidence_against"))

        for key in ("balanced_statement", "helpful_statement", "reframed_statement"):
            value = state.get(key)
            if isinstance(value, str) and value.strip():
                sentence = cls._format_single_sentence(value)
                if cls._looks_like_situation_sentence(sentence):
                    continue
                if cls._is_same_or_overlapping_sentence(sentence, thought):
                    continue
                if cls._is_same_or_overlapping_sentence(sentence, surface_thought):
                    continue
                return sentence
        if evidence_for and evidence_against:
            blended = (
                f"{evidence_for} 같은 이유가 있지만, {evidence_against} 같은 사실도 함께 보며 "
                "한 번에 단정하지 않겠습니다."
            )
            return cls._format_single_sentence(
                blended
            )
        if evidence_against:
            return cls._format_single_sentence(
                f"{evidence_against} 같은 사실도 있으니, 지금 해석을 한 가지로 단정하지 않고 다시 살펴보겠습니다."
            )
        if thought:
            return "지금 떠오른 생각을 사실로 단정하지 않고, 더 균형 있게 다시 살펴보겠습니다."
        return None

    @classmethod
    def _evidence_summary(cls, state: dict[str, object]) -> str | None:
        evidence_for = cls._first_nonempty_text(state.get("evidence_for"))
        evidence_against = cls._first_nonempty_text(state.get("evidence_against"))
        if evidence_for and evidence_against:
            return f"맞다고 느낀 이유: {evidence_for} / 다르게 본 이유: {evidence_against}"
        if evidence_for:
            return f"맞다고 느낀 이유: {evidence_for}"
        if evidence_against:
            return f"다르게 본 이유: {evidence_against}"
        return None

    @staticmethod
    def _resolve_selected_action(
        planner_action: CbtPlannerAction,
        payload: CbtSessionCreateRequest,
    ) -> tuple[CbtActionKind, str, str | None, str | None, CbtReflectionStatus]:
        selected_kind = payload.selected_action_kind
        selected_title = (payload.selected_action_title or "").strip()
        selected_description = (payload.selected_action_description or "").strip() or None
        selected_route = (payload.selected_action_route or "").strip() or None

        if selected_kind == CbtActionKind.none:
            return (
                CbtActionKind.none,
                "정하지 않음",
                None,
                None,
                CbtReflectionStatus.not_applicable,
            )

        if selected_kind in {CbtActionKind.external, CbtActionKind.challenge} and selected_title:
            return (
                selected_kind,
                selected_title,
                selected_description,
                selected_route,
                CbtReflectionStatus.pending,
            )

        defaults = CBT_ACTION_DEFAULTS.get(planner_action, CBT_ACTION_DEFAULTS[CbtPlannerAction.review_evidence])
        return (
            CbtActionKind(str(defaults["kind"])),
            str(defaults["title"] or "TO DO"),
            str(defaults["description"]) if defaults.get("description") else None,
            str(defaults["route"]) if defaults.get("route") else None,
            CbtReflectionStatus.pending,
        )

    @staticmethod
    def _normalize_none_action_title(raw: object) -> str:
        value = str(raw or "").strip()
        if not value:
            return "정하지 않음"
        if value in {"TO DO 정하지 않음", "추천행동 정하지 않음"}:
            return "정하지 않음"
        return value

    @staticmethod
    def _list_count(state: dict[str, object], key: str) -> int:
        value = state.get(key)
        if isinstance(value, list):
            return len(value)
        return 0

    @classmethod
    def _estimate_turn_checkpoints(
        cls,
        state: dict[str, object],
        risk_level: int,
        *,
        previous: tuple[int | None, int | None, int | None, int | None, int | None, int | None] | None = None,
    ) -> tuple[int, int, int, int, int, int]:
        progress = 0
        if str(state.get("situation_text") or state.get("situation") or "").strip():
            progress += 1
        if cls._list_count(state, "automatic_thoughts") > 0 and cls._list_count(state, "emotions") > 0:
            progress += 1
        if cls._list_count(state, "evidence_for") > 0 and cls._list_count(state, "evidence_against") > 0:
            progress += 1
        if str(state.get("alternative_thought") or state.get("balanced_statement") or "").strip():
            progress += 1
        if cls._list_count(state, "behaviors") > 0:
            progress += 1

        risk_penalty = risk_level * 4
        current_emotion = state.get("emotion_intensity_0_100")
        try:
            emotion_post_default = int(_clamp(float(current_emotion), 0, 100)) if current_emotion is not None else int(
                _clamp(74 - (progress * 7) + risk_penalty, 26, 96)
            )
        except (TypeError, ValueError):
            emotion_post_default = int(_clamp(74 - (progress * 7) + risk_penalty, 26, 96))
        belief_post_default = int(_clamp(78 - (progress * 6) + risk_penalty, 28, 97))
        emotion_post = emotion_post_default
        belief_post = belief_post_default

        emotion_pre_default = int(_clamp(max(emotion_post + 10, 72 + risk_penalty), 32, 100))
        belief_pre_default = int(_clamp(max(belief_post + 12, 74 + risk_penalty), 35, 100))
        if previous is not None:
            prev_emotion_pre, _, prev_belief_pre, _, _, _ = previous
            if prev_emotion_pre is not None:
                emotion_pre_default = int(_clamp(prev_emotion_pre, 0, 100))
            if prev_belief_pre is not None:
                belief_pre_default = int(_clamp(prev_belief_pre, 0, 100))

        emotion_pre = emotion_pre_default
        belief_pre = belief_pre_default

        homework_default = int(_clamp(4 + progress + (1 if cls._list_count(state, "behaviors") > 0 else 0), 0, 10))
        helpfulness_default = int(_clamp(5 + progress, 0, 10))
        homework_commitment = homework_default
        helpfulness = helpfulness_default

        return (
            emotion_pre,
            emotion_post,
            belief_pre,
            belief_post,
            homework_commitment,
            helpfulness,
        )

    @staticmethod
    def _latest_user_text(conversation: list[dict[str, str]]) -> str:
        for item in reversed(conversation):
            if item["role"] == "user" and item["content"].strip():
                return item["content"].strip()
        return ""

    def _load_today_record_for_cbt(
        self,
        conn: sqlite3.Connection,
        user_id: str,
        target_date: date,
    ) -> dict[str, object]:
        row = conn.execute(
            """
            SELECT dcv.payload_json
            FROM daily_checkin dc
            LEFT JOIN daily_checkin_version dcv ON dcv.checkin_version_id = dc.current_version_id
            WHERE dc.user_id = ?
              AND dc.status = 'submitted'
              AND dc.date = ?
            """,
            (user_id, target_date.isoformat()),
        ).fetchone()
        if not row or not row["payload_json"]:
            return {"exists": False, "date": target_date.isoformat()}

        payload = json.loads(str(row["payload_json"]))
        mood_1_5 = payload.get("mood_1_5")
        mood_label_map = {
            1: "매우 힘듦",
            2: "조금 힘듦",
            3: "보통",
            4: "괜찮음",
            5: "좋음",
        }
        mood_label = mood_label_map.get(int(mood_1_5), "보통") if isinstance(mood_1_5, int) else "보통"
        mood_intensity = None
        if isinstance(mood_1_5, int):
            mood_intensity = int(_clamp((6 - mood_1_5) * 22, 0, 100))
        sleep_bucket = str(payload.get("sleep_total_bucket") or "")
        sleep_hours = SLEEP_TOTAL_TO_MINUTES.get(sleep_bucket)
        return {
            "exists": True,
            "date": target_date.isoformat(),
            "mood_label": mood_label,
            "mood_intensity_0_100": mood_intensity,
            "sleep_hours": round((sleep_hours or 0) / 60, 1) if sleep_hours else None,
            "energy_1_5": payload.get("energy_1_5"),
            "caffeine_after_2pm_flag": bool(payload.get("caffeine_after_2pm_flag", False)),
            "exercise_bucket": payload.get("exercise_bucket"),
        }

    def _load_profile_snapshot(self, conn: sqlite3.Connection, user_id: str) -> tuple[str, str]:
        try:
            row = conn.execute(
                """
                SELECT nickname, coach_name
                FROM account_user
                WHERE user_id = ?
                """,
                (user_id,),
            ).fetchone()
        except sqlite3.OperationalError:
            return ("나", "마음코치")
        if not row:
            return ("나", "마음코치")
        user_name = str(row["nickname"] or "").strip() or "나"
        coach_name = str(row["coach_name"] or "").strip() or "마음코치"
        return (user_name, coach_name)

    def get_cbt_conversation_bootstrap(self, user_id: str) -> CbtConversationBootstrapResponse:
        with self._connect() as conn:
            today_record = self._load_today_record_for_cbt(conn, user_id, date.today())
            user_name, coach_name = self._load_profile_snapshot(conn, user_id)
        bootstrap = self._cbt_engine.bootstrap(
            today_record=today_record,
            coach_nickname=coach_name,
            user_nickname=user_name,
        )
        self._validate_schema(self._cbt_state_schema, bootstrap.state)
        return CbtConversationBootstrapResponse(
            structured_state_draft=bootstrap.state,
            current_stage=bootstrap.current_stage,
            phase_key=bootstrap.phase_key,
            subphase_key=bootstrap.subphase_key,
            phase_index=bootstrap.phase_index,
            assistant_messages=[
                self._assistant_message(content, coach_name)
                for content in bootstrap.assistant_messages
            ],
            quick_replies=bootstrap.quick_replies,
            action_links=bootstrap.action_links,
            requires_today_record=bootstrap.requires_today_record,
            today_record_route=bootstrap.today_record_route,
        )

    @staticmethod
    def _conversation_items(payload: CbtConversationTurnRequest | CbtSessionCreateRequest) -> list[dict[str, str]]:
        items: list[dict[str, str]] = []
        for message in payload.conversation if isinstance(payload, CbtSessionCreateRequest) else payload.messages:
            content = message.content.strip()
            if not content:
                continue
            items.append({"role": message.role.value, "content": content})
        return items

    def generate_cbt_turn(
        self,
        user_id: str,
        payload: CbtConversationTurnRequest,
    ) -> CbtConversationTurnResponse:
        conversation = self._conversation_items(payload)
        state_payload = payload.state if isinstance(payload.state, dict) else {}
        coach_name = "마음코치"
        with self._connect() as conn:
            _, coach_name = self._load_profile_snapshot(conn, user_id)
        if not state_payload.get("flow_id"):
            bootstrap = self.get_cbt_conversation_bootstrap(user_id)
            state_payload = bootstrap.structured_state_draft
        user_input = (
            (payload.user_input or "").strip()
            or (payload.selected_quick_reply or "").strip()
            or self._latest_user_text(conversation)
        )
        action_id = (payload.quick_reply_action_id or "").strip()
        if not user_input and not action_id:
            raise ValueError("invalid_cbt_state_schema:$.messages")

        turn = self._cbt_engine.process_turn(
            raw_state=state_payload,
            user_input=user_input,
            quick_reply_action_id=action_id or None,
            selected_quick_reply=payload.selected_quick_reply,
        )

        self._validate_schema(self._cbt_state_schema, turn.state)
        risk_flags = self._extract_risk_flags(turn.state)
        risk_level = self._resolve_risk_level(risk_flags)

        previous_values = (
            None,
            None,
            None,
            None,
            None,
            None,
        )
        try:
            previous_values = (
                (
                    int(turn.state.get("emotion_intensity_pre_0_100"))
                    if turn.state.get("emotion_intensity_pre_0_100") is not None
                    else None
                ),
                (
                    int(turn.state.get("emotion_intensity_post_0_100"))
                    if turn.state.get("emotion_intensity_post_0_100") is not None
                    else None
                ),
                (
                    int(turn.state.get("belief_pre_0_100"))
                    if turn.state.get("belief_pre_0_100") is not None
                    else None
                ),
                (
                    int(turn.state.get("belief_post_0_100"))
                    if turn.state.get("belief_post_0_100") is not None
                    else None
                ),
                (
                    int(turn.state.get("homework_commitment_0_10"))
                    if turn.state.get("homework_commitment_0_10") is not None
                    else None
                ),
                (
                    int(turn.state.get("session_helpfulness_0_10"))
                    if turn.state.get("session_helpfulness_0_10") is not None
                    else None
                ),
            )
        except (TypeError, ValueError):
            previous_values = (None, None, None, None, None, None)
        (
            emotion_pre,
            emotion_post,
            belief_pre,
            belief_post,
            homework_commitment,
            helpfulness,
        ) = self._estimate_turn_checkpoints(turn.state, risk_level, previous=previous_values)

        turn.state["emotion_intensity_pre_0_100"] = emotion_pre
        turn.state["emotion_intensity_post_0_100"] = emotion_post
        turn.state["belief_pre_0_100"] = belief_pre
        turn.state["belief_post_0_100"] = belief_post
        turn.state["homework_commitment_0_10"] = homework_commitment
        turn.state["session_helpfulness_0_10"] = helpfulness

        assistant_message = "\n\n".join(turn.assistant_messages).strip()
        if not assistant_message:
            assistant_message = "천천히 이어가도 괜찮아요. 지금 느낀 점을 한 줄로만 적어볼까요?"

        planner_action = turn.planner_action
        if planner_action not in {item.value for item in CbtPlannerAction}:
            planner_action = CbtPlannerAction.review_evidence.value

        return CbtConversationTurnResponse(
            assistant_message=assistant_message,
            assistant_messages=[
                self._assistant_message(content, coach_name)
                for content in turn.assistant_messages
            ],
            structured_state_draft=turn.state,
            planner_action=CbtPlannerAction(planner_action),
            current_stage=turn.current_stage,
            phase_key=turn.phase_key,
            subphase_key=turn.subphase_key,
            phase_index=turn.phase_index,
            quick_replies=turn.quick_replies,
            action_links=turn.action_links,
            state_repeat_count=turn.state_repeat_count,
            fallback_reason=turn.fallback_reason,
            conversation_closed=turn.conversation_closed,
            requires_today_record=turn.requires_today_record,
            today_record_route=turn.today_record_route,
            risk_level=risk_level,
            safety_first=turn.safety_first,
            safety_message=turn.safety_message,
            emotion_intensity_pre_0_100=emotion_pre,
            emotion_intensity_post_0_100=emotion_post,
            belief_pre_0_100=belief_pre,
            belief_post_0_100=belief_post,
            homework_commitment_0_10=homework_commitment,
            session_helpfulness_0_10=helpfulness,
        )

    def create_cbt_session(
        self,
        user_id: str,
        payload: CbtSessionCreateRequest,
    ) -> CbtSessionResponse:
        state_payload = payload.state or {}
        conversation = self._conversation_items(payload)
        with self._connect() as conn:
            today_record = self._load_today_record_for_cbt(conn, user_id, payload.date or date.today())
            profile_user_name, profile_coach_name = self._load_profile_snapshot(conn, user_id)
        if not state_payload:
            state_payload = self._cbt_engine.bootstrap(
                today_record=today_record,
                coach_nickname=profile_coach_name,
                user_nickname=profile_user_name,
            ).state
            if conversation:
                latest_user = self._latest_user_text(conversation)
                if latest_user:
                    state_payload["situation_text"] = latest_user[:400]
                    state_payload["situation"] = latest_user[:400]
        profile_snapshot = state_payload.get("profile_snapshot")
        if not isinstance(profile_snapshot, dict):
            profile_snapshot = {}
            state_payload["profile_snapshot"] = profile_snapshot
        profile_snapshot["coach_nickname"] = (
            str(profile_snapshot.get("coach_nickname") or "").strip() or profile_coach_name or "마음코치"
        )
        profile_snapshot["user_nickname"] = (
            str(profile_snapshot.get("user_nickname") or "").strip() or profile_user_name or "나"
        )
        if conversation:
            state_payload["turn_log"] = conversation[-80:]

        self._validate_schema(self._cbt_state_schema, state_payload)

        duration_sec = payload.duration_sec
        if duration_sec is None and conversation:
            duration_sec = max(300, min(3600, len(conversation) * 95))
        if duration_sec is None:
            duration_sec = 420

        emotion_pre = payload.emotion_intensity_pre_0_100
        emotion_post = payload.emotion_intensity_post_0_100
        belief_pre = payload.belief_pre_0_100
        belief_post = payload.belief_post_0_100
        homework_commitment = payload.homework_commitment_0_10
        helpfulness = payload.session_helpfulness_0_10

        risk_flags = self._extract_risk_flags(state_payload)
        risk_level = self._resolve_risk_level(risk_flags)
        (
            computed_emotion_pre,
            computed_emotion_post,
            computed_belief_pre,
            computed_belief_post,
            computed_homework,
            computed_helpfulness,
        ) = self._estimate_turn_checkpoints(state_payload, risk_level)
        if emotion_pre is None:
            emotion_pre = computed_emotion_pre
        if emotion_post is None:
            emotion_post = computed_emotion_post
        if belief_pre is None:
            belief_pre = computed_belief_pre
        if belief_post is None:
            belief_post = computed_belief_post
        if homework_commitment is None:
            homework_commitment = computed_homework
        if helpfulness is None:
            helpfulness = computed_helpfulness

        planner_action = payload.planner_action
        if planner_action is None:
            planner_guess = self._cbt_engine._infer_planner_action(state_payload)  # noqa: SLF001
            planner_action = (
                CbtPlannerAction(planner_guess)
                if planner_guess in {item.value for item in CbtPlannerAction}
                else CbtPlannerAction.review_evidence
            )
        (
            selected_action_kind,
            selected_action_title,
            selected_action_description,
            selected_action_route,
            reflection_status,
        ) = self._resolve_selected_action(planner_action, payload)

        target_date = payload.date or date.today()
        session_id = f"cbt_{uuid.uuid4().hex}"
        risk_signal_id = f"risk_{uuid.uuid4().hex}"
        now_iso = self._now_iso()
        ended_at_iso = now_iso

        distortion_total_count = self._distortion_total_count(state_payload)
        topic_label = self._infer_topic_label(state_payload)
        summary_label = self._summary_label(state_payload)
        context_text = str(state_payload.get("situation_text") or state_payload.get("situation") or "").strip() or None
        mood_label = str((state_payload.get("today_record") or {}).get("mood_label") or "").strip() or None
        mood_intensity = (state_payload.get("today_record") or {}).get("mood_intensity_0_100")
        try:
            mood_intensity_value = int(mood_intensity) if mood_intensity is not None else None
        except (TypeError, ValueError):
            mood_intensity_value = None
        turn_logs = state_payload.get("turn_diagnostics")
        turn_log_json = json.dumps(turn_logs if isinstance(turn_logs, list) else [], ensure_ascii=False)

        if selected_action_kind == CbtActionKind.none:
            state_payload["todo_id"] = None
        else:
            state_payload["todo_id"] = f"todo_{session_id}"

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO cbt_session_summary (
                  session_id,
                  user_id,
                  date,
                  started_at,
                  ended_at,
                  status,
                  module_id,
                  context_text,
                  mood_label,
                  mood_intensity_0_100,
                  duration_sec,
                  emotion_intensity_pre_0_100,
                  emotion_intensity_post_0_100,
                  belief_pre_0_100,
                  belief_post_0_100,
                  distortion_total_count,
                  reframe_quality_0_5,
                  homework_commitment_0_10,
                  homework_completed_prev_flag,
                  session_helpfulness_0_10,
                  planner_action,
                  topic_label,
                  summary_label,
                  selected_action_kind,
                  selected_action_title,
                  selected_action_description,
                  selected_action_route,
                  reflection_status,
                  reflection_performed_flag,
                  reflection_note,
                  reflection_completed_at,
                  turn_log_json,
                  state_json,
                  created_at
                ) VALUES (
                  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
                """,
                (
                    session_id,
                    user_id,
                    target_date.isoformat(),
                    now_iso,
                    ended_at_iso,
                    "completed",
                    "thought_record",
                    context_text,
                    mood_label,
                    mood_intensity_value,
                    duration_sec,
                    emotion_pre,
                    emotion_post,
                    belief_pre,
                    belief_post,
                    distortion_total_count,
                    payload.reframe_quality_0_5,
                    homework_commitment,
                    int(payload.homework_completed_prev_flag),
                    helpfulness,
                    planner_action.value,
                    topic_label,
                    summary_label,
                    selected_action_kind.value,
                    selected_action_title,
                    selected_action_description,
                    selected_action_route,
                    reflection_status.value,
                    None,
                    None,
                    None,
                    turn_log_json,
                    json.dumps(state_payload, ensure_ascii=False),
                    now_iso,
                ),
            )

            conn.execute(
                """
                INSERT INTO cbt_risk_signal (
                  risk_signal_id,
                  session_id,
                  user_id,
                  date,
                  functional_impairment_flag,
                  self_harm_flag,
                  suicide_risk_level,
                  violence_risk_flag,
                  risk_source,
                  created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    risk_signal_id,
                    session_id,
                    user_id,
                    target_date.isoformat(),
                    int(risk_flags.functional_impairment_flag),
                    int(risk_flags.self_harm_flag),
                    risk_flags.suicide_risk_level,
                    int(risk_flags.violence_risk_flag),
                    "cbt_session",
                    now_iso,
                ),
            )

            core_beliefs = state_payload.get("core_belief_hypotheses")
            if isinstance(core_beliefs, list):
                for belief in core_beliefs:
                    if not isinstance(belief, dict):
                        continue
                    belief_text = str(belief.get("text") or "").strip()
                    confidence_raw = belief.get("confidence")
                    if not belief_text:
                        continue
                    confidence = None
                    if isinstance(confidence_raw, (int, float)):
                        confidence = float(confidence_raw)
                    conn.execute(
                        """
                        INSERT INTO cbt_case_memory (
                          hypothesis_id,
                          session_id,
                          user_id,
                          date,
                          core_belief_text,
                          confidence,
                          created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            f"hyp_{uuid.uuid4().hex}",
                            session_id,
                            user_id,
                            target_date.isoformat(),
                            belief_text,
                            confidence,
                            now_iso,
                        ),
                    )

            conn.commit()

        self._refresh_nowcast_prediction(
            user_id=user_id,
            reference_date=target_date,
            force=True,
        )
        return self.get_cbt_session_summary(user_id, session_id)

    def save_manual_risk_signal(
        self,
        user_id: str,
        payload: CbtRiskSignalUpsertRequest,
    ) -> CbtRiskSignalResponse:
        target_date = payload.date or date.today()
        risk_signal_id = f"risk_{uuid.uuid4().hex}"
        created_at = self._now_iso()

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO cbt_risk_signal (
                  risk_signal_id,
                  session_id,
                  user_id,
                  date,
                  functional_impairment_flag,
                  self_harm_flag,
                  suicide_risk_level,
                  violence_risk_flag,
                  risk_source,
                  created_at
                ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    risk_signal_id,
                    user_id,
                    target_date.isoformat(),
                    int(payload.functional_impairment_flag),
                    int(payload.self_harm_flag),
                    payload.suicide_risk_level,
                    int(payload.violence_risk_flag),
                    payload.risk_source.value,
                    created_at,
                ),
            )
            conn.commit()

        return self._get_risk_signal(user_id, risk_signal_id)

    def _get_risk_signal(self, user_id: str, risk_signal_id: str) -> CbtRiskSignalResponse:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT
                  risk_signal_id,
                  user_id,
                  date,
                  functional_impairment_flag,
                  self_harm_flag,
                  suicide_risk_level,
                  violence_risk_flag,
                  risk_source,
                  created_at
                FROM cbt_risk_signal
                WHERE user_id = ? AND risk_signal_id = ?
                """,
                (user_id, risk_signal_id),
            ).fetchone()

            if not row:
                raise ValueError("risk_signal_not_found")

            return CbtRiskSignalResponse(
                risk_signal_id=str(row["risk_signal_id"]),
                user_id=str(row["user_id"]),
                date=date.fromisoformat(str(row["date"])),
                functional_impairment_flag=bool(row["functional_impairment_flag"]),
                self_harm_flag=bool(row["self_harm_flag"]),
                suicide_risk_level=int(row["suicide_risk_level"]),
                violence_risk_flag=bool(row["violence_risk_flag"]),
                risk_source=str(row["risk_source"]),
                created_at=datetime.fromisoformat(str(row["created_at"])),
            )

    def get_cbt_session_summary(self, user_id: str, session_id: str) -> CbtSessionResponse:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT
                  session_id,
                  user_id,
                  date,
                  started_at,
                  duration_sec,
                  emotion_intensity_pre_0_100,
                  emotion_intensity_post_0_100,
                  belief_pre_0_100,
                  belief_post_0_100,
                  distortion_total_count,
                  planner_action,
                  topic_label,
                  session_helpfulness_0_10,
                  selected_action_kind,
                  selected_action_title,
                  selected_action_description,
                  selected_action_route,
                  reflection_status,
                  reflection_performed_flag,
                  reflection_note,
                  reflection_completed_at,
                  state_json
                FROM cbt_session_summary
                WHERE user_id = ? AND session_id = ?
                """,
                (user_id, session_id),
            ).fetchone()

            if not row:
                raise ValueError("cbt_session_not_found")

            risk_row = conn.execute(
                """
                SELECT
                  risk_signal_id,
                  user_id,
                  date,
                  functional_impairment_flag,
                  self_harm_flag,
                  suicide_risk_level,
                  violence_risk_flag,
                  risk_source,
                  created_at
                FROM cbt_risk_signal
                WHERE user_id = ? AND session_id = ?
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (user_id, session_id),
            ).fetchone()

            if not risk_row:
                raise ValueError("risk_signal_not_found")

            structured_output = (
                json.loads(str(row["state_json"])) if row["state_json"] else {}
            )

            risk_flags = CbtRiskFlags(
                functional_impairment_flag=bool(risk_row["functional_impairment_flag"]),
                self_harm_flag=bool(risk_row["self_harm_flag"]),
                suicide_risk_level=int(risk_row["suicide_risk_level"]),
                violence_risk_flag=bool(risk_row["violence_risk_flag"]),
            )
            risk_level = self._resolve_risk_level(risk_flags)
            safety_first = risk_level >= 2
            safety_message = (
                "위험 신호가 감지되어 safety-first 안내를 우선 제공합니다."
                if safety_first
                else None
            )

            emotion_shift = None
            if (
                row["emotion_intensity_pre_0_100"] is not None
                and row["emotion_intensity_post_0_100"] is not None
            ):
                emotion_shift = int(row["emotion_intensity_pre_0_100"]) - int(
                    row["emotion_intensity_post_0_100"]
                )

            belief_shift = None
            if row["belief_pre_0_100"] is not None and row["belief_post_0_100"] is not None:
                belief_shift = int(row["belief_pre_0_100"]) - int(row["belief_post_0_100"])

            summary = CbtSessionSummaryCard(
                emotion_shift=emotion_shift,
                belief_shift=belief_shift,
                distortion_total_count=int(row["distortion_total_count"] or 0),
                topic_label=str(row["topic_label"] or "general"),
                helpfulness_0_10=(
                    int(row["session_helpfulness_0_10"])
                    if row["session_helpfulness_0_10"] is not None
                    else None
                ),
                planner_action=CbtPlannerAction(
                    str(row["planner_action"] or CbtPlannerAction.review_evidence.value)
                ),
                selected_action_kind=CbtActionKind(
                    str(row["selected_action_kind"] or CbtActionKind.none.value)
                ),
                selected_action_title=self._normalize_none_action_title(row["selected_action_title"]),
                selected_action_description=(
                    str(row["selected_action_description"])
                    if row["selected_action_description"]
                    else None
                ),
                selected_action_route=(
                    str(row["selected_action_route"]) if row["selected_action_route"] else None
                ),
                reflection_status=CbtReflectionStatus(
                    str(row["reflection_status"] or CbtReflectionStatus.not_applicable.value)
                ),
                reflection_performed_flag=(
                    bool(row["reflection_performed_flag"])
                    if row["reflection_performed_flag"] is not None
                    else None
                ),
                reflection_note=str(row["reflection_note"]) if row["reflection_note"] else None,
                thought_summary=self._thought_summary(structured_output),
                core_belief_summary=self._core_belief_summary(structured_output),
                evidence_summary=self._evidence_summary(structured_output),
                balanced_statement_summary=self._balanced_statement_summary(structured_output),
            )

            risk_signal = CbtRiskSignalResponse(
                risk_signal_id=str(risk_row["risk_signal_id"]),
                user_id=str(risk_row["user_id"]),
                date=date.fromisoformat(str(risk_row["date"])),
                functional_impairment_flag=bool(risk_row["functional_impairment_flag"]),
                self_harm_flag=bool(risk_row["self_harm_flag"]),
                suicide_risk_level=int(risk_row["suicide_risk_level"]),
                violence_risk_flag=bool(risk_row["violence_risk_flag"]),
                risk_source=str(risk_row["risk_source"]),
                created_at=datetime.fromisoformat(str(risk_row["created_at"])),
            )

            return CbtSessionResponse(
                session_id=str(row["session_id"]),
                user_id=str(row["user_id"]),
                date=date.fromisoformat(str(row["date"])),
                started_at=datetime.fromisoformat(str(row["started_at"])),
                duration_sec=(
                    int(row["duration_sec"]) if row["duration_sec"] is not None else None
                ),
                structured_output=structured_output,
                summary=summary,
                risk_signal=risk_signal,
                risk_level=risk_level,
                safety_first=safety_first,
                safety_message=safety_message,
            )

    def list_cbt_sessions(self, user_id: str, limit: int = 20) -> list[CbtSessionResponse]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT session_id
                FROM cbt_session_summary
                WHERE user_id = ?
                ORDER BY date DESC, started_at DESC
                LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()

        return [self.get_cbt_session_summary(user_id, str(row["session_id"])) for row in rows]

    def list_pending_cbt_reflections(self, user_id: str, limit: int = 50) -> list[CbtSessionResponse]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT session_id
                FROM cbt_session_summary
                WHERE user_id = ?
                  AND selected_action_kind != ?
                  AND reflection_status = ?
                ORDER BY date DESC, started_at DESC
                LIMIT ?
                """,
                (
                    user_id,
                    CbtActionKind.none.value,
                    CbtReflectionStatus.pending.value,
                    limit,
                ),
            ).fetchall()

        return [self.get_cbt_session_summary(user_id, str(row["session_id"])) for row in rows]

    def save_cbt_session_reflection(
        self,
        user_id: str,
        session_id: str,
        payload: CbtReflectionUpsertRequest,
    ) -> CbtSessionResponse:
        with self._connect() as conn:
            target = conn.execute(
                """
                SELECT date, selected_action_kind, state_json
                FROM cbt_session_summary
                WHERE user_id = ? AND session_id = ?
                """,
                (user_id, session_id),
            ).fetchone()
            if not target:
                raise ValueError("cbt_session_not_found")

            if str(target["selected_action_kind"] or CbtActionKind.none.value) == CbtActionKind.none.value:
                raise ValueError("cbt_reflection_not_applicable")

            state_json = {}
            if target["state_json"]:
                try:
                    state_json = json.loads(str(target["state_json"]))
                except json.JSONDecodeError:
                    state_json = {}
            if not isinstance(state_json, dict):
                state_json = {}
            reflection_history = state_json.get("reflection_history")
            if not isinstance(reflection_history, list):
                reflection_history = []
            completed_at = self._now_iso()
            reflection_history.append(
                {
                    "reflection_status": "done" if payload.performed else "declined",
                    "reflection_note": payload.reflection_note.strip(),
                    "reflection_at": completed_at,
                }
            )
            state_json["reflection_status"] = "done" if payload.performed else "declined"
            state_json["reflection_note"] = payload.reflection_note.strip()
            state_json["reflection_at"] = completed_at
            state_json["reflection_history"] = reflection_history[-20:]

            conn.execute(
                """
                UPDATE cbt_session_summary
                SET reflection_status = ?,
                    reflection_performed_flag = ?,
                    reflection_note = ?,
                    reflection_completed_at = ?,
                    state_json = ?
                WHERE user_id = ? AND session_id = ?
                """,
                (
                    CbtReflectionStatus.completed.value,
                    int(payload.performed),
                    payload.reflection_note.strip(),
                    completed_at,
                    json.dumps(state_json, ensure_ascii=False),
                    user_id,
                    session_id,
                ),
            )
            conn.commit()

        return self.get_cbt_session_summary(user_id, session_id)

    def save_cbt_session_todo(
        self,
        user_id: str,
        session_id: str,
        payload: CbtTodoUpsertRequest,
    ) -> CbtSessionResponse:
        title = payload.title.strip()
        if len(title) < 2:
            raise ValueError("invalid_todo_title")

        description = payload.description.strip() if payload.description else None
        route = payload.route.strip() if payload.route else None

        with self._connect() as conn:
            target = conn.execute(
                """
                SELECT session_id, state_json
                FROM cbt_session_summary
                WHERE user_id = ? AND session_id = ?
                """,
                (user_id, session_id),
            ).fetchone()
            if not target:
                raise ValueError("cbt_session_not_found")

            state_json = {}
            if target["state_json"]:
                try:
                    state_json = json.loads(str(target["state_json"]))
                except json.JSONDecodeError:
                    state_json = {}
            if not isinstance(state_json, dict):
                state_json = {}
            todo_id = state_json.get("todo_id")
            if not isinstance(todo_id, str) or not todo_id.strip():
                todo_id = f"todo_{session_id}"
            state_json["todo_id"] = todo_id
            state_json["commitment_type"] = (
                "behavior" if payload.kind == CbtActionKind.challenge else "thought_practice"
            )
            state_json["commitment_text"] = title

            conn.execute(
                """
                UPDATE cbt_session_summary
                SET selected_action_kind = ?,
                    selected_action_title = ?,
                    selected_action_description = ?,
                    selected_action_route = ?,
                    reflection_status = ?,
                    reflection_performed_flag = NULL,
                    reflection_note = NULL,
                    reflection_completed_at = NULL,
                    state_json = ?
                WHERE user_id = ? AND session_id = ?
                """,
                (
                    payload.kind.value,
                    title,
                    description,
                    route,
                    CbtReflectionStatus.pending.value,
                    json.dumps(state_json, ensure_ascii=False),
                    user_id,
                    session_id,
                ),
            )
            conn.commit()

        return self.get_cbt_session_summary(user_id, session_id)

    @staticmethod
    def _checkin_payload_rows(
        conn: sqlite3.Connection,
        user_id: str,
        start_date: date,
        end_date: date,
    ) -> dict[date, dict[str, object]]:
        rows = conn.execute(
            """
            SELECT dc.date, dc.checked_at, dcv.payload_json
            FROM daily_checkin dc
            LEFT JOIN daily_checkin_version dcv
              ON dcv.checkin_version_id = dc.current_version_id
            WHERE dc.user_id = ?
              AND dc.status = 'submitted'
              AND dc.date BETWEEN ? AND ?
            ORDER BY dc.date ASC
            """,
            (user_id, start_date.isoformat(), end_date.isoformat()),
        ).fetchall()

        payload_map: dict[date, dict[str, object]] = {}
        for row in rows:
            if not row["payload_json"]:
                continue
            payload_map[date.fromisoformat(str(row["date"]))] = json.loads(str(row["payload_json"]))
        return payload_map

    @staticmethod
    def _prediction_rows(
        conn: sqlite3.Connection,
        user_id: str,
        start_date: date,
        end_date: date,
    ) -> dict[date, tuple[float, float, float]]:
        table_row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'model_nowcast_prediction'",
        ).fetchone()
        if not table_row:
            return {}

        has_reference_date = any(
            str(row["name"]) == "reference_date"
            for row in conn.execute("PRAGMA table_info(model_nowcast_prediction)").fetchall()
        )
        date_expr = "COALESCE(reference_date, substr(created_at, 1, 10))" if has_reference_date else "substr(created_at, 1, 10)"

        rows = conn.execute(
            f"""
            SELECT
              {date_expr} AS ref_date,
              dep_score,
              anx_score,
              ins_score
            FROM model_nowcast_prediction
            WHERE user_id = ?
              AND date({date_expr}) BETWEEN ? AND ?
            ORDER BY date({date_expr}) ASC,
                     datetime(created_at) ASC
            """,
            (user_id, start_date.isoformat(), end_date.isoformat()),
        ).fetchall()

        prediction_map: dict[date, tuple[float, float, float]] = {}
        for row in rows:
            ref_day = date.fromisoformat(str(row["ref_date"]))
            prediction_map[ref_day] = (
                round(float(row["dep_score"] or 0.0), 1),
                round(float(row["anx_score"] or 0.0), 1),
                round(float(row["ins_score"] or 0.0), 1),
            )
        return prediction_map

    @staticmethod
    def _states_from_payload(payload: dict[str, object]) -> tuple[float, float, float]:
        mood = int(payload.get("mood_1_5") or 3)
        anxiety = int(payload.get("anxiety_1_5") or 3)
        energy = int(payload.get("energy_1_5") or 3)
        sleep_bucket = str(payload.get("sleep_total_bucket") or "h6_7")
        latency_bucket = str(payload.get("sleep_latency_bucket") or "m15_30")
        alcohol_bucket = str(payload.get("alcohol_bucket") or "none")
        caffeine_after = bool(payload.get("caffeine_after_2pm_flag", False))

        dep = (5 - mood) * 18 + (5 - energy) * 12
        anx = (anxiety - 1) * 25

        insomnia = (
            SLEEP_TOTAL_INSOMNIA_SCORE.get(sleep_bucket, 45)
            + SLEEP_LATENCY_INSOMNIA_SCORE.get(latency_bucket, 30)
        ) / 2

        if alcohol_bucket in {"two_three", "ge_four"}:
            insomnia += 6
        if caffeine_after:
            insomnia += 5

        return (
            round(_clamp(dep, 0, 100), 1),
            round(_clamp(anx, 0, 100), 1),
            round(_clamp(insomnia, 0, 100), 1),
        )

    @staticmethod
    def _assessment_timing(
        conn: sqlite3.Connection,
        user_id: str,
    ) -> tuple[datetime | None, int | None, int | None]:
        row = conn.execute(
            """
            SELECT completed_at
            FROM periodic_assessment
            WHERE user_id = ?
              AND status IN ('completed', 'late')
              AND completed_at IS NOT NULL
            ORDER BY completed_at DESC
            LIMIT 1
            """,
            (user_id,),
        ).fetchone()

        if not row or not row["completed_at"]:
            return None, None, None

        completed_at = datetime.fromisoformat(str(row["completed_at"]))
        days_since = (date.today() - completed_at.date()).days
        days_until = max(0, 28 - days_since)
        return completed_at, days_until, days_since

    @staticmethod
    def _density_message(recorded_days: int, window_days: int) -> str:
        if window_days >= 28 and recorded_days < 3:
            return "최근 4주 기록이 적어 주평균 추세가 불안정할 수 있어요."
        if recorded_days <= 2:
            return "기록이 적어 변화 해석에 주의가 필요해요."
        if recorded_days < 7:
            return "일부 날짜만 기록되어 있어요."
        return "기록이 비교적 충분해요."

    @staticmethod
    def _wake_time_consistency_label(std_minutes: float) -> str:
        if std_minutes <= 30:
            return "일정함"
        if std_minutes <= 60:
            return "매일 30~1시간 차이남"
        if std_minutes <= 120:
            return "매일 1~2시간 차이남"
        return "매일 2시간 이상 차이남"

    def get_symptom_dashboard(
        self,
        user_id: str,
        mode: DashboardSymptomMode,
    ) -> SymptomDashboardResponse:
        today = date.today()
        self._refresh_nowcast_prediction(
            user_id=user_id,
            reference_date=today,
            force=False,
        )

        with self._connect() as conn:
            if mode == DashboardSymptomMode.mode_7d:
                start_date = today - timedelta(days=6)
                payload_map = self._checkin_payload_rows(conn, user_id, start_date, today)
                prediction_map = self._prediction_rows(conn, user_id, start_date, today)
                labels = [
                    (start_date + timedelta(days=index)).strftime("%m-%d")
                    for index in range(7)
                ]

                per_metric_values: dict[SymptomMetric, list[float | None]] = {
                    SymptomMetric.dep: [],
                    SymptomMetric.anx: [],
                    SymptomMetric.ins: [],
                }
                points: dict[SymptomMetric, list[SymptomPoint]] = {
                    SymptomMetric.dep: [],
                    SymptomMetric.anx: [],
                    SymptomMetric.ins: [],
                }

                for index in range(7):
                    target_day = start_date + timedelta(days=index)
                    predicted = prediction_map.get(target_day)
                    dep, anx, ins = (None, None, None)
                    if predicted:
                        dep, anx, ins = predicted
                    else:
                        payload = payload_map.get(target_day)
                        if payload:
                            dep, anx, ins = self._states_from_payload(payload)

                    per_metric_values[SymptomMetric.dep].append(dep)
                    per_metric_values[SymptomMetric.anx].append(anx)
                    per_metric_values[SymptomMetric.ins].append(ins)

                    points[SymptomMetric.dep].append(
                        SymptomPoint(
                            x_label=labels[index],
                            value=dep,
                            is_missing_bucket=dep is None,
                        )
                    )
                    points[SymptomMetric.anx].append(
                        SymptomPoint(
                            x_label=labels[index],
                            value=anx,
                            is_missing_bucket=anx is None,
                        )
                    )
                    points[SymptomMetric.ins].append(
                        SymptomPoint(
                            x_label=labels[index],
                            value=ins,
                            is_missing_bucket=ins is None,
                        )
                    )

                window_days = 7
                recorded_days_any_metric = sum(
                    1
                    for index in range(7)
                    if any(
                        per_metric_values[metric][index] is not None
                        for metric in [SymptomMetric.dep, SymptomMetric.anx, SymptomMetric.ins]
                    )
                )
                recorded_days_by_metric = {
                    SymptomMetric.dep: len([value for value in per_metric_values[SymptomMetric.dep] if value is not None]),
                    SymptomMetric.anx: len([value for value in per_metric_values[SymptomMetric.anx] if value is not None]),
                    SymptomMetric.ins: len([value for value in per_metric_values[SymptomMetric.ins] if value is not None]),
                }
            else:
                start_date = today - timedelta(days=27)
                payload_map = self._checkin_payload_rows(conn, user_id, start_date, today)
                prediction_map = self._prediction_rows(conn, user_id, start_date, today)

                daily_values: dict[date, tuple[float, float, float]] = {}
                cursor = start_date
                while cursor <= today:
                    predicted = prediction_map.get(cursor)
                    if predicted:
                        daily_values[cursor] = predicted
                    else:
                        payload = payload_map.get(cursor)
                        if payload:
                            daily_values[cursor] = self._states_from_payload(payload)
                    cursor += timedelta(days=1)

                points = {
                    SymptomMetric.dep: [],
                    SymptomMetric.anx: [],
                    SymptomMetric.ins: [],
                }
                per_metric_values = {
                    SymptomMetric.dep: [],
                    SymptomMetric.anx: [],
                    SymptomMetric.ins: [],
                }

                for week in range(4):
                    week_start = start_date + timedelta(days=week * 7)
                    week_end = week_start + timedelta(days=6)
                    week_values_dep: list[float] = []
                    week_values_anx: list[float] = []
                    week_values_ins: list[float] = []

                    cursor = week_start
                    while cursor <= week_end:
                        if cursor in daily_values:
                            dep, anx, ins = daily_values[cursor]
                            week_values_dep.append(dep)
                            week_values_anx.append(anx)
                            week_values_ins.append(ins)
                        cursor += timedelta(days=1)

                    dep_mean = (
                        round(statistics.mean(week_values_dep), 1)
                        if week_values_dep
                        else None
                    )
                    anx_mean = (
                        round(statistics.mean(week_values_anx), 1)
                        if week_values_anx
                        else None
                    )
                    ins_mean = (
                        round(statistics.mean(week_values_ins), 1)
                        if week_values_ins
                        else None
                    )

                    per_metric_values[SymptomMetric.dep].append(dep_mean)
                    per_metric_values[SymptomMetric.anx].append(anx_mean)
                    per_metric_values[SymptomMetric.ins].append(ins_mean)

                    points[SymptomMetric.dep].append(
                        SymptomPoint(
                            x_label=f"{week + 1}주",
                            value=dep_mean,
                            observed_days=len(week_values_dep),
                            is_missing_bucket=dep_mean is None,
                        )
                    )
                    points[SymptomMetric.anx].append(
                        SymptomPoint(
                            x_label=f"{week + 1}주",
                            value=anx_mean,
                            observed_days=len(week_values_anx),
                            is_missing_bucket=anx_mean is None,
                        )
                    )
                    points[SymptomMetric.ins].append(
                        SymptomPoint(
                            x_label=f"{week + 1}주",
                            value=ins_mean,
                            observed_days=len(week_values_ins),
                            is_missing_bucket=ins_mean is None,
                        )
                    )

                window_days = 28
                recorded_days_any_metric = len(daily_values)
                recorded_days_by_metric = {
                    SymptomMetric.dep: len([1 for values in daily_values.values() if values[0] is not None]),
                    SymptomMetric.anx: len([1 for values in daily_values.values() if values[1] is not None]),
                    SymptomMetric.ins: len([1 for values in daily_values.values() if values[2] is not None]),
                }

            labels = {
                SymptomMetric.dep: "우울",
                SymptomMetric.anx: "불안",
                SymptomMetric.ins: "불면",
            }

            series: list[SymptomSeries] = []
            for metric in [SymptomMetric.dep, SymptomMetric.anx, SymptomMetric.ins]:
                values = [value for value in per_metric_values[metric] if value is not None]
                current_score = values[-1] if values else None
                window_mean = round(statistics.mean(values), 1) if values else None
                recorded_days = int(recorded_days_by_metric.get(metric, 0))

                series.append(
                    SymptomSeries(
                        metric=metric,
                        label=labels[metric],
                        points=points[metric],
                        current_score=current_score,
                        window_mean=window_mean,
                        recorded_days=recorded_days,
                    )
                )

            last_assessment_at, days_until, _ = self._assessment_timing(conn, user_id)
            last_updated = conn.execute(
                """
                SELECT checked_at
                FROM daily_checkin
                WHERE user_id = ? AND status = 'submitted'
                ORDER BY checked_at DESC
                LIMIT 1
                """,
                (user_id,),
            ).fetchone()
            model_updated = None
            has_model_prediction_table = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'model_nowcast_prediction'",
            ).fetchone()
            if has_model_prediction_table:
                model_updated = conn.execute(
                    """
                    SELECT created_at
                    FROM model_nowcast_prediction
                    WHERE user_id = ?
                    ORDER BY datetime(created_at) DESC
                    LIMIT 1
                    """,
                    (user_id,),
                ).fetchone()
            last_updated_at = (
                datetime.fromisoformat(str(last_updated["checked_at"]))
                if last_updated and last_updated["checked_at"]
                else None
            )
            if model_updated and model_updated["created_at"]:
                model_updated_at = datetime.fromisoformat(str(model_updated["created_at"]))
                if last_updated_at is None or model_updated_at > last_updated_at:
                    last_updated_at = model_updated_at

            return SymptomDashboardResponse(
                mode=mode,
                series=series,
                summary=SymptomSummary(
                    last_assessment_at=last_assessment_at,
                    days_until_recommended_assessment=days_until,
                    last_updated_at=last_updated_at,
                ),
                data_density=DataDensity(
                    days_in_window=window_days,
                    recorded_days_any_metric=recorded_days_any_metric,
                    message=self._density_message(recorded_days_any_metric, window_days),
                ),
            )

    def get_activity_dashboard(self, user_id: str) -> ActivityDashboardResponse:
        today = date.today()
        start_7d = today - timedelta(days=6)
        start_28d = today - timedelta(days=27)

        with self._connect() as conn:
            checkin_days_7d_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM daily_checkin
                WHERE user_id = ?
                  AND status = 'submitted'
                  AND date BETWEEN ? AND ?
                """,
                (user_id, start_7d.isoformat(), today.isoformat()),
            ).fetchone()
            checkin_days_7d = int(checkin_days_7d_row["cnt"]) if checkin_days_7d_row else 0

            cbt_sessions_7d_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM cbt_session_summary
                WHERE user_id = ?
                  AND date BETWEEN ? AND ?
                """,
                (user_id, start_7d.isoformat(), today.isoformat()),
            ).fetchone()
            cbt_sessions_7d = int(cbt_sessions_7d_row["cnt"]) if cbt_sessions_7d_row else 0

            cbt_active_days_7d_row = conn.execute(
                """
                SELECT COUNT(DISTINCT date) AS cnt
                FROM cbt_session_summary
                WHERE user_id = ?
                  AND date BETWEEN ? AND ?
                """,
                (user_id, start_7d.isoformat(), today.isoformat()),
            ).fetchone()
            cbt_active_days_7d = int(cbt_active_days_7d_row["cnt"]) if cbt_active_days_7d_row else 0

            cbt_last_row = conn.execute(
                """
                SELECT date
                FROM cbt_session_summary
                WHERE user_id = ?
                ORDER BY date DESC
                LIMIT 1
                """,
                (user_id,),
            ).fetchone()
            last_session_days_ago = None
            if cbt_last_row and cbt_last_row["date"]:
                last_session_days_ago = (today - date.fromisoformat(str(cbt_last_row["date"]))).days

            top_topics_rows = conn.execute(
                """
                SELECT topic_label, COUNT(*) AS cnt
                FROM cbt_session_summary
                WHERE user_id = ?
                  AND date BETWEEN ? AND ?
                GROUP BY topic_label
                ORDER BY cnt DESC, topic_label ASC
                LIMIT 2
                """,
                (user_id, start_28d.isoformat(), today.isoformat()),
            ).fetchall()
            top_topics = [str(row["topic_label"]) for row in top_topics_rows if row["topic_label"]]

            challenge_days_7d_row = conn.execute(
                """
                SELECT COUNT(DISTINCT date) AS cnt
                FROM challenge_day_log
                WHERE user_id = ?
                  AND completed_flag = 1
                  AND date BETWEEN ? AND ?
                """,
                (user_id, start_7d.isoformat(), today.isoformat()),
            ).fetchone()
            challenge_days_7d = int(challenge_days_7d_row["cnt"]) if challenge_days_7d_row else 0

            challenge_active_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM challenge_enrollment
                WHERE user_id = ?
                  AND status = 'active'
                """,
                (user_id,),
            ).fetchone()
            challenge_active_count = int(challenge_active_row["cnt"]) if challenge_active_row else 0

            completion_rate_row = conn.execute(
                """
                SELECT
                  SUM(CASE WHEN completed_flag = 1 THEN 1 ELSE 0 END) AS done_cnt,
                  COUNT(*) AS total_cnt
                FROM challenge_day_log
                WHERE user_id = ?
                  AND date BETWEEN ? AND ?
                """,
                (user_id, start_7d.isoformat(), today.isoformat()),
            ).fetchone()
            completion_rate_7d = None
            if completion_rate_row and int(completion_rate_row["total_cnt"] or 0) > 0:
                completion_rate_7d = round(
                    int(completion_rate_row["done_cnt"] or 0)
                    / int(completion_rate_row["total_cnt"])
                    * 100,
                    1,
                )

            dropout_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM challenge_enrollment
                WHERE user_id = ?
                  AND status = 'dropped'
                  AND ended_at IS NOT NULL
                  AND date(ended_at) BETWEEN ? AND ?
                """,
                (user_id, start_28d.isoformat(), today.isoformat()),
            ).fetchone()
            dropout_count_28d = int(dropout_row["cnt"]) if dropout_row else 0

            (
                last_assessment_at,
                days_until_assessment,
                days_since_assessment,
            ) = self._assessment_timing(conn, user_id)

            year = today.year
            month = today.month
            _, last_day = calendar.monthrange(year, month)
            checkin_this_month_rows = conn.execute(
                """
                SELECT date
                FROM daily_checkin
                WHERE user_id = ?
                  AND status = 'submitted'
                  AND substr(date, 1, 7) = ?
                """,
                (user_id, f"{year:04d}-{month:02d}"),
            ).fetchall()
            checkin_set = {str(row["date"]) for row in checkin_this_month_rows}

            calendar_days: list[ActivityCalendarDay] = []
            for day in range(1, last_day + 1):
                target_date = date(year, month, day)
                date_key = target_date.isoformat()
                calendar_days.append(
                    ActivityCalendarDay(
                        date=target_date,
                        checked_in=date_key in checkin_set,
                        is_today=target_date == today,
                    )
                )

            message = self._density_message(checkin_days_7d, 7)

            return ActivityDashboardResponse(
                summary_cards=ActivitySummaryCards(
                    checkin_days_7d=checkin_days_7d,
                    cbt_sessions_7d=cbt_sessions_7d,
                    challenge_days_7d=challenge_days_7d,
                    last_assessment_days_ago=days_since_assessment,
                ),
                calendar=ActivityCalendar(year=year, month=month, days=calendar_days),
                cbt=ActivityCbtSummary(
                    sessions_7d=cbt_sessions_7d,
                    active_days_7d=cbt_active_days_7d,
                    last_session_days_ago=last_session_days_ago,
                    top_topics=top_topics,
                ),
                challenge=ActivityChallengeSummary(
                    active_count=challenge_active_count,
                    performed_days_7d=challenge_days_7d,
                    completion_rate_7d=completion_rate_7d,
                    dropout_count_28d=dropout_count_28d,
                ),
                survey=ActivitySurveySummary(
                    last_assessment_at=last_assessment_at,
                    days_until_recommended_assessment=days_until_assessment,
                ),
                data_density=ActivityDataDensity(message=message),
            )

    def get_report_summary(
        self,
        user_id: str,
        start_date: date,
        end_date: date,
        include_sensitive: bool,
    ) -> ReportSummaryResponse:
        if end_date < start_date:
            raise ValueError("invalid_date_range")

        with self._connect() as conn:
            payload_map = self._checkin_payload_rows(conn, user_id, start_date, end_date)
            days_in_period = (end_date - start_date).days + 1

            symptom_timeseries: list[ReportSymptomPoint] = []
            previous_state = (50.0, 50.0, 50.0)
            cursor = start_date
            while cursor <= end_date:
                payload = payload_map.get(cursor)
                has_checkin = payload is not None
                if payload:
                    previous_state = self._states_from_payload(payload)
                    has_state = True
                else:
                    has_state = False

                dep_state, anx_state, ins_state = previous_state
                symptom_timeseries.append(
                    ReportSymptomPoint(
                        date=cursor,
                        dep_state=dep_state,
                        anx_state=anx_state,
                        ins_state=ins_state,
                        has_checkin=has_checkin,
                        has_state_observation=has_state,
                    )
                )
                cursor += timedelta(days=1)

            sleep_minutes: list[float] = []
            wake_minutes: list[float] = []
            latency_minutes: list[float] = []
            latency_counts = {bucket: 0 for bucket in SLEEP_LATENCY_TO_MINUTES.keys()}
            exercise_counts = {"m0": 0, "m1_9": 0, "m10_29": 0, "ge_30": 0}
            daylight_counts = {"m0": 0, "m1_9": 0, "m10_29": 0, "ge_30": 0}
            alcohol_counts = {"none": 0, "one": 0, "two_three": 0, "ge_four": 0}
            late_caffeine_days = 0
            total_exercise_minutes = 0
            total_daylight_minutes = 0
            exercise_days = 0

            for payload in payload_map.values():
                sleep_bucket = str(payload.get("sleep_total_bucket") or "h6_7")
                sleep_minutes.append(float(SLEEP_TOTAL_TO_MINUTES.get(sleep_bucket, 390)))

                wake_time = str(payload.get("wake_time_local") or "07:00")
                try:
                    hour, minute = wake_time.split(":", 1)
                    wake_minutes.append(int(hour) * 60 + int(minute))
                except ValueError:
                    pass

                latency_bucket = str(payload.get("sleep_latency_bucket") or "m15_30")
                if latency_bucket in latency_counts:
                    latency_counts[latency_bucket] += 1
                latency_minutes.append(float(SLEEP_LATENCY_TO_MINUTES.get(latency_bucket, 23)))

                exercise_bucket = str(payload.get("exercise_bucket") or "m0")
                if exercise_bucket in exercise_counts:
                    exercise_counts[exercise_bucket] += 1
                exercise_minutes = int(ACTIVITY_BUCKET_TO_MINUTES.get(exercise_bucket, 0))
                total_exercise_minutes += exercise_minutes
                if exercise_minutes > 0:
                    exercise_days += 1

                daylight_bucket = str(payload.get("daylight_bucket") or "m0")
                if daylight_bucket in daylight_counts:
                    daylight_counts[daylight_bucket] += 1
                total_daylight_minutes += int(ACTIVITY_BUCKET_TO_MINUTES.get(daylight_bucket, 0))

                alcohol_bucket = str(payload.get("alcohol_bucket") or "none")
                if alcohol_bucket in alcohol_counts:
                    alcohol_counts[alcohol_bucket] += 1

                if bool(payload.get("caffeine_after_2pm_flag", False)):
                    late_caffeine_days += 1

            sleep_latency_mode = "none"
            if latency_counts:
                sleep_latency_mode = max(latency_counts.items(), key=lambda item: item[1])[0]

            sleep_metrics = {
                "sleep_total_mean_min": (
                    round(statistics.mean(sleep_minutes), 1) if sleep_minutes else 0.0
                ),
                "wake_time_mean_min": (
                    round(statistics.mean(wake_minutes), 1) if wake_minutes else None
                ),
                "wake_time_std_min": (
                    round(statistics.pstdev(wake_minutes), 1)
                    if len(wake_minutes) >= 2
                    else 0.0
                ),
                "wake_time_consistency_label": self._wake_time_consistency_label(
                    round(statistics.pstdev(wake_minutes), 1)
                    if len(wake_minutes) >= 2
                    else 0.0
                ),
                "sleep_latency_mean_min": (
                    round(statistics.mean(latency_minutes), 1) if latency_minutes else 0.0
                ),
                "sleep_latency_bucket_dist": latency_counts,
                "sleep_latency_bucket_mode": sleep_latency_mode,
            }

            weeks_in_period = round(days_in_period / 7, 2) if days_in_period > 0 else 0.0

            lifestyle_metrics = {
                "exercise_bucket_counts": exercise_counts,
                "daylight_bucket_counts": daylight_counts,
                "alcohol_bucket_counts": alcohol_counts,
                "late_caffeine_days": late_caffeine_days,
                "exercise_mean_min_per_day": (
                    round(total_exercise_minutes / days_in_period, 1)
                    if days_in_period > 0
                    else 0.0
                ),
                "daylight_mean_min_per_day": (
                    round(total_daylight_minutes / days_in_period, 1)
                    if days_in_period > 0
                    else 0.0
                ),
                "exercise_days": exercise_days,
                "weeks_in_period": weeks_in_period,
                "exercise_weekly_avg_days": (
                    round(exercise_days / weeks_in_period, 1) if weeks_in_period > 0 else 0.0
                ),
                "late_caffeine_weekly_avg_days": (
                    round(late_caffeine_days / weeks_in_period, 1) if weeks_in_period > 0 else 0.0
                ),
            }

            assessment_history_rows = conn.execute(
                """
                SELECT pa.completed_at, sc.phq9_total, sc.gad7_total, sc.isi_total
                FROM periodic_assessment pa
                LEFT JOIN assessment_score sc ON sc.assessment_id = pa.assessment_id
                WHERE pa.user_id = ?
                  AND pa.status IN ('completed', 'late')
                  AND pa.completed_at IS NOT NULL
                  AND date(pa.completed_at) BETWEEN ? AND ?
                ORDER BY pa.completed_at DESC
                LIMIT 20
                """,
                (user_id, start_date.isoformat(), end_date.isoformat()),
            ).fetchall()

            assessment_history = [
                ReportAssessmentsHistoryItem(
                    completed_at=datetime.fromisoformat(str(row["completed_at"])),
                    phq9_total=(int(row["phq9_total"]) if row["phq9_total"] is not None else None),
                    gad7_total=(int(row["gad7_total"]) if row["gad7_total"] is not None else None),
                    isi_total=(int(row["isi_total"]) if row["isi_total"] is not None else None),
                )
                for row in assessment_history_rows
                if row["completed_at"]
            ]

            latest_assessment_row = conn.execute(
                """
                SELECT pa.completed_at, sc.phq9_total, sc.gad7_total, sc.isi_total
                FROM periodic_assessment pa
                LEFT JOIN assessment_score sc ON sc.assessment_id = pa.assessment_id
                WHERE pa.user_id = ?
                  AND pa.status IN ('completed', 'late')
                  AND pa.completed_at IS NOT NULL
                ORDER BY pa.completed_at DESC
                LIMIT 1
                """,
                (user_id,),
            ).fetchone()

            latest_assessment = ReportAssessmentsLatest(
                completed_at=None,
                phq9_total=None,
                gad7_total=None,
                isi_total=None,
                days_since=None,
            )
            if latest_assessment_row and latest_assessment_row["completed_at"]:
                completed_at = datetime.fromisoformat(str(latest_assessment_row["completed_at"]))
                latest_assessment = ReportAssessmentsLatest(
                    completed_at=completed_at,
                    phq9_total=(
                        int(latest_assessment_row["phq9_total"])
                        if latest_assessment_row["phq9_total"] is not None
                        else None
                    ),
                    gad7_total=(
                        int(latest_assessment_row["gad7_total"])
                        if latest_assessment_row["gad7_total"] is not None
                        else None
                    ),
                    isi_total=(
                        int(latest_assessment_row["isi_total"])
                        if latest_assessment_row["isi_total"] is not None
                        else None
                    ),
                    days_since=(date.today() - completed_at.date()).days,
                )

            shown_count_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM challenge_exposure
                WHERE user_id = ?
                  AND exposure_type = 'shown'
                  AND date BETWEEN ? AND ?
                """,
                (user_id, start_date.isoformat(), end_date.isoformat()),
            ).fetchone()
            shown_count = int(shown_count_row["cnt"]) if shown_count_row else 0

            accepted_count_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM challenge_exposure
                WHERE user_id = ?
                  AND response_type = 'accepted'
                  AND date BETWEEN ? AND ?
                """,
                (user_id, start_date.isoformat(), end_date.isoformat()),
            ).fetchone()
            accepted_count = int(accepted_count_row["cnt"]) if accepted_count_row else 0

            declined_count_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM challenge_exposure
                WHERE user_id = ?
                  AND response_type = 'declined'
                  AND date BETWEEN ? AND ?
                """,
                (user_id, start_date.isoformat(), end_date.isoformat()),
            ).fetchone()
            declined_count = int(declined_count_row["cnt"]) if declined_count_row else 0

            active_count_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM challenge_enrollment
                WHERE user_id = ?
                  AND status = 'active'
                """,
                (user_id,),
            ).fetchone()
            active_count = int(active_count_row["cnt"]) if active_count_row else 0

            completion_rate_row = conn.execute(
                """
                SELECT
                  SUM(CASE WHEN completed_flag = 1 THEN 1 ELSE 0 END) AS done_cnt,
                  COUNT(*) AS total_cnt
                FROM challenge_day_log
                WHERE user_id = ?
                  AND date BETWEEN ? AND ?
                """,
                (user_id, start_date.isoformat(), end_date.isoformat()),
            ).fetchone()
            completion_rate = None
            if completion_rate_row and int(completion_rate_row["total_cnt"] or 0) > 0:
                completion_rate = round(
                    int(completion_rate_row["done_cnt"] or 0)
                    / int(completion_rate_row["total_cnt"])
                    * 100,
                    1,
                )

            dropout_count_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM challenge_enrollment
                WHERE user_id = ?
                  AND status = 'dropped'
                  AND ended_at IS NOT NULL
                  AND date(ended_at) BETWEEN ? AND ?
                """,
                (user_id, start_date.isoformat(), end_date.isoformat()),
            ).fetchone()
            dropout_count = int(dropout_count_row["cnt"]) if dropout_count_row else 0

            helpfulness_row = conn.execute(
                """
                SELECT AVG(helpfulness_score_1_5) AS avg_value
                FROM challenge_day_log
                WHERE user_id = ?
                  AND date BETWEEN ? AND ?
                  AND helpfulness_score_1_5 IS NOT NULL
                """,
                (user_id, start_date.isoformat(), end_date.isoformat()),
            ).fetchone()
            helpfulness_mean_0_10 = None
            if helpfulness_row and helpfulness_row["avg_value"] is not None:
                helpfulness_mean_0_10 = round(float(helpfulness_row["avg_value"]) * 2, 1)

            domain_rows = conn.execute(
                """
                SELECT cc.domain, COUNT(*) AS cnt
                FROM challenge_day_log cdl
                JOIN challenge_catalog cc ON cc.challenge_id = cdl.challenge_id
                WHERE cdl.user_id = ?
                  AND cdl.date BETWEEN ? AND ?
                GROUP BY cc.domain
                ORDER BY cnt DESC
                """,
                (user_id, start_date.isoformat(), end_date.isoformat()),
            ).fetchall()
            by_domain = {str(row["domain"]): int(row["cnt"]) for row in domain_rows}

            completed_rows = conn.execute(
                """
                SELECT
                  ce.enrollment_id,
                  ce.challenge_id,
                  cc.name_ko,
                  cc.summary_ko,
                  ce.started_at,
                  ce.ended_at,
                  COALESCE(SUM(CASE WHEN cdl.completed_flag = 1 THEN 1 ELSE 0 END), 0) AS completed_days
                FROM challenge_enrollment ce
                JOIN challenge_catalog cc ON cc.challenge_id = ce.challenge_id
                LEFT JOIN challenge_day_log cdl
                  ON cdl.user_id = ce.user_id
                 AND cdl.enrollment_id = ce.enrollment_id
                WHERE ce.user_id = ?
                  AND ce.status = 'completed'
                  AND ce.ended_at IS NOT NULL
                  AND date(ce.ended_at) BETWEEN ? AND ?
                GROUP BY
                  ce.enrollment_id,
                  ce.challenge_id,
                  cc.name_ko,
                  cc.summary_ko,
                  ce.started_at,
                  ce.ended_at
                ORDER BY ce.ended_at DESC
                LIMIT 10
                """,
                (user_id, start_date.isoformat(), end_date.isoformat()),
            ).fetchall()
            completed_items: list[ReportChallengeCompletedItem] = []
            for row in completed_rows:
                completed_days = int(row["completed_days"] or 0)
                if completed_days <= 0:
                    elapsed_days = 1
                    if row["started_at"] and row["ended_at"]:
                        started_date = datetime.fromisoformat(str(row["started_at"])).date()
                        ended_date = datetime.fromisoformat(str(row["ended_at"])).date()
                        elapsed_days = max((ended_date - started_date).days + 1, 1)
                    completed_days = elapsed_days
                completed_items.append(
                    ReportChallengeCompletedItem(
                        challenge_id=str(row["challenge_id"] or ""),
                        challenge_name=str(row["name_ko"] or "-"),
                        summary_ko=str(row["summary_ko"] or "-"),
                        spent_days=max(completed_days, 1),
                    )
                )

            dropped_rows = conn.execute(
                """
                SELECT
                  ce.enrollment_id,
                  ce.challenge_id,
                  ce.target_days,
                  cc.name_ko,
                  cc.summary_ko,
                  COALESCE(SUM(CASE WHEN cdl.completed_flag = 1 THEN 1 ELSE 0 END), 0) AS performed_days
                FROM challenge_enrollment ce
                JOIN challenge_catalog cc ON cc.challenge_id = ce.challenge_id
                LEFT JOIN challenge_day_log cdl
                  ON cdl.user_id = ce.user_id
                 AND cdl.enrollment_id = ce.enrollment_id
                WHERE ce.user_id = ?
                  AND ce.status = 'dropped'
                  AND ce.ended_at IS NOT NULL
                  AND date(ce.ended_at) BETWEEN ? AND ?
                GROUP BY
                  ce.enrollment_id,
                  ce.challenge_id,
                  ce.target_days,
                  cc.name_ko,
                  cc.summary_ko
                ORDER BY ce.ended_at DESC
                LIMIT 10
                """,
                (user_id, start_date.isoformat(), end_date.isoformat()),
            ).fetchall()
            dropped_items: list[ReportChallengeDroppedItem] = []
            for row in dropped_rows:
                dropped_items.append(
                    ReportChallengeDroppedItem(
                        challenge_id=str(row["challenge_id"] or ""),
                        challenge_name=str(row["name_ko"] or "-"),
                        summary_ko=str(row["summary_ko"] or "-"),
                        performed_days=max(int(row["performed_days"] or 0), 0),
                        target_days=max(int(row["target_days"] or 1), 1),
                    )
                )

            cbt_rows = conn.execute(
                """
                SELECT
                  date,
                  topic_label,
                  planner_action,
                  homework_commitment_0_10,
                  session_helpfulness_0_10,
                  selected_action_kind,
                  selected_action_title,
                  selected_action_description,
                  reflection_status,
                  reflection_performed_flag,
                  reflection_note,
                  state_json
                FROM cbt_session_summary
                WHERE user_id = ?
                  AND date BETWEEN ? AND ?
                ORDER BY date DESC
                """,
                (user_id, start_date.isoformat(), end_date.isoformat()),
            ).fetchall()

            cbt_sessions_count = len(cbt_rows)
            topic_counter: dict[str, int] = {}
            skill_counter: dict[str, int] = {}
            homework_attempts = 0
            helpfulness_values: list[int] = []
            pending_reflection_count = 0
            completed_reflection_count = 0
            cbt_highlights_rows: list[dict[str, str]] = []
            for row in cbt_rows:
                topic = str(row["topic_label"] or "general")
                topic_counter[topic] = topic_counter.get(topic, 0) + 1

                skill = str(row["planner_action"] or CbtPlannerAction.review_evidence.value)
                skill_counter[skill] = skill_counter.get(skill, 0) + 1

                if row["homework_commitment_0_10"] is not None:
                    homework_attempts += 1
                if row["session_helpfulness_0_10"] is not None:
                    helpfulness_values.append(int(row["session_helpfulness_0_10"]))

                reflection_status = str(
                    row["reflection_status"] or CbtReflectionStatus.not_applicable.value
                )
                if reflection_status == CbtReflectionStatus.pending.value:
                    pending_reflection_count += 1
                if reflection_status == CbtReflectionStatus.completed.value:
                    completed_reflection_count += 1

                state_json_raw = str(row["state_json"] or "")
                state_payload: dict[str, object] = {}
                if state_json_raw:
                    try:
                        parsed = json.loads(state_json_raw)
                        if isinstance(parsed, dict):
                            state_payload = parsed
                    except json.JSONDecodeError:
                        state_payload = {}

                action_title = self._normalize_none_action_title(row["selected_action_title"])
                action_kind = str(row["selected_action_kind"] or CbtActionKind.none.value)
                performed_flag = (
                    "수행"
                    if row["reflection_performed_flag"] == 1
                    else "미수행"
                    if row["reflection_performed_flag"] == 0
                    else "미기록"
                )
                reflection_note = str(row["reflection_note"] or "").strip()
                evidence_summary = self._evidence_summary(state_payload) or "-"
                highlight = {
                    "thought": self._thought_summary(state_payload) or "-",
                    "belief": self._core_belief_summary(state_payload) or "-",
                    "evidence": evidence_summary,
                    "balanced_statement": self._balanced_statement_summary(state_payload) or "-",
                    "action": action_title if action_kind != CbtActionKind.none.value else "정하지 않음",
                    "action_result": performed_flag,
                    "reflection_note": reflection_note or "-",
                    "date": str(row["date"] or ""),
                }
                cbt_highlights_rows.append(highlight)

            top_topics = [
                key
                for key, _ in sorted(
                    topic_counter.items(),
                    key=lambda item: (-item[1], item[0]),
                )[:3]
            ]
            top_skills = [
                key
                for key, _ in sorted(
                    skill_counter.items(),
                    key=lambda item: (-item[1], item[0]),
                )[:3]
            ]
            cbt_helpfulness_mean = (
                round(statistics.mean(helpfulness_values), 1) if helpfulness_values else None
            )
            cbt_highlights_rows.sort(key=lambda item: item["date"], reverse=True)
            if cbt_sessions_count <= 3:
                highlights = cbt_highlights_rows[:3]
            else:
                grouped: dict[str, dict[str, object]] = {}
                for item in cbt_highlights_rows:
                    key = item["belief"] if item["belief"] != "-" else item["thought"]
                    if key not in grouped:
                        grouped[key] = {"count": 0, "item": item, "dates": []}
                    grouped[key]["count"] = int(grouped[key]["count"]) + 1
                    dates = grouped[key]["dates"]
                    if isinstance(dates, list) and item["date"] and item["date"] not in dates:
                        dates.append(item["date"])
                highlights = []
                for _, value in sorted(
                    grouped.items(),
                    key=lambda pair: (-int(pair[1]["count"]), str(pair[0])),
                )[:3]:
                    item = value.get("item")
                    if isinstance(item, dict):
                        item_with_dates = dict(item)
                        dates = value.get("dates")
                        if isinstance(dates, list):
                            clean_dates = sorted(
                                [date_value for date_value in dates if isinstance(date_value, str) and date_value],
                                reverse=True,
                            )
                            if clean_dates:
                                item_with_dates["date"] = ", ".join(clean_dates)
                        highlights.append(item_with_dates)

            risk_rows = conn.execute(
                """
                SELECT
                  date,
                  functional_impairment_flag,
                  self_harm_flag,
                  suicide_risk_level,
                  violence_risk_flag,
                  risk_source
                FROM cbt_risk_signal
                WHERE user_id = ?
                  AND date BETWEEN ? AND ?
                ORDER BY date DESC
                """,
                (user_id, start_date.isoformat(), end_date.isoformat()),
            ).fetchall()

            if include_sensitive:
                functional_impairment_any = any(
                    bool(row["functional_impairment_flag"]) for row in risk_rows
                )
                self_harm_any = any(bool(row["self_harm_flag"]) for row in risk_rows)
                violence_any = any(bool(row["violence_risk_flag"]) for row in risk_rows)
                suicide_max = max([int(row["suicide_risk_level"]) for row in risk_rows], default=0)

                events: list[ReportRiskEvent] = []
                for row in risk_rows:
                    event_type = "functional_impairment"
                    level: int | None = None
                    detail: str | None = None
                    if int(row["suicide_risk_level"]) > 0:
                        event_type = "suicide_risk"
                        level = int(row["suicide_risk_level"])
                    elif bool(row["self_harm_flag"]):
                        event_type = "self_harm"
                    elif bool(row["violence_risk_flag"]):
                        event_type = "violence_risk"
                    elif bool(row["functional_impairment_flag"]):
                        detail = self._functional_impairment_detail(
                            conn,
                            user_id,
                            str(row["date"]),
                        )

                    events.append(
                        ReportRiskEvent(
                            date=date.fromisoformat(str(row["date"])),
                            type=event_type,
                            level=level,
                            source=str(row["risk_source"]),
                            detail=detail,
                        )
                    )
            else:
                functional_impairment_any = False
                self_harm_any = False
                violence_any = False
                suicide_max = 0
                events = []

            risk_summary = ReportRiskSummary(
                functional_impairment_any=functional_impairment_any,
                self_harm_any=self_harm_any,
                suicide_risk_max_level=suicide_max,
                violence_risk_any=violence_any,
                events=events,
            )

            checkin_days = len(payload_map)
            assessment_count = len(assessment_history)
            challenge_log_days_row = conn.execute(
                """
                SELECT COUNT(DISTINCT date) AS cnt
                FROM challenge_day_log
                WHERE user_id = ?
                  AND date BETWEEN ? AND ?
                """,
                (user_id, start_date.isoformat(), end_date.isoformat()),
            ).fetchone()
            challenge_log_days = int(challenge_log_days_row["cnt"]) if challenge_log_days_row else 0

            source_density = ReportSourceDensity(
                days_in_period=days_in_period,
                checkin_days=checkin_days,
                assessment_count=assessment_count,
                challenge_log_days=challenge_log_days,
                cbt_sessions=cbt_sessions_count,
                note=self._density_message(checkin_days, days_in_period),
            )

            computed = ReportComputed(
                symptom_timeseries=symptom_timeseries,
                sleep_metrics=sleep_metrics,
                lifestyle_metrics=lifestyle_metrics,
                assessments=ReportAssessments(latest=latest_assessment, history=assessment_history),
                challenge_summary=ReportChallengeSummary(
                    shown_count=shown_count,
                    accepted_count=accepted_count,
                    declined_count=declined_count,
                    active_count=active_count,
                    completion_rate=completion_rate,
                    dropout_count=dropout_count,
                    helpfulness_mean_0_10=helpfulness_mean_0_10,
                    by_domain=by_domain,
                    completed_items=completed_items,
                    dropped_items=dropped_items,
                ),
                cbt_summary=ReportCbtSummary(
                    sessions_count=cbt_sessions_count,
                    top_topics=top_topics,
                    top_skills=top_skills,
                    homework_attempts=homework_attempts,
                    helpfulness_mean_0_10=cbt_helpfulness_mean,
                    pending_reflection_count=pending_reflection_count,
                    completed_reflection_count=completed_reflection_count,
                    highlights=highlights,
                ),
                risk_summary=risk_summary,
            )

            return ReportSummaryResponse(
                period=ReportPeriod(start_date=start_date, end_date=end_date),
                computed=computed,
                source_density=source_density,
            )

    @staticmethod
    def _pdf_escape(text: str) -> str:
        return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    def _render_report_pdf(self, report: ReportSummaryResponse) -> bytes:
        latest = report.computed.assessments.latest
        highlights = report.computed.cbt_summary.highlights[:3]
        lines = [
            "MindLab Summary Report",
            (
                f"Period: {report.period.start_date.isoformat()} ~ "
                f"{report.period.end_date.isoformat()}"
            ),
            "Note: Reference only. Not for diagnosis or prescription.",
            "",
            (
                f"Check-in days: {report.source_density.checkin_days}/"
                f"{report.source_density.days_in_period}"
            ),
            f"CBT sessions: {report.computed.cbt_summary.sessions_count}",
            (
                "CBT reflections: "
                f"pending={report.computed.cbt_summary.pending_reflection_count}, "
                f"completed={report.computed.cbt_summary.completed_reflection_count}"
            ),
            f"Challenge active count: {report.computed.challenge_summary.active_count}",
            f"Highest suicide risk level: {report.computed.risk_summary.suicide_risk_max_level}",
            "",
            "Latest assessment:",
            f"  PHQ-9: {latest.phq9_total}",
            f"  GAD-7: {latest.gad7_total}",
            f"  ISI: {latest.isi_total}",
            f"  Days since: {latest.days_since}",
            "",
            f"Density note: {report.source_density.note}",
            "Header excludes user name and nickname by policy.",
        ]

        if highlights:
            lines.append("")
            lines.append("CBT highlights:")
            for index, highlight in enumerate(highlights, start=1):
                lines.append(f"  {index}) Belief: {highlight['belief']}")
                lines.append(f"     Reframe: {highlight['balanced_statement']}")
                lines.append(
                    f"     Action: {highlight['action']} ({highlight['action_result']})"
                )
                lines.append(f"     Reflection: {highlight['reflection_note']}")

        content_lines = ["BT", "/F1 11 Tf"]
        y = 800
        for line in lines:
            content_lines.append(f"1 0 0 1 48 {y} Tm ({self._pdf_escape(line)}) Tj")
            y -= 16
            if y < 48:
                break
        content_lines.append("ET")
        content = "\n".join(content_lines).encode("latin-1", errors="replace")

        objects: list[bytes] = []
        objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
        objects.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
        objects.append(
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"
        )
        objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
        objects.append(
            f"<< /Length {len(content)} >>\nstream\n".encode("latin-1")
            + content
            + b"\nendstream"
        )

        buffer = bytearray(b"%PDF-1.4\n")
        offsets = [0]
        for index, obj in enumerate(objects, start=1):
            offsets.append(len(buffer))
            buffer.extend(f"{index} 0 obj\n".encode("latin-1"))
            buffer.extend(obj)
            buffer.extend(b"\nendobj\n")

        xref_offset = len(buffer)
        buffer.extend(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
        buffer.extend(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            buffer.extend(f"{offset:010} 00000 n \n".encode("latin-1"))

        buffer.extend(
            (
                "trailer\n"
                f"<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
                "startxref\n"
                f"{xref_offset}\n"
                "%%EOF"
            ).encode("latin-1")
        )

        return bytes(buffer)

    @staticmethod
    def _png_chunk(tag: bytes, data: bytes) -> bytes:
        return (
            len(data).to_bytes(4, "big")
            + tag
            + data
            + zlib.crc32(tag + data).to_bytes(4, "big")
        )

    def _render_report_png(self, report: ReportSummaryResponse) -> bytes:
        width = 960
        height = 540
        stride = width * 3 + 1
        raster = bytearray(stride * height)

        for y in range(height):
            offset = y * stride
            raster[offset] = 0
            for x in range(width):
                idx = offset + 1 + x * 3
                raster[idx] = 250
                raster[idx + 1] = 251
                raster[idx + 2] = 255

        means = {
            "dep": statistics.mean(
                [point.dep_state for point in report.computed.symptom_timeseries]
            )
            if report.computed.symptom_timeseries
            else 0,
            "anx": statistics.mean(
                [point.anx_state for point in report.computed.symptom_timeseries]
            )
            if report.computed.symptom_timeseries
            else 0,
            "ins": statistics.mean(
                [point.ins_state for point in report.computed.symptom_timeseries]
            )
            if report.computed.symptom_timeseries
            else 0,
        }

        bars = [
            (120, int(means["dep"] / 100 * 700), (124, 108, 246)),
            (240, int(means["anx"] / 100 * 700), (243, 154, 193)),
            (360, int(means["ins"] / 100 * 700), (110, 199, 193)),
        ]

        def draw_rect(x0: int, y0: int, w: int, h: int, rgb: tuple[int, int, int]) -> None:
            if w <= 0 or h <= 0:
                return
            x_start = max(0, x0)
            y_start = max(0, y0)
            x_end = min(width, x0 + w)
            y_end = min(height, y0 + h)
            for y in range(y_start, y_end):
                row_offset = y * stride
                for x in range(x_start, x_end):
                    idx = row_offset + 1 + x * 3
                    raster[idx] = rgb[0]
                    raster[idx + 1] = rgb[1]
                    raster[idx + 2] = rgb[2]

        draw_rect(100, 70, 760, 390, (236, 240, 248))
        for y, length, color in bars:
            draw_rect(130, y, length, 54, color)

        if report.computed.risk_summary.suicide_risk_max_level >= 2:
            draw_rect(100, 470, 760, 24, (235, 114, 130))

        compressed = zlib.compress(bytes(raster), level=9)
        png = bytearray()
        png.extend(b"\x89PNG\r\n\x1a\n")
        png.extend(
            self._png_chunk(
                b"IHDR",
                width.to_bytes(4, "big")
                + height.to_bytes(4, "big")
                + b"\x08\x02\x00\x00\x00",
            )
        )
        png.extend(
            self._png_chunk(
                b"tEXt",
                b"Software\x00MindSight report export (name/nickname excluded)",
            )
        )
        png.extend(self._png_chunk(b"IDAT", compressed))
        png.extend(self._png_chunk(b"IEND", b""))
        return bytes(png)

    def save_report(
        self,
        user_id: str,
        payload: ReportSummarySaveRequest,
    ) -> ReportSummarySaveResponse:
        self.get_report_summary(
            user_id=user_id,
            start_date=payload.start_date,
            end_date=payload.end_date,
            include_sensitive=payload.include_sensitive,
        )

        file_name = datetime.now().strftime("%Y-%m-%d %H:%M")
        return self._save_report_export_meta(
            user_id=user_id,
            period_start=payload.start_date,
            period_end=payload.end_date,
            export_format="saved",
            file_name=file_name,
            content_type="application/x-mindsight-report-summary",
        )

    def export_report(
        self,
        user_id: str,
        payload: ReportSummaryExportRequest,
    ) -> tuple[bytes, str, str]:
        report = self.get_report_summary(
            user_id=user_id,
            start_date=payload.start_date,
            end_date=payload.end_date,
            include_sensitive=payload.include_sensitive,
        )

        base_name = (
            f"mindlab-summary-{payload.start_date.strftime('%Y%m%d')}-"
            f"{payload.end_date.strftime('%Y%m%d')}"
        )

        if payload.format == ReportExportFormat.pdf:
            file_name = f"{base_name}.pdf"
            content = self._render_report_pdf(report)
            content_type = "application/pdf"
            if payload.save_to_vault:
                self._save_report_export_meta(
                    user_id=user_id,
                    period_start=payload.start_date,
                    period_end=payload.end_date,
                    export_format=payload.format.value,
                    file_name=file_name,
                    content_type=content_type,
                )
            return content, content_type, file_name

        file_name = f"{base_name}.png"
        content = self._render_report_png(report)
        content_type = "image/png"
        if payload.save_to_vault:
            self._save_report_export_meta(
                user_id=user_id,
                period_start=payload.start_date,
                period_end=payload.end_date,
                export_format=payload.format.value,
                file_name=file_name,
                content_type=content_type,
            )
        return content, content_type, file_name
