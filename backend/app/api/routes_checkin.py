import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes_auth import get_current_user
from app.db import crud
from app.db.session import get_db
from app.schemas.auth import UserOut
from app.schemas.checkin import CheckinCreateRequest, CheckinHistoryItem, CheckinOut, CheckinResponse

router = APIRouter(prefix="/checkins", tags=["checkin"])


def _build_checkin_note(payload: CheckinCreateRequest) -> str:
    lifestyle = {
        "steps_today": payload.steps_today,
        "exercise_minutes_today": payload.exercise_minutes_today,
        "daylight_minutes_today": payload.daylight_minutes_today,
        "screen_time_min_today": payload.screen_time_min_today,
        "meal_regularity_0_10_today": payload.meal_regularity_0_10_today,
        "caffeine_after_2pm_flag_today": payload.caffeine_after_2pm_flag_today,
        "alcohol_flag_today": payload.alcohol_flag_today,
        "sleep_onset_latency_min_today": payload.sleep_onset_latency_min_today,
        "awakenings_count_today": payload.awakenings_count_today,
        "sleep_quality_0_10_today": payload.sleep_quality_0_10_today,
    }
    payload_dict = {
        "note": payload.note or "",
        "challenge_completed_count": payload.challenge_completed_count,
        "challenge_total_count": payload.challenge_total_count,
        "lifestyle": lifestyle,
    }
    return json.dumps(payload_dict, ensure_ascii=False)


def _parse_checkin_note(raw_note: str | None) -> tuple[str | None, int, int, dict[str, object]]:
    if not raw_note:
        return None, 0, 0, {}
    try:
        parsed = json.loads(raw_note)
        if isinstance(parsed, dict):
            note = str(parsed.get("note") or "").strip() or None
            completed = int(parsed.get("challenge_completed_count") or 0)
            total = int(parsed.get("challenge_total_count") or 0)
            lifestyle = parsed.get("lifestyle") if isinstance(parsed.get("lifestyle"), dict) else {}
            return note, max(0, completed), max(0, total), lifestyle
    except Exception:
        pass
    return raw_note, 0, 0, {}


@router.post("", response_model=CheckinOut)
async def create_checkin(
    payload: CheckinCreateRequest,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CheckinOut:
    row = await crud.create_checkin(
        db=db,
        user_id=current_user.id,
        mood_score=payload.mood_score,
        sleep_hours=payload.sleep_hours,
        exercised=(payload.exercised or payload.challenge_completed_count > 0 or (payload.exercise_minutes_today or 0) > 0),
        note=_build_checkin_note(payload),
    )

    note, completed, total, _ = _parse_checkin_note(row.note)
    return CheckinOut(
        id=row.id,
        user_id=row.user_id,
        mood_score=row.mood_score,
        sleep_hours=row.sleep_hours,
        exercised=row.exercised,
        note=note,
        challenge_completed_count=completed,
        challenge_total_count=total,
        timestamp=row.created_at,
    )


@router.get("/latest", response_model=CheckinResponse)
async def latest_checkin(
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CheckinResponse:
    latest = await crud.get_latest_checkin(db, current_user.id)
    if latest is None:
        return CheckinResponse(
            message="아직 체크인 데이터가 없습니다.",
            disclaimer="이 정보는 참고용이며, 진단 아님 안내입니다.",
            timestamp=datetime.now(timezone.utc),
        )

    note, completed, total, _ = _parse_checkin_note(latest.note)
    msg = f"최근 체크인: mood {latest.mood_score}, sleep {latest.sleep_hours}, challenge {completed}/{total}"
    if note:
        msg += f", note: {note}"

    return CheckinResponse(
        message=msg,
        disclaimer="이 정보는 참고용이며, 진단 아님 안내입니다.",
        timestamp=latest.created_at,
    )


@router.get("/history", response_model=list[CheckinHistoryItem])
async def list_checkin_history(
    days: int = Query(default=30, ge=1, le=180),
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CheckinHistoryItem]:
    rows = await crud.list_checkins_by_user(db, current_user.id, limit=days)
    out: list[CheckinHistoryItem] = []
    for row in rows:
        _, _, _, lifestyle = _parse_checkin_note(row.note)
        out.append(
            CheckinHistoryItem(
                timestamp=row.created_at,
                mood_score=row.mood_score,
                sleep_hours=row.sleep_hours,
                steps_today=int(lifestyle.get("steps_today")) if lifestyle.get("steps_today") is not None else None,
                exercise_minutes_today=int(lifestyle.get("exercise_minutes_today")) if lifestyle.get("exercise_minutes_today") is not None else None,
                daylight_minutes_today=int(lifestyle.get("daylight_minutes_today")) if lifestyle.get("daylight_minutes_today") is not None else None,
                screen_time_min_today=int(lifestyle.get("screen_time_min_today")) if lifestyle.get("screen_time_min_today") is not None else None,
                meal_regularity_0_10_today=int(lifestyle.get("meal_regularity_0_10_today")) if lifestyle.get("meal_regularity_0_10_today") is not None else None,
                caffeine_after_2pm_flag_today=bool(lifestyle.get("caffeine_after_2pm_flag_today")) if lifestyle.get("caffeine_after_2pm_flag_today") is not None else None,
                alcohol_flag_today=bool(lifestyle.get("alcohol_flag_today")) if lifestyle.get("alcohol_flag_today") is not None else None,
                sleep_onset_latency_min_today=int(lifestyle.get("sleep_onset_latency_min_today")) if lifestyle.get("sleep_onset_latency_min_today") is not None else None,
                awakenings_count_today=int(lifestyle.get("awakenings_count_today")) if lifestyle.get("awakenings_count_today") is not None else None,
                sleep_quality_0_10_today=int(lifestyle.get("sleep_quality_0_10_today")) if lifestyle.get("sleep_quality_0_10_today") is not None else None,
            )
        )
    return out
