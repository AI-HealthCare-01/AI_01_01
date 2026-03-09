from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from app.auth.store import AuthStore
from app.core_inputs.store import CoreInputStore

from .models import (
    AdminActorContext,
    AdminBaseRole,
    AdminExtensionCode,
    AdminExtensionStatus,
    AdminMeResponse,
    AdminNotificationSeverity,
    AdminNotificationStatus,
    AdminOverviewKpi,
    AdminOverviewResponse,
    AdminQueueCode,
    AdminQueueSummaryItem,
    AdminRoleAssignRequest,
    AdminRoleListItem,
    AdminRoleListResponse,
    AdminRoleRecord,
    AdminSupportQueueItem,
    AdminSupportQueueResponse,
    AdminUserBanContextResponse,
    AdminUserListItem,
    AdminUserListResponse,
    AuditLogListResponse,
    AuditLogRecord,
    ExtensionDecision,
    ExtensionDecisionRequest,
    ExtensionRecord,
    ExtensionRequestCreateRequest,
    ModelChangeCreateRequest,
    ModelChangeRecord,
    ModelChangeStatus,
    ModelChangeTransitionRequest,
    ModelRetrainingJobCreateRequest,
    ModelRetrainingJobRecord,
    ModelRetrainingJobStatus,
    ModelRetrainingJobTransitionRequest,
    ModelRetrainingRunMode,
    OwnerApprovalDecision,
    OwnerApprovalDecisionRequest,
    OwnerApprovalObjectType,
    OwnerApprovalRecord,
    OwnerApprovalStatus,
    OwnerApprovalSubmitRequest,
    PolicyChangeRecord,
    PolicyChangeStatus,
    PolicyDomain,
    PolicyDraftCreateRequest,
    PolicyDraftUpdateRequest,
    RestrictionActionResponse,
    RestrictionCreateRequest,
)

BASE_ROLE_PERMISSIONS: dict[AdminBaseRole, list[str]] = {
    AdminBaseRole.owner: [
        "overview:view",
        "users:view",
        "users:ban_context",
        "restrictions:execute",
        "moderation:view",
        "support_queue:view",
        "support_queue:reply",
        "policy:draft",
        "policy:submit_owner_approval",
        "policy:approve",
        "policy:apply",
        "model_ops:view",
        "model_ops:edit",
        "model_ops:approve",
        "model_ops:deploy",
        "roles:manage",
        "audit:view",
    ],
    AdminBaseRole.admin: [
        "overview:view",
        "users:view",
        "users:ban_context",
        "restrictions:execute",
        "moderation:view",
        "support_queue:view",
        "support_queue:reply",
        "policy:draft",
        "policy:submit_owner_approval",
        "model_ops:view",
        "model_ops:edit",
        "roles:view",
        "audit:view",
    ],
    AdminBaseRole.support: [
        "overview:view",
        "users:view_basic",
        "support_queue:view",
        "support_queue:reply",
        "audit:view_limited",
        "extension:request",
    ],
}


class AdminConsoleStore:
    def __init__(self, database_path: Path):
        self.database_path = database_path
        self.database_path.parent.mkdir(parents=True, exist_ok=True)

        # Ensure base auth/core schemas are available.
        AuthStore(database_path)
        CoreInputStore(database_path)

        self._initialize_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(UTC).isoformat()

    @staticmethod
    def _to_datetime(value: str | None) -> datetime | None:
        if not value:
            return None
        return datetime.fromisoformat(value)

    @staticmethod
    def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            (table_name,),
        ).fetchone()
        return row is not None

    @staticmethod
    def _table_has_column(conn: sqlite3.Connection, table_name: str, column_name: str) -> bool:
        rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        return any(str(row["name"]) == column_name for row in rows)

    @staticmethod
    def _owner_seed_email() -> str | None:
        value = os.getenv("ADMIN_OWNER_EMAIL", "").strip().lower()
        return value or None

    @staticmethod
    def _owner_seed_firebase_uid() -> str | None:
        value = os.getenv("ADMIN_OWNER_FIREBASE_UID", "").strip()
        return value or None

    def _initialize_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS admin_account_role (
                  admin_user_id TEXT PRIMARY KEY,
                  base_role TEXT NOT NULL CHECK (base_role IN ('owner','admin','support')),
                  is_active INTEGER NOT NULL DEFAULT 1,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS admin_capability_extension (
                  extension_id TEXT PRIMARY KEY,
                  admin_user_id TEXT NOT NULL,
                  extension_code TEXT NOT NULL,
                  status TEXT NOT NULL,
                  requested_at TEXT NOT NULL,
                  approved_at TEXT,
                  approved_by TEXT,
                  note TEXT
                );

                CREATE TABLE IF NOT EXISTS admin_notification (
                  notification_id TEXT PRIMARY KEY,
                  queue_code TEXT NOT NULL,
                  related_object_type TEXT NOT NULL,
                  related_object_id TEXT NOT NULL,
                  severity TEXT NOT NULL,
                  status TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  assigned_admin_user_id TEXT
                );

                CREATE TABLE IF NOT EXISTS restriction_action (
                  action_id TEXT PRIMARY KEY,
                  target_user_id TEXT NOT NULL,
                  target_email TEXT,
                  target_ip TEXT,
                  block_account INTEGER NOT NULL DEFAULT 0,
                  block_ip INTEGER NOT NULL DEFAULT 0,
                  reason_code TEXT NOT NULL,
                  reason_detail TEXT,
                  starts_at TEXT NOT NULL,
                  ends_at TEXT,
                  created_by_admin_user_id TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS owner_approval_request (
                  approval_id TEXT PRIMARY KEY,
                  object_type TEXT NOT NULL,
                  object_id TEXT NOT NULL,
                  status TEXT NOT NULL,
                  requested_by_admin_user_id TEXT NOT NULL,
                  requested_at TEXT NOT NULL,
                  decided_by_owner_user_id TEXT,
                  decided_at TEXT,
                  decision_note TEXT
                );

                CREATE TABLE IF NOT EXISTS audit_log (
                  audit_id TEXT PRIMARY KEY,
                  actor_admin_user_id TEXT NOT NULL,
                  actor_role TEXT NOT NULL,
                  action_type TEXT NOT NULL,
                  target_type TEXT NOT NULL,
                  target_id TEXT NOT NULL,
                  metadata_json TEXT,
                  created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS admin_policy_change (
                  policy_change_id TEXT PRIMARY KEY,
                  policy_domain TEXT NOT NULL,
                  title TEXT NOT NULL,
                  draft_json TEXT NOT NULL,
                  status TEXT NOT NULL,
                  requested_by_admin_user_id TEXT NOT NULL,
                  requested_at TEXT NOT NULL,
                  decided_by_owner_user_id TEXT,
                  decided_at TEXT,
                  decision_note TEXT,
                  applied_at TEXT
                );

                CREATE TABLE IF NOT EXISTS admin_model_change (
                  model_change_id TEXT PRIMARY KEY,
                  model_name TEXT NOT NULL,
                  experiment_name TEXT NOT NULL,
                  change_summary TEXT NOT NULL,
                  metrics_json TEXT NOT NULL,
                  status TEXT NOT NULL,
                  requested_by_admin_user_id TEXT NOT NULL,
                  requested_at TEXT NOT NULL,
                  decided_by_owner_user_id TEXT,
                  decided_at TEXT,
                  decision_note TEXT,
                  deployed_at TEXT,
                  rolled_back_at TEXT
                );

                CREATE TABLE IF NOT EXISTS admin_model_retraining_job (
                  job_id TEXT PRIMARY KEY,
                  model_change_id TEXT NOT NULL,
                  model_name TEXT NOT NULL,
                  status TEXT NOT NULL,
                  mode TEXT NOT NULL,
                  training_window_days INTEGER NOT NULL,
                  include_synthetic_data INTEGER NOT NULL,
                  dataset_snapshot_id TEXT,
                  note TEXT,
                  requested_by_admin_user_id TEXT NOT NULL,
                  requested_at TEXT NOT NULL,
                  approved_at TEXT,
                  started_at TEXT,
                  completed_at TEXT,
                  artifact_uri TEXT,
                  result_summary_json TEXT,
                  failure_reason TEXT
                );

                CREATE TABLE IF NOT EXISTS account_login_event (
                  event_id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL,
                  ip_address TEXT,
                  logged_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_admin_role_base_role
                ON admin_account_role(base_role);

                CREATE INDEX IF NOT EXISTS idx_admin_extension_user_requested
                ON admin_capability_extension(admin_user_id, requested_at DESC);

                CREATE INDEX IF NOT EXISTS idx_owner_approval_status
                ON owner_approval_request(status, object_type, requested_at DESC);

                CREATE INDEX IF NOT EXISTS idx_audit_log_created
                ON audit_log(created_at DESC);

                CREATE INDEX IF NOT EXISTS idx_policy_change_status
                ON admin_policy_change(status, requested_at DESC);

                CREATE INDEX IF NOT EXISTS idx_model_change_status
                ON admin_model_change(status, requested_at DESC);

                CREATE INDEX IF NOT EXISTS idx_model_retraining_job_model_change
                ON admin_model_retraining_job(model_change_id, requested_at DESC);

                CREATE INDEX IF NOT EXISTS idx_model_retraining_job_status
                ON admin_model_retraining_job(status, requested_at DESC);
                """
            )
            conn.commit()

    def record_login_event(self, user_id: str, ip_address: str | None) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO account_login_event (event_id, user_id, ip_address, logged_at)
                VALUES (?, ?, ?, ?)
                """,
                (f"evt_{uuid.uuid4().hex}", user_id, ip_address, self._now_iso()),
            )
            conn.commit()

    def _latest_extension(
        self,
        conn: sqlite3.Connection,
        admin_user_id: str,
        code: AdminExtensionCode,
    ) -> sqlite3.Row | None:
        return conn.execute(
            """
            SELECT *
            FROM admin_capability_extension
            WHERE admin_user_id = ?
              AND extension_code = ?
            ORDER BY datetime(requested_at) DESC
            LIMIT 1
            """,
            (admin_user_id, code.value),
        ).fetchone()

    def _extension_codes(
        self,
        conn: sqlite3.Connection,
        admin_user_id: str,
    ) -> list[AdminExtensionCode]:
        row = self._latest_extension(conn, admin_user_id, AdminExtensionCode.analyst_ml_extension)
        if row and str(row["status"]) == AdminExtensionStatus.approved.value:
            return [AdminExtensionCode.analyst_ml_extension]
        return []

    def _bootstrap_or_get_role(self, conn: sqlite3.Connection, admin_user_id: str) -> AdminBaseRole:
        account_row = conn.execute(
            """
            SELECT firebase_uid, email
            FROM account_user
            WHERE user_id = ?
            """,
            (admin_user_id,),
        ).fetchone()
        if not account_row:
            raise ValueError("account_not_found")

        firebase_uid = str(account_row["firebase_uid"])
        email = str(account_row["email"]).lower()
        owner_seed_uid = self._owner_seed_firebase_uid()
        owner_seed_email = self._owner_seed_email()
        owner_seed_enabled = bool(owner_seed_uid or owner_seed_email)
        owner_seed_matched = True
        if owner_seed_uid and firebase_uid != owner_seed_uid:
            owner_seed_matched = False
        if owner_seed_email and email != owner_seed_email:
            owner_seed_matched = False

        row = conn.execute(
            """
            SELECT base_role, is_active
            FROM admin_account_role
            WHERE admin_user_id = ?
            """,
            (admin_user_id,),
        ).fetchone()

        if row and bool(row["is_active"]):
            current_role = AdminBaseRole(str(row["base_role"]))
            if owner_seed_enabled and owner_seed_matched and current_role != AdminBaseRole.owner:
                now = self._now_iso()
                conn.execute(
                    """
                    UPDATE admin_account_role
                    SET base_role = ?, updated_at = ?
                    WHERE admin_user_id = ?
                    """,
                    (AdminBaseRole.owner.value, now, admin_user_id),
                )
                conn.commit()
                return AdminBaseRole.owner
            return current_role

        active_count_row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM admin_account_role WHERE is_active = 1"
        ).fetchone()
        active_count = int(active_count_row["cnt"] or 0) if active_count_row else 0

        if owner_seed_enabled:
            if owner_seed_matched:
                boot_role = AdminBaseRole.owner
                now = self._now_iso()
                conn.execute(
                    """
                    INSERT INTO admin_account_role (
                      admin_user_id,
                      base_role,
                      is_active,
                      created_at,
                      updated_at
                    ) VALUES (?, ?, 1, ?, ?)
                    ON CONFLICT(admin_user_id) DO UPDATE SET
                      base_role = excluded.base_role,
                      is_active = excluded.is_active,
                      updated_at = excluded.updated_at
                    """,
                    (admin_user_id, boot_role.value, now, now),
                )
                conn.commit()
                return boot_role
            if active_count == 0:
                raise ValueError("owner_seed_mismatch")
            raise ValueError("admin_role_not_assigned")

        if active_count > 0:
            raise ValueError("admin_role_not_assigned")

        boot_role = AdminBaseRole.owner
        now = self._now_iso()
        conn.execute(
            """
            INSERT INTO admin_account_role (
              admin_user_id,
              base_role,
              is_active,
              created_at,
              updated_at
            ) VALUES (?, ?, 1, ?, ?)
            ON CONFLICT(admin_user_id) DO UPDATE SET
              base_role = excluded.base_role,
              is_active = excluded.is_active,
              updated_at = excluded.updated_at
            """,
            (admin_user_id, boot_role.value, now, now),
        )
        conn.commit()
        return boot_role

    def get_actor_context(self, admin_user_id: str) -> AdminActorContext:
        with self._connect() as conn:
            base_role = self._bootstrap_or_get_role(conn, admin_user_id)
            extension_codes = self._extension_codes(conn, admin_user_id)
            return AdminActorContext(
                admin_user_id=admin_user_id,
                base_role=base_role,
                extension_codes=extension_codes,
            )

    @staticmethod
    def _json_load(value: str | None) -> dict[str, object]:
        if not value:
            return {}
        try:
            loaded = json.loads(value)
        except json.JSONDecodeError:
            return {}
        if isinstance(loaded, dict):
            return loaded
        return {}

    @staticmethod
    def _coerce_float(value: object) -> float | None:
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                parsed = float(value.strip())
            except ValueError:
                return None
            if parsed != parsed:  # NaN guard
                return None
            return parsed
        return None

    @staticmethod
    def _coerce_bool(value: object, default: bool = False) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return value != 0
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "y", "on"}:
                return True
            if normalized in {"0", "false", "no", "n", "off"}:
                return False
        return default

    @classmethod
    def _extract_metric_values(
        cls,
        source: dict[str, object] | None,
    ) -> dict[str, float]:
        if not source:
            return {}

        nested = source.get("metrics")
        metric_source: dict[str, object]
        if isinstance(nested, dict):
            metric_source = nested
        else:
            metric_source = {
                key: value
                for key, value in source.items()
                if key not in {"feature_set", "metrics", "previous_reference"}
            }

        resolved: dict[str, float] = {}
        for key, value in metric_source.items():
            metric_value = cls._coerce_float(value)
            if metric_value is None:
                continue
            resolved[str(key)] = metric_value
        return resolved

    @staticmethod
    def _metric_direction(metric_key: str) -> int:
        key = metric_key.lower()
        lower_is_better_tokens = ("mae", "rmse", "mse", "loss", "error")
        higher_is_better_tokens = ("coverage", "auc", "f1", "accuracy", "r2", "recall", "precision")
        if any(token in key for token in lower_is_better_tokens):
            return -1
        if any(token in key for token in higher_is_better_tokens):
            return 1
        return 0

    @classmethod
    def _metric_display_label(cls, metric_key: str) -> str:
        label_map = {
            "dep_mae": "우울 예측 오차",
            "anx_mae": "불안 예측 오차",
            "ins_mae": "불면 예측 오차",
            "coverage": "예측 커버리지",
        }
        return label_map.get(metric_key, metric_key)

    @classmethod
    def _describe_metric_change(
        cls,
        metric_key: str,
        before_value: float,
        after_value: float,
    ) -> tuple[str, float]:
        delta = after_value - before_value
        direction = cls._metric_direction(metric_key)
        if abs(delta) < 1e-9:
            return ("동일", delta)

        if direction < 0:
            return ("개선" if delta < 0 else "저하", delta)
        if direction > 0:
            return ("개선" if delta > 0 else "저하", delta)
        return ("증가" if delta > 0 else "감소", delta)

    @classmethod
    def _score_comparison_payload(
        cls,
        before_metrics: dict[str, float],
        after_metrics: dict[str, float],
    ) -> dict[str, object]:
        merged_keys = sorted(set(before_metrics.keys()) | set(after_metrics.keys()))
        items: list[dict[str, object]] = []
        improved = 0
        degraded = 0
        unchanged = 0

        for key in merged_keys:
            before_value = before_metrics.get(key)
            after_value = after_metrics.get(key)
            if before_value is None or after_value is None:
                items.append(
                    {
                        "key": key,
                        "label": cls._metric_display_label(key),
                        "before": before_value,
                        "after": after_value,
                        "delta": None,
                        "status": "insufficient",
                    }
                )
                continue

            status, delta = cls._describe_metric_change(key, before_value, after_value)
            if status == "개선":
                improved += 1
            elif status == "저하":
                degraded += 1
            elif status == "동일":
                unchanged += 1

            items.append(
                {
                    "key": key,
                    "label": cls._metric_display_label(key),
                    "before": round(before_value, 4),
                    "after": round(after_value, 4),
                    "delta": round(delta, 4),
                    "status": status,
                }
            )

        if improved > 0 and degraded == 0:
            overall = "improved"
        elif degraded > 0 and improved == 0:
            overall = "degraded"
        elif improved == 0 and degraded == 0:
            overall = "unchanged"
        else:
            overall = "mixed"

        return {
            "items": items,
            "improved_count": improved,
            "degraded_count": degraded,
            "unchanged_count": unchanged,
            "overall": overall,
        }

    @classmethod
    def _build_operator_score_message(
        cls,
        before_metrics: dict[str, float],
        after_metrics: dict[str, float],
        comparison: dict[str, object],
    ) -> str:
        items = comparison.get("items")
        if not isinstance(items, list) or not items:
            return "성능 비교 지표가 아직 없어 이전 버전 대비 변화를 판단할 수 없습니다."

        improved = int(comparison.get("improved_count", 0) or 0)
        degraded = int(comparison.get("degraded_count", 0) or 0)
        measured = sum(1 for key in set(before_metrics) | set(after_metrics) if key in before_metrics and key in after_metrics)

        highlight_keys = [key for key in ("dep_mae", "anx_mae", "ins_mae", "coverage") if key in before_metrics and key in after_metrics]
        details: list[str] = []
        for key in highlight_keys[:2]:
            before_value = before_metrics[key]
            after_value = after_metrics[key]
            status, _ = cls._describe_metric_change(key, before_value, after_value)
            details.append(f"{cls._metric_display_label(key)} {before_value:.3f}→{after_value:.3f}({status})")

        if measured == 0:
            return "성능 수치가 입력되지 않아 비교 설명을 만들 수 없습니다."

        head = f"핵심 지표 {measured}개 중 {improved}개 개선, {degraded}개 저하되었습니다."
        if details:
            return f"{head} 주요 변화: {' / '.join(details)}."
        return head

    @staticmethod
    def _merge_summary_dict(
        base: dict[str, object],
        patch: dict[str, object],
    ) -> dict[str, object]:
        merged: dict[str, object] = dict(base)
        for key, value in patch.items():
            current_value = merged.get(key)
            if isinstance(value, dict) and isinstance(current_value, dict):
                nested = dict(current_value)
                nested.update(value)
                merged[key] = nested
            else:
                merged[key] = value
        return merged

    @staticmethod
    def _resolve_retraining_rule_config(payload: ModelRetrainingJobCreateRequest) -> dict[str, object]:
        default_end_date = date.today()
        selection_end_date = payload.data_range_end_date or default_end_date
        if payload.data_range_start_date:
            selection_start_date = payload.data_range_start_date
        else:
            selection_start_date = selection_end_date - timedelta(days=max(0, payload.training_window_days - 1))

        if selection_start_date > selection_end_date:
            raise ValueError("invalid_retraining_range")

        selection_window_days = ((selection_end_date - selection_start_date).days + 1)
        # Retraining rows are always defined as:
        # one completed assessment(target) + prior 28-day activity inputs.
        assessment_window_days = 28
        min_assessment_count = 2 if payload.require_second_assessment_completion else 1
        selection_parts = []
        if payload.require_min_account_age_days_28:
            selection_parts.append("가입 28일 이상")
        if payload.require_second_assessment_completion:
            selection_parts.append("2회 이상 진단 완료")
        selection_parts.append(
            f"진단 완료일 {selection_start_date.isoformat()}~{selection_end_date.isoformat()}"
        )
        selection_parts.append("입력 윈도우: 진단일 이전 28일(체크인/CBT/챌린지)")

        return {
            "assessment_window_days": assessment_window_days,
            "window_start_offset_days": assessment_window_days - 1,
            "min_assessment_count": min_assessment_count,
            "selection_start_date": selection_start_date.isoformat(),
            "selection_end_date": selection_end_date.isoformat(),
            "selection_window_days": selection_window_days,
            "selection_rule_summary": " + ".join(selection_parts) if selection_parts else "기본 조건",
            "input_window_locked_28d": True,
        }

    def _build_retraining_eligible_user_ids(
        self,
        conn: sqlite3.Connection,
        payload: ModelRetrainingJobCreateRequest,
    ) -> list[str]:
        if not self._table_exists(conn, "account_user") or not self._table_exists(conn, "periodic_assessment"):
            return []

        config = self._resolve_retraining_rule_config(payload)
        selection_start_date = str(config["selection_start_date"])
        selection_end_date = str(config["selection_end_date"])

        base_where = ["1 = 1"]
        base_params: list[object] = []
        if payload.require_min_account_age_days_28:
            cutoff_iso = (datetime.now(UTC) - timedelta(days=28)).isoformat()
            base_where.append("datetime(au.created_at) <= datetime(?)")
            base_params.append(cutoff_iso)

        eligibility_clauses = ["in_range_completed_count >= 1"]
        if payload.require_second_assessment_completion:
            if payload.keep_user_after_eligibility:
                eligibility_clauses.append("total_completed_count >= 2")
            else:
                eligibility_clauses.append("in_range_completed_count >= 2")
        else:
            eligibility_clauses.append("total_completed_count >= 1")

        rows = conn.execute(
            f"""
            WITH user_assessment_stats AS (
              SELECT
                au.user_id AS user_id,
                SUM(
                  CASE
                    WHEN pa.status IN ('completed', 'late') AND pa.completed_at IS NOT NULL
                    THEN 1 ELSE 0
                  END
                ) AS total_completed_count,
                SUM(
                  CASE
                    WHEN pa.status IN ('completed', 'late')
                      AND pa.completed_at IS NOT NULL
                      AND date(pa.completed_at) BETWEEN ? AND ?
                    THEN 1 ELSE 0
                  END
                ) AS in_range_completed_count
              FROM account_user au
              LEFT JOIN periodic_assessment pa ON pa.user_id = au.user_id
              WHERE {' AND '.join(base_where)}
              GROUP BY au.user_id
            )
            SELECT user_id
            FROM user_assessment_stats
            WHERE {' AND '.join(eligibility_clauses)}
            ORDER BY user_id ASC
            """,
            (selection_start_date, selection_end_date, *base_params),
        ).fetchall()
        return [str(row["user_id"]) for row in rows]

    def _load_retraining_assessment_rows(
        self,
        conn: sqlite3.Connection,
        payload: ModelRetrainingJobCreateRequest,
        eligible_user_ids: list[str] | None = None,
    ) -> list[dict[str, object]]:
        config = self._resolve_retraining_rule_config(payload)
        min_assessment_count = int(config["min_assessment_count"])
        start_offset_days = int(config["window_start_offset_days"])
        selection_start_date = str(config["selection_start_date"])
        selection_end_date = str(config["selection_end_date"])

        resolved_user_ids = (
            eligible_user_ids
            if eligible_user_ids is not None
            else self._build_retraining_eligible_user_ids(conn, payload)
        )
        if not resolved_user_ids:
            return []

        placeholders = ", ".join(["?"] * len(resolved_user_ids))
        has_checkin = self._table_exists(conn, "daily_checkin")
        has_checkin_features = self._table_exists(conn, "daily_checkin_features_daily")
        has_checkin_version = has_checkin and self._table_exists(conn, "daily_checkin_version")
        has_challenge_logs = self._table_exists(conn, "challenge_day_log")
        has_cbt_summary = self._table_exists(conn, "cbt_session_summary")
        has_challenge_helpfulness_0_10 = (
            has_challenge_logs and self._table_has_column(conn, "challenge_day_log", "helpfulness_0_10")
        )
        has_challenge_helpfulness_1_5 = (
            has_challenge_logs and self._table_has_column(conn, "challenge_day_log", "helpfulness_score_1_5")
        )
        has_challenge_effort_0_10 = (
            has_challenge_logs and self._table_has_column(conn, "challenge_day_log", "effort_0_10")
        )
        has_cbt_helpfulness = (
            has_cbt_summary and self._table_has_column(conn, "cbt_session_summary", "session_helpfulness_0_10")
        )
        has_cbt_homework = (
            has_cbt_summary and self._table_has_column(conn, "cbt_session_summary", "homework_commitment_0_10")
        )

        checkin_days_expr = (
            "(SELECT COUNT(*) FROM daily_checkin dc "
            " WHERE dc.user_id = pa.user_id "
            "   AND dc.status = 'submitted' "
            f"   AND dc.date BETWEEN date(pa.completed_at, '-{start_offset_days} day') AND date(pa.completed_at))"
            if has_checkin
            else "0"
        )
        avg_mood_expr = (
            "(SELECT AVG(cfd.mood_1_5) FROM daily_checkin_features_daily cfd "
            " WHERE cfd.user_id = pa.user_id "
            f"   AND cfd.date BETWEEN date(pa.completed_at, '-{start_offset_days} day') AND date(pa.completed_at))"
            if has_checkin_features
            else "NULL"
        )
        avg_anxiety_expr = (
            "(SELECT AVG(cfd.anxiety_1_5) FROM daily_checkin_features_daily cfd "
            " WHERE cfd.user_id = pa.user_id "
            f"   AND cfd.date BETWEEN date(pa.completed_at, '-{start_offset_days} day') AND date(pa.completed_at))"
            if has_checkin_features
            else "NULL"
        )
        avg_energy_expr = (
            "(SELECT AVG(cfd.energy_1_5) FROM daily_checkin_features_daily cfd "
            " WHERE cfd.user_id = pa.user_id "
            f"   AND cfd.date BETWEEN date(pa.completed_at, '-{start_offset_days} day') AND date(pa.completed_at))"
            if has_checkin_features
            else "NULL"
        )
        avg_sleep_expr = (
            "(SELECT AVG(cfd.sleep_total_midpoint_hours) FROM daily_checkin_features_daily cfd "
            " WHERE cfd.user_id = pa.user_id "
            f"   AND cfd.date BETWEEN date(pa.completed_at, '-{start_offset_days} day') AND date(pa.completed_at))"
            if has_checkin_features
            else "NULL"
        )
        avg_sleep_latency_expr = (
            "(SELECT AVG(cfd.sleep_latency_midpoint_minutes) FROM daily_checkin_features_daily cfd "
            " WHERE cfd.user_id = pa.user_id "
            f"   AND cfd.date BETWEEN date(pa.completed_at, '-{start_offset_days} day') AND date(pa.completed_at))"
            if has_checkin_features
            else "NULL"
        )
        avg_daylight_expr = (
            "(SELECT AVG(CASE json_extract(dcv.payload_json, '$.daylight_bucket') "
            "  WHEN 'm0' THEN 0 WHEN 'm1_9' THEN 1 WHEN 'm10_29' THEN 2 WHEN 'ge_30' THEN 3 END) "
            " FROM daily_checkin dc "
            " LEFT JOIN daily_checkin_version dcv ON dcv.checkin_version_id = dc.current_version_id "
            " WHERE dc.user_id = pa.user_id "
            "   AND dc.status = 'submitted' "
            f"   AND dc.date BETWEEN date(pa.completed_at, '-{start_offset_days} day') AND date(pa.completed_at))"
            if has_checkin_version
            else "NULL"
        )
        avg_exercise_expr = (
            "(SELECT AVG(CASE json_extract(dcv.payload_json, '$.exercise_bucket') "
            "  WHEN 'm0' THEN 0 WHEN 'm1_9' THEN 1 WHEN 'm10_29' THEN 2 WHEN 'ge_30' THEN 3 END) "
            " FROM daily_checkin dc "
            " LEFT JOIN daily_checkin_version dcv ON dcv.checkin_version_id = dc.current_version_id "
            " WHERE dc.user_id = pa.user_id "
            "   AND dc.status = 'submitted' "
            f"   AND dc.date BETWEEN date(pa.completed_at, '-{start_offset_days} day') AND date(pa.completed_at))"
            if has_checkin_version
            else "NULL"
        )
        avg_alcohol_expr = (
            "(SELECT AVG(CASE json_extract(dcv.payload_json, '$.alcohol_bucket') "
            "  WHEN 'none' THEN 0 WHEN 'one' THEN 1 WHEN 'two_three' THEN 2 WHEN 'ge_four' THEN 3 END) "
            " FROM daily_checkin dc "
            " LEFT JOIN daily_checkin_version dcv ON dcv.checkin_version_id = dc.current_version_id "
            " WHERE dc.user_id = pa.user_id "
            "   AND dc.status = 'submitted' "
            f"   AND dc.date BETWEEN date(pa.completed_at, '-{start_offset_days} day') AND date(pa.completed_at))"
            if has_checkin_version
            else "NULL"
        )
        caffeine_days_expr = (
            "(SELECT COUNT(*) FROM daily_checkin dc "
            " LEFT JOIN daily_checkin_version dcv ON dcv.checkin_version_id = dc.current_version_id "
            " WHERE dc.user_id = pa.user_id "
            "   AND dc.status = 'submitted' "
            f"   AND dc.date BETWEEN date(pa.completed_at, '-{start_offset_days} day') AND date(pa.completed_at) "
            "   AND COALESCE(CAST(json_extract(dcv.payload_json, '$.caffeine_after_2pm_flag') AS INTEGER), 0) = 1)"
            if has_checkin_version
            else "0"
        )
        challenge_done_expr = (
            "(SELECT COUNT(*) FROM challenge_day_log chl "
            " WHERE chl.user_id = pa.user_id "
            "   AND chl.day_status = 'done' "
            f"   AND chl.date BETWEEN date(pa.completed_at, '-{start_offset_days} day') AND date(pa.completed_at))"
            if has_challenge_logs
            else "0"
        )
        if has_challenge_helpfulness_0_10 and has_challenge_helpfulness_1_5:
            challenge_helpfulness_expr = (
                "(SELECT AVG(COALESCE(chl.helpfulness_0_10, chl.helpfulness_score_1_5 * 2.0)) "
                " FROM challenge_day_log chl "
                " WHERE chl.user_id = pa.user_id "
                "   AND chl.day_status = 'done' "
                f"   AND chl.date BETWEEN date(pa.completed_at, '-{start_offset_days} day') AND date(pa.completed_at))"
            )
        elif has_challenge_helpfulness_0_10:
            challenge_helpfulness_expr = (
                "(SELECT AVG(chl.helpfulness_0_10) "
                " FROM challenge_day_log chl "
                " WHERE chl.user_id = pa.user_id "
                "   AND chl.day_status = 'done' "
                f"   AND chl.date BETWEEN date(pa.completed_at, '-{start_offset_days} day') AND date(pa.completed_at))"
            )
        elif has_challenge_helpfulness_1_5:
            challenge_helpfulness_expr = (
                "(SELECT AVG(chl.helpfulness_score_1_5 * 2.0) "
                " FROM challenge_day_log chl "
                " WHERE chl.user_id = pa.user_id "
                "   AND chl.day_status = 'done' "
                f"   AND chl.date BETWEEN date(pa.completed_at, '-{start_offset_days} day') AND date(pa.completed_at))"
            )
        else:
            challenge_helpfulness_expr = "NULL"

        challenge_effort_expr = (
            "(SELECT AVG(chl.effort_0_10) "
            " FROM challenge_day_log chl "
            " WHERE chl.user_id = pa.user_id "
            "   AND chl.day_status = 'done' "
            f"   AND chl.date BETWEEN date(pa.completed_at, '-{start_offset_days} day') AND date(pa.completed_at))"
            if has_challenge_effort_0_10
            else "NULL"
        )
        cbt_sessions_expr = (
            "(SELECT COUNT(*) FROM cbt_session_summary cs "
            " WHERE cs.user_id = pa.user_id "
            f"   AND cs.date BETWEEN date(pa.completed_at, '-{start_offset_days} day') AND date(pa.completed_at))"
            if has_cbt_summary
            else "0"
        )
        cbt_helpfulness_expr = (
            "(SELECT AVG(cs.session_helpfulness_0_10) FROM cbt_session_summary cs "
            " WHERE cs.user_id = pa.user_id "
            f"   AND cs.date BETWEEN date(pa.completed_at, '-{start_offset_days} day') AND date(pa.completed_at))"
            if has_cbt_helpfulness
            else "NULL"
        )
        cbt_homework_expr = (
            "(SELECT AVG(cs.homework_commitment_0_10) FROM cbt_session_summary cs "
            " WHERE cs.user_id = pa.user_id "
            f"   AND cs.date BETWEEN date(pa.completed_at, '-{start_offset_days} day') AND date(pa.completed_at))"
            if has_cbt_homework
            else "NULL"
        )

        rows = conn.execute(
            f"""
            WITH assessment_rows AS (
              SELECT
                pa.user_id,
                pa.assessment_id,
                datetime(pa.completed_at) AS completed_at,
                date(pa.completed_at) AS completed_date,
                sc.phq9_total AS dep_target,
                sc.gad7_total AS anx_target,
                sc.isi_total AS ins_target,
                (
                  SELECT COUNT(*)
                  FROM periodic_assessment pa2
                  WHERE pa2.user_id = pa.user_id
                    AND pa2.status IN ('completed', 'late')
                    AND pa2.completed_at IS NOT NULL
                    AND datetime(pa2.completed_at) <= datetime(pa.completed_at)
                ) AS assessment_order,
                {checkin_days_expr} AS checkin_days_window,
                {avg_mood_expr} AS avg_mood_1_5,
                {avg_anxiety_expr} AS avg_anxiety_1_5,
                {avg_energy_expr} AS avg_energy_1_5,
                {avg_sleep_expr} AS avg_sleep_hours,
                {avg_sleep_latency_expr} AS avg_sleep_latency_minutes,
                {avg_daylight_expr} AS avg_daylight_bucket_num,
                {avg_exercise_expr} AS avg_exercise_bucket_num,
                {avg_alcohol_expr} AS avg_alcohol_bucket_num,
                {caffeine_days_expr} AS caffeine_after_2pm_days_window,
                {challenge_done_expr} AS challenge_done_days_window,
                {challenge_helpfulness_expr} AS challenge_helpfulness_mean_window,
                {challenge_effort_expr} AS challenge_effort_mean_window,
                {cbt_sessions_expr} AS cbt_sessions_window,
                {cbt_helpfulness_expr} AS cbt_helpfulness_mean_window,
                {cbt_homework_expr} AS cbt_homework_commitment_mean_window
              FROM periodic_assessment pa
              JOIN assessment_score sc ON sc.assessment_id = pa.assessment_id
              WHERE pa.user_id IN ({placeholders})
                AND pa.status IN ('completed', 'late')
                AND pa.completed_at IS NOT NULL
                AND date(pa.completed_at) BETWEEN ? AND ?
            )
            SELECT *
            FROM assessment_rows
            WHERE assessment_order >= ?
            ORDER BY datetime(completed_at) ASC
            """,
            (*resolved_user_ids, selection_start_date, selection_end_date, min_assessment_count),
        ).fetchall()

        normalized_rows: list[dict[str, object]] = []
        for row in rows:
            dep_target = self._coerce_float(row["dep_target"])
            anx_target = self._coerce_float(row["anx_target"])
            ins_target = self._coerce_float(row["ins_target"])
            target_values = [value for value in (dep_target, anx_target, ins_target) if value is not None]
            target_mean = (sum(target_values) / len(target_values)) if target_values else None

            normalized_rows.append(
                {
                    "user_id": str(row["user_id"]),
                    "assessment_id": str(row["assessment_id"]),
                    "completed_at": str(row["completed_at"]),
                    "completed_date": str(row["completed_date"]),
                    "dep_target": dep_target,
                    "anx_target": anx_target,
                    "ins_target": ins_target,
                    "target_mean": target_mean,
                    "checkin_days_window": int(row["checkin_days_window"] or 0),
                    "avg_mood_1_5": self._coerce_float(row["avg_mood_1_5"]),
                    "avg_anxiety_1_5": self._coerce_float(row["avg_anxiety_1_5"]),
                    "avg_energy_1_5": self._coerce_float(row["avg_energy_1_5"]),
                    "avg_sleep_hours": self._coerce_float(row["avg_sleep_hours"]),
                    "avg_sleep_latency_minutes": self._coerce_float(row["avg_sleep_latency_minutes"]),
                    "avg_daylight_bucket_num": self._coerce_float(row["avg_daylight_bucket_num"]),
                    "avg_exercise_bucket_num": self._coerce_float(row["avg_exercise_bucket_num"]),
                    "avg_alcohol_bucket_num": self._coerce_float(row["avg_alcohol_bucket_num"]),
                    "caffeine_after_2pm_days_window": int(row["caffeine_after_2pm_days_window"] or 0),
                    "challenge_done_days_window": int(row["challenge_done_days_window"] or 0),
                    "challenge_helpfulness_mean_window": self._coerce_float(
                        row["challenge_helpfulness_mean_window"]
                    ),
                    "challenge_effort_mean_window": self._coerce_float(row["challenge_effort_mean_window"]),
                    "cbt_sessions_window": int(row["cbt_sessions_window"] or 0),
                    "cbt_helpfulness_mean_window": self._coerce_float(row["cbt_helpfulness_mean_window"]),
                    "cbt_homework_commitment_mean_window": self._coerce_float(
                        row["cbt_homework_commitment_mean_window"]
                    ),
                }
            )
        return normalized_rows

    @staticmethod
    def _safe_mean(values: list[float]) -> float | None:
        if not values:
            return None
        return sum(values) / len(values)

    def _build_retraining_data_summary(
        self,
        conn: sqlite3.Connection,
        payload: ModelRetrainingJobCreateRequest,
    ) -> dict[str, object]:
        config = self._resolve_retraining_rule_config(payload)
        assessment_window_days = int(config["assessment_window_days"])
        selection_start_date = str(config["selection_start_date"])
        selection_end_date = str(config["selection_end_date"])
        selection_window_days = int(config["selection_window_days"])
        selection_rule_summary = str(config["selection_rule_summary"])
        eligible_user_ids = self._build_retraining_eligible_user_ids(conn, payload)

        if not eligible_user_ids:
            return {
                "eligible_user_count": 0,
                "eligible_row_count": 0,
                "rows_with_checkin_28d": 0,
                "avg_checkin_days_28d": 0.0,
                "assessment_window_days": assessment_window_days,
                "selection_start_date": selection_start_date,
                "selection_end_date": selection_end_date,
                "selection_window_days": selection_window_days,
                "selection_rule_summary": selection_rule_summary,
                "target_definition": "assessment_score(phq9_total, gad7_total, isi_total)",
                "input_sources": ["checkin_28d", "cbt_28d", "challenge_28d"],
                "notes": "현재 기준을 충족하는 사용자 데이터가 없어 재학습 대상이 비어 있습니다.",
            }

        rows = self._load_retraining_assessment_rows(conn, payload, eligible_user_ids)
        if not rows:
            return {
                "eligible_user_count": len(eligible_user_ids),
                "eligible_row_count": 0,
                "rows_with_checkin_28d": 0,
                "avg_checkin_days_28d": 0.0,
                "assessment_window_days": assessment_window_days,
                "selection_start_date": selection_start_date,
                "selection_end_date": selection_end_date,
                "selection_window_days": selection_window_days,
                "selection_rule_summary": selection_rule_summary,
                "target_definition": "assessment_score(phq9_total, gad7_total, isi_total)",
                "input_sources": ["checkin_28d", "cbt_28d", "challenge_28d"],
                "notes": "대상 사용자는 있으나 학습에 사용할 진단 행이 아직 부족합니다.",
            }

        checkin_days = [int(row["checkin_days_window"]) for row in rows]
        rows_with_checkin = sum(1 for value in checkin_days if value > 0)
        avg_checkin_days = self._safe_mean([float(value) for value in checkin_days]) or 0.0
        completed_dates = [str(row["completed_date"]) for row in rows]

        return {
            "eligible_user_count": len(eligible_user_ids),
            "eligible_row_count": len(rows),
            "rows_with_checkin_28d": rows_with_checkin,
            "avg_checkin_days_28d": round(avg_checkin_days, 2),
            "assessment_window_days": assessment_window_days,
            "selection_start_date": selection_start_date,
            "selection_end_date": selection_end_date,
            "selection_window_days": selection_window_days,
            "first_assessment_date": min(completed_dates) if completed_dates else None,
            "latest_assessment_date": max(completed_dates) if completed_dates else None,
            "target_labels": ["phq9_total", "gad7_total", "isi_total"],
            "target_definition": "assessment_score(phq9_total, gad7_total, isi_total)",
            "input_sources": ["checkin_28d", "cbt_28d", "challenge_28d"],
            "selection_rule_summary": selection_rule_summary,
        }

    def _build_retraining_program_recommendations(
        self,
        conn: sqlite3.Connection,
        rows: list[dict[str, object]],
        assessment_window_days: int,
    ) -> list[dict[str, object]]:
        if len(rows) < 8 or not self._table_exists(conn, "challenge_day_log"):
            return []

        target_values = [float(row["target_mean"]) for row in rows if isinstance(row["target_mean"], float)]
        overall_mean = self._safe_mean(target_values)
        if overall_mean is None:
            return []

        better_rows = [
            row
            for row in rows
            if isinstance(row["target_mean"], float) and float(row["target_mean"]) <= overall_mean - 0.75
        ]
        if len(better_rows) < 3:
            sorted_rows = sorted(
                [row for row in rows if isinstance(row["target_mean"], float)],
                key=lambda item: float(item["target_mean"]),
            )
            better_rows = sorted_rows[: max(3, len(sorted_rows) // 3)]

        challenge_name_map: dict[str, str] = {}
        if self._table_exists(conn, "challenge_catalog"):
            challenge_rows = conn.execute(
                "SELECT challenge_id, name_ko FROM challenge_catalog ORDER BY challenge_id ASC",
            ).fetchall()
            challenge_name_map = {str(row["challenge_id"]): str(row["name_ko"]) for row in challenge_rows}

        start_offset_days = max(0, assessment_window_days - 1)
        row_cache: dict[tuple[str, str], dict[str, int]] = {}

        def _row_challenge_counts(user_id: str, completed_date: str) -> dict[str, int]:
            cache_key = (user_id, completed_date)
            cached = row_cache.get(cache_key)
            if cached is not None:
                return cached

            challenge_rows = conn.execute(
                f"""
                SELECT challenge_id, COUNT(*) AS done_days
                FROM challenge_day_log
                WHERE user_id = ?
                  AND day_status = 'done'
                  AND date BETWEEN date(?, '-{start_offset_days} day') AND date(?)
                GROUP BY challenge_id
                """,
                (user_id, completed_date, completed_date),
            ).fetchall()
            values = {
                str(row["challenge_id"]): int(row["done_days"] or 0)
                for row in challenge_rows
            }
            row_cache[cache_key] = values
            return values

        challenge_hits: dict[str, int] = {}
        challenge_done_days: dict[str, int] = {}
        for row in better_rows:
            counts = _row_challenge_counts(str(row["user_id"]), str(row["completed_date"]))
            for challenge_id, done_days in counts.items():
                if done_days <= 0:
                    continue
                challenge_hits[challenge_id] = challenge_hits.get(challenge_id, 0) + 1
                challenge_done_days[challenge_id] = challenge_done_days.get(challenge_id, 0) + done_days

        ranked_ids = sorted(
            challenge_hits.keys(),
            key=lambda challenge_id: (
                challenge_hits.get(challenge_id, 0),
                challenge_done_days.get(challenge_id, 0),
            ),
            reverse=True,
        )

        recommendations: list[dict[str, object]] = []
        for challenge_id in ranked_ids[:5]:
            high_group: list[float] = []
            zero_group: list[float] = []
            for row in rows:
                target_mean = row["target_mean"]
                if not isinstance(target_mean, float):
                    continue
                done_days = _row_challenge_counts(
                    str(row["user_id"]),
                    str(row["completed_date"]),
                ).get(challenge_id, 0)
                if done_days >= 2:
                    high_group.append(target_mean)
                elif done_days == 0:
                    zero_group.append(target_mean)

            if len(high_group) < 3 or len(zero_group) < 3:
                continue
            high_mean = self._safe_mean(high_group)
            zero_mean = self._safe_mean(zero_group)
            if high_mean is None or zero_mean is None:
                continue

            estimated_drop = zero_mean - high_mean
            if estimated_drop < 0.45:
                continue

            challenge_name = challenge_name_map.get(challenge_id, challenge_id)
            recommendations.append(
                {
                    "recommendation_type": "challenge_program",
                    "challenge_id": challenge_id,
                    "challenge_name": challenge_name,
                    "proposed_program_title": f"{challenge_name} 심화 루틴(28일)",
                    "estimated_target_drop": round(estimated_drop, 2),
                    "support_rows_high": len(high_group),
                    "support_rows_zero": len(zero_group),
                    "confidence": "high" if len(high_group) >= 10 else "medium",
                    "evidence": (
                        f"최근 {assessment_window_days}일에서 '{challenge_name}'를 2일 이상 수행한 구간은 "
                        f"미수행 구간 대비 평균 지표가 {estimated_drop:.2f} 낮게 나타났습니다."
                    ),
                }
            )
            if len(recommendations) >= 3:
                break

        return recommendations

    def _build_retraining_improvement_recommendations(
        self,
        rows: list[dict[str, object]],
        assessment_window_days: int,
    ) -> list[dict[str, object]]:
        if len(rows) < 8:
            return []

        scored_rows = [row for row in rows if isinstance(row["target_mean"], float)]
        if len(scored_rows) < 8:
            return []

        overall_mean = self._safe_mean([float(row["target_mean"]) for row in scored_rows])
        if overall_mean is None:
            return []

        better_rows = [row for row in scored_rows if float(row["target_mean"]) <= overall_mean - 0.75]
        harder_rows = [row for row in scored_rows if float(row["target_mean"]) >= overall_mean + 0.75]
        if len(better_rows) < 3 or len(harder_rows) < 3:
            sorted_rows = sorted(scored_rows, key=lambda item: float(item["target_mean"]))
            split_size = max(3, len(sorted_rows) // 3)
            better_rows = sorted_rows[:split_size]
            harder_rows = sorted_rows[-split_size:]

        def _mean_from_key(source_rows: list[dict[str, object]], key: str) -> float | None:
            values = [float(item[key]) for item in source_rows if isinstance(item.get(key), (int, float))]
            return self._safe_mean(values)

        better_checkin = _mean_from_key(better_rows, "checkin_days_window")
        harder_checkin = _mean_from_key(harder_rows, "checkin_days_window")
        better_challenge = _mean_from_key(better_rows, "challenge_done_days_window")
        harder_challenge = _mean_from_key(harder_rows, "challenge_done_days_window")
        better_cbt = _mean_from_key(better_rows, "cbt_sessions_window")
        harder_cbt = _mean_from_key(harder_rows, "cbt_sessions_window")
        better_sleep = _mean_from_key(better_rows, "avg_sleep_hours")
        harder_sleep = _mean_from_key(harder_rows, "avg_sleep_hours")
        better_anxiety = _mean_from_key(better_rows, "avg_anxiety_1_5")
        harder_anxiety = _mean_from_key(harder_rows, "avg_anxiety_1_5")

        recommendations: list[dict[str, object]] = []
        if better_checkin is not None and harder_checkin is not None and better_checkin >= harder_checkin + 2:
            recommendations.append(
                {
                    "category": "checkin_consistency",
                    "title": "체크인 연속성 강화",
                    "suggested_action": "체크인 리마인더와 주간 달성 피드백을 함께 운영",
                    "evidence": (
                        f"지표가 낮은 그룹은 최근 {assessment_window_days}일 평균 체크인 {better_checkin:.1f}일로, "
                        f"상대 그룹({harder_checkin:.1f}일)보다 높았습니다."
                    ),
                }
            )

        if better_challenge is not None and harder_challenge is not None and better_challenge >= harder_challenge + 2:
            recommendations.append(
                {
                    "category": "challenge_participation",
                    "title": "챌린지 수행 빈도 강화",
                    "suggested_action": "짧은 10분형 프로그램을 우선 노출하고 주 3회 달성 유도",
                    "evidence": (
                        f"지표가 낮은 그룹의 챌린지 완료일은 평균 {better_challenge:.1f}일로 "
                        f"상대 그룹({harder_challenge:.1f}일) 대비 높았습니다."
                    ),
                }
            )

        if better_cbt is not None and harder_cbt is not None and better_cbt >= harder_cbt + 1:
            recommendations.append(
                {
                    "category": "cbt_engagement",
                    "title": "CBT 대화 루틴 정착",
                    "suggested_action": "주 1~2회 CBT 세션 진입을 홈에서 고정 노출",
                    "evidence": (
                        f"지표가 낮은 그룹은 최근 {assessment_window_days}일 평균 CBT 세션 {better_cbt:.1f}회로 "
                        f"상대 그룹({harder_cbt:.1f}회) 대비 높았습니다."
                    ),
                }
            )

        if better_sleep is not None and harder_sleep is not None and better_sleep >= harder_sleep + 0.5:
            recommendations.append(
                {
                    "category": "sleep_routine",
                    "title": "수면 리듬 안정화 강화",
                    "suggested_action": "기상 고정/취침 전 루틴 챌린지 묶음 프로그램 추가",
                    "evidence": (
                        f"지표가 낮은 그룹의 평균 수면시간은 {better_sleep:.1f}시간으로 "
                        f"상대 그룹({harder_sleep:.1f}시간)보다 길었습니다."
                    ),
                }
            )

        if better_anxiety is not None and harder_anxiety is not None and better_anxiety <= harder_anxiety - 0.5:
            recommendations.append(
                {
                    "category": "anxiety_regulation",
                    "title": "불안 안정 루틴 보강",
                    "suggested_action": "호흡/감각 안정 미니 프로그램을 저녁 시간대 우선 배치",
                    "evidence": (
                        f"지표가 낮은 그룹의 체크인 불안 점수는 평균 {better_anxiety:.2f}로 "
                        f"상대 그룹({harder_anxiety:.2f})보다 낮았습니다."
                    ),
                }
            )

        return recommendations[:5]

    def _build_retraining_recommendation_payload(
        self,
        conn: sqlite3.Connection,
        payload: ModelRetrainingJobCreateRequest,
    ) -> dict[str, object]:
        config = self._resolve_retraining_rule_config(payload)
        assessment_window_days = int(config["assessment_window_days"])
        rows = self._load_retraining_assessment_rows(conn, payload)

        if len(rows) < 8:
            return {
                "operator_recommendation_summary": (
                    "추천 생성에 필요한 데이터가 아직 부족합니다. "
                    "재학습 대상 데이터가 더 쌓이면 자동 추천이 강화됩니다."
                ),
                "program_recommendations": [],
                "improvement_recommendations": [],
                "insight_basis": {
                    "row_count": len(rows),
                    "assessment_window_days": assessment_window_days,
                },
            }

        program_recommendations = self._build_retraining_program_recommendations(
            conn,
            rows,
            assessment_window_days,
        )
        improvement_recommendations = self._build_retraining_improvement_recommendations(
            rows,
            assessment_window_days,
        )

        if program_recommendations or improvement_recommendations:
            summary = (
                f"신규 챌린지 개설 추천 {len(program_recommendations)}건, "
                f"운영 개선 추천 {len(improvement_recommendations)}건이 도출되었습니다."
            )
        else:
            summary = "현재 데이터에서는 뚜렷한 추천 방향이 확인되지 않았습니다."

        return {
            "operator_recommendation_summary": summary,
            "program_recommendations": program_recommendations,
            "improvement_recommendations": improvement_recommendations,
            "insight_basis": {
                "row_count": len(rows),
                "assessment_window_days": assessment_window_days,
            },
        }

    def _retraining_payload_from_job_row(
        self,
        row: sqlite3.Row,
        result_summary: dict[str, object],
    ) -> ModelRetrainingJobCreateRequest:
        options_raw = result_summary.get("retraining_options")
        options = options_raw if isinstance(options_raw, dict) else {}
        selected_features_raw = options.get("selected_feature_keys")
        selected_feature_keys = (
            [str(value) for value in selected_features_raw if isinstance(value, str)]
            if isinstance(selected_features_raw, list)
            else []
        )
        start_date_raw = options.get("data_range_start_date")
        end_date_raw = options.get("data_range_end_date")
        start_date = None
        end_date = None
        if isinstance(start_date_raw, str):
            try:
                start_date = date.fromisoformat(start_date_raw)
            except ValueError:
                start_date = None
        if isinstance(end_date_raw, str):
            try:
                end_date = date.fromisoformat(end_date_raw)
            except ValueError:
                end_date = None

        return ModelRetrainingJobCreateRequest(
            mode=ModelRetrainingRunMode(str(row["mode"])),
            training_window_days=int(row["training_window_days"]),
            data_range_start_date=start_date,
            data_range_end_date=end_date,
            include_synthetic_data=self._coerce_bool(
                options.get("include_synthetic_data"),
                default=bool(row["include_synthetic_data"]),
            ),
            require_min_account_age_days_28=self._coerce_bool(
                options.get("require_min_account_age_days_28"),
                default=True,
            ),
            require_second_assessment_completion=self._coerce_bool(
                options.get("require_second_assessment_completion"),
                default=True,
            ),
            use_pre_assessment_window_28d=self._coerce_bool(
                options.get("use_pre_assessment_window_28d"),
                default=True,
            ),
            keep_user_after_eligibility=self._coerce_bool(
                options.get("keep_user_after_eligibility"),
                default=True,
            ),
            selected_feature_keys=selected_feature_keys,
            dataset_snapshot_id=(
                str(row["dataset_snapshot_id"]) if row["dataset_snapshot_id"] else None
            ),
            note=(str(row["note"]) if row["note"] else None),
        )

    def _audit(
        self,
        conn: sqlite3.Connection,
        actor: AdminActorContext,
        action_type: str,
        target_type: str,
        target_id: str,
        metadata: dict[str, object] | None = None,
    ) -> None:
        conn.execute(
            """
            INSERT INTO audit_log (
              audit_id,
              actor_admin_user_id,
              actor_role,
              action_type,
              target_type,
              target_id,
              metadata_json,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"adt_{uuid.uuid4().hex}",
                actor.admin_user_id,
                actor.base_role.value,
                action_type,
                target_type,
                target_id,
                json.dumps(metadata or {}, ensure_ascii=False),
                self._now_iso(),
            ),
        )

    def _add_admin_notification(
        self,
        conn: sqlite3.Connection,
        queue_code: AdminQueueCode,
        related_object_type: str,
        related_object_id: str,
        severity: AdminNotificationSeverity,
        status: AdminNotificationStatus = AdminNotificationStatus.unread,
    ) -> None:
        conn.execute(
            """
            INSERT INTO admin_notification (
              notification_id,
              queue_code,
              related_object_type,
              related_object_id,
              severity,
              status,
              created_at,
              assigned_admin_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
            """,
            (
                f"ntf_{uuid.uuid4().hex}",
                queue_code.value,
                related_object_type,
                related_object_id,
                severity.value,
                status.value,
                self._now_iso(),
            ),
        )

    def _queue_counts(self, conn: sqlite3.Connection) -> list[AdminQueueSummaryItem]:
        support_row = conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM support_ticket
            WHERE status IN ('new', 'waiting_admin', 'reopened', 'in_progress')
            """
        ).fetchone()
        support_count = int(support_row["cnt"] or 0) if support_row else 0

        moderation_row = conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM board_moderation_queue
            WHERE queue_type IN ('report', 'hate')
              AND status = 'queued'
            """
        ).fetchone()
        moderation_count = int(moderation_row["cnt"] or 0) if moderation_row else 0

        safety_row = conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM board_moderation_queue
            WHERE queue_type = 'safety'
              AND status = 'queued'
            """
        ).fetchone()
        safety_count = int(safety_row["cnt"] or 0) if safety_row else 0

        ops_row = conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM owner_approval_request
            WHERE object_type = 'policy_change'
              AND status = 'pending_owner_approval'
            """
        ).fetchone()
        ops_count = int(ops_row["cnt"] or 0) if ops_row else 0

        ml_approval_row = conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM owner_approval_request
            WHERE object_type = 'model_change'
              AND status = 'pending_owner_approval'
            """
        ).fetchone()
        ml_running_row = conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM admin_model_change
            WHERE status IN ('training_running', 'evaluation_ready')
            """
        ).fetchone()
        ml_job_row = conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM admin_model_retraining_job
            WHERE status IN ('pending_owner_approval', 'queued', 'running')
            """
        ).fetchone()
        ml_count = (
            int(ml_approval_row["cnt"] or 0)
            + int(ml_running_row["cnt"] or 0)
            + int(ml_job_row["cnt"] or 0)
        )

        return [
            AdminQueueSummaryItem(queue_code=AdminQueueCode.support_queue, count=support_count),
            AdminQueueSummaryItem(
                queue_code=AdminQueueCode.moderation_queue,
                count=moderation_count,
            ),
            AdminQueueSummaryItem(queue_code=AdminQueueCode.safety_queue, count=safety_count),
            AdminQueueSummaryItem(queue_code=AdminQueueCode.ops_queue, count=ops_count),
            AdminQueueSummaryItem(queue_code=AdminQueueCode.ml_queue, count=ml_count),
        ]

    def get_overview(self) -> AdminOverviewResponse:
        today = date.today()
        start_7d = today - timedelta(days=6)
        start_28d = today - timedelta(days=27)

        with self._connect() as conn:
            total_users_row = conn.execute("SELECT COUNT(*) AS cnt FROM account_user").fetchone()
            signup_7d_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM account_user
                WHERE date(created_at) BETWEEN ? AND ?
                """,
                (start_7d.isoformat(), today.isoformat()),
            ).fetchone()

            checkin_7d_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM daily_checkin
                WHERE status = 'submitted'
                  AND date BETWEEN ? AND ?
                """,
                (start_7d.isoformat(), today.isoformat()),
            ).fetchone()
            challenge_7d_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM challenge_day_log
                WHERE date BETWEEN ? AND ?
                """,
                (start_7d.isoformat(), today.isoformat()),
            ).fetchone()

            cbt_sessions_7d = 0
            if self._table_exists(conn, "cbt_session_summary"):
                cbt_7d_row = conn.execute(
                    """
                    SELECT COUNT(*) AS cnt
                    FROM cbt_session_summary
                    WHERE date BETWEEN ? AND ?
                    """,
                    (start_7d.isoformat(), today.isoformat()),
                ).fetchone()
                cbt_sessions_7d = int(cbt_7d_row["cnt"] or 0)

            assessment_7d_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM periodic_assessment
                WHERE status IN ('completed', 'late')
                  AND completed_at IS NOT NULL
                  AND date(completed_at) BETWEEN ? AND ?
                """,
                (start_7d.isoformat(), today.isoformat()),
            ).fetchone()

            support_unanswered_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM support_ticket
                WHERE status IN ('new', 'waiting_admin', 'in_progress')
                """
            ).fetchone()
            support_reopened_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM support_ticket
                WHERE status = 'reopened'
                """
            ).fetchone()

            moderation_pending_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM board_moderation_queue
                WHERE queue_type IN ('report', 'hate')
                  AND status = 'queued'
                """
            ).fetchone()
            safety_pending_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM board_moderation_queue
                WHERE queue_type = 'safety'
                  AND status = 'queued'
                """
            ).fetchone()

            dau_row = conn.execute(
                """
                SELECT COUNT(DISTINCT user_id) AS cnt
                FROM daily_checkin
                WHERE status = 'submitted'
                  AND date = ?
                """,
                (today.isoformat(),),
            ).fetchone()
            wau_row = conn.execute(
                """
                SELECT COUNT(DISTINCT user_id) AS cnt
                FROM daily_checkin
                WHERE status = 'submitted'
                  AND date BETWEEN ? AND ?
                """,
                (start_7d.isoformat(), today.isoformat()),
            ).fetchone()
            mau_row = conn.execute(
                """
                SELECT COUNT(DISTINCT user_id) AS cnt
                FROM daily_checkin
                WHERE status = 'submitted'
                  AND date BETWEEN ? AND ?
                """,
                (start_28d.isoformat(), today.isoformat()),
            ).fetchone()

            queues = self._queue_counts(conn)
            return AdminOverviewResponse(
                kpis=AdminOverviewKpi(
                    total_users=int(total_users_row["cnt"] or 0),
                    dau=int(dau_row["cnt"] or 0),
                    wau=int(wau_row["cnt"] or 0),
                    mau=int(mau_row["cnt"] or 0),
                    signup_count_7d=int(signup_7d_row["cnt"] or 0),
                    checkin_count_7d=int(checkin_7d_row["cnt"] or 0),
                    challenge_count_7d=int(challenge_7d_row["cnt"] or 0),
                    cbt_sessions_7d=cbt_sessions_7d,
                    assessments_completed_7d=int(assessment_7d_row["cnt"] or 0),
                    support_unanswered_count=int(support_unanswered_row["cnt"] or 0),
                    support_reopened_count=int(support_reopened_row["cnt"] or 0),
                    moderation_pending_count=int(moderation_pending_row["cnt"] or 0),
                    safety_pending_count=int(safety_pending_row["cnt"] or 0),
                ),
                queues=queues,
            )

    def get_me(self, actor: AdminActorContext) -> AdminMeResponse:
        permissions = list(BASE_ROLE_PERMISSIONS[actor.base_role])
        if actor.has_analyst_ml_extension:
            permissions.extend(["model_ops:view", "model_ops:edit_request"])
        permissions = sorted(set(permissions))
        return AdminMeResponse(actor=actor, permissions=permissions)

    def list_users(self, q: str | None, limit: int) -> AdminUserListResponse:
        resolved_limit = max(1, min(100, limit))

        with self._connect() as conn:
            where = ""
            params: list[object] = []
            if q:
                where = (
                    "WHERE (au.user_id LIKE ? OR au.email LIKE ? OR au.nickname LIKE ?)"
                )
                pattern = f"%{q}%"
                params.extend([pattern, pattern, pattern])

            cbt_recent_expr = "NULL"
            cbt_activity_count_expr = "0"
            if self._table_exists(conn, "cbt_session_summary"):
                cbt_recent_expr = (
                    "(SELECT MAX(date) FROM cbt_session_summary cs WHERE cs.user_id = au.user_id)"
                )
                cbt_activity_count_expr = (
                    "(SELECT COUNT(*) FROM cbt_session_summary cs WHERE cs.user_id = au.user_id)"
                )

            checkin_count_expr = "0"
            recent_checkin_expr = "NULL"
            access_days_expr = "0"
            if self._table_exists(conn, "daily_checkin"):
                checkin_count_expr = (
                    "(SELECT COUNT(*) FROM daily_checkin dc "
                    "WHERE dc.user_id = au.user_id AND dc.status = 'submitted')"
                )
                recent_checkin_expr = (
                    "(SELECT MAX(date) FROM daily_checkin dc "
                    "WHERE dc.user_id = au.user_id AND dc.status = 'submitted')"
                )
                access_days_expr = (
                    "(SELECT COUNT(DISTINCT dc2.date) FROM daily_checkin dc2 "
                    "WHERE dc2.user_id = au.user_id AND dc2.status = 'submitted')"
                )

            challenge_count_expr = "0"
            recent_challenge_expr = "NULL"
            if self._table_exists(conn, "challenge_day_log"):
                challenge_count_expr = (
                    "(SELECT COUNT(*) FROM challenge_day_log chl WHERE chl.user_id = au.user_id)"
                )
                recent_challenge_expr = (
                    "(SELECT MAX(date) FROM challenge_day_log chl WHERE chl.user_id = au.user_id)"
                )

            journal_count_expr = "0"
            if self._table_exists(conn, "journal_entry"):
                journal_count_expr = (
                    "(SELECT COUNT(*) FROM journal_entry je "
                    "WHERE je.user_id = au.user_id AND je.status = 'active')"
                )

            assessment_count_expr = "0"
            recent_assessment_expr = "NULL"
            if self._table_exists(conn, "periodic_assessment"):
                assessment_count_expr = (
                    "(SELECT COUNT(*) FROM periodic_assessment pa "
                    "WHERE pa.user_id = au.user_id AND pa.status IN ('completed', 'late'))"
                )
                recent_assessment_expr = (
                    "(SELECT MAX(completed_at) FROM periodic_assessment pa "
                    "WHERE pa.user_id = au.user_id AND pa.status IN ('completed', 'late'))"
                )

            report_count_expr = "0"
            if self._table_exists(conn, "board_report") and self._table_exists(conn, "board_post"):
                report_count_expr = (
                    "(SELECT COUNT(*) FROM board_report br "
                    "JOIN board_post bp ON bp.post_id = br.target_id "
                    "WHERE br.target_type = 'post' AND bp.author_user_id = au.user_id)"
                )

            risk_signal_high_flag_expr = "0"
            if self._table_exists(conn, "cbt_risk_signal"):
                risk_signal_high_flag_expr = (
                    "COALESCE((SELECT CASE "
                    "WHEN COALESCE(crs.self_harm_flag, 0) = 1 "
                    "OR COALESCE(crs.violence_risk_flag, 0) = 1 "
                    "OR COALESCE(crs.suicide_risk_level, 0) >= 2 "
                    "THEN 1 ELSE 0 END "
                    "FROM cbt_risk_signal crs "
                    "WHERE crs.user_id = au.user_id "
                    "ORDER BY date(crs.date) DESC, datetime(crs.created_at) DESC "
                    "LIMIT 1), 0)"
                )

            high_symptom_score_flag_expr = "0"
            if self._table_exists(conn, "periodic_assessment") and self._table_exists(
                conn, "assessment_score"
            ):
                high_symptom_score_flag_expr = (
                    "COALESCE((SELECT CASE "
                    "WHEN COALESCE(sc.phq9_total, 0) >= 15 "
                    "OR COALESCE(sc.gad7_total, 0) >= 15 "
                    "OR COALESCE(sc.isi_total, 0) >= 15 "
                    "THEN 1 ELSE 0 END "
                    "FROM periodic_assessment pa "
                    "JOIN assessment_score sc ON sc.assessment_id = pa.assessment_id "
                    "WHERE pa.user_id = au.user_id "
                    "AND pa.status IN ('completed', 'late') "
                    "ORDER BY datetime(COALESCE(pa.completed_at, pa.started_at)) DESC "
                    "LIMIT 1), 0)"
                )

            high_risk_flag_expr = (
                f"CASE WHEN ({risk_signal_high_flag_expr}) = 1 "
                f"OR ({high_symptom_score_flag_expr}) = 1 THEN 1 ELSE 0 END"
            )

            support_ticket_count_expr = "0"
            if self._table_exists(conn, "support_ticket"):
                support_ticket_count_expr = (
                    "(SELECT COUNT(*) FROM support_ticket st WHERE st.user_id = au.user_id)"
                )

            query = f"""
                SELECT
                  au.user_id,
                  au.nickname,
                  ar.base_role AS admin_role,
                  au.created_at,
                  au.account_status,
                  COALESCE(
                    (SELECT MAX(logged_at)
                     FROM account_login_event ale
                     WHERE ale.user_id = au.user_id),
                    au.updated_at
                  ) AS recent_login_at,
                  {checkin_count_expr} AS checkin_count,
                  {recent_checkin_expr} AS recent_checkin_at,
                  {challenge_count_expr} AS challenge_count,
                  {recent_challenge_expr} AS recent_challenge_activity_at,
                  {cbt_activity_count_expr} AS cbt_count,
                  {cbt_recent_expr} AS recent_cbt_activity_at,
                  {journal_count_expr} AS journal_count,
                  {assessment_count_expr} AS assessment_count,
                  {recent_assessment_expr} AS recent_assessment_at,
                  {report_count_expr} AS report_count,
                  {high_risk_flag_expr} AS high_risk_flag,
                  {support_ticket_count_expr} AS support_ticket_count,
                  {access_days_expr} AS access_days
                FROM account_user au
                LEFT JOIN admin_account_role ar
                  ON ar.admin_user_id = au.user_id
                 AND ar.is_active = 1
                {where}
                ORDER BY datetime(au.created_at) DESC
                LIMIT ?
            """
            params.append(resolved_limit)

            rows = conn.execute(query, tuple(params)).fetchall()

            items = []
            for row in rows:
                activity_count = (
                    int(row["checkin_count"] or 0)
                    + int(row["challenge_count"] or 0)
                    + int(row["cbt_count"] or 0)
                    + int(row["journal_count"] or 0)
                    + int(row["assessment_count"] or 0)
                )
                items.append(
                    AdminUserListItem(
                        user_id=str(row["user_id"]),
                        nickname=str(row["nickname"]),
                        admin_role=(
                            AdminBaseRole(str(row["admin_role"]))
                            if row["admin_role"]
                            else None
                        ),
                        created_at=datetime.fromisoformat(str(row["created_at"])),
                        account_status=str(row["account_status"]),
                        recent_login_at=self._to_datetime(row["recent_login_at"]),
                        access_days=int(row["access_days"] or 0),
                        activity_count=activity_count,
                        recent_checkin_at=(
                            datetime.fromisoformat(f"{row['recent_checkin_at']}T00:00:00")
                            if row["recent_checkin_at"]
                            else None
                        ),
                        recent_challenge_activity_at=(
                            datetime.fromisoformat(
                                f"{row['recent_challenge_activity_at']}T00:00:00"
                            )
                            if row["recent_challenge_activity_at"]
                            else None
                        ),
                        recent_cbt_activity_at=(
                            datetime.fromisoformat(
                                f"{row['recent_cbt_activity_at']}T00:00:00"
                            )
                            if row["recent_cbt_activity_at"]
                            else None
                        ),
                        recent_assessment_at=self._to_datetime(row["recent_assessment_at"]),
                        report_count=int(row["report_count"] or 0),
                        support_ticket_count=int(row["support_ticket_count"] or 0),
                        high_risk_flag=bool(row["high_risk_flag"]),
                    )
                )

            return AdminUserListResponse(items=items)

    def get_user_ban_context(
        self,
        actor: AdminActorContext,
        target_user_id: str,
    ) -> AdminUserBanContextResponse:
        with self._connect() as conn:
            user_row = conn.execute(
                """
                SELECT
                  au.user_id,
                  au.email,
                  ar.base_role AS target_admin_role
                FROM account_user au
                LEFT JOIN admin_account_role ar
                  ON ar.admin_user_id = au.user_id
                 AND ar.is_active = 1
                WHERE au.user_id = ?
                """,
                (target_user_id,),
            ).fetchone()
            if not user_row:
                raise ValueError("target_user_not_found")

            ip_rows = conn.execute(
                """
                SELECT DISTINCT ip_address
                FROM account_login_event
                WHERE user_id = ?
                  AND ip_address IS NOT NULL
                  AND ip_address != ''
                ORDER BY datetime(logged_at) DESC
                LIMIT 5
                """,
                (target_user_id,),
            ).fetchall()
            recent_ips = [str(row["ip_address"]) for row in ip_rows if row["ip_address"]]

            if not recent_ips:
                fallback_rows = conn.execute(
                    """
                    SELECT DISTINCT target_ip
                    FROM restriction_action
                    WHERE target_user_id = ?
                      AND target_ip IS NOT NULL
                      AND target_ip != ''
                    ORDER BY datetime(created_at) DESC
                    LIMIT 5
                    """,
                    (target_user_id,),
                ).fetchall()
                recent_ips = [str(row["target_ip"]) for row in fallback_rows if row["target_ip"]]

            self._audit(
                conn,
                actor=actor,
                action_type="pii_ban_context_view",
                target_type="account_user",
                target_id=target_user_id,
                metadata={"recent_ip_count": len(recent_ips)},
            )
            conn.commit()

            return AdminUserBanContextResponse(
                user_id=str(user_row["user_id"]),
                email=str(user_row["email"]),
                target_admin_role=(
                    AdminBaseRole(str(user_row["target_admin_role"]))
                    if user_row["target_admin_role"]
                    else None
                ),
                recent_ips=recent_ips,
            )

    def create_restriction(
        self,
        actor: AdminActorContext,
        payload: RestrictionCreateRequest,
    ) -> RestrictionActionResponse:
        if not payload.block_account and not payload.block_ip:
            raise ValueError("restriction_target_required")

        with self._connect() as conn:
            user_row = conn.execute(
                """
                SELECT
                  au.user_id,
                  au.email,
                  ar.base_role AS target_admin_role
                FROM account_user au
                LEFT JOIN admin_account_role ar
                  ON ar.admin_user_id = au.user_id
                 AND ar.is_active = 1
                WHERE au.user_id = ?
                """,
                (payload.target_user_id,),
            ).fetchone()
            if not user_row:
                raise ValueError("target_user_not_found")
            if user_row["target_admin_role"] == AdminBaseRole.owner.value:
                raise ValueError("owner_restriction_forbidden")

            target_ip = payload.target_ip
            if payload.block_ip and not target_ip:
                ip_row = conn.execute(
                    """
                    SELECT ip_address
                    FROM account_login_event
                    WHERE user_id = ?
                      AND ip_address IS NOT NULL
                      AND ip_address != ''
                    ORDER BY datetime(logged_at) DESC
                    LIMIT 1
                    """,
                    (payload.target_user_id,),
                ).fetchone()
                if ip_row and ip_row["ip_address"]:
                    target_ip = str(ip_row["ip_address"])

            if payload.block_ip and not target_ip:
                raise ValueError("target_ip_required")

            now = self._now_iso()
            action_id = f"rst_{uuid.uuid4().hex}"
            conn.execute(
                """
                INSERT INTO restriction_action (
                  action_id,
                  target_user_id,
                  target_email,
                  target_ip,
                  block_account,
                  block_ip,
                  reason_code,
                  reason_detail,
                  starts_at,
                  ends_at,
                  created_by_admin_user_id,
                  created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    action_id,
                    payload.target_user_id,
                    str(user_row["email"]),
                    target_ip,
                    int(payload.block_account),
                    int(payload.block_ip),
                    payload.reason_code.value,
                    payload.reason_detail,
                    now,
                    payload.ends_at.isoformat() if payload.ends_at else None,
                    actor.admin_user_id,
                    now,
                ),
            )

            if payload.block_account:
                conn.execute(
                    """
                    UPDATE account_user
                    SET account_status = 'suspended',
                        updated_at = ?
                    WHERE user_id = ?
                    """,
                    (now, payload.target_user_id),
                )

            self._audit(
                conn,
                actor=actor,
                action_type="restriction_created",
                target_type="account_user",
                target_id=payload.target_user_id,
                metadata={
                    "block_account": payload.block_account,
                    "block_ip": payload.block_ip,
                    "target_ip": target_ip,
                    "reason_code": payload.reason_code.value,
                },
            )
            conn.commit()

            return RestrictionActionResponse(
                action_id=action_id,
                target_user_id=payload.target_user_id,
                block_account=payload.block_account,
                block_ip=payload.block_ip,
                target_ip=target_ip,
                reason_code=payload.reason_code,
                reason_detail=payload.reason_detail,
                starts_at=datetime.fromisoformat(now),
                ends_at=payload.ends_at,
                created_by_admin_user_id=actor.admin_user_id,
            )

    def list_support_queue_tickets(
        self,
        status_filter: str | None,
        limit: int,
    ) -> AdminSupportQueueResponse:
        resolved_limit = max(1, min(100, limit))
        with self._connect() as conn:
            params: list[object] = []
            where = "WHERE st.status IN ('new', 'waiting_admin', 'reopened', 'in_progress')"
            if status_filter:
                where += " AND st.status = ?"
                params.append(status_filter)

            params.append(resolved_limit)

            rows = conn.execute(
                f"""
                SELECT
                  st.ticket_id,
                  st.user_id,
                  au.email AS user_email,
                  au.nickname AS user_nickname,
                  st.ticket_type,
                  st.title,
                  st.status,
                  st.priority,
                  st.sensitive_queue_flag,
                  st.updated_at
                FROM support_ticket st
                JOIN account_user au ON au.user_id = st.user_id
                {where}
                ORDER BY
                  CASE st.priority
                    WHEN 'urgent' THEN 0
                    WHEN 'important' THEN 1
                    ELSE 2
                  END,
                  datetime(st.updated_at) ASC
                LIMIT ?
                """,
                tuple(params),
            ).fetchall()

            return AdminSupportQueueResponse(
                items=[
                    AdminSupportQueueItem(
                        ticket_id=str(row["ticket_id"]),
                        user_id=str(row["user_id"]),
                        user_email=str(row["user_email"]),
                        user_nickname=str(row["user_nickname"]),
                        ticket_type=str(row["ticket_type"]),
                        title=str(row["title"]),
                        status=str(row["status"]),
                        priority=str(row["priority"]),
                        sensitive_queue_flag=bool(row["sensitive_queue_flag"]),
                        updated_at=datetime.fromisoformat(str(row["updated_at"])),
                    )
                    for row in rows
                ]
            )

    @staticmethod
    def _policy_row_to_record(row: sqlite3.Row) -> PolicyChangeRecord:
        return PolicyChangeRecord(
            policy_change_id=str(row["policy_change_id"]),
            policy_domain=PolicyDomain(str(row["policy_domain"])),
            title=str(row["title"]),
            draft_json=AdminConsoleStore._json_load(str(row["draft_json"])),
            status=PolicyChangeStatus(str(row["status"])),
            requested_by_admin_user_id=str(row["requested_by_admin_user_id"]),
            requested_at=datetime.fromisoformat(str(row["requested_at"])),
            decided_by_owner_user_id=(
                str(row["decided_by_owner_user_id"]) if row["decided_by_owner_user_id"] else None
            ),
            decided_at=AdminConsoleStore._to_datetime(row["decided_at"]),
            decision_note=(str(row["decision_note"]) if row["decision_note"] else None),
            applied_at=AdminConsoleStore._to_datetime(row["applied_at"]),
        )

    def create_policy_draft(
        self,
        actor: AdminActorContext,
        payload: PolicyDraftCreateRequest,
    ) -> PolicyChangeRecord:
        now = self._now_iso()
        with self._connect() as conn:
            policy_change_id = f"pol_{uuid.uuid4().hex}"
            conn.execute(
                """
                INSERT INTO admin_policy_change (
                  policy_change_id,
                  policy_domain,
                  title,
                  draft_json,
                  status,
                  requested_by_admin_user_id,
                  requested_at,
                  decided_by_owner_user_id,
                  decided_at,
                  decision_note,
                  applied_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)
                """,
                (
                    policy_change_id,
                    payload.policy_domain.value,
                    payload.title,
                    json.dumps(payload.draft_json, ensure_ascii=False),
                    PolicyChangeStatus.draft.value,
                    actor.admin_user_id,
                    now,
                ),
            )
            self._audit(
                conn,
                actor=actor,
                action_type="policy_draft_created",
                target_type="policy_change",
                target_id=policy_change_id,
                metadata={"policy_domain": payload.policy_domain.value},
            )
            conn.commit()

            row = conn.execute(
                "SELECT * FROM admin_policy_change WHERE policy_change_id = ?",
                (policy_change_id,),
            ).fetchone()
            if not row:
                raise ValueError("policy_change_not_found")
            return self._policy_row_to_record(row)

    def update_policy_draft(
        self,
        actor: AdminActorContext,
        policy_change_id: str,
        payload: PolicyDraftUpdateRequest,
    ) -> PolicyChangeRecord:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM admin_policy_change WHERE policy_change_id = ?",
                (policy_change_id,),
            ).fetchone()
            if not row:
                raise ValueError("policy_change_not_found")

            current_status = PolicyChangeStatus(str(row["status"]))
            if current_status not in {PolicyChangeStatus.draft, PolicyChangeStatus.rejected}:
                raise ValueError("invalid_policy_status")

            next_title = payload.title if payload.title is not None else str(row["title"])
            next_draft_json = (
                payload.draft_json
                if payload.draft_json is not None
                else self._json_load(str(row["draft_json"]))
            )

            conn.execute(
                """
                UPDATE admin_policy_change
                SET title = ?,
                    draft_json = ?,
                    requested_at = ?
                WHERE policy_change_id = ?
                """,
                (
                    next_title,
                    json.dumps(next_draft_json, ensure_ascii=False),
                    self._now_iso(),
                    policy_change_id,
                ),
            )
            self._audit(
                conn,
                actor=actor,
                action_type="policy_draft_updated",
                target_type="policy_change",
                target_id=policy_change_id,
                metadata={},
            )
            conn.commit()

            updated = conn.execute(
                "SELECT * FROM admin_policy_change WHERE policy_change_id = ?",
                (policy_change_id,),
            ).fetchone()
            if not updated:
                raise ValueError("policy_change_not_found")
            return self._policy_row_to_record(updated)

    def list_policy_changes(self, limit: int) -> list[PolicyChangeRecord]:
        resolved_limit = max(1, min(100, limit))
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM admin_policy_change
                ORDER BY datetime(requested_at) DESC
                LIMIT ?
                """,
                (resolved_limit,),
            ).fetchall()
            return [self._policy_row_to_record(row) for row in rows]

    @staticmethod
    def _model_row_to_record(row: sqlite3.Row) -> ModelChangeRecord:
        return ModelChangeRecord(
            model_change_id=str(row["model_change_id"]),
            model_name=str(row["model_name"]),
            experiment_name=str(row["experiment_name"]),
            change_summary=str(row["change_summary"]),
            metrics_json=AdminConsoleStore._json_load(str(row["metrics_json"])),
            status=ModelChangeStatus(str(row["status"])),
            requested_by_admin_user_id=str(row["requested_by_admin_user_id"]),
            requested_at=datetime.fromisoformat(str(row["requested_at"])),
            decided_by_owner_user_id=(
                str(row["decided_by_owner_user_id"]) if row["decided_by_owner_user_id"] else None
            ),
            decided_at=AdminConsoleStore._to_datetime(row["decided_at"]),
            decision_note=(str(row["decision_note"]) if row["decision_note"] else None),
            deployed_at=AdminConsoleStore._to_datetime(row["deployed_at"]),
            rolled_back_at=AdminConsoleStore._to_datetime(row["rolled_back_at"]),
        )

    def create_model_change(
        self,
        actor: AdminActorContext,
        payload: ModelChangeCreateRequest,
    ) -> ModelChangeRecord:
        now = self._now_iso()
        with self._connect() as conn:
            model_change_id = f"mdl_{uuid.uuid4().hex}"
            conn.execute(
                """
                INSERT INTO admin_model_change (
                  model_change_id,
                  model_name,
                  experiment_name,
                  change_summary,
                  metrics_json,
                  status,
                  requested_by_admin_user_id,
                  requested_at,
                  decided_by_owner_user_id,
                  decided_at,
                  decision_note,
                  deployed_at,
                  rolled_back_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL)
                """,
                (
                    model_change_id,
                    payload.model_name,
                    payload.experiment_name,
                    payload.change_summary,
                    json.dumps(payload.metrics_json, ensure_ascii=False),
                    ModelChangeStatus.draft_experiment.value,
                    actor.admin_user_id,
                    now,
                ),
            )
            self._audit(
                conn,
                actor=actor,
                action_type="model_change_created",
                target_type="model_change",
                target_id=model_change_id,
                metadata={"model_name": payload.model_name},
            )
            conn.commit()

            row = conn.execute(
                "SELECT * FROM admin_model_change WHERE model_change_id = ?",
                (model_change_id,),
            ).fetchone()
            if not row:
                raise ValueError("model_change_not_found")
            return self._model_row_to_record(row)

    def list_model_changes(self, limit: int) -> list[ModelChangeRecord]:
        resolved_limit = max(1, min(100, limit))
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM admin_model_change
                ORDER BY datetime(requested_at) DESC
                LIMIT ?
                """,
                (resolved_limit,),
            ).fetchall()
            return [self._model_row_to_record(row) for row in rows]

    def transition_model_change(
        self,
        actor: AdminActorContext,
        model_change_id: str,
        payload: ModelChangeTransitionRequest,
    ) -> ModelChangeRecord:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM admin_model_change WHERE model_change_id = ?",
                (model_change_id,),
            ).fetchone()
            if not row:
                raise ValueError("model_change_not_found")

            current = ModelChangeStatus(str(row["status"]))
            next_status = payload.next_status

            allowed = {
                ModelChangeStatus.draft_experiment: {ModelChangeStatus.training_running},
                ModelChangeStatus.training_running: {ModelChangeStatus.evaluation_ready},
                ModelChangeStatus.evaluation_ready: {
                    ModelChangeStatus.pending_owner_approval
                },
                ModelChangeStatus.approved: {ModelChangeStatus.deployed},
                ModelChangeStatus.deployed: {ModelChangeStatus.rolled_back},
            }
            if next_status not in allowed.get(current, set()):
                raise ValueError("invalid_model_status_transition")

            now = self._now_iso()
            deployed_at = row["deployed_at"]
            rolled_back_at = row["rolled_back_at"]
            if next_status == ModelChangeStatus.deployed:
                deployed_at = now
            if next_status == ModelChangeStatus.rolled_back:
                rolled_back_at = now

            conn.execute(
                """
                UPDATE admin_model_change
                SET status = ?,
                    requested_at = ?,
                    deployed_at = ?,
                    rolled_back_at = ?
                WHERE model_change_id = ?
                """,
                (
                    next_status.value,
                    now,
                    deployed_at,
                    rolled_back_at,
                    model_change_id,
                ),
            )

            if next_status == ModelChangeStatus.pending_owner_approval:
                approval_id = f"apr_{uuid.uuid4().hex}"
                conn.execute(
                    """
                    INSERT INTO owner_approval_request (
                      approval_id,
                      object_type,
                      object_id,
                      status,
                      requested_by_admin_user_id,
                      requested_at,
                      decided_by_owner_user_id,
                      decided_at,
                      decision_note
                    ) VALUES (
                      ?,
                      'model_change',
                      ?,
                      'pending_owner_approval',
                      ?,
                      ?,
                      NULL,
                      NULL,
                      NULL
                    )
                    """,
                    (approval_id, model_change_id, actor.admin_user_id, now),
                )
                self._add_admin_notification(
                    conn,
                    queue_code=AdminQueueCode.ml_queue,
                    related_object_type="owner_approval_request",
                    related_object_id=approval_id,
                    severity=AdminNotificationSeverity.high,
                )

            self._audit(
                conn,
                actor=actor,
                action_type="model_change_transitioned",
                target_type="model_change",
                target_id=model_change_id,
                metadata={"from": current.value, "to": next_status.value},
            )
            conn.commit()

            updated = conn.execute(
                "SELECT * FROM admin_model_change WHERE model_change_id = ?",
                (model_change_id,),
            ).fetchone()
            if not updated:
                raise ValueError("model_change_not_found")
            return self._model_row_to_record(updated)

    @staticmethod
    def _model_retraining_row_to_record(row: sqlite3.Row) -> ModelRetrainingJobRecord:
        return ModelRetrainingJobRecord(
            job_id=str(row["job_id"]),
            model_change_id=str(row["model_change_id"]),
            model_name=str(row["model_name"]),
            status=ModelRetrainingJobStatus(str(row["status"])),
            mode=ModelRetrainingRunMode(str(row["mode"])),
            training_window_days=int(row["training_window_days"]),
            include_synthetic_data=bool(row["include_synthetic_data"]),
            dataset_snapshot_id=(
                str(row["dataset_snapshot_id"]) if row["dataset_snapshot_id"] else None
            ),
            note=(str(row["note"]) if row["note"] else None),
            requested_by_admin_user_id=str(row["requested_by_admin_user_id"]),
            requested_at=datetime.fromisoformat(str(row["requested_at"])),
            approved_at=AdminConsoleStore._to_datetime(row["approved_at"]),
            started_at=AdminConsoleStore._to_datetime(row["started_at"]),
            completed_at=AdminConsoleStore._to_datetime(row["completed_at"]),
            artifact_uri=(str(row["artifact_uri"]) if row["artifact_uri"] else None),
            result_summary=AdminConsoleStore._json_load(row["result_summary_json"]),
            failure_reason=(str(row["failure_reason"]) if row["failure_reason"] else None),
        )

    def create_model_retraining_job(
        self,
        actor: AdminActorContext,
        model_change_id: str,
        payload: ModelRetrainingJobCreateRequest,
    ) -> ModelRetrainingJobRecord:
        now = self._now_iso()
        with self._connect() as conn:
            model_row = conn.execute(
                """
                SELECT model_name, status, metrics_json
                FROM admin_model_change
                WHERE model_change_id = ?
                """,
                (model_change_id,),
            ).fetchone()
            if not model_row:
                raise ValueError("model_change_not_found")

            model_status = ModelChangeStatus(str(model_row["status"]))
            if model_status in {ModelChangeStatus.rejected, ModelChangeStatus.rolled_back}:
                raise ValueError("invalid_model_status")

            job_status = ModelRetrainingJobStatus.pending_owner_approval
            approved_at: str | None = None
            if model_status in {ModelChangeStatus.approved, ModelChangeStatus.deployed}:
                job_status = ModelRetrainingJobStatus.queued
                approved_at = now

            model_metrics_json = self._json_load(str(model_row["metrics_json"])) if "metrics_json" in model_row.keys() else {}
            baseline_metrics = self._extract_metric_values(model_metrics_json)
            retraining_config = self._resolve_retraining_rule_config(payload)
            selection_start_date = str(retraining_config["selection_start_date"])
            selection_end_date = str(retraining_config["selection_end_date"])
            selection_window_days = int(retraining_config["selection_window_days"])
            dataset_snapshot_id = payload.dataset_snapshot_id or (
                f"snapshot_{selection_start_date.replace('-', '')}_{selection_end_date.replace('-', '')}_{uuid.uuid4().hex[:8]}"
            )
            retraining_options: dict[str, object] = {
                "include_synthetic_data": payload.include_synthetic_data,
                "require_min_account_age_days_28": payload.require_min_account_age_days_28,
                "require_second_assessment_completion": payload.require_second_assessment_completion,
                "use_pre_assessment_window_28d_requested": payload.use_pre_assessment_window_28d,
                "use_pre_assessment_window_28d_applied": True,
                "keep_user_after_eligibility": payload.keep_user_after_eligibility,
                "selected_feature_keys": payload.selected_feature_keys,
                "data_range_start_date": selection_start_date,
                "data_range_end_date": selection_end_date,
                "dataset_snapshot_id_auto_generated": payload.dataset_snapshot_id is None,
                "dataset_snapshot_id": dataset_snapshot_id,
                "target_definition": "assessment_score(phq9_total, gad7_total, isi_total)",
                "input_sources": ["checkin_28d", "cbt_28d", "challenge_28d"],
            }
            eligibility_summary = self._build_retraining_data_summary(conn, payload)
            score_comparison = self._score_comparison_payload(baseline_metrics, baseline_metrics)

            result_summary: dict[str, object] = {
                "metrics_before": baseline_metrics,
                "metrics_after": baseline_metrics,
                "score_comparison": score_comparison,
                "operator_summary": "재학습 실행 전입니다. 완료 후 이전 대비 성능 설명이 자동으로 생성됩니다.",
                "operator_recommendation_summary": "재학습 완료 후 신규 프로그램 및 운영 개선 추천이 자동 생성됩니다.",
                "program_recommendations": [],
                "improvement_recommendations": [],
                "retraining_options": retraining_options,
                "data_eligibility": eligibility_summary,
            }

            job_id = f"mljob_{uuid.uuid4().hex}"
            conn.execute(
                """
                INSERT INTO admin_model_retraining_job (
                  job_id,
                  model_change_id,
                  model_name,
                  status,
                  mode,
                  training_window_days,
                  include_synthetic_data,
                  dataset_snapshot_id,
                  note,
                  requested_by_admin_user_id,
                  requested_at,
                  approved_at,
                  started_at,
                  completed_at,
                  artifact_uri,
                  result_summary_json,
                  failure_reason
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL)
                """,
                (
                    job_id,
                    model_change_id,
                    str(model_row["model_name"]),
                    job_status.value,
                    payload.mode.value,
                    selection_window_days,
                    int(payload.include_synthetic_data),
                    dataset_snapshot_id,
                    payload.note,
                    actor.admin_user_id,
                    now,
                    approved_at,
                    json.dumps(result_summary, ensure_ascii=False),
                ),
            )
            self._add_admin_notification(
                conn,
                queue_code=AdminQueueCode.ml_queue,
                related_object_type="model_retraining_job",
                related_object_id=job_id,
                severity=AdminNotificationSeverity.medium,
            )
            self._audit(
                conn,
                actor=actor,
                action_type="model_retraining_job_created",
                target_type="model_retraining_job",
                target_id=job_id,
                metadata={
                    "model_change_id": model_change_id,
                    "status": job_status.value,
                    "mode": payload.mode.value,
                    "eligible_user_count": eligibility_summary.get("eligible_user_count", 0),
                },
            )
            conn.commit()

            row = conn.execute(
                "SELECT * FROM admin_model_retraining_job WHERE job_id = ?",
                (job_id,),
            ).fetchone()
            if not row:
                raise ValueError("model_retraining_job_not_found")
            return self._model_retraining_row_to_record(row)

    def list_model_retraining_jobs(
        self,
        model_change_id: str,
        limit: int,
    ) -> list[ModelRetrainingJobRecord]:
        resolved_limit = max(1, min(100, limit))
        with self._connect() as conn:
            model_row = conn.execute(
                """
                SELECT 1
                FROM admin_model_change
                WHERE model_change_id = ?
                """,
                (model_change_id,),
            ).fetchone()
            if not model_row:
                raise ValueError("model_change_not_found")

            rows = conn.execute(
                """
                SELECT *
                FROM admin_model_retraining_job
                WHERE model_change_id = ?
                ORDER BY datetime(requested_at) DESC
                LIMIT ?
                """,
                (model_change_id, resolved_limit),
            ).fetchall()
            return [self._model_retraining_row_to_record(row) for row in rows]

    def transition_model_retraining_job(
        self,
        actor: AdminActorContext,
        job_id: str,
        payload: ModelRetrainingJobTransitionRequest,
    ) -> ModelRetrainingJobRecord:
        allowed: dict[ModelRetrainingJobStatus, set[ModelRetrainingJobStatus]] = {
            ModelRetrainingJobStatus.pending_owner_approval: {
                ModelRetrainingJobStatus.queued,
                ModelRetrainingJobStatus.cancelled,
            },
            ModelRetrainingJobStatus.queued: {
                ModelRetrainingJobStatus.running,
                ModelRetrainingJobStatus.cancelled,
            },
            ModelRetrainingJobStatus.running: {
                ModelRetrainingJobStatus.completed,
                ModelRetrainingJobStatus.failed,
                ModelRetrainingJobStatus.cancelled,
            },
        }

        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT *
                FROM admin_model_retraining_job
                WHERE job_id = ?
                """,
                (job_id,),
            ).fetchone()
            if not row:
                raise ValueError("model_retraining_job_not_found")

            current = ModelRetrainingJobStatus(str(row["status"]))
            next_status = payload.next_status
            if next_status not in allowed.get(current, set()):
                raise ValueError("invalid_retraining_job_transition")

            if (
                current == ModelRetrainingJobStatus.pending_owner_approval
                and next_status == ModelRetrainingJobStatus.queued
            ):
                model_row = conn.execute(
                    """
                    SELECT status
                    FROM admin_model_change
                    WHERE model_change_id = ?
                    """,
                    (str(row["model_change_id"]),),
                ).fetchone()
                if not model_row:
                    raise ValueError("model_change_not_found")
                model_status = ModelChangeStatus(str(model_row["status"]))
                if model_status not in {ModelChangeStatus.approved, ModelChangeStatus.deployed}:
                    raise ValueError("invalid_model_status")

            now = self._now_iso()
            approved_at = row["approved_at"]
            started_at = row["started_at"]
            completed_at = row["completed_at"]
            artifact_uri = row["artifact_uri"]
            failure_reason = row["failure_reason"]
            result_summary = self._json_load(row["result_summary_json"])

            if payload.artifact_uri:
                artifact_uri = payload.artifact_uri
            if payload.result_summary:
                result_summary = self._merge_summary_dict(result_summary, payload.result_summary)

            if next_status == ModelRetrainingJobStatus.queued and not approved_at:
                approved_at = now
            if next_status == ModelRetrainingJobStatus.running and not started_at:
                started_at = now
            if next_status in {
                ModelRetrainingJobStatus.completed,
                ModelRetrainingJobStatus.failed,
                ModelRetrainingJobStatus.cancelled,
            }:
                completed_at = now

            if next_status == ModelRetrainingJobStatus.completed:
                failure_reason = None
                if not artifact_uri:
                    model_name = str(row["model_name"]) if row["model_name"] else "mindsight-model"
                    artifact_uri = f"s3://mindsight-model-artifacts/{model_name}/{job_id}/model-artifact"
                model_row = conn.execute(
                    """
                    SELECT metrics_json
                    FROM admin_model_change
                    WHERE model_change_id = ?
                    """,
                    (str(row["model_change_id"]),),
                ).fetchone()
                baseline_metrics = (
                    self._extract_metric_values(self._json_load(str(model_row["metrics_json"])))
                    if model_row
                    else {}
                )
                after_metrics: dict[str, float] = {}
                metrics_source = "manual_payload"
                if payload.result_summary:
                    payload_metrics_after = payload.result_summary.get("metrics_after")
                    if isinstance(payload_metrics_after, dict):
                        after_metrics = self._extract_metric_values(payload_metrics_after)
                    elif isinstance(payload.result_summary.get("metrics"), dict):
                        after_metrics = self._extract_metric_values(payload.result_summary)
                    else:
                        for key, value in payload.result_summary.items():
                            if baseline_metrics and key not in baseline_metrics:
                                continue
                            parsed = self._coerce_float(value)
                            if parsed is None:
                                continue
                            after_metrics[str(key)] = parsed
                if not after_metrics:
                    after_metrics = dict(baseline_metrics)
                    metrics_source = "auto_default_baseline"

                score_comparison = self._score_comparison_payload(baseline_metrics, after_metrics)
                operator_summary = self._build_operator_score_message(
                    baseline_metrics,
                    after_metrics,
                    score_comparison,
                )
                if metrics_source == "auto_default_baseline":
                    operator_summary = (
                        f"{operator_summary} "
                        "실측 신규 평가지표가 아직 수집되지 않아 기존 지표를 기준으로 자동 반영했습니다."
                    )
                result_summary = self._merge_summary_dict(
                    result_summary,
                    {
                        "metrics_before": baseline_metrics,
                        "metrics_after": after_metrics,
                        "score_comparison": score_comparison,
                        "operator_summary": operator_summary,
                        "metrics_source": metrics_source,
                        "completion": {
                            "auto_saved": True,
                            "completion_source": "system_auto",
                            "completed_at": now,
                        },
                    },
                )
                retraining_payload = self._retraining_payload_from_job_row(row, result_summary)
                eligibility_summary = self._build_retraining_data_summary(conn, retraining_payload)
                recommendation_payload = self._build_retraining_recommendation_payload(conn, retraining_payload)
                result_summary = self._merge_summary_dict(
                    result_summary,
                    {
                        "data_eligibility": eligibility_summary,
                        **recommendation_payload,
                    },
                )
            elif next_status in {
                ModelRetrainingJobStatus.failed,
                ModelRetrainingJobStatus.cancelled,
            }:
                failure_reason = payload.failure_reason or failure_reason or next_status.value

            conn.execute(
                """
                UPDATE admin_model_retraining_job
                SET status = ?,
                    approved_at = ?,
                    started_at = ?,
                    completed_at = ?,
                    artifact_uri = ?,
                    result_summary_json = ?,
                    failure_reason = ?
                WHERE job_id = ?
                """,
                (
                    next_status.value,
                    approved_at,
                    started_at,
                    completed_at,
                    artifact_uri,
                    json.dumps(result_summary, ensure_ascii=False),
                    failure_reason,
                    job_id,
                ),
            )
            self._audit(
                conn,
                actor=actor,
                action_type="model_retraining_job_transitioned",
                target_type="model_retraining_job",
                target_id=job_id,
                metadata={"from": current.value, "to": next_status.value},
            )
            conn.commit()

            updated = conn.execute(
                "SELECT * FROM admin_model_retraining_job WHERE job_id = ?",
                (job_id,),
            ).fetchone()
            if not updated:
                raise ValueError("model_retraining_job_not_found")
            return self._model_retraining_row_to_record(updated)

    def _handle_model_retraining_after_owner_decision(
        self,
        conn: sqlite3.Connection,
        model_change_id: str,
        approved: bool,
    ) -> int:
        now = self._now_iso()
        if approved:
            updated = conn.execute(
                """
                UPDATE admin_model_retraining_job
                SET status = 'queued',
                    approved_at = COALESCE(approved_at, ?)
                WHERE model_change_id = ?
                  AND status = 'pending_owner_approval'
                """,
                (now, model_change_id),
            )
            return int(updated.rowcount or 0)

        updated = conn.execute(
            """
            UPDATE admin_model_retraining_job
            SET status = 'cancelled',
                completed_at = COALESCE(completed_at, ?),
                failure_reason = COALESCE(failure_reason, 'owner_rejected')
            WHERE model_change_id = ?
              AND status = 'pending_owner_approval'
            """,
            (now, model_change_id),
        )
        return int(updated.rowcount or 0)

    @staticmethod
    def _approval_row_to_record(row: sqlite3.Row) -> OwnerApprovalRecord:
        return OwnerApprovalRecord(
            approval_id=str(row["approval_id"]),
            object_type=OwnerApprovalObjectType(str(row["object_type"])),
            object_id=str(row["object_id"]),
            status=OwnerApprovalStatus(str(row["status"])),
            requested_by_admin_user_id=str(row["requested_by_admin_user_id"]),
            requested_at=datetime.fromisoformat(str(row["requested_at"])),
            decided_by_owner_user_id=(
                str(row["decided_by_owner_user_id"]) if row["decided_by_owner_user_id"] else None
            ),
            decided_at=AdminConsoleStore._to_datetime(row["decided_at"]),
            decision_note=(str(row["decision_note"]) if row["decision_note"] else None),
        )

    def submit_owner_approval(
        self,
        actor: AdminActorContext,
        payload: OwnerApprovalSubmitRequest,
    ) -> OwnerApprovalRecord:
        now = self._now_iso()
        with self._connect() as conn:
            if payload.object_type == OwnerApprovalObjectType.policy_change:
                policy_row = conn.execute(
                    "SELECT status FROM admin_policy_change WHERE policy_change_id = ?",
                    (payload.object_id,),
                ).fetchone()
                if not policy_row:
                    raise ValueError("policy_change_not_found")
                if str(policy_row["status"]) not in {
                    PolicyChangeStatus.draft.value,
                    PolicyChangeStatus.rejected.value,
                }:
                    raise ValueError("invalid_policy_status")
                conn.execute(
                    """
                    UPDATE admin_policy_change
                    SET status = ?,
                        requested_at = ?
                    WHERE policy_change_id = ?
                    """,
                    (PolicyChangeStatus.pending_owner_approval.value, now, payload.object_id),
                )
            else:
                model_row = conn.execute(
                    "SELECT status FROM admin_model_change WHERE model_change_id = ?",
                    (payload.object_id,),
                ).fetchone()
                if not model_row:
                    raise ValueError("model_change_not_found")
                if str(model_row["status"]) != ModelChangeStatus.evaluation_ready.value:
                    raise ValueError("invalid_model_status")
                conn.execute(
                    """
                    UPDATE admin_model_change
                    SET status = ?,
                        requested_at = ?
                    WHERE model_change_id = ?
                    """,
                    (ModelChangeStatus.pending_owner_approval.value, now, payload.object_id),
                )

            approval_id = f"apr_{uuid.uuid4().hex}"
            conn.execute(
                """
                INSERT INTO owner_approval_request (
                  approval_id,
                  object_type,
                  object_id,
                  status,
                  requested_by_admin_user_id,
                  requested_at,
                  decided_by_owner_user_id,
                  decided_at,
                  decision_note
                ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
                """,
                (
                    approval_id,
                    payload.object_type.value,
                    payload.object_id,
                    OwnerApprovalStatus.pending_owner_approval.value,
                    actor.admin_user_id,
                    now,
                ),
            )
            queue_code = (
                AdminQueueCode.ops_queue
                if payload.object_type == OwnerApprovalObjectType.policy_change
                else AdminQueueCode.ml_queue
            )
            self._add_admin_notification(
                conn,
                queue_code=queue_code,
                related_object_type="owner_approval_request",
                related_object_id=approval_id,
                severity=AdminNotificationSeverity.high,
            )
            self._audit(
                conn,
                actor=actor,
                action_type="owner_approval_submitted",
                target_type=payload.object_type.value,
                target_id=payload.object_id,
                metadata={"approval_id": approval_id},
            )
            conn.commit()

            row = conn.execute(
                "SELECT * FROM owner_approval_request WHERE approval_id = ?",
                (approval_id,),
            ).fetchone()
            if not row:
                raise ValueError("approval_not_found")
            return self._approval_row_to_record(row)

    def decide_owner_approval(
        self,
        actor: AdminActorContext,
        approval_id: str,
        payload: OwnerApprovalDecisionRequest,
    ) -> OwnerApprovalRecord:
        now = self._now_iso()

        with self._connect() as conn:
            approval_row = conn.execute(
                "SELECT * FROM owner_approval_request WHERE approval_id = ?",
                (approval_id,),
            ).fetchone()
            if not approval_row:
                raise ValueError("approval_not_found")

            if str(approval_row["status"]) != OwnerApprovalStatus.pending_owner_approval.value:
                raise ValueError("approval_not_pending")

            decision_status = (
                OwnerApprovalStatus.approved
                if payload.decision == OwnerApprovalDecision.approved
                else OwnerApprovalStatus.rejected
            )
            conn.execute(
                """
                UPDATE owner_approval_request
                SET status = ?,
                    decided_by_owner_user_id = ?,
                    decided_at = ?,
                    decision_note = ?
                WHERE approval_id = ?
                """,
                (
                    decision_status.value,
                    actor.admin_user_id,
                    now,
                    payload.decision_note,
                    approval_id,
                ),
            )

            object_type = OwnerApprovalObjectType(str(approval_row["object_type"]))
            object_id = str(approval_row["object_id"])
            retraining_job_updates = 0
            if object_type == OwnerApprovalObjectType.policy_change:
                next_status = (
                    PolicyChangeStatus.approved
                    if decision_status == OwnerApprovalStatus.approved
                    else PolicyChangeStatus.rejected
                )
                conn.execute(
                    """
                    UPDATE admin_policy_change
                    SET status = ?,
                        decided_by_owner_user_id = ?,
                        decided_at = ?,
                        decision_note = ?
                    WHERE policy_change_id = ?
                    """,
                    (
                        next_status.value,
                        actor.admin_user_id,
                        now,
                        payload.decision_note,
                        object_id,
                    ),
                )
            else:
                next_status = (
                    ModelChangeStatus.approved
                    if decision_status == OwnerApprovalStatus.approved
                    else ModelChangeStatus.rejected
                )
                conn.execute(
                    """
                    UPDATE admin_model_change
                    SET status = ?,
                        decided_by_owner_user_id = ?,
                        decided_at = ?,
                        decision_note = ?
                    WHERE model_change_id = ?
                    """,
                    (
                        next_status.value,
                        actor.admin_user_id,
                        now,
                        payload.decision_note,
                        object_id,
                    ),
                )
                retraining_job_updates = self._handle_model_retraining_after_owner_decision(
                    conn,
                    object_id,
                    approved=decision_status == OwnerApprovalStatus.approved,
                )

            self._audit(
                conn,
                actor=actor,
                action_type="owner_approval_decided",
                target_type=object_type.value,
                target_id=object_id,
                metadata={
                    "approval_id": approval_id,
                    "decision": payload.decision.value,
                    "retraining_job_updates": retraining_job_updates,
                },
            )
            conn.commit()

            updated = conn.execute(
                "SELECT * FROM owner_approval_request WHERE approval_id = ?",
                (approval_id,),
            ).fetchone()
            if not updated:
                raise ValueError("approval_not_found")
            return self._approval_row_to_record(updated)

    def list_owner_approvals(
        self,
        status_filter: OwnerApprovalStatus | None,
        limit: int,
    ) -> list[OwnerApprovalRecord]:
        resolved_limit = max(1, min(100, limit))
        with self._connect() as conn:
            if status_filter is None:
                rows = conn.execute(
                    """
                    SELECT *
                    FROM owner_approval_request
                    ORDER BY datetime(requested_at) DESC
                    LIMIT ?
                    """,
                    (resolved_limit,),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT *
                    FROM owner_approval_request
                    WHERE status = ?
                    ORDER BY datetime(requested_at) DESC
                    LIMIT ?
                    """,
                    (status_filter.value, resolved_limit),
                ).fetchall()
            return [self._approval_row_to_record(row) for row in rows]

    def apply_policy_change(
        self,
        actor: AdminActorContext,
        policy_change_id: str,
    ) -> PolicyChangeRecord:
        now = self._now_iso()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM admin_policy_change WHERE policy_change_id = ?",
                (policy_change_id,),
            ).fetchone()
            if not row:
                raise ValueError("policy_change_not_found")
            if str(row["status"]) != PolicyChangeStatus.approved.value:
                raise ValueError("policy_not_approved")

            conn.execute(
                """
                UPDATE admin_policy_change
                SET status = ?, applied_at = ?
                WHERE policy_change_id = ?
                """,
                (PolicyChangeStatus.applied.value, now, policy_change_id),
            )
            self._audit(
                conn,
                actor=actor,
                action_type="policy_applied",
                target_type="policy_change",
                target_id=policy_change_id,
                metadata={},
            )
            conn.commit()

            updated = conn.execute(
                "SELECT * FROM admin_policy_change WHERE policy_change_id = ?",
                (policy_change_id,),
            ).fetchone()
            if not updated:
                raise ValueError("policy_change_not_found")
            return self._policy_row_to_record(updated)

    def create_extension_request(
        self,
        actor: AdminActorContext,
        payload: ExtensionRequestCreateRequest,
    ) -> ExtensionRecord:
        now = self._now_iso()
        with self._connect() as conn:
            extension_id = f"ext_{uuid.uuid4().hex}"
            conn.execute(
                """
                INSERT INTO admin_capability_extension (
                  extension_id,
                  admin_user_id,
                  extension_code,
                  status,
                  requested_at,
                  approved_at,
                  approved_by,
                  note
                ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)
                """,
                (
                    extension_id,
                    actor.admin_user_id,
                    payload.extension_code.value,
                    AdminExtensionStatus.requested.value,
                    now,
                    payload.note,
                ),
            )
            self._add_admin_notification(
                conn,
                queue_code=AdminQueueCode.ops_queue,
                related_object_type="extension_request",
                related_object_id=extension_id,
                severity=AdminNotificationSeverity.medium,
            )
            self._audit(
                conn,
                actor=actor,
                action_type="extension_requested",
                target_type="admin_extension",
                target_id=extension_id,
                metadata={"extension_code": payload.extension_code.value},
            )
            conn.commit()

            row = conn.execute(
                "SELECT * FROM admin_capability_extension WHERE extension_id = ?",
                (extension_id,),
            ).fetchone()
            if not row:
                raise ValueError("extension_not_found")
            return self._extension_row_to_record(row)

    @staticmethod
    def _extension_row_to_record(row: sqlite3.Row) -> ExtensionRecord:
        return ExtensionRecord(
            extension_id=str(row["extension_id"]),
            admin_user_id=str(row["admin_user_id"]),
            extension_code=AdminExtensionCode(str(row["extension_code"])),
            status=AdminExtensionStatus(str(row["status"])),
            requested_at=datetime.fromisoformat(str(row["requested_at"])),
            approved_at=AdminConsoleStore._to_datetime(row["approved_at"]),
            approved_by=(str(row["approved_by"]) if row["approved_by"] else None),
            note=(str(row["note"]) if row["note"] else None),
        )

    def decide_extension_request(
        self,
        actor: AdminActorContext,
        extension_id: str,
        payload: ExtensionDecisionRequest,
    ) -> ExtensionRecord:
        now = self._now_iso()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM admin_capability_extension WHERE extension_id = ?",
                (extension_id,),
            ).fetchone()
            if not row:
                raise ValueError("extension_not_found")

            status_map = {
                ExtensionDecision.approved: AdminExtensionStatus.approved,
                ExtensionDecision.rejected: AdminExtensionStatus.rejected,
                ExtensionDecision.revoked: AdminExtensionStatus.revoked,
            }
            next_status = status_map[payload.decision]

            conn.execute(
                """
                UPDATE admin_capability_extension
                SET status = ?,
                    approved_at = ?,
                    approved_by = ?,
                    note = ?
                WHERE extension_id = ?
                """,
                (
                    next_status.value,
                    now,
                    actor.admin_user_id,
                    payload.note,
                    extension_id,
                ),
            )
            self._audit(
                conn,
                actor=actor,
                action_type="extension_decided",
                target_type="admin_extension",
                target_id=extension_id,
                metadata={"decision": payload.decision.value},
            )
            conn.commit()

            updated = conn.execute(
                "SELECT * FROM admin_capability_extension WHERE extension_id = ?",
                (extension_id,),
            ).fetchone()
            if not updated:
                raise ValueError("extension_not_found")
            return self._extension_row_to_record(updated)

    def list_extensions(self, limit: int) -> list[ExtensionRecord]:
        resolved_limit = max(1, min(100, limit))
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM admin_capability_extension
                ORDER BY datetime(requested_at) DESC
                LIMIT ?
                """,
                (resolved_limit,),
            ).fetchall()
            return [self._extension_row_to_record(row) for row in rows]

    def set_admin_role(
        self,
        actor: AdminActorContext,
        target_user_id: str,
        payload: AdminRoleAssignRequest,
    ) -> AdminRoleRecord:
        now = self._now_iso()
        with self._connect() as conn:
            user_row = conn.execute(
                "SELECT 1 FROM account_user WHERE user_id = ?",
                (target_user_id,),
            ).fetchone()
            if not user_row:
                raise ValueError("target_user_not_found")

            conn.execute(
                """
                INSERT INTO admin_account_role (
                  admin_user_id,
                  base_role,
                  is_active,
                  created_at,
                  updated_at
                ) VALUES (?, ?, 1, ?, ?)
                ON CONFLICT(admin_user_id) DO UPDATE SET
                  base_role = excluded.base_role,
                  is_active = excluded.is_active,
                  updated_at = excluded.updated_at
                """,
                (target_user_id, payload.base_role.value, now, now),
            )
            self._audit(
                conn,
                actor=actor,
                action_type="admin_role_assigned",
                target_type="admin_account_role",
                target_id=target_user_id,
                metadata={"base_role": payload.base_role.value},
            )
            conn.commit()

            row = conn.execute(
                "SELECT * FROM admin_account_role WHERE admin_user_id = ?",
                (target_user_id,),
            ).fetchone()
            if not row:
                raise ValueError("admin_role_not_found")
            return AdminRoleRecord(
                admin_user_id=str(row["admin_user_id"]),
                base_role=AdminBaseRole(str(row["base_role"])),
                is_active=bool(row["is_active"]),
                created_at=datetime.fromisoformat(str(row["created_at"])),
                updated_at=datetime.fromisoformat(str(row["updated_at"])),
            )

    def list_admin_roles(self, limit: int) -> AdminRoleListResponse:
        resolved_limit = max(1, min(200, limit))
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM admin_account_role
                ORDER BY datetime(updated_at) DESC
                LIMIT ?
                """,
                (resolved_limit,),
            ).fetchall()

            items: list[AdminRoleListItem] = []
            for row in rows:
                role_record = AdminRoleRecord(
                    admin_user_id=str(row["admin_user_id"]),
                    base_role=AdminBaseRole(str(row["base_role"])),
                    is_active=bool(row["is_active"]),
                    created_at=datetime.fromisoformat(str(row["created_at"])),
                    updated_at=datetime.fromisoformat(str(row["updated_at"])),
                )
                ext_row = self._latest_extension(
                    conn,
                    role_record.admin_user_id,
                    AdminExtensionCode.analyst_ml_extension,
                )
                items.append(
                    AdminRoleListItem(
                        role=role_record,
                        extension_status=(
                            self._extension_row_to_record(ext_row) if ext_row else None
                        ),
                    )
                )
            return AdminRoleListResponse(items=items)

    def list_audit_logs(
        self,
        actor: AdminActorContext,
        limit: int,
    ) -> AuditLogListResponse:
        resolved_limit = max(1, min(200, limit))

        with self._connect() as conn:
            if actor.base_role in {AdminBaseRole.owner, AdminBaseRole.admin}:
                rows = conn.execute(
                    """
                    SELECT *
                    FROM audit_log
                    ORDER BY datetime(created_at) DESC
                    LIMIT ?
                    """,
                    (resolved_limit,),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT *
                    FROM audit_log
                    WHERE actor_admin_user_id = ?
                    ORDER BY datetime(created_at) DESC
                    LIMIT ?
                    """,
                    (actor.admin_user_id, resolved_limit),
                ).fetchall()

            items = [
                AuditLogRecord(
                    audit_id=str(row["audit_id"]),
                    actor_admin_user_id=str(row["actor_admin_user_id"]),
                    actor_role=str(row["actor_role"]),
                    action_type=str(row["action_type"]),
                    target_type=str(row["target_type"]),
                    target_id=str(row["target_id"]),
                    metadata_json=self._json_load(str(row["metadata_json"])),
                    created_at=datetime.fromisoformat(str(row["created_at"])),
                )
                for row in rows
            ]
            return AuditLogListResponse(items=items)
