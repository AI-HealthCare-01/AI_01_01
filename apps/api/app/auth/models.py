from __future__ import annotations

import re
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalize_email(value: str) -> str:
    normalized = value.strip().lower()
    if not EMAIL_PATTERN.match(normalized):
        raise ValueError("invalid_email_format")
    return normalized


class AccountStatus(str, Enum):
    pending_email_verification = "pending_email_verification"
    active_onboarding_required = "active_onboarding_required"
    active = "active"
    restricted = "restricted"
    suspended = "suspended"
    deleted = "deleted"


class OnboardingStatus(str, Enum):
    not_started = "not_started"
    profile_pending = "profile_pending"
    baseline_pending = "baseline_pending"
    complete = "complete"


class Gender(str, Enum):
    female = "female"
    male = "male"
    nonbinary = "nonbinary"
    prefer_not_to_say = "prefer_not_to_say"


class AccountContract(BaseModel):
    user_id: str
    firebase_uid: str
    nickname: str
    coach_name: str
    email: str
    email_verified: bool
    account_status: AccountStatus
    ml_subject_id: str

    @field_validator("email")
    @classmethod
    def _validate_email(cls, value: str) -> str:
        return _normalize_email(value)


class ProfileContract(BaseModel):
    birth_year: int | None = None
    gender: Gender | None = None
    age_years_derived: int | None = None
    profile_completed_at: datetime | None = None


class ConsentContract(BaseModel):
    terms_required: bool = False
    privacy_required: bool = False
    sensitive_data_required: bool = False
    personalization_optional: bool = False
    model_improvement_optional: bool = False
    marketing_optional: bool = False


class OnboardingContract(BaseModel):
    onboarding_status: OnboardingStatus = OnboardingStatus.not_started
    baseline_assessment_completed: bool = False
    dashboard_bootstrapped: bool = False
    model_bootstrapped: bool = False


class SessionContract(BaseModel):
    account: AccountContract
    profile: ProfileContract
    consents: ConsentContract
    onboarding: OnboardingContract


class SignupRequest(BaseModel):
    firebase_uid: str = Field(min_length=8, max_length=256)
    email: str
    nickname: str = Field(min_length=2, max_length=40)
    coach_name: str | None = Field(default=None, min_length=2, max_length=40)
    terms_required: bool
    privacy_required: bool
    age_required: bool

    @field_validator("email")
    @classmethod
    def _validate_email(cls, value: str) -> str:
        return _normalize_email(value)


class SessionBootstrapRequest(BaseModel):
    firebase_uid: str | None = Field(default=None, min_length=8, max_length=256)


class ChangeEmailAvailabilityRequest(BaseModel):
    new_email: str

    @field_validator("new_email")
    @classmethod
    def _validate_email(cls, value: str) -> str:
        return _normalize_email(value)


class ChangeEmailAvailabilityResponse(BaseModel):
    is_available: bool


class DeleteAccountResponse(BaseModel):
    result: str


class OnboardingConsentRequest(BaseModel):
    sensitive_data_required: bool
    personalization_optional: bool = False
    model_improvement_optional: bool = False
    marketing_optional: bool = False


class OnboardingProfileRequest(BaseModel):
    birth_year: int = Field(ge=1900, le=2100)
    gender: Gender | None = None
    consents: OnboardingConsentRequest


class BaselineAssessmentRequest(BaseModel):
    assessment_id: str = Field(min_length=8, max_length=64)


class FirebaseIdentity(BaseModel):
    model_config = ConfigDict(extra="ignore")

    firebase_uid: str
    email: str | None = None
    email_verified: bool = False

    @field_validator("email")
    @classmethod
    def _validate_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _normalize_email(value)
