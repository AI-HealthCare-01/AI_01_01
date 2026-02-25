from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy import Select, and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import crud
from app.db.models import ChatEvent, CheckIn
from app.schemas.report import (
    ClinicalBehaviorSummary,
    ClinicalReportResponse,
    ClinicalRiskItem,
    ClinicalScoreSummary,
)
from app.services.user_dashboard import build_user_weekly_dashboard


def _mean(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


async def build_clinical_report(
    db: AsyncSession,
    user_id: UUID,
    period_start: date,
    period_end: date,
) -> ClinicalReportResponse:
    assessments = await crud.list_phq9_assessments_by_user(db, user_id)
    in_period_assess = [a for a in assessments if period_start <= a.created_at.date() <= period_end]

    checkin_stmt: Select[tuple[CheckIn]] = select(CheckIn).where(
        CheckIn.user_id == user_id,
        and_(CheckIn.created_at >= datetime.combine(period_start, datetime.min.time(), tzinfo=UTC), CheckIn.created_at <= datetime.combine(period_end, datetime.max.time(), tzinfo=UTC)),
    )
    checkins = list((await db.execute(checkin_stmt)).scalars().all())

    chat_stmt: Select[tuple[ChatEvent]] = select(ChatEvent).where(
        ChatEvent.user_id == user_id,
        and_(ChatEvent.created_at >= datetime.combine(period_start, datetime.min.time(), tzinfo=UTC), ChatEvent.created_at <= datetime.combine(period_end, datetime.max.time(), tzinfo=UTC)),
    )
    chats = list((await db.execute(chat_stmt)).scalars().all())

    rows = await build_user_weekly_dashboard(db, user_id)
    in_period_rows = [r for r in rows if period_start <= date.fromisoformat(str(r.get('week_start_date'))) <= period_end]
    latest = in_period_rows[-1] if in_period_rows else None
    prev = in_period_rows[-2] if len(in_period_rows) > 1 else None

    score_summary = ClinicalScoreSummary(
        composite_latest=float(latest['symptom_composite_pred_0_100']) if latest else None,
        dep_latest=float(latest['dep_week_pred_0_100']) if latest else None,
        anx_latest=float(latest['anx_week_pred_0_100']) if latest else None,
        ins_latest=float(latest['ins_week_pred_0_100']) if latest else None,
        composite_delta=(float(latest['symptom_composite_pred_0_100']) - float(prev['symptom_composite_pred_0_100'])) if latest and prev else None,
    )

    sleep_vals = [float(c.sleep_hours) for c in checkins if c.sleep_hours is not None]
    mood_vals = [float(c.mood_score) for c in checkins]

    distortion_vals: list[float] = []
    for c in chats:
        ex = c.extracted or {}
        dist = ex.get('distortion') if isinstance(ex, dict) else None
        if isinstance(dist, dict):
            total = 0.0
            for v in dist.values():
                try:
                    total += float(v)
                except Exception:
                    continue
            distortion_vals.append(total)

    behavior = ClinicalBehaviorSummary(
        avg_sleep_hours=_mean(sleep_vals),
        avg_mood_score=_mean(mood_vals),
        checkin_days=len({c.created_at.date() for c in checkins}),
        cbt_sessions=len(chats),
        distortion_total_mean=_mean(distortion_vals),
    )

    risk_flags: list[ClinicalRiskItem] = []

    if latest and latest.get('alert_level') == 'high':
        risk_flags.append(
            ClinicalRiskItem(
                code='HIGH_ALERT',
                title='고위험 알림 구간',
                detail=f"최근 composite가 {float(latest['symptom_composite_pred_0_100']):.1f}로 높습니다.",
            )
        )

    if score_summary.composite_delta is not None and score_summary.composite_delta >= 5:
        risk_flags.append(
            ClinicalRiskItem(
                code='WORSENING_TREND',
                title='증상 점수 상승 추세',
                detail=f"기간 내 composite 변화량이 +{score_summary.composite_delta:.1f}입니다.",
            )
        )

    if in_period_assess:
        latest_assess = in_period_assess[0]
        q9 = int((latest_assess.answers or {}).get('q9', 0))
        if q9 >= 2:
            risk_flags.append(
                ClinicalRiskItem(
                    code='SUICIDAL_IDEATION_SIGNAL',
                    title='자해/자살사고 문항 주의',
                    detail=f"최근 PHQ-9 9번 문항 점수가 {q9}점으로 관찰됩니다.",
                )
            )

    if behavior.avg_sleep_hours is not None and behavior.avg_sleep_hours < 5.5:
        risk_flags.append(
            ClinicalRiskItem(
                code='SLEEP_DEPRIVATION',
                title='수면 부족 경향',
                detail=f"기간 평균 수면시간이 {behavior.avg_sleep_hours:.1f}시간으로 낮습니다.",
            )
        )

    summary_text = (
        f"{period_start} ~ {period_end} 기간 동안 "
        f"체크인 {behavior.checkin_days}일, CBT 대화 {behavior.cbt_sessions}회가 기록되었습니다. "
        f"최근 종합 점수는 {score_summary.composite_latest:.1f}점입니다."
        if score_summary.composite_latest is not None
        else f"{period_start} ~ {period_end} 기간 동안 기록된 점수 데이터가 제한적입니다."
    )

    clinician_note = (
        "본 리포트는 진료 전 참고자료입니다. PHQ-9 최신 점수/자살사고 문항, 최근 2주 점수 변화량, "
        "수면시간 저하 여부, 인지왜곡 빈도 평균을 우선 확인하세요. 필요 시 안전계획 및 추적면담 빈도 조정을 권장합니다."
    )

    return ClinicalReportResponse(
        period_start=period_start,
        period_end=period_end,
        generated_at=datetime.now(UTC),
        summary_text=summary_text,
        risk_flags=risk_flags,
        score_summary=score_summary,
        behavior_summary=behavior,
        clinician_note=clinician_note,
    )
