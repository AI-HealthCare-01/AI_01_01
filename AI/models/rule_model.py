import json
from pathlib import Path


MODEL_PATH = Path(__file__).with_name("rule_model_v1.json")


def _bucketize(value: float, cuts: list[float]) -> int:
    if value <= cuts[0]:
        return 0
    if value <= cuts[1]:
        return 1
    if value <= cuts[2]:
        return 2
    if value <= cuts[3]:
        return 3
    return 4


def load_config() -> dict:
    return json.loads(MODEL_PATH.read_text(encoding="utf-8"))


def predict_check(record: dict, config: dict | None = None) -> dict:
    cfg = config or load_config()
    cuts = cfg["check_thresholds"]

    dep = _bucketize(float(record["phq_total"]), cuts["phq_total"])
    anx = _bucketize(float(record["gad_total"]), cuts["gad_total"])
    slp = _bucketize(float(record["sleep_total"]), cuts["sleep_total"])
    overall = max(dep, anx, slp)

    return {
        "depression_severity_level": dep,
        "anxiety_severity_level": anx,
        "insomnia_severity_level": slp,
        "overall_level": overall,
    }


def predict_monitor(record: dict, config: dict | None = None) -> dict:
    cfg = config or load_config()
    th = cfg["monitor_thresholds"]

    phq_delta = float(record["phq_delta"])
    gad_delta = float(record["gad_delta"])
    mood_delta = float(record.get("mood_delta", 0.0))
    sleep_delta = float(record["sleep_delta"])

    worsening = (
        phq_delta >= th["worsening_delta"]
        or gad_delta >= th["worsening_delta"]
        or (mood_delta <= -1.0 and sleep_delta >= 1.0)
    )
    improving = phq_delta <= th["improving_delta"] or gad_delta <= th["improving_delta"]

    if worsening:
        trend = "worsening"
    elif improving:
        trend = "improving"
    else:
        trend = "stable"

    rapid = phq_delta >= th["rapid_worsening_delta"] or gad_delta >= th["rapid_worsening_delta"]
    missing_days = float(record["checkin_missing_days"])
    window_days = float(record["window_days"])
    dropout = (missing_days / max(window_days, 1.0)) >= th["dropout_missing_ratio"]
    sleep_collapse = (
        float(record["sleep_last"]) >= th["sleep_collapse_last"]
        or sleep_delta >= th["sleep_collapse_delta"]
    )
    high_risk = float(record["phq_last"]) >= th["high_risk_phq_last"] or rapid

    return {
        "trend_label": trend,
        "flag_rapid_worsening": rapid,
        "flag_dropout_risk": dropout,
        "flag_sleep_collapse": sleep_collapse,
        "flag_high_risk_message": high_risk,
    }
