from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from app.auth.config import load_auth_settings
from app.core_inputs.deps import get_verified_user_id

from .store import ModelingStore


@lru_cache(maxsize=1)
def get_modeling_store() -> ModelingStore:
    settings = load_auth_settings()
    default_bundle_dir = Path(__file__).resolve().parents[4] / "model"
    model_bundle_dir = Path(
        os.getenv("MODEL_BUNDLE_DIR", str(default_bundle_dir))
    ).resolve()
    return ModelingStore(database_path=settings.database_path, model_bundle_dir=model_bundle_dir)


__all__ = ["get_modeling_store", "get_verified_user_id"]
