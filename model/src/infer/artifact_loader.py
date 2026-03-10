from __future__ import annotations

from importlib import util as importlib_util
from pathlib import Path
from typing import Any


def _require_joblib():
    if importlib_util.find_spec("joblib") is None:
        raise RuntimeError("joblib_not_installed")
    import joblib  # type: ignore

    return joblib


def load_artifact_models(
    artifact_path: Path,
    target_keys: tuple[str, ...],
) -> dict[str, Any]:
    if not artifact_path.exists():
        raise FileNotFoundError(str(artifact_path))

    joblib = _require_joblib()

    if artifact_path.is_file():
        loaded = joblib.load(artifact_path)
        if isinstance(loaded, dict):
            missing = [key for key in target_keys if key not in loaded]
            if missing:
                raise RuntimeError(f"artifact_missing_targets:{','.join(missing)}")
            return {key: loaded[key] for key in target_keys}
        raise RuntimeError("unsupported_artifact_format:file")

    resolved: dict[str, Any] = {}
    for target_key in target_keys:
        model_path = artifact_path / f"{target_key}.joblib"
        if not model_path.exists():
            raise FileNotFoundError(str(model_path))
        resolved[target_key] = joblib.load(model_path)
    return resolved
