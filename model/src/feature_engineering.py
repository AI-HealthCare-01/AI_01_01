#!/usr/bin/env python3
"""Feature engineering helpers for nowcast training and scoring."""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Iterable

import pandas as pd


DISTORTION_BASE_COLS = [
    "all_or_nothing_count",
    "catastrophizing_count",
    "mind_reading_count",
    "should_statements_count",
    "personalization_count",
    "overgeneralization_count",
]


def _ensure_numeric(df: pd.DataFrame, cols: Iterable[str]) -> pd.DataFrame:
    for c in cols:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def _prepare_distortion_day(
    cbt_session_path: Path,
) -> pd.DataFrame:
    if not cbt_session_path.exists():
        return pd.DataFrame(columns=["user_id", "date"])

    cbt = pd.read_csv(cbt_session_path)
    required = {"user_id", "started_at"}
    if not required.issubset(set(cbt.columns)):
        return pd.DataFrame(columns=["user_id", "date"])

    use_cols = [c for c in DISTORTION_BASE_COLS if c in cbt.columns]
    if not use_cols:
        return pd.DataFrame(columns=["user_id", "date"])

    cbt = _ensure_numeric(cbt, use_cols)
    cbt["date"] = pd.to_datetime(cbt["started_at"], errors="coerce").dt.normalize()
    cbt = cbt.dropna(subset=["date"])

    agg: Dict[str, str] = {c: "sum" for c in use_cols}
    day = (
        cbt.groupby(["user_id", "date"], as_index=False)
        .agg(agg)
        .sort_values(["user_id", "date"])
    )
    day["distortion_total_count_today"] = day[use_cols].sum(axis=1)
    return day


def add_distortion_features(
    df: pd.DataFrame,
    cbt_session_path: str | Path,
) -> pd.DataFrame:
    """Attach distortion-by-type day features and lag/rolling features."""
    out = df.copy()
    out["date"] = pd.to_datetime(out["date"], errors="coerce").dt.normalize()

    day = _prepare_distortion_day(Path(cbt_session_path))
    out = out.merge(day, on=["user_id", "date"], how="left")

    distortion_today_cols = [c for c in DISTORTION_BASE_COLS if c in out.columns]
    if "distortion_total_count_today" in out.columns:
        distortion_today_cols = distortion_today_cols + ["distortion_total_count_today"]

    for c in distortion_today_cols:
        prefix = c.replace("_count_today", "").replace("_count", "")
        out[f"{prefix}_lag1"] = out.groupby("user_id")[c].shift(1)
        out[f"{prefix}_mean_7d"] = (
            out.groupby("user_id")[c]
            .transform(lambda s: s.shift(1).rolling(7, min_periods=1).mean())
        )

    out["distortion_feature_present_today_flag"] = (
        out[[c for c in distortion_today_cols if c in out.columns]].notna().any(axis=1)
    ).astype(int)

    return out


def add_weekly_alert_columns(week_df: pd.DataFrame) -> pd.DataFrame:
    """Add alert rules for weekly dashboard using trend/severity/composite."""
    out = week_df.copy()

    dep_jump = out["dep_week_delta"].fillna(0) >= 5
    anx_jump = out["anx_week_delta"].fillna(0) >= 5
    ins_jump = out["ins_week_delta"].fillna(0) >= 5
    worsening_rule = dep_jump | anx_jump | ins_jump

    severe_rule = (
        (out["dep_severity"] == "severe")
        | (out["anx_severity"] == "severe")
        | (out["ins_severity"] == "severe")
    )
    high_composite_rule = out["symptom_composite_pred_0_100"] >= 65

    out["rule_week_delta_worsen"] = worsening_rule.astype(int)
    out["rule_any_severe"] = severe_rule.astype(int)
    out["rule_composite_high"] = high_composite_rule.astype(int)

    out["alert_risk_score"] = (
        out["rule_week_delta_worsen"] * 1
        + out["rule_any_severe"] * 2
        + out["rule_composite_high"] * 2
    )
    out["alert_flag"] = (out["alert_risk_score"] >= 2).astype(int)

    out["alert_level"] = "low"
    out.loc[out["alert_risk_score"] >= 2, "alert_level"] = "medium"
    out.loc[out["alert_risk_score"] >= 4, "alert_level"] = "high"

    def _reasons(r: pd.Series) -> str:
        reasons = []
        if r["rule_week_delta_worsen"] == 1:
            reasons.append("worsening_delta")
        if r["rule_any_severe"] == 1:
            reasons.append("severe_band")
        if r["rule_composite_high"] == 1:
            reasons.append("high_composite")
        return "|".join(reasons)

    out["alert_reason_codes"] = out.apply(_reasons, axis=1)
    return out
