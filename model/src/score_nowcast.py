#!/usr/bin/env python3
"""Run inference with trained nowcast models and export day/week tables.

Usage:
  /opt/anaconda3/bin/python src/score_nowcast.py \
    --input data/derived/train_user_day_nowcast.csv \
    --out-dir outputs
"""

from __future__ import annotations

import argparse
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from feature_engineering import add_distortion_features, add_weekly_alert_columns


TARGET_KEYS = ["dep", "anx", "ins"]


def build_feature_matrix(df: pd.DataFrame) -> pd.DataFrame:
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
    feature_cols = [c for c in df.columns if c not in drop_cols]
    return df[feature_cols].copy()


def make_weekly_dashboard(pred_day: pd.DataFrame) -> pd.DataFrame:
    d = pred_day.copy()
    d["week_start_date"] = d["date"] - pd.to_timedelta(d["date"].dt.weekday, unit="D")

    g = (
        d.groupby(["user_id", "week_start_date"], as_index=False)
        .agg(
            dep_week_pred_0_100=("dep_pred_0_100", "mean"),
            anx_week_pred_0_100=("anx_pred_0_100", "mean"),
            ins_week_pred_0_100=("ins_pred_0_100", "mean"),
            dep_obs_days=("dep_obs_flag", "sum"),
            anx_obs_days=("anx_obs_flag", "sum"),
            ins_obs_days=("ins_obs_flag", "sum"),
            active_days=("checkin_present_today_flag", "sum"),
        )
        .sort_values(["user_id", "week_start_date"])
    )

    g["symptom_composite_pred_0_100"] = g[
        ["dep_week_pred_0_100", "anx_week_pred_0_100", "ins_week_pred_0_100"]
    ].mean(axis=1)

    g["dep_week_delta"] = g.groupby("user_id")["dep_week_pred_0_100"].diff()
    g["anx_week_delta"] = g.groupby("user_id")["anx_week_pred_0_100"].diff()
    g["ins_week_delta"] = g.groupby("user_id")["ins_week_pred_0_100"].diff()

    g["dep_severity"] = pd.cut(
        g["dep_week_pred_0_100"], bins=[-1, 25, 50, 75, 101], labels=["minimal", "mild", "moderate", "severe"]
    ).astype(str)
    g["anx_severity"] = pd.cut(
        g["anx_week_pred_0_100"], bins=[-1, 25, 50, 75, 101], labels=["minimal", "mild", "moderate", "severe"]
    ).astype(str)
    g["ins_severity"] = pd.cut(
        g["ins_week_pred_0_100"], bins=[-1, 25, 50, 75, 101], labels=["minimal", "mild", "moderate", "severe"]
    ).astype(str)

    return add_weekly_alert_columns(g)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Input csv path")
    parser.add_argument("--out-dir", required=True, help="Output directory")
    parser.add_argument("--model-dir", default="models", help="Model directory")
    parser.add_argument(
        "--cbt-session-path",
        default="data/raw/cbt_session.csv",
        help="Raw CBT session csv for distortion-by-type features",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    root = Path(__file__).resolve().parents[1]
    in_path = (root / args.input).resolve() if not Path(args.input).is_absolute() else Path(args.input)
    out_dir = (root / args.out_dir).resolve() if not Path(args.out_dir).is_absolute() else Path(args.out_dir)
    model_dir = (root / args.model_dir).resolve() if not Path(args.model_dir).is_absolute() else Path(args.model_dir)
    cbt_session_path = (
        (root / args.cbt_session_path).resolve()
        if not Path(args.cbt_session_path).is_absolute()
        else Path(args.cbt_session_path)
    )

    out_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(in_path)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values(["user_id", "date"]).reset_index(drop=True)
    df = add_distortion_features(df, cbt_session_path=cbt_session_path)

    x_all = build_feature_matrix(df)

    for key in TARGET_KEYS:
        model_path = model_dir / f"{key}_nowcast_rf.joblib"
        model = joblib.load(model_path)
        pred = np.clip(model.predict(x_all), 0, 100)
        df[f"{key}_pred_0_100"] = pred

    for key in TARGET_KEYS:
        obs_col = f"{key}_target_observed_flag"
        tgt_col = f"{key}_target_proxy_0_100"
        df[f"{key}_obs_flag"] = df[obs_col].astype(int) if obs_col in df.columns else 0
        df[f"{key}_actual_0_100"] = df[tgt_col] if tgt_col in df.columns else np.nan
        df[f"{key}_residual"] = df[f"{key}_actual_0_100"] - df[f"{key}_pred_0_100"]

    day_cols = [
        "user_id",
        "date",
        "dep_pred_0_100",
        "anx_pred_0_100",
        "ins_pred_0_100",
        "dep_actual_0_100",
        "anx_actual_0_100",
        "ins_actual_0_100",
        "dep_residual",
        "anx_residual",
        "ins_residual",
        "dep_obs_flag",
        "anx_obs_flag",
        "ins_obs_flag",
        "checkin_present_today_flag",
        "sleep_present_today_flag",
        "cbt_present_today_flag",
        "challenge_present_today_flag",
    ]

    day_cols = [c for c in day_cols if c in df.columns]
    pred_day = df[day_cols].copy()
    pred_day.to_csv(out_dir / "nowcast_user_day_predictions.csv", index=False)

    week_df = make_weekly_dashboard(pred_day)
    week_df.to_csv(out_dir / "nowcast_user_week_dashboard.csv", index=False)

    print("Done")
    print(f"Input: {in_path}")
    print(f"Output dir: {out_dir}")


if __name__ == "__main__":
    main()
