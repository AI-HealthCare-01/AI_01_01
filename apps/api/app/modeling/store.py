from __future__ import annotations

import csv
import json
import os
import sqlite3
import sys
import uuid
from datetime import UTC, date, datetime, timedelta
from importlib import import_module
from importlib import util as importlib_util
from pathlib import Path
from typing import Any

from app.auth.store import AuthStore

from .models import (
    ModelRuntimeStatusResponse,
    NowcastFeatureCoverage,
    NowcastHistoryItem,
    NowcastPredictionResponse,
    NowcastPredictionVector,
    NowcastPredictRequest,
)

NOWCAST_TARGETS = (
    "dep_target_state_today",
    "anx_target_state_today",
    "ins_target_state_today",
)

SLEEP_TOTAL_BUCKET_TO_NUM: dict[str, float] = {
    "lt_4h": 1.0,
    "h4_5": 2.0,
    "h5_6": 3.0,
    "h6_7": 4.0,
    "h7_8": 5.0,
    "ge_8h": 6.0,
}

SLEEP_LATENCY_BUCKET_TO_NUM: dict[str, float] = {
    "le_15m": 1.0,
    "m15_30": 2.0,
    "m30_60": 3.0,
    "ge_60m": 4.0,
}

DAYLIGHT_BUCKET_TO_NUM: dict[str, float] = {
    "m0": 0.0,
    "m1_9": 1.0,
    "m10_29": 2.0,
    "ge_30": 3.0,
}

EXERCISE_BUCKET_TO_NUM: dict[str, float] = {
    "m0": 0.0,
    "m1_9": 1.0,
    "m10_29": 2.0,
    "ge_30": 3.0,
}

ALCOHOL_BUCKET_TO_NUM: dict[str, float] = {
    "none": 0.0,
    "one": 1.0,
    "two_three": 2.0,
    "ge_four": 3.0,
}

GENDER_TO_NUM: dict[str, float] = {
    "female": 0.0,
    "male": 1.0,
    "nonbinary": 2.0,
    "prefer_not_to_say": 3.0,
}


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


class ModelingStore:
    def __init__(
        self,
        database_path: Path,
        model_bundle_dir: Path,
    ):
        self.database_path = database_path
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.model_bundle_dir = model_bundle_dir

        # Ensure auth schema exists (user_id -> ml_subject_id mapping lookup).
        AuthStore(database_path)

        self.contracts_dir = self.model_bundle_dir / "contracts"
        self._feature_columns_cache: list[str] | None = None
        self._default_feature_values_cache: dict[str, Any] | None = None
        self._metrics_cache: dict[str, Any] | None = None
        self._models_cache: dict[str, Any] | None = None
        self._provider: Any | None = None
        self._provider_error: str | None = None

        self._initialize_schema()
        self._initialize_provider()

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
                CREATE TABLE IF NOT EXISTS model_nowcast_prediction (
                  prediction_id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL,
                  ml_subject_id TEXT NOT NULL,
                  reference_date TEXT,
                  model_version TEXT NOT NULL,
                  used_backend TEXT NOT NULL DEFAULT 'baseline',
                  schema_version TEXT NOT NULL DEFAULT 'unknown',
                  logic_version TEXT NOT NULL DEFAULT 'unknown',
                  dep_score REAL NOT NULL,
                  anx_score REAL NOT NULL,
                  ins_score REAL NOT NULL,
                  provided_feature_count INTEGER NOT NULL,
                  missing_feature_count INTEGER NOT NULL,
                  missing_features_json TEXT NOT NULL,
                  unknown_features_json TEXT NOT NULL,
                  warnings_json TEXT NOT NULL,
                  model_input_json TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_model_nowcast_prediction_user_created
                ON model_nowcast_prediction(user_id, created_at DESC);

                CREATE INDEX IF NOT EXISTS idx_model_nowcast_prediction_user_reference_date
                ON model_nowcast_prediction(user_id, reference_date DESC, created_at DESC);
                """
            )
            if not self._table_has_column(conn, "model_nowcast_prediction", "reference_date"):
                conn.execute(
                    "ALTER TABLE model_nowcast_prediction ADD COLUMN reference_date TEXT"
                )
            if not self._table_has_column(conn, "model_nowcast_prediction", "used_backend"):
                conn.execute(
                    "ALTER TABLE model_nowcast_prediction ADD COLUMN used_backend TEXT NOT NULL DEFAULT 'baseline'"
                )
            if not self._table_has_column(conn, "model_nowcast_prediction", "schema_version"):
                conn.execute(
                    "ALTER TABLE model_nowcast_prediction ADD COLUMN schema_version TEXT NOT NULL DEFAULT 'unknown'"
                )
            if not self._table_has_column(conn, "model_nowcast_prediction", "logic_version"):
                conn.execute(
                    "ALTER TABLE model_nowcast_prediction ADD COLUMN logic_version TEXT NOT NULL DEFAULT 'unknown'"
                )
            conn.execute(
                """
                UPDATE model_nowcast_prediction
                SET reference_date = COALESCE(NULLIF(reference_date, ''), substr(created_at, 1, 10))
                WHERE reference_date IS NULL OR TRIM(reference_date) = ''
                """
            )
            conn.execute(
                """
                UPDATE model_nowcast_prediction
                SET used_backend = COALESCE(NULLIF(used_backend, ''), 'baseline'),
                    schema_version = COALESCE(NULLIF(schema_version, ''), 'unknown'),
                    logic_version = COALESCE(NULLIF(logic_version, ''), 'unknown')
                """
            )
            conn.commit()

    def _initialize_provider(self) -> None:
        provider_src = self.model_bundle_dir / "src"
        if provider_src.exists():
            provider_src_str = str(provider_src)
            if provider_src_str not in sys.path:
                sys.path.insert(0, provider_src_str)
        try:
            provider_module = import_module("infer.provider")
            provider_class = getattr(provider_module, "ModelProvider")
            self._provider = provider_class(
                contracts_dir=self.contracts_dir,
                fallback_artifact_dir=self.model_bundle_dir / "models",
            )
            self._provider_error = None
        except Exception as error:  # noqa: BLE001
            self._provider = None
            self._provider_error = f"model_contract_not_ready:{type(error).__name__}"

    @staticmethod
    def _table_has_column(conn: sqlite3.Connection, table_name: str, column_name: str) -> bool:
        rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        return any(str(row["name"]) == column_name for row in rows)

    @staticmethod
    def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            (table_name,),
        ).fetchone()
        return row is not None

    def _feature_columns_path(self) -> Path:
        return self.model_bundle_dir / "docs" / "model_feature_columns.json"

    def _metrics_path(self) -> Path:
        return self.model_bundle_dir / "docs" / "model_metrics.json"

    def _sample_train_path(self) -> Path:
        return self.model_bundle_dir / "data" / "train_user_day_nowcast.csv"

    def _model_path(self, target: str) -> Path:
        return self.model_bundle_dir / "models" / f"{target}.joblib"

    def _bundle_ready(self) -> bool:
        required = [
            self.contracts_dir / "feature_schema.json",
            self.contracts_dir / "output_schema.json",
            self.contracts_dir / "manifest.json",
            self.model_bundle_dir / "src" / "infer" / "provider.py",
            self.model_bundle_dir / "src" / "infer" / "baseline.py",
        ]
        return all(path.exists() for path in required) and self._provider is not None

    @staticmethod
    def _dependencies_ready() -> bool:
        requested_backend = os.getenv("MODEL_BACKEND", "baseline").strip().lower() or "baseline"
        if requested_backend != "artifact":
            return True
        return bool(importlib_util.find_spec("joblib")) and bool(importlib_util.find_spec("pandas"))

    def _load_feature_columns(self) -> list[str]:
        if self._feature_columns_cache is not None:
            return self._feature_columns_cache

        columns_path = self._feature_columns_path()
        if not columns_path.exists():
            raise ValueError("model_bundle_not_ready")

        with columns_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)

        if not isinstance(payload, list):
            raise ValueError("model_bundle_not_ready")

        columns = [str(item) for item in payload]
        self._feature_columns_cache = columns
        return columns

    def _load_metrics(self) -> dict[str, Any]:
        if self._metrics_cache is not None:
            return self._metrics_cache

        path = self._metrics_path()
        if not path.exists():
            self._metrics_cache = {}
            return {}

        with path.open("r", encoding="utf-8") as handle:
            loaded = json.load(handle)

        self._metrics_cache = loaded if isinstance(loaded, dict) else {}
        return self._metrics_cache

    @staticmethod
    def _parse_scalar(raw: str | None) -> Any:
        if raw is None:
            return None

        value = raw.strip()
        if not value:
            return None

        lowered = value.lower()
        if lowered in {"true", "false"}:
            return lowered == "true"

        try:
            if "." not in value:
                return int(value)
            return float(value)
        except ValueError:
            return value

    def _load_default_feature_values(self) -> dict[str, Any]:
        if self._default_feature_values_cache is not None:
            return self._default_feature_values_cache

        sample_path = self._sample_train_path()
        if not sample_path.exists():
            raise ValueError("model_bundle_not_ready")

        with sample_path.open("r", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            first_row = next(reader, None)

        if not first_row:
            raise ValueError("model_bundle_not_ready")

        feature_columns = self._load_feature_columns()
        defaults: dict[str, Any] = {}
        for column in feature_columns:
            defaults[column] = self._parse_scalar(first_row.get(column))

        self._default_feature_values_cache = defaults
        return defaults

    @staticmethod
    def _normalize_input_value(value: Any) -> Any:
        if isinstance(value, (str, int, float, bool)) or value is None:
            return value
        return json.dumps(value, ensure_ascii=False)

    @staticmethod
    def _import_dependency(module_name: str):
        module_spec = importlib_util.find_spec(module_name)
        if module_spec is None:
            raise ValueError("model_runtime_unavailable")

        module = __import__(module_name)
        return module

    def _load_models(self) -> dict[str, Any]:
        if self._models_cache is not None:
            return self._models_cache

        joblib = self._import_dependency("joblib")
        models: dict[str, Any] = {}
        for target in NOWCAST_TARGETS:
            path = self._model_path(target)
            if not path.exists():
                raise ValueError("model_bundle_not_ready")
            try:
                models[target] = joblib.load(path)
            except Exception as error:  # noqa: BLE001
                raise ValueError("model_runtime_unavailable") from error

        self._models_cache = models
        return models

    @staticmethod
    def _row_to_datetime(value: str) -> datetime:
        return datetime.fromisoformat(value)

    def _resolve_ml_subject_id(self, conn: sqlite3.Connection, user_id: str) -> str:
        row = conn.execute(
            """
            SELECT ams.ml_subject_id
            FROM account_ml_subject ams
            WHERE ams.user_id = ?
            """,
            (user_id,),
        ).fetchone()
        if not row:
            raise ValueError("user_not_found")
        return str(row["ml_subject_id"])

    def _model_version(self, *, used_backend: str, logic_version: str) -> str:
        metrics = self._load_metrics()
        dataset = str(metrics.get("dataset") or "nowcast")
        algorithm = str(metrics.get("algorithm") or used_backend)
        return f"{dataset}:{algorithm}:{logic_version}"

    @staticmethod
    def _to_float(value: Any, default: float) -> float:
        try:
            if value is None:
                return default
            return float(value)
        except (TypeError, ValueError):
            return default

    @classmethod
    def _fallback_predictions(cls, feature_values: dict[str, Any]) -> dict[str, float]:
        # Model artifact/runtime mismatch(eg. sklearn major mismatch) should not fully block
        # nowcast usage in local/staging scaffolds.
        mood = cls._to_float(feature_values.get("mood_1_5"), 3.0)
        anxiety = cls._to_float(feature_values.get("anxiety_1_5"), 3.0)
        energy = cls._to_float(feature_values.get("energy_1_5"), 3.0)
        sleep_bucket = cls._to_float(feature_values.get("sleep_total_bucket_num"), 4.0)

        dep = (6.0 - mood) * 17.0 + max(0.0, 3.0 - energy) * 10.0 + max(0.0, 4.0 - sleep_bucket) * 6.0
        anx = anxiety * 19.0 + (6.0 - mood) * 8.0 + max(0.0, 4.0 - sleep_bucket) * 4.0
        ins = max(0.0, 4.0 - sleep_bucket) * 18.0 + anxiety * 6.0 + (6.0 - energy) * 5.0

        return {
            "dep_target_state_today": round(_clamp(dep, 0.0, 100.0), 4),
            "anx_target_state_today": round(_clamp(anx, 0.0, 100.0), 4),
            "ins_target_state_today": round(_clamp(ins, 0.0, 100.0), 4),
        }

    def runtime_status(self) -> ModelRuntimeStatusResponse:
        ready_targets = [
            target
            for target in NOWCAST_TARGETS
            if self._model_path(target).exists()
        ]

        feature_count = 0
        if self._provider is not None:
            try:
                feature_count = len(list(getattr(self._provider, "feature_names", [])))
            except Exception:  # noqa: BLE001
                feature_count = 0
        else:
            try:
                self._initialize_provider()
                if self._provider is not None:
                    feature_count = len(list(getattr(self._provider, "feature_names", [])))
            except Exception:  # noqa: BLE001
                feature_count = 0

        runtime_metrics = self._load_metrics()
        if self._provider is not None:
            runtime_metrics = {
                **runtime_metrics,
                "model_backend_default": str(getattr(self._provider, "default_backend", "baseline")),
                "schema_version": str(getattr(self._provider, "schema_version", "unknown")),
                "logic_version": str(getattr(self._provider, "logic_version", "unknown")),
                "provider_error": None,
            }
        else:
            runtime_metrics = {
                **runtime_metrics,
                "model_backend_default": "baseline",
                "schema_version": "unknown",
                "logic_version": "unknown",
                "provider_error": self._provider_error,
            }

        return ModelRuntimeStatusResponse(
            bundle_dir=str(self.model_bundle_dir),
            bundle_ready=self._bundle_ready(),
            dependencies_ready=self._dependencies_ready(),
            feature_count=feature_count,
            ready_targets=ready_targets,
            metrics=runtime_metrics,
        )

    def predict_nowcast(
        self,
        user_id: str,
        payload: NowcastPredictRequest,
        *,
        reference_date: date | None = None,
    ) -> NowcastPredictionResponse:
        provided = {
            key: self._normalize_input_value(value)
            for key, value in payload.feature_values.items()
        }
        if self._provider is None:
            self._initialize_provider()
        if self._provider is None:
            raise ValueError("model_contract_not_ready")

        try:
            result = self._provider.predict(provided)
        except ValueError:
            raise
        except Exception as error:  # noqa: BLE001
            raise ValueError(f"model_runtime_unavailable:{type(error).__name__}") from error

        feature_columns = list(result.feature_values.keys())
        feature_values = dict(result.feature_values)
        missing_features = list(result.missing_features)
        unknown_features = list(result.unknown_features)
        warnings = list(result.warnings)
        predictions = dict(result.predictions)
        used_backend = str(result.used_backend)
        schema_version = str(result.schema_version)
        logic_version = str(result.logic_version)

        generated_at = datetime.now(UTC)
        resolved_reference_date = (reference_date or generated_at.date()).isoformat()
        model_version = self._model_version(used_backend=used_backend, logic_version=logic_version)

        prediction_id: str | None = None
        with self._connect() as conn:
            ml_subject_id = self._resolve_ml_subject_id(conn, user_id)
            if payload.capture_for_retraining:
                prediction_id = f"nwc_{uuid.uuid4().hex}"
                conn.execute(
                    """
                    INSERT INTO model_nowcast_prediction (
                      prediction_id,
                      user_id,
                      ml_subject_id,
                      reference_date,
                      model_version,
                      used_backend,
                      schema_version,
                      logic_version,
                      dep_score,
                      anx_score,
                      ins_score,
                      provided_feature_count,
                      missing_feature_count,
                      missing_features_json,
                      unknown_features_json,
                      warnings_json,
                      model_input_json,
                      created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        prediction_id,
                        user_id,
                        ml_subject_id,
                        resolved_reference_date,
                        model_version,
                        used_backend,
                        schema_version,
                        logic_version,
                        predictions["dep_target_state_today"],
                        predictions["anx_target_state_today"],
                        predictions["ins_target_state_today"],
                        len(feature_columns) - len(missing_features),
                        len(missing_features),
                        json.dumps(missing_features, ensure_ascii=False),
                        json.dumps(unknown_features, ensure_ascii=False),
                        json.dumps(warnings, ensure_ascii=False),
                        json.dumps(feature_values, ensure_ascii=False),
                        generated_at.isoformat(),
                    ),
                )
                conn.commit()

        return NowcastPredictionResponse(
            prediction_id=prediction_id,
            user_id=user_id,
            ml_subject_id=ml_subject_id,
            model_version=model_version,
            used_backend=used_backend,
            schema_version=schema_version,
            logic_version=logic_version,
            generated_at=generated_at,
            predictions=NowcastPredictionVector(
                dep_target_state_today=predictions["dep_target_state_today"],
                anx_target_state_today=predictions["anx_target_state_today"],
                ins_target_state_today=predictions["ins_target_state_today"],
            ),
            feature_coverage=NowcastFeatureCoverage(
                required_feature_count=len(feature_columns),
                provided_feature_count=len(feature_columns) - len(missing_features),
                missing_feature_count=len(missing_features),
                missing_features_preview=missing_features[:10],
                unknown_features=unknown_features,
            ),
            warnings=warnings,
        )

    @staticmethod
    def _safe_json_dict(raw: str | None) -> dict[str, Any]:
        if not raw:
            return {}
        try:
            loaded = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        return loaded if isinstance(loaded, dict) else {}

    @staticmethod
    def _to_bucket_num(raw: Any, mapping: dict[str, float]) -> float | None:
        if raw is None:
            return None
        value = str(raw).strip()
        if not value:
            return None
        return mapping.get(value)

    @staticmethod
    def _wake_hour(wake_time_local: Any) -> float | None:
        if wake_time_local is None:
            return None
        text = str(wake_time_local).strip()
        if not text or ":" not in text:
            return None
        try:
            hour_text, minute_text = text.split(":", maxsplit=1)
            hour = int(hour_text)
            minute = int(minute_text)
            if hour < 0 or hour > 23 or minute < 0 or minute > 59:
                return None
            return round(hour + minute / 60.0, 3)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _as_float(value: Any) -> float | None:
        try:
            if value is None:
                return None
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _mean(values: list[float]) -> float | None:
        if not values:
            return None
        return round(sum(values) / len(values), 4)

    @staticmethod
    def _scale_assessment(total: float | None, max_total: float) -> float | None:
        if total is None:
            return None
        return round(_clamp((float(total) / max_total) * 100.0, 0.0, 100.0), 4)

    @staticmethod
    def _age_band_from_year(age_years: int | None) -> float | None:
        if age_years is None:
            return None
        if age_years < 20:
            return 0.0
        if age_years < 30:
            return 1.0
        if age_years < 40:
            return 2.0
        if age_years < 50:
            return 3.0
        return 4.0

    def _build_feature_values_from_sources(
        self,
        conn: sqlite3.Connection,
        user_id: str,
        reference_date: date,
    ) -> dict[str, Any]:
        feature_values: dict[str, Any] = {}
        reference_iso = reference_date.isoformat()

        checkin_row = None
        if self._table_exists(conn, "daily_checkin") and self._table_exists(conn, "daily_checkin_version"):
            checkin_row = conn.execute(
                """
                SELECT dc.date, dcv.payload_json
                FROM daily_checkin dc
                LEFT JOIN daily_checkin_version dcv
                  ON dcv.checkin_version_id = dc.current_version_id
                WHERE dc.user_id = ?
                  AND dc.status = 'submitted'
                  AND dc.date <= ?
                ORDER BY dc.date DESC
                LIMIT 1
                """,
                (user_id, reference_iso),
            ).fetchone()

        checkin_payload = self._safe_json_dict(
            str(checkin_row["payload_json"]) if checkin_row and checkin_row["payload_json"] else None
        )
        if checkin_payload:
            if checkin_payload.get("mood_1_5") is not None:
                feature_values["mood_1_5"] = int(checkin_payload["mood_1_5"])
            if checkin_payload.get("anxiety_1_5") is not None:
                feature_values["anxiety_1_5"] = int(checkin_payload["anxiety_1_5"])
            if checkin_payload.get("energy_1_5") is not None:
                feature_values["energy_1_5"] = int(checkin_payload["energy_1_5"])

            sleep_total_num = self._to_bucket_num(
                checkin_payload.get("sleep_total_bucket"),
                SLEEP_TOTAL_BUCKET_TO_NUM,
            )
            if sleep_total_num is not None:
                feature_values["sleep_total_bucket_num"] = sleep_total_num

            sleep_latency_num = self._to_bucket_num(
                checkin_payload.get("sleep_latency_bucket"),
                SLEEP_LATENCY_BUCKET_TO_NUM,
            )
            if sleep_latency_num is not None:
                feature_values["sleep_latency_bucket_num"] = sleep_latency_num

            daylight_num = self._to_bucket_num(
                checkin_payload.get("daylight_bucket"),
                DAYLIGHT_BUCKET_TO_NUM,
            )
            if daylight_num is not None:
                feature_values["daylight_bucket_num"] = daylight_num

            exercise_num = self._to_bucket_num(
                checkin_payload.get("exercise_bucket"),
                EXERCISE_BUCKET_TO_NUM,
            )
            if exercise_num is not None:
                feature_values["exercise_bucket_num"] = exercise_num

            alcohol_num = self._to_bucket_num(
                checkin_payload.get("alcohol_bucket"),
                ALCOHOL_BUCKET_TO_NUM,
            )
            if alcohol_num is not None:
                feature_values["alcohol_bucket"] = alcohol_num

            feature_values["caffeine_after_2pm_flag"] = (
                1.0 if bool(checkin_payload.get("caffeine_after_2pm_flag")) else 0.0
            )
            wake_hour = self._wake_hour(checkin_payload.get("wake_time_local"))
            if wake_hour is not None:
                feature_values["wake_hour"] = wake_hour

        if self._table_exists(conn, "daily_checkin_features_daily"):
            checkin_feature_row = conn.execute(
                """
                SELECT days_since_prev_checkin
                FROM daily_checkin_features_daily
                WHERE user_id = ?
                  AND date <= ?
                ORDER BY date DESC
                LIMIT 1
                """,
                (user_id, reference_iso),
            ).fetchone()
            if checkin_feature_row and checkin_feature_row["days_since_prev_checkin"] is not None:
                feature_values["days_since_prev_checkin"] = float(
                    checkin_feature_row["days_since_prev_checkin"]
                )

        if self._table_exists(conn, "daily_checkin"):
            adherence_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM daily_checkin
                WHERE user_id = ?
                  AND status = 'submitted'
                  AND date BETWEEN date(?, '-27 day') AND ?
                """,
                (user_id, reference_iso, reference_iso),
            ).fetchone()
            adherence_count = int(adherence_row["cnt"] or 0) if adherence_row else 0
            feature_values["adherence_0_1"] = round(_clamp(adherence_count / 28.0, 0.0, 1.0), 4)

        assessment_total_row = None
        assessment_completed_at: datetime | None = None
        if self._table_exists(conn, "periodic_assessment") and self._table_exists(conn, "assessment_score"):
            assessment_total_row = conn.execute(
                """
                SELECT sc.phq9_total, sc.gad7_total, sc.isi_total, pa.completed_at
                FROM periodic_assessment pa
                JOIN assessment_score sc ON sc.assessment_id = pa.assessment_id
                WHERE pa.user_id = ?
                  AND pa.status IN ('completed', 'late')
                  AND pa.completed_at IS NOT NULL
                  AND date(pa.completed_at) <= ?
                ORDER BY datetime(pa.completed_at) DESC
                LIMIT 1
                """,
                (user_id, reference_iso),
            ).fetchone()

        if not assessment_total_row and self._table_exists(conn, "baseline_assessment"):
            assessment_total_row = conn.execute(
                """
                SELECT
                  depression_score AS phq9_total,
                  anxiety_score AS gad7_total,
                  insomnia_score AS isi_total,
                  completed_at
                FROM baseline_assessment
                WHERE user_id = ?
                  AND date(completed_at) <= ?
                ORDER BY datetime(completed_at) DESC
                LIMIT 1
                """,
                (user_id, reference_iso),
            ).fetchone()

        if assessment_total_row:
            phq9_total = (
                int(assessment_total_row["phq9_total"])
                if assessment_total_row["phq9_total"] is not None
                else None
            )
            gad7_total = (
                int(assessment_total_row["gad7_total"])
                if assessment_total_row["gad7_total"] is not None
                else None
            )
            isi_total = (
                int(assessment_total_row["isi_total"])
                if assessment_total_row["isi_total"] is not None
                else None
            )
            if phq9_total is not None:
                feature_values["phq9_total"] = phq9_total
                feature_values["phq9_last_score"] = float(phq9_total)
            if gad7_total is not None:
                feature_values["gad7_total"] = gad7_total
                feature_values["gad7_last_score"] = float(gad7_total)
            if isi_total is not None:
                feature_values["isi_total"] = isi_total
                feature_values["isi_last_score"] = float(isi_total)

            if assessment_total_row["completed_at"]:
                assessment_completed_at = datetime.fromisoformat(str(assessment_total_row["completed_at"]))
                days_since = (reference_date - assessment_completed_at.date()).days
                feature_values["days_since_last_assessment"] = float(max(0, days_since))
                feature_values["assessment_overdue_flag"] = 1.0 if days_since > 28 else 0.0

        if self._table_exists(conn, "account_user"):
            profile_row = conn.execute(
                """
                SELECT au.created_at, ap.age_years_derived, ap.birth_year, ap.gender
                FROM account_user au
                LEFT JOIN account_profile ap ON ap.user_id = au.user_id
                WHERE au.user_id = ?
                LIMIT 1
                """,
                (user_id,),
            ).fetchone()
            if profile_row:
                if profile_row["created_at"]:
                    created_at = datetime.fromisoformat(str(profile_row["created_at"]))
                    feature_values["days_since_onboarding"] = float(
                        max(0, (reference_date - created_at.date()).days)
                    )
                age_years = (
                    int(profile_row["age_years_derived"])
                    if profile_row["age_years_derived"] is not None
                    else None
                )
                if age_years is None and profile_row["birth_year"] is not None:
                    try:
                        age_years = max(0, reference_date.year - int(profile_row["birth_year"]))
                    except (TypeError, ValueError):
                        age_years = None
                age_band = self._age_band_from_year(age_years)
                if age_band is not None:
                    feature_values["age_band"] = age_band
                gender = str(profile_row["gender"] or "").strip()
                if gender in GENDER_TO_NUM:
                    feature_values["gender"] = GENDER_TO_NUM[gender]

        if self._table_exists(conn, "challenge_exposure"):
            shown_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM challenge_exposure
                WHERE user_id = ?
                  AND date = ?
                  AND exposure_type = 'shown'
                """,
                (user_id, reference_iso),
            ).fetchone()
            feature_values["challenge_shown_count_today"] = float(int(shown_row["cnt"] or 0) if shown_row else 0)

            accept_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM challenge_exposure
                WHERE user_id = ?
                  AND date = ?
                  AND response_type = 'accepted'
                """,
                (user_id, reference_iso),
            ).fetchone()
            feature_values["challenge_accept_count_today"] = float(int(accept_row["cnt"] or 0) if accept_row else 0)

        if self._table_exists(conn, "challenge_day_log"):
            completed_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM challenge_day_log
                WHERE user_id = ?
                  AND date = ?
                  AND completed_flag = 1
                """,
                (user_id, reference_iso),
            ).fetchone()
            feature_values["challenge_completed_count_today"] = float(
                int(completed_row["cnt"] or 0) if completed_row else 0
            )

            has_helpfulness_0_10 = self._table_has_column(conn, "challenge_day_log", "helpfulness_0_10")
            has_helpfulness_1_5 = self._table_has_column(conn, "challenge_day_log", "helpfulness_score_1_5")
            helpfulness_expr = "NULL"
            if has_helpfulness_0_10 and has_helpfulness_1_5:
                helpfulness_expr = "AVG(COALESCE(helpfulness_0_10, helpfulness_score_1_5 * 2.0))"
            elif has_helpfulness_0_10:
                helpfulness_expr = "AVG(helpfulness_0_10)"
            elif has_helpfulness_1_5:
                helpfulness_expr = "AVG(helpfulness_score_1_5 * 2.0)"
            if helpfulness_expr != "NULL":
                helpfulness_row = conn.execute(
                    f"""
                    SELECT {helpfulness_expr} AS avg_helpfulness
                    FROM challenge_day_log
                    WHERE user_id = ?
                      AND date = ?
                      AND completed_flag = 1
                    """,
                    (user_id, reference_iso),
                ).fetchone()
                helpfulness_value = self._as_float(
                    helpfulness_row["avg_helpfulness"] if helpfulness_row else None
                )
                feature_values["challenge_helpfulness_mean_today"] = (
                    round(helpfulness_value, 4) if helpfulness_value is not None else 0.0
                )

        if self._table_exists(conn, "challenge_enrollment"):
            dropout_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM challenge_enrollment
                WHERE user_id = ?
                  AND status = 'dropped'
                  AND ended_at IS NOT NULL
                  AND date(ended_at) = ?
                """,
                (user_id, reference_iso),
            ).fetchone()
            feature_values["challenge_dropout_count_today"] = float(
                int(dropout_row["cnt"] or 0) if dropout_row else 0
            )

        if self._table_exists(conn, "cbt_session_summary"):
            cbt_count_row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM cbt_session_summary
                WHERE user_id = ?
                  AND date = ?
                """,
                (user_id, reference_iso),
            ).fetchone()
            feature_values["cbt_session_count_today"] = float(int(cbt_count_row["cnt"] or 0) if cbt_count_row else 0)

            if self._table_has_column(conn, "cbt_session_summary", "session_helpfulness_0_10"):
                cbt_help_row = conn.execute(
                    """
                    SELECT AVG(session_helpfulness_0_10) AS avg_helpfulness
                    FROM cbt_session_summary
                    WHERE user_id = ?
                      AND date = ?
                    """,
                    (user_id, reference_iso),
                ).fetchone()
                cbt_helpfulness = self._as_float(cbt_help_row["avg_helpfulness"] if cbt_help_row else None)
                feature_values["cbt_helpfulness_mean_today"] = (
                    round(cbt_helpfulness, 4) if cbt_helpfulness is not None else 0.0
                )

            if self._table_has_column(conn, "cbt_session_summary", "homework_commitment_0_10"):
                cbt_homework_row = conn.execute(
                    """
                    SELECT AVG(homework_commitment_0_10) AS avg_commitment
                    FROM cbt_session_summary
                    WHERE user_id = ?
                      AND date = ?
                    """,
                    (user_id, reference_iso),
                ).fetchone()
                cbt_commitment = self._as_float(cbt_homework_row["avg_commitment"] if cbt_homework_row else None)
                feature_values["cbt_homework_commitment_mean_today"] = (
                    round(cbt_commitment, 4) if cbt_commitment is not None else 0.0
                )

        if self._table_exists(conn, "cbt_risk_signal"):
            risk_row = conn.execute(
                """
                SELECT
                  MAX(CASE
                    WHEN self_harm_flag = 1 OR violence_risk_flag = 1
                      OR functional_impairment_flag = 1 OR suicide_risk_level > 0
                    THEN 1 ELSE 0 END) AS risk_any_today,
                  MAX(suicide_risk_level) AS suicide_risk_level_today,
                  MAX(functional_impairment_flag) AS functional_impairment_today,
                  MAX(self_harm_flag) AS self_harm_today
                FROM cbt_risk_signal
                WHERE user_id = ?
                  AND date = ?
                """,
                (user_id, reference_iso),
            ).fetchone()
            if risk_row:
                feature_values["risk_any_today"] = float(int(risk_row["risk_any_today"] or 0))
                feature_values["suicide_risk_level_today"] = float(int(risk_row["suicide_risk_level_today"] or 0))
                feature_values["functional_impairment_today"] = float(int(risk_row["functional_impairment_today"] or 0))
                feature_values["self_harm_today"] = float(int(risk_row["self_harm_today"] or 0))

        history_rows = conn.execute(
            """
            SELECT
              COALESCE(reference_date, substr(created_at, 1, 10)) AS ref_date,
              dep_score,
              anx_score,
              ins_score,
              model_input_json
            FROM model_nowcast_prediction
            WHERE user_id = ?
              AND date(COALESCE(reference_date, substr(created_at, 1, 10))) < ?
            ORDER BY date(COALESCE(reference_date, substr(created_at, 1, 10))) DESC,
                     datetime(created_at) DESC
            LIMIT 64
            """,
            (user_id, reference_iso),
        ).fetchall()

        dedup_history: list[sqlite3.Row] = []
        seen_ref_dates: set[str] = set()
        for row in history_rows:
            ref_date = str(row["ref_date"])
            if ref_date in seen_ref_dates:
                continue
            seen_ref_dates.add(ref_date)
            dedup_history.append(row)

        history_inputs = [
            self._safe_json_dict(str(row["model_input_json"]) if row["model_input_json"] else None)
            for row in dedup_history
        ]

        lag_feature_bases = [
            "sleep_total_bucket_num",
            "sleep_latency_bucket_num",
            "mood_1_5",
            "anxiety_1_5",
            "energy_1_5",
            "daylight_bucket_num",
            "exercise_bucket_num",
            "alcohol_bucket",
            "caffeine_after_2pm_flag",
            "wake_hour",
            "challenge_shown_count_today",
            "challenge_accept_count_today",
            "challenge_completed_count_today",
            "challenge_helpfulness_mean_today",
            "challenge_dropout_count_today",
            "cbt_session_count_today",
            "cbt_helpfulness_mean_today",
            "cbt_homework_commitment_mean_today",
            "risk_any_today",
            "suicide_risk_level_today",
            "functional_impairment_today",
            "self_harm_today",
        ]
        for base_name in lag_feature_bases:
            lag_value = None
            mean_values: list[float] = []
            for index, previous_input in enumerate(history_inputs):
                numeric = self._as_float(previous_input.get(base_name))
                if numeric is None:
                    continue
                if lag_value is None and index == 0:
                    lag_value = numeric
                if len(mean_values) < 3:
                    mean_values.append(numeric)
            if lag_value is not None:
                feature_values[f"{base_name}_lag1"] = round(lag_value, 4)
            mean_value = self._mean(mean_values)
            if mean_value is not None:
                feature_values[f"{base_name}_mean_last3obs"] = mean_value

        dep_prev = [self._as_float(row["dep_score"]) for row in dedup_history]
        anx_prev = [self._as_float(row["anx_score"]) for row in dedup_history]
        ins_prev = [self._as_float(row["ins_score"]) for row in dedup_history]
        dep_prev = [value for value in dep_prev if value is not None]
        anx_prev = [value for value in anx_prev if value is not None]
        ins_prev = [value for value in ins_prev if value is not None]

        if dep_prev:
            feature_values["dep_target_state_today_lag1"] = round(dep_prev[0], 4)
            dep_lag_mean = self._mean(dep_prev[:3])
            if dep_lag_mean is not None:
                feature_values["dep_target_state_today_mean_last3obs"] = dep_lag_mean
            dep_week = self._mean(dep_prev[:7])
            if dep_week is not None:
                feature_values["dep_week_avg"] = dep_week
            dep_month = self._mean(dep_prev[:28])
            if dep_month is not None:
                feature_values["dep_month_avg"] = dep_month

        if anx_prev:
            feature_values["anx_target_state_today_lag1"] = round(anx_prev[0], 4)
            anx_lag_mean = self._mean(anx_prev[:3])
            if anx_lag_mean is not None:
                feature_values["anx_target_state_today_mean_last3obs"] = anx_lag_mean
            anx_week = self._mean(anx_prev[:7])
            if anx_week is not None:
                feature_values["anx_week_avg"] = anx_week
            anx_month = self._mean(anx_prev[:28])
            if anx_month is not None:
                feature_values["anx_month_avg"] = anx_month

        if ins_prev:
            feature_values["ins_target_state_today_lag1"] = round(ins_prev[0], 4)
            ins_lag_mean = self._mean(ins_prev[:3])
            if ins_lag_mean is not None:
                feature_values["ins_target_state_today_mean_last3obs"] = ins_lag_mean
            ins_week = self._mean(ins_prev[:7])
            if ins_week is not None:
                feature_values["ins_week_avg"] = ins_week
            ins_month = self._mean(ins_prev[:28])
            if ins_month is not None:
                feature_values["ins_month_avg"] = ins_month

        if "dep_week_avg" not in feature_values and "phq9_total" in feature_values:
            dep_from_assessment = self._scale_assessment(
                self._as_float(feature_values.get("phq9_total")),
                27.0,
            )
            if dep_from_assessment is not None:
                feature_values["dep_week_avg"] = dep_from_assessment
                feature_values["dep_month_avg"] = dep_from_assessment

        if "anx_week_avg" not in feature_values and "gad7_total" in feature_values:
            anx_from_assessment = self._scale_assessment(
                self._as_float(feature_values.get("gad7_total")),
                21.0,
            )
            if anx_from_assessment is not None:
                feature_values["anx_week_avg"] = anx_from_assessment
                feature_values["anx_month_avg"] = anx_from_assessment

        if "ins_week_avg" not in feature_values and "isi_total" in feature_values:
            ins_from_assessment = self._scale_assessment(
                self._as_float(feature_values.get("isi_total")),
                28.0,
            )
            if ins_from_assessment is not None:
                feature_values["ins_week_avg"] = ins_from_assessment
                feature_values["ins_month_avg"] = ins_from_assessment

        if assessment_completed_at is None:
            feature_values.setdefault("days_since_last_assessment", 999.0)
            feature_values.setdefault("assessment_overdue_flag", 1.0)

        return feature_values

    def ensure_nowcast_prediction_from_sources(
        self,
        user_id: str,
        *,
        reference_date: date | None = None,
        force: bool = False,
        min_refresh_interval_minutes: int = 15,
    ) -> NowcastPredictionResponse | None:
        if not self._bundle_ready():
            return None

        resolved_reference_date = reference_date or date.today()
        reference_iso = resolved_reference_date.isoformat()
        with self._connect() as conn:
            self._resolve_ml_subject_id(conn, user_id)
            if not force:
                existing_row = conn.execute(
                    """
                    SELECT created_at
                    FROM model_nowcast_prediction
                    WHERE user_id = ?
                      AND date(COALESCE(reference_date, substr(created_at, 1, 10))) = ?
                    ORDER BY datetime(created_at) DESC
                    LIMIT 1
                    """,
                    (user_id, reference_iso),
                ).fetchone()
                if existing_row and existing_row["created_at"]:
                    try:
                        latest_created = datetime.fromisoformat(str(existing_row["created_at"]))
                        if datetime.now(UTC) - latest_created <= timedelta(
                            minutes=max(1, min_refresh_interval_minutes)
                        ):
                            return None
                    except ValueError:
                        pass

            feature_values = self._build_feature_values_from_sources(
                conn=conn,
                user_id=user_id,
                reference_date=resolved_reference_date,
            )

        return self.predict_nowcast(
            user_id=user_id,
            payload=NowcastPredictRequest(
                feature_values=feature_values,
                capture_for_retraining=True,
            ),
            reference_date=resolved_reference_date,
        )

    def list_recent_predictions(self, user_id: str, limit: int = 20) -> list[NowcastHistoryItem]:
        resolved_limit = max(1, min(100, limit))

        with self._connect() as conn:
            self._resolve_ml_subject_id(conn, user_id)
            rows = conn.execute(
                """
                SELECT *
                FROM model_nowcast_prediction
                WHERE user_id = ?
                ORDER BY datetime(created_at) DESC
                LIMIT ?
                """,
                (user_id, resolved_limit),
            ).fetchall()

        items: list[NowcastHistoryItem] = []
        for row in rows:
            missing_features = json.loads(str(row["missing_features_json"]))
            unknown_features = json.loads(str(row["unknown_features_json"]))
            items.append(
                NowcastHistoryItem(
                    prediction_id=str(row["prediction_id"]),
                    generated_at=self._row_to_datetime(str(row["created_at"])),
                    model_version=str(row["model_version"]),
                    used_backend=str(row["used_backend"] or "baseline"),
                    schema_version=str(row["schema_version"] or "unknown"),
                    logic_version=str(row["logic_version"] or "unknown"),
                    predictions=NowcastPredictionVector(
                        dep_target_state_today=float(row["dep_score"]),
                        anx_target_state_today=float(row["anx_score"]),
                        ins_target_state_today=float(row["ins_score"]),
                    ),
                    feature_coverage=NowcastFeatureCoverage(
                        required_feature_count=int(row["provided_feature_count"])
                        + int(row["missing_feature_count"]),
                        provided_feature_count=int(row["provided_feature_count"]),
                        missing_feature_count=int(row["missing_feature_count"]),
                        missing_features_preview=list(missing_features)[:10],
                        unknown_features=list(unknown_features),
                    ),
                )
            )
        return items
