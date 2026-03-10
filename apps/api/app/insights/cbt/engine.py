from __future__ import annotations

import json
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
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
ACTION_CONFIRM_CORE_YES = "confirm_core_yes"
ACTION_CONFIRM_CORE_NO = "confirm_core_no"
ACTION_CONFIRM_CORE_NOT_SURE = "confirm_core_not_sure"
THOUGHT_PROBE_QUESTIONS: tuple[str, ...] = (
    "그때 마음속에서 가장 크게 남는 한 문장을 적어볼까요?",
    "좋아요. 그 문장을 더 짧게 줄이면 어떤 말이 남나요?",
)
EMOTION_SYNONYM_GROUPS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("불안", ("불안", "초조", "조마조마", "긴장", "걱정", "부담", "압박")),
    ("부담", ("버겁", "벅차", "힘들", "고되", "지치", "진빠지", "기빨리", "답답", "막막", "괴롭", "착잡")),
    ("무기력함", ("무기력", "기운이없", "기력이없", "의욕이없", "축처", "처지", "지침")),
    ("피곤함", ("피곤", "지쳤", "졸리", "잠이와", "녹초", "기진맥진")),
    ("슬픔", ("슬프", "우울", "허무", "울적")),
    ("짜증", ("짜증", "화나", "열받", "예민")),
    ("수치심", ("창피", "부끄", "수치")),
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
        self._thinking_patterns = self._load_thinking_patterns()
        self._llm = CbtLimitedLlm()

    @staticmethod
    def _load_flow() -> dict[str, Any]:
        path = Path(__file__).resolve().parent / "flows" / "default_v2.json"
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    @staticmethod
    def _load_thinking_patterns() -> list[dict[str, Any]]:
        path = Path(__file__).resolve().parent / "thinking_patterns_ko.json"
        try:
            with path.open("r", encoding="utf-8") as handle:
                raw = json.load(handle)
        except (FileNotFoundError, json.JSONDecodeError):
            return []
        if not isinstance(raw, list):
            return []
        patterns: list[dict[str, Any]] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            pattern = {
                "id": str(item.get("id") or "").strip(),
                "title_ko": str(item.get("title_ko") or "").strip(),
                "short_desc_ko": str(item.get("short_desc_ko") or "").strip(),
                "probe_templates_ko": [
                    str(template).strip()
                    for template in list(item.get("probe_templates_ko") or [])
                    if str(template).strip()
                ],
                "reframe_guidance_ko": [
                    str(template).strip()
                    for template in list(item.get("reframe_guidance_ko") or [])
                    if str(template).strip()
                ],
                "commitment_suggestions_ko": [
                    str(template).strip()
                    for template in list(item.get("commitment_suggestions_ko") or [])
                    if str(template).strip()
                ],
            }
            if pattern["id"] and pattern["title_ko"]:
                patterns.append(pattern)
        return patterns

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
            ("thought", "core_confirm"): [
                self._action_item("맞아요", ACTION_CONFIRM_CORE_YES),
                self._action_item("조금 달라요", ACTION_CONFIRM_CORE_NO),
                self._action_item("잘 모르겠어요", ACTION_CONFIRM_CORE_NOT_SURE),
                self._action_item("주제 다시", ACTION_RESET_TOPIC),
                self._action_item("종료", ACTION_END_SESSION),
            ],
            ("thought", "core_refine"): [
                self._action_item("다시 답하기", ACTION_RETRY_STAGE),
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
            if subphase == "core_confirm":
                return "core_confirm"
            if subphase == "core_refine":
                return "core_refine"
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
            "망할것같",
            "실패할것같",
            "또망할",
            "또실수",
            "무시당할것같",
            "무능해보일",
            "결국안돼",
            "난결국안돼",
            "안될것같",
            "실망시킬것같",
        )
        return any(marker in normalized for marker in markers)

    @staticmethod
    def _looks_valid_thought_sentence(text: str) -> bool:
        normalized = text.lower().replace(" ", "")
        if len(normalized) < 3:
            return False
        markers = (
            "것같",
            "같아",
            "두려",
            "걱정",
            "무섭",
            "망할",
            "실패",
            "무시당",
            "안될",
            "실망",
        )
        return any(marker in normalized for marker in markers)

    @staticmethod
    def _needs_evidence_scaffold(text: str) -> bool:
        normalized = text.lower().replace(" ", "")
        markers = ("모르겠", "없어", "안떠올라", "애매", "딱히", "잘안보여", "잘모르")
        return any(marker in normalized for marker in markers)

    @staticmethod
    def _looks_evidence_next_intent(text: str) -> bool:
        normalized = re.sub(r"[^0-9a-zA-Z가-힣ㄱ-ㅎㅏ-ㅣ]+", "", str(text or "").lower())
        return normalized in {"다음으로", "넘어가자", "다음", "ㅇㅇ", "응", "go"}

    @staticmethod
    def _is_low_quality_evidence(text: str) -> bool:
        raw = str(text or "").strip()
        if not raw:
            return True
        normalized = raw.lower().replace(" ", "")
        if normalized in {
            "확인되지않은부분",
            "확인되지않은부분:",
            "반대근거",
            "반대근거:",
            "관찰한사실",
            "관찰한사실:",
            "내경험",
            "내경험:",
            "다른가능성",
            "다른가능성:",
            "예외였던순간",
            "예외였던순간:",
        }:
            return True
        low_quality_markers = ("몰루", "모르겠", "없어요", "없음", "안떠올라", "반대임", "잘모르", "딱히")
        return any(marker in normalized for marker in low_quality_markers)

    @staticmethod
    def _resolve_core_confirm_action(text: str) -> str | None:
        normalized = re.sub(r"[^0-9a-zA-Z가-힣ㄱ-ㅎㅏ-ㅣ]+", "", text.lower())
        if not normalized:
            return None
        if normalized.startswith(("잘모르겠", "모르겠", "애매", "헷갈")):
            return ACTION_CONFIRM_CORE_NOT_SURE
        if normalized.startswith(("아니", "아뇨", "조금달라", "달라", "틀려", "정정", "수정")):
            return ACTION_CONFIRM_CORE_NO
        if any(
            normalized.startswith(marker)
            for marker in (
                "맞",
                "맞아",
                "맞습",
                "맞으",
                "그렇",
                "그래",
                "그런듯",
                "그런거같",
                "그런것같",
                "맞는듯",
                "맞는거같",
                "맞는것같",
                "응",
                "ㅇㅇ",
                "네",
                "예",
                "동의",
                "그렇게정리",
                "정리해도됩니다",
                "정리해도괜찮",
            )
        ):
            return ACTION_CONFIRM_CORE_YES
        return None

    @staticmethod
    def _detect_emotion_labels(text: str) -> list[str]:
        normalized = text.lower().replace(" ", "")
        hits: list[tuple[int, str]] = []
        for label, markers in EMOTION_SYNONYM_GROUPS:
            positions = [normalized.find(marker) for marker in markers if marker and normalized.find(marker) >= 0]
            if positions:
                hits.append((min(positions), label))
        hits.sort(key=lambda item: item[0])
        return [label for _, label in hits]

    @staticmethod
    def _normalize_freeform_emotion_label(text: str) -> str:
        raw = re.sub(r"\s+", " ", str(text or "")).strip()
        if len(raw) < 2:
            return ""
        compact = raw.lower().replace(" ", "")
        if (
            CbtThoughtRecordEngine._looks_no_emotion_response(compact)
            or CbtThoughtRecordEngine._looks_ambiguous_emotion_response(compact)
        ):
            return ""
        detected = CbtThoughtRecordEngine._detect_emotion_labels(compact)
        if detected:
            return detected[0]
        trimmed = re.sub(r"(이라고|라고|이라서|라서|하다고|다고|이에요|예요|해요|하다|한데|함|다)$", "", raw).strip()
        if len(trimmed) >= 2 and len(trimmed.split()) == 1:
            return trimmed[:40]
        return ""

    @staticmethod
    def _recent_emotion_label_inputs(state: dict[str, Any], *, limit: int = 3) -> list[str]:
        turn_log = state.get("turn_log")
        if not isinstance(turn_log, list):
            return []
        items: list[str] = []
        for entry in reversed(turn_log):
            if not isinstance(entry, dict):
                continue
            if entry.get("role") != "user":
                continue
            if entry.get("stage") != "emotion" or entry.get("subphase") != "label":
                continue
            text = str(entry.get("content") or "").strip()
            if not text:
                continue
            items.append(text)
            if len(items) >= limit:
                break
        return list(reversed(items))

    @staticmethod
    def _looks_no_emotion_response(text: str) -> bool:
        normalized = text.lower().replace(" ", "")
        markers = (
            "별감정없",
            "감정없",
            "무감정",
            "아무감정없",
            "잘안느껴",
            "모르겠",
            "딱히없",
            "그냥없",
            "걍",
        )
        return any(marker in normalized for marker in markers)

    @staticmethod
    def _looks_ambiguous_emotion_response(text: str) -> bool:
        normalized = text.lower().replace(" ", "")
        markers = (
            "복합적",
            "여러가지",
            "잘모르겠",
            "모르겠",
            "그냥안좋",
            "안좋",
            "애매",
            "오락가락",
        )
        return any(marker in normalized for marker in markers)

    @staticmethod
    def _intensity_retry_prompt(label: str, *, count: int) -> str:
        resolved = CbtThoughtRecordEngine._emotion_degree_label(label or "감정")
        prompts = (
            f"{resolved} 정도를 숫자로 말해볼까요?\n예: 30은 조금 불편함, 70은 꽤 힘듦, 90은 매우 버거움이에요.",
            f"정확하지 않아도 괜찮아요. 대충 숫자로만 적어주세요.\n예: {resolved} 40 / 60 / 80",
            f"감으로 골라도 괜찮아요. 30, 50, 70, 90 중 가장 가까운 숫자 하나만 보내주세요.",
        )
        return prompts[min(max(count, 0), len(prompts) - 1)]

    @staticmethod
    def _evidence_scaffold_prompt(*, mode: str, core: str, count: int) -> str:
        if mode == "for":
            prompts = (
                f"맞아 보이는 이유가 바로 안 떠오르면, 사실 하나만 적어도 괜찮아요.\n예: ‘{core}’라고 느낀 장면에서 상대 표정이 굳어 보였어요.",
                "생각 말고 확인된 사실만 골라볼까요?\n예: 답장이 늦었어요 / 말을 짧게 했어요 / 내가 중간에 멈췄어요",
                "한 줄이면 충분해요. 말, 표정, 사건, 내 몸 반응 중 하나만 적어주세요.",
            )
        else:
            prompts = (
                f"반대 근거가 안 떠오르면 예외 하나만 찾아볼까요?\n‘{core}’가 100% 확실하진 않은 이유가 있을까요?",
                "사실과 해석을 나눠볼까요?\n확인된 사실 말고 내가 추측한 부분이 있다면 그걸 적어주세요.",
                "다른 사람 시점으로 보면 어떤 말이 가능할까요?\n예: 한 번 실수했다고 늘 그런 건 아니에요 / 아직 확인된 건 없어요",
            )
        return prompts[min(max(count, 0), len(prompts) - 1)]

    def _soft_invalid_guidance(
        self,
        stage: str,
        subphase: str,
        *,
        count: int,
        state: dict[str, Any],
    ) -> tuple[list[str], list[dict[str, str]]]:
        if stage == "emotion" and subphase == "label":
            prompts = (
                "감정 이름이 딱 맞지 않아도 괜찮아요. 불안, 피곤함, 무기력함처럼 제일 가까운 하나만 골라볼까요?",
                "한 단어로만 적어도 돼요.\n예: 불안 / 피곤함 / 답답함 / 무기력함",
                "아래 선택지에서 가장 가까운 감정을 눌러도 괜찮아요.",
            )
            return [prompts[min(count - 1, 2)]], self._quick_set("emotion", "label")
        if stage == "emotion" and subphase == "intensity":
            label = str(state.get("emotion_label") or "감정")
            return [self._intensity_retry_prompt(label, count=count - 1)], self._quick_set("emotion", "intensity")
        if stage == "thought":
            prompts = (
                "완벽한 문장일 필요는 없어요. 그때 머릿속에 스친 말 한마디만 적어볼까요?",
                "예: 또 망할 것 같아 / 무시당할 것 같아 / 난 결국 안 돼",
                "아래 예시 중 가까운 걸 눌러서 시작해도 괜찮아요.",
            )
            key = "core_probe" if subphase in {"core_probe", "core_blocked"} else "auto_thought"
            return [prompts[min(count - 1, 2)]], self._quick_set("thought", key)
        if stage == "evidence":
            mode = "against" if subphase == "evidence_against" else "for"
            core = str(state.get("core_message_text") or "").strip() or "그 생각"
            return [self._evidence_scaffold_prompt(mode=mode, core=core, count=count - 1)], self._quick_set("evidence", subphase)
        prompts = (
            "지금은 딱 맞는 답이 바로 안 떠오를 수도 있어요. 같은 질문을 조금 더 쉽게 다시 볼게요.",
            "짧게 한 줄만 적거나, 아래 선택지를 눌러도 괜찮아요.",
            "필요하면 주제를 다시 잡아도 괜찮아요.",
        )
        key = "hard_required" if stage == "situation" else "general"
        return [prompts[min(count - 1, 2)]], self._quick_set("fallback", key)

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
    def _is_near_duplicate(cls, left: str, right: str) -> bool:
        if not left or not right:
            return False
        if left == right:
            return True
        ratio = SequenceMatcher(None, left, right).ratio()
        return ratio >= 0.92

    @classmethod
    def _dedupe_message_lines(cls, text: str) -> str:
        parts = [chunk.strip() for chunk in re.split(r"(?:\n+|(?<=[.!?]))\s*", text) if chunk.strip()]
        kept: list[str] = []
        seen: list[str] = []
        for part in parts:
            sig = cls._message_signature(part)
            if not sig:
                continue
            if any(cls._is_near_duplicate(sig, item) for item in seen):
                continue
            kept.append(part)
            seen.append(sig)
        return "\n".join(kept).strip()

    @classmethod
    def _prepare_assistant_messages(cls, state: dict[str, Any], messages: list[str]) -> list[str]:
        meta = state.get("meta")
        if not isinstance(meta, dict):
            meta = {}
            state["meta"] = meta
        previous_sig = cls._message_signature(str(meta.get("last_assistant_text") or ""))
        previous_history_raw = meta.get("assistant_history")
        previous_history = (
            [cls._message_signature(str(item)) for item in previous_history_raw if str(item).strip()]
            if isinstance(previous_history_raw, list)
            else []
        )
        seen: list[str] = []
        prepared: list[str] = []
        for raw in messages:
            normalized = cls._normalize_coach_message(raw)
            compact = cls._dedupe_message_lines(normalized)
            sig = cls._message_signature(compact)
            if not sig:
                continue
            if cls._is_near_duplicate(sig, previous_sig):
                continue
            if any(cls._is_near_duplicate(sig, item) for item in seen):
                continue
            if any(cls._is_near_duplicate(sig, item) for item in previous_history):
                continue
            prepared.append(compact)
            seen.append(sig)
            previous_sig = sig
        if not prepared:
            prepared = [cls._normalize_coach_message("좋아요. 이어서 진행해볼게요.")]
        meta["last_assistant_text"] = prepared[-1]
        history = previous_history + [cls._message_signature(item) for item in prepared]
        meta["assistant_history"] = history[-20:]
        return prepared

    @staticmethod
    def _contains_question_like(text: str) -> bool:
        normalized = text.strip()
        if not normalized:
            return False
        if "?" in normalized:
            return True
        question_endings = ("나요", "나요?", "까요", "까요?", "할까요", "해볼까요", "줄래요", "줄래요?")
        return normalized.endswith(question_endings)

    @classmethod
    def _sanitize_feedback_clause(cls, text: str) -> str:
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        if not lines:
            return ""
        kept: list[str] = []
        for line in lines:
            if cls._contains_question_like(line):
                continue
            kept.append(line)
        return "\n".join(kept[:2]).strip()

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
        for content in assistant_messages:
            self._append_turn_log(
                state,
                role="assistant",
                content=content,
                stage="situation",
                subphase="topic",
            )
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
        user_log = text or (f"[action] {action_id}" if action_id else "")
        if user_log:
            self._append_turn_log(
                state,
                role="user",
                content=user_log,
                stage=stage,
                subphase=subphase,
            )

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
            for content in assistant_messages:
                self._append_turn_log(
                    state,
                    role="assistant",
                    content=content,
                    stage=stage,
                    subphase=subphase,
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

        compose_meta = LimitedLlmMeta(False, None, None, None)
        if next_stage == "summary":
            closing_messages, summary_meta = self._compose_session_closure(state)
            fallback_question = self._normalize_coach_message(next_question)
            base_messages = self._prepare_assistant_messages(state, closing_messages)
            if not base_messages:
                base_messages = [fallback_question]
            if self._message_signature(base_messages[-1]) != self._message_signature(fallback_question):
                base_messages.append(fallback_question)
            compose_meta = summary_meta
            state["summary_text"] = self._build_summary_text(state)
        else:
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
            if self._contains_question_like(empathy):
                empathy = self._fallback_empathy(stage, text)
            restatement = self._sanitize_feedback_clause(restatement)
            first_candidates = self._prepare_assistant_messages(state, [first_message])
            fallback_question = self._normalize_coach_message(next_question)
            base_messages = list(first_candidates)
            if not base_messages:
                base_messages = [self._normalize_coach_message(self._fallback_empathy(stage, text))]
            if self._message_signature(base_messages[-1]) != self._message_signature(fallback_question):
                base_messages.append(fallback_question)

        for content in base_messages:
            self._append_turn_log(
                state,
                role="assistant",
                content=content,
                stage=next_stage,
                subphase=next_subphase,
            )

        planner_action = self._infer_planner_action(state)
        conversation_closed = next_stage == "summary"
        if conversation_closed:
            state["meta"]["conversation_closed"] = True

        aux_metas = self._consume_aux_llm_meta(state)
        fallback_reason = self._merge_fallback_reasons(risk_meta, extract_meta, compose_meta, *aux_metas)
        self._append_turn_diagnostics(
            state,
            stage=stage,
            llm_meta=[risk_meta, extract_meta, compose_meta, *aux_metas],
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
            "core_thought_candidates": [],
            "pattern_ranked": [],
            "pattern_probe_question": "",
            "possible_core_belief_hint": "",
            "evidence_for": [],
            "evidence_against": [],
            "alternative_thought": "",
            "commitment_type": None,
            "commitment_text": "",
            "summary_text": "",
            "todo_id": None,
            "turn_log": [],
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
                "assistant_history": [],
                "aux_llm_meta": [],
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
            "pattern_probe_question",
            "possible_core_belief_hint",
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

        for key in (
            "evidence_for",
            "evidence_against",
            "automatic_thoughts",
            "emotions",
            "behaviors",
            "core_thought_candidates",
            "pattern_ranked",
            "turn_log",
        ):
            value = raw.get(key)
            if isinstance(value, list):
                state[key] = value
        if isinstance(state.get("turn_log"), list):
            turn_log_clean: list[dict[str, str]] = []
            for item in state["turn_log"][-80:]:
                if not isinstance(item, dict):
                    continue
                role = str(item.get("role") or "").strip().lower()
                content = str(item.get("content") or "").strip()
                if role not in {"user", "assistant"} or not content:
                    continue
                turn_log_clean.append(
                    {
                        "role": role,
                        "content": content[:1200],
                        "stage": str(item.get("stage") or ""),
                        "subphase": str(item.get("subphase") or ""),
                    }
                )
            state["turn_log"] = turn_log_clean[-80:]

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
        history = state["meta"].get("assistant_history")
        if not isinstance(history, list):
            state["meta"]["assistant_history"] = []
        else:
            state["meta"]["assistant_history"] = [str(item) for item in history if str(item).strip()][-20:]
        aux_llm_meta = state["meta"].get("aux_llm_meta")
        if not isinstance(aux_llm_meta, list):
            state["meta"]["aux_llm_meta"] = []
        else:
            state["meta"]["aux_llm_meta"] = [
                item
                for item in aux_llm_meta
                if isinstance(item, dict)
            ][-12:]
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
            "pattern_probe_question",
            "possible_core_belief_hint",
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
        state["core_thought_candidates"] = []
        state["pattern_ranked"] = []
        state["automatic_thoughts"] = []
        state["emotions"] = []
        state["behaviors"] = []
        state["turn_log"] = []
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
        state["meta"]["assistant_history"] = []
        state["meta"]["aux_llm_meta"] = []

    @staticmethod
    def _append_turn_log(
        state: dict[str, Any],
        *,
        role: str,
        content: str,
        stage: str,
        subphase: str,
    ) -> None:
        text = str(content or "").strip()
        if not text:
            return
        turn_log = state.get("turn_log")
        if not isinstance(turn_log, list):
            turn_log = []
            state["turn_log"] = turn_log
        turn_log.append(
            {
                "role": role,
                "content": text[:1200],
                "stage": stage,
                "subphase": subphase,
            }
        )
        state["turn_log"] = turn_log[-80:]

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
        elif stage == "thought" and subphase == "core_refine":
            quick_replies = self._core_refine_quick_set(state)
        else:
            quick_replies = self._quick_set(stage, subphase)
        message = "좋아요. 같은 단계를 다른 방식으로 다시 정리해볼게요."
        question = prompt
        assistant_messages = self._prepare_assistant_messages(state, [message, question])
        for content in assistant_messages:
            self._append_turn_log(
                state,
                role="assistant",
                content=content,
                stage=stage,
                subphase=subphase,
            )
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
        for content in assistant_messages:
            self._append_turn_log(
                state,
                role="assistant",
                content=content,
                stage="summary",
                subphase="summary",
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
            probe = str(state.get("pattern_probe_question") or "").strip()
            if probe:
                return probe
            probe_count = int(state["meta"].get("thought_probe_count", 0) or 0)
            return THOUGHT_PROBE_QUESTIONS[min(probe_count, len(THOUGHT_PROBE_QUESTIONS) - 1)]
        if stage == "thought" and subphase == "core_confirm":
            return self._core_confirm_prompt(state)
        if stage == "thought" and subphase == "core_refine":
            return "조금 다르게 표현해볼게요. 더 맞는 표현으로 핵심 생각을 한 줄만 적어볼까요?"
        if stage == "thought" and subphase == "core_blocked":
            return "핵심 생각이 아직 흐릿해요. 같은 질문을 다시 보거나 주제를 다시 고를 수 있어요."
        if stage == "evidence" and subphase == "evidence_for":
            return self._evidence_prompt(state, mode="for")
        if stage == "evidence" and subphase == "evidence_against":
            return self._evidence_prompt(state, mode="against")
        if stage == "alternative_plan" and subphase == "alternative":
            return "양쪽 이유를 함께 보고, 조금 더 균형 잡힌 생각을 한 문장으로 적어볼까요?"
        return "세션을 저장하면 오늘 대화의 조언과 요약이 기록됩니다."

    def _core_confirm_prompt(self, state: dict[str, Any]) -> str:
        core = str(state.get("core_message_text") or "").strip()
        if not core:
            return "지금 마음을 건드리는 핵심 생각을 한 문장으로 정리해볼까요?"
        lines = [
            "지금 마음속에서 제일 크게 걸리는 결론을 한 문장으로 정리해보면,",
            f"‘{core}’에 가까워 보여요.",
        ]
        lines.append("이렇게 정리해도 맞을까요?")
        return "\n".join(lines)

    @staticmethod
    def _evidence_prompt(state: dict[str, Any], *, mode: str) -> str:
        core = str(state.get("core_message_text") or "").strip() or "지금 떠오른 생각"
        if mode == "for":
            return (
                f"‘{core}’라고 느끼게 만든 이유가 있다면 어떤 게 떠오르세요?\n"
                "먼저, 맞아 보이는 이유를 하나 적어볼까요?"
            )
        return (
            f"만약 ‘{core}’가 꼭 사실이 아닐 수도 있다면, 그럴 만한 이유가 있을까요?\n"
            "이번에는 꼭 그렇지 않을 수 있는 이유를 하나 적어볼까요?"
        )

    @staticmethod
    def _sanitize_candidate_text(value: Any, *, max_len: int = 220) -> str:
        text = str(value or "").strip()
        if not text:
            return ""
        if len(text) > max_len:
            return text[:max_len].rstrip()
        return text

    @staticmethod
    def _sanitize_candidates(values: Any, *, max_count: int = 3, max_len: int = 220) -> list[str]:
        if not isinstance(values, list):
            return []
        dedup: list[str] = []
        seen: set[str] = set()
        for item in values:
            text = CbtThoughtRecordEngine._sanitize_candidate_text(item, max_len=max_len)
            if not text:
                continue
            sig = CbtThoughtRecordEngine._message_signature(text)
            if not sig or sig in seen:
                continue
            seen.add(sig)
            dedup.append(text)
            if len(dedup) >= max_count:
                break
        return dedup

    def _pattern_by_id(self) -> dict[str, dict[str, Any]]:
        return {
            str(item.get("id") or "").strip(): item
            for item in self._thinking_patterns
            if isinstance(item, dict) and str(item.get("id") or "").strip()
        }

    def _top_pattern(self, state: dict[str, Any]) -> dict[str, Any] | None:
        ranked = state.get("pattern_ranked")
        if not isinstance(ranked, list) or not ranked:
            return None
        top = ranked[0]
        if not isinstance(top, dict):
            return None
        pid = str(top.get("id") or "").strip()
        if not pid:
            return None
        return self._pattern_by_id().get(pid)

    @staticmethod
    def _safe_pattern_ranked(value: Any) -> list[dict[str, Any]]:
        if not isinstance(value, list):
            return []
        ranked: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in value:
            if not isinstance(item, dict):
                continue
            pid = str(item.get("id") or "").strip()
            if not pid or pid in seen:
                continue
            try:
                confidence = float(item.get("confidence", 0))
            except (TypeError, ValueError):
                confidence = 0.0
            ranked.append(
                {
                    "id": pid,
                    "confidence": max(0.0, min(1.0, confidence)),
                }
            )
            seen.add(pid)
            if len(ranked) >= 3:
                break
        return ranked

    def _fallback_pattern_ranked(self, thought_text: str) -> list[dict[str, Any]]:
        lowered = thought_text.lower()
        candidates: list[tuple[str, float]] = []
        if any(token in lowered for token in ("최악", "끝장", "망할")):
            candidates.append(("catastrophizing", 0.72))
        if any(token in lowered for token in ("항상", "절대", "매번")):
            candidates.append(("overgeneralization", 0.64))
        if any(token in lowered for token in ("해야", "반드시", "꼭")):
            candidates.append(("should_statements", 0.61))
        if any(token in lowered for token in ("내 탓", "내가 문제", "잘못은 다")):
            candidates.append(("personalization", 0.67))
        if any(token in lowered for token in ("분명", "속뜻", "생각할 거")):
            candidates.append(("mind_reading", 0.58))
        if not candidates:
            candidates.append(("rumination_general", 0.42))
        return [{"id": pid, "confidence": conf} for pid, conf in candidates[:2]]

    def _pattern_probe_from_catalog(self, pattern_id: str, state: dict[str, Any]) -> str:
        pattern = self._pattern_by_id().get(pattern_id)
        if not pattern:
            return "이 생각을 조금 더 또렷하게 보면, 제일 걱정되는 핵심은 무엇인가요?"
        templates = pattern.get("probe_templates_ko")
        if not isinstance(templates, list) or not templates:
            return "이 생각을 조금 더 또렷하게 보면, 제일 걱정되는 핵심은 무엇인가요?"
        template = str(templates[0]).strip()
        if not template:
            return "이 생각을 조금 더 또렷하게 보면, 제일 걱정되는 핵심은 무엇인가요?"
        nickname = str((state.get("profile_snapshot") or {}).get("user_nickname") or DEFAULT_USER_NAME)
        core = str(state.get("core_message_text") or "").strip() or "지금 떠오른 생각"
        situation = str(state.get("situation_text") or "").strip() or "오늘 상황"
        return (
            template.replace("{nickname}", nickname)
            .replace("{core_thought}", core)
            .replace("{situation_hint}", situation)
        )

    def _analyze_core_pattern(self, state: dict[str, Any], thought_text: str) -> None:
        situation = str(state.get("situation_text") or "").strip()
        emotion = str(state.get("emotion_label") or "").strip()
        intensity = state.get("emotion_intensity_0_100")
        try:
            intensity_int = int(intensity) if intensity is not None else None
        except (TypeError, ValueError):
            intensity_int = None

        recent_turns = state.get("turn_log")
        recent_user: list[str] = []
        if isinstance(recent_turns, list):
            for item in recent_turns[-8:]:
                if not isinstance(item, dict):
                    continue
                if str(item.get("role") or "") != "user":
                    continue
                content = str(item.get("content") or "").strip()
                if content:
                    recent_user.append(content[:300])

        nickname = str((state.get("profile_snapshot") or {}).get("user_nickname") or DEFAULT_USER_NAME)
        analyzed, meta = self._llm.analyze_core_pattern(
            situation_text=situation,
            emotion_label=emotion,
            emotion_intensity=intensity_int,
            auto_thought_text=thought_text,
            recent_user_texts=recent_user,
            thinking_patterns=self._thinking_patterns,
            nickname=nickname,
        )
        self._remember_aux_llm_meta(state, meta)

        if not isinstance(analyzed, dict):
            analyzed = {}
        candidates = self._sanitize_candidates(analyzed.get("core_thought_candidates"), max_count=3)
        best = self._sanitize_candidate_text(analyzed.get("best_core_thought"), max_len=220)
        if not best and candidates:
            best = candidates[0]
        if not best:
            best = thought_text[:220]
        if best and not candidates:
            candidates = [best]
        ranked = self._safe_pattern_ranked(analyzed.get("pattern_ranked"))
        if not ranked:
            ranked = self._fallback_pattern_ranked(thought_text)
        probe_question = self._sanitize_candidate_text(analyzed.get("pattern_probe_question"), max_len=260)
        if not probe_question and ranked:
            probe_question = self._pattern_probe_from_catalog(str(ranked[0].get("id") or ""), state)
        if not probe_question:
            probe_question = "이 생각이 맞다고 느껴지는 이유를 하나만 더 짚어보면 어떤 말이 나오나요?"

        belief_hint = self._sanitize_candidate_text(analyzed.get("possible_core_belief_hint"), max_len=220)
        if belief_hint:
            state["possible_core_belief_hint"] = belief_hint
        state["core_thought_candidates"] = candidates
        state["core_message_text"] = best
        state["pattern_ranked"] = ranked
        state["pattern_probe_question"] = probe_question

    def _core_refine_quick_set(self, state: dict[str, Any]) -> list[dict[str, str]]:
        candidates = self._sanitize_candidates(state.get("core_thought_candidates"), max_count=3)
        items: list[dict[str, str]] = []
        if candidates:
            for index, candidate in enumerate(candidates):
                label = candidate if len(candidate) <= 18 else f"후보 {index + 1}"
                items.append(self._prefill_item(label, candidate))
        else:
            items.extend(
                [
                    self._prefill_item("무능해 보일까 봐", "무능해 보일까 봐"),
                    self._prefill_item("신뢰를 잃을까 봐", "신뢰를 잃을까 봐"),
                    self._prefill_item("미움받을까 봐", "미움받을까 봐"),
                ]
            )
        items.extend(self._quick_set("thought", "core_refine"))
        return items

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

    def _compose_session_closure(self, state: dict[str, Any]) -> tuple[list[str], LimitedLlmMeta]:
        closure, meta = self._llm.compose_session_closure(current_state=state)
        if isinstance(closure, dict):
            summary = self._sanitize_candidate_text(closure.get("summary"), max_len=220)
            advice = self._sanitize_candidate_text(closure.get("advice"), max_len=220)
            items = [item for item in [summary, advice] if item]
            if items:
                return items, meta

        core = str(state.get("core_message_text") or "").strip()
        alternative = str(state.get("alternative_thought") or "").strip()
        thought = str(state.get("auto_thought_text") or "").strip()
        if alternative and core:
            summary_line = (
                f"오늘은 ‘{core}’처럼 마음을 무겁게 하던 생각을 살펴보고, "
                f"‘{alternative}’처럼 조금 더 균형 있게 보는 문장을 만들었어요."
            )
        elif alternative:
            summary_line = f"오늘은 마음을 무겁게 하던 장면을 정리하고, ‘{alternative}’처럼 조금 더 유연한 문장을 남겼어요."
        elif thought:
            summary_line = f"오늘은 ‘{thought}’처럼 반복되던 생각을 붙잡아 보고, 그 생각의 이유를 차분히 살펴봤어요."
        else:
            summary_line = "오늘은 지금 마음을 어렵게 하는 상황과 떠오르는 생각을 차분히 정리해봤어요."
        advice_line = "지금 바로 무언가를 바꾸려 하기보다, 오늘 정리한 문장을 필요할 때 한 번씩 다시 떠올려봐도 괜찮아요."
        return [summary_line[:220], advice_line[:220]], meta

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
        for content in assistant_messages:
            self._append_turn_log(
                state,
                role="assistant",
                content=content,
                stage="summary",
                subphase="summary",
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
        is_skip = action_id == ACTION_SKIP_STAGE or "건너뛰기" in lowered or "skip" in lowered
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
            detected_labels = self._detect_emotion_labels(normalized_text)
            freeform_label = self._normalize_freeform_emotion_label(normalized_text)
            recent_inputs = self._recent_emotion_label_inputs(state)
            if not label and not detected_labels and self._looks_ambiguous_emotion_response(normalized_text):
                prompt = (
                    "감정이 한 가지로 딱 떨어지지 않아도 괜찮아요.\n불안, 피곤함, 무기력함, 답답함 중 가장 가까운 하나만 골라볼까요?"
                    if len(recent_inputs) <= 1
                    else "딱 맞는 감정 단어가 아니어도 괜찮아요.\n가장 가까운 느낌 하나만 말해주면 제가 대표 감정으로 이어서 정리할게요. 예: 부담 / 피곤함 / 무기력함"
                )
                return (
                    "emotion",
                    "label",
                    prompt,
                    self._quick_set("emotion", "label"),
                    [],
                )
            if not label and not detected_labels and self._looks_no_emotion_response(normalized_text):
                state["emotion_label"] = ""
                state["emotion_intensity_0_100"] = None
                state["emotions"] = []
                state["meta"]["emotion_substep"] = "label"
                state["meta"]["thought_substep"] = "auto_thought"
                return (
                    "thought",
                    "auto_thought",
                    "괜찮아요. 감정 이름이 바로 안 떠올라도 괜찮아요.\n그때 머릿속에 순간적으로 스친 생각을 한 문장으로 적어볼까요?",
                    self._quick_set("thought", "auto_thought"),
                    [],
                )
            if not label and detected_labels:
                label = detected_labels[0]
            elif not label and freeform_label:
                label = freeform_label
            for token in split:
                if token.isdigit():
                    intensity = int(token)
                    break
            if not self._looks_valid_label(label):
                if not any(char.isalnum() for char in normalized_text):
                    return None
                return (
                    "emotion",
                    "label",
                    (
                        "감정 이름이 바로 안 떠오르면, 불안·피곤함·무기력함처럼 가장 가까운 하나만 적어도 괜찮아요."
                        if len(recent_inputs) <= 1
                        else "딱 맞는 말이 아니어도 괜찮아요. 짧게 한 단어로만 적어주면 그 느낌을 기준으로 이어갈게요.\n예: 답답함 / 버거움 / 피곤함"
                    ),
                    self._quick_set("emotion", "label"),
                    [],
                )

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
            if len(detected_labels) >= 2:
                detected = ", ".join(detected_labels[:3])
                intensity_prompt = (
                    f"방금 적어준 감정 중에서는 {detected}이 느껴져요.\n"
                    f"우선 가장 크게 느껴지는 {self._emotion_degree_label(state['emotion_label'])}의 정도(0~100)를 알려주세요."
                )
            else:
                intensity_prompt = self._intensity_retry_prompt(state["emotion_label"], count=0)
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
            return (
                "emotion",
                "intensity",
                self._intensity_retry_prompt(str(state.get("emotion_label") or "감정"), count=1),
                self._quick_set("emotion", "intensity"),
                [],
            )
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

            thought = str(extracted.get("auto_thought_text") or user_text).strip()
            thought = self._strip_prefill_seed(thought, allow_prefix_only=True)
            if len(thought) < 2:
                return None
            state["auto_thought_text"] = thought[:300]
            state["automatic_thoughts"] = [state["auto_thought_text"]]
            state["meta"]["thought_probe_count"] = 0
            state["core_message_text"] = ""
            self._analyze_core_pattern(state, state["auto_thought_text"])
            if (
                not str(state.get("core_message_text") or "").strip()
                or (
                    not self._looks_core_message(state["auto_thought_text"])
                    and not self._looks_valid_thought_sentence(state["auto_thought_text"])
                )
            ):
                state["meta"]["thought_substep"] = "core_probe"
                return (
                    "thought",
                    "core_probe",
                    self._current_stage_prompt(stage="thought", subphase="core_probe", state=state),
                    self._quick_set("thought", "core_probe"),
                    [],
                )
            state["meta"]["thought_substep"] = "core_confirm"
            return (
                "thought",
                "core_confirm",
                self._core_confirm_prompt(state),
                self._quick_set("thought", "core_confirm"),
                [],
            )

        if thought_substep == "core_confirm":
            manual = self._strip_prefill_seed(user_text, allow_prefix_only=True)
            resolved_action_id = action_id or self._resolve_core_confirm_action(manual)
            if resolved_action_id == ACTION_CONFIRM_CORE_YES:
                state["meta"]["evidence_substep"] = "for"
                state["meta"]["thought_substep"] = "auto_thought"
                return (
                    "evidence",
                    "evidence_for",
                    self._evidence_prompt(state, mode="for"),
                    self._quick_set("evidence", "evidence_for"),
                    [],
                )
            if resolved_action_id in {ACTION_CONFIRM_CORE_NO, ACTION_CONFIRM_CORE_NOT_SURE}:
                state["meta"]["thought_substep"] = "core_refine"
                return (
                    "thought",
                    "core_refine",
                    "좋아요. 조금 다르게 표현해볼게요.\n더 맞는 핵심 생각으로 한 줄만 바꿔볼까요?",
                    self._core_refine_quick_set(state),
                    [],
                )
            if is_skip:
                state["meta"]["thought_substep"] = "core_refine"
                return (
                    "thought",
                    "core_refine",
                    "괜찮아요. 지금 더 자연스럽게 느껴지는 표현으로 다시 적어볼까요?",
                    self._core_refine_quick_set(state),
                    [],
                )
            if manual and manual not in {"기타", "기타:"}:
                if not self._resolve_core_confirm_action(manual) and len(manual) >= 3:
                    state["meta"]["thought_substep"] = "core_confirm"
                    state["core_message_text"] = manual[:220]
                    self._analyze_core_pattern(state, manual)
                    return (
                        "thought",
                        "core_confirm",
                        self._core_confirm_prompt(state),
                        self._quick_set("thought", "core_confirm"),
                        [],
                    )
                state["core_message_text"] = manual[:220]
                self._analyze_core_pattern(state, manual)
            return (
                "thought",
                "core_confirm",
                self._core_confirm_prompt(state),
                self._quick_set("thought", "core_confirm"),
                [],
            )

        if thought_substep == "core_refine":
            if is_skip:
                state["meta"]["thought_substep"] = "core_blocked"
                return (
                    "thought",
                    "core_blocked",
                    "지금은 핵심 생각을 또렷하게 잡기 어렵다면, 주제를 다시 선택하거나 여기서 마무리해도 괜찮아요.",
                    self._quick_set("thought", "core_blocked"),
                    [],
                )
            candidate = str(extracted.get("core_belief_hint") or user_text).strip()
            candidate = self._strip_prefill_seed(candidate, allow_prefix_only=True)
            if len(candidate) < 2 or candidate in {"기타", "기타:"}:
                return (
                    "thought",
                    "core_refine",
                    "한 문장으로 딱 정리되지 않아도 괜찮아요.\n예: 또 망할 것 같아 / 무시당할 것 같아 / 난 결국 안 돼",
                    self._core_refine_quick_set(state),
                    [],
                )
            state["core_message_text"] = candidate[:220]
            self._analyze_core_pattern(state, candidate)
            state["meta"]["thought_substep"] = "core_confirm"
            return (
                "thought",
                "core_confirm",
                self._core_confirm_prompt(state),
                self._quick_set("thought", "core_confirm"),
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
            if probe_count + 1 < THOUGHT_PROBE_MAX:
                state["meta"]["thought_probe_count"] = probe_count + 1
                return (
                    "thought",
                    "core_probe",
                    self._current_stage_prompt(stage="thought", subphase="core_probe", state=state),
                    self._quick_set("thought", "core_probe"),
                    [],
                )
            state["meta"]["thought_substep"] = "core_blocked"
            state["meta"]["thought_probe_count"] = THOUGHT_PROBE_MAX
            return (
                "thought",
                "core_blocked",
                "핵심 생각이 아직 흐릿해요. 한 번 더 시도하거나 주제를 다시 잡아볼까요?",
                self._quick_set("thought", "core_blocked"),
                [],
            )

        candidate = str(extracted.get("core_belief_hint") or user_text).strip()
        candidate = self._strip_prefill_seed(candidate, allow_prefix_only=True)
        if candidate and candidate not in {"기타", "기타:"}:
            state["core_message_text"] = candidate[:220]
            self._analyze_core_pattern(state, candidate)
            state["meta"]["thought_substep"] = "core_confirm"
            return (
                "thought",
                "core_confirm",
                self._core_confirm_prompt(state),
                self._quick_set("thought", "core_confirm"),
                [],
            )

        if probe_count + 1 < THOUGHT_PROBE_MAX:
            state["meta"]["thought_probe_count"] = probe_count + 1
            return (
                "thought",
                "core_probe",
                "길게 적지 않아도 괜찮아요.\n그때 머릿속 한마디를 짧게 적어볼까요? 예: 또 망할 것 같아",
                self._quick_set("thought", "core_probe"),
                [],
            )

        state["meta"]["thought_probe_count"] = THOUGHT_PROBE_MAX
        state["meta"]["thought_substep"] = "core_blocked"
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
        raw_substep = str(state["meta"].get("evidence_substep") or "for")
        substep = "evidence_against" if raw_substep in {"against", "evidence_against"} else "evidence_for"
        is_skip = action_id == ACTION_SKIP_STAGE or any(token in user_text.lower() for token in SKIP_KEYWORDS)
        is_next = action_id == ACTION_NEXT_STAGE or self._looks_evidence_next_intent(user_text)
        item = str(extracted.get("evidence_item") or user_text).strip()
        item = self._strip_prefill_seed(item, allow_prefix_only=True)
        low_quality = self._is_low_quality_evidence(user_text) or self._is_low_quality_evidence(item)
        if not is_skip and not is_next and (len(item) < 2 or low_quality):
            core = str(state.get("core_message_text") or "").strip() or "그 생각"
            if substep == "evidence_for" and len(state["evidence_for"]) >= 1:
                prompt = (
                    "좋아요. 맞아 보이는 이유는 이미 하나 찾았어요.\n"
                    "더 떠오르면 한 줄 더 적고, 아니면 ‘다음으로’라고 적어도 괜찮아요."
                )
            elif substep == "evidence_against" and len(state["evidence_against"]) >= 1:
                prompt = (
                    "좋아요. 꼭 그렇지 않을 수 있는 근거도 이미 하나 찾았어요.\n"
                    "더 떠오르면 한 줄 더 적고, 아니면 ‘다음으로’라고 적어도 괜찮아요."
                )
            else:
                prompt = self._evidence_scaffold_prompt(
                    mode="against" if substep == "evidence_against" else "for",
                    core=core,
                    count=int(state["meta"].get("stage_repeat_count", 0) or 0),
                )
            return (
                "evidence",
                substep,
                prompt,
                self._quick_set("evidence", substep),
                [],
            )

        if substep == "evidence_for":
            if not is_skip and not is_next and item not in state["evidence_for"] and len(state["evidence_for"]) < EVIDENCE_TARGET_MAX:
                state["evidence_for"].append(item[:260])
            if not is_next and (self._needs_evidence_scaffold(user_text) or low_quality):
                core = str(state.get("core_message_text") or "").strip() or "그 생각"
                return (
                    "evidence",
                    "evidence_for",
                    self._evidence_scaffold_prompt(mode="for", core=core, count=1),
                    self._quick_set("evidence", "evidence_for"),
                    [],
                )
            if len(state["evidence_for"]) >= 1 and not is_skip and not is_next:
                return (
                    "evidence",
                    "evidence_for",
                    (
                        "좋아요. 그 근거 하나만으로도 충분히 시작할 수 있어요.\n"
                        "더 있으면 한 줄 더 적고, 아니면 ‘다음으로’를 눌러도 괜찮아요."
                        if len(state["evidence_for"]) == 1
                        else "좋아요. 맞아 보이는 이유를 여러 개 모았어요.\n이제 ‘다음으로’라고 적으면 반대 근거 단계로 넘어갈게요."
                    ),
                    self._quick_set("evidence", "evidence_for"),
                    [],
                )
            if len(state["evidence_for"]) < 1 and not is_skip and not is_next:
                core = str(state.get("core_message_text") or "").strip() or "그 생각"
                next_question = (
                    f"좋아요. ‘{core}’라고 느껴진 이유를 한 가지만 더 적어볼까요?\n"
                    "맞아 보이는 근거를 짧게 한 줄로 써주세요."
                )
                return (
                    "evidence",
                    "evidence_for",
                    next_question,
                    self._quick_set("evidence", "evidence_for"),
                    [],
                )
            state["meta"]["evidence_substep"] = "against"
            next_question = self._evidence_prompt(state, mode="against")
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
            and not low_quality
            and item not in state["evidence_against"]
            and len(state["evidence_against"]) < EVIDENCE_TARGET_MAX
        ):
            state["evidence_against"].append(item[:260])
        if not is_next and (self._needs_evidence_scaffold(user_text) or low_quality):
            core = str(state.get("core_message_text") or "").strip() or "그 생각"
            return (
                "evidence",
                "evidence_against",
                self._evidence_scaffold_prompt(mode="against", core=core, count=1),
                self._quick_set("evidence", "evidence_against"),
                [],
            )
        if len(state["evidence_against"]) >= 1 and not is_skip and not is_next:
            return (
                "evidence",
                "evidence_against",
                (
                    "좋아요. 반대 근거도 하나 찾았어요.\n"
                    "더 떠오르면 한 줄 더 적고, 아니면 ‘다음으로’를 눌러 균형 생각으로 넘어가볼까요?"
                    if len(state["evidence_against"]) == 1
                    else "좋아요. 꼭 그렇지 않을 수 있는 이유도 여러 개 모았어요.\n이제 ‘다음으로’라고 적으면 균형 생각 단계로 넘어갈게요."
                ),
                self._quick_set("evidence", "evidence_against"),
                [],
            )
        if len(state["evidence_against"]) < 1 and not is_skip and not is_next:
            core = str(state.get("core_message_text") or "").strip() or "그 생각"
            next_question = (
                f"좋아요. ‘{core}’가 꼭 사실이 아닐 수도 있는 이유를 한 가지만 더 적어볼까요?\n"
                "다르게 볼 수 있는 근거를 한 줄로 적어주세요."
            )
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
            state["commitment_type"] = None
            state["commitment_text"] = ""
            state["todo_id"] = None
            next_question = "정리했어요. 세션을 저장하면 오늘 대화를 바탕으로 한 조언과 요약이 기록됩니다."
            return (
                "summary",
                "summary",
                next_question,
                self._quick_set("summary", "summary"),
                [],
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
            "세션 저장 버튼을 누르면 오늘 대화의 조언과 요약이 저장됩니다.",
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
        repair_payload, repair_meta = self._llm.compose_repair_message(
            stage=stage,
            subphase=subphase,
            fallback_reason=fallback_reason,
        )
        self._remember_aux_llm_meta(state, repair_meta)
        repair_message = ""
        retry_prompt = ""
        if isinstance(repair_payload, dict):
            repair_message = self._sanitize_candidate_text(repair_payload.get("repair_message"), max_len=240)
            retry_prompt = self._sanitize_candidate_text(repair_payload.get("retry_prompt"), max_len=220)
        count = int(state["meta"].get("stage_repeat_count", 0)) + 1
        state["meta"]["stage_repeat_count"] = count
        state["meta"]["state_repeat_count"] = count

        if count >= 4:
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
            if stage == "evidence" and fallback_reason == "empty_input":
                softened_messages, quick = self._soft_invalid_guidance(
                    stage,
                    subphase,
                    count=max(count, 2),
                    state=state,
                )
                assistant_messages = softened_messages
            elif count == 1:
                assistant_messages = [
                    repair_message or "지금은 딱 맞는 답이 바로 안 떠오를 수도 있어요.",
                    retry_prompt or "같은 질문으로 다시 해보거나, 짧게 한 줄만 적어도 괜찮아요.",
                ]
                quick = self._quick_set("fallback", "hard_required" if stage == "situation" else "general")
            else:
                softened_messages, quick = self._soft_invalid_guidance(
                    stage,
                    subphase,
                    count=count,
                    state=state,
                )
                assistant_messages = softened_messages
            stage_out = stage
            subphase_out = subphase
            closed = False

        metas = list(extra_meta or [])
        metas.extend(self._consume_aux_llm_meta(state))
        self._append_turn_diagnostics(
            state,
            stage=stage,
            llm_meta=metas,
            fallback_reason=fallback_reason,
            user_input=user_input,
        )
        assistant_messages = self._prepare_assistant_messages(state, assistant_messages)
        for content in assistant_messages:
            self._append_turn_log(
                state,
                role="assistant",
                content=content,
                stage=stage_out,
                subphase=subphase_out,
            )
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

    @staticmethod
    def _remember_aux_llm_meta(state: dict[str, Any], meta: LimitedLlmMeta) -> None:
        raw_meta = state.get("meta")
        if not isinstance(raw_meta, dict):
            return
        bucket = raw_meta.get("aux_llm_meta")
        if not isinstance(bucket, list):
            bucket = []
            raw_meta["aux_llm_meta"] = bucket
        bucket.append(
            {
                "llm_used": bool(meta.llm_used),
                "model": meta.model,
                "latency_ms": meta.latency_ms,
                "fallback_reason": meta.fallback_reason,
            }
        )
        raw_meta["aux_llm_meta"] = bucket[-12:]

    @staticmethod
    def _consume_aux_llm_meta(state: dict[str, Any]) -> list[LimitedLlmMeta]:
        raw_meta = state.get("meta")
        if not isinstance(raw_meta, dict):
            return []
        bucket = raw_meta.get("aux_llm_meta")
        if not isinstance(bucket, list):
            raw_meta["aux_llm_meta"] = []
            return []
        metas: list[LimitedLlmMeta] = []
        for item in bucket:
            if not isinstance(item, dict):
                continue
            latency_raw = item.get("latency_ms")
            try:
                latency = int(latency_raw) if latency_raw is not None else None
            except (TypeError, ValueError):
                latency = None
            metas.append(
                LimitedLlmMeta(
                    llm_used=bool(item.get("llm_used", False)),
                    model=str(item.get("model") or "") or None,
                    latency_ms=latency,
                    fallback_reason=str(item.get("fallback_reason") or "") or None,
                )
            )
        raw_meta["aux_llm_meta"] = []
        return metas

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

    def _build_alternative_candidates(self, state: dict[str, Any]) -> list[str]:
        core = str(state.get("core_message_text") or "").strip()
        for_list = state.get("evidence_for")
        against_list = state.get("evidence_against")
        for_first = for_list[0] if isinstance(for_list, list) and for_list else ""
        against_first = against_list[0] if isinstance(against_list, list) and against_list else ""

        ranked = state.get("pattern_ranked")
        llm_suggestions, llm_meta = self._llm.suggest_alternative_candidates(
            core_thought=core,
            evidence_for=[str(item) for item in for_list[:5]] if isinstance(for_list, list) else [],
            evidence_against=[str(item) for item in against_list[:5]] if isinstance(against_list, list) else [],
            pattern_ranked=ranked if isinstance(ranked, list) else [],
        )
        self._remember_aux_llm_meta(state, llm_meta)
        llm_candidates = self._sanitize_candidates(
            llm_suggestions.get("candidates") if isinstance(llm_suggestions, dict) else None,
            max_count=3,
            max_len=220,
        )
        if len(llm_candidates) >= 2:
            while len(llm_candidates) < 3:
                llm_candidates.append("지금 할 수 있는 작은 행동부터 해보고, 결과를 보고 생각을 다시 조정해보겠어요.")
            return llm_candidates[:3]

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

    def _commitment_quick_set(self, state: dict[str, Any], *, mode: str) -> list[dict[str, str]]:
        # Legacy compatibility: current CBT chat flow no longer enters commitment substeps,
        # but session save / older states still reference this helper.
        core = str(state.get("core_message_text") or "").strip()
        ranked = state.get("pattern_ranked")
        llm_suggestions, llm_meta = self._llm.suggest_commitment_candidates(
            core_thought=core,
            pattern_ranked=ranked if isinstance(ranked, list) else [],
            commitment_mode=mode,
        )
        self._remember_aux_llm_meta(state, llm_meta)
        candidates = self._sanitize_candidates(
            llm_suggestions.get("candidates") if isinstance(llm_suggestions, dict) else None,
            max_count=3,
            max_len=120,
        )
        if not candidates:
            pattern = self._top_pattern(state)
            fallback = (
                pattern.get("commitment_suggestions_ko")
                if isinstance(pattern, dict)
                else None
            )
            if isinstance(fallback, list):
                candidates = [
                    self._sanitize_candidate_text(item, max_len=120)
                    for item in fallback
                    if self._sanitize_candidate_text(item, max_len=120)
                ][:3]
        if not candidates:
            if mode == "action":
                candidates = [
                    "10분만 준비/정리하기",
                    "확인 메시지 1줄 보내기",
                    "5분만 시작하기",
                ]
            else:
                candidates = [
                    "예외 1개 찾기",
                    "반대 근거 1개 추가",
                    "'항상/절대' 표현 줄이기",
                ]

        items = [self._prefill_item(f"후보 {index + 1}", candidate) for index, candidate in enumerate(candidates[:3])]
        if mode == "action":
            items.extend(self._quick_set("alternative_plan", "commitment_action"))
        else:
            items.extend(self._quick_set("alternative_plan", "commitment_thought"))
        return items

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
