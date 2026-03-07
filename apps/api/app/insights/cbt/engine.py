from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .llm_limited import CbtLimitedLlm, LimitedLlmMeta

FLOW_ID = "cbt_thought_record_v2"
DEFAULT_COACH_NAME = "마음코치"
DEFAULT_USER_NAME = "나"
STAGES: tuple[str, ...] = (
    "situation",
    "emotion",
    "thought",
    "evidence",
    "alternative_plan",
    "summary",
)
PHASE_INDEX: dict[str, int] = {
    "situation": 0,
    "emotion": 1,
    "thought": 2,
    "evidence": 3,
    "alternative_plan": 4,
    "summary": 5,
}
LEGACY_STAGE_MAP: dict[str, str] = {
    "reframe": "alternative_plan",
    "action": "alternative_plan",
}
SKIP_KEYWORDS = ("건너뛰기", "모르겠", "skip")
RESET_KEYWORDS = ("주제 다시", "다시 시작", "처음부터", "reset")
EVIDENCE_TARGET_DEFAULT = 2
EVIDENCE_TARGET_MAX = 5
THOUGHT_PROBE_MAX = 2
ACTION_SKIP_STAGE = "skip_stage"
ACTION_RETRY_STAGE = "retry_stage"
ACTION_RESET_TOPIC = "reset_topic"
ACTION_END_SESSION = "end_session"
ACTION_NEXT_STAGE = "next_stage"
ACTION_CHOOSE_ACTION_COMMITMENT = "choose_action_commitment"
ACTION_CHOOSE_THOUGHT_PRACTICE = "choose_thought_practice"
ACTION_FINISH_WITHOUT_TODO = "finish_without_todo"
THOUGHT_PROBE_QUESTIONS: tuple[str, ...] = (
    "그 생각이 사실이라면, 제일 걱정되는 건 뭐예요?",
    "그 생각의 핵심 메시지를 한마디로 바꾸면 뭐가 될까요?",
    "그게 사실이라면, 나에 대해 어떤 말처럼 느껴져요?",
)


@dataclass
class CbtStateMachineTurn:
    state: dict[str, Any]
    assistant_messages: list[str]
    quick_replies: list[dict[str, str]]
    action_links: list[dict[str, str]]
    current_stage: str
    phase_key: str
    subphase_key: str
    phase_index: int
    planner_action: str
    risk_level: int
    safety_first: bool
    safety_message: str | None
    fallback_reason: str | None
    state_repeat_count: int
    conversation_closed: bool
    requires_today_record: bool
    today_record_route: str | None


class CbtThoughtRecordEngine:
    """State-machine based CBT thought-record engine."""

    def __init__(self) -> None:
        self._flow = self._load_flow()
        self._llm = CbtLimitedLlm()

    @staticmethod
    def _load_flow() -> dict[str, Any]:
        path = Path(__file__).resolve().parent / "flows" / "default_v2.json"
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    @staticmethod
    def _prefill_item(
        label: str,
        fill_text: str | None = None,
        *,
        append_colon: bool = True,
    ) -> dict[str, str]:
        resolved = (fill_text or label).strip()
        if append_colon and resolved and not resolved.endswith(":"):
            resolved = f"{resolved}:"
        if append_colon and resolved.endswith(":"):
            resolved = f"{resolved} "
        return {
            "type": "prefill",
            "label": label[:80],
            "fill_text": resolved[:120],
        }

    @staticmethod
    def _action_item(label: str, action_id: str) -> dict[str, str]:
        return {
            "type": "action",
            "label": label[:80],
            "action_id": action_id[:80],
        }

    def _quick_set(self, phase_key: str, subphase_key: str) -> list[dict[str, str]]:
        registry: dict[tuple[str, str], list[dict[str, str]]] = {
            ("situation", "topic"): [
                self._prefill_item("학업/일"),
                self._prefill_item("인간관계"),
                self._prefill_item("컨디션"),
                self._prefill_item("기타", "기타"),
                self._action_item("건너뛰기", ACTION_SKIP_STAGE),
                self._action_item("주제 다시", ACTION_RESET_TOPIC),
                self._action_item("종료", ACTION_END_SESSION),
            ],
            ("emotion", "label"): [
                self._prefill_item("불안"),
                self._prefill_item("서운함"),
                self._prefill_item("분노"),
                self._prefill_item("슬픔"),
                self._prefill_item("부담"),
                self._prefill_item("무기력"),
                self._prefill_item("기타", "기타"),
                self._action_item("건너뛰기", ACTION_SKIP_STAGE),
                self._action_item("주제 다시", ACTION_RESET_TOPIC),
                self._action_item("종료", ACTION_END_SESSION),
            ],
            ("emotion", "intensity"): [
                self._prefill_item("30", append_colon=False),
                self._prefill_item("50", append_colon=False),
                self._prefill_item("70", append_colon=False),
                self._prefill_item("90", append_colon=False),
                self._action_item("건너뛰기", ACTION_SKIP_STAGE),
                self._action_item("주제 다시", ACTION_RESET_TOPIC),
                self._action_item("종료", ACTION_END_SESSION),
            ],
            ("thought", "auto_thought"): [
                self._prefill_item("떠오른 생각"),
                self._prefill_item("머릿속 한마디"),
                self._prefill_item("결론처럼 느껴진 말"),
                self._prefill_item("걱정 한 줄"),
                self._action_item("건너뛰기", ACTION_SKIP_STAGE),
                self._action_item("주제 다시", ACTION_RESET_TOPIC),
                self._action_item("종료", ACTION_END_SESSION),
            ],
            ("thought", "core_probe"): [
                self._prefill_item("무능해 보일까 봐", "무능해 보일까 봐"),
                self._prefill_item("미움받을까 봐", "미움받을까 봐"),
                self._prefill_item("버려질까 봐", "버려질까 봐"),
                self._prefill_item("실패할까 봐", "실패할까 봐"),
                self._prefill_item("통제 못 할까 봐", "통제 못 할까 봐"),
                self._prefill_item("기타", "기타"),
                self._action_item("건너뛰기", ACTION_SKIP_STAGE),
                self._action_item("주제 다시", ACTION_RESET_TOPIC),
                self._action_item("종료", ACTION_END_SESSION),
            ],
            ("thought", "core_blocked"): [
                self._action_item("다시 답하기", ACTION_RETRY_STAGE),
                self._action_item("주제 다시", ACTION_RESET_TOPIC),
                self._action_item("종료", ACTION_END_SESSION),
            ],
            ("evidence", "evidence_for"): [
                self._prefill_item("관찰한 사실"),
                self._prefill_item("내 경험"),
                self._prefill_item("누가 한 말/메시지"),
                self._prefill_item("내 행동/반응"),
                self._prefill_item("몸의 반응(신체)"),
                self._action_item("건너뛰기", ACTION_SKIP_STAGE),
                self._action_item("다음으로", ACTION_NEXT_STAGE),
                self._action_item("주제 다시", ACTION_RESET_TOPIC),
                self._action_item("종료", ACTION_END_SESSION),
            ],
            ("evidence", "evidence_against"): [
                self._prefill_item("예외였던 순간"),
                self._prefill_item("다른 가능성"),
                self._prefill_item("확인되지 않은 부분"),
                self._prefill_item("타인의 피드백/반응"),
                self._prefill_item("나아졌던 경험"),
                self._action_item("건너뛰기", ACTION_SKIP_STAGE),
                self._action_item("다음으로", ACTION_NEXT_STAGE),
                self._action_item("주제 다시", ACTION_RESET_TOPIC),
                self._action_item("종료", ACTION_END_SESSION),
            ],
            ("alternative_plan", "alternative"): [
                self._prefill_item("새 생각", "새 생각", append_colon=False),
                self._prefill_item("직접 다듬기", "새 생각: ", append_colon=False),
                self._action_item("건너뛰기", ACTION_SKIP_STAGE),
                self._action_item("주제 다시", ACTION_RESET_TOPIC),
                self._action_item("종료", ACTION_END_SESSION),
            ],
            ("alternative_plan", "commitment"): [
                self._action_item("행동으로 정하기", ACTION_CHOOSE_ACTION_COMMITMENT),
                self._action_item("생각 연습으로 정하기", ACTION_CHOOSE_THOUGHT_PRACTICE),
                self._action_item("이번에는 TO DO 없이 마무리", ACTION_FINISH_WITHOUT_TODO),
                self._action_item("주제 다시", ACTION_RESET_TOPIC),
                self._action_item("종료", ACTION_END_SESSION),
            ],
            ("alternative_plan", "commitment_action"): [
                self._prefill_item("10분만 준비/정리하기"),
                self._prefill_item("확인 메시지 1줄 보내기"),
                self._prefill_item("5분만 시작하기"),
                self._action_item("건너뛰기", ACTION_SKIP_STAGE),
                self._action_item("주제 다시", ACTION_RESET_TOPIC),
                self._action_item("종료", ACTION_END_SESSION),
            ],
            ("alternative_plan", "commitment_thought"): [
                self._prefill_item("예외 1개 찾기"),
                self._prefill_item("반대 근거 1개 추가"),
                self._prefill_item("'항상/절대' 표현 줄이기"),
                self._action_item("건너뛰기", ACTION_SKIP_STAGE),
                self._action_item("주제 다시", ACTION_RESET_TOPIC),
                self._action_item("종료", ACTION_END_SESSION),
            ],
            ("summary", "summary"): [
                self._action_item("주제 다시", ACTION_RESET_TOPIC),
                self._action_item("종료", ACTION_END_SESSION),
            ],
            ("fallback", "general"): [
                self._action_item("다시 답하기", ACTION_RETRY_STAGE),
                self._action_item("주제 다시", ACTION_RESET_TOPIC),
                self._action_item("종료", ACTION_END_SESSION),
            ],
            ("fallback", "hard_required"): [
                self._action_item("다시 답하기", ACTION_RETRY_STAGE),
                self._action_item("주제 다시", ACTION_RESET_TOPIC),
                self._action_item("종료", ACTION_END_SESSION),
            ],
        }
        return registry.get((phase_key, subphase_key), registry[("fallback", "general")])

    @staticmethod
    def _normalize_subphase(stage: str, subphase: str | None) -> str:
        if stage == "situation":
            return "topic"
        if stage == "emotion":
            return "intensity" if subphase == "intensity" else "label"
        if stage == "thought":
            if subphase == "core_blocked":
                return "core_blocked"
            if subphase == "core_probe":
                return "core_probe"
            return "auto_thought"
        if stage == "evidence":
            return "evidence_against" if subphase == "evidence_against" else "evidence_for"
        if stage == "alternative_plan":
            if subphase in {"commitment", "commitment_action", "commitment_thought"}:
                return subphase
            return "alternative"
        return "summary"

    @classmethod
    def _normalize_ending(cls, sentence: str) -> str:
        normalized = sentence.strip()
        replacements = (
            ("할게.", "할게요."),
            ("볼게.", "볼게요."),
            ("좋아.", "좋아요."),
            ("괜찮아.", "괜찮아요."),
            ("해봐.", "해봐요."),
            ("해볼까?", "해볼까요?"),
            ("말해줄래?", "말해줄래요?"),
            ("말해줘.", "말해줘요."),
            ("알려줘.", "알려줘요."),
            ("적어봐.", "적어봐요."),
            ("되죠요", "되죠"),
            ("했어요요", "했어요"),
            ("네요요", "네요"),
        )
        for source, target in replacements:
            normalized = normalized.replace(source, target)
        stem = normalized.rstrip(" .!?")
        if stem.endswith(("요", "니다", "까요", "세요", "죠")):
            return cls._normalize_korean_polite(normalized)
        if normalized.endswith("?"):
            return cls._normalize_korean_polite(f"{stem}요?")
        if normalized.endswith("!"):
            return cls._normalize_korean_polite(f"{stem}요!")
        if normalized.endswith("."):
            return cls._normalize_korean_polite(f"{stem}요.")
        return cls._normalize_korean_polite(f"{stem}요.")

    @staticmethod
    def _normalize_korean_polite(text: str) -> str:
        normalized = text
        normalized = normalized.replace("되죠요", "되죠")
        normalized = normalized.replace("했어요요", "했어요")
        normalized = normalized.replace("네요요", "네요")
        normalized = re.sub(r"요요+", "요", normalized)
        return normalized.strip()

    @classmethod
    def _normalize_coach_message(cls, message: str) -> str:
        plain = (
            message.replace("자동적 사고", "순간 떠오른 생각")
            .replace("인지왜곡", "생각이 한쪽으로 기울어진 패턴")
            .replace("근거/반증", "맞아 보이는 이유 / 꼭 그렇지 않을 수 있는 이유")
            .replace("대안적 사고", "좀 더 균형 잡힌 생각")
            .replace("체크인", "오늘 기록")
        )
        lines: list[str] = []
        for chunk in plain.splitlines():
            item = chunk.strip()
            if not item:
                continue
            lines.append(cls._normalize_ending(item))
        return "\n".join(lines)[:900]

    @staticmethod
    def _looks_core_message(text: str) -> bool:
        normalized = text.lower().replace(" ", "")
        markers = (
            "나는",
            "가치없",
            "무가치",
            "사랑받",
            "버림받",
            "실패하",
            "존재",
            "쓸모없",
            "혼자남",
            "통제못",
        )
        return any(marker in normalized for marker in markers)

    @staticmethod
    def _looks_valid_label(text: str) -> bool:
        value = text.strip()
        if len(value) < 1:
            return False
        return any(char.isalnum() for char in value)

    @staticmethod
    def _strip_prefill_seed(text: str, *, allow_prefix_only: bool = False) -> str:
        value = text.strip()
        if not value:
            return ""
        if ":" not in value:
            return value
        head, tail = value.split(":", 1)
        head = head.strip()
        tail = tail.strip()
        if tail:
            return tail
        if allow_prefix_only:
            return head
        return ""

    @staticmethod
    def _message_signature(text: str) -> str:
        return re.sub(r"[^0-9a-zA-Z가-힣]+", "", text.lower())

    @classmethod
    def _dedupe_message_lines(cls, text: str) -> str:
        parts = [chunk.strip() for chunk in re.split(r"(?:\n+|(?<=[.!?]))\s*", text) if chunk.strip()]
        kept: list[str] = []
        seen: set[str] = set()
        for part in parts:
            sig = cls._message_signature(part)
            if not sig or sig in seen:
                continue
            kept.append(part)
            seen.add(sig)
        return "\n".join(kept).strip()

    @classmethod
    def _prepare_assistant_messages(cls, state: dict[str, Any], messages: list[str]) -> list[str]:
        meta = state.get("meta")
        if not isinstance(meta, dict):
            meta = {}
            state["meta"] = meta
        previous_sig = cls._message_signature(str(meta.get("last_assistant_text") or ""))
        seen: set[str] = set()
        prepared: list[str] = []
        for raw in messages:
            normalized = cls._normalize_coach_message(raw)
            compact = cls._dedupe_message_lines(normalized)
            sig = cls._message_signature(compact)
            if not sig:
                continue
            if sig == previous_sig or sig in seen:
                continue
            prepared.append(compact)
            seen.add(sig)
            previous_sig = sig
        if not prepared:
            prepared = [cls._normalize_coach_message("좋아요. 이어서 진행해볼게요.")]
        meta["last_assistant_text"] = prepared[-1]
        return prepared

    @staticmethod
    def _emotion_degree_label(label: str) -> str:
        mapping = {
            "불안": "불안함",
            "서운함": "서운함",
            "분노": "분노",
            "슬픔": "슬픔",
            "부담": "부담감",
            "무기력": "무기력함",
        }
        return mapping.get(label.strip(), label.strip() or "감정")

    def bootstrap(
        self,
        *,
        today_record: dict[str, Any] | None,
        coach_nickname: str | None,
        user_nickname: str | None,
    ) -> CbtStateMachineTurn:
        state = self._base_state(
            today_record=today_record,
            coach_nickname=coach_nickname,
            user_nickname=user_nickname,
        )
        has_today_record = bool(state["today_record"].get("exists"))
        assistant_messages: list[str] = []
        action_links: list[dict[str, str]] = []

        if has_today_record:
            short = self._today_record_short(state["today_record"])
            assistant_messages.append(f"반가워요. 오늘 기록을 참고해서 함께 정리해볼게요. {short}")
        else:
            assistant_messages.append(
                "반가워요. 오늘 상태 기록이 아직 없네요. 원하면 먼저 오늘 기록을 남기고 돌아와도 좋아요."
            )
            action_links.append({"label": "오늘 기록으로 이동", "route": "/checkin"})

        assistant_messages.append(
            "지금 가장 마음을 힘들게 하는 상황을 한 줄로 말해줄래요?"
        )
        assistant_messages = self._prepare_assistant_messages(state, assistant_messages)
        return CbtStateMachineTurn(
            state=state,
            assistant_messages=assistant_messages,
            quick_replies=self._quick_set("situation", "topic"),
            action_links=action_links,
            current_stage="situation",
            phase_key="situation",
            subphase_key="topic",
            phase_index=PHASE_INDEX["situation"],
            planner_action="review_evidence",
            risk_level=0,
            safety_first=False,
            safety_message=None,
            fallback_reason=None,
            state_repeat_count=0,
            conversation_closed=False,
            requires_today_record=not has_today_record,
            today_record_route="/checkin" if not has_today_record else None,
        )

    def process_turn(
        self,
        *,
        raw_state: dict[str, Any],
        user_input: str,
        quick_reply_action_id: str | None = None,
        selected_quick_reply: str | None = None,
    ) -> CbtStateMachineTurn:
        state = self._normalize_state(raw_state)
        stage = self._normalize_stage(state.get("current_stage"))
        subphase = self._normalize_subphase(stage, str(state["meta"].get("subphase_key") or ""))
        action_id = (quick_reply_action_id or "").strip().lower()
        text = (user_input or selected_quick_reply or "").strip()

        if action_id == ACTION_END_SESSION:
            return self._close_turn(
                state=state,
                stage=stage,
                message="여기서 잠깐 마무리해도 괜찮아요.",
                reason="user_end_session",
            )

        if action_id == ACTION_RETRY_STAGE:
            return self._retry_turn(state=state, stage=stage, subphase=subphase)

        if not text and not action_id:
            return self._invalid_input_response(
                state=state,
                stage=stage,
                subphase=subphase,
                fallback_reason="empty_input",
                user_input=text,
            )

        if state["meta"].get("conversation_closed"):
            assistant_messages = self._prepare_assistant_messages(
                state,
                [
                    "이미 세션이 마무리된 상태예요.",
                    "새 주제로 다시 시작하고 싶다면 ‘주제 다시 선택하기’를 눌러주세요.",
                ],
            )
            return CbtStateMachineTurn(
                state=state,
                assistant_messages=assistant_messages,
                quick_replies=self._quick_set("summary", "summary"),
                action_links=[],
                current_stage=stage,
                phase_key=stage,
                subphase_key=subphase,
                phase_index=PHASE_INDEX.get(stage, 0),
                planner_action=self._infer_planner_action(state),
                risk_level=self._risk_level(state.get("risk_flags", {})),
                safety_first=False,
                safety_message=None,
                fallback_reason="session_already_closed",
                state_repeat_count=int(state["meta"].get("state_repeat_count", 0)),
                conversation_closed=True,
                requires_today_record=not bool(state["today_record"].get("exists")),
                today_record_route="/checkin" if not bool(state["today_record"].get("exists")) else None,
            )

        stage = self._handle_control_commands(state, stage, text=text, action_id=action_id)
        subphase = self._normalize_subphase(stage, str(state["meta"].get("subphase_key") or ""))
        risk_flags, risk_meta = self._assess_risk(text, state)
        state["risk_flags"] = risk_flags
        risk_level = self._risk_level(risk_flags)
        if risk_level >= 2:
            return self._safety_turn(
                state=state,
                stage=stage,
                subphase=subphase,
                risk_level=risk_level,
                risk_meta=risk_meta,
            )

        extract, extract_meta = self._extract(stage, text, state)
        handler = {
            "situation": self._handle_situation,
            "emotion": self._handle_emotion,
            "thought": self._handle_thought,
            "evidence": self._handle_evidence,
            "alternative_plan": self._handle_alternative_plan,
            "summary": self._handle_summary,
        }[stage]
        handled = handler(state, text, extract, action_id=action_id)
        if handled is None:
            merged_reason = ",".join(
                part
                for part in [
                    extract_meta.fallback_reason,
                ]
                if part
            ) or "stage_validation_failed"
            return self._invalid_input_response(
                state=state,
                stage=stage,
                subphase=subphase,
                fallback_reason=merged_reason,
                user_input=text,
                extra_meta=[risk_meta, extract_meta],
            )

        next_stage, next_subphase, next_question, quick_replies, action_links = handled
        state["current_stage"] = next_stage
        state["meta"]["subphase_key"] = next_subphase
        state["meta"]["state_repeat_count"] = 0
        state["meta"]["stage_repeat_count"] = 0
        state["meta"]["turn_index"] = int(state["meta"].get("turn_index", 0)) + 1

        composer, compose_meta = self._compose(
            stage=stage,
            user_text=text,
            state=state,
            next_question=next_question,
            fallback_empathy=self._fallback_empathy(stage, text),
        )
        empathy = str(composer.get("empathy") or "").strip() or self._fallback_empathy(stage, text)
        restatement = str(composer.get("restatement") or "").strip()
        reflection_slot = self._reflection_slot(stage=stage, subphase=subphase, state=state)
        if reflection_slot and reflection_slot == str(state["meta"].get("last_reflected_slot") or ""):
            restatement = ""
        if restatement:
            state["meta"]["last_reflected_slot"] = reflection_slot
        if restatement:
            first_message = f"{empathy}\n{restatement}"
        else:
            first_message = empathy
        second_message = str(composer.get("next_question") or "").strip() or next_question
        base_messages = self._prepare_assistant_messages(state, [first_message, second_message])
        if len(base_messages) == 1:
            fallback_question = self._normalize_coach_message(next_question)
            if self._message_signature(base_messages[0]) != self._message_signature(fallback_question):
                base_messages.append(fallback_question)

        if next_stage == "summary":
            state["summary_text"] = self._build_summary_text(state)

        planner_action = self._infer_planner_action(state)
        conversation_closed = next_stage == "summary"
        if conversation_closed:
            state["meta"]["conversation_closed"] = True

        fallback_reason = self._merge_fallback_reasons(risk_meta, extract_meta, compose_meta)
        self._append_turn_diagnostics(
            state,
            stage=stage,
            llm_meta=[risk_meta, extract_meta, compose_meta],
            fallback_reason=fallback_reason,
            user_input=text,
        )
        return CbtStateMachineTurn(
            state=state,
            assistant_messages=base_messages,
            quick_replies=quick_replies,
            action_links=action_links,
            current_stage=next_stage,
            phase_key=next_stage,
            subphase_key=next_subphase,
            phase_index=PHASE_INDEX.get(next_stage, 0),
            planner_action=planner_action,
            risk_level=risk_level,
            safety_first=False,
            safety_message=None,
            fallback_reason=fallback_reason,
            state_repeat_count=0,
            conversation_closed=conversation_closed,
            requires_today_record=not bool(state["today_record"].get("exists")),
            today_record_route="/checkin" if not bool(state["today_record"].get("exists")) else None,
        )

    def _base_state(
        self,
        *,
        today_record: dict[str, Any] | None,
        coach_nickname: str | None,
        user_nickname: str | None,
    ) -> dict[str, Any]:
        coach = (coach_nickname or "").strip() or DEFAULT_COACH_NAME
        user = (user_nickname or "").strip() or DEFAULT_USER_NAME
        record = today_record if isinstance(today_record, dict) else {}
        return {
            "flow_id": FLOW_ID,
            "flow_version": self._flow.get("version", "2.0.0"),
            "current_stage": "situation",
            "situation_text": "",
            "emotion_label": "",
            "emotion_intensity_0_100": None,
            "auto_thought_text": "",
            "core_message_text": "",
            "evidence_for": [],
            "evidence_against": [],
            "alternative_thought": "",
            "commitment_type": None,
            "commitment_text": "",
            "summary_text": "",
            "todo_id": None,
            # Backward-compatible keys.
            "situation": "",
            "automatic_thoughts": [],
            "emotions": [],
            "behaviors": [],
            "balanced_statement": "",
            "risk_flags": {
                "functional_impairment_flag": False,
                "self_harm_flag": False,
                "suicide_risk_level": 0,
                "violence_risk_flag": False,
            },
            "today_record": {
                "exists": bool(record.get("exists")),
                "date": record.get("date"),
                "mood_label": record.get("mood_label"),
                "mood_intensity_0_100": record.get("mood_intensity_0_100"),
                "sleep_hours": record.get("sleep_hours"),
                "energy_1_5": record.get("energy_1_5"),
                "caffeine_after_2pm_flag": record.get("caffeine_after_2pm_flag"),
                "exercise_bucket": record.get("exercise_bucket"),
            },
            "profile_snapshot": {
                "coach_nickname": coach,
                "user_nickname": user,
            },
            "meta": {
                "evidence_substep": "for",
                "emotion_substep": "label",
                "thought_substep": "auto_thought",
                "alternative_substep": "alternative",
                "subphase_key": "topic",
                "thought_probe_count": 0,
                "stage_repeat_count": 0,
                "state_repeat_count": 0,
                "turn_index": 0,
                "conversation_closed": False,
                "last_reflected_slot": None,
                "last_assistant_text": "",
            },
            "turn_diagnostics": [],
        }

    def _normalize_state(self, raw: dict[str, Any]) -> dict[str, Any]:
        raw_profile = ((raw or {}).get("profile_snapshot") or {}) if isinstance(raw, dict) else {}
        state = self._base_state(
            today_record=raw.get("today_record") if isinstance(raw, dict) else None,
            coach_nickname=raw_profile.get("coach_nickname"),
            user_nickname=raw_profile.get("user_nickname"),
        )
        if not isinstance(raw, dict):
            return state

        for key in (
            "flow_id",
            "flow_version",
            "situation_text",
            "emotion_label",
            "emotion_intensity_0_100",
            "auto_thought_text",
            "core_message_text",
            "alternative_thought",
            "commitment_type",
            "commitment_text",
            "summary_text",
            "todo_id",
            "situation",
            "balanced_statement",
        ):
            if key in raw:
                state[key] = raw[key]

        for key in ("evidence_for", "evidence_against", "automatic_thoughts", "emotions", "behaviors"):
            value = raw.get(key)
            if isinstance(value, list):
                state[key] = value

        if isinstance(raw.get("profile_snapshot"), dict):
            state["profile_snapshot"]["coach_nickname"] = (
                str(raw["profile_snapshot"].get("coach_nickname") or "").strip() or DEFAULT_COACH_NAME
            )
            state["profile_snapshot"]["user_nickname"] = (
                str(raw["profile_snapshot"].get("user_nickname") or "").strip() or DEFAULT_USER_NAME
            )

        if isinstance(raw.get("today_record"), dict):
            state["today_record"].update(raw["today_record"])
        if isinstance(raw.get("risk_flags"), dict):
            state["risk_flags"] = {
                "functional_impairment_flag": bool(raw["risk_flags"].get("functional_impairment_flag", False)),
                "self_harm_flag": bool(raw["risk_flags"].get("self_harm_flag", False)),
                "suicide_risk_level": int(raw["risk_flags"].get("suicide_risk_level", 0) or 0),
                "violence_risk_flag": bool(raw["risk_flags"].get("violence_risk_flag", False)),
            }
        if isinstance(raw.get("meta"), dict):
            state["meta"].update(raw["meta"])
        if isinstance(raw.get("turn_diagnostics"), list):
            state["turn_diagnostics"] = raw["turn_diagnostics"][-80:]
        if "current_stage" in raw:
            state["current_stage"] = self._normalize_stage(raw.get("current_stage"))

        # Backward compatibility hydration.
        if not str(state.get("situation_text") or "").strip() and str(state.get("situation") or "").strip():
            state["situation_text"] = str(state["situation"])
        if not str(state.get("auto_thought_text") or "").strip():
            auto_thoughts = state.get("automatic_thoughts")
            if isinstance(auto_thoughts, list) and auto_thoughts:
                state["auto_thought_text"] = str(auto_thoughts[0])
        if (
            state.get("emotion_intensity_0_100") is None
            or not str(state.get("emotion_label") or "").strip()
        ) and isinstance(state.get("emotions"), list) and state["emotions"]:
            first = state["emotions"][0]
            if isinstance(first, dict):
                state["emotion_label"] = str(first.get("name") or state.get("emotion_label") or "")
                if state.get("emotion_intensity_0_100") is None:
                    try:
                        state["emotion_intensity_0_100"] = int(first.get("intensity"))  # type: ignore[arg-type]
                    except (TypeError, ValueError):
                        pass
        if (
            not str(state.get("alternative_thought") or "").strip()
            and str(state.get("balanced_statement") or "").strip()
        ):
            state["alternative_thought"] = str(state["balanced_statement"])
        if not str(state.get("core_message_text") or "").strip():
            core_candidates = state.get("core_belief_hypotheses")
            if isinstance(core_candidates, list) and core_candidates:
                first = core_candidates[0]
                if isinstance(first, dict):
                    state["core_message_text"] = str(first.get("text") or "").strip()
        if (
            not str(state.get("commitment_text") or "").strip()
            and isinstance(state.get("behaviors"), list)
            and state["behaviors"]
        ):
            state["commitment_text"] = str(state["behaviors"][0])
            state["commitment_type"] = "behavior"

        state["meta"]["emotion_substep"] = str(state["meta"].get("emotion_substep") or "label")
        state["meta"]["thought_substep"] = str(state["meta"].get("thought_substep") or "auto_thought")
        state["meta"]["alternative_substep"] = str(state["meta"].get("alternative_substep") or "alternative")
        state["meta"]["thought_probe_count"] = int(state["meta"].get("thought_probe_count", 0) or 0)
        state["meta"]["subphase_key"] = self._normalize_subphase(
            state["current_stage"], str(state["meta"].get("subphase_key") or "")
        )

        state["risk_flags"]["suicide_risk_level"] = max(
            0, min(3, int(state["risk_flags"].get("suicide_risk_level", 0) or 0))
        )
        state["current_stage"] = self._normalize_stage(state.get("current_stage"))
        return state

    def _normalize_stage(self, stage: Any) -> str:
        candidate = str(stage or "situation").strip().lower()
        candidate = LEGACY_STAGE_MAP.get(candidate, candidate)
        return candidate if candidate in STAGES else "situation"

    def _handle_control_commands(
        self,
        state: dict[str, Any],
        stage: str,
        *,
        text: str,
        action_id: str,
    ) -> str:
        lowered = text.lower()
        if action_id == ACTION_RESET_TOPIC or any(token in lowered for token in RESET_KEYWORDS):
            self._reset_topic(state)
            return "situation"
        if stage == "summary" and "다시" in lowered:
            self._reset_topic(state)
            return "situation"
        return stage

    def _reset_topic(self, state: dict[str, Any]) -> None:
        for key in (
            "situation_text",
            "emotion_label",
            "emotion_intensity_0_100",
            "auto_thought_text",
            "core_message_text",
            "alternative_thought",
            "commitment_type",
            "commitment_text",
            "summary_text",
            "todo_id",
            "situation",
            "balanced_statement",
        ):
            state[key] = "" if key not in {"emotion_intensity_0_100", "todo_id"} else None
        state["evidence_for"] = []
        state["evidence_against"] = []
        state["automatic_thoughts"] = []
        state["emotions"] = []
        state["behaviors"] = []
        state["meta"]["evidence_substep"] = "for"
        state["meta"]["emotion_substep"] = "label"
        state["meta"]["thought_substep"] = "auto_thought"
        state["meta"]["alternative_substep"] = "alternative"
        state["meta"]["subphase_key"] = "topic"
        state["meta"]["thought_probe_count"] = 0
        state["meta"]["stage_repeat_count"] = 0
        state["meta"]["state_repeat_count"] = 0
        state["meta"]["conversation_closed"] = False
        state["meta"]["last_reflected_slot"] = None

    def _reflection_slot(self, *, stage: str, subphase: str, state: dict[str, Any]) -> str:
        if stage == "emotion":
            label = str(state.get("emotion_label") or "").strip()
            return f"emotion:{label or 'none'}"
        if stage == "thought":
            thought = str(state.get("auto_thought_text") or "").strip()
            return f"thought:{thought[:40] or 'none'}:{subphase}"
        if stage == "evidence":
            return f"evidence:{subphase}"
        return f"{stage}:{subphase}"

    def _retry_turn(self, *, state: dict[str, Any], stage: str, subphase: str) -> CbtStateMachineTurn:
        prompt = self._current_stage_prompt(stage=stage, subphase=subphase, state=state)
        if stage == "alternative_plan" and subphase == "alternative":
            quick_replies = self._alternative_quick_set(state)
        else:
            quick_replies = self._quick_set(stage, subphase)
        message = "좋아요. 같은 단계를 다른 방식으로 다시 정리해볼게요."
        question = prompt
        assistant_messages = self._prepare_assistant_messages(state, [message, question])
        return CbtStateMachineTurn(
            state=state,
            assistant_messages=assistant_messages,
            quick_replies=quick_replies,
            action_links=[],
            current_stage=stage,
            phase_key=stage,
            subphase_key=subphase,
            phase_index=PHASE_INDEX.get(stage, 0),
            planner_action=self._infer_planner_action(state),
            risk_level=self._risk_level(state.get("risk_flags", {})),
            safety_first=False,
            safety_message=None,
            fallback_reason="retry_stage",
            state_repeat_count=int(state["meta"].get("state_repeat_count", 0)),
            conversation_closed=False,
            requires_today_record=not bool(state["today_record"].get("exists")),
            today_record_route="/checkin" if not bool(state["today_record"].get("exists")) else None,
        )

    def _close_turn(
        self,
        *,
        state: dict[str, Any],
        stage: str,
        message: str,
        reason: str,
    ) -> CbtStateMachineTurn:
        del stage
        state["current_stage"] = "summary"
        state["meta"]["subphase_key"] = "summary"
        state["meta"]["conversation_closed"] = True
        state["summary_text"] = self._build_summary_text(state, force_short=True)
        assistant_messages = self._prepare_assistant_messages(
            state,
            [
                message,
                "필요할 때 다시 시작해도 괜찮아요.",
            ],
        )
        return CbtStateMachineTurn(
            state=state,
            assistant_messages=assistant_messages,
            quick_replies=self._quick_set("summary", "summary"),
            action_links=[],
            current_stage="summary",
            phase_key="summary",
            subphase_key="summary",
            phase_index=PHASE_INDEX["summary"],
            planner_action=self._infer_planner_action(state),
            risk_level=self._risk_level(state.get("risk_flags", {})),
            safety_first=False,
            safety_message=None,
            fallback_reason=reason,
            state_repeat_count=int(state["meta"].get("state_repeat_count", 0)),
            conversation_closed=True,
            requires_today_record=not bool(state["today_record"].get("exists")),
            today_record_route="/checkin" if not bool(state["today_record"].get("exists")) else None,
        )

    def _current_stage_prompt(self, *, stage: str, subphase: str, state: dict[str, Any]) -> str:
        if stage == "situation":
            return "지금 가장 마음을 힘들게 하는 상황을 한 줄로 말해줄래요?"
        if stage == "emotion" and subphase == "label":
            return "그 상황에서 가장 크게 올라온 감정을 골라주세요."
        if stage == "emotion" and subphase == "intensity":
            label = self._emotion_degree_label(str(state.get("emotion_label") or "감정"))
            return f"{label}의 정도(0~100)를 알려주세요."
        if stage == "thought" and subphase == "auto_thought":
            return "그때 머릿속에 순간적으로 스친 생각을 한 문장으로 적어볼까요?"
        if stage == "thought" and subphase == "core_probe":
            probe_count = int(state["meta"].get("thought_probe_count", 0) or 0)
            return THOUGHT_PROBE_QUESTIONS[min(probe_count, len(THOUGHT_PROBE_QUESTIONS) - 1)]
        if stage == "thought" and subphase == "core_blocked":
            return "핵심 생각이 아직 흐릿해요. 같은 질문을 다시 보거나 주제를 다시 고를 수 있어요."
        if stage == "evidence" and subphase == "evidence_for":
            return "먼저, 이 생각이 맞아 보이는 이유를 1개 적어볼까요?"
        if stage == "evidence" and subphase == "evidence_against":
            return "이번에는 그 생각이 꼭 그렇지 않을 수 있는 이유를 적어볼까요?"
        if stage == "alternative_plan" and subphase == "alternative":
            return "양쪽 이유를 함께 보고, 조금 더 균형 잡힌 생각을 한 문장으로 적어볼까요?"
        if stage == "alternative_plan" and subphase == "commitment":
            return "좋아요. 오늘 바로 실천할 약속을 행동으로 정할지, 생각 연습으로 정할지 골라볼까요?"
        if stage == "alternative_plan" and subphase == "commitment_action":
            return "부담이 낮은 행동 약속을 한 줄로 정리해볼까요?"
        if stage == "alternative_plan" and subphase == "commitment_thought":
            return "생각 연습 약속을 한 줄로 정리해볼까요?"
        return "세션을 저장하면 요약과 TO DO가 기록됩니다."

    def _extract(
        self,
        stage: str,
        user_text: str,
        state: dict[str, Any],
    ) -> tuple[dict[str, Any], LimitedLlmMeta]:
        extracted, meta = self._llm.extract_fields(stage=stage, user_text=user_text, current_state=state)
        return extracted if isinstance(extracted, dict) else {}, meta

    def _compose(
        self,
        *,
        stage: str,
        user_text: str,
        state: dict[str, Any],
        next_question: str,
        fallback_empathy: str,
    ) -> tuple[dict[str, Any], LimitedLlmMeta]:
        composed, meta = self._llm.compose_response(
            stage=stage,
            user_text=user_text,
            current_state=state,
            next_question=next_question,
            fallback_empathy=fallback_empathy,
        )
        return composed if isinstance(composed, dict) else {}, meta

    def _assess_risk(
        self,
        user_text: str,
        state: dict[str, Any],
    ) -> tuple[dict[str, Any], LimitedLlmMeta]:
        flags = {
            "functional_impairment_flag": bool(state["risk_flags"].get("functional_impairment_flag", False)),
            "self_harm_flag": bool(state["risk_flags"].get("self_harm_flag", False)),
            "suicide_risk_level": int(state["risk_flags"].get("suicide_risk_level", 0) or 0),
            "violence_risk_flag": bool(state["risk_flags"].get("violence_risk_flag", False)),
        }
        lowered = user_text.lower()
        if any(token in lowered for token in ("죽고", "자해", "해치", "사라지고 싶", "끝내고 싶")):
            flags["self_harm_flag"] = True
            flags["suicide_risk_level"] = max(int(flags["suicide_risk_level"]), 3)
        if any(token in lowered for token in ("일상", "출근 못", "수업 못", "기능이 안", "아무것도 못")):
            flags["functional_impairment_flag"] = True
        llm_flags, meta = self._llm.classify_risk(user_text=user_text, current_state=state)
        if isinstance(llm_flags, dict):
            flags["functional_impairment_flag"] = bool(
                llm_flags.get("functional_impairment_flag", flags["functional_impairment_flag"])
            )
            flags["self_harm_flag"] = bool(llm_flags.get("self_harm_flag", flags["self_harm_flag"]))
            flags["violence_risk_flag"] = bool(llm_flags.get("violence_risk_flag", flags["violence_risk_flag"]))
            try:
                llm_level = int(llm_flags.get("suicide_risk_level", flags["suicide_risk_level"]) or 0)
            except (TypeError, ValueError):
                llm_level = int(flags["suicide_risk_level"])
            flags["suicide_risk_level"] = max(int(flags["suicide_risk_level"]), max(0, min(3, llm_level)))
        return flags, meta

    @staticmethod
    def _risk_level(risk_flags: dict[str, Any]) -> int:
        level = int(risk_flags.get("suicide_risk_level", 0) or 0)
        if bool(risk_flags.get("self_harm_flag", False)):
            level = max(level, 2)
        if bool(risk_flags.get("violence_risk_flag", False)):
            level = max(level, 2)
        if bool(risk_flags.get("functional_impairment_flag", False)):
            level = max(level, 1)
        return max(0, min(3, level))

    def _safety_turn(
        self,
        *,
        state: dict[str, Any],
        stage: str,
        subphase: str,
        risk_level: int,
        risk_meta: LimitedLlmMeta,
    ) -> CbtStateMachineTurn:
        del subphase
        state["current_stage"] = "summary"
        state["meta"]["subphase_key"] = "summary"
        state["meta"]["conversation_closed"] = True
        state["meta"]["state_repeat_count"] = 0
        state["meta"]["stage_repeat_count"] = 0
        safety_message = (
            "지금은 일반 대화보다 안전을 먼저 확인하는 게 좋겠어요.\n"
            "혼자 버티지 말고 가까운 사람에게 바로 알려주세요.\n"
            "가능하면 지역 응급실이나 상담기관에 지금 연결해보는 것을 권해요."
        )
        self._append_turn_diagnostics(
            state,
            stage=stage,
            llm_meta=[risk_meta],
            fallback_reason=risk_meta.fallback_reason,
            user_input="__safety_trigger__",
        )
        assistant_messages = self._prepare_assistant_messages(
            state,
            [
                "지금 많이 버거운 상태일 수 있어요. 먼저 안전을 확인할게요.",
                safety_message,
            ],
        )
        return CbtStateMachineTurn(
            state=state,
            assistant_messages=assistant_messages,
            quick_replies=self._quick_set("summary", "summary"),
            action_links=[
                {"label": "내 문의로 이동", "route": "/mypage/support-tickets"},
                {"label": "챌린지 보기", "route": "/challenge"},
            ],
            current_stage="summary",
            phase_key="summary",
            subphase_key="summary",
            phase_index=PHASE_INDEX["summary"],
            planner_action="support_contact",
            risk_level=risk_level,
            safety_first=True,
            safety_message=safety_message,
            fallback_reason=risk_meta.fallback_reason,
            state_repeat_count=0,
            conversation_closed=True,
            requires_today_record=not bool(state["today_record"].get("exists")),
            today_record_route="/checkin" if not bool(state["today_record"].get("exists")) else None,
        )

    def _handle_situation(
        self,
        state: dict[str, Any],
        user_text: str,
        extracted: dict[str, Any],
        *,
        action_id: str,
    ) -> tuple[str, str, str, list[dict[str, str]], list[dict[str, str]]] | None:
        if action_id == ACTION_SKIP_STAGE or any(token in user_text.lower() for token in SKIP_KEYWORDS):
            return (
                "situation",
                "topic",
                "지금은 주제를 먼저 잡아야 다음 단계로 자연스럽게 이어갈 수 있어요.\n다른 표현으로 한 줄만 적어볼까요?",
                self._quick_set("fallback", "hard_required"),
                [],
            )
        candidate = str(extracted.get("situation_text") or user_text).strip()
        candidate = self._strip_prefill_seed(candidate, allow_prefix_only=False)
        if len(candidate) < 2:
            return None
        state["situation_text"] = candidate[:400]
        state["situation"] = state["situation_text"]
        state["meta"]["emotion_substep"] = "label"
        state["meta"]["subphase_key"] = "label"
        next_question = "그 상황에서 가장 크게 올라온 감정을 알려주세요."
        return (
            "emotion",
            "label",
            next_question,
            self._quick_set("emotion", "label"),
            [],
        )

    def _handle_emotion(
        self,
        state: dict[str, Any],
        user_text: str,
        extracted: dict[str, Any],
        *,
        action_id: str,
    ) -> tuple[str, str, str, list[dict[str, str]], list[dict[str, str]]] | None:
        lowered = user_text.lower()
        is_skip = action_id == ACTION_SKIP_STAGE or any(token in lowered for token in SKIP_KEYWORDS)
        substep = str(state["meta"].get("emotion_substep") or "label")
        label = str(extracted.get("emotion_label") or "").strip()
        intensity = extracted.get("emotion_intensity_0_100")

        if substep == "label":
            if is_skip:
                state["emotion_label"] = ""
                state["emotion_intensity_0_100"] = None
                state["emotions"] = []
                state["meta"]["emotion_substep"] = "label"
                state["meta"]["thought_substep"] = "auto_thought"
                return (
                    "thought",
                    "auto_thought",
                    "괜찮아요. 그때 머릿속에 순간적으로 스친 생각을 한 문장으로 적어볼까요?",
                    self._quick_set("thought", "auto_thought"),
                    [],
                )

            normalized_text = self._strip_prefill_seed(user_text, allow_prefix_only=True)
            split = normalized_text.replace(",", " ").split()
            if not label and split:
                label = split[0].strip()
            for token in split:
                if token.isdigit():
                    intensity = int(token)
                    break
            if not self._looks_valid_label(label):
                return None

            state["emotion_label"] = label[:40]
            state["meta"]["emotion_substep"] = "intensity"
            if intensity is not None:
                try:
                    parsed = int(intensity)
                except (TypeError, ValueError):
                    parsed = -1
                if 0 <= parsed <= 100:
                    state["emotion_intensity_0_100"] = parsed
                    state["emotions"] = [{"name": state["emotion_label"], "intensity": parsed}]
                    state["meta"]["emotion_substep"] = "label"
                    state["meta"]["thought_substep"] = "auto_thought"
                    return (
                        "thought",
                        "auto_thought",
                        "좋아요. 그때 머릿속에 순간적으로 스친 생각을 한 문장으로 적어볼까요?",
                        self._quick_set("thought", "auto_thought"),
                        [],
                    )
            intensity_prompt = f"{self._emotion_degree_label(state['emotion_label'])}의 정도(0~100)를 알려주세요."
            return (
                "emotion",
                "intensity",
                intensity_prompt,
                self._quick_set("emotion", "intensity"),
                [],
            )

        if is_skip:
            state["emotion_intensity_0_100"] = None
            state["emotions"] = []
            state["meta"]["emotion_substep"] = "label"
            state["meta"]["thought_substep"] = "auto_thought"
            return (
                "thought",
                "auto_thought",
                "좋아요. 강도는 건너뛰고, 그때 순간적으로 스친 생각을 한 문장으로 적어볼까요?",
                self._quick_set("thought", "auto_thought"),
                [],
            )

        try:
            score = int(intensity if intensity is not None else self._strip_prefill_seed(user_text).strip())
        except (TypeError, ValueError):
            score = -1
        if score < 0 or score > 100:
            return None
        state["emotion_intensity_0_100"] = score
        state["emotions"] = [{"name": state["emotion_label"] or "감정", "intensity": score}]
        state["meta"]["emotion_substep"] = "label"
        state["meta"]["thought_substep"] = "auto_thought"
        return (
            "thought",
            "auto_thought",
            "좋아요. 그때 머릿속에 순간적으로 스친 생각을 한 문장으로 적어볼까요?",
            self._quick_set("thought", "auto_thought"),
            [],
        )

    def _handle_thought(
        self,
        state: dict[str, Any],
        user_text: str,
        extracted: dict[str, Any],
        *,
        action_id: str,
    ) -> tuple[str, str, str, list[dict[str, str]], list[dict[str, str]]] | None:
        lowered = user_text.lower()
        is_skip = action_id == ACTION_SKIP_STAGE or any(token in lowered for token in SKIP_KEYWORDS)
        thought_substep = str(state["meta"].get("thought_substep") or "auto_thought")
        thought = str(state.get("auto_thought_text") or "").strip()

        if thought_substep == "auto_thought":
            if is_skip:
                state["meta"]["thought_substep"] = "core_probe"
                state["meta"]["thought_probe_count"] = 0
                return (
                    "thought",
                    "core_probe",
                    THOUGHT_PROBE_QUESTIONS[0],
                    self._quick_set("thought", "core_probe"),
                    [],
                )

            if not thought:
                thought = str(extracted.get("auto_thought_text") or user_text).strip()
                thought = self._strip_prefill_seed(thought, allow_prefix_only=True)
                if len(thought) < 2:
                    return None
                state["auto_thought_text"] = thought[:300]
                state["automatic_thoughts"] = [state["auto_thought_text"]]
                state["meta"]["thought_probe_count"] = 0
                state["core_message_text"] = ""

            has_core = bool(str(state.get("core_message_text") or "").strip())
            if not has_core and self._looks_core_message(thought):
                state["core_message_text"] = thought[:220]
                has_core = True

            if has_core:
                state["meta"]["evidence_substep"] = "for"
                core = str(state.get("core_message_text") or "").strip()
                state["meta"]["thought_substep"] = "auto_thought"
                core_bridge = (
                    f"정리하면 지금 마음을 건드린 핵심 생각은 ‘{core}’에 가까워요.\n"
                    "이 생각이 맞아 보이는 이유부터 살펴볼게요.\n"
                    "먼저, 맞아 보이는 이유를 1개 적어볼까요?"
                )
                return (
                    "evidence",
                    "evidence_for",
                    core_bridge,
                    self._quick_set("evidence", "evidence_for"),
                    [],
                )

            state["meta"]["thought_substep"] = "core_probe"
            state["meta"]["thought_probe_count"] = 0
            return (
                "thought",
                "core_probe",
                THOUGHT_PROBE_QUESTIONS[0],
                self._quick_set("thought", "core_probe"),
                [],
            )

        if thought_substep == "core_blocked":
            return (
                "thought",
                "core_blocked",
                "핵심 생각이 아직 또렷하지 않아요.\n같은 단계를 한 번 더 시도해보거나 주제를 다시 잡아도 괜찮아요.",
                self._quick_set("thought", "core_blocked"),
                [],
            )

        probe_count = int(state["meta"].get("thought_probe_count", 0) or 0)
        if is_skip:
            state["meta"]["thought_substep"] = "core_blocked"
            return (
                "thought",
                "core_blocked",
                "지금은 핵심 생각을 바로 잡기 어려울 수 있어요.\n"
                "같은 단계를 다시 시도하거나 주제를 다시 골라도 괜찮아요.",
                self._quick_set("thought", "core_blocked"),
                [],
            )

        candidate = str(extracted.get("core_belief_hint") or user_text).strip()
        candidate = self._strip_prefill_seed(candidate, allow_prefix_only=True)
        if candidate and candidate not in {"기타", "기타:"}:
            state["core_message_text"] = candidate[:220]

        if str(state.get("core_message_text") or "").strip():
            state["meta"]["evidence_substep"] = "for"
            core = str(state.get("core_message_text") or "").strip()
            state["meta"]["thought_substep"] = "auto_thought"
            core_bridge = (
                f"정리하면 지금 마음을 건드린 핵심 생각은 ‘{core}’에 가까워요.\n"
                "이 생각이 맞아 보이는 이유부터 살펴볼게요.\n"
                "먼저, 맞아 보이는 이유를 1개 적어볼까요?"
            )
            return (
                "evidence",
                "evidence_for",
                core_bridge,
                self._quick_set("evidence", "evidence_for"),
                [],
            )

        if probe_count + 1 < THOUGHT_PROBE_MAX:
            state["meta"]["thought_probe_count"] = probe_count + 1
            return (
                "thought",
                "core_probe",
                THOUGHT_PROBE_QUESTIONS[min(probe_count + 1, len(THOUGHT_PROBE_QUESTIONS) - 1)],
                self._quick_set("thought", "core_probe"),
                [],
            )

        state["meta"]["thought_probe_count"] = THOUGHT_PROBE_MAX
        return (
            "thought",
            "core_blocked",
            "핵심 생각이 아직 흐릿해요. 한 번 더 시도하거나 주제를 다시 잡아볼까요?",
            self._quick_set("thought", "core_blocked"),
            [],
        )

    def _handle_evidence(
        self,
        state: dict[str, Any],
        user_text: str,
        extracted: dict[str, Any],
        *,
        action_id: str,
    ) -> tuple[str, str, str, list[dict[str, str]], list[dict[str, str]]] | None:
        substep = str(state["meta"].get("evidence_substep") or "for")
        is_skip = action_id == ACTION_SKIP_STAGE or any(token in user_text.lower() for token in SKIP_KEYWORDS)
        is_next = action_id == ACTION_NEXT_STAGE
        item = str(extracted.get("evidence_item") or user_text).strip()
        item = self._strip_prefill_seed(item, allow_prefix_only=True)
        if not is_skip and not is_next and len(item) < 2:
            return None

        if substep == "for":
            if not is_skip and item not in state["evidence_for"] and len(state["evidence_for"]) < EVIDENCE_TARGET_MAX:
                state["evidence_for"].append(item[:260])
            if len(state["evidence_for"]) < EVIDENCE_TARGET_DEFAULT and not is_skip and not is_next:
                next_question = "좋아요. 한 가지만 더 적어볼까요? 이 생각이 맞다고 느껴진 이유를 한 줄로 써주세요."
                return (
                    "evidence",
                    "evidence_for",
                    next_question,
                    self._quick_set("evidence", "evidence_for"),
                    [],
                )
            state["meta"]["evidence_substep"] = "against"
            next_question = "이번에는 같은 생각이 꼭 맞지는 않을 수 있는 이유를 1~2개 적어볼까요?"
            return (
                "evidence",
                "evidence_against",
                next_question,
                self._quick_set("evidence", "evidence_against"),
                [],
            )

        if (
            not is_skip
            and not is_next
            and item not in state["evidence_against"]
            and len(state["evidence_against"]) < EVIDENCE_TARGET_MAX
        ):
            state["evidence_against"].append(item[:260])
        if len(state["evidence_against"]) < EVIDENCE_TARGET_DEFAULT and not is_skip and not is_next:
            next_question = "좋아요. 한 가지만 더 적어볼까요? 다르게 볼 수 있는 이유를 한 줄로 써주세요."
            return (
                "evidence",
                "evidence_against",
                next_question,
                self._quick_set("evidence", "evidence_against"),
                [],
            )
        if len(state["evidence_for"]) == 0 and len(state["evidence_against"]) == 0:
            next_question = "정보가 아직 적어서, 지금 할 수 있는 범위에서 너무 단정하지 않는 한 문장을 만들어볼까요?"
        else:
            next_question = "양쪽 이유를 같이 보면, 지금 상황을 더 균형 있게 보는 한 문장을 만들어볼까요?"
        state["meta"]["alternative_substep"] = "alternative"
        return (
            "alternative_plan",
            "alternative",
            next_question,
            self._alternative_quick_set(state),
            [],
        )

    def _handle_alternative_plan(
        self,
        state: dict[str, Any],
        user_text: str,
        extracted: dict[str, Any],
        *,
        action_id: str,
    ) -> tuple[str, str, str, list[dict[str, str]], list[dict[str, str]]] | None:
        is_skip = action_id == ACTION_SKIP_STAGE or any(token in user_text.lower() for token in SKIP_KEYWORDS)
        alternative_substep = str(state["meta"].get("alternative_substep") or "alternative")
        has_alt = str(state.get("alternative_thought") or "").strip()
        if alternative_substep == "alternative":
            alt = str(extracted.get("alternative_thought") or user_text).strip()
            alt = self._strip_prefill_seed(alt, allow_prefix_only=False)
            if not alt and not is_skip and not has_alt:
                return None
            if alt:
                state["alternative_thought"] = alt[:320]
                state["balanced_statement"] = state["alternative_thought"]
            state["meta"]["alternative_substep"] = "commitment"
            next_question = "좋아요. 오늘 실천할 약속을 행동으로 정할지, 생각 연습으로 정할지 골라볼까요?"
            return (
                "alternative_plan",
                "commitment",
                next_question,
                self._quick_set("alternative_plan", "commitment"),
                [],
            )

        if alternative_substep == "commitment":
            if action_id == ACTION_CHOOSE_ACTION_COMMITMENT:
                state["meta"]["alternative_substep"] = "commitment_action"
                return (
                    "alternative_plan",
                    "commitment_action",
                    "좋아요. 오늘 바로 해볼 수 있는 행동 약속을 한 줄로 적어볼까요?",
                    self._quick_set("alternative_plan", "commitment_action"),
                    [],
                )
            if action_id == ACTION_CHOOSE_THOUGHT_PRACTICE:
                state["meta"]["alternative_substep"] = "commitment_thought"
                return (
                    "alternative_plan",
                    "commitment_thought",
                    "좋아요. 오늘 해볼 생각 연습 약속을 한 줄로 적어볼까요?",
                    self._quick_set("alternative_plan", "commitment_thought"),
                    [],
                )
            if action_id == ACTION_FINISH_WITHOUT_TODO or is_skip:
                state["commitment_type"] = None
                state["commitment_text"] = ""
                state["todo_id"] = None
                return (
                    "summary",
                    "summary",
                    "좋아요. 이번에는 TO DO 없이 정리해볼게요. 세션을 저장하면 요약이 기록됩니다.",
                    self._quick_set("summary", "summary"),
                    [],
                )

        if alternative_substep in {"commitment_action", "commitment_thought", "commitment"}:
            commitment = str(extracted.get("commitment_text") or user_text).strip()
            commitment = self._strip_prefill_seed(commitment, allow_prefix_only=True)
            if not commitment and not is_skip:
                return None
            if "정하지 않" in commitment or is_skip:
                state["commitment_type"] = None
                state["commitment_text"] = ""
                state["todo_id"] = None
            else:
                ctype = "behavior" if alternative_substep != "commitment_thought" else "thought_practice"
                if alternative_substep == "commitment":
                    extracted_type = str(extracted.get("commitment_type") or "").strip().lower()
                    if extracted_type in {"behavior", "thought_practice"}:
                        ctype = extracted_type
                state["commitment_type"] = ctype
                state["commitment_text"] = commitment[:260]
                state["behaviors"] = [state["commitment_text"]]
                state["todo_id"] = "todo_pending"

            links: list[dict[str, str]] = []
            if state.get("commitment_text") and self._looks_challenge_commitment(str(state["commitment_text"])):
                links.append({"label": "오늘의 추천 챌린지 보기", "route": "/challenge"})
            next_question = "정리했어요. 세션을 저장하면 요약과 TO DO가 기록됩니다."
            return (
                "summary",
                "summary",
                next_question,
                self._quick_set("summary", "summary"),
                links,
            )
        return None

    def _handle_summary(
        self,
        state: dict[str, Any],
        user_text: str,
        extracted: dict[str, Any],
        *,
        action_id: str,
    ) -> tuple[str, str, str, list[dict[str, str]], list[dict[str, str]]] | None:
        del extracted
        if action_id == ACTION_RESET_TOPIC or any(token in user_text.lower() for token in RESET_KEYWORDS):
            self._reset_topic(state)
            return (
                "situation",
                "topic",
                "좋아요. 새로운 주제로 다시 시작해볼까요? 지금 가장 마음을 힘들게 하는 상황을 한 줄로 말해줄래요?",
                self._quick_set("situation", "topic"),
                [],
            )
        if action_id == ACTION_END_SESSION:
            return (
                "summary",
                "summary",
                "여기서 마무리할게요. 필요할 때 다시 시작해도 괜찮아요.",
                self._quick_set("summary", "summary"),
                [],
            )
        return (
            "summary",
            "summary",
            "세션 저장 버튼을 누르면 요약과 TO DO가 저장됩니다.",
            self._quick_set("summary", "summary"),
            [],
        )

    def _invalid_input_response(
        self,
        *,
        state: dict[str, Any],
        stage: str,
        subphase: str,
        fallback_reason: str,
        user_input: str,
        extra_meta: list[LimitedLlmMeta] | None = None,
    ) -> CbtStateMachineTurn:
        count = int(state["meta"].get("stage_repeat_count", 0)) + 1
        state["meta"]["stage_repeat_count"] = count
        state["meta"]["state_repeat_count"] = count

        if count >= 3:
            state["meta"]["conversation_closed"] = True
            state["current_stage"] = "summary"
            state["summary_text"] = self._build_summary_text(state, force_short=True)
            assistant_messages = [
                "여기서는 흐름이 자주 끊겨서 잠깐 정리하고 마무리하는 편이 좋아 보여요.",
                "필요하면 주제를 다시 고른 뒤 새로 시작할 수 있어요.",
            ]
            quick = self._quick_set("fallback", "hard_required")
            stage_out = "summary"
            subphase_out = "summary"
            closed = True
        else:
            state["current_stage"] = stage
            assistant_messages = [
                "지금은 딱 맞는 답이 바로 안 떠오를 수도 있어요.",
                "같은 질문으로 다시 해보거나, 주제를 다시 잡아도 괜찮아요.",
            ]
            if stage == "situation":
                quick = self._quick_set("fallback", "hard_required")
            else:
                quick = self._quick_set("fallback", "general")
            stage_out = stage
            subphase_out = subphase
            closed = False

        metas = list(extra_meta or [])
        self._append_turn_diagnostics(
            state,
            stage=stage,
            llm_meta=metas,
            fallback_reason=fallback_reason,
            user_input=user_input,
        )
        assistant_messages = self._prepare_assistant_messages(state, assistant_messages)
        return CbtStateMachineTurn(
            state=state,
            assistant_messages=assistant_messages,
            quick_replies=quick,
            action_links=[],
            current_stage=stage_out,
            phase_key=stage_out,
            subphase_key=subphase_out,
            phase_index=PHASE_INDEX.get(stage_out, 0),
            planner_action=self._infer_planner_action(state),
            risk_level=self._risk_level(state.get("risk_flags", {})),
            safety_first=False,
            safety_message=None,
            fallback_reason=fallback_reason,
            state_repeat_count=int(state["meta"].get("state_repeat_count", 0)),
            conversation_closed=closed,
            requires_today_record=not bool(state["today_record"].get("exists")),
            today_record_route="/checkin" if not bool(state["today_record"].get("exists")) else None,
        )

    @staticmethod
    def _fallback_empathy(stage: str, text: str) -> str:
        prefix = {
            "situation": "말해줘서 고마워요.",
            "emotion": "그 상황이 많이 힘들었겠어요.",
            "thought": "그 생각이 반복되면 마음이 지치기 쉬워요.",
            "evidence": "여기까지 차근히 정리해온 점이 좋아요.",
            "alternative_plan": "좋아요. 이제 현실적인 방향을 함께 잡아볼게요.",
            "summary": "정리를 끝까지 이어온 점이 인상적이에요.",
        }[stage]
        if len(text) > 0 and stage in {"situation", "thought"}:
            return f"{prefix} 지금 이야기해준 내용을 바탕으로 이어가볼게요."
        return prefix

    @staticmethod
    def _merge_fallback_reasons(*metas: LimitedLlmMeta) -> str | None:
        reasons = [meta.fallback_reason for meta in metas if meta and meta.fallback_reason]
        if not reasons:
            return None
        return ",".join(dict.fromkeys(reasons))

    def _append_turn_diagnostics(
        self,
        state: dict[str, Any],
        *,
        stage: str,
        llm_meta: list[LimitedLlmMeta],
        fallback_reason: str | None,
        user_input: str,
    ) -> None:
        used = any(meta.llm_used for meta in llm_meta)
        model = next((meta.model for meta in llm_meta if meta.model), None)
        latency_sum = sum(int(meta.latency_ms or 0) for meta in llm_meta) or None
        logs = state.get("turn_diagnostics")
        if not isinstance(logs, list):
            logs = []
            state["turn_diagnostics"] = logs
        logs.append(
            {
                "stage": stage,
                "state_key": stage,
                "phase_key": stage,
                "subphase_key": self._normalize_subphase(stage, str(state["meta"].get("subphase_key") or "")),
                "llm_used": used,
                "llm_model": model,
                "llm_latency_ms": latency_sum,
                "fallback_reason": fallback_reason,
                "state_repeat_count": int(state["meta"].get("state_repeat_count", 0)),
                "user_input": user_input[:300],
            }
        )
        state["turn_diagnostics"] = logs[-80:]

    @staticmethod
    def _today_record_short(record: dict[str, Any]) -> str:
        mood = record.get("mood_label") or "기분"
        intensity = record.get("mood_intensity_0_100")
        if intensity is None:
            return "오늘 기록을 참고해 현재 상황을 같이 다뤄볼게요."
        return f"오늘 기록 기준으로는 {mood} 느낌이 {intensity}/100 정도로 남아있어요."

    def _alternative_quick_set(self, state: dict[str, Any]) -> list[dict[str, str]]:
        candidates = self._build_alternative_candidates(state)
        items = [
            self._prefill_item("후보 1", candidates[0], append_colon=False),
            self._prefill_item("후보 2", candidates[1], append_colon=False),
            self._prefill_item("후보 3", candidates[2], append_colon=False),
            self._prefill_item("직접 다듬기", "새 생각: ", append_colon=False),
            self._action_item("건너뛰기", ACTION_SKIP_STAGE),
            self._action_item("주제 다시", ACTION_RESET_TOPIC),
            self._action_item("종료", ACTION_END_SESSION),
        ]
        return items

    @staticmethod
    def _build_alternative_candidates(state: dict[str, Any]) -> list[str]:
        core = str(state.get("core_message_text") or "").strip()
        for_list = state.get("evidence_for")
        against_list = state.get("evidence_against")
        for_first = for_list[0] if isinstance(for_list, list) and for_list else ""
        against_first = against_list[0] if isinstance(against_list, list) and against_list else ""

        if core and against_first:
            c1 = f"{core}라는 생각이 들지만, {against_first}는 점도 함께 볼 수 있어요."
        elif core:
            c1 = f"{core}라는 생각이 있지만, 한 번에 단정하지 않고 더 살펴볼 수 있어요."
        elif against_first:
            c1 = f"{against_first}는 사실도 있으니, 지금 생각을 한 가지로 단정하지 않을 수 있어요."
        else:
            c1 = "지금 떠오른 생각을 사실로 단정하지 않고, 다른 가능성도 함께 보겠어요."

        if for_first and against_first:
            c2 = f"{for_first}라는 이유가 있어도, {against_first}라는 근거도 있으니 균형 있게 보겠어요."
        elif against_first:
            c2 = f"{against_first}라는 근거를 떠올리며 조금 더 유연하게 해석해볼 수 있어요."
        else:
            c2 = "한 번의 장면만으로 결론 내리지 않고, 확인할 수 있는 근거를 더 찾아보겠어요."

        c3 = "지금 할 수 있는 작은 행동부터 해보며, 결과를 보고 생각을 다시 조정해보겠어요."
        return [c1[:220], c2[:220], c3[:220]]

    @staticmethod
    def _looks_challenge_commitment(commitment_text: str) -> bool:
        lowered = commitment_text.lower()
        keywords = ("산책", "호흡", "수면", "감각", "운동", "햇빛", "루틴", "패턴")
        return any(token in lowered for token in keywords)

    @staticmethod
    def _build_summary_text(state: dict[str, Any], force_short: bool = False) -> str:
        if force_short:
            return "오늘 대화를 여기서 마무리했어요. 다음에 다시 이어가도 괜찮아요."
        situation = str(state.get("situation_text") or "").strip() or "오늘 상황"
        emotion = str(state.get("emotion_label") or "").strip()
        emotion_score = state.get("emotion_intensity_0_100")
        thought = str(state.get("auto_thought_text") or "").strip()
        core_message = str(state.get("core_message_text") or "").strip()
        alternative = str(state.get("alternative_thought") or "").strip()
        commitment = str(state.get("commitment_text") or "").strip()
        parts: list[str] = [f"상황: {situation}"]
        if emotion:
            if emotion_score is not None:
                parts.append(f"감정: {emotion} ({emotion_score}/100)")
            else:
                parts.append(f"감정: {emotion}")
        if thought:
            parts.append(f"순간 생각: {thought}")
        if core_message:
            parts.append(f"핵심 메시지: {core_message}")
        if alternative:
            parts.append(f"균형 생각: {alternative}")
        if commitment:
            parts.append(f"약속: {commitment}")
        return " | ".join(parts)

    @staticmethod
    def _infer_planner_action(state: dict[str, Any]) -> str:
        commitment = str(state.get("commitment_text") or "").strip()
        if not commitment:
            return "review_evidence"
        if "생각" in commitment or "문장" in commitment:
            return "review_evidence"
        return "behavior_experiment"
