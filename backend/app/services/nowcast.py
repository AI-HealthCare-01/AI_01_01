from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from app.core.config import settings


DISTORTION_BASE_COLS = [
    "all_or_nothing_count",
    "catastrophizing_count",
    "mind_reading_count",
    "should_statements_count",
    "personalization_count",
    "overgeneralization_count",
]

TARGET_KEYS = ["dep", "anx", "ins"]


@dataclass(slots=True)
class NowcastPredictResult:
    user_id: str
    date: str
    dep_pred_0_100: float
    anx_pred_0_100: float
    ins_pred_0_100: float
    symptom_composite_pred_0_100: float
    dep_severity: str
    anx_severity: str
    ins_severity: str


def _severity_bucket(score: float) -> str:
    if score < 25:
        return "minimal"
    if score < 50:
        return "mild"
    if score < 75:
        return "moderate"
    return "severe"


def _ensure_file(path: str) -> Path:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Nowcast file not found: {p}")
    return p


def _build_feature_matrix(df: pd.DataFrame) -> pd.DataFrame:
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
    return df[[c for c in df.columns if c not in drop_cols]].copy()


def _prepare_distortion_day(cbt_session_path: Path) -> pd.DataFrame:
    cbt = pd.read_csv(cbt_session_path)
    if "started_at" not in cbt.columns or "user_id" not in cbt.columns:
        return pd.DataFrame(columns=["user_id", "date"])

    use_cols = [c for c in DISTORTION_BASE_COLS if c in cbt.columns]
    if not use_cols:
        return pd.DataFrame(columns=["user_id", "date"])

    for c in use_cols:
        cbt[c] = pd.to_numeric(cbt[c], errors="coerce")

    cbt["date"] = pd.to_datetime(cbt["started_at"], errors="coerce").dt.normalize()
    cbt = cbt.dropna(subset=["date"])

    day = cbt.groupby(["user_id", "date"], as_index=False).agg({c: "sum" for c in use_cols})
    day["distortion_total_count_today"] = day[use_cols].sum(axis=1)
    return day


def _add_distortion_features(df: pd.DataFrame, cbt_session_path: Path) -> pd.DataFrame:
    out = df.copy()
    out["date"] = pd.to_datetime(out["date"], errors="coerce").dt.normalize()

    day = _prepare_distortion_day(cbt_session_path)
    out = out.merge(day, on=["user_id", "date"], how="left")

    distortion_today_cols = [c for c in DISTORTION_BASE_COLS if c in out.columns]
    if "distortion_total_count_today" in out.columns:
        distortion_today_cols.append("distortion_total_count_today")

    out = out.sort_values(["user_id", "date"]).reset_index(drop=True)
    for c in distortion_today_cols:
        prefix = c.replace("_count_today", "").replace("_count", "")
        out[f"{prefix}_lag1"] = out.groupby("user_id")[c].shift(1)
        out[f"{prefix}_mean_7d"] = out.groupby("user_id")[c].transform(
            lambda s: s.shift(1).rolling(7, min_periods=1).mean()
        )

    out["distortion_feature_present_today_flag"] = (
        out[[c for c in distortion_today_cols if c in out.columns]].notna().any(axis=1)
    ).astype(int)
    return out


def _apply_distortion_overrides(
    df: pd.DataFrame,
    user_id: str,
    date: pd.Timestamp,
    overrides: dict[str, int] | None,
) -> pd.DataFrame:
    if not overrides:
        return df

    out = df.copy()
    mask = (out["user_id"] == user_id) & (out["date"] == date)
    if not mask.any():
        return out

    for key, value in overrides.items():
        if key in DISTORTION_BASE_COLS:
            out.loc[mask, key] = float(value)
    if any(k in overrides for k in DISTORTION_BASE_COLS):
        out.loc[mask, "distortion_total_count_today"] = out.loc[mask, DISTORTION_BASE_COLS].sum(axis=1)

    return out.sort_values(["user_id", "date"]).reset_index(drop=True)


@lru_cache(maxsize=1)
def load_nowcast_models() -> dict[str, Any]:
    model_dir = _ensure_file(settings.nowcast_model_dir)
    models: dict[str, Any] = {}
    for key in TARGET_KEYS:
        models[key] = joblib.load(model_dir / f"{key}_nowcast_rf.joblib")
    return models


@lru_cache(maxsize=1)
def load_reference_data() -> pd.DataFrame:
    data_path = _ensure_file(settings.nowcast_data_path)
    cbt_raw_path = _ensure_file(settings.nowcast_cbt_raw_path)
    df = pd.read_csv(data_path)
    df["date"] = pd.to_datetime(df["date"]).dt.normalize()
    df = df.sort_values(["user_id", "date"]).reset_index(drop=True)
    return _add_distortion_features(df, cbt_raw_path)


def predict_nowcast_for_user_day(
    user_id: str,
    date: str,
    distortion_overrides: dict[str, int] | None = None,
) -> NowcastPredictResult:
    df = load_reference_data().copy()
    dt = pd.to_datetime(date).normalize()
    df = _apply_distortion_overrides(df, user_id=user_id, date=dt, overrides=distortion_overrides)

    row = df[(df["user_id"] == user_id) & (df["date"] == dt)]
    if row.empty:
        raise ValueError("Requested user_id/date does not exist in nowcast reference dataset.")

    x_row = _build_feature_matrix(row)
    models = load_nowcast_models()

    pred = {}
    for key in TARGET_KEYS:
        pred[key] = float(np.clip(models[key].predict(x_row)[0], 0, 100))

    composite = float(np.mean([pred["dep"], pred["anx"], pred["ins"]]))

    return NowcastPredictResult(
        user_id=user_id,
        date=str(dt.date()),
        dep_pred_0_100=pred["dep"],
        anx_pred_0_100=pred["anx"],
        ins_pred_0_100=pred["ins"],
        symptom_composite_pred_0_100=composite,
        dep_severity=_severity_bucket(pred["dep"]),
        anx_severity=_severity_bucket(pred["anx"]),
        ins_severity=_severity_bucket(pred["ins"]),
    )


def get_weekly_dashboard_rows(user_id: str) -> list[dict[str, Any]]:
    weekly_path = _ensure_file(settings.nowcast_weekly_output_path)
    df = pd.read_csv(weekly_path)
    out = df[df["user_id"] == user_id].sort_values("week_start_date")
    if out.empty:
        raise ValueError("Requested user_id does not exist in weekly dashboard output.")

    records: list[dict[str, Any]] = []
    for _, row in out.iterrows():
        rec = row.to_dict()
        rec["week_start_date"] = str(rec["week_start_date"])
        records.append(rec)
    return records
