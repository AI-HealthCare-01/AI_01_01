from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class NowcastPredictRequest(BaseModel):
    feature_values: dict[str, Any] = Field(default_factory=dict)
    capture_for_retraining: bool = True


class NowcastPredictionVector(BaseModel):
    dep_target_state_today: float
    anx_target_state_today: float
    ins_target_state_today: float


class NowcastFeatureCoverage(BaseModel):
    required_feature_count: int
    provided_feature_count: int
    missing_feature_count: int
    missing_features_preview: list[str] = Field(default_factory=list)
    unknown_features: list[str] = Field(default_factory=list)


class NowcastPredictionResponse(BaseModel):
    prediction_id: str | None = None
    user_id: str
    ml_subject_id: str
    model_version: str
    used_backend: str = "baseline"
    schema_version: str = "unknown"
    logic_version: str = "unknown"
    generated_at: datetime
    predictions: NowcastPredictionVector
    feature_coverage: NowcastFeatureCoverage
    warnings: list[str] = Field(default_factory=list)


class NowcastHistoryItem(BaseModel):
    prediction_id: str
    generated_at: datetime
    model_version: str
    used_backend: str = "baseline"
    schema_version: str = "unknown"
    logic_version: str = "unknown"
    predictions: NowcastPredictionVector
    feature_coverage: NowcastFeatureCoverage


class ModelRuntimeStatusResponse(BaseModel):
    bundle_dir: str
    bundle_ready: bool
    dependencies_ready: bool
    feature_count: int
    ready_targets: list[str] = Field(default_factory=list)
    metrics: dict[str, Any] = Field(default_factory=dict)
