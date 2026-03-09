from __future__ import annotations

import json
from pathlib import Path


def test_contract_files_are_valid_json() -> None:
    root = Path(__file__).resolve().parents[1]
    contracts_dir = root / "contracts"
    feature_schema = json.loads((contracts_dir / "feature_schema.json").read_text(encoding="utf-8"))
    output_schema = json.loads((contracts_dir / "output_schema.json").read_text(encoding="utf-8"))
    manifest = json.loads((contracts_dir / "manifest.json").read_text(encoding="utf-8"))

    assert isinstance(feature_schema.get("schema_version"), str)
    assert isinstance(feature_schema.get("features"), list)
    assert len(feature_schema["features"]) > 0

    feature_names = [item.get("name") for item in feature_schema["features"] if isinstance(item, dict)]
    assert "mood_1_5" in feature_names
    assert "challenge_completed_count_today" in feature_names
    assert "cbt_session_count_today" in feature_names
    assert "user_id" not in feature_names
    assert "firebase_uid" not in feature_names
    assert "email" not in feature_names
    assert "nickname" not in feature_names
    assert "ip" not in feature_names

    assert isinstance(output_schema.get("scores"), list)
    score_names = [item.get("name") for item in output_schema["scores"] if isinstance(item, dict)]
    assert set(score_names) == {
        "dep_target_state_today",
        "anx_target_state_today",
        "ins_target_state_today",
    }

    assert manifest.get("default_backend") == "baseline"
    assert isinstance(manifest.get("logic_version"), str)
