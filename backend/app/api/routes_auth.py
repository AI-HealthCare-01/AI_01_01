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
    user = await crud.create_user(db, payload.email, payload.password, payload.nickname)
    return UserOut.model_validate(user)


@router.post("/login", response_model=TokenResponse)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    user = await crud.authenticate_user(db, payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="이메일 또는 비밀번호가 올바르지 않습니다.")

    expires_delta = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    token = create_access_token(subject=str(user.id), expires_delta=expires_delta)
    return TokenResponse(access_token=token, expires_in=int(expires_delta.total_seconds()))


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

    if payload.new_email is not None:
        existing = await crud.get_user_by_email(db, payload.new_email)
        if existing and existing.id != current_user.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 사용 중인 이메일입니다.")

    updated = await crud.update_user_profile(
        db,
        current_user.id,
        nickname=payload.nickname,
        new_password=payload.new_password,
        new_email=payload.new_email,
        phone_number=payload.phone_number,
    )
    profile = await crud.get_or_create_user_profile(db, current_user.id)
    return ProfileOut(email=updated.email, nickname=updated.nickname, phone_number=profile.phone_number)
