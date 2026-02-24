from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, constr

EmailStrLite = constr(min_length=5, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PasswordStr = constr(min_length=8, max_length=128)
NicknameStr = constr(min_length=1, max_length=50)
PhoneStr = constr(min_length=7, max_length=30, pattern=r"^[0-9+\-()\s]+$")
VerificationCodeStr = constr(min_length=4, max_length=10, pattern=r"^[0-9A-Za-z]+$")


class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    email: EmailStrLite
    password: PasswordStr
    nickname: NicknameStr
    email_verification_code: VerificationCodeStr | None = None


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


class EmailVerificationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    email: EmailStrLite


class EmailVerificationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    message: str
    expires_in_seconds: int
    dev_verification_code: str | None = None


class ProfileOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    email: str
    nickname: str
    phone_number: str | None


class ProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    nickname: NicknameStr | None = None
    phone_number: PhoneStr | None = None
    current_password: PasswordStr | None = None
    new_password: PasswordStr | None = None
    new_email: EmailStrLite | None = None
    new_email_verification_code: VerificationCodeStr | None = None
