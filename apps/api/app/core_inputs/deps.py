from __future__ import annotations

from functools import lru_cache

from fastapi import Depends, HTTPException, status

from app.auth.config import load_auth_settings
from app.auth.firebase import get_firebase_identity
from app.auth.models import FirebaseIdentity
from app.auth.router import get_auth_store
from app.auth.store import AuthStore

from .store import CoreInputStore


@lru_cache(maxsize=1)
def get_core_input_store() -> CoreInputStore:
    settings = load_auth_settings()
    return CoreInputStore(database_path=settings.database_path)


def get_verified_user_id(
    identity: FirebaseIdentity = Depends(get_firebase_identity),
    auth_store: AuthStore = Depends(get_auth_store),
) -> str:
    session = auth_store.sync_session_state(
        firebase_uid=identity.firebase_uid,
        email=identity.email,
        email_verified=identity.email_verified,
    )

    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="account_not_found")

    if not session.account.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="email_verification_required",
        )

    return session.account.user_id
