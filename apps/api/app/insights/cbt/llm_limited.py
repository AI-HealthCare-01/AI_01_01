from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Any
from urllib import error, request


@dataclass
class LimitedLlmMeta:
    llm_used: bool
    model: str | None
    latency_ms: int | None
    fallback_reason: str | None


class CbtLimitedLlm:
    """Limited LLM helper for CBT v2 (extractor/composer/risk only)."""

    def __init__(self) -> None:
        self.api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
        self.base_url = (os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1").strip().rstrip("/")
        configured = (os.getenv("OPENAI_MODEL") or "").strip()
        self.model = configured or "gpt-4o-mini"

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    def extract_fields(
        self,
        *,
        stage: str,
        user_text: str,
        current_state: dict[str, Any],
    ) -> tuple[dict[str, Any], LimitedLlmMeta]:
        if not self.enabled:
            return {}, LimitedLlmMeta(False, None, None, "llm_disabled")

        schema_hint = {
            "situation": {"situation_text": "string|null"},
            "emotion": {"emotion_label": "string|null", "emotion_intensity_0_100": "int|null"},
            "thought": {
                "auto_thought_text": "string|null",
                "intermediate_belief_hint": "string|null",
                "core_belief_hint": "string|null",
            },
            "evidence": {"evidence_item": "string|null"},
            "alternative_plan": {
                "alternative_thought": "string|null",
                "commitment_type": "behavior|thought_practice|null",
                "commitment_text": "string|null",
            },
        }

        prompt = (
            "사용자 입력을 구조화 필드로 추출하세요. "
            "입력에 없는 사실은 만들지 마세요. "
            "반드시 JSON object만 응답하세요.\n"
            f"stage={stage}\n"
            f"schema_hint={json.dumps(schema_hint.get(stage, {}), ensure_ascii=False)}\n"
            f"current_state={json.dumps(current_state, ensure_ascii=False)}\n"
            f"user_input={user_text}"
        )
        return self._call_json(prompt=prompt, fallback_reason="extractor_failed")

    def compose_response(
        self,
        *,
        stage: str,
        user_text: str,
        current_state: dict[str, Any],
        next_question: str,
        fallback_empathy: str,
    ) -> tuple[dict[str, Any], LimitedLlmMeta]:
        if not self.enabled:
            return {}, LimitedLlmMeta(False, None, None, "llm_disabled")

        prompt = (
            "한국어 CBT 대화 응답을 짧게 구성하세요. "
            "진단/단정 표현 없이 따뜻한 문체를 유지하세요. "
            "전문용어는 피하고 일상어를 사용하세요. "
            "JSON object만 반환하고 키는 empathy, restatement, next_question 입니다.\n"
            f"stage={stage}\n"
            f"user_input={user_text}\n"
            f"current_state={json.dumps(current_state, ensure_ascii=False)}\n"
            f"next_question={next_question}\n"
            f"fallback_empathy={fallback_empathy}"
        )
        return self._call_json(prompt=prompt, fallback_reason="composer_failed")

    def classify_risk(
        self,
        *,
        user_text: str,
        current_state: dict[str, Any],
    ) -> tuple[dict[str, Any], LimitedLlmMeta]:
        if not self.enabled:
            return {}, LimitedLlmMeta(False, None, None, "llm_disabled")

        prompt = (
            "정신건강 위험 신호를 보조 분류하세요. "
            "JSON object만 반환하고 키는 functional_impairment_flag, self_harm_flag, "
            "suicide_risk_level(0~3), violence_risk_flag 입니다.\n"
            f"current_state={json.dumps(current_state, ensure_ascii=False)}\n"
            f"user_input={user_text}"
        )
        return self._call_json(prompt=prompt, fallback_reason="risk_classifier_failed")

    def _call_json(
        self,
        *,
        prompt: str,
        fallback_reason: str,
    ) -> tuple[dict[str, Any], LimitedLlmMeta]:
        started = time.perf_counter()
        payload = {
            "model": self.model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": "반드시 JSON object만 응답하세요.",
                },
                {"role": "user", "content": prompt},
            ],
        }
        req = request.Request(
            url=f"{self.base_url}/chat/completions",
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            data=json.dumps(payload).encode("utf-8"),
        )

        try:
            with request.urlopen(req, timeout=15) as response:
                body = response.read().decode("utf-8")
            parsed = json.loads(body)
            content = (
                parsed.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "{}")
            )
            result = json.loads(content)
            if not isinstance(result, dict):
                raise RuntimeError("invalid_llm_json_shape")
            elapsed = int((time.perf_counter() - started) * 1000)
            return result, LimitedLlmMeta(True, self.model, elapsed, None)
        except (error.HTTPError, error.URLError, json.JSONDecodeError, RuntimeError):
            elapsed = int((time.perf_counter() - started) * 1000)
            return {}, LimitedLlmMeta(False, None, elapsed, fallback_reason)
