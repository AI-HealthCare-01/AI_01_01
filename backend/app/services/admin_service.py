from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import and_, cast, func, or_, select, String
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Assessment, User
from app.schemas.admin import (
    AdminAssessmentItem,
    AdminAssessmentListResponse,
    AdminHighRiskItem,
    AdminHighRiskListResponse,
    AdminSummaryResponse,
    AdminUserItem,
    AdminUserListResponse,
)


HIGH_RISK_SEVERITIES = {"높은 수준", "다소 높은 수준", "severe", "moderately_severe"}


def _is_high_risk_expr():
    return or_(Assessment.total_score >= 15, Assessment.severity.in_(HIGH_RISK_SEVERITIES))


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(UTC).isoformat()


async def get_admin_summary(db: AsyncSession) -> AdminSummaryResponse:
    total_users = int((await db.execute(select(func.count()).select_from(User))).scalar_one())
    total_assessments = int((await db.execute(select(func.count()).select_from(Assessment))).scalar_one())
    high_risk_assessments = int(
        (await db.execute(select(func.count()).select_from(Assessment).where(_is_high_risk_expr()))).scalar_one()
    )

    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    assessments_today = int(
        (
            await db.execute(
                select(func.count()).select_from(Assessment).where(Assessment.created_at >= start)
            )
        ).scalar_one()
    )

    return AdminSummaryResponse(
        total_users=total_users,
        total_assessments=total_assessments,
        high_risk_assessments=high_risk_assessments,
        assessments_today=assessments_today,
    )


async def list_admin_users(
    db: AsyncSession,
    *,
    page: int,
    page_size: int,
    q: str | None,
) -> AdminUserListResponse:
    base = (
        select(
            User.id,
            User.email,
            User.nickname,
            User.created_at,
            func.count(Assessment.id).label("assessment_count"),
            func.max(Assessment.created_at).label("latest_assessment_at"),
        )
        .select_from(User)
        .outerjoin(Assessment, Assessment.user_id == User.id)
        .group_by(User.id)
    )

    if q:
        pattern = f"%{q.strip()}%"
        base = base.where(or_(User.email.ilike(pattern), User.nickname.ilike(pattern)))

    count_stmt = select(func.count()).select_from(base.subquery())
    total = int((await db.execute(count_stmt)).scalar_one())

    offset = (page - 1) * page_size
    rows = (
        await db.execute(
            base.order_by(User.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
    ).all()

    items = [
        AdminUserItem(
            id=str(r.id),
            email=r.email,
            nickname=r.nickname,
            created_at=_iso(r.created_at) or "",
            assessment_count=int(r.assessment_count or 0),
            latest_assessment_at=_iso(r.latest_assessment_at),
        )
        for r in rows
    ]

    return AdminUserListResponse(page=page, page_size=page_size, total=total, items=items)


async def list_admin_assessments(
    db: AsyncSession,
    *,
    page: int,
    page_size: int,
    q: str | None,
    high_risk_only: bool,
) -> AdminAssessmentListResponse:
    base = (
        select(
            Assessment.id,
            Assessment.user_id,
            User.email,
            User.nickname,
            Assessment.type,
            Assessment.total_score,
            Assessment.severity,
            Assessment.created_at,
        )
        .join(User, User.id == Assessment.user_id)
    )

    if q:
        pattern = f"%{q.strip()}%"
        base = base.where(
            or_(
                User.email.ilike(pattern),
                User.nickname.ilike(pattern),
                cast(Assessment.type, String).ilike(pattern),
            )
        )

    if high_risk_only:
        base = base.where(_is_high_risk_expr())

    count_stmt = select(func.count()).select_from(base.subquery())
    total = int((await db.execute(count_stmt)).scalar_one())

    offset = (page - 1) * page_size
    rows = (
        await db.execute(
            base.order_by(Assessment.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
    ).all()

    items = [
        AdminAssessmentItem(
            id=str(r.id),
            user_id=str(r.user_id),
            user_email=r.email,
            user_nickname=r.nickname,
            type=str(r.type),
            total_score=int(r.total_score),
            severity=r.severity,
            created_at=_iso(r.created_at) or "",
        )
        for r in rows
    ]

    return AdminAssessmentListResponse(page=page, page_size=page_size, total=total, items=items)


async def list_admin_high_risk(db: AsyncSession, *, limit: int = 100) -> AdminHighRiskListResponse:
    stmt = (
        select(
            Assessment.id,
            Assessment.user_id,
            User.email,
            User.nickname,
            Assessment.type,
            Assessment.total_score,
            Assessment.severity,
            Assessment.created_at,
        )
        .join(User, User.id == Assessment.user_id)
        .where(_is_high_risk_expr())
        .order_by(Assessment.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()

    items: list[AdminHighRiskItem] = []
    for r in rows:
        reason_parts = []
        if int(r.total_score) >= 15:
            reason_parts.append("score>=15")
        if r.severity in HIGH_RISK_SEVERITIES:
            reason_parts.append(f"severity={r.severity}")

        items.append(
            AdminHighRiskItem(
                assessment_id=str(r.id),
                user_id=str(r.user_id),
                user_email=r.email,
                user_nickname=r.nickname,
                type=str(r.type),
                total_score=int(r.total_score),
                severity=r.severity,
                risk_reason="|".join(reason_parts) if reason_parts else "rule_match",
                created_at=_iso(r.created_at) or "",
            )
        )

    return AdminHighRiskListResponse(total=len(items), items=items)
