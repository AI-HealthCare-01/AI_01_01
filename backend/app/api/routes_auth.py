from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, decode_access_token, oauth2_scheme
from app.db import crud
from app.db.session import get_db
from app.schemas.auth import TokenResponse, UserCreate, UserLogin, UserOut

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


@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def signup(payload: UserCreate, db: AsyncSession = Depends(get_db)) -> UserOut:
    # Request Example:
    # POST /auth/signup
    # {"email":"user@example.com","password":"StrongPass123","nickname":"mira"}
    #
    # Response Example:
    # 201
    # {"id":"2b93f6ae-c0e7-4af5-b3a2-287aab4db6d6","email":"user@example.com","nickname":"mira","created_at":"2026-02-21T12:34:56Z"}
    existing = await crud.get_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="이미 가입된 이메일입니다.")
    user = await crud.create_user(db, payload.email, payload.password, payload.nickname)
    return UserOut.model_validate(user)


@router.post("/login", response_model=TokenResponse)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    # Request Example:
    # POST /auth/login
    # {"email":"user@example.com","password":"StrongPass123"}
    #
    # Response Example:
    # 200
    # {"access_token":"<jwt>","token_type":"bearer","expires_in":1800}
    user = await crud.authenticate_user(db, payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="이메일 또는 비밀번호가 올바르지 않습니다.")

    expires_delta = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    token = create_access_token(subject=str(user.id), expires_delta=expires_delta)
    return TokenResponse(access_token=token, expires_in=int(expires_delta.total_seconds()))


@router.get("/me", response_model=UserOut)
async def me(current_user: UserOut = Depends(get_current_user)) -> UserOut:
    # Request Example:
    # GET /auth/me
    # Authorization: Bearer <jwt>
    #
    # Response Example:
    # 200
    # {"id":"2b93f6ae-c0e7-4af5-b3a2-287aab4db6d6","email":"user@example.com","nickname":"mira","created_at":"2026-02-21T12:34:56Z"}
    return current_user
