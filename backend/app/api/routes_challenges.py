from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, constr
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes_auth import get_current_user
from app.db import crud
from app.db.session import get_db
from app.schemas.auth import UserOut

router = APIRouter(prefix="/challenges", tags=["challenges"])
DAILY_MAX_CHALLENGES = 4


class ChallengeStartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    template_key: constr(min_length=1, max_length=100)


class ChallengeCompleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    challenge_id: UUID
    date: constr(min_length=10, max_length=10)
    completed_flag: bool
    completion_quality_0_5: int | None = Field(default=None, ge=0, le=5)
    perceived_helpfulness_0_10: int | None = Field(default=None, ge=0, le=10)


CATALOG: list[dict[str, Any]] = [
    {
        "template_key": "MEDITATION_5MIN",
        "title": "5분 명상",
        "short_desc": "호흡과 몸감각에 5분 집중하는 짧은 명상",
        "category_label": "정서조절",
        "type": "mind",
        "default_duration_days": 1,
        "target_frequency_per_week": 5,
        "difficulty_1_5": 1,
        "cta_label": "5분 시작",
        "rules_text": "조용한 자리에서 5분 타이머를 켜고 호흡만 관찰하세요.",
    },
    {
        "template_key": "MORNING_ROUTINE_VITAL",
        "title": "활기찬 모닝 루틴",
        "short_desc": "기상 후 양치·세수·물 한 잔으로 하루 시작 루틴 만들기",
        "category_label": "생활습관",
        "type": "lifestyle",
        "default_duration_days": 1,
        "target_frequency_per_week": 7,
        "difficulty_1_5": 1,
        "cta_label": "시작하기",
        "rules_text": "기상 후 30분 내 양치, 세수, 물 1잔을 완료하세요.",
    },
    {
        "template_key": "BREATHING_3MIN",
        "title": "호흡 3분",
        "short_desc": "4-6 호흡으로 과호흡/긴장 완화 연습",
        "category_label": "정서조절",
        "type": "mind",
        "default_duration_days": 1,
        "target_frequency_per_week": 7,
        "difficulty_1_5": 1,
        "cta_label": "3분 시작",
        "rules_text": "4초 들숨, 6초 날숨을 3분 반복하세요.",
    },
    {
        "template_key": "MEDITATION_5MIN_3D",
        "title": "3일 5분 명상",
        "short_desc": "3일 동안 하루 5분 호흡/몸감각 명상 루틴 만들기",
        "category_label": "정서조절",
        "type": "mind",
        "default_duration_days": 3,
        "target_frequency_per_week": 3,
        "difficulty_1_5": 1,
        "cta_label": "시작하기",
        "rules_text": "3일 동안 하루 1회, 5분 타이머로 호흡에 집중하세요.",
    },
    {
        "template_key": "BREATHING_3MIN_3D",
        "title": "3일 호흡 3분",
        "short_desc": "3일 동안 긴장 완화 호흡을 꾸준히 실천",
        "category_label": "정서조절",
        "type": "mind",
        "default_duration_days": 3,
        "target_frequency_per_week": 3,
        "difficulty_1_5": 1,
        "cta_label": "시작하기",
        "rules_text": "3일 동안 하루 1회, 4-6 호흡을 3분 반복하세요.",
    },
    {
        "template_key": "SUNLIGHT_5MIN_3D",
        "title": "햇빛 5분",
        "short_desc": "짧은 광 노출로 수면-각성 리듬 보정",
        "category_label": "생활습관",
        "type": "lifestyle",
        "default_duration_days": 3,
        "target_frequency_per_week": 3,
        "difficulty_1_5": 1,
        "cta_label": "시작하기",
        "rules_text": "실외 또는 창가에서 5분 햇빛을 쬐세요.",
    },
    {
        "template_key": "SUNLIGHT_20MIN",
        "title": "햇빛 20분",
        "short_desc": "아침/점심 시간대 햇빛 노출 강화",
        "category_label": "생활습관",
        "type": "lifestyle",
        "default_duration_days": 7,
        "target_frequency_per_week": 3,
        "difficulty_1_5": 2,
        "cta_label": "시작하기",
        "rules_text": "아침 또는 점심 시간에 20분 햇빛을 쬐세요.",
    },
    {
        "template_key": "WALK_10MIN_3D",
        "title": "산책 10분",
        "short_desc": "가벼운 걷기로 회피와 반추 끊기",
        "category_label": "신체활동",
        "type": "body",
        "default_duration_days": 3,
        "target_frequency_per_week": 3,
        "difficulty_1_5": 1,
        "cta_label": "시작하기",
        "rules_text": "가볍게 10분 걷고 몸의 긴장 변화를 기록하세요.",
    },
    {
        "template_key": "GRATITUDE_3_3D",
        "title": "3일 감사 3가지",
        "short_desc": "3일 동안 감사한 일 3가지를 짧게 기록",
        "category_label": "정서조절",
        "type": "cbt",
        "default_duration_days": 3,
        "target_frequency_per_week": 3,
        "difficulty_1_5": 1,
        "cta_label": "시작하기",
        "rules_text": "3일 동안 매일 감사한 일 3가지를 적고 이유를 한 줄씩 남기세요.",
    },
    {
        "template_key": "SLEEP_RESET_3D",
        "title": "3일 수면 리셋",
        "short_desc": "취침/기상 시간을 3일간 일정하게 맞춰보기",
        "category_label": "수면",
        "type": "sleep",
        "default_duration_days": 3,
        "target_frequency_per_week": 3,
        "difficulty_1_5": 2,
        "cta_label": "시작하기",
        "rules_text": "취침/기상 시간을 정하고 3일 동안 동일한 루틴을 유지하세요.",
    },
    {
        "template_key": "WORRY_LOG_3D",
        "title": "3일 걱정 기록 분리",
        "short_desc": "걱정 내용을 통제 가능/불가로 3일간 분류하기",
        "category_label": "정서조절",
        "type": "cbt",
        "default_duration_days": 3,
        "target_frequency_per_week": 3,
        "difficulty_1_5": 2,
        "cta_label": "시작하기",
        "rules_text": "걱정을 적고 통제 가능/불가를 나눠 기록하세요.",
    },
    {
        "template_key": "EXERCISE_WALK_20",
        "title": "걷기/운동 20분",
        "short_desc": "걷기 또는 가벼운 운동으로 신체 활성화",
        "category_label": "신체활동",
        "type": "body",
        "default_duration_days": 7,
        "target_frequency_per_week": 3,
        "difficulty_1_5": 2,
        "cta_label": "시작하기",
        "rules_text": "가능한 페이스로 20분 움직이고 심박/기분 변화를 기록하세요.",
    },
    {
        "template_key": "BREATHING_3MIN_7D",
        "title": "7일 호흡 3분",
        "short_desc": "7일 동안 하루 3분 긴장 완화 호흡 루틴",
        "category_label": "정서조절",
        "type": "mind",
        "default_duration_days": 7,
        "target_frequency_per_week": 7,
        "difficulty_1_5": 1,
        "cta_label": "시작하기",
        "rules_text": "7일 동안 하루 1회, 4-6 호흡을 3분 반복하세요.",
    },
    {
        "template_key": "MEDITATION_5MIN_7D",
        "title": "7일 5분 명상",
        "short_desc": "7일 동안 하루 5분 마음챙김 명상",
        "category_label": "정서조절",
        "type": "mind",
        "default_duration_days": 7,
        "target_frequency_per_week": 7,
        "difficulty_1_5": 1,
        "cta_label": "시작하기",
        "rules_text": "7일 동안 하루 1회, 5분 명상을 실천하세요.",
    },
    {
        "template_key": "SLEEP_HYGIENE_ROUTINE",
        "title": "수면 위생 루틴 지키기",
        "short_desc": "취침 전 루틴을 오늘 실천해보기",
        "category_label": "수면",
        "type": "sleep",
        "default_duration_days": 7,
        "target_frequency_per_week": 5,
        "difficulty_1_5": 2,
        "cta_label": "시작하기",
        "rules_text": "취침 1시간 전 스크린 노출을 줄이고 오늘 일정한 취침 시간을 지켜보세요.",
    },
    {
        "template_key": "DIGITAL_SUNSET_7D",
        "title": "7일 디지털 선셋",
        "short_desc": "취침 1시간 전 디지털 사용 줄이는 7일 실험",
        "category_label": "수면",
        "type": "sleep",
        "default_duration_days": 7,
        "target_frequency_per_week": 7,
        "difficulty_1_5": 2,
        "cta_label": "시작하기",
        "rules_text": "취침 1시간 전 휴대폰/영상 시청을 줄이고 수면 루틴을 지켜보세요.",
    },
    {
        "template_key": "JOURNAL_STREAK_7D",
        "title": "7일 마음기록",
        "short_desc": "7일 동안 감정/생각/행동을 짧게 기록",
        "category_label": "생활습관",
        "type": "cbt",
        "default_duration_days": 7,
        "target_frequency_per_week": 7,
        "difficulty_1_5": 2,
        "cta_label": "시작하기",
        "rules_text": "하루 1회, 사실/생각/감정을 한 줄씩 기록해 7일 연속 유지하세요.",
    },
    {
        "template_key": "GRATITUDE_3_7D",
        "title": "7일 감사 3가지",
        "short_desc": "7일 동안 감사한 일을 꾸준히 기록하는 연습",
        "category_label": "정서조절",
        "type": "cbt",
        "default_duration_days": 7,
        "target_frequency_per_week": 7,
        "difficulty_1_5": 2,
        "cta_label": "시작하기",
        "rules_text": "하루 1회 감사한 일 3가지를 적고 이유를 한 줄씩 덧붙이세요.",
    },
    {
        "template_key": "WORRY_TIME_10MIN_7D",
        "title": "7일 걱정시간 10분",
        "short_desc": "정해진 시간에만 걱정을 다루는 7일 훈련",
        "category_label": "정서조절",
        "type": "cbt",
        "default_duration_days": 7,
        "target_frequency_per_week": 7,
        "difficulty_1_5": 2,
        "cta_label": "시작하기",
        "rules_text": "매일 같은 시간 10분 동안만 걱정을 적고 종료하세요.",
    },
    {
        "template_key": "JOURNAL_STREAK",
        "title": "3일 마음기록(연속 일기)",
        "short_desc": "연속 3일 감정과 생각을 짧게 기록",
        "category_label": "생활습관",
        "type": "cbt",
        "default_duration_days": 3,
        "target_frequency_per_week": 3,
        "difficulty_1_5": 2,
        "cta_label": "시작하기",
        "rules_text": "하루 1회, 사실/생각/감정을 한 줄씩 3일 연속 기록하세요.",
    },
    {
        "template_key": "GRATITUDE_3",
        "title": "감사 3가지 기록",
        "short_desc": "오늘 감사한 일 3가지를 텍스트로 남기기",
        "category_label": "정서조절",
        "type": "cbt",
        "default_duration_days": 1,
        "target_frequency_per_week": 5,
        "difficulty_1_5": 1,
        "cta_label": "시작하기",
        "rules_text": "오늘 감사했던 장면을 3가지 적고 그 이유를 한 줄씩 덧붙이세요.",
    },
    {
        "template_key": "GRATITUDE_LOTTERY",
        "title": "감사 제비뽑기",
        "short_desc": "랜덤 감사 주제를 뽑아 짧게 작성",
        "category_label": "대인관계",
        "type": "social",
        "default_duration_days": 1,
        "target_frequency_per_week": 4,
        "difficulty_1_5": 2,
        "cta_label": "시작하기",
        "rules_text": "랜덤 감사 주제를 하나 선택하고 3문장으로 기록하세요.",
    },
    {
        "template_key": "STRETCH_5MIN",
        "title": "5분 스트레칭",
        "short_desc": "뭉친 몸을 풀며 긴장을 낮추는 짧은 스트레칭",
        "category_label": "신체활동",
        "type": "body",
        "default_duration_days": 1,
        "target_frequency_per_week": 5,
        "difficulty_1_5": 1,
        "cta_label": "시작하기",
        "rules_text": "목/어깨/허리 중심으로 5분간 천천히 스트레칭하세요.",
    },
    {
        "template_key": "WATER_3CUPS",
        "title": "물 3잔 챌린지",
        "short_desc": "오전/오후/저녁으로 물 마시기 루틴",
        "category_label": "생활습관",
        "type": "lifestyle",
        "default_duration_days": 1,
        "target_frequency_per_week": 7,
        "difficulty_1_5": 1,
        "cta_label": "시작하기",
        "rules_text": "하루 동안 물 3잔을 시간대별로 나눠 마셔보세요.",
    },
    {
        "template_key": "DIGITAL_BREAK_30MIN",
        "title": "디지털 쉬어가기 30분",
        "short_desc": "휴대폰 없이 30분 보내며 과자극 줄이기",
        "category_label": "생활습관",
        "type": "lifestyle",
        "default_duration_days": 1,
        "target_frequency_per_week": 5,
        "difficulty_1_5": 2,
        "cta_label": "시작하기",
        "rules_text": "알림을 끄고 30분 동안 화면 없이 휴식 시간을 가지세요.",
    },
    {
        "template_key": "NO_CAFFEINE_AFTER_2PM",
        "title": "오후 2시 이후 카페인 줄이기",
        "short_desc": "수면 질을 위해 늦은 시간 카페인 피하기",
        "category_label": "수면",
        "type": "sleep",
        "default_duration_days": 1,
        "target_frequency_per_week": 7,
        "difficulty_1_5": 2,
        "cta_label": "시작하기",
        "rules_text": "오후 2시 이후 커피/에너지음료를 피하고 컨디션 변화를 관찰하세요.",
    },
    {
        "template_key": "BREATH_BREAK_1MIN_X3",
        "title": "1분 호흡 휴식 3회",
        "short_desc": "짧은 호흡 멈춤으로 하루 긴장도 낮추기",
        "category_label": "정서조절",
        "type": "mind",
        "default_duration_days": 1,
        "target_frequency_per_week": 7,
        "difficulty_1_5": 1,
        "cta_label": "시작하기",
        "rules_text": "하루 중 3번, 1분씩 천천히 들숨/날숨을 반복하세요.",
    },
    {
        "template_key": "SELF_KIND_NOTE",
        "title": "나에게 친절한 한 문장",
        "short_desc": "자기비난 대신 자기연민 문장 1개 남기기",
        "category_label": "정서조절",
        "type": "cbt",
        "default_duration_days": 1,
        "target_frequency_per_week": 5,
        "difficulty_1_5": 1,
        "cta_label": "시작하기",
        "rules_text": "오늘 힘들었던 나에게 건네고 싶은 친절한 문장을 하나 기록하세요.",
    },
    {
        "template_key": "SOCIAL_CONTACT_ONE",
        "title": "안부 연락 1회",
        "short_desc": "가까운 사람에게 짧은 안부를 전해 연결감 회복",
        "category_label": "대인관계",
        "type": "social",
        "default_duration_days": 1,
        "target_frequency_per_week": 4,
        "difficulty_1_5": 2,
        "cta_label": "시작하기",
        "rules_text": "부담 없는 메시지로 안부를 보내고 대화 후 기분을 확인하세요.",
    },
]

CATALOG_MAP = {item["template_key"]: item for item in CATALOG}
KST = timezone(timedelta(hours=9))


def _to_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def _today_kst_date() -> str:
    return datetime.now(KST).date().isoformat()


def _template_duration_days(challenge_key: str) -> int:
    template = CATALOG_MAP.get(challenge_key, {})
    return max(1, int(template.get("default_duration_days", 1)))


def _is_active_row_now(row: Any) -> bool:
    # Legacy 키는 현재 활성 목록/제한 카운트에서 제외한다.
    if row.challenge_key not in CATALOG_MAP:
        return False
    duration_days = _template_duration_days(row.challenge_key)
    created_kst = row.created_at.astimezone(KST)
    now_kst = datetime.now(KST)

    # 하루형은 "당일만" 활성로 본다 (24시간 롤링 아님).
    if duration_days <= 1:
        return created_kst.date() == now_kst.date()

    return created_kst + timedelta(days=duration_days) > now_kst


def _build_active_item(row, completions: list[dict[str, Any]]) -> dict[str, Any]:
    template = CATALOG_MAP.get(row.challenge_key, {})
    start_date = row.created_at.date().isoformat()
    duration = _template_duration_days(row.challenge_key)
    end_date = (row.created_at.date() + timedelta(days=max(1, duration))).isoformat()
    return {
        "id": str(row.id),
        "template_key": row.challenge_key,
        "title": template.get("title", row.challenge_name),
        "category_label": template.get("category_label", "생활습관"),
        "type": template.get("type", "general"),
        "start_date": start_date,
        "end_date": end_date,
        "target_frequency_per_week": int(template.get("target_frequency_per_week", 3)),
        "is_active": True,
        "created_at": _to_iso(row.created_at),
        "updated_at": _to_iso(row.created_at),
        "completions": completions,
    }


@router.get("/library")
async def get_challenge_library(
    _: UserOut = Depends(get_current_user),
) -> dict[str, list[dict[str, Any]]]:
    return {"items": CATALOG}


@router.get("/weekly-progress")
async def get_weekly_progress(
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, list[dict[str, Any]]]:
    rows = await crud.list_challenge_histories_by_user(db, user_id=current_user.id, limit=1000)
    today = datetime.now(timezone(timedelta(hours=9))).date()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    completed_by_date: dict[str, set[str]] = {}
    for row in rows:
        if not row.completed:
            continue
        date_key = row.created_at.astimezone(timezone(timedelta(hours=9))).date().isoformat()
        if date_key < week_start.isoformat() or date_key > week_end.isoformat():
            continue
        completed_by_date.setdefault(date_key, set()).add(row.challenge_key)

    items: list[dict[str, Any]] = []
    for i in range(7):
        d = week_start + timedelta(days=i)
        key = d.isoformat()
        completed_count = min(DAILY_MAX_CHALLENGES, len(completed_by_date.get(key, set())))
        rate = int(round((completed_count / DAILY_MAX_CHALLENGES) * 100))
        items.append(
            {
                "date": key,
                "completed_count": completed_count,
                "max_count": DAILY_MAX_CHALLENGES,
                "completion_rate_percent": rate,
            }
        )
    return {"items": items}


@router.get("/today-completions")
async def get_today_completions(
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, list[str]]:
    rows = await crud.list_challenge_histories_by_user(db, user_id=current_user.id, limit=1000)
    today = datetime.now(timezone(timedelta(hours=9))).date().isoformat()
    keys = sorted(
        {
            row.challenge_key
            for row in rows
            if row.completed and row.created_at.astimezone(timezone(timedelta(hours=9))).date().isoformat() == today
        }
    )
    return {"keys": keys}


@router.get("/active")
async def get_active_challenges(
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, list[dict[str, Any]]]:
    rows = await crud.list_challenge_histories_by_user(db, user_id=current_user.id, limit=400)
    completion_rows_by_key: dict[str, list[Any]] = {}
    active_by_key: dict[str, Any] = {}
    for row in rows:
        if row.completed:
            completion_rows_by_key.setdefault(row.challenge_key, []).append(row)
            continue
        if row.challenge_key not in CATALOG_MAP:
            continue
        if row.challenge_key not in active_by_key:
            if not _is_active_row_now(row):
                continue
            active_by_key[row.challenge_key] = row

    items: list[dict[str, Any]] = []
    for key, row in active_by_key.items():
        duration_days = _template_duration_days(key)
        cycle_start = row.created_at
        cycle_end = row.created_at + timedelta(days=duration_days)
        completion_rows = [
            completed_row
            for completed_row in completion_rows_by_key.get(key, [])
            if cycle_start <= completed_row.created_at < cycle_end
        ]
        completions = [
            {
                "id": str(completed_row.id),
                "challenge_id": str(row.id),
                "completed_date": completed_row.created_at.date().isoformat(),
                "completed_flag": True,
                "completion_quality_0_5": None,
                "perceived_helpfulness_0_10": completed_row.effect_score,
                "created_at": _to_iso(completed_row.created_at),
                "updated_at": _to_iso(completed_row.created_at),
            }
            for completed_row in completion_rows
        ]
        for completion in completions:
            completion["challenge_id"] = str(row.id)
        items.append(_build_active_item(row, completions))
    return {"items": items}


@router.post("/start")
async def start_challenge(
    payload: ChallengeStartRequest,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    key = payload.template_key.strip().upper()
    template = CATALOG_MAP.get(key)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="존재하지 않는 챌린지입니다.")

    active_items = (await get_active_challenges(current_user=current_user, db=db))["items"]
    if all(item["template_key"] != key for item in active_items) and len(active_items) >= DAILY_MAX_CHALLENGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"하루 챌린지는 최대 {DAILY_MAX_CHALLENGES}개까지 활성화할 수 있습니다.",
        )

    active_row = await crud.get_active_challenge_history_by_key(db, user_id=current_user.id, challenge_key=key)
    if active_row is not None and not _is_active_row_now(active_row):
        active_row = None
    if active_row is None:
        active_row = await crud.create_challenge_history(
            db,
            user_id=current_user.id,
            challenge_name=str(template["title"]),
            challenge_key=key,
            technique=str(template["type"]),
            source="manual",
            completed=False,
            effect_score=None,
        )

    items = (await get_active_challenges(current_user=current_user, db=db))["items"]
    challenge = next((item for item in items if item["id"] == str(active_row.id)), None)
    return {"challenge": challenge}


@router.post("/complete")
async def complete_challenge(
    payload: ChallengeCompleteRequest,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    challenge = await crud.get_challenge_history_by_id(db, user_id=current_user.id, challenge_id=payload.challenge_id)
    if challenge is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="진행 중 챌린지를 찾을 수 없습니다.")

    if payload.completed_flag:
        if payload.date != _today_kst_date():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="하루 챌린지는 당일 기록만 허용됩니다.")
        await crud.create_challenge_history(
            db,
            user_id=current_user.id,
            challenge_name=challenge.challenge_name,
            challenge_key=challenge.challenge_key,
            technique=challenge.technique,
            source="manual",
            completed=True,
            effect_score=payload.perceived_helpfulness_0_10,
        )

    return {"ok": True}
