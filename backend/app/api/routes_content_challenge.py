from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes_auth import get_current_user
from app.db import crud
from app.db.session import get_db
from app.schemas.auth import UserOut
from app.schemas.content_challenge import (
    ContentChallengeCatalogItem,
    ContentChallengeCatalogResponse,
    ContentChallengeLogCreateRequest,
    ContentChallengeLogListResponse,
    ContentChallengeLogOut,
)

router = APIRouter(prefix="/content-challenges", tags=["content_challenge"])

CATALOG = [
    {
        "id": "sunlight_20",
        "title": "햇빛 20분 쐬기",
        "description": "실외에서 햇빛을 20분 이상 쐬고 몸/기분 변화를 짧게 기록합니다.",
        "category": "생활습관",
    },
    {
        "id": "exercise_walk_20",
        "title": "걷기/운동 20분",
        "description": "걷기나 가벼운 운동을 20분 이상 수행합니다.",
        "category": "신체활동",
    },
    {
        "id": "sleep_hygiene_night",
        "title": "수면 위생 루틴 지키기",
        "description": "취침 1시간 전 스크린 노출을 줄이고 취침 루틴을 지킵니다.",
        "category": "수면",
    },
    {
        "id": "mindfulness_10",
        "title": "명상 10분",
        "description": "호흡/바디스캔 명상을 10분 수행합니다.",
        "category": "정서조절",
    },
    {
        "id": "gratitude_3",
        "title": "감사 3가지 기록",
        "description": "오늘 감사한 일 3가지를 간단히 기록합니다.",
        "category": "정서조절",
    },
]


@router.get("/catalog", response_model=ContentChallengeCatalogResponse)
async def get_catalog() -> ContentChallengeCatalogResponse:
    items = [ContentChallengeCatalogItem(**x) for x in CATALOG]
    return ContentChallengeCatalogResponse(items=items)


@router.post("/logs", response_model=ContentChallengeLogOut)
async def create_log(
    payload: ContentChallengeLogCreateRequest,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContentChallengeLogOut:
    row = await crud.create_content_challenge_log(
        db=db,
        user_id=current_user.id,
        challenge_name=payload.challenge_name,
        category=payload.category,
        performed_date=payload.performed_date,
        duration_minutes=payload.duration_minutes,
        detail=payload.detail,
    )
    return ContentChallengeLogOut(
        id=row.id,
        challenge_name=row.challenge_name,
        category=row.category,
        performed_date=row.performed_date,
        duration_minutes=row.duration_minutes,
        detail=row.detail,
        created_at=row.created_at,
    )


@router.get("/logs", response_model=ContentChallengeLogListResponse)
async def list_logs(
    limit: int = Query(default=180, ge=1, le=365),
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContentChallengeLogListResponse:
    rows = await crud.list_content_challenge_logs_by_user(db, user_id=current_user.id, limit=limit)
    items = [
        ContentChallengeLogOut(
            id=r.id,
            challenge_name=r.challenge_name,
            category=r.category,
            performed_date=r.performed_date,
            duration_minutes=r.duration_minutes,
            detail=r.detail,
            created_at=r.created_at,
        )
        for r in rows
    ]
    return ContentChallengeLogListResponse(total=len(items), items=items)
