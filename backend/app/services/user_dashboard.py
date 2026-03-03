from __future__ import annotations

from collections import defaultdict
import json
from datetime import date
import logging
from typing import Any
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Assessment, AssessmentType, ChatEvent, CheckIn

logger = logging.getLogger(__name__)


def _mean(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def _weighted_score(pairs: list[tuple[float | None, float]]) -> float | None:
    numer = 0.0
    denom = 0.0
    for value, weight in pairs:
        if value is None:
            continue
        numer += value * weight
        denom += weight
    if denom == 0:
        return None
    return numer / denom


def _severity_bucket(score: float) -> str:
    if score < 25:
        return "minimal"
    if score < 50:
        return "mild"
    if score < 75:
        return "moderate"
    return "severe"


def _sleep_penalty(sleep_hours: float | None) -> float | None:
    if sleep_hours is None:
        return None
    diff = abs(sleep_hours - 7.5)
    return min(100.0, (diff / 4.5) * 100.0)


def _kalman_update(
    prev_state: float | None,
    prev_var: float | None,
    measurement: float,
    measurement_var: float,
    process_noise: float,
) -> tuple[float, float, bool]:
    if prev_state is None or prev_var is None:
        # 초기화 시점은 관측값으로 시작
        return measurement, max(1.0, measurement_var), False

    pred_state = prev_state
    pred_var = max(1.0, prev_var) + max(0.1, process_noise)
    k_gain = pred_var / (pred_var + max(1.0, measurement_var))
    updated_state = pred_state + k_gain * (measurement - pred_state)
    updated_var = (1.0 - k_gain) * pred_var
    return updated_state, max(1.0, updated_var), True


def _parse_checkin_note(raw_note: str | None) -> tuple[int, int]:
    if not raw_note:
        return 0, 0
    try:
        parsed = json.loads(raw_note)
        if isinstance(parsed, dict):
            completed = int(parsed.get("challenge_completed_count") or 0)
            total = int(parsed.get("challenge_total_count") or 0)
            return max(0, completed), max(0, total)
    except Exception:
        pass
    return 0, 0


def _apply_alert_rules(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    prev_dep = None
    prev_anx = None
    prev_ins = None

    for row in rows:
        dep = row["dep_week_pred_0_100"]
        anx = row["anx_week_pred_0_100"]
        ins = row["ins_week_pred_0_100"]

        row["dep_week_delta"] = None if prev_dep is None else dep - prev_dep
        row["anx_week_delta"] = None if prev_anx is None else anx - prev_anx
        row["ins_week_delta"] = None if prev_ins is None else ins - prev_ins

        row["dep_severity"] = _severity_bucket(dep)
        row["anx_severity"] = _severity_bucket(anx)
        row["ins_severity"] = _severity_bucket(ins)

        dep_jump = (row["dep_week_delta"] or 0) >= 5
        anx_jump = (row["anx_week_delta"] or 0) >= 5
        ins_jump = (row["ins_week_delta"] or 0) >= 5
        rule_week_delta_worsen = dep_jump or anx_jump or ins_jump

        rule_any_severe = any(x == "severe" for x in [row["dep_severity"], row["anx_severity"], row["ins_severity"]])
        rule_composite_high = row["symptom_composite_pred_0_100"] >= 65

        row["rule_week_delta_worsen"] = int(rule_week_delta_worsen)
        row["rule_any_severe"] = int(rule_any_severe)
        row["rule_composite_high"] = int(rule_composite_high)

        score = row["rule_week_delta_worsen"] * 1 + row["rule_any_severe"] * 2 + row["rule_composite_high"] * 2
        row["alert_risk_score"] = score
        row["alert_flag"] = int(score >= 2)
        row["alert_level"] = "high" if score >= 4 else ("medium" if score >= 2 else "low")

        reasons = []
        if rule_week_delta_worsen:
            reasons.append("worsening_delta")
        if rule_any_severe:
            reasons.append("severe_band")
        if rule_composite_high:
            reasons.append("high_composite")
        row["alert_reason_codes"] = "|".join(reasons)

        prev_dep, prev_anx, prev_ins = dep, anx, ins

    return rows


async def build_user_weekly_dashboard(db: AsyncSession, user_id: UUID) -> list[dict[str, Any]]:
    checkins_stmt: Select[tuple[CheckIn]] = select(CheckIn).where(CheckIn.user_id == user_id)
    chats_stmt: Select[tuple[ChatEvent]] = select(ChatEvent).where(ChatEvent.user_id == user_id)
    assessments_stmt: Select[tuple[Assessment]] = select(Assessment).where(
        Assessment.user_id == user_id,
        Assessment.type == AssessmentType.PHQ9,
    )

    checkins = list((await db.execute(checkins_stmt)).scalars().all())
    chats = list((await db.execute(chats_stmt)).scalars().all())
    assessments = list((await db.execute(assessments_stmt)).scalars().all())

    day_data: dict[date, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))

    for row in checkins:
        d = row.created_at.date()
        day_data[d]["mood"].append(float(row.mood_score))
        if row.sleep_hours is not None:
            day_data[d]["sleep_hours"].append(float(row.sleep_hours))

        completed, total = _parse_checkin_note(row.note)
        if total > 0:
            day_data[d]["challenge_completion_rate"].append(min(1.0, completed / total))
        elif row.exercised:
            day_data[d]["challenge_completion_rate"].append(1.0)
        else:
            day_data[d]["challenge_completion_rate"].append(0.0)

    for row in chats:
        d = row.created_at.date()
        extracted = row.extracted or {}
        if isinstance(extracted, dict):
            if extracted.get("distress_0_10") is not None:
                day_data[d]["distress"].append(float(extracted["distress_0_10"]))
            if extracted.get("rumination_0_10") is not None:
                day_data[d]["rumination"].append(float(extracted["rumination_0_10"]))
            if extracted.get("sleep_difficulty_0_10") is not None:
                day_data[d]["sleep_difficulty"].append(float(extracted["sleep_difficulty_0_10"]))

            distortion = extracted.get("distortion")
            if isinstance(distortion, dict):
                total = 0.0
                for value in distortion.values():
                    try:
                        total += float(value)
                    except Exception:
                        continue
                day_data[d]["distortion_total"].append(total)

    for row in assessments:
        d = row.created_at.date()
        day_data[d]["phq_total"].append(float(row.total_score))

    if not day_data:
        logger.warning("dashboard_nowcast_empty user_id=%s reason=no_day_data", user_id)
        return []

    carry_phq_scaled: float | None = None
    dep_prev_state: float | None = None
    anx_prev_state: float | None = None
    dep_prev_var: float | None = None
    anx_prev_var: float | None = None
    day_scores: list[dict[str, Any]] = []

    for d in sorted(day_data.keys()):
        m = _mean(day_data[d].get("mood", []))
        sleep_hours = _mean(day_data[d].get("sleep_hours", []))
        distress = _mean(day_data[d].get("distress", []))
        rumination = _mean(day_data[d].get("rumination", []))
        sleep_diff = _mean(day_data[d].get("sleep_difficulty", []))
        distortion_total = _mean(day_data[d].get("distortion_total", []))
        challenge_completion = _mean(day_data[d].get("challenge_completion_rate", []))
        phq = _mean(day_data[d].get("phq_total", []))

        if phq is not None:
            carry_phq_scaled = (phq / 27.0) * 100.0

        mood_inverse = None if m is None else (10.0 - m) * 10.0
        distress_scaled = None if distress is None else distress * 10.0
        rum_scaled = None if rumination is None else rumination * 10.0
        sleep_diff_scaled = None if sleep_diff is None else sleep_diff * 10.0
        distortion_scaled = None if distortion_total is None else min(100.0, distortion_total * 12.0)
        sleep_pen = _sleep_penalty(sleep_hours)
        dep_proxy_components_used = sum(
            x is not None for x in [mood_inverse, rum_scaled, distortion_scaled]
        )
        anx_proxy_components_used = sum(
            x is not None for x in [distress_scaled, rum_scaled, mood_inverse, distortion_scaled]
        )
        dep_proxy_0_100 = _weighted_score([
            (mood_inverse, 0.45),
            (rum_scaled, 0.35),
            (distortion_scaled, 0.2),
        ])
        anx_proxy_0_100 = _weighted_score([
            (distress_scaled, 0.5),
            (rum_scaled, 0.25),
            (mood_inverse, 0.15),
            (distortion_scaled, 0.1),
        ])
        dep_measurement_source = (
            "phq_observed" if phq is not None else ("carry_forward" if carry_phq_scaled is not None else "baseline_init")
        )
        anx_measurement_source = "proxy_only"
        dep_measurement_var = (
            16.0 if dep_measurement_source == "phq_observed" else (36.0 if dep_measurement_source == "carry_forward" else 64.0)
        ) + float(max(0, 3 - dep_proxy_components_used) * 8)
        anx_measurement_var = 24.0 + float(max(0, 4 - anx_proxy_components_used) * 8)

        dep_raw = _weighted_score([
            (carry_phq_scaled, 0.45),
            (mood_inverse, 0.25),
            (rum_scaled, 0.2),
            (distortion_scaled, 0.1),
        ])
        anx_raw = _weighted_score([
            (distress_scaled, 0.45),
            (rum_scaled, 0.25),
            (mood_inverse, 0.2),
            (distortion_scaled, 0.1),
        ])
        ins_raw = _weighted_score([
            (sleep_diff_scaled, 0.6),
            (sleep_pen, 0.4),
        ])

        dep_measurement_0_100 = dep_raw if dep_raw is not None else 50.0
        anx_measurement_0_100 = anx_raw if anx_raw is not None else 50.0
        ins = ins_raw if ins_raw is not None else 50.0

        if challenge_completion is not None:
            dep_measurement_0_100 = dep_measurement_0_100 - challenge_completion * 12.0
            anx_measurement_0_100 = anx_measurement_0_100 - challenge_completion * 10.0
            ins = ins - challenge_completion * 6.0

        dep_measurement_0_100 = max(0.0, min(100.0, dep_measurement_0_100))
        anx_measurement_0_100 = max(0.0, min(100.0, anx_measurement_0_100))
        ins = max(0.0, min(100.0, ins))
        dep_kalman_process_noise = 8.0 + float(max(0, 3 - dep_proxy_components_used) * 2)
        anx_kalman_process_noise = 10.0 + float(max(0, 4 - anx_proxy_components_used) * 2)
        dep_kalman_measurement_noise = dep_measurement_var
        anx_kalman_measurement_noise = anx_measurement_var

        dep, dep_var, dep_kalman_update_called = _kalman_update(
            dep_prev_state,
            dep_prev_var,
            dep_measurement_0_100,
            dep_measurement_var,
            dep_kalman_process_noise,
        )
        anx, anx_var, anx_kalman_update_called = _kalman_update(
            anx_prev_state,
            anx_prev_var,
            anx_measurement_0_100,
            anx_measurement_var,
            anx_kalman_process_noise,
        )
        dep = max(0.0, min(100.0, dep))
        anx = max(0.0, min(100.0, anx))
        dep_prev_state, dep_prev_var = dep, dep_var
        anx_prev_state, anx_prev_var = anx, anx_var
        dep_state_final_method = "kalman_update" if dep_kalman_update_called else "baseline_init"
        anx_state_final_method = "kalman_update" if anx_kalman_update_called else "baseline_init"

        day_scores.append(
            {
                "date": d,
                "dep": max(0.0, min(100.0, dep)),
                "anx": max(0.0, min(100.0, anx)),
                "ins": max(0.0, min(100.0, ins)),
                "dep_measurement_source": dep_measurement_source,
                "dep_proxy_0_100": dep_proxy_0_100,
                "dep_proxy_components_used": dep_proxy_components_used,
                "dep_measurement_0_100": dep_measurement_0_100,
                "dep_measurement_var": dep_measurement_var,
                "dep_kalman_update_called": dep_kalman_update_called,
                "dep_kalman_process_noise": dep_kalman_process_noise,
                "dep_kalman_measurement_noise": dep_kalman_measurement_noise,
                "dep_state_final_0_100_today": dep,
                "dep_state_final_method": dep_state_final_method,
                "anx_measurement_source": anx_measurement_source,
                "anx_proxy_0_100": anx_proxy_0_100,
                "anx_proxy_components_used": anx_proxy_components_used,
                "anx_measurement_0_100": anx_measurement_0_100,
                "anx_measurement_var": anx_measurement_var,
                "anx_kalman_update_called": anx_kalman_update_called,
                "anx_kalman_process_noise": anx_kalman_process_noise,
                "anx_kalman_measurement_noise": anx_kalman_measurement_noise,
                "anx_state_final_0_100_today": anx,
                "anx_state_final_method": anx_state_final_method,
            }
        )
        logger.warning(
            "dashboard_nowcast_day user_id=%s date=%s dep_measurement_source=%s dep_proxy_0_100=%s dep_proxy_components_used=%s "
            "dep_measurement_0_100=%s dep_measurement_var=%s dep_kalman_update_called=%s dep_state_final_method=%s dep_state_final_0_100_today=%s "
            "anx_proxy_0_100=%s anx_proxy_components_used=%s anx_measurement_0_100=%s anx_measurement_var=%s anx_kalman_update_called=%s anx_state_final_method=%s anx_state_final_0_100_today=%s",
            user_id,
            d,
            dep_measurement_source,
            None if dep_proxy_0_100 is None else round(dep_proxy_0_100, 2),
            dep_proxy_components_used,
            round(dep_measurement_0_100, 2),
            round(dep_measurement_var, 2),
            dep_kalman_update_called,
            dep_state_final_method,
            round(dep, 2),
            None if anx_proxy_0_100 is None else round(anx_proxy_0_100, 2),
            anx_proxy_components_used,
            round(anx_measurement_0_100, 2),
            round(anx_measurement_var, 2),
            anx_kalman_update_called,
            anx_state_final_method,
            round(anx, 2),
        )

    rows: list[dict[str, Any]] = []
    for row in sorted(day_scores, key=lambda x: x["date"]):
        dep_score = row["dep"]
        anx_score = row["anx"]
        ins_score = row["ins"]
        composite = (dep_score + anx_score + ins_score) / 3.0

        rows.append(
            {
                "week_start_date": str(row["date"]),
                "dep_week_pred_0_100": dep_score,
                "anx_week_pred_0_100": anx_score,
                "ins_week_pred_0_100": ins_score,
                "symptom_composite_pred_0_100": composite,
                "active_days": 1,
                "dep_measurement_source": row.get("dep_measurement_source"),
                "dep_proxy_0_100": row.get("dep_proxy_0_100"),
                "dep_proxy_components_used": row.get("dep_proxy_components_used"),
                "dep_measurement_0_100": row.get("dep_measurement_0_100"),
                "dep_measurement_var": row.get("dep_measurement_var"),
                "dep_kalman_update_called": row.get("dep_kalman_update_called"),
                "dep_kalman_process_noise": row.get("dep_kalman_process_noise"),
                "dep_kalman_measurement_noise": row.get("dep_kalman_measurement_noise"),
                "dep_state_final_0_100_today": row.get("dep_state_final_0_100_today"),
                "dep_state_final_method": row.get("dep_state_final_method"),
                "anx_measurement_source": row.get("anx_measurement_source"),
                "anx_proxy_0_100": row.get("anx_proxy_0_100"),
                "anx_proxy_components_used": row.get("anx_proxy_components_used"),
                "anx_measurement_0_100": row.get("anx_measurement_0_100"),
                "anx_measurement_var": row.get("anx_measurement_var"),
                "anx_kalman_update_called": row.get("anx_kalman_update_called"),
                "anx_kalman_process_noise": row.get("anx_kalman_process_noise"),
                "anx_kalman_measurement_noise": row.get("anx_kalman_measurement_noise"),
                "anx_state_final_0_100_today": row.get("anx_state_final_0_100_today"),
                "anx_state_final_method": row.get("anx_state_final_method"),
            }
        )

    return _apply_alert_rules(rows)
