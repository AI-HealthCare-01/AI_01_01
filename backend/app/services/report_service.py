from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy import Select, and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import crud
from app.db.models import ChatEvent, CheckIn
from app.schemas.report import (
    ClinicalBehaviorSummary,
    ClinicalNarrativeSection,
    ClinicalReportResponse,
    ClinicalRiskItem,
    ClinicalScoreSummary,
    ClinicalScoreTrendItem,
)
from app.services.llm import summarize_clinical_narrative
from app.services.user_dashboard import build_user_weekly_dashboard


def _mean(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def _parse_checkin_challenge_counts(raw_note: str | None) -> tuple[int, int]:
    if not raw_note:
        return 0, 0
    try:
        import json

        parsed = json.loads(raw_note)
        if isinstance(parsed, dict):
            completed = int(parsed.get("challenge_completed_count") or 0)
            total = int(parsed.get("challenge_total_count") or 0)
            return max(0, completed), max(0, total)
    except Exception:
        pass
    return 0, 0


def _pick_event_samples(messages: list[str], limit: int = 3) -> list[str]:
    candidates = [m.strip().replace("\n", " ") for m in messages if m.strip()]
    candidates.sort(key=len, reverse=True)
    seen: list[str] = []
    for item in candidates:
        short = item[:160]
        if short in seen:
            continue
        seen.append(short)
        if len(seen) >= limit:
            break
    return seen


def _emotion_profile(messages: list[str]) -> str:
    text = " ".join(messages).lower()
    groups = {
        "불안/긴장": ["불안", "긴장", "걱정", "초조"],
        "우울/무기력": ["우울", "무기력", "지침", "힘들"],
        "분노/예민": ["화", "분노", "짜증", "예민"],
        "수면곤란": ["잠", "불면", "깼", "뒤척"],
    }
    scored: list[tuple[str, int]] = []
    for label, keys in groups.items():
        scored.append((label, sum(text.count(k) for k in keys)))
    scored.sort(key=lambda x: x[1], reverse=True)
    top = [f"{name}({count})" for name, count in scored if count > 0][:3]
    if not top:
        return "대화 내 정서 표현은 전반적으로 다양하며 특정 정서에 과도하게 치우치지 않았습니다."
    return f"대화에서 두드러진 정서 표현은 {', '.join(top)} 양상입니다."


def _thought_flow_summary(chats: list[ChatEvent]) -> str:
    totals: dict[str, float] = {
        "흑백사고": 0.0,
        "파국화": 0.0,
        "독심술": 0.0,
        "당위문": 0.0,
        "개인화": 0.0,
        "과잉일반화": 0.0,
    }
    key_map = {
        "all_or_nothing_count": "흑백사고",
        "catastrophizing_count": "파국화",
        "mind_reading_count": "독심술",
        "should_statements_count": "당위문",
        "personalization_count": "개인화",
        "overgeneralization_count": "과잉일반화",
    }

    for c in chats:
        extracted = c.extracted if isinstance(c.extracted, dict) else {}
        distortion = extracted.get("distortion") if isinstance(extracted, dict) else {}
        if not isinstance(distortion, dict):
            continue
        for k, label in key_map.items():
            try:
                totals[label] += float(distortion.get(k, 0))
            except Exception:
                continue

    sorted_items = sorted(totals.items(), key=lambda x: x[1], reverse=True)
    top = [f"{name}({score:.1f})" for name, score in sorted_items if score > 0][:3]
    if not top:
        return "인지왜곡 지표는 낮거나 기록이 충분하지 않아 특정 사고패턴을 단정하기 어렵습니다."
    return f"기간 내 관찰된 주요 사고패턴은 {', '.join(top)} 입니다."


def _quote_snippet(texts: list[str], fallback: str) -> str:
    for t in texts:
        cleaned=(t or "").strip().replace("\n"," ")
        if cleaned:
            return f'"{cleaned[:50]}"'
    return f'"{fallback}"'


def _lifestyle_fact_text(checkins: list[CheckIn]) -> str:
    if not checkins:
        return "체크인 기록이 적어 생활습관 수치 기반 설명이 제한되는 양상이 나타난다."

    mood_vals=[int(c.mood_score) for c in checkins]
    sleep_vals=[float(c.sleep_hours) for c in checkins if c.sleep_hours is not None]
    import json
    exercise_vals=[]
    daylight_vals=[]
    screen_vals=[]
    for c in checkins:
        if not c.note:
            continue
        try:
            parsed=json.loads(c.note)
            if not isinstance(parsed,dict):
                continue
            life=parsed.get("lifestyle") if isinstance(parsed.get("lifestyle"),dict) else {}
            if life.get("exercise_minutes_today") is not None:
                exercise_vals.append(int(life.get("exercise_minutes_today")))
            if life.get("daylight_minutes_today") is not None:
                daylight_vals.append(int(life.get("daylight_minutes_today")))
            if life.get("screen_time_min_today") is not None:
                screen_vals.append(int(life.get("screen_time_min_today")))
        except Exception:
            continue

    parts=[]
    if mood_vals:
        parts.append(f"기분점수는 {len(mood_vals)}회 입력되었고 평균 {sum(mood_vals)/len(mood_vals):.1f}점으로 기록되는 양상이 나타난다.")
    if sleep_vals:
        parts.append(f"수면시간은 {len(sleep_vals)}회 입력되었고 평균 {sum(sleep_vals)/len(sleep_vals):.1f}시간으로 기록되는 양상이 나타난다.")
    if exercise_vals:
        parts.append(f"운동시간은 {len(exercise_vals)}회 입력되었고 평균 {sum(exercise_vals)/len(exercise_vals):.1f}분으로 기록되는 양상이 나타난다.")
    if daylight_vals:
        parts.append(f"햇빛노출은 {len(daylight_vals)}회 입력되었고 평균 {sum(daylight_vals)/len(daylight_vals):.1f}분으로 기록되는 양상이 나타난다.")
    if screen_vals:
        parts.append(f"스크린타임은 {len(screen_vals)}회 입력되었고 평균 {sum(screen_vals)/len(screen_vals):.1f}분으로 기록되는 양상이 나타난다.")

    return " ".join(parts) if parts else "수치 입력이 제한되어 생활습관 양상 설명이 제한되는 상태다."


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
    rows_sorted = sorted(
        [r for r in rows if period_start <= date.fromisoformat(str(r.get("week_start_date"))) <= period_end],
        key=lambda x: str(x.get("week_start_date")),
    )
    latest = rows_sorted[-1] if rows_sorted else None
    prev = rows_sorted[-2] if len(rows_sorted) > 1 else None

    score_summary = ClinicalScoreSummary(
        composite_latest=float(latest["symptom_composite_pred_0_100"]) if latest else None,
        dep_latest=float(latest["dep_week_pred_0_100"]) if latest else None,
        anx_latest=float(latest["anx_week_pred_0_100"]) if latest else None,
        ins_latest=float(latest["ins_week_pred_0_100"]) if latest else None,
        composite_delta=(float(latest["symptom_composite_pred_0_100"]) - float(prev["symptom_composite_pred_0_100"])) if latest and prev else None,
    )

    sleep_vals = [float(c.sleep_hours) for c in checkins if c.sleep_hours is not None]
    mood_vals = [float(c.mood_score) for c in checkins]

    distortion_vals: list[float] = []
    for c in chats:
        ex = c.extracted or {}
        dist = ex.get("distortion") if isinstance(ex, dict) else None
        if isinstance(dist, dict):
            total = 0.0
            for v in dist.values():
                try:
                    total += float(v)
                except Exception:
                    continue
            distortion_vals.append(total)

    completed_total = 0
    challenge_total = 0
    for c in checkins:
        done, total = _parse_checkin_challenge_counts(c.note)
        completed_total += done
        challenge_total += total

    behavior = ClinicalBehaviorSummary(
        avg_sleep_hours=_mean(sleep_vals),
        avg_mood_score=_mean(mood_vals),
        checkin_days=len({c.created_at.date() for c in checkins}),
        cbt_sessions=len(chats),
        distortion_total_mean=_mean(distortion_vals),
        challenge_completed_total=completed_total,
        challenge_total=challenge_total,
        challenge_completion_rate=(completed_total / challenge_total) if challenge_total > 0 else None,
    )

    risk_flags: list[ClinicalRiskItem] = []

    if latest and latest.get("alert_level") == "high":
        risk_flags.append(
            ClinicalRiskItem(
                code="HIGH_ALERT",
                title="고위험 알림 구간",
                detail=f"최근 composite가 {float(latest['symptom_composite_pred_0_100']):.1f}로 높습니다.",
            )
        )

    if score_summary.composite_delta is not None and score_summary.composite_delta >= 5:
        risk_flags.append(
            ClinicalRiskItem(
                code="WORSENING_TREND",
                title="증상 점수 상승 추세",
                detail=f"기간 내 composite 변화량이 +{score_summary.composite_delta:.1f}입니다.",
            )
        )

    if in_period_assess:
        latest_assess = in_period_assess[0]
        q9 = int((latest_assess.answers or {}).get("q9", 0))
        if q9 >= 2:
            risk_flags.append(
                ClinicalRiskItem(
                    code="SUICIDAL_IDEATION_SIGNAL",
                    title="자해/자살사고 문항 주의",
                    detail=f"최근 PHQ-9 9번 문항 점수가 {q9}점으로 관찰됩니다.",
                )
            )

    if behavior.avg_sleep_hours is not None and behavior.avg_sleep_hours < 5.5:
        risk_flags.append(
            ClinicalRiskItem(
                code="SLEEP_DEPRIVATION",
                title="수면 부족 경향",
                detail=f"기간 평균 수면시간이 {behavior.avg_sleep_hours:.1f}시간으로 낮습니다.",
            )
        )

    user_messages = [c.user_message for c in chats]
    event_samples = _pick_event_samples(user_messages, limit=3)
    event_text = " / ".join(event_samples) if event_samples else "기록된 대화 내용이 적어 대표 사건을 추출하기 어렵다."
    emotion_text = _emotion_profile(user_messages)
    thought_text = _thought_flow_summary(chats)

    challenge_mentions = [x for c in chats for x in (c.suggested_challenges or []) if isinstance(x, str) and x.strip()]
    challenge_text = ""
    if challenge_mentions:
        challenge_text = f"추천/진행된 챌린지는 {', '.join(challenge_mentions[:5])} 중심으로 기록되는 양상이 나타난다."
    else:
        challenge_text = "챌린지 수행 기록은 제한적이며 대화 중심으로 정리되는 양상이 나타난다."

    llm_narr = summarize_clinical_narrative(
        user_messages=user_messages,
        score_summary={
            "composite_latest": score_summary.composite_latest,
            "composite_delta": score_summary.composite_delta,
            "dep_latest": score_summary.dep_latest,
            "anx_latest": score_summary.anx_latest,
            "ins_latest": score_summary.ins_latest,
        },
        behavior_summary={
            "avg_sleep_hours": behavior.avg_sleep_hours,
            "avg_mood_score": behavior.avg_mood_score,
            "checkin_days": behavior.checkin_days,
            "cbt_sessions": behavior.cbt_sessions,
            "challenge_completion_rate": behavior.challenge_completion_rate,
        },
        thought_pattern_hint=thought_text,
        intervention_hint=challenge_text,
    )

    evidence_event = _quote_snippet(user_messages, "최근 사건 언급")
    evidence_emotion = _quote_snippet(list(reversed(user_messages)), "감정 표현")
    evidence_challenge = _quote_snippet(challenge_mentions, "챌린지 수행")
    lifestyle_fact_text = _lifestyle_fact_text(checkins)

    narrative_sections = [
        ClinicalNarrativeSection(
            title="사건/맥락 요약",
            major_dialogue=evidence_event,
            llm_summary=llm_narr.get('situation_context', event_text),
            detail=llm_narr.get('situation_context', event_text),
        ),
        ClinicalNarrativeSection(
            title="감정 반응 요약",
            major_dialogue=evidence_emotion,
            llm_summary=llm_narr.get('emotion_summary', emotion_text),
            detail=llm_narr.get('emotion_summary', emotion_text),
        ),
        ClinicalNarrativeSection(
            title="사고 흐름 및 인지왜곡",
            major_dialogue=evidence_event,
            llm_summary=llm_narr.get('cognitive_pattern', thought_text),
            detail=llm_narr.get('cognitive_pattern', thought_text),
        ),
        ClinicalNarrativeSection(
            title="교정 활동 및 수행 반응",
            major_dialogue=evidence_challenge,
            llm_summary=llm_narr.get('intervention_summary', challenge_text),
            detail=llm_narr.get('intervention_summary', challenge_text),
        ),
        ClinicalNarrativeSection(
            title="기분/신체 증상 수치 요약",
            major_dialogue="체크인 수치 입력 기록",
            llm_summary=lifestyle_fact_text,
            detail=lifestyle_fact_text,
        ),
    ]

    score_trends: list[ClinicalScoreTrendItem] = []
    for idx, row in enumerate(rows_sorted):
        prev_row = rows_sorted[idx - 1] if idx > 0 else None
        composite = float(row["symptom_composite_pred_0_100"])
        prev_composite = float(prev_row["symptom_composite_pred_0_100"]) if prev_row else None
        score_trends.append(
            ClinicalScoreTrendItem(
                week_start_date=date.fromisoformat(str(row["week_start_date"])),
                composite=composite,
                dep=float(row["dep_week_pred_0_100"]),
                anx=float(row["anx_week_pred_0_100"]),
                ins=float(row["ins_week_pred_0_100"]),
                composite_delta_from_prev=(composite - prev_composite) if prev_composite is not None else None,
            )
        )

    summary_text = (
        f"{period_start} ~ {period_end} 기간 동안 체크인 {behavior.checkin_days}일, CBT 대화 {behavior.cbt_sessions}회가 기록되는 양상이 나타난다. "
        f"최근 종합 점수는 {score_summary.composite_latest:.1f}점이며, 아래 서술형 대화 요약과 수치 변화를 함께 확인해 주세요."
        if score_summary.composite_latest is not None
        else f"{period_start} ~ {period_end} 기간 동안 점수 데이터가 제한적이며, 서술형 대화 기록 중심으로 확인이 필요합니다."
    )

    clinician_note = "본 리포트는 진단서가 아닌 참고자료입니다"

    return ClinicalReportResponse(
        period_start=period_start,
        period_end=period_end,
        generated_at=datetime.now(UTC),
        summary_text=summary_text,
        risk_flags=risk_flags,
        score_summary=score_summary,
        behavior_summary=behavior,
        clinician_note=clinician_note,
        narrative_sections=narrative_sections,
        score_trends=score_trends,
    )
