#!/usr/bin/env python3
"""Train per-condition nowcast models and export dashboard-ready trend tables.

Usage:
  /opt/anaconda3/bin/python src/train_nowcast_models.py
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from feature_engineering import add_distortion_features, add_weekly_alert_columns


RANDOM_STATE = 42
TARGET_SPECS = {
    "dep": ("dep_target_proxy_0_100", "dep_target_observed_flag"),
    "anx": ("anx_target_proxy_0_100", "anx_target_observed_flag"),
    "ins": ("ins_target_proxy_0_100", "ins_target_observed_flag"),
}


@dataclass
class TrainResult:
    key: str
    target_col: str
    observed_col: str
    model: Pipeline
    metrics: Dict[str, float]
    feature_importance: pd.DataFrame


def severity_bucket(score: float) -> str:
    if pd.isna(score):
        return "unknown"
    if score < 25:
        return "minimal"
    if score < 50:
        return "mild"
    if score < 75:
        return "moderate"
    return "severe"


def build_feature_matrix(df: pd.DataFrame) -> Tuple[pd.DataFrame, List[str], List[str]]:
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
    x = df[feature_cols].copy()

    cat_cols = [c for c in x.columns if x[c].dtype == "object"]
    num_cols = [c for c in x.columns if c not in cat_cols]
    return x, num_cols, cat_cols


def split_time_based(df_obs: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame]:
    unique_dates = np.array(sorted(df_obs["date"].dropna().unique()))
    if len(unique_dates) < 5:
        raise ValueError("Need at least 5 distinct dates for time split.")
    split_idx = int(len(unique_dates) * 0.8)
    split_idx = min(max(split_idx, 1), len(unique_dates) - 1)
    split_date = unique_dates[split_idx]

    train_df = df_obs[df_obs["date"] < split_date].copy()
    valid_df = df_obs[df_obs["date"] >= split_date].copy()

    if train_df.empty or valid_df.empty:
        split_date = unique_dates[-2]
        train_df = df_obs[df_obs["date"] < split_date].copy()
        valid_df = df_obs[df_obs["date"] >= split_date].copy()

    if train_df.empty or valid_df.empty:
        raise ValueError("Time split failed: train or validation set is empty.")

    return train_df, valid_df


def make_pipeline(num_cols: List[str], cat_cols: List[str]) -> Pipeline:
    num_pipe = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
        ]
    )
    cat_pipe = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]
    )
    prep = ColumnTransformer(
        transformers=[
            ("num", num_pipe, num_cols),
            ("cat", cat_pipe, cat_cols),
        ]
    )

    model = RandomForestRegressor(
        n_estimators=350,
        max_depth=None,
        min_samples_leaf=3,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )

    return Pipeline(
        steps=[
            ("prep", prep),
            ("model", model),
        ]
    )


def evaluate(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    mae = float(mean_absolute_error(y_true, y_pred))
    r2 = float(r2_score(y_true, y_pred))
    return {
        "rmse": rmse,
        "mae": mae,
        "r2": r2,
    }


def get_feature_importance(model: Pipeline, top_n: int = 30) -> pd.DataFrame:
    prep = model.named_steps["prep"]
    rf = model.named_steps["model"]
    fnames = prep.get_feature_names_out()
    imps = rf.feature_importances_
    fi = pd.DataFrame({"feature": fnames, "importance": imps}).sort_values(
        "importance", ascending=False
    )
    return fi.head(top_n).reset_index(drop=True)


def train_one_target(
    df: pd.DataFrame,
    x_all: pd.DataFrame,
    num_cols: List[str],
    cat_cols: List[str],
    key: str,
    target_col: str,
    observed_col: str,
) -> TrainResult:
    obs_mask = (df[observed_col] == 1) & df[target_col].notna()
    df_obs = df.loc[obs_mask, ["user_id", "date", target_col]].copy()
    df_obs = df_obs.join(x_all)

    train_df, valid_df = split_time_based(df_obs)

    x_train = train_df[x_all.columns]
    y_train = train_df[target_col].values
    x_valid = valid_df[x_all.columns]
    y_valid = valid_df[target_col].values

    baseline = DummyRegressor(strategy="mean")
    baseline.fit(np.zeros((len(y_train), 1)), y_train)
    y_base = baseline.predict(np.zeros((len(y_valid), 1)))
    baseline_metrics = evaluate(y_valid, y_base)

    model = make_pipeline(num_cols, cat_cols)
    model.fit(x_train, y_train)
    y_pred = np.clip(model.predict(x_valid), 0, 100)
    model_metrics = evaluate(y_valid, y_pred)

    metrics = {
        "rows_observed": float(len(df_obs)),
        "rows_train": float(len(train_df)),
        "rows_valid": float(len(valid_df)),
        "baseline_mae": baseline_metrics["mae"],
        "baseline_rmse": baseline_metrics["rmse"],
        "baseline_r2": baseline_metrics["r2"],
        "model_mae": model_metrics["mae"],
        "model_rmse": model_metrics["rmse"],
        "model_r2": model_metrics["r2"],
        "mae_gain": baseline_metrics["mae"] - model_metrics["mae"],
        "rmse_gain": baseline_metrics["rmse"] - model_metrics["rmse"],
    }

    fi = get_feature_importance(model)
    return TrainResult(
        key=key,
        target_col=target_col,
        observed_col=observed_col,
        model=model,
        metrics=metrics,
        feature_importance=fi,
    )


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

    g["dep_severity"] = g["dep_week_pred_0_100"].map(severity_bucket)
    g["anx_severity"] = g["anx_week_pred_0_100"].map(severity_bucket)
    g["ins_severity"] = g["ins_week_pred_0_100"].map(severity_bucket)

    return add_weekly_alert_columns(g)


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    data_path = root / "data" / "derived" / "train_user_day_nowcast.csv"
    cbt_session_path = root / "data" / "raw" / "cbt_session.csv"
    out_dir = root / "outputs"
    model_dir = root / "models"

    out_dir.mkdir(parents=True, exist_ok=True)
    model_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(data_path)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values(["user_id", "date"]).reset_index(drop=True)
    df = add_distortion_features(df, cbt_session_path=cbt_session_path)

    x_all, num_cols, cat_cols = build_feature_matrix(df)

    all_metrics = []
    all_fi = []
    for key, (target_col, observed_col) in TARGET_SPECS.items():
        result = train_one_target(
            df=df,
            x_all=x_all,
            num_cols=num_cols,
            cat_cols=cat_cols,
            key=key,
            target_col=target_col,
            observed_col=observed_col,
        )
        all_metrics.append({"target": key, **result.metrics})

        fi = result.feature_importance.copy()
        fi.insert(0, "target", key)
        all_fi.append(fi)

        joblib.dump(result.model, model_dir / f"{key}_nowcast_rf.joblib")

        df[f"{key}_pred_0_100"] = np.clip(result.model.predict(x_all), 0, 100)
        df[f"{key}_obs_flag"] = df[observed_col].astype(int)
        df[f"{key}_actual_0_100"] = df[target_col]
        df[f"{key}_residual"] = df[target_col] - df[f"{key}_pred_0_100"]

    metrics_df = pd.DataFrame(all_metrics)
    metrics_df.to_csv(out_dir / "model_metrics.csv", index=False)

    fi_df = pd.concat(all_fi, ignore_index=True)
    fi_df.to_csv(out_dir / "feature_importance_top30.csv", index=False)

    pred_cols = [
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
    pred_day = df[pred_cols].copy()
    pred_day.to_csv(out_dir / "nowcast_user_day_predictions.csv", index=False)

    week_df = make_weekly_dashboard(pred_day)
    week_df.to_csv(out_dir / "nowcast_user_week_dashboard.csv", index=False)

    print("Done")
    print(f"- models: {model_dir}")
    print(f"- outputs: {out_dir}")


if __name__ == "__main__":
    main()
