from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class AuthSettings:
    database_path: Path
    firebase_project_id: str
    firebase_admin_project_id: str
    firebase_admin_client_email: str
    firebase_admin_private_key: str
    firebase_auth_emulator_host: str
    allow_emulator_uid_fallback: bool


def load_auth_settings() -> AuthSettings:
    database_path = Path(os.getenv("AUTH_DATABASE_PATH", "./.data/auth_account.db")).resolve()
    firebase_project_id = os.getenv("FIREBASE_PROJECT_ID", "")
    firebase_admin_project_id = os.getenv("FIREBASE_ADMIN_PROJECT_ID", firebase_project_id)
    firebase_admin_client_email = os.getenv("FIREBASE_ADMIN_CLIENT_EMAIL", "")
    firebase_admin_private_key = os.getenv("FIREBASE_ADMIN_PRIVATE_KEY", "")
    firebase_auth_emulator_host = os.getenv("FIREBASE_AUTH_EMULATOR_HOST", "")
    allow_emulator_uid_fallback = (
        os.getenv("AUTH_ALLOW_EMULATOR_UID_FALLBACK", "true").lower() == "true"
    )

    return AuthSettings(
        database_path=database_path,
        firebase_project_id=firebase_project_id,
        firebase_admin_project_id=firebase_admin_project_id,
        firebase_admin_client_email=firebase_admin_client_email,
        firebase_admin_private_key=firebase_admin_private_key,
        firebase_auth_emulator_host=firebase_auth_emulator_host,
        allow_emulator_uid_fallback=allow_emulator_uid_fallback,
    )
