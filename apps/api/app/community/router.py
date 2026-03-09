from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.admin_console.deps import get_admin_console_store
from app.admin_console.models import AdminActorContext, AdminBaseRole
from app.admin_console.store import AdminConsoleStore

from .deps import get_community_store, get_verified_user_id
from .models import (
    BoardCommentCreateRequest,
    BoardCommentListItem,
    BoardCommentPayload,
    BoardFeedItem,
    BoardListResponse,
    BoardPostCreateRequest,
    BoardPostUpdateRequest,
    BoardReportRequest,
    BoardToggleResponse,
    ModerationQueuesResponse,
    MyPageCommentSummary,
    MyPageConsentResponse,
    MyPageConsentUpdateRequest,
    MyPageHomeResponse,
    MyPagePostSummary,
    MyPageProfileUpdateRequest,
    MyPageProfileUpdateResponse,
    MyPageReportVaultItem,
    PasswordChangeRequest,
    PasswordChangeResponse,
    SupportAdminReplyRequest,
    SupportFollowupRequest,
    SupportNotificationListResponse,
    SupportNotificationPayload,
    SupportQueueSummaryResponse,
    SupportResolveResponse,
    SupportTicketCreateRequest,
    SupportTicketDetailResponse,
    SupportTicketListItem,
    SupportTicketStatus,
)
from .store import CommunityStore

router = APIRouter(tags=["board-support-mypage"])


def _map_store_error(error: ValueError) -> HTTPException:
    code = str(error)
    if code in {
        "post_not_found",
        "report_not_found",
        "ticket_not_found",
        "notification_not_found",
        "account_not_found",
    }:
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=code)

    if code in {"ticket_closed", "already_reported"}:
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=code)

    if code in {
        "invalid_cursor",
        "password_confirm_mismatch",
        "password_reuse_forbidden",
        "invalid_birth_year",
        "nickname_invalid",
        "coach_name_invalid",
        "invalid_post_body",
        "invalid_post_body_bytes",
    }:
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=code)

    if code in {"post_edit_forbidden", "post_delete_forbidden"}:
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=code)

    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=code)


def _get_admin_console_actor(user_id: str, admin_store: AdminConsoleStore) -> AdminActorContext:
    try:
        return admin_store.get_actor_context(user_id)
    except ValueError as error:
        code = str(error)
        if code == "admin_role_not_assigned":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="admin_role_not_assigned",
            ) from error
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=code) from error


def _ensure_admin_console_actor(user_id: str, admin_store: AdminConsoleStore) -> AdminActorContext:
    actor = _get_admin_console_actor(user_id, admin_store)
    if actor.base_role in {AdminBaseRole.owner, AdminBaseRole.admin, AdminBaseRole.support}:
        return actor
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin_console_forbidden")


@router.get("/v1/board/feed", response_model=BoardListResponse)
def list_board_feed(
    cursor: str | None = None,
    limit: int = Query(default=15, ge=1, le=20),
    q: str | None = None,
    tag: str | None = None,
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> BoardListResponse:
    try:
        return store.list_board_feed(user_id, cursor, limit, q, tag)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/board/notices", response_model=BoardListResponse)
def list_board_notices(
    cursor: str | None = None,
    limit: int = Query(default=15, ge=1, le=20),
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> BoardListResponse:
    try:
        return store.list_board_notices(user_id, cursor, limit)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/board/bookmarks", response_model=BoardListResponse)
def list_board_bookmarks(
    cursor: str | None = None,
    limit: int = Query(default=15, ge=1, le=20),
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> BoardListResponse:
    try:
        return store.list_board_bookmarks(user_id, cursor, limit)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/v1/board/post", response_model=BoardFeedItem)
def create_board_post(
    payload: BoardPostCreateRequest,
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
    admin_store: AdminConsoleStore = Depends(get_admin_console_store),
) -> BoardFeedItem:
    if payload.is_notice or payload.is_pinned_notice:
        try:
            actor = admin_store.get_actor_context(user_id)
            can_write_notice = actor.base_role in {
                AdminBaseRole.owner,
                AdminBaseRole.admin,
                AdminBaseRole.support,
            }
        except ValueError as error:
            if str(error) == "admin_role_not_assigned":
                can_write_notice = False
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=str(error),
                ) from error

        if not can_write_notice:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="notice_admin_required",
            )

    try:
        return store.create_board_post(user_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.patch("/v1/board/post/{post_id}", response_model=BoardFeedItem)
def update_board_post(
    post_id: str,
    payload: BoardPostUpdateRequest,
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> BoardFeedItem:
    try:
        return store.update_board_post(user_id, post_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.delete("/v1/board/post/{post_id}", response_model=BoardToggleResponse)
def delete_board_post(
    post_id: str,
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> BoardToggleResponse:
    try:
        return store.delete_board_post(user_id, post_id)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/v1/board/post/{post_id}/like", response_model=BoardToggleResponse)
def toggle_post_like(
    post_id: str,
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> BoardToggleResponse:
    try:
        return store.toggle_post_like(user_id, post_id)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/v1/board/post/{post_id}/bookmark", response_model=BoardToggleResponse)
def toggle_post_bookmark(
    post_id: str,
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> BoardToggleResponse:
    try:
        return store.toggle_post_bookmark(user_id, post_id)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/v1/board/post/{post_id}/report", response_model=BoardToggleResponse)
def report_board_post(
    post_id: str,
    payload: BoardReportRequest,
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> BoardToggleResponse:
    try:
        return store.report_post(user_id, post_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/v1/board/post/{post_id}/comments", response_model=BoardCommentPayload)
def create_board_comment(
    post_id: str,
    payload: BoardCommentCreateRequest,
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> BoardCommentPayload:
    try:
        return store.create_post_comment(user_id, post_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/board/post/{post_id}/comments", response_model=list[BoardCommentListItem])
def list_board_comments(
    post_id: str,
    limit: int = Query(default=30, ge=1, le=100),
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> list[BoardCommentListItem]:
    try:
        return store.list_post_comments(user_id, post_id, limit)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/admin/moderation/queues", response_model=ModerationQueuesResponse)
def list_moderation_queues(
    limit: int = Query(default=20, ge=1, le=100),
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
    admin_store: AdminConsoleStore = Depends(get_admin_console_store),
) -> ModerationQueuesResponse:
    actor = _ensure_admin_console_actor(user_id, admin_store)
    if actor.base_role == AdminBaseRole.support:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="admin_or_owner_required",
        )
    return store.list_moderation_queues(limit)


@router.post("/v1/support/tickets", response_model=SupportTicketDetailResponse)
def create_support_ticket(
    payload: SupportTicketCreateRequest,
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> SupportTicketDetailResponse:
    try:
        return store.create_support_ticket(user_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/support/tickets", response_model=list[SupportTicketListItem])
def list_support_tickets(
    status_filter: SupportTicketStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=30, ge=1, le=100),
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> list[SupportTicketListItem]:
    try:
        return store.list_support_tickets(user_id, status_filter, limit)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/support/tickets/{ticket_id}", response_model=SupportTicketDetailResponse)
def get_support_ticket_detail(
    ticket_id: str,
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> SupportTicketDetailResponse:
    try:
        return store.get_support_ticket_detail(user_id, ticket_id)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/v1/support/tickets/{ticket_id}/followup", response_model=SupportTicketDetailResponse)
def create_support_followup(
    ticket_id: str,
    payload: SupportFollowupRequest,
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> SupportTicketDetailResponse:
    try:
        return store.add_support_followup(user_id, ticket_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/v1/support/tickets/{ticket_id}/resolve", response_model=SupportResolveResponse)
def resolve_support_ticket(
    ticket_id: str,
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> SupportResolveResponse:
    try:
        return store.resolve_support_ticket(user_id, ticket_id)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/support/notifications", response_model=SupportNotificationListResponse)
def list_support_notifications(
    unread_only: bool = Query(default=False),
    limit: int = Query(default=30, ge=1, le=100),
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> SupportNotificationListResponse:
    return store.list_support_notifications(user_id, unread_only, limit)


@router.post(
    "/v1/support/notifications/{notification_id}/read",
    response_model=SupportNotificationPayload,
)
def mark_support_notification_read(
    notification_id: str,
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> SupportNotificationPayload:
    try:
        return store.mark_support_notification_read(user_id, notification_id)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post(
    "/v1/admin/support/tickets/{ticket_id}/reply",
    response_model=SupportTicketDetailResponse,
)
def add_admin_reply(
    ticket_id: str,
    payload: SupportAdminReplyRequest,
    actor_user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
    admin_store: AdminConsoleStore = Depends(get_admin_console_store),
) -> SupportTicketDetailResponse:
    _ensure_admin_console_actor(actor_user_id, admin_store)
    try:
        return store.add_admin_reply(ticket_id, payload, actor_user_id)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/admin/support/queue-summary", response_model=SupportQueueSummaryResponse)
def get_support_queue_summary(
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
    admin_store: AdminConsoleStore = Depends(get_admin_console_store),
) -> SupportQueueSummaryResponse:
    _ensure_admin_console_actor(user_id, admin_store)
    return store.get_support_queue_summary()


@router.get("/v1/mypage/home", response_model=MyPageHomeResponse)
def get_mypage_home(
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> MyPageHomeResponse:
    try:
        return store.get_mypage_home(user_id)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.patch("/v1/mypage/profile", response_model=MyPageProfileUpdateResponse)
def patch_mypage_profile(
    payload: MyPageProfileUpdateRequest,
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> MyPageProfileUpdateResponse:
    try:
        return store.update_mypage_profile(user_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.post("/v1/mypage/security/password", response_model=PasswordChangeResponse)
def request_password_change(
    payload: PasswordChangeRequest,
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> PasswordChangeResponse:
    try:
        return store.request_password_change(user_id, payload)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/mypage/bookmarks", response_model=list[MyPagePostSummary])
def list_mypage_bookmarks(
    limit: int = Query(default=30, ge=1, le=100),
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> list[MyPagePostSummary]:
    return store.list_mypage_bookmarks(user_id, limit)


@router.get("/v1/mypage/my-posts", response_model=list[MyPagePostSummary])
def list_mypage_posts(
    limit: int = Query(default=30, ge=1, le=100),
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> list[MyPagePostSummary]:
    return store.list_mypage_my_posts(user_id, limit)


@router.get("/v1/mypage/my-comments", response_model=list[MyPageCommentSummary])
def list_mypage_comments(
    limit: int = Query(default=30, ge=1, le=100),
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> list[MyPageCommentSummary]:
    return store.list_mypage_my_comments(user_id, limit)


@router.get("/v1/mypage/support-tickets", response_model=list[SupportTicketListItem])
def list_mypage_support_tickets(
    status_filter: SupportTicketStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=30, ge=1, le=100),
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> list[SupportTicketListItem]:
    return store.list_support_tickets(user_id, status_filter, limit)


@router.get("/v1/mypage/report-vault", response_model=list[MyPageReportVaultItem])
def list_mypage_report_vault(
    limit: int = Query(default=30, ge=1, le=100),
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> list[MyPageReportVaultItem]:
    return store.list_mypage_report_vault(user_id, limit)


@router.delete("/v1/mypage/report-vault/{report_id}", response_model=BoardToggleResponse)
def delete_mypage_report_vault_item(
    report_id: str,
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> BoardToggleResponse:
    try:
        return store.delete_mypage_report_vault_item(user_id, report_id)
    except ValueError as error:
        raise _map_store_error(error) from error


@router.get("/v1/mypage/consents", response_model=MyPageConsentResponse)
def get_mypage_consents(
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> MyPageConsentResponse:
    return store.get_mypage_consents(user_id)


@router.patch("/v1/mypage/consents", response_model=MyPageConsentResponse)
def patch_mypage_consents(
    payload: MyPageConsentUpdateRequest,
    user_id: str = Depends(get_verified_user_id),
    store: CommunityStore = Depends(get_community_store),
) -> MyPageConsentResponse:
    return store.update_mypage_consents(user_id, payload)
