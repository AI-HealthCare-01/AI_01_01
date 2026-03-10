from __future__ import annotations

from functools import lru_cache

from app.auth.config import load_auth_settings
from app.core_inputs.deps import get_verified_user_id

from .moderation import build_toxic_text_classifier, load_toxic_moderation_settings
from .store import CommunityStore


@lru_cache(maxsize=1)
def get_community_store() -> CommunityStore:
    settings = load_auth_settings()
    load_toxic_moderation_settings()
    return CommunityStore(
        database_path=settings.database_path,
        toxic_text_classifier=build_toxic_text_classifier(),
    )


__all__ = ["get_community_store", "get_verified_user_id"]
