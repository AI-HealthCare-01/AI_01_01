import argparse
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MODEL_DIR = ROOT / "models"
REPORT_DIR = ROOT / "reports"


def _train_check(seed: int) -> dict:
    path = DATA_DIR / "healthcheck_check_synth.csv"
    df = pd.read_csv(path)

    feature_cols = [
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
    target_col = "overall_level"

    X = df[feature_cols]
    y = df[target_col]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=seed, stratify=y
    )

    model = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "clf",
                RandomForestClassifier(
                    n_estimators=300,
                    max_depth=12,
                    random_state=seed,
                    class_weight="balanced_subsample",
                    n_jobs=-1,
                ),
            ),
        ]
    )
    model.fit(X_train, y_train)
    pred = model.predict(X_test)

    metrics = {
        "task": "check_overall_level",
        "rows": int(len(df)),
        "features": feature_cols,
        "accuracy": round(float(accuracy_score(y_test, pred)), 4),
        "macro_f1": round(float(f1_score(y_test, pred, average="macro")), 4),
        "weighted_f1": round(float(f1_score(y_test, pred, average="weighted")), 4),
        "report": classification_report(y_test, pred, output_dict=True, zero_division=0),
    }

    model_path = MODEL_DIR / "baseline_check_overall_level.joblib"
    joblib.dump(model, model_path)
    return metrics


def _train_monitor(seed: int) -> dict:
    path = DATA_DIR / "healthcheck_monitor_synth.csv"
    df = pd.read_csv(path)

    feature_cols_num = [
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
    target_col = "trend_label"

    X = df[feature_cols_num]
    y = df[target_col]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=seed, stratify=y
    )

    model = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "clf",
                RandomForestClassifier(
                    n_estimators=300,
                    max_depth=10,
                    random_state=seed,
                    class_weight="balanced_subsample",
                    n_jobs=-1,
                ),
            ),
        ]
    )
    model.fit(X_train, y_train)
    pred = model.predict(X_test)

    metrics = {
        "task": "monitor_trend_label",
        "rows": int(len(df)),
        "features": feature_cols_num,
        "accuracy": round(float(accuracy_score(y_test, pred)), 4),
        "macro_f1": round(float(f1_score(y_test, pred, average="macro")), 4),
        "weighted_f1": round(float(f1_score(y_test, pred, average="weighted")), 4),
        "report": classification_report(y_test, pred, output_dict=True, zero_division=0),
    }

    model_path = MODEL_DIR / "baseline_monitor_trend_label.joblib"
    joblib.dump(model, model_path)
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Train baseline models on synthetic datasets.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed.")
    args = parser.parse_args()

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    check_metrics = _train_check(args.seed)
    monitor_metrics = _train_monitor(args.seed)

    summary = {"seed": args.seed, "check": check_metrics, "monitor": monitor_metrics}
    out_json = REPORT_DIR / "baseline_metrics.json"
    out_txt = REPORT_DIR / "baseline_metrics_summary.txt"

    out_json.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    out_txt.write_text(
        (
            f"seed: {args.seed}\n"
            f"check_accuracy: {check_metrics['accuracy']}\n"
            f"check_macro_f1: {check_metrics['macro_f1']}\n"
            f"monitor_accuracy: {monitor_metrics['accuracy']}\n"
            f"monitor_macro_f1: {monitor_metrics['macro_f1']}\n"
        ),
        encoding="utf-8",
    )

    print(f"[ok] model: {MODEL_DIR / 'baseline_check_overall_level.joblib'}")
    print(f"[ok] model: {MODEL_DIR / 'baseline_monitor_trend_label.joblib'}")
    print(f"[ok] metrics: {out_json}")
    print(f"[ok] summary: {out_txt}")


if __name__ == "__main__":
    main()
