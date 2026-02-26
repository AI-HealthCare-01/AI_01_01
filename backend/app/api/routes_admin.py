from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes_auth import get_current_user
from app.db.session import get_db
from app.schemas.admin import (
    AdminAccountAddRequest,
    AdminAccountListResponse,
    AdminAccountSearchUserListResponse,
    AdminAssessmentListResponse,
    AdminChallengePolicyAuditListResponse,
    AdminChallengePolicyResponse,
    AdminChallengePolicyUpdateRequest,
    AdminGrantHistoryResponse,
    AdminHighRiskListResponse,
    AdminNotificationListResponse,
    AdminSummaryResponse,
    AdminUserListResponse,
    PendingReplyPostListResponse,
)
from app.schemas.auth import UserOut
from app.services.admin_service import (
    add_admin_account_email,
    get_admin_challenge_policy,
    get_admin_email_set,
    get_admin_summary,
    list_admin_accounts,
    list_admin_assessments,
    list_admin_challenge_policy_audit,
    list_admin_grant_history,
    list_admin_high_risk,
    list_admin_notifications,
    list_admin_users,
    list_pending_reply_posts,
    remove_admin_account_email,
    search_registered_users_for_admin_add,
    update_admin_challenge_policy,
)

router = APIRouter(prefix="/admin", tags=["admin"])


async def require_admin(
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    admin_emails = await get_admin_email_set(db)
    if not admin_emails or current_user.email.lower() not in admin_emails:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 계정이 아닙니다.")
    return current_user


@router.get("/summary", response_model=AdminSummaryResponse)
async def admin_summary(_: UserOut = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> AdminSummaryResponse:
    return await get_admin_summary(db)


@router.get("/users", response_model=AdminUserListResponse)
async def admin_users(
    page: int = Query(default=1, ge=1, le=2000),
    page_size: int = Query(default=20, ge=1, le=100),
    q: str | None = Query(default=None, min_length=1, max_length=200),
    sort_by: str = Query(default="created_at", pattern="^(email|nickname|created_at|assessment_count|chat_count|board_post_count)$"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    _: UserOut = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserListResponse:
    return await list_admin_users(db, page=page, page_size=page_size, q=q, sort_by=sort_by, sort_order=sort_order)


@router.get("/assessments", response_model=AdminAssessmentListResponse)
async def admin_assessments(
    page: int = Query(default=1, ge=1, le=2000),
    page_size: int = Query(default=20, ge=1, le=100),
    q: str | None = Query(default=None, min_length=1, max_length=200),
    high_risk_only: bool = Query(default=False),
    _: UserOut = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminAssessmentListResponse:
    return await list_admin_assessments(db, page=page, page_size=page_size, q=q, high_risk_only=high_risk_only)


@router.get("/high-risk", response_model=AdminHighRiskListResponse)
async def admin_high_risk(
    limit: int = Query(default=100, ge=1, le=500),
    _: UserOut = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminHighRiskListResponse:
    return await list_admin_high_risk(db, limit=limit)


@router.get('/notifications', response_model=AdminNotificationListResponse)
async def admin_notifications(
    limit: int = Query(default=50, ge=1, le=200),
    _: UserOut = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminNotificationListResponse:
    return await list_admin_notifications(db, limit=limit)


@router.get('/board/pending-replies', response_model=PendingReplyPostListResponse)
async def admin_pending_replies(
    limit: int = Query(default=100, ge=1, le=500),
    _: UserOut = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> PendingReplyPostListResponse:
    admin_emails = await get_admin_email_set(db)
    return await list_pending_reply_posts(db, admin_emails=admin_emails, limit=limit)


@router.get('/accounts', response_model=AdminAccountListResponse)
async def admin_accounts(
    current_user: UserOut = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminAccountListResponse:
    return await list_admin_accounts(db, current_user_email=current_user.email)


@router.get('/accounts/search-users', response_model=AdminAccountSearchUserListResponse)
async def admin_search_registered_users(
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(default=10, ge=1, le=30),
    _: UserOut = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminAccountSearchUserListResponse:
    return await search_registered_users_for_admin_add(db, q=q, limit=limit)


@router.post('/accounts', response_model=AdminAccountListResponse)
async def admin_add_account(
    payload: AdminAccountAddRequest,
    current_user: UserOut = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminAccountListResponse:
    try:
        return await add_admin_account_email(
            db,
            email=payload.email,
            actor_user_id=current_user.id,
            actor_email=current_user.email,
            actor_nickname=current_user.nickname,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete('/accounts/{email}', response_model=AdminAccountListResponse)
async def admin_remove_account(
    email: str,
    current_user: UserOut = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminAccountListResponse:
    try:
        return await remove_admin_account_email(
            db,
            email=email,
            actor_user_id=current_user.id,
            actor_email=current_user.email,
            actor_nickname=current_user.nickname,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.get('/accounts/grants', response_model=AdminGrantHistoryResponse)
async def admin_account_grants(
    limit: int = Query(default=100, ge=1, le=500),
    _: UserOut = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminGrantHistoryResponse:
    return await list_admin_grant_history(db, limit=limit)


@router.get('/challenge-policy', response_model=AdminChallengePolicyResponse)
async def admin_get_challenge_policy(
    _: UserOut = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminChallengePolicyResponse:
    return await get_admin_challenge_policy(db)


@router.put('/challenge-policy', response_model=AdminChallengePolicyResponse)
async def admin_put_challenge_policy(
    payload: AdminChallengePolicyUpdateRequest,
    current_user: UserOut = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminChallengePolicyResponse:
    return await update_admin_challenge_policy(
        db,
        payload,
        actor_user_id=current_user.id,
        actor_email=current_user.email,
        actor_nickname=current_user.nickname,
    )


@router.get('/challenge-policy/audit', response_model=AdminChallengePolicyAuditListResponse)
async def admin_challenge_policy_audit(
    limit: int = Query(default=50, ge=1, le=200),
    _: UserOut = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminChallengePolicyAuditListResponse:
    return await list_admin_challenge_policy_audit(db, limit=limit)
