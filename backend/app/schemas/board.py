from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, constr

from app.db.models import BoardCategory

TitleStr = constr(min_length=1, max_length=200)
ContentStr = constr(min_length=1, max_length=5000)


class BoardPostCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    category: BoardCategory
    title: TitleStr
    content: ContentStr
    is_notice: bool = False


class BoardPostUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    category: BoardCategory | None = None
    title: TitleStr | None = None
    content: ContentStr | None = None
    is_notice: bool | None = None


class BoardPostOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: UUID
    author_id: UUID
    author_nickname: str
    category: BoardCategory
    title: str
    content: str
    is_notice: bool
    created_at: datetime
    updated_at: datetime


class BoardPostListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    page: int = Field(ge=1)
    page_size: int = Field(ge=1)
    total: int = Field(ge=0)
    items: list[BoardPostOut]
