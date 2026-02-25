from __future__ import annotations

import os
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes_auth import get_current_user
from app.db import crud
from app.db.models import BoardCategory, User
from app.db.session import get_db
from app.schemas.auth import UserOut
from app.schemas.board import (
    BoardPostCreateRequest,
    BoardPostListResponse,
    BoardPostOut,
    BoardPostUpdateRequest,
)

router = APIRouter(prefix="/board", tags=["board"])


def _get_admin_emails() -> set[str]:
    raw = os.getenv("ADMIN_EMAILS", "")
    return {x.strip().lower() for x in raw.split(",") if x.strip()}


def _is_admin(user: UserOut) -> bool:
    return user.email.lower() in _get_admin_emails()


async def _map_post(db: AsyncSession, post_id: UUID) -> BoardPostOut:
    row = await crud.get_board_post_by_id(db, post_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="게시글을 찾을 수 없습니다.")

    author = await crud.get_user_by_id(db, row.author_id)
    if not author:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="작성자를 찾을 수 없습니다.")

    return BoardPostOut(
        id=row.id,
        author_id=row.author_id,
        author_nickname=author.nickname,
        category=row.category,
        title=row.title,
        content=row.content,
        is_notice=row.is_notice,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/posts", response_model=BoardPostListResponse)
async def list_posts(
    page: int = Query(default=1, ge=1, le=2000),
    page_size: int = Query(default=10, ge=1, le=100),
    q: str | None = Query(default=None, min_length=1, max_length=200),
    category: BoardCategory | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> BoardPostListResponse:
    rows, total = await crud.list_board_posts(db, q=q, category=category, page=page, page_size=page_size)
    if not rows:
        return BoardPostListResponse(page=page, page_size=page_size, total=total, items=[])

    author_ids = {row.author_id for row in rows}
    user_stmt: Select[tuple[User]] = select(User).where(User.id.in_(author_ids))
    users = list((await db.execute(user_stmt)).scalars().all())
    nickname_by_id = {u.id: u.nickname for u in users}

    items = [
        BoardPostOut(
            id=row.id,
            author_id=row.author_id,
            author_nickname=nickname_by_id.get(row.author_id, "알 수 없음"),
            category=row.category,
            title=row.title,
            content=row.content,
            is_notice=row.is_notice,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in rows
    ]
    return BoardPostListResponse(page=page, page_size=page_size, total=total, items=items)


@router.get("/posts/{post_id}", response_model=BoardPostOut)
async def get_post(
    post_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> BoardPostOut:
    return await _map_post(db, post_id)


@router.post("/posts", response_model=BoardPostOut, status_code=status.HTTP_201_CREATED)
async def create_post(
    payload: BoardPostCreateRequest,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BoardPostOut:
    if payload.is_notice and not _is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="공지 작성은 관리자만 가능합니다.")

    created = await crud.create_board_post(
        db,
        author_id=current_user.id,
        category=payload.category,
        title=payload.title,
        content=payload.content,
        is_notice=payload.is_notice,
    )
    return await _map_post(db, created.id)


@router.patch("/posts/{post_id}", response_model=BoardPostOut)
async def update_post(
    post_id: UUID,
    payload: BoardPostUpdateRequest,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BoardPostOut:
    row = await crud.get_board_post_by_id(db, post_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="게시글을 찾을 수 없습니다.")

    admin = _is_admin(current_user)
    if row.author_id != current_user.id and not admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="수정 권한이 없습니다.")
    if payload.is_notice is not None and not admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="공지 수정은 관리자만 가능합니다.")

    await crud.update_board_post(
        db,
        row,
        title=payload.title,
        content=payload.content,
        category=payload.category,
        is_notice=payload.is_notice,
    )
    return await _map_post(db, post_id)


@router.delete("/posts/{post_id}")
async def delete_post(
    post_id: UUID,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    row = await crud.get_board_post_by_id(db, post_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="게시글을 찾을 수 없습니다.")

    if row.author_id != current_user.id and not _is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="삭제 권한이 없습니다.")

    await crud.delete_board_post(db, row)
    return {"message": "삭제되었습니다."}
