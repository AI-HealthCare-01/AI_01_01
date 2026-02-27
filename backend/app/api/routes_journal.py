from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes_auth import get_current_user
from app.db import crud
from app.db.session import get_db
from app.schemas.auth import UserOut
from app.schemas.journal import JournalCreateRequest, JournalListResponse, JournalOut

router = APIRouter(prefix="/journals", tags=["journal"])


def _to_out(row) -> JournalOut:
    return JournalOut(
        id=row.id,
        entry_date=row.entry_date,
        title=row.title,
        content=row.content,
        checkin_snapshot=dict(row.checkin_snapshot or {}),
        cbt_summary=dict(row.cbt_summary or {}),
        activity_challenges=list(row.activity_challenges or []),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.post("", response_model=JournalOut)
async def upsert_journal(
    payload: JournalCreateRequest,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JournalOut:
    row = await crud.create_or_update_journal_entry(
        db=db,
        user_id=current_user.id,
        entry_date=payload.entry_date,
        title=payload.title,
        content=payload.content,
        checkin_snapshot=payload.checkin_snapshot,
        cbt_summary=payload.cbt_summary,
        activity_challenges=payload.activity_challenges,
    )
    return _to_out(row)


@router.get("", response_model=JournalListResponse)
async def list_journals(
    limit: int = Query(default=180, ge=1, le=365),
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JournalListResponse:
    rows = await crud.list_journal_entries_by_user(db, user_id=current_user.id, limit=limit)
    items = [_to_out(r) for r in rows]
    return JournalListResponse(total=len(items), items=items)


@router.get("/{entry_id}", response_model=JournalOut)
async def get_journal(
    entry_id: UUID,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JournalOut:
    row = await crud.get_journal_entry_by_id(db, user_id=current_user.id, entry_id=entry_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="일기 항목을 찾을 수 없습니다.")
    return _to_out(row)
