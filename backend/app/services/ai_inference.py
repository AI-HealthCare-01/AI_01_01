from functools import lru_cache
from typing import Any

import numpy as np

from app.core.config import settings
from app.services.nowcast import TARGET_KEYS, load_nowcast_models, load_reference_data


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


@lru_cache(maxsize=1)
def _load_monitor_model() -> Any:
    import joblib
    from pathlib import Path

    model_path = Path(settings.monitor_model_path)
    if not model_path.exists():
        raise FileNotFoundError(f"Model file not found: {model_path}")
    return joblib.load(model_path)


def _build_input_row(payload: dict[str, Any], feature_order: list[str]) -> list[float]:
    return [float(payload[name]) for name in feature_order]


def _score_to_level(score_0_100: float) -> int:
    if score_0_100 < 20:
        return 0
    if score_0_100 < 40:
        return 1
    if score_0_100 < 60:
        return 2
    if score_0_100 < 80:
        return 3
    return 4


def _soft_bins(score_0_100: float) -> dict[str, float]:
    centers = np.array([10.0, 30.0, 50.0, 70.0, 90.0], dtype=float)
    temp = 18.0
    logits = -np.abs(score_0_100 - centers) / temp
    probs = np.exp(logits - np.max(logits))
    probs = probs / probs.sum()
    return {str(i): float(p) for i, p in enumerate(probs.tolist())}


def predict_check(payload: dict[str, Any]) -> tuple[int, dict[str, float]]:
    # New check inference uses nowcast models under model/models.
    # Start from a real reference row so all high-dimensional features exist,
    # then override key psychometric fields from the survey payload.
    ref = load_reference_data().copy()
    if ref.empty:
        raise ValueError("Nowcast reference dataset is empty.")

    row = ref.sort_values(["date", "user_id"]).iloc[[-1]].copy()

    row["phq9_total"] = float(payload["phq_total"])
    row["gad7_total"] = float(payload["gad_total"])
    row["isi_total"] = float(np.clip(float(payload["sleep_total"]) * 3.0, 0.0, 28.0))

    # Map context and suicidality into mood/distress proxies used by nowcast features.
    context = float(payload["context_risk_total"])
    suicidal = float(payload["phq9_suicidal_ideation"])
    day_impairment = float(payload["daily_functioning"])

    row["mood_0_10_today"] = float(np.clip(10.0 - (context / 15.0) * 6.0 - suicidal * 0.8, 0.0, 10.0))
    row["distress_0_10_today"] = float(np.clip((float(payload["gad_total"]) / 21.0) * 8.0 + day_impairment * 0.5, 0.0, 10.0))
    row["rumination_0_10_today"] = float(np.clip((float(payload["phq_total"]) / 27.0) * 7.0 + context * 0.1, 0.0, 10.0))
    row["sleep_difficulty_0_10_today"] = float(np.clip((float(payload["sleep_total"]) / 9.0) * 10.0, 0.0, 10.0))

    drop_cols = {
        "user_id",
        "date",
        "dep_target_proxy_0_100",
        "anx_target_proxy_0_100",
        "ins_target_proxy_0_100",
        "dep_target_observed_flag",
        "anx_target_observed_flag",
        "ins_target_observed_flag",
    }
    x_row = row[[c for c in row.columns if c not in drop_cols]].copy()

    models = load_nowcast_models()
    pred = {
        key: float(np.clip(models[key].predict(x_row)[0], 0.0, 100.0))
        for key in TARGET_KEYS
    }
    composite = float(np.mean([pred["dep"], pred["anx"], pred["ins"]]))

    level = _score_to_level(composite)
    probs = _soft_bins(composite)
    return level, probs


def predict_monitor(payload: dict[str, Any]) -> tuple[str, dict[str, float]]:
    model = _load_monitor_model()
    row = _build_input_row(payload, MONITOR_FEATURE_ORDER)
    pred = model.predict([row])[0]

    proba: dict[str, float] = {}
    if hasattr(model, "predict_proba"):
        scores = model.predict_proba([row])[0]
        for cls, score in zip(model.classes_, scores, strict=False):
            proba[str(cls)] = float(score)

    return str(pred), proba
