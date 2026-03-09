from __future__ import annotations

import os
from pathlib import Path

from infer.provider import ModelProvider


def _provider() -> ModelProvider:
    root = Path(__file__).resolve().parents[1]
    return ModelProvider(
        contracts_dir=root / "contracts",
        fallback_artifact_dir=root / "models",
    )


def test_baseline_prediction_without_artifact_env() -> None:
    provider = _provider()
    result = provider.predict(
        {
            "mood_1_5": 2,
            "anxiety_1_5": 4,
            "energy_1_5": 2,
            "sleep_total_bucket_num": 3,
            "challenge_completed_count_today": 1,
            "cbt_session_count_today": 1,
        }
    )
    assert result.used_backend == "baseline"
    assert set(result.predictions.keys()) == {
        "dep_target_state_today",
        "anx_target_state_today",
        "ins_target_state_today",
    }
    assert 0.0 <= result.predictions["dep_target_state_today"] <= 100.0
    assert 0.0 <= result.predictions["anx_target_state_today"] <= 100.0
    assert 0.0 <= result.predictions["ins_target_state_today"] <= 100.0


def test_artifact_backend_missing_file_falls_back_to_baseline(tmp_path) -> None:
    provider = _provider()
    os.environ["MODEL_BACKEND"] = "artifact"
    os.environ["MODEL_ARTIFACT_PATH"] = str(tmp_path / "missing-artifact")
    try:
        result = provider.predict(
            {
                "mood_1_5": 2,
                "anxiety_1_5": 3,
                "energy_1_5": 2,
            }
        )
    finally:
        os.environ.pop("MODEL_BACKEND", None)
        os.environ.pop("MODEL_ARTIFACT_PATH", None)

    assert result.used_backend == "baseline"
    assert any(
        warning.startswith("artifact_fallback_to_baseline:")
        for warning in result.warnings
    )
