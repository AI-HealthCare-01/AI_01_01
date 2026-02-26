from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, conint, constr

DateStr = constr(pattern=r"^\d{4}-\d{2}-\d{2}$")
NameStr = constr(min_length=1, max_length=160)
CategoryStr = constr(min_length=1, max_length=50)
DetailStr = constr(min_length=0, max_length=1000)


class ContentChallengeCatalogItem(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: str
    title: str
    description: str
    category: str


class ContentChallengeCatalogResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    items: list[ContentChallengeCatalogItem]


class ContentChallengeLogCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    challenge_name: NameStr
    category: CategoryStr = "생활습관"
    performed_date: DateStr
    duration_minutes: conint(ge=0, le=600) | None = None
    detail: DetailStr | None = None


class ContentChallengeLogOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: UUID
    challenge_name: str
    category: str
    performed_date: str
    duration_minutes: int | None
    detail: str | None
    created_at: datetime


class ContentChallengeLogListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    total: int
    items: list[ContentChallengeLogOut]
