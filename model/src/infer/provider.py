from __future__ import annotations

import json
import os
from dataclasses import dataclass
from importlib import util as importlib_util
from pathlib import Path
from typing import Any

from .artifact_loader import load_artifact_models
from .baseline import BaselineModel

TARGET_KEYS = (
    "dep_target_state_today",
    "anx_target_state_today",
    "ins_target_state_today",
)


@dataclass
class ProviderPredictionResult:
    predictions: dict[str, float]
    used_backend: str
    feature_values: dict[str, Any]
    missing_features: list[str]
    unknown_features: list[str]
    warnings: list[str]
    schema_version: str
    logic_version: str


class ModelProvider:
    def __init__(
        self,
        *,
        contracts_dir: Path,
        fallback_artifact_dir: Path | None = None,
    ) -> None:
        self.contracts_dir = contracts_dir
        self.fallback_artifact_dir = fallback_artifact_dir
        self.baseline_model = BaselineModel()
        self._artifact_models: dict[str, Any] | None = None

        self.manifest = self._load_json("manifest.json")
        self.feature_schema = self._load_json("feature_schema.json")
        self.output_schema = self._load_json("output_schema.json")

        self.schema_version = str(self.manifest.get("schema_version") or "unknown")
        self.logic_version = str(self.manifest.get("logic_version") or "unknown")
        self.default_backend = str(self.manifest.get("default_backend") or "baseline")
        self.artifact_path_env = str(self.manifest.get("artifact_path_env") or "MODEL_ARTIFACT_PATH")
        self.feature_defs = list(self.feature_schema.get("features") or [])
        self.feature_names = [str(item.get("name")) for item in self.feature_defs if item.get("name")]
        self.default_feature_values = self._build_default_feature_values()

    def _load_json(self, filename: str) -> dict[str, Any]:
        path = self.contracts_dir / filename
        if not path.exists():
            raise ValueError(f"model_contract_not_ready:{filename}")
        with path.open("r", encoding="utf-8") as handle:
            loaded = json.load(handle)
        if not isinstance(loaded, dict):
            raise ValueError(f"model_contract_invalid:{filename}")
        return loaded

    def _build_default_feature_values(self) -> dict[str, Any]:
        defaults: dict[str, Any] = {}
        for feature in self.feature_defs:
            if not isinstance(feature, dict):
                continue
            name = str(feature.get("name") or "").strip()
            if not name:
                continue
            defaults[name] = feature.get("default")
        return defaults

    @staticmethod
    def _coerce_dtype(value: Any, dtype: str) -> Any:
        if value is None:
            return None
        if dtype == "number":
            try:
                return float(value)
            except (TypeError, ValueError):
                return None
        if dtype == "integer":
            try:
                return int(value)
            except (TypeError, ValueError):
                return None
        if dtype == "boolean":
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
            return None
        if dtype == "string":
            return str(value)
        return value

    def prepare_features(
        self,
        raw_feature_values: dict[str, Any],
    ) -> tuple[dict[str, Any], list[str], list[str], list[str]]:
        prepared: dict[str, Any] = {}
        missing: list[str] = []
        warnings: list[str] = []

        known = set(self.feature_names)
        unknown = sorted(key for key in raw_feature_values.keys() if key not in known)

        feature_def_map = {
            str(feature.get("name")): feature
            for feature in self.feature_defs
            if isinstance(feature, dict) and feature.get("name")
        }
        for name in self.feature_names:
            feature_def = feature_def_map.get(name) or {}
            dtype = str(feature_def.get("dtype") or "number")
            if name in raw_feature_values:
                prepared[name] = self._coerce_dtype(raw_feature_values.get(name), dtype)
            else:
                prepared[name] = feature_def.get("default")
                missing.append(name)

            if prepared[name] is None:
                default_value = feature_def.get("default")
                if default_value is not None:
                    prepared[name] = default_value
                    if name not in missing:
                        missing.append(name)

            required = bool(feature_def.get("required"))
            if required and prepared[name] is None:
                warnings.append(f"required_feature_missing:{name}")

        if missing:
            warnings.append(f"missing_features_defaulted:{len(missing)}")
        if unknown:
            warnings.append(f"unknown_features_ignored:{len(unknown)}")

        return prepared, missing, unknown, warnings

    @staticmethod
    def _clamp(value: float, minimum: float = 0.0, maximum: float = 100.0) -> float:
        return max(minimum, min(maximum, value))

    def _artifact_backend_predict(self, feature_values: dict[str, Any]) -> dict[str, float]:
        if importlib_util.find_spec("pandas") is None:
            raise RuntimeError("pandas_not_installed")
        import pandas as pd  # type: ignore

        artifact_path_value = os.getenv(self.artifact_path_env, "").strip()
        if artifact_path_value:
            artifact_path = Path(artifact_path_value).expanduser().resolve()
        elif self.fallback_artifact_dir is not None:
            artifact_path = self.fallback_artifact_dir
        else:
            raise RuntimeError("artifact_path_not_set")

        if self._artifact_models is None:
            self._artifact_models = load_artifact_models(artifact_path, TARGET_KEYS)

        frame = pd.DataFrame([feature_values], columns=self.feature_names)
        predictions: dict[str, float] = {}
        for key in TARGET_KEYS:
            model = self._artifact_models[key]
            value = float(model.predict(frame)[0])
            predictions[key] = round(self._clamp(value), 4)
        return predictions

    def predict(
        self,
        raw_feature_values: dict[str, Any],
    ) -> ProviderPredictionResult:
        prepared, missing, unknown, warnings = self.prepare_features(raw_feature_values)
        requested_backend = os.getenv("MODEL_BACKEND", self.default_backend).strip().lower() or self.default_backend

        used_backend = "baseline"
        predictions: dict[str, float]
        if requested_backend == "artifact":
            try:
                predictions = self._artifact_backend_predict(prepared)
                used_backend = "artifact"
            except Exception as error:  # noqa: BLE001
                warnings.append(f"artifact_fallback_to_baseline:{type(error).__name__}")
                predictions = self.baseline_model.predict(prepared)
                used_backend = "baseline"
        else:
            predictions = self.baseline_model.predict(prepared)
            used_backend = "baseline"

        return ProviderPredictionResult(
            predictions=predictions,
            used_backend=used_backend,
            feature_values=prepared,
            missing_features=missing,
            unknown_features=unknown,
            warnings=warnings,
            schema_version=self.schema_version,
            logic_version=self.logic_version,
        )
