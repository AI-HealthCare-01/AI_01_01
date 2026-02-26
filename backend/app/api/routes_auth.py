from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, decode_access_token, oauth2_scheme, verify_password
from app.db import crud
from app.db.session import get_db
from app.schemas.auth import (
    EmailVerificationRequest,
    EmailVerificationResponse,
    PasswordRecoveryQuestionRequest,
    PasswordRecoveryQuestionResponse,
    PasswordRecoveryResetRequest,
    PasswordRecoveryResetResponse,
    PasswordRecoveryVerifyRequest,
    PasswordRecoveryVerifyResponse,
    PasswordVerifyRequest,
    PasswordVerifyResponse,
    ProfileOut,
    ProfileUpdateRequest,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserOut,
)


router = APIRouter(prefix="/auth", tags=["auth"])
ACCESS_TOKEN_EXPIRE_MINUTES = 30


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    payload = decode_access_token(token)
    subject = payload.get("sub")
    try:
        user_id = UUID(subject)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="토큰 정보가 올바르지 않습니다.") from exc

    user = await crud.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="사용자 정보를 찾을 수 없습니다.")
    return UserOut.model_validate(user)


@router.post("/email/request-code", response_model=EmailVerificationResponse)
async def request_email_verification_code(
    payload: EmailVerificationRequest,
    db: AsyncSession = Depends(get_db),
) -> EmailVerificationResponse:
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="이메일 인증 기능은 현재 비활성화되었습니다. SMTP 연결 후 재활성화하세요.",
    )


@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def signup(payload: UserCreate, db: AsyncSession = Depends(get_db)) -> UserOut:
    existing = await crud.get_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 가입된 이메일입니다.")

    user = await crud.create_user(
        db,
        payload.email,
        payload.password,
        payload.nickname,
        security_question=payload.security_question,
        security_answer=payload.security_answer,
    )
    return UserOut.model_validate(user)


@router.post("/login", response_model=TokenResponse)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    user = await crud.authenticate_user(db, payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="이메일 또는 비밀번호가 올바르지 않습니다.")

    expires_delta = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    token = create_access_token(subject=str(user.id), expires_delta=expires_delta)
    await crud.create_login_event(db, user.id)
    return TokenResponse(access_token=token, expires_in=int(expires_delta.total_seconds()))


@router.post("/password-recovery/question", response_model=PasswordRecoveryQuestionResponse)
async def password_recovery_question(
    payload: PasswordRecoveryQuestionRequest,
    db: AsyncSession = Depends(get_db),
) -> PasswordRecoveryQuestionResponse:
    user = await crud.get_user_by_email(db, payload.email)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="가입된 이메일을 찾을 수 없습니다.")

    qa = await crud.get_user_security_qa(db, user.id)
    if not qa:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="등록된 보안 질문이 없습니다.")

    return PasswordRecoveryQuestionResponse(question=qa.question)


@router.post("/password-recovery/verify", response_model=PasswordRecoveryVerifyResponse)
async def password_recovery_verify(
    payload: PasswordRecoveryVerifyRequest,
    db: AsyncSession = Depends(get_db),
) -> PasswordRecoveryVerifyResponse:
    matched = await crud.verify_security_answer(db, payload.email, payload.security_answer)
    if not matched:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="보안 질문 답변이 일치하지 않습니다.")
    return PasswordRecoveryVerifyResponse(matched=True)


@router.post("/password-recovery/reset", response_model=PasswordRecoveryResetResponse)
async def password_recovery_reset(
    payload: PasswordRecoveryResetRequest,
    db: AsyncSession = Depends(get_db),
) -> PasswordRecoveryResetResponse:
    ok = await crud.reset_password_by_security_answer(
        db,
        payload.email,
        payload.security_answer,
        payload.new_password,
    )
    if not ok:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="비밀번호 재설정에 실패했습니다.")
    return PasswordRecoveryResetResponse(message="비밀번호가 변경되었습니다.")


@router.get("/me", response_model=UserOut)
async def me(current_user: UserOut = Depends(get_current_user)) -> UserOut:
    return current_user


@router.get("/me/profile", response_model=ProfileOut)
async def me_profile(
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileOut:
    profile = await crud.get_or_create_user_profile(db, current_user.id)
    return ProfileOut(email=current_user.email, nickname=current_user.nickname, phone_number=profile.phone_number)


@router.patch("/me/profile", response_model=ProfileOut)
async def update_my_profile(
    payload: ProfileUpdateRequest,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileOut:
    user = await crud.get_user_by_id(db, current_user.id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다.")

    if payload.new_password is not None:
        if payload.current_password is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="현재 비밀번호를 입력하세요.")
        if not verify_password(payload.current_password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="현재 비밀번호가 일치하지 않습니다.")

    updated = await crud.update_user_profile(
        db,
        current_user.id,
        nickname=payload.nickname,
        new_password=payload.new_password,
    )
    profile = await crud.get_or_create_user_profile(db, current_user.id)
    return ProfileOut(email=updated.email, nickname=updated.nickname, phone_number=profile.phone_number)


@router.post("/me/password/verify", response_model=PasswordVerifyResponse)
async def verify_my_current_password(
    payload: PasswordVerifyRequest,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PasswordVerifyResponse:
    user = await crud.get_user_by_id(db, current_user.id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다.")
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="현재 비밀번호가 일치하지 않습니다.")
    return PasswordVerifyResponse(matched=True)
