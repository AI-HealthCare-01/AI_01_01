import argparse
import csv
import math
import random
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"


CHECK_FIELDS = [
    "user_id",
    "submitted_at",
    "phq1_anhedonia",
    "phq2_depressed_mood",
    "phq3_sleep",
    "phq4_fatigue",
    "phq5_appetite",
    "phq6_worthlessness",
    "phq7_concentration",
    "phq8_psychomotor",
    "phq9_suicidal_ideation",
    "phq_total",
    "gad1_nervous",
    "gad2_uncontrollable_worry",
    "gad3_excessive_worry",
    "gad4_trouble_relaxing",
    "gad5_restlessness",
    "gad6_irritability",
    "gad7_fear",
    "gad_total",
    "sleep_onset_difficulty",
    "sleep_maintenance_difficulty",
    "daytime_impairment_sleep",
    "sleep_total",
    "daily_functioning",
    "stressful_event",
    "social_support",
    "coping_skill",
    "motivation_for_change",
    "context_risk_total",
    "depression_severity_level",
    "anxiety_severity_level",
    "insomnia_severity_level",
    "overall_level",
    "overall_risk_proba",
    "top_factors",
]

MONITOR_FIELDS = [
    "user_id",
    "window_days",
    "computed_at",
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
    "trend_label",
    "deterioration_risk_proba",
    "flag_rapid_worsening",
    "flag_dropout_risk",
    "flag_sleep_collapse",
    "flag_high_risk_message",
]


def _bucketize(value: int, cuts: tuple[int, int, int, int]) -> int:
    if value <= cuts[0]:
        return 0
    if value <= cuts[1]:
        return 1
    if value <= cuts[2]:
        return 2
    if value <= cuts[3]:
        return 3
    return 4


def _score_0_to_3(risk: float, jitter: float = 0.6) -> int:
    r = max(0.0, min(1.0, risk + random.uniform(-jitter, jitter) * 0.15))
    if r < 0.2:
        return 0
    if r < 0.45:
        return 1
    if r < 0.7:
        return 2
    return 3


def _iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat()


def generate_check_rows(user_count: int) -> list[dict]:
    now = datetime.now(timezone.utc)
    rows: list[dict] = []

    for i in range(1, user_count + 1):
        user_id = f"U{i:05d}"
        base_risk = min(0.95, max(0.05, random.betavariate(2.2, 3.2)))
        session_count = random.randint(6, 18)

        for _ in range(session_count):
            days_ago = random.randint(0, 180)
            submitted_at = now - timedelta(days=days_ago, hours=random.randint(0, 23))

            event_shock = random.uniform(-0.25, 0.35)
            active_risk = min(0.99, max(0.01, base_risk + event_shock))

            phq = [
                _score_0_to_3(active_risk, 0.75),
                _score_0_to_3(active_risk, 0.75),
                _score_0_to_3(active_risk + 0.05, 0.75),
                _score_0_to_3(active_risk + 0.03, 0.75),
                _score_0_to_3(active_risk, 0.75),
                _score_0_to_3(active_risk + 0.02, 0.75),
                _score_0_to_3(active_risk, 0.75),
                _score_0_to_3(active_risk, 0.75),
                _score_0_to_3(active_risk + 0.08, 0.9),
            ]
            phq_total = sum(phq)

            gad = [
                _score_0_to_3(active_risk, 0.7),
                _score_0_to_3(active_risk + 0.03, 0.7),
                _score_0_to_3(active_risk, 0.7),
                _score_0_to_3(active_risk + 0.02, 0.7),
                _score_0_to_3(active_risk, 0.7),
                _score_0_to_3(active_risk - 0.02, 0.7),
                _score_0_to_3(active_risk + 0.04, 0.7),
            ]
            gad_total = sum(gad)

            sleep = [
                _score_0_to_3(active_risk + 0.04, 0.65),
                _score_0_to_3(active_risk + 0.02, 0.65),
                _score_0_to_3(active_risk + 0.05, 0.65),
            ]
            sleep_total = sum(sleep)

            context = [
                _score_0_to_3(active_risk + 0.02, 0.65),
                _score_0_to_3(active_risk + 0.08, 0.65),
                _score_0_to_3(active_risk, 0.65),
                _score_0_to_3(active_risk + 0.03, 0.65),
                _score_0_to_3(active_risk - 0.05, 0.65),
            ]
            context_total = sum(context)

            dep_level = _bucketize(phq_total, (4, 9, 14, 19))
            anx_level = _bucketize(gad_total, (4, 9, 14, 17))
            sleep_level = _bucketize(sleep_total, (1, 3, 5, 7))
            overall_level = max(dep_level, anx_level, sleep_level)

            risk_linear = (
                (phq_total / 27.0) * 0.5
                + (gad_total / 21.0) * 0.3
                + (sleep_total / 9.0) * 0.1
                + (context_total / 15.0) * 0.1
            )
            risk_linear = max(0.0, min(1.0, risk_linear))

            factors = {
                "sleep": sleep_total / 9.0,
                "depression": phq_total / 27.0,
                "anxiety": gad_total / 21.0,
                "context": context_total / 15.0,
            }
            top_factors = ",".join([k for k, _ in sorted(factors.items(), key=lambda x: x[1], reverse=True)[:2]])

            rows.append(
                {
                    "user_id": user_id,
                    "submitted_at": _iso(submitted_at),
                    "phq1_anhedonia": phq[0],
                    "phq2_depressed_mood": phq[1],
                    "phq3_sleep": phq[2],
                    "phq4_fatigue": phq[3],
                    "phq5_appetite": phq[4],
                    "phq6_worthlessness": phq[5],
                    "phq7_concentration": phq[6],
                    "phq8_psychomotor": phq[7],
                    "phq9_suicidal_ideation": phq[8],
                    "phq_total": phq_total,
                    "gad1_nervous": gad[0],
                    "gad2_uncontrollable_worry": gad[1],
                    "gad3_excessive_worry": gad[2],
                    "gad4_trouble_relaxing": gad[3],
                    "gad5_restlessness": gad[4],
                    "gad6_irritability": gad[5],
                    "gad7_fear": gad[6],
                    "gad_total": gad_total,
                    "sleep_onset_difficulty": sleep[0],
                    "sleep_maintenance_difficulty": sleep[1],
                    "daytime_impairment_sleep": sleep[2],
                    "sleep_total": sleep_total,
                    "daily_functioning": context[0],
                    "stressful_event": context[1],
                    "social_support": context[2],
                    "coping_skill": context[3],
                    "motivation_for_change": context[4],
                    "context_risk_total": context_total,
                    "depression_severity_level": dep_level,
                    "anxiety_severity_level": anx_level,
                    "insomnia_severity_level": sleep_level,
                    "overall_level": overall_level,
                    "overall_risk_proba": round(risk_linear, 4),
                    "top_factors": top_factors,
                }
            )

    rows.sort(key=lambda x: (x["user_id"], x["submitted_at"]))
    return rows


def _safe_mean(values: list[float], default: float = 0.0) -> float:
    return sum(values) / len(values) if values else default


def generate_monitor_rows(check_rows: list[dict]) -> list[dict]:
    now = datetime.now(timezone.utc)
    by_user: dict[str, list[dict]] = defaultdict(list)
    for r in check_rows:
        by_user[r["user_id"]].append(r)

    for uid in by_user:
        by_user[uid].sort(key=lambda x: x["submitted_at"])

    rows: list[dict] = []
    windows = [7, 14, 28]

    for uid, items in by_user.items():
        parsed = []
        for row in items:
            parsed.append(
                {
                    **row,
                    "_ts": datetime.fromisoformat(row["submitted_at"]),
                    "phq_total": float(row["phq_total"]),
                    "gad_total": float(row["gad_total"]),
                    "sleep_total": float(row["sleep_total"]),
                    "context_risk_total": float(row["context_risk_total"]),
                }
            )

        latest = parsed[-1]
        for wd in windows:
            start = now - timedelta(days=wd)
            prev_start = now - timedelta(days=2 * wd)

            cur = [x for x in parsed if x["_ts"] >= start]
            prev = [x for x in parsed if prev_start <= x["_ts"] < start]

            phq_avg = _safe_mean([x["phq_total"] for x in cur], latest["phq_total"])
            phq_prev = _safe_mean([x["phq_total"] for x in prev], phq_avg)
            phq_delta = phq_avg - phq_prev

            gad_avg = _safe_mean([x["gad_total"] for x in cur], latest["gad_total"])
            gad_prev = _safe_mean([x["gad_total"] for x in prev], gad_avg)
            gad_delta = gad_avg - gad_prev

            sleep_avg = _safe_mean([x["sleep_total"] for x in cur], latest["sleep_total"])
            sleep_prev = _safe_mean([x["sleep_total"] for x in prev], sleep_avg)
            sleep_delta = sleep_avg - sleep_prev

            context_avg = _safe_mean([x["context_risk_total"] for x in cur], latest["context_risk_total"])
            context_prev = _safe_mean([x["context_risk_total"] for x in prev], context_avg)
            context_delta = context_avg - context_prev

            mood_avg = max(1.0, min(10.0, 10.2 - 0.28 * phq_avg - 0.12 * gad_avg + random.uniform(-0.6, 0.6)))
            mood_prev = max(1.0, min(10.0, mood_avg - random.uniform(-1.5, 1.5)))
            mood_delta = mood_avg - mood_prev
            mood_std = max(0.2, min(3.5, abs(random.gauss(1.1 + phq_avg / 20.0, 0.4))))
            sleep_std = max(0.2, min(2.8, abs(random.gauss(0.9 + sleep_avg / 8.0, 0.35))))
            worst_mood = max(1.0, mood_avg - random.uniform(0.8, 3.0))
            max_drop = max(0.2, random.uniform(1.0, 5.0))

            checkin_count = max(0, min(wd, int(round(wd * random.uniform(0.35, 0.95)))))
            missing_days = wd - checkin_count
            exercise_days = max(0, min(wd, int(round(checkin_count * random.uniform(0.2, 0.7)))))
            journal_days = max(0, min(wd, int(round(checkin_count * random.uniform(0.2, 0.8)))))

            worsening = phq_delta >= 3.0 or gad_delta >= 3.0 or (mood_delta <= -1.0 and sleep_delta >= 1.0)
            improving = phq_delta <= -3.0 or gad_delta <= -3.0
            if worsening:
                trend = "worsening"
            elif improving:
                trend = "improving"
            else:
                trend = "stable"

            risk_raw = (
                max(phq_delta, 0.0) * 0.10
                + max(gad_delta, 0.0) * 0.09
                + max(sleep_delta, 0.0) * 0.07
                + (missing_days / max(wd, 1)) * 0.35
                + (mood_std / 4.0) * 0.15
                + random.uniform(0.0, 0.08)
            )
            deterioration = max(0.0, min(1.0, risk_raw))

            rapid = phq_delta >= 5.0 or gad_delta >= 5.0
            dropout = (missing_days / max(wd, 1)) >= 0.5
            sleep_collapse = latest["sleep_total"] >= 7.0 or sleep_delta >= 2.0
            high_risk = latest["phq_total"] >= 20.0 or rapid

            rows.append(
                {
                    "user_id": uid,
                    "window_days": wd,
                    "computed_at": _iso(now),
                    "phq_last": round(latest["phq_total"], 3),
                    "phq_avg_window": round(phq_avg, 3),
                    "phq_delta": round(phq_delta, 3),
                    "gad_last": round(latest["gad_total"], 3),
                    "gad_avg_window": round(gad_avg, 3),
                    "gad_delta": round(gad_delta, 3),
                    "sleep_last": round(latest["sleep_total"], 3),
                    "sleep_avg_window": round(sleep_avg, 3),
                    "sleep_delta": round(sleep_delta, 3),
                    "context_risk_last": round(latest["context_risk_total"], 3),
                    "context_risk_delta": round(context_delta, 3),
                    "mood_avg_window": round(mood_avg, 3),
                    "mood_delta": round(mood_delta, 3),
                    "mood_std_window": round(mood_std, 3),
                    "sleep_std_window": round(sleep_std, 3),
                    "worst_mood_7d": round(worst_mood, 3),
                    "max_drop_mood": round(max_drop, 3),
                    "checkin_count_window": checkin_count,
                    "checkin_missing_days": missing_days,
                    "exercise_days_window": exercise_days,
                    "journal_days_window": journal_days,
                    "trend_label": trend,
                    "deterioration_risk_proba": round(deterioration, 4),
                    "flag_rapid_worsening": int(rapid),
                    "flag_dropout_risk": int(dropout),
                    "flag_sleep_collapse": int(sleep_collapse),
                    "flag_high_risk_message": int(high_risk),
                }
            )

    rows.sort(key=lambda x: (x["user_id"], x["window_days"]))
    return rows


def write_csv(path: Path, fields: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic healthcheck datasets.")
    parser.add_argument("--users", type=int, default=250, help="Number of synthetic users.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed.")
    args = parser.parse_args()

    random.seed(args.seed)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    check_rows = generate_check_rows(args.users)
    monitor_rows = generate_monitor_rows(check_rows)

    check_path = DATA_DIR / "healthcheck_check_synth.csv"
    monitor_path = DATA_DIR / "healthcheck_monitor_synth.csv"
    write_csv(check_path, CHECK_FIELDS, check_rows)
    write_csv(monitor_path, MONITOR_FIELDS, monitor_rows)

    print(f"[ok] check rows: {len(check_rows)} -> {check_path}")
    print(f"[ok] monitor rows: {len(monitor_rows)} -> {monitor_path}")


if __name__ == "__main__":
    main()
