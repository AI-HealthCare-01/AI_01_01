from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, constr

TitleStr = constr(min_length=1, max_length=160)
ContentStr = constr(min_length=1, max_length=8000)
DateStr = constr(pattern=r"^\d{4}-\d{2}-\d{2}$")


class JournalCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    entry_date: DateStr
    title: TitleStr = "오늘의 일기"
    content: ContentStr
    checkin_snapshot: dict = Field(default_factory=dict)
    cbt_summary: dict = Field(default_factory=dict)
    activity_challenges: list[dict] = Field(default_factory=list)


class JournalOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: UUID
    entry_date: str
    title: str
    content: str
    checkin_snapshot: dict
    cbt_summary: dict
    activity_challenges: list[dict]
    created_at: datetime
    updated_at: datetime


class JournalListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    total: int
    items: list[JournalOut]
