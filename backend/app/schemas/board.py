from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, constr

from app.db.models import BoardCategory

TitleStr = constr(min_length=1, max_length=200)
ContentStr = constr(min_length=1, max_length=5000)
CommentStr = constr(min_length=1, max_length=2000)


class BoardPostCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    category: BoardCategory
    title: TitleStr
    content: ContentStr
    is_notice: bool = False
    is_private: bool = False


class BoardPostUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    category: BoardCategory | None = None
    title: TitleStr | None = None
    content: ContentStr | None = None
    is_notice: bool | None = None
    is_private: bool | None = None


class BoardCommentCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    content: CommentStr


class BoardCommentOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: UUID
    post_id: UUID
    author_id: UUID
    author_nickname: str
    content: str
    created_at: datetime


class BoardPostOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: UUID
    author_id: UUID
    author_nickname: str
    category: BoardCategory
    title: str
    content: str
    is_notice: bool
    is_private: bool = False
    likes_count: int = 0
    bookmarks_count: int = 0
    comments_count: int = 0
    liked_by_me: bool = False
    bookmarked_by_me: bool = False
    created_at: datetime
    updated_at: datetime


class BoardPostDetailOut(BoardPostOut):
    comments: list[BoardCommentOut] = Field(default_factory=list)


class BoardPostListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    page: int = Field(ge=1)
    page_size: int = Field(ge=1)
    total: int = Field(ge=0)
    items: list[BoardPostOut]


class BoardToggleResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    active: bool
    count: int
