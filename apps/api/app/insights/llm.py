from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Any
from urllib import error, request


@dataclass
class CbtStructuredDraft:
    assistant_reply: str
    state: dict[str, Any]
    planner_action: str
    emotion_pre: int | None
    emotion_post: int | None
    belief_pre: int | None
    belief_post: int | None
    homework_commitment: int | None
    helpfulness: int | None


logger = logging.getLogger(__name__)


class CbtLlmEngine:
    _STAGE_GUIDANCE: dict[str, str] = {
        "situation": "상황 정리: 언제/어디서/누구와/무슨 일이 있었는지 사실 중심으로 1~2개 확인",
        "thought": (
            "생각·감정 파악: 먼저 그 순간 머릿속에 스친 핵심 문장을 찾고, "
            "다음으로 그 문장이 몸/마음에 만든 느낌과 강도를 확인"
        ),
        "evidence": (
            "근거 점검: 먼저 그 생각이 맞다고 느끼게 하는 이유를 찾고, "
            "다음으로 다르게 볼 수 있는 이유를 찾은 뒤 짧게 비교 정리"
        ),
        "reframe": "균형 문장: 앞서 정리한 내용을 바탕으로 현실적이고 부드러운 새 문장을 사용자가 직접 작성",
        "action": "다음 행동 계획: 오늘 실행 가능한 가장 작은 행동 1개를 시간/장소까지 구체화",
    }
    _BELIEF_REJECTION_MARKERS: tuple[str, ...] = (
        "아니",
        "아닌",
        "안 맞",
        "맞지 않",
        "다른 것 같",
        "그건 아니",
        "모르겠",
        "정확히는",
    )

    def __init__(self) -> None:
        self.api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
        self.base_url = (os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1").strip().rstrip("/")
        self.models = self._resolve_models()

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    def generate_turn(
        self,
        *,
        messages: list[dict[str, str]],
        existing_state: dict[str, Any] | None = None,
        current_stage: str | None = None,
    ) -> CbtStructuredDraft:
        normalized_stage = self._normalize_stage(current_stage)
        normalized_messages = self._normalize_messages(messages)
        if not normalized_messages:
            return self._fallback_draft([], existing_state, normalized_stage)

        if not self.enabled:
            return self._fallback_draft(normalized_messages, existing_state, normalized_stage)

        try:
            return self._call_openai_with_fallback(normalized_messages, existing_state or {}, normalized_stage)
        except Exception as exc:
            logger.warning("CBT LLM fallback triggered: %s", exc)
            return self._fallback_draft(normalized_messages, existing_state, normalized_stage)

    def _resolve_models(self) -> list[str]:
        configured = (os.getenv("OPENAI_MODEL") or "").strip()
        fallback_candidates = [
            configured,
            "gpt-4o-mini",
            "gpt-4.1-mini",
            "gpt-4o",
        ]
        resolved: list[str] = []
        for candidate in fallback_candidates:
            if not candidate:
                continue
            if candidate in resolved:
                continue
            resolved.append(candidate)
        if not resolved:
            resolved.append("gpt-4o-mini")
        return resolved

    def _call_openai_with_fallback(
        self,
        messages: list[dict[str, str]],
        existing_state: dict[str, Any],
        current_stage: str | None,
    ) -> CbtStructuredDraft:
        last_error: Exception | None = None
        for model in self.models:
            try:
                return self._call_openai(messages, existing_state, current_stage, model=model)
            except Exception as exc:
                last_error = exc
                continue

        if last_error is not None:
            raise last_error
        raise RuntimeError("openai_call_failed")

    @staticmethod
    def _normalize_messages(messages: list[dict[str, str]]) -> list[dict[str, str]]:
        normalized: list[dict[str, str]] = []
        for item in messages[-24:]:
            role = str(item.get("role") or "").strip().lower()
            content = str(item.get("content") or "").strip()
            if role not in {"user", "assistant"}:
                continue
            if not content:
                continue
            normalized.append({"role": role, "content": content[:2000]})
        return normalized

    def _call_openai(
        self,
        messages: list[dict[str, str]],
        existing_state: dict[str, Any],
        current_stage: str | None,
        *,
        model: str,
    ) -> CbtStructuredDraft:
        system_prompt = (
            "You are a Korean CBT reflection assistant for a wellness app. "
            "Use calm, non-diagnostic language and avoid medical certainty. "
            "Prioritize safety if risk is suspected. "
            "Follow stage-by-stage flow strictly: situation -> thought -> evidence -> reframe -> action. "
            "In each turn, focus on the current_stage and ask one concrete follow-up that helps complete that stage. "
            "Do not jump to later stages until the current stage has at least one concrete detail from the user. "
            "Do not finalize planner_action until action stage is discussed "
            "and user agreed on a practical next action. "
            "Do not overuse tail-chasing follow-up questions. Keep each turn compact and purposeful. "
            "Use everyday Korean; avoid technical CBT jargon in assistant_reply. "
            "Never use these words in assistant_reply: 자동사고, 인지왜곡, 지지근거, 반박근거. "
            "Do not use label-style jargon in assistant text; prefer plain phrases like "
            "'맞는 이유', '다르게 볼 이유', '도움 되는 문장'. "
            "When thought stage is active, guide in two beats: "
            "(1) identify the core sentence in mind, then (2) identify feelings and intensity caused by that sentence. "
            "Do not directly command '생각만 말해보세요/감정만 말해보세요'. "
            "After thought+emotion are identified, guide one level deeper from surface thought "
            "to middle belief to core belief in a natural way. "
            "When presenting a core belief hypothesis, NEVER say "
            "'당신의 핵심 믿음은 ...'. Use warm-professional phrasing such as "
            "'말씀을 종합하면 ...처럼 느껴질 수 있다는 믿음이 마음 깊은 곳에서 작동한 듯합니다.' "
            "and ask if it resonates. "
            "If user disagrees, refine and present one updated hypothesis, then reconfirm. "
            "When evidence stage is active, first show one concise candidate thought inferred from context, "
            "then ask reasons that make it feel true, then reasons that suggest another view, in this order. "
            "If both sides are already collected, provide a short side-by-side summary before the next question. "
            "In evidence stage, favor intuitive prompts: "
            "'그 생각이 타당한 근거에는 무엇이 있을까요?' then "
            "'하지만 이 생각이 틀렸다고 가정하면 어떤 근거가 떠오를까요?'. "
            "Keep using the word '생각' instead of '문장' in evidence stage. "
            "When reframe stage is active, ask the user to write their own balanced sentence; "
            "offer a sentence starter based on three slots: core belief, reason it felt true, "
            "reason for an alternative view. "
            "The balanced sentence must not simply repeat the core belief "
            "and should be logically tied to those reasons. "
            "Store surface sentence in automatic_thoughts, and store deeper root belief pattern in "
            "core_belief_hypotheses/intermediate_belief_hypotheses separately. "
            "Core belief should sound like a conditional value statement "
            "(example: '성과를 내지 못하면 나는 가치가 없다'). "
            "When action stage is active and user hesitates, suggest 2-3 tiny action options to choose from. "
            "Once a concrete action is agreed, keep the action-planning short: "
            "ask whether they will try it, listen yes/no, then close with a brief summary + encouragement. "
            "When user accepts action, store it in state.behaviors[0] and set planner_action accordingly. "
            "Return ONLY a JSON object with keys: "
            "assistant_reply, state, planner_action, emotion_pre, emotion_post, "
            "belief_pre, belief_post, homework_commitment, helpfulness. "
            "state must follow this shape: "
            "{situation, automatic_thoughts[], emotions[{name,intensity}], behaviors[], "
            "balanced_statement, "
            "evidence_for[], evidence_against[], distortion_candidates[], "
            "intermediate_belief_hypotheses[{text,confidence}], "
            "core_belief_hypotheses[{text,confidence,expose_to_user}], "
            "risk_flags{functional_impairment_flag,self_harm_flag,suicide_risk_level,violence_risk_flag}}."
        )

        normalized_stage = self._normalize_stage(current_stage) or "situation"
        stage_snapshot = self._stage_progress_snapshot(existing_state)
        latest_user = self._latest_user_message(messages)
        stage_instruction = self._stage_instruction(normalized_stage, stage_snapshot, latest_user)

        transcript = "\n".join(
            f"{'사용자' if item['role'] == 'user' else '도우미'}: {item['content']}"
            for item in messages
        )

        user_prompt = (
            "아래 대화 기준으로 다음 턴 응답과 구조화 상태를 생성하세요.\n"
            "응답은 한국어 2~4문장, 공감+구조화 질문/제안 포함.\n"
            "반드시 current_stage 중심 질문 1개를 포함하고, 미완료면 같은 단계를 유지하세요.\n"
            "safety-first 필요 시 assistant_reply에 안전 안내를 먼저 넣으세요.\n"
            "생각·감정 단계에서는 '머릿속 문장'과 '느낌/강도'를 순차적으로 다루되 직설 명령형 표현은 피하세요.\n"
            "생각·감정이 정리된 뒤에는 왜 그 생각이 생겼는지 한 단계 깊게 탐색해 "
            "중간 믿음과 핵심 믿음 가설을 분리해서 잡아주세요.\n"
            "핵심 믿음 가설은 부드럽고 전문적인 톤으로 제시하고, 사용자 확인을 반드시 받으세요.\n"
            "사용자가 아니라면 다시 조정해 재제시하세요.\n"
            "근거 점검 단계에서는 먼저 '맞다고 느끼는 이유'를 다루고 그 다음 '다르게 볼 이유'를 다루세요.\n"
            "양쪽 이유가 모두 있으면 assistant_reply에 1문장 요약 정리를 포함하세요.\n"
            "근거 점검 단계 질문은 가능한 한 다음 표현을 따르세요: "
            "'그 생각이 타당한 근거에는 무엇이 있을까요?' / "
            "'하지만 이 생각이 틀렸다고 가정하면 어떤 근거가 떠오를까요?'.\n"
            "균형 문장 단계에서는 사용자가 직접 문장을 만들도록 유도하고 짧은 문장 시작 예시를 주세요.\n"
            "균형 문장 단계에서는 [핵심 믿음] [맞다고 느낀 이유] [다르게 볼 이유]를 반영해 "
            "문장을 만들도록 유도하세요.\n"
            "균형 문장은 핵심 믿음을 그대로 반복하지 말고, 근거를 반영한 현실적인 문장으로 유도하세요.\n"
            "균형 문장 단계에서 state.balanced_statement에 현재 합의된 문장을 저장하세요.\n"
            "state.automatic_thoughts에는 표면적으로 떠오른 문장을, "
            "state.core_belief_hypotheses/state.intermediate_belief_hypotheses에는 "
            "그 아래의 근본 믿음/패턴을 분리해 저장하세요.\n"
            "근본 믿음은 상황 설명문이 아니라 일반화된 믿음 문장으로 작성하세요.\n"
            "다음 행동 단계에서 사용자가 어려워하면 2~3개의 아주 작은 행동 선택지를 제시하세요.\n"
            "행동이 충분히 구체화되면 실행 여부를 물은 뒤, 짧은 요약+응원으로 대화를 정리하세요.\n"
            "assistant_reply에서 금지 단어: 자동사고, 인지왜곡, 지지근거, 반박근거.\n"
            f"current_stage: {normalized_stage}\n"
            f"stage_guidance: {self._stage_guidance_text(current_stage)}\n"
            f"stage_snapshot: {json.dumps(stage_snapshot, ensure_ascii=False)}\n"
            f"latest_user_message: {latest_user}\n"
            f"stage_instruction: {stage_instruction}\n"
            f"existing_state: {json.dumps(existing_state, ensure_ascii=False)}\n"
            f"conversation:\n{transcript}"
        )

        payload = {
            "model": model,
            "temperature": 0.3,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
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
            with request.urlopen(req, timeout=20) as response:
                response_body = response.read().decode("utf-8")
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"openai_http_error:{exc.code}:{detail[:200]}") from exc
        except error.URLError as exc:
            raise RuntimeError("openai_network_error") from exc

        parsed = json.loads(response_body)
        content = (
            parsed.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "{}")
        )
        try:
            result = json.loads(content)
        except json.JSONDecodeError as exc:
            raise RuntimeError("openai_invalid_json") from exc

        return self._coerce_result(result, existing_state)

    @staticmethod
    def _list_count(source: dict[str, Any], key: str) -> int:
        value = source.get(key)
        if isinstance(value, list):
            return len(value)
        return 0

    def _stage_progress_snapshot(self, state: dict[str, Any]) -> dict[str, int]:
        return {
            "has_situation": 1 if str(state.get("situation") or "").strip() else 0,
            "thought_count": self._list_count(state, "automatic_thoughts"),
            "emotion_count": self._list_count(state, "emotions"),
            "intermediate_belief_count": self._list_count(state, "intermediate_belief_hypotheses"),
            "core_belief_count": self._list_count(state, "core_belief_hypotheses"),
            "evidence_true_count": self._list_count(state, "evidence_for"),
            "evidence_alt_count": self._list_count(state, "evidence_against"),
            "reframe_seed_count": self._list_count(state, "distortion_candidates")
            + self._list_count(state, "intermediate_belief_hypotheses")
            + self._list_count(state, "core_belief_hypotheses"),
            "action_count": self._list_count(state, "behaviors"),
        }

    @staticmethod
    def _latest_user_message(messages: list[dict[str, str]]) -> str:
        for item in reversed(messages):
            if item.get("role") == "user":
                return str(item.get("content") or "").strip()
        return ""

    @classmethod
    def _looks_like_belief_rejection(cls, text: str) -> bool:
        normalized = text.strip().lower()
        if not normalized:
            return False
        return any(marker in normalized for marker in cls._BELIEF_REJECTION_MARKERS)

    @classmethod
    def _stage_instruction(cls, stage: str, snapshot: dict[str, int], latest_user: str) -> str:
        if stage == "thought":
            if snapshot.get("thought_count", 0) <= 0:
                return (
                    "먼저 지금 마음속 핵심 문장을 1개 찾도록 돕고, 그 문장이 맞는지 사용자 확인 질문으로 마무리하세요."
                )
            if snapshot.get("emotion_count", 0) <= 0:
                return "핵심 문장을 다시 짚은 뒤, 그 문장이 만든 느낌과 강도(0~100)를 자연스럽게 물어보세요."
            belief_count = snapshot.get("intermediate_belief_count", 0) + snapshot.get("core_belief_count", 0)
            if belief_count <= 0:
                return (
                    "생각과 감정이 연결된 이유를 1~2단계만 더 탐색해 중간 믿음과 핵심 믿음 가설을 만드세요. "
                    "핵심 믿음은 부드러운 표현으로 제시하고 맞는지 확인 질문을 붙이세요."
                )
            if cls._looks_like_belief_rejection(latest_user):
                return (
                    "사용자가 믿음 가설에 동의하지 않았으니 기존 가설을 고수하지 말고, "
                    "대화 맥락을 반영해 대안을 1개 제시한 뒤 다시 확인하세요."
                )
            return (
                "핵심 믿음 가설을 짧게 정리하고 사용자가 맞다고 확인하면 다음 단계로 넘어갈 준비를 하세요."
            )

        if stage == "evidence":
            if snapshot.get("evidence_true_count", 0) <= 0:
                return (
                    "사용자 맥락에서 핵심 문장을 1개 제안해 확인받고, "
                    "그 문장이 맞다고 느껴지는 이유를 먼저 한 가지 물어보세요."
                )
            if snapshot.get("evidence_alt_count", 0) <= 0:
                return (
                    "이미 말한 이유를 짧게 정리한 뒤, "
                    "'하지만 이 생각이 틀렸다고 가정하면 어떤 근거가 떠오를까요?' 질문으로 이어가세요."
                )
            return "양쪽 이유를 나란히 짧게 요약해 보여주고, 사용자가 직접 정리 문장을 만들도록 유도하세요."

        if stage == "reframe":
            return (
                "지금까지 모은 내용을 1문장으로 요약하고, '원래 떠오른 문장 → 새 문장' 틀을 제시해 "
                "사용자가 직접 도움 되는 문장을 완성하도록 질문하세요."
            )

        if stage == "action":
            if snapshot.get("action_count", 0) <= 0:
                return (
                    "오늘 바로 실행할 아주 작은 행동 1개를 시간/장소와 함께 정하도록 돕고, "
                    "막히면 2~3개 선택지를 제시하세요."
                )
            return (
                "정한 행동이 충분히 구체적이면 실행 여부를 확인하고, "
                "짧은 요약+응원 멘트로 대화를 마무리하세요."
            )

        if stage == "situation" and snapshot.get("has_situation", 0) <= 0:
            return "오늘 가장 부담됐던 장면 하나를 시간·장소·사람 순으로 구체화하도록 질문하세요."

        return "현재 단계의 핵심 정보가 더 선명해지도록 한 번에 한 가지 질문만 하세요."

    def _coerce_result(
        self,
        result: dict[str, Any],
        existing_state: dict[str, Any],
    ) -> CbtStructuredDraft:
        state_raw = result.get("state")
        state = state_raw if isinstance(state_raw, dict) else {}
        merged_state = self._merge_state(existing_state, state)

        assistant_reply = str(result.get("assistant_reply") or "").strip()
        if not assistant_reply:
            assistant_reply = "지금 느끼는 감정을 충분히 이해해요. 가장 크게 떠오른 생각 한 가지를 같이 정리해볼까요?"

        return CbtStructuredDraft(
            assistant_reply=assistant_reply[:800],
            state=merged_state,
            planner_action=self._normalize_action(result.get("planner_action")),
            emotion_pre=self._score_0_100(result.get("emotion_pre")),
            emotion_post=self._score_0_100(result.get("emotion_post")),
            belief_pre=self._score_0_100(result.get("belief_pre")),
            belief_post=self._score_0_100(result.get("belief_post")),
            homework_commitment=self._score_0_10(result.get("homework_commitment")),
            helpfulness=self._score_0_10(result.get("helpfulness")),
        )

    def _fallback_draft(
        self,
        messages: list[dict[str, str]],
        existing_state: dict[str, Any] | None,
        current_stage: str | None,
    ) -> CbtStructuredDraft:
        latest_user = ""
        for item in reversed(messages):
            if item["role"] == "user":
                latest_user = item["content"]
                break

        base_state = self._merge_state(existing_state or {}, {})
        if latest_user and not base_state.get("situation"):
            base_state["situation"] = latest_user[:280]
        thoughts = base_state.setdefault("automatic_thoughts", [])
        normalized_stage = self._normalize_stage(current_stage) or "situation"
        can_append_thought = normalized_stage in {"thought", "evidence", "reframe", "action"}
        if isinstance(thoughts, list) and latest_user and can_append_thought:
            if latest_user not in thoughts:
                thoughts.append(latest_user[:200])

        safety_hint = "지금 안전이 걱정된다면 가까운 사람이나 지역 응급/상담 자원에 즉시 도움을 요청해 주세요."
        stage_prompt = self._fallback_stage_prompt(current_stage)
        assistant_reply = (
            f"말해줘서 고마워요. {stage_prompt} "
            "필요하면 아주 작은 다음 행동을 함께 정해볼 수 있어요. "
            f"{safety_hint}"
        )

        return CbtStructuredDraft(
            assistant_reply=assistant_reply,
            state=base_state,
            planner_action="review_evidence",
            emotion_pre=None,
            emotion_post=None,
            belief_pre=None,
            belief_post=None,
            homework_commitment=None,
            helpfulness=None,
        )

    @classmethod
    def _normalize_stage(cls, value: str | None) -> str | None:
        if value is None:
            return None
        candidate = str(value).strip().lower()
        if candidate in cls._STAGE_GUIDANCE:
            return candidate
        return None

    @classmethod
    def _stage_guidance_text(cls, stage: str | None) -> str:
        normalized = cls._normalize_stage(stage)
        if normalized is None:
            return cls._STAGE_GUIDANCE["situation"]
        return cls._STAGE_GUIDANCE[normalized]

    @classmethod
    def _fallback_stage_prompt(cls, stage: str | None) -> str:
        normalized = cls._normalize_stage(stage) or "situation"
        prompts = {
            "situation": "오늘 가장 부담됐던 상황을 시간, 장소, 사람 기준으로 한 문장만 적어볼까요?",
            "thought": "그 순간 머릿속에 가장 먼저 스친 문장을 먼저 잡고, 이어서 그때 느낌과 강도를 적어볼까요?",
            "evidence": "먼저 그 생각이 맞다고 느껴지는 이유를 보고, 다음에 다르게 볼 이유도 하나씩 찾아볼까요?",
            "reframe": "지금까지 정리를 바탕으로 나에게 더 도움이 되는 문장을 직접 만들어볼까요?",
            "action": "오늘 실행 가능한 아주 작은 행동 하나를 시간까지 포함해 정해볼까요?",
        }
        return prompts[normalized]

    @staticmethod
    def _normalize_action(value: Any) -> str:
        allowed = {
            "review_evidence",
            "behavior_experiment",
            "grounding",
            "activity_scheduling",
            "sleep_anchor",
            "support_contact",
        }
        candidate = str(value or "review_evidence").strip()
        return candidate if candidate in allowed else "review_evidence"

    @staticmethod
    def _score_0_100(value: Any) -> int | None:
        if value is None:
            return None
        try:
            parsed = int(float(value))
        except (TypeError, ValueError):
            return None
        return max(0, min(100, parsed))

    @staticmethod
    def _score_0_10(value: Any) -> int | None:
        if value is None:
            return None
        try:
            parsed = int(float(value))
        except (TypeError, ValueError):
            return None
        return max(0, min(10, parsed))

    def _merge_state(
        self,
        existing_state: dict[str, Any],
        next_state: dict[str, Any],
    ) -> dict[str, Any]:
        merged: dict[str, Any] = {
            "situation": "",
            "automatic_thoughts": [],
            "emotions": [],
            "behaviors": [],
            "balanced_statement": "",
            "evidence_for": [],
            "evidence_against": [],
            "distortion_candidates": [],
            "intermediate_belief_hypotheses": [],
            "core_belief_hypotheses": [],
            "risk_flags": {
                "functional_impairment_flag": False,
                "self_harm_flag": False,
                "suicide_risk_level": 0,
                "violence_risk_flag": False,
            },
        }

        for source in (existing_state, next_state):
            if not isinstance(source, dict):
                continue
            for key in merged:
                if key not in source:
                    continue
                merged[key] = source[key]

        if not isinstance(merged.get("situation"), str):
            merged["situation"] = ""
        if not isinstance(merged.get("balanced_statement"), str):
            merged["balanced_statement"] = ""

        for key in (
            "automatic_thoughts",
            "emotions",
            "behaviors",
            "evidence_for",
            "evidence_against",
            "distortion_candidates",
            "intermediate_belief_hypotheses",
            "core_belief_hypotheses",
        ):
            if not isinstance(merged.get(key), list):
                merged[key] = []

        risk_flags = merged.get("risk_flags")
        if not isinstance(risk_flags, dict):
            risk_flags = {}
        merged["risk_flags"] = {
            "functional_impairment_flag": bool(risk_flags.get("functional_impairment_flag", False)),
            "self_harm_flag": bool(risk_flags.get("self_harm_flag", False)),
            "suicide_risk_level": max(0, min(3, int(risk_flags.get("suicide_risk_level", 0) or 0))),
            "violence_risk_flag": bool(risk_flags.get("violence_risk_flag", False)),
        }

        return merged
