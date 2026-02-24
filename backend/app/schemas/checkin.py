from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, conint, confloat, constr


NoteStr = constr(min_length=0, max_length=1000)


class CheckinCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    mood_score: conint(ge=1, le=10)
    sleep_hours: confloat(ge=0, le=24) | None = None
    exercised: bool = False
    note: NoteStr | None = None
    challenge_completed_count: conint(ge=0, le=20) = 0
    challenge_total_count: conint(ge=0, le=20) = 0


class CheckinOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: UUID
    user_id: UUID
    mood_score: int
    sleep_hours: float | None
    exercised: bool
    note: str | None
    challenge_completed_count: int
    challenge_total_count: int
    timestamp: datetime


class CheckinResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    message: str
    disclaimer: str
    timestamp: datetime
