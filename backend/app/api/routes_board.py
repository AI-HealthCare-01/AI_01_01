from __future__ import annotations

import asyncio
import os
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import Select, inspect, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes_auth import get_current_user
from app.db import crud
from app.db.models import AdminNotificationType, BoardCategory, User
from app.db.session import get_db, init_db
from app.schemas.auth import UserOut
from app.schemas.board import (
    BoardCommentCreateRequest,
    BoardCommentOut,
    BoardPostCreateRequest,
    BoardPostDetailOut,
    BoardPostListResponse,
    BoardPostOut,
    BoardPostUpdateRequest,
    BoardReportCreateRequest,
    BoardToggleResponse,
)

router = APIRouter(prefix="/board", tags=["board"])

_BOARD_SCHEMA_READY = False
_BOARD_SCHEMA_LOCK = asyncio.Lock()
_ADMIN_REPLY_PREFIX = "[관리자답변]"
_BOARD_RISK_KEYWORDS_KEY = "board_risk_keywords_v1"
_DEFAULT_RISK_KEYWORDS = [
    "죽이고",
    "죽여",
    "해치",
    "협박",
    "폭행",
    "자해",
    "자살",
    "테러",
    "살해",
    "살인",
]


async def _ensure_board_schema(db: AsyncSession) -> None:
    global _BOARD_SCHEMA_READY
    if _BOARD_SCHEMA_READY:
        return

    async with _BOARD_SCHEMA_LOCK:
        if _BOARD_SCHEMA_READY:
            return

        await init_db()

        try:
            conn = await db.connection()
            cols = await conn.run_sync(lambda sync_conn: {c['name'] for c in inspect(sync_conn).get_columns('board_post')})
            if 'is_private' not in cols:
                await db.execute(text('ALTER TABLE board_post ADD COLUMN is_private BOOLEAN NOT NULL DEFAULT FALSE'))
            if 'is_mental_health_post' not in cols:
                await db.execute(text('ALTER TABLE board_post ADD COLUMN is_mental_health_post BOOLEAN NOT NULL DEFAULT FALSE'))
            await db.commit()
        except SQLAlchemyError:
            await db.rollback()
            raise

        _BOARD_SCHEMA_READY = True



def _get_admin_emails() -> set[str]:
    raw = os.getenv("ADMIN_EMAILS", "")
    return {x.strip().lower() for x in raw.split(",") if x.strip()}



async def _is_admin_user(db: AsyncSession, user: UserOut) -> bool:
    env_set = _get_admin_emails()
    cfg = await crud.get_app_config_json(db, "admin_emails_v1")
    db_set: set[str] = set()
    if isinstance(cfg, dict) and isinstance(cfg.get("emails"), list):
        db_set = {str(x).strip().lower() for x in cfg.get("emails", []) if str(x).strip()}
    return user.email.lower() in (env_set | db_set)



def _canonical_category(value: BoardCategory | str) -> BoardCategory:
    raw = value.value if hasattr(value, "value") else str(value)
    if raw in {BoardCategory.INQUIRY.value, BoardCategory.LEGACY_INQUIRY.value}:
        return BoardCategory.INQUIRY
    try:
        return BoardCategory(raw)
    except Exception:
        return BoardCategory.FREE



def _is_inquiry_or_feedback(value: BoardCategory | str) -> bool:
    raw = value.value if hasattr(value, "value") else str(value)
    return raw in {
        BoardCategory.INQUIRY.value,
        BoardCategory.LEGACY_INQUIRY.value,
        BoardCategory.FEEDBACK.value,
    }



def _normalize_keywords(raw: dict | None) -> list[str]:
    if not isinstance(raw, dict):
        return list(_DEFAULT_RISK_KEYWORDS)
    arr = raw.get("keywords")
    if not isinstance(arr, list):
        return list(_DEFAULT_RISK_KEYWORDS)
    cleaned: list[str] = []
    for item in arr:
        token = str(item).strip().lower()
        if token and token not in cleaned:
            cleaned.append(token)
    return cleaned or list(_DEFAULT_RISK_KEYWORDS)


async def _load_risk_keywords(db: AsyncSession) -> list[str]:
    raw = await crud.get_app_config_json(db, _BOARD_RISK_KEYWORDS_KEY)
    return _normalize_keywords(raw)



def _find_risk_keywords(text_value: str, keywords: list[str]) -> list[str]:
    text_lower = text_value.lower()
    matched: list[str] = []
    for kw in keywords:
        if kw in text_lower and kw not in matched:
            matched.append(kw)
    return matched



def _extract_client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("x-forwarded-for", "").strip()
    if forwarded_for:
        first = forwarded_for.split(",")[0].strip()
        if first:
            return first
    if request.client and request.client.host:
        return request.client.host
    return None


async def _notify_if_risky_post(db: AsyncSession, *, post, actor_nickname: str) -> None:
    keywords = await _load_risk_keywords(db)
    matched = _find_risk_keywords(f"{post.title}\n{post.content}", keywords)
    if not matched:
        return

    try:
        await crud.create_admin_notification(
            db,
            ntype=AdminNotificationType.BOARD_FEEDBACK,
            title="위험 키워드 감지 게시글",
            message=f"{actor_nickname}님의 게시글에서 위험 키워드({', '.join(matched)})가 감지되었습니다.",
            ref_post_id=post.id,
        )
    except Exception:
        pass


async def _map_post(db: AsyncSession, row, viewer_id: UUID | None = None) -> BoardPostOut:
    author = await crud.get_user_by_id(db, row.author_id)
    author_nickname = author.nickname if author else "탈퇴 사용자"

    likes_count = await crud.count_board_likes(db, row.id)
    bookmarks_count = await crud.count_board_bookmarks(db, row.id)
    comments_count = await crud.count_board_comments(db, row.id)

    liked = bool(viewer_id and await crud.has_liked_post(db, row.id, viewer_id))
    bookmarked = bool(viewer_id and await crud.has_bookmarked_post(db, row.id, viewer_id))

    return BoardPostOut(
        id=row.id,
        author_id=row.author_id,
        author_nickname=author_nickname,
        category=_canonical_category(row.category),
        title=row.title,
        content=row.content,
        is_notice=row.is_notice,
        is_private=row.is_private,
        is_mental_health_post=bool(getattr(row, "is_mental_health_post", False)),
        likes_count=likes_count,
        bookmarks_count=bookmarks_count,
        comments_count=comments_count,
        liked_by_me=liked,
        bookmarked_by_me=bookmarked,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


async def _map_detail(db: AsyncSession, post_id: UUID, viewer_id: UUID | None = None) -> BoardPostDetailOut:
    row = await crud.get_board_post_by_id(db, post_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="게시글을 찾을 수 없습니다.")

    base = await _map_post(db, row, viewer_id=viewer_id)
    comments = await crud.list_board_comments(db, row.id)

    author_ids = {c.author_id for c in comments}
    nickname_map: dict[UUID, str] = {}
    if author_ids:
        user_stmt: Select[tuple[User]] = select(User).where(User.id.in_(author_ids))
        users = list((await db.execute(user_stmt)).scalars().all())
        nickname_map = {u.id: u.nickname for u in users}

    comment_out = [
        BoardCommentOut(
            id=c.id,
            post_id=c.post_id,
            author_id=c.author_id,
            author_nickname=nickname_map.get(c.author_id, "알 수 없음"),
            content=c.content,
            created_at=c.created_at,
        )
        for c in comments
    ]

    return BoardPostDetailOut(**base.model_dump(), comments=comment_out)


@router.get("/posts", response_model=BoardPostListResponse)
async def list_posts(
    page: int = Query(default=1, ge=1, le=2000),
    page_size: int = Query(default=10, ge=1, le=100),
    q: str | None = Query(default=None, min_length=1, max_length=200),
    category: BoardCategory | None = Query(default=None),
    mental_health_only: bool | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> BoardPostListResponse:
    await _ensure_board_schema(db)
    rows, total = await crud.list_board_posts(
        db,
        q=q,
        category=category,
        mental_health_only=mental_health_only,
        page=page,
        page_size=page_size,
    )
    if not rows:
        return BoardPostListResponse(page=page, page_size=page_size, total=total, items=[])
    items = [await _map_post(db, row, viewer_id=None) for row in rows]
    return BoardPostListResponse(page=page, page_size=page_size, total=total, items=items)


@router.get("/posts/{post_id}", response_model=BoardPostDetailOut)
async def get_post(
    post_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> BoardPostDetailOut:
    await _ensure_board_schema(db)
    return await _map_detail(db, post_id, viewer_id=None)


@router.post("/posts", response_model=BoardPostOut, status_code=status.HTTP_201_CREATED)
async def create_post(
    payload: BoardPostCreateRequest,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BoardPostOut:
    await _ensure_board_schema(db)
    admin = await _is_admin_user(db, current_user)
    if payload.is_notice and not admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="공지 작성은 관리자만 가능합니다.")
    if payload.is_mental_health_post and not admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="정신건강 포스팅은 관리자만 작성할 수 있습니다.")

    try:
        created = await crud.create_board_post(
            db,
            author_id=current_user.id,
            category=payload.category,
            title=payload.title,
            content=payload.content,
            is_notice=payload.is_notice,
            is_private=payload.is_private,
            is_mental_health_post=payload.is_mental_health_post,
        )
    except SQLAlchemyError:
        await db.rollback()
        if payload.category != BoardCategory.INQUIRY:
            raise
        created = await crud.create_board_post(
            db,
            author_id=current_user.id,
            category=BoardCategory.LEGACY_INQUIRY,
            title=payload.title,
            content=payload.content,
            is_notice=payload.is_notice,
            is_private=payload.is_private,
            is_mental_health_post=payload.is_mental_health_post,
        )

    if payload.category in {BoardCategory.INQUIRY, BoardCategory.FEEDBACK}:
        ntype = AdminNotificationType.BOARD_QUESTION if payload.category == BoardCategory.INQUIRY else AdminNotificationType.BOARD_FEEDBACK
        try:
            await crud.create_admin_notification(
                db,
                ntype=ntype,
                title=f"새 {payload.category} 게시글",
                message=f"{current_user.nickname}님이 '{payload.title}' 글을 게시했습니다.",
                ref_post_id=created.id,
            )
        except Exception:
            pass

    await _notify_if_risky_post(db, post=created, actor_nickname=current_user.nickname)
    return await _map_post(db, created, viewer_id=current_user.id)


@router.patch("/posts/{post_id}", response_model=BoardPostOut)
async def update_post(
    post_id: UUID,
    payload: BoardPostUpdateRequest,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BoardPostOut:
    await _ensure_board_schema(db)
    row = await crud.get_board_post_by_id(db, post_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="게시글을 찾을 수 없습니다.")

    admin = await _is_admin_user(db, current_user)
    if row.author_id != current_user.id and not admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="수정 권한이 없습니다.")
    if payload.is_notice is not None and not admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="공지 수정은 관리자만 가능합니다.")
    if payload.is_mental_health_post is not None and not admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="정신건강 포스팅 설정은 관리자만 가능합니다.")

    try:
        updated = await crud.update_board_post(
            db,
            row,
            title=payload.title,
            content=payload.content,
            category=payload.category,
            is_notice=payload.is_notice,
            is_private=payload.is_private,
            is_mental_health_post=payload.is_mental_health_post,
        )
    except SQLAlchemyError:
        await db.rollback()
        if payload.category != BoardCategory.INQUIRY:
            raise
        updated = await crud.update_board_post(
            db,
            row,
            title=payload.title,
            content=payload.content,
            category=BoardCategory.LEGACY_INQUIRY,
            is_notice=payload.is_notice,
            is_private=payload.is_private,
            is_mental_health_post=payload.is_mental_health_post,
        )

    await _notify_if_risky_post(db, post=updated, actor_nickname=current_user.nickname)
    return await _map_post(db, updated, viewer_id=current_user.id)


@router.delete("/posts/{post_id}")
async def delete_post(
    post_id: UUID,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    await _ensure_board_schema(db)
    row = await crud.get_board_post_by_id(db, post_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="게시글을 찾을 수 없습니다.")

    if row.author_id != current_user.id and not await _is_admin_user(db, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="삭제 권한이 없습니다.")

    await crud.delete_board_post(db, row)
    return {"message": "삭제되었습니다."}


@router.post("/posts/{post_id}/comments", response_model=BoardCommentOut, status_code=status.HTTP_201_CREATED)
async def create_comment(
    post_id: UUID,
    payload: BoardCommentCreateRequest,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BoardCommentOut:
    await _ensure_board_schema(db)
    row = await crud.get_board_post_by_id(db, post_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="게시글을 찾을 수 없습니다.")

    is_admin_reply = payload.content.strip().startswith(_ADMIN_REPLY_PREFIX)
    if is_admin_reply:
        if not await _is_admin_user(db, current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 답변은 관리자만 등록할 수 있습니다.")
        if not _is_inquiry_or_feedback(row.category):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="관리자 답변은 문의/피드백 게시물에서만 등록할 수 있습니다.",
            )

    comment = await crud.create_board_comment(db, post_id=post_id, author_id=current_user.id, content=payload.content)
    return BoardCommentOut(
        id=comment.id,
        post_id=comment.post_id,
        author_id=comment.author_id,
        author_nickname=current_user.nickname,
        content=comment.content,
        created_at=comment.created_at,
    )


@router.delete("/comments/{comment_id}")
async def delete_comment(
    comment_id: UUID,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    await _ensure_board_schema(db)
    row = await crud.get_board_comment_by_id(db, comment_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="댓글을 찾을 수 없습니다.")

    if row.author_id != current_user.id and not await _is_admin_user(db, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="댓글 삭제 권한이 없습니다.")

    await crud.delete_board_comment(db, row)
    return {"message": "삭제되었습니다."}


@router.post("/posts/{post_id}/report")
async def report_post(
    post_id: UUID,
    payload: BoardReportCreateRequest,
    request: Request,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    await _ensure_board_schema(db)
    row = await crud.get_board_post_by_id(db, post_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="게시글을 찾을 수 없습니다.")

    ip = _extract_client_ip(request)
    await crud.create_board_post_report(
        db,
        post_id=row.id,
        reporter_id=current_user.id,
        reason=payload.reason,
        detail=payload.detail,
        reporter_ip=ip,
    )

    try:
        await crud.create_admin_notification(
            db,
            ntype=AdminNotificationType.BOARD_FEEDBACK,
            title="게시글 신고 접수",
            message=f"{current_user.nickname}님이 '{row.title}' 게시글을 신고했습니다. 사유: {payload.reason}",
            ref_post_id=row.id,
        )
    except Exception:
        pass

    return {"message": "신고가 접수되었습니다."}


@router.post("/posts/{post_id}/like", response_model=BoardToggleResponse)
async def toggle_like(
    post_id: UUID,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BoardToggleResponse:
    await _ensure_board_schema(db)
    row = await crud.get_board_post_by_id(db, post_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="게시글을 찾을 수 없습니다.")

    active = await crud.toggle_post_like(db, post_id, current_user.id)
    count = await crud.count_board_likes(db, post_id)
    return BoardToggleResponse(active=active, count=count)


@router.post("/posts/{post_id}/bookmark", response_model=BoardToggleResponse)
async def toggle_bookmark(
    post_id: UUID,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BoardToggleResponse:
    await _ensure_board_schema(db)
    row = await crud.get_board_post_by_id(db, post_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="게시글을 찾을 수 없습니다.")

    active = await crud.toggle_post_bookmark(db, post_id, current_user.id)
    count = await crud.count_board_bookmarks(db, post_id)
    return BoardToggleResponse(active=active, count=count)
