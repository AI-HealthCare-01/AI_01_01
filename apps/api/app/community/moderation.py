from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


DEFAULT_TOXIC_MODEL_NAME = "jinkyeongk/kcELECTRA-toxic-detector"
DEFAULT_TOXIC_THRESHOLD = 0.82
DEFAULT_POSITIVE_LABELS = (
    "toxic",
    "toxicity",
    "hate",
    "abusive",
    "abuse",
    "offensive",
    "insult",
    "obscene",
    "label_1",
)
DEFAULT_NEGATIVE_LABELS = (
    "clean",
    "neutral",
    "safe",
    "non-toxic",
    "non_toxic",
    "label_0",
)


@dataclass(frozen=True)
class ToxicModerationSettings:
    enabled: bool
    model_name: str
    threshold: float
    positive_labels: tuple[str, ...]
    negative_labels: tuple[str, ...]


@dataclass(frozen=True)
class ToxicPrediction:
    score: float
    label: str


class ToxicTextClassifier:
    def __init__(self, settings: ToxicModerationSettings):
        self._settings = settings
        self._pipeline = None
        self._load_failed = False

    def classify(self, text: str) -> ToxicPrediction | None:
        if not self._settings.enabled or not text.strip():
            return None
        pipeline = self._get_pipeline()
        if pipeline is None:
            return None

        try:
            raw = pipeline(text, truncation=True)
        except Exception:
            self._load_failed = True
            self._pipeline = None
            return None

        candidate = raw[0] if isinstance(raw, list) else raw
        label = str(candidate.get("label", "")).strip().lower()
        if not label:
            return None
        score = float(candidate.get("score", 0.0) or 0.0)

        if label in self._settings.negative_labels:
            return None
        if label not in self._settings.positive_labels or score < self._settings.threshold:
            return None
        return ToxicPrediction(score=score, label=label)

    def _get_pipeline(self):
        if self._load_failed:
            return None
        if self._pipeline is not None:
            return self._pipeline

        try:
            from transformers import pipeline

            self._pipeline = pipeline(
                "text-classification",
                model=self._settings.model_name,
                tokenizer=self._settings.model_name,
            )
        except Exception:
            self._load_failed = True
            self._pipeline = None
        return self._pipeline


def _split_env_labels(raw: str, default: tuple[str, ...]) -> tuple[str, ...]:
    values = [item.strip().lower() for item in raw.split(",") if item.strip()]
    return tuple(values) if values else default


@lru_cache(maxsize=1)
def load_toxic_moderation_settings() -> ToxicModerationSettings:
    enabled = os.getenv("BOARD_TOXIC_MODEL_ENABLED", "false").lower() == "true"
    model_name = os.getenv("BOARD_TOXIC_MODEL_NAME", DEFAULT_TOXIC_MODEL_NAME).strip()
    threshold_raw = os.getenv("BOARD_TOXIC_MODEL_THRESHOLD", str(DEFAULT_TOXIC_THRESHOLD))
    try:
        threshold = float(threshold_raw)
    except ValueError:
        threshold = DEFAULT_TOXIC_THRESHOLD
    threshold = min(max(threshold, 0.0), 1.0)

    positive_labels = _split_env_labels(
        os.getenv("BOARD_TOXIC_MODEL_POSITIVE_LABELS", ""),
        DEFAULT_POSITIVE_LABELS,
    )
    negative_labels = _split_env_labels(
        os.getenv("BOARD_TOXIC_MODEL_NEGATIVE_LABELS", ""),
        DEFAULT_NEGATIVE_LABELS,
    )
    return ToxicModerationSettings(
        enabled=enabled,
        model_name=model_name,
        threshold=threshold,
        positive_labels=positive_labels,
        negative_labels=negative_labels,
    )


def build_toxic_text_classifier() -> ToxicTextClassifier | None:
    settings = load_toxic_moderation_settings()
    if not settings.enabled:
        return None
    return ToxicTextClassifier(settings)
