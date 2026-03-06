from __future__ import annotations

from functools import lru_cache

from app.auth.config import load_auth_settings
from app.core_inputs.deps import get_verified_user_id

from .store import InsightsStore


@lru_cache(maxsize=1)
def get_insights_store() -> InsightsStore:
    settings = load_auth_settings()
    return InsightsStore(database_path=settings.database_path)


__all__ = ["get_insights_store", "get_verified_user_id"]
