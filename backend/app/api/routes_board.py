from __future__ import annotations

import asyncio
import os
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
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
    BoardToggleResponse,
)

router = APIRouter(prefix="/board", tags=["board"])

_BOARD_SCHEMA_READY = False
_BOARD_SCHEMA_LOCK = asyncio.Lock()
_ADMIN_REPLY_PREFIX = "[관리자답변]"


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
            has_is_private = await conn.run_sync(
                lambda sync_conn: 'is_private' in {c['name'] for c in inspect(sync_conn).get_columns('board_post')}
            )
            if not has_is_private:
                await db.execute(text('ALTER TABLE board_post ADD COLUMN is_private BOOLEAN NOT NULL DEFAULT FALSE'))
                await db.commit()
        except SQLAlchemyError:
            await db.rollback()
            raise

        _BOARD_SCHEMA_READY = True



def _get_admin_emails() -> set[str]:
    raw = os.getenv("ADMIN_EMAILS", "")
    return {x.strip().lower() for x in raw.split(",") if x.strip()}


def _is_admin(user: UserOut) -> bool:
    return user.email.lower() in _get_admin_emails()


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
    db: AsyncSession = Depends(get_db),
) -> BoardPostListResponse:
    await _ensure_board_schema(db)
    rows, total = await crud.list_board_posts(db, q=q, category=category, page=page, page_size=page_size)
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
    if payload.is_notice and not _is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="공지 작성은 관리자만 가능합니다.")

    try:
        created = await crud.create_board_post(
            db,
            author_id=current_user.id,
            category=payload.category,
            title=payload.title,
            content=payload.content,
            is_notice=payload.is_notice,
            is_private=payload.is_private,
        )
    except SQLAlchemyError:
        # 구버전 DB(enum: 질문) 호환을 위해 문의 저장 실패 시 질문으로 1회 재시도
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
            # 알림 저장 실패가 게시글 저장 실패로 전파되지 않도록 방어
            pass

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

    admin = _is_admin(current_user)
    if row.author_id != current_user.id and not admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="수정 권한이 없습니다.")
    if payload.is_notice is not None and not admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="공지 수정은 관리자만 가능합니다.")

    try:
        updated = await crud.update_board_post(
            db,
            row,
            title=payload.title,
            content=payload.content,
            category=payload.category,
            is_notice=payload.is_notice,
            is_private=payload.is_private,
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
        )
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

    if row.author_id != current_user.id and not _is_admin(current_user):
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
        if not _is_admin(current_user):
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
