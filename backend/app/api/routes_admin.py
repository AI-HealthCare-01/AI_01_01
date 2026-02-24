from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes_auth import get_current_user
from app.db.session import get_db
from app.schemas.admin import (
    AdminAssessmentListResponse,
    AdminHighRiskListResponse,
    AdminSummaryResponse,
    AdminUserListResponse,
)
from app.schemas.auth import UserOut
from app.services.admin_service import (
    get_admin_summary,
    list_admin_assessments,
    list_admin_high_risk,
    list_admin_users,
)

router = APIRouter(prefix="/admin", tags=["admin"])


def _get_admin_emails() -> set[str]:
    raw = os.getenv("ADMIN_EMAILS", "")
    return {x.strip().lower() for x in raw.split(",") if x.strip()}


async def require_admin(current_user: UserOut = Depends(get_current_user)) -> UserOut:
    admin_emails = _get_admin_emails()
    if not admin_emails or current_user.email.lower() not in admin_emails:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 계정이 아닙니다.")
    return current_user


@router.get("/summary", response_model=AdminSummaryResponse)
async def admin_summary(
    _: UserOut = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminSummaryResponse:
    return await get_admin_summary(db)


@router.get("/users", response_model=AdminUserListResponse)
async def admin_users(
    page: int = Query(default=1, ge=1, le=2000),
    page_size: int = Query(default=20, ge=1, le=100),
    q: str | None = Query(default=None, min_length=1, max_length=200),
    _: UserOut = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserListResponse:
    return await list_admin_users(db, page=page, page_size=page_size, q=q)


@router.get("/assessments", response_model=AdminAssessmentListResponse)
async def admin_assessments(
    page: int = Query(default=1, ge=1, le=2000),
    page_size: int = Query(default=20, ge=1, le=100),
    q: str | None = Query(default=None, min_length=1, max_length=200),
    high_risk_only: bool = Query(default=False),
    _: UserOut = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminAssessmentListResponse:
    return await list_admin_assessments(
        db,
        page=page,
        page_size=page_size,
        q=q,
        high_risk_only=high_risk_only,
    )


@router.get("/high-risk", response_model=AdminHighRiskListResponse)
async def admin_high_risk(
    limit: int = Query(default=100, ge=1, le=500),
    _: UserOut = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminHighRiskListResponse:
    return await list_admin_high_risk(db, limit=limit)
