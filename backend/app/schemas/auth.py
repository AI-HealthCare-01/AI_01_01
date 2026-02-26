from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, constr

EmailStrLite = constr(min_length=5, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PasswordStr = constr(min_length=8, max_length=128)
NicknameStr = constr(min_length=1, max_length=50)
VerificationCodeStr = constr(min_length=4, max_length=10, pattern=r"^[0-9A-Za-z]+$")
SecurityQuestionStr = constr(min_length=2, max_length=200)
SecurityAnswerStr = constr(min_length=1, max_length=200)


class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    email: EmailStrLite
    password: PasswordStr
    nickname: NicknameStr
    security_question: SecurityQuestionStr | None = None
    security_answer: SecurityAnswerStr | None = None
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
    phone_number: str | None = None


class ProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    nickname: NicknameStr | None = None
    current_password: PasswordStr | None = None
    new_password: PasswordStr | None = None


class PasswordVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    current_password: PasswordStr


class PasswordVerifyResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    matched: bool


class PasswordRecoveryQuestionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    email: EmailStrLite


class PasswordRecoveryQuestionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    question: str


class PasswordRecoveryVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    email: EmailStrLite
    security_answer: SecurityAnswerStr


class PasswordRecoveryVerifyResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    matched: bool


class PasswordRecoveryResetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    email: EmailStrLite
    security_answer: SecurityAnswerStr
    new_password: PasswordStr


class PasswordRecoveryResetResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    message: str
