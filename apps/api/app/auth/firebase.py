from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from fastapi import Header, HTTPException, status

from .config import AuthSettings, load_auth_settings
from .models import FirebaseIdentity

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_auth_settings() -> AuthSettings:
    return load_auth_settings()


def _initialize_firebase_admin(settings: AuthSettings) -> Any:
    try:
        import firebase_admin
        from firebase_admin import credentials
    except ModuleNotFoundError as exc:  # pragma: no cover
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="firebase_admin_not_installed",
        ) from exc

    if firebase_admin._apps:  # type: ignore[attr-defined]
        return firebase_admin

    project_id = settings.firebase_admin_project_id or settings.firebase_project_id
    if not project_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="firebase_project_id_missing",
        )

    if settings.firebase_admin_client_email and settings.firebase_admin_private_key:
        private_key = settings.firebase_admin_private_key.strip()
        if private_key.startswith('"') and private_key.endswith('"'):
            private_key = private_key[1:-1]
        private_key = private_key.replace("\\n", "\n")
        cert_payload = {
            "type": "service_account",
            "project_id": project_id,
            "private_key": private_key,
            "client_email": settings.firebase_admin_client_email,
            "token_uri": "https://oauth2.googleapis.com/token",
        }
        try:
            firebase_admin.initialize_app(
                credentials.Certificate(cert_payload),
                options={"projectId": project_id},
            )
            return firebase_admin
        except Exception as exc:  # pragma: no cover
            logger.warning(
                "firebase_admin_certificate_init_failed_fallback_to_project_id: %s",
                exc,
            )

    firebase_admin.initialize_app(options={"projectId": project_id})
    return firebase_admin


def _verify_id_token(id_token: str, settings: AuthSettings) -> FirebaseIdentity:
    _initialize_firebase_admin(settings)

    try:
        from firebase_admin import auth

        decoded = auth.verify_id_token(id_token, check_revoked=False)
    except Exception as exc:  # pragma: no cover
        logger.warning("firebase_id_token_verify_failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="firebase_token_invalid",
        ) from exc

    firebase_uid = str(decoded.get("uid", ""))
    if not firebase_uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="firebase_uid_missing",
        )

    return FirebaseIdentity(
        firebase_uid=firebase_uid,
        email=decoded.get("email"),
        email_verified=bool(decoded.get("email_verified", False)),
    )


def get_firebase_identity(
    authorization: str | None = Header(default=None),
    x_firebase_uid: str | None = Header(default=None),
    x_firebase_email: str | None = Header(default=None),
    x_firebase_email_verified: str | None = Header(default=None),
) -> FirebaseIdentity:
    settings = get_auth_settings()

    id_token: str | None = None
    if authorization and authorization.startswith("Bearer "):
        id_token = authorization.split(" ", 1)[1].strip()

    fallback_email_verified = str(x_firebase_email_verified or "").lower() == "true"

    if id_token:
        try:
            return _verify_id_token(id_token, settings)
        except HTTPException as exc:
            if (
                settings.firebase_auth_emulator_host
                and settings.allow_emulator_uid_fallback
                and x_firebase_uid
            ):
                return FirebaseIdentity(
                    firebase_uid=x_firebase_uid,
                    email=x_firebase_email,
                    email_verified=fallback_email_verified,
                )
            raise exc

    if (
        settings.firebase_auth_emulator_host
        and settings.allow_emulator_uid_fallback
        and x_firebase_uid
    ):
        return FirebaseIdentity(
            firebase_uid=x_firebase_uid,
            email=x_firebase_email,
            email_verified=fallback_email_verified,
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="missing_firebase_auth",
    )
