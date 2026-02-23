from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib

from app.core.config import settings


CHECK_FEATURE_ORDER = [
    "phq_total",
    "gad_total",
    "sleep_total",
    "context_risk_total",
    "phq9_suicidal_ideation",
    "daily_functioning",
    "stressful_event",
    "social_support",
    "coping_skill",
    "motivation_for_change",
]

MONITOR_FEATURE_ORDER = [
    "window_days",
    "phq_last",
    "phq_avg_window",
    "phq_delta",
    "gad_last",
    "gad_avg_window",
    "gad_delta",
    "sleep_last",
    "sleep_avg_window",
    "sleep_delta",
    "context_risk_last",
    "context_risk_delta",
    "mood_avg_window",
    "mood_delta",
    "mood_std_window",
    "sleep_std_window",
    "worst_mood_7d",
    "max_drop_mood",
    "checkin_count_window",
    "checkin_missing_days",
    "exercise_days_window",
    "journal_days_window",
]


def _ensure_model_file(path: str) -> Path:
    model_path = Path(path)
    if not model_path.exists():
        raise FileNotFoundError(f"Model file not found: {model_path}")
    return model_path


@lru_cache(maxsize=1)
def load_check_model() -> Any:
    model_path = _ensure_model_file(settings.check_model_path)
    return joblib.load(model_path)


@lru_cache(maxsize=1)
def load_monitor_model() -> Any:
    model_path = _ensure_model_file(settings.monitor_model_path)
    return joblib.load(model_path)


def _build_input_row(payload: dict[str, Any], feature_order: list[str]) -> list[float]:
    return [float(payload[name]) for name in feature_order]


def predict_check(payload: dict[str, Any]) -> tuple[int, dict[str, float]]:
    model = load_check_model()
    row = _build_input_row(payload, CHECK_FEATURE_ORDER)
    pred = model.predict([row])[0]

    proba: dict[str, float] = {}
    if hasattr(model, "predict_proba"):
        scores = model.predict_proba([row])[0]
        for cls, score in zip(model.classes_, scores, strict=False):
            proba[str(int(cls))] = float(score)

    return int(pred), proba


def predict_monitor(payload: dict[str, Any]) -> tuple[str, dict[str, float]]:
    model = load_monitor_model()
    row = _build_input_row(payload, MONITOR_FEATURE_ORDER)
    pred = model.predict([row])[0]

    proba: dict[str, float] = {}
    if hasattr(model, "predict_proba"):
        scores = model.predict_proba([row])[0]
        for cls, score in zip(model.classes_, scores, strict=False):
            proba[str(cls)] = float(score)

    return str(pred), proba
