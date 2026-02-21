from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, constr

EmailStrLite = constr(min_length=5, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PasswordStr = constr(min_length=8, max_length=128)
NicknameStr = constr(min_length=1, max_length=50)


class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    email: EmailStrLite
    password: PasswordStr
    nickname: NicknameStr


class UserLogin(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    email: EmailStrLite
    password: PasswordStr


class UserOut(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True, strict=True)

    id: UUID
    email: str
    nickname: str
    created_at: datetime


class TokenResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    access_token: str
    token_type: str = Field(default="bearer")
    expires_in: int
