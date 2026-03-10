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
            "alternative_plan": {"alternative_thought": "string|null"},
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
            "해요체만 사용하고, 직전 3턴과 동일/유사한 문장은 피하세요. "
            "공감 1문장 + 재진술 1문장 + 다음 질문 1문장 구성을 우선하세요. "
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

    def analyze_core_pattern(
        self,
        *,
        situation_text: str,
        emotion_label: str,
        emotion_intensity: int | None,
        auto_thought_text: str,
        recent_user_texts: list[str],
        thinking_patterns: list[dict[str, Any]],
        nickname: str,
    ) -> tuple[dict[str, Any], LimitedLlmMeta]:
        if not self.enabled:
            return {}, LimitedLlmMeta(False, None, None, "llm_disabled")

        compact_patterns: list[dict[str, Any]] = []
        for item in thinking_patterns[:19]:
            compact_patterns.append(
                {
                    "id": str(item.get("id") or ""),
                    "title_ko": str(item.get("title_ko") or ""),
                    "short_desc_ko": str(item.get("short_desc_ko") or ""),
                    "probe_templates_ko": [
                        str(template)
                        for template in list(item.get("probe_templates_ko") or [])[:2]
                        if str(template).strip()
                    ],
                }
            )

        prompt = (
            "사용자 입력에서 핵심 생각 후보와 내부 생각패턴을 추정하세요. "
            "사용자에게 라벨을 단정하지 말고, 입력에 없는 사실을 만들지 마세요. "
            "반드시 JSON object만 반환하세요.\n"
            "출력 스키마:\n"
            "{\n"
            "  \"core_thought_candidates\": [string],\n"
            "  \"best_core_thought\": string,\n"
            "  \"possible_core_belief_hint\": string,\n"
            "  \"pattern_ranked\": [{\"id\": string, \"confidence\": number}],\n"
            "  \"pattern_probe_question\": string,\n"
            "  \"why_summary_internal\": string\n"
            "}\n"
            f"nickname={nickname}\n"
            f"situation_text={situation_text}\n"
            f"emotion_label={emotion_label}\n"
            f"emotion_intensity={emotion_intensity}\n"
            f"auto_thought_text={auto_thought_text}\n"
            f"recent_user_texts={json.dumps(recent_user_texts[-5:], ensure_ascii=False)}\n"
            f"thinking_patterns={json.dumps(compact_patterns, ensure_ascii=False)}"
        )
        return self._call_json(prompt=prompt, fallback_reason="core_pattern_analysis_failed")

    def suggest_alternative_candidates(
        self,
        *,
        core_thought: str,
        evidence_for: list[str],
        evidence_against: list[str],
        pattern_ranked: list[dict[str, Any]],
    ) -> tuple[dict[str, Any], LimitedLlmMeta]:
        if not self.enabled:
            return {}, LimitedLlmMeta(False, None, None, "llm_disabled")

        prompt = (
            "CBT 대화용 '새 생각' 후보 2~3개를 생성하세요. "
            "사용자 입력에 없는 사실을 만들지 말고, 과잉위로/단정 표현을 피하세요. "
            "각 후보는 1~2문장, 해요체, 현실적인 문장으로 작성하세요. "
            "반드시 JSON object만 반환하세요.\n"
            "출력 스키마: {\"candidates\": [string]}\n"
            f"core_thought={core_thought}\n"
            f"evidence_for={json.dumps(evidence_for[:5], ensure_ascii=False)}\n"
            f"evidence_against={json.dumps(evidence_against[:5], ensure_ascii=False)}\n"
            f"pattern_ranked={json.dumps(pattern_ranked[:3], ensure_ascii=False)}"
        )
        return self._call_json(prompt=prompt, fallback_reason="alternative_suggestion_failed")

    def suggest_commitment_candidates(
        self,
        *,
        core_thought: str,
        pattern_ranked: list[dict[str, Any]],
        commitment_mode: str,
    ) -> tuple[dict[str, Any], LimitedLlmMeta]:
        if not self.enabled:
            return {}, LimitedLlmMeta(False, None, None, "llm_disabled")

        prompt = (
            "CBT 세션의 약속 후보를 2~3개 생성하세요. "
            "짧고 실행 가능한 문장으로 만들고, 사용자가 바로 입력창에 넣을 수 있게 작성하세요. "
            "행동 모드면 '작은 행동', 생각 모드면 '생각 연습'을 우선하세요. "
            "반드시 JSON object만 반환하세요.\n"
            "출력 스키마: {\"candidates\": [string]}\n"
            f"core_thought={core_thought}\n"
            f"pattern_ranked={json.dumps(pattern_ranked[:3], ensure_ascii=False)}\n"
            f"commitment_mode={commitment_mode}"
        )
        return self._call_json(prompt=prompt, fallback_reason="commitment_suggestion_failed")

    def compose_session_closure(
        self,
        *,
        current_state: dict[str, Any],
    ) -> tuple[dict[str, Any], LimitedLlmMeta]:
        if not self.enabled:
            return {}, LimitedLlmMeta(False, None, None, "llm_disabled")

        prompt = (
            "CBT 세션의 마지막 마무리 메시지를 작성하세요. "
            "한국어 해요체로 2문장만 작성하고, 진단/치료 단정 표현은 피하세요. "
            "1문장은 오늘 대화 요약, 1문장은 부담이 낮은 조언이나 마무리 격려로 작성하세요. "
            "TO DO를 강요하지 말고, 사용자가 지금 기억해둘 한 가지를 짚어주세요. "
            "반드시 JSON object만 반환하세요.\n"
            "출력 스키마: {\"summary\": string, \"advice\": string}\n"
            f"current_state={json.dumps(current_state, ensure_ascii=False)}"
        )
        return self._call_json(prompt=prompt, fallback_reason="session_closure_failed")

    def compose_repair_message(
        self,
        *,
        stage: str,
        subphase: str,
        fallback_reason: str,
    ) -> tuple[dict[str, Any], LimitedLlmMeta]:
        if not self.enabled:
            return {}, LimitedLlmMeta(False, None, None, "llm_disabled")

        prompt = (
            "CBT 복구 안내 문장을 작성하세요. "
            "해요체로 2~3문장만 작성하고, 비난/지시형 문구를 피하세요. "
            "반드시 JSON object만 반환하세요.\n"
            "출력 스키마: {\"repair_message\": string, \"retry_prompt\": string}\n"
            f"stage={stage}\n"
            f"subphase={subphase}\n"
            f"fallback_reason={fallback_reason}"
        )
        return self._call_json(prompt=prompt, fallback_reason="repair_composer_failed")

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
