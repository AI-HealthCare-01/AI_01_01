from __future__ import annotations

from typing import Any


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


class BaselineModel:
    def __init__(self) -> None:
        self._targets = (
            "dep_target_state_today",
            "anx_target_state_today",
            "ins_target_state_today",
        )

    @staticmethod
    def _to_float(value: Any, default: float = 0.0) -> float:
        try:
            if value is None:
                return default
            return float(value)
        except (TypeError, ValueError):
            return default

    def predict(self, feature_values: dict[str, Any]) -> dict[str, float]:
        mood = self._to_float(feature_values.get("mood_1_5"), 3.0)
        anxiety = self._to_float(feature_values.get("anxiety_1_5"), 3.0)
        energy = self._to_float(feature_values.get("energy_1_5"), 3.0)
        sleep_bucket = self._to_float(feature_values.get("sleep_total_bucket_num"), 4.0)
        sleep_latency = self._to_float(feature_values.get("sleep_latency_bucket_num"), 2.0)
        daylight = self._to_float(feature_values.get("daylight_bucket_num"), 1.0)
        exercise = self._to_float(feature_values.get("exercise_bucket_num"), 1.0)
        alcohol = self._to_float(feature_values.get("alcohol_bucket"), 0.0)
        caffeine = self._to_float(feature_values.get("caffeine_after_2pm_flag"), 0.0)

        challenge_done = self._to_float(feature_values.get("challenge_completed_count_today"), 0.0)
        challenge_help = self._to_float(feature_values.get("challenge_helpfulness_mean_today"), 0.0)
        cbt_count = self._to_float(feature_values.get("cbt_session_count_today"), 0.0)
        cbt_help = self._to_float(feature_values.get("cbt_helpfulness_mean_today"), 0.0)
        cbt_commit = self._to_float(feature_values.get("cbt_homework_commitment_mean_today"), 0.0)

        risk_any = self._to_float(feature_values.get("risk_any_today"), 0.0)
        suicide = self._to_float(feature_values.get("suicide_risk_level_today"), 0.0)
        impairment = self._to_float(feature_values.get("functional_impairment_today"), 0.0)
        self_harm = self._to_float(feature_values.get("self_harm_today"), 0.0)

        dep = 50.0
        dep += (3.0 - mood) * 12.0
        dep += (3.0 - energy) * 8.0
        dep += (4.0 - sleep_bucket) * 6.0
        dep += (2.0 - daylight) * 3.0
        dep += (2.0 - exercise) * 4.0
        dep += alcohol * 1.8
        dep -= challenge_done * 2.0
        dep -= challenge_help * 0.2
        dep -= cbt_count * 1.4
        dep -= cbt_help * 0.15
        dep -= cbt_commit * 0.12
        dep += risk_any * 8.0 + impairment * 6.0 + self_harm * 10.0 + suicide * 4.0

        anx = 50.0
        anx += (anxiety - 3.0) * 13.0
        anx += (3.0 - mood) * 6.0
        anx += (4.0 - sleep_bucket) * 4.0
        anx += (sleep_latency - 2.0) * 5.0
        anx += caffeine * 4.0
        anx += alcohol * 1.2
        anx -= exercise * 2.0
        anx -= cbt_count * 1.6
        anx -= cbt_help * 0.2
        anx += risk_any * 10.0 + suicide * 5.0 + impairment * 4.0 + self_harm * 6.0

        ins = 50.0
        ins += (4.0 - sleep_bucket) * 14.0
        ins += (sleep_latency - 2.0) * 7.0
        ins += caffeine * 6.0
        ins += alcohol * 4.0
        ins += (anxiety - 3.0) * 3.0
        ins -= exercise * 1.5
        ins -= challenge_done * 1.0
        ins -= cbt_help * 0.08
        ins += risk_any * 4.0 + impairment * 3.0

        return {
            self._targets[0]: round(_clamp(dep, 0.0, 100.0), 4),
            self._targets[1]: round(_clamp(anx, 0.0, 100.0), 4),
            self._targets[2]: round(_clamp(ins, 0.0, 100.0), 4),
        }
