from __future__ import annotations

import logging
import re
import sqlite3
from datetime import UTC, datetime
from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException, status

from .config import load_auth_settings
from .firebase import get_firebase_identity
from .models import (
    BaselineAssessmentRequest,
    ChangeEmailAvailabilityRequest,
    ChangeEmailAvailabilityResponse,
    DeleteAccountResponse,
    FirebaseIdentity,
    NicknameAvailabilityRequest,
    NicknameAvailabilityResponse,
    OnboardingProfileRequest,
    SessionBootstrapRequest,
    SessionContract,
    SignupRequest,
)
from .store import AuthStore

router = APIRouter(prefix="/v1", tags=["auth-account"])
logger = logging.getLogger(__name__)


def _derive_recovery_nickname(firebase_uid: str, email: str | None) -> str:
    base = ""
    if email:
        base = email.split("@", 1)[0].strip()
    if not base:
        base = f"user_{firebase_uid[-6:]}"
    normalized = re.sub(r"\s+", "_", base)
    if len(normalized) < 2:
        normalized = f"user_{firebase_uid[-6:]}"
    return normalized[:40]


def _recover_signup_shell(
    store: AuthStore,
    firebase_uid: str,
    email: str | None,
) -> SessionContract | None:
    if not email:
        return None

    try:
        session = store.create_or_get_signup_shell(
            firebase_uid=firebase_uid,
            email=email,
            nickname=_derive_recovery_nickname(firebase_uid, email),
            terms_required=True,
            privacy_required=True,
            age_required=True,
            coach_name=_derive_recovery_nickname(firebase_uid, email),
        )
        logger.warning(
            "account_shell_recovered_for_existing_firebase_user: uid=%s email=%s",
            firebase_uid,
            email,
        )
        return session
    except sqlite3.IntegrityError:
        relinked = store.relink_firebase_uid_by_email(
            email=email,
            firebase_uid=firebase_uid,
        )
        if relinked is not None:
            logger.warning(
                "account_shell_uid_relinked_by_email: uid=%s email=%s",
                firebase_uid,
                email,
            )
        return relinked


@lru_cache(maxsize=1)
def get_auth_store() -> AuthStore:
    settings = load_auth_settings()
    return AuthStore(database_path=settings.database_path)


@router.post("/auth/signup", response_model=SessionContract)
def signup(
    payload: SignupRequest,
    store: AuthStore = Depends(get_auth_store),
) -> SessionContract:
    if not payload.terms_required or not payload.privacy_required or not payload.age_required:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="required_consents_missing",
        )

    try:
        return store.create_or_get_signup_shell(
            firebase_uid=payload.firebase_uid,
            email=payload.email,
            nickname=payload.nickname,
            terms_required=payload.terms_required,
            privacy_required=payload.privacy_required,
            age_required=payload.age_required,
            coach_name=payload.coach_name,
        )
    except sqlite3.IntegrityError as exc:
        if "nickname_already_exists" in str(exc):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="nickname_already_exists",
            ) from exc
        # Firebase 계정은 새로 생성되었지만 로컬 계정 쉘이 이전 UID로 남아있는 경우,
        # 이메일 기준으로 UID를 재연결해 가입 플로우를 복구한다.
        relinked = store.relink_firebase_uid_by_email(
            email=payload.email,
            firebase_uid=payload.firebase_uid,
        )
        if relinked is not None:
            logger.warning(
                "signup_uid_relinked_by_email: uid=%s email=%s",
                payload.firebase_uid,
                payload.email,
            )
            return relinked
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="email_or_uid_already_exists",
        ) from exc


@router.post("/auth/nickname/availability", response_model=NicknameAvailabilityResponse)
def nickname_availability(
    payload: NicknameAvailabilityRequest,
    store: AuthStore = Depends(get_auth_store),
) -> NicknameAvailabilityResponse:
    duplicate = store.is_nickname_in_use(payload.nickname)
    return NicknameAvailabilityResponse(is_available=not duplicate)


@router.post("/auth/session/bootstrap", response_model=SessionContract)
def session_bootstrap(
    payload: SessionBootstrapRequest,
    identity: FirebaseIdentity = Depends(get_firebase_identity),
    store: AuthStore = Depends(get_auth_store),
) -> SessionContract:
    # Emulator fallback may not include a verified flag.
    # Payload uid is used only for matching when needed.
    firebase_uid = identity.firebase_uid or payload.firebase_uid
    if not firebase_uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="firebase_uid_missing",
        )

    session = store.sync_session_state(
        firebase_uid=firebase_uid,
        email=identity.email,
        email_verified=identity.email_verified,
    )
    if session is None:
        recovered = _recover_signup_shell(
            store=store,
            firebase_uid=firebase_uid,
            email=identity.email,
        )
        if recovered is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="account_not_found")
        session = store.sync_session_state(
            firebase_uid=firebase_uid,
            email=identity.email,
            email_verified=identity.email_verified,
        )
        if session is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="account_not_found")
    return session


@router.post("/auth/change-email/availability", response_model=ChangeEmailAvailabilityResponse)
def change_email_availability(
    payload: ChangeEmailAvailabilityRequest,
    identity: FirebaseIdentity = Depends(get_firebase_identity),
    store: AuthStore = Depends(get_auth_store),
) -> ChangeEmailAvailabilityResponse:
    user_id = store.get_user_id_by_firebase_uid(identity.firebase_uid)
    if not user_id:
        _recover_signup_shell(
            store=store,
            firebase_uid=identity.firebase_uid,
            email=identity.email,
        )
        user_id = store.get_user_id_by_firebase_uid(identity.firebase_uid)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="account_not_found")

    duplicate = store.is_email_in_use(payload.new_email, exclude_user_id=user_id)
    return ChangeEmailAvailabilityResponse(is_available=not duplicate)


@router.post("/auth/account/delete", response_model=DeleteAccountResponse)
def delete_account(
    identity: FirebaseIdentity = Depends(get_firebase_identity),
    store: AuthStore = Depends(get_auth_store),
) -> DeleteAccountResponse:
    user_id = store.get_user_id_by_firebase_uid(identity.firebase_uid)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="account_not_found")

    store.mark_account_deleted(user_id)
    return DeleteAccountResponse(result="deleted")


@router.post("/onboarding/profile", response_model=SessionContract)
def save_onboarding_profile(
    payload: OnboardingProfileRequest,
    identity: FirebaseIdentity = Depends(get_firebase_identity),
    store: AuthStore = Depends(get_auth_store),
) -> SessionContract:
    if not payload.consents.sensitive_data_required:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="sensitive_consent_required",
        )

    current_year = datetime.now(UTC).year
    if payload.birth_year > current_year:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="birth_year_invalid")

    user_id = store.get_user_id_by_firebase_uid(identity.firebase_uid)
    if not user_id:
        _recover_signup_shell(
            store=store,
            firebase_uid=identity.firebase_uid,
            email=identity.email,
        )
        user_id = store.get_user_id_by_firebase_uid(identity.firebase_uid)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="account_not_found")
    session = store.get_session_contract(user_id)
    if not session.account.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="email_verification_required",
        )

    return store.save_onboarding_profile(
        user_id=user_id,
        birth_year=payload.birth_year,
        gender=payload.gender,
        sensitive_data_required=payload.consents.sensitive_data_required,
        personalization_optional=payload.consents.personalization_optional,
        model_improvement_optional=payload.consents.model_improvement_optional,
        marketing_optional=payload.consents.marketing_optional,
    )


@router.post("/onboarding/baseline-assessment/complete", response_model=SessionContract)
def complete_baseline_assessment(
    payload: BaselineAssessmentRequest,
    identity: FirebaseIdentity = Depends(get_firebase_identity),
    store: AuthStore = Depends(get_auth_store),
) -> SessionContract:
    user_id = store.get_user_id_by_firebase_uid(identity.firebase_uid)
    if not user_id:
        _recover_signup_shell(
            store=store,
            firebase_uid=identity.firebase_uid,
            email=identity.email,
        )
        user_id = store.get_user_id_by_firebase_uid(identity.firebase_uid)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="account_not_found")

    session = store.get_session_contract(user_id)
    if not session.account.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="email_verification_required",
        )
    if not session.consents.sensitive_data_required:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="sensitive_consent_required",
        )
    if session.profile.birth_year is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="profile_birth_year_required",
        )
    if session.onboarding.baseline_assessment_completed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="baseline_assessment_already_completed",
        )

    try:
        return store.complete_baseline_assessment(
            user_id=user_id,
            assessment_id=payload.assessment_id,
        )
    except ValueError as error:
        code = str(error)
        if code == "baseline_assessment_already_completed":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="baseline_assessment_already_completed",
            ) from error
        if code == "assessment_not_found":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="assessment_not_found",
            ) from error
        if code in {
            "assessment_not_completed",
            "assessment_source_invalid",
            "assessment_items_incomplete",
            "assessment_score_missing",
        }:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=code,
            ) from error
        raise
