from __future__ import annotations

import csv
import json
import sqlite3
import uuid
from datetime import UTC, datetime
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

        self._feature_columns_cache: list[str] | None = None
        self._default_feature_values_cache: dict[str, Any] | None = None
        self._metrics_cache: dict[str, Any] | None = None
        self._models_cache: dict[str, Any] | None = None

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
                CREATE TABLE IF NOT EXISTS model_nowcast_prediction (
                  prediction_id TEXT PRIMARY KEY,
                  user_id TEXT NOT NULL,
                  ml_subject_id TEXT NOT NULL,
                  model_version TEXT NOT NULL,
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
                """
            )
            conn.commit()

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
            self._feature_columns_path(),
            self._sample_train_path(),
            *[self._model_path(target) for target in NOWCAST_TARGETS],
        ]
        return all(path.exists() for path in required)

    @staticmethod
    def _dependencies_ready() -> bool:
        return (
            bool(importlib_util.find_spec("joblib"))
            and bool(importlib_util.find_spec("pandas"))
            and bool(importlib_util.find_spec("sklearn"))
        )

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

    def _model_version(self) -> str:
        metrics = self._load_metrics()
        dataset = str(metrics.get("dataset") or "nowcast")
        algorithm = str(metrics.get("algorithm") or "bundle")
        return f"{dataset}:{algorithm}"

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
        if self._feature_columns_path().exists():
            try:
                feature_count = len(self._load_feature_columns())
            except ValueError:
                feature_count = 0

        return ModelRuntimeStatusResponse(
            bundle_dir=str(self.model_bundle_dir),
            bundle_ready=self._bundle_ready(),
            dependencies_ready=self._dependencies_ready(),
            feature_count=feature_count,
            ready_targets=ready_targets,
            metrics=self._load_metrics(),
        )

    def predict_nowcast(
        self,
        user_id: str,
        payload: NowcastPredictRequest,
    ) -> NowcastPredictionResponse:
        if not self._bundle_ready():
            raise ValueError("model_bundle_not_ready")
        if not self._dependencies_ready():
            raise ValueError("model_runtime_unavailable")

        provided = {
            key: self._normalize_input_value(value)
            for key, value in payload.feature_values.items()
        }
        feature_columns = self._load_feature_columns()
        defaults = self._load_default_feature_values()
        feature_column_set = set(feature_columns)

        feature_values: dict[str, Any] = {}
        missing_features: list[str] = []
        for feature_name in feature_columns:
            if feature_name in provided:
                feature_values[feature_name] = provided[feature_name]
                continue
            feature_values[feature_name] = defaults.get(feature_name)
            missing_features.append(feature_name)

        unknown_features = sorted(key for key in provided.keys() if key not in feature_column_set)

        warnings: list[str] = []
        if missing_features:
            warnings.append(
                f"missing_features_defaulted:{len(missing_features)}"
            )
        if unknown_features:
            warnings.append(f"unknown_features_ignored:{len(unknown_features)}")

        pandas = self._import_dependency("pandas")
        frame = pandas.DataFrame([feature_values], columns=feature_columns)
        predictions: dict[str, float] = {}
        try:
            models = self._load_models()
            for target, model in models.items():
                raw_value = float(model.predict(frame)[0])
                predictions[target] = round(_clamp(raw_value, 0.0, 100.0), 4)
        except ValueError as error:
            if str(error) != "model_runtime_unavailable":
                raise
            predictions = self._fallback_predictions(feature_values)
            warnings.append("model_runtime_fallback_used:model_load")
        except Exception:
            predictions = self._fallback_predictions(feature_values)
            warnings.append("model_runtime_fallback_used:model_predict")

        generated_at = datetime.now(UTC)
        model_version = self._model_version()

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
                      model_version,
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
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        prediction_id,
                        user_id,
                        ml_subject_id,
                        model_version,
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
