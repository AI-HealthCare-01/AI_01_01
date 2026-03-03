import json
import re
from dataclasses import dataclass
from typing import Any

from app.core.config import settings

try:
    from openai import OpenAI
except Exception:  # pragma: no cover
    OpenAI = None  # type: ignore[assignment]


DISTORTION_KEYS = [
    "all_or_nothing_count",
    "catastrophizing_count",
    "mind_reading_count",
    "should_statements_count",
    "personalization_count",
    "overgeneralization_count",
]

COMPLETION_HINTS = ["완료", "끝냈", "해냈", "수행했", "실천했", "done", "finished"]
CHALLENGE_REQUEST_HINTS = ["챌린지", "과제", "훈련", "연습", "실습", "challenge"]
CBT_PHASES = {"EMOTION", "SITUATION", "THOUGHT", "DISTORTION", "REFRAME", "ACTION"}
PHASE_ORDER = ["EMOTION", "SITUATION", "THOUGHT", "DISTORTION", "REFRAME", "ACTION"]
DISTORTION_NAMES = {
    "overgeneralization",
    "mind_reading",
    "all_or_nothing",
    "catastrophizing",
    "should_statements",
    "personalization_overresponsibility",
    "emotional_reasoning",
    "labeling_negative_identity",
}
DISTORTION_TO_COUNT_KEY = {
    "overgeneralization": "overgeneralization_count",
    "mind_reading": "mind_reading_count",
    "all_or_nothing": "all_or_nothing_count",
    "catastrophizing": "catastrophizing_count",
    "should_statements": "should_statements_count",
    "personalization_overresponsibility": "personalization_count",
}
CHALLENGE_CATALOG_IDS = {
    "MEDITATION_5MIN",
    "SENSORY_MEDITATION",
    "RHYTHM_GAME",
    "MORNING_PATTERN",
    "SLEEP_HYGIENE_ROUTINE",
    "JOURNAL_STREAK",
    "GRATITUDE_LOTTERY",
    "IPT_SUPPORTERS_MAP",
    "SUNLIGHT_5MIN_3D",
    "WALK_10MIN_3D",
    "WEEKLY_MINI_CHALLENGE",
}
COGNITIVE_STYLES = {
    "past_regret",
    "future_worry",
    "self_critical",
    "control_fixation",
    "over_responsibility",
}


@dataclass(slots=True)
class CBTLLMResult:
    reply: str
    extracted: dict[str, Any]
    suggested_challenges: list[str]
    summary_card: dict[str, str]
    active_challenge: str | None = None
    challenge_step_prompt: str | None = None
    challenge_completed: bool = False
    completed_challenge: str | None = None
    completion_message: str | None = None
    cbt_phase: str | None = None
    next_phase: str | None = None
    challenge_rationale: str | None = None
    crisis_mode: bool = False
    crisis_level: str = "none"
    crisis_stage: str | None = None
    crisis_actions: list[str] | None = None


def _default_extracted() -> dict[str, Any]:
    return {
        "distress_0_10": 5,
        "rumination_0_10": 4,
        "avoidance_0_10": 4,
        "sleep_difficulty_0_10": 4,
        "distortion": {k: 0 for k in DISTORTION_KEYS},
        "distortions": [],
        "thought_web": None,
        "suicide_risk_flag": False,
        "intent_level": "none",
        "plan_means_flag": False,
        "crisis_lock_remaining": 0,
        "crisis_stage": None,
        "crisis_hotline_count": 0,
        "crisis_template_index": 0,
        "violent_risk_flag": False,
    }


def _default_summary_card(user_message: str) -> dict[str, str]:
    cleaned = user_message.strip().replace("\n", " ")
    situation = cleaned[:120] if cleaned else "오늘 있었던 일을 아직 자세히 적지 않았습니다."
    return {
        "situation": situation,
        "self_blame_signal": "스스로를 탓하는 생각이 올라왔는지 함께 확인이 필요합니다.",
        "reframe": "지금의 감정은 나의 부족함이 아니라, 과한 부담과 스트레스에 대한 자연스러운 반응일 수 있습니다.",
        "next_action": "오늘은 사실 1개, 떠오른 생각 1개, 균형 잡힌 대안 생각 1개를 짧게 기록해보세요.",
        "encouragement": "지금 이렇게 마음을 돌아보는 행동 자체가 회복을 위한 중요한 시작입니다.",
    }


def _should_defer_challenge(user_message: str, conversation_history: list[dict[str, str]] | None) -> bool:
    history = conversation_history or []
    user_turns = sum(1 for t in history if t.get("role") == "user") + 1
    explicit_request = any(h in user_message.lower() for h in CHALLENGE_REQUEST_HINTS)
    enough_depth = user_turns >= 3 or (user_turns >= 2 and len(user_message.strip()) >= 8)
    return (not explicit_request) and (not enough_depth)


def _last_assistant_message(conversation_history: list[dict[str, str]] | None) -> str:
    for turn in reversed(conversation_history or []):
        if turn.get("role") == "assistant":
            return str(turn.get("content", "")).strip()
    return ""


def _pick_non_repetitive_reply(candidates: list[str], last_assistant: str) -> str:
    if not candidates:
        return ""
    norm_last = re.sub(r"\s+", "", last_assistant.lower())
    for c in candidates:
        norm_c = re.sub(r"\s+", "", c.lower())
        if norm_c and norm_c != norm_last and norm_c not in norm_last:
            return c
    return candidates[0]


def _normalize_text_for_repeat_check(text: str) -> str:
    return re.sub(r"\s+", "", (text or "").strip().lower())


def _is_repetitive_against_last(reply: str, last_assistant: str) -> bool:
    cur = _normalize_text_for_repeat_check(reply)
    last = _normalize_text_for_repeat_check(last_assistant)
    if not cur or not last:
        return False
    if cur == last:
        return True
    if len(cur) >= 20 and cur in last:
        return True
    if len(last) >= 20 and last in cur:
        return True
    return False


def _phase_followup_prompt(phase: str, user_message: str) -> str:
    snippet = user_message.strip().replace("\n", " ")[:40]
    if phase == "EMOTION":
        return f"'{snippet}'라고 했을 때, 지금 감정 이름 1개와 강도(0~10)를 알려줄래요?"
    if phase == "SITUATION":
        return f"'{snippet}' 상황에서 실제로 확인된 사실 1가지만 먼저 적어볼까요?"
    if phase == "THOUGHT":
        return "그 순간 머리에 가장 먼저 떠오른 자동사고를 한 문장으로 적어볼까요?"
    if phase == "DISTORTION":
        return "그 생각 안에 흑백논리/과장/독심추론 중 어떤 패턴이 있었는지 1개만 골라볼까요?"
    if phase == "REFRAME":
        return "그 생각을 100% 사실로 단정하지 않는 대안 문장을 한 줄로 만들어볼까요?"
    return "지금 당장 2~5분 안에 할 수 있는 행동 1개를 정해서 실행해볼까요?"


def _normalize_cbt_phase(raw: str | None) -> str | None:
    if not raw:
        return None
    phase = str(raw).strip().upper()
    return phase if phase in CBT_PHASES else None


def _infer_cbt_phase(
    user_message: str,
    conversation_history: list[dict[str, str]] | None,
    requested_phase: str | None,
    active_challenge: str | None,
) -> str:
    req = _normalize_cbt_phase(requested_phase)
    if req:
        return req
    if active_challenge:
        return "ACTION"

    text = user_message.lower()
    history_len = len(conversation_history or [])

    if any(k in text for k in ["실천", "행동", "해볼", "계획", "지금 할 수", "action"]):
        return "ACTION"
    if any(k in text for k in ["재해석", "다르게 보기", "대안 생각", "reframe"]):
        return "REFRAME"
    if any(k in text for k in ["왜곡", "흑백", "과장", "단정", "catastroph", "distortion"]):
        return "DISTORTION"
    if any(k in text for k in ["생각", "자동사고", "믿음", "thought"]):
        return "THOUGHT"
    if any(k in text for k in ["상황", "사건", "언제", "어디서", "situation"]):
        return "SITUATION"
    if history_len <= 2:
        return "EMOTION"
    return "THOUGHT"


def _phase_instruction(phase: str) -> str:
    mapping = {
        "EMOTION": "현재 단계는 EMOTION이다. 감정 이름/강도(0~10)를 묻는 질문 1~2개만 제시하라.",
        "SITUATION": "현재 단계는 SITUATION이다. 최근 사건 맥락을 구체화하는 질문 1~2개만 제시하라.",
        "THOUGHT": "현재 단계는 THOUGHT다. 자동사고를 1문장으로 포착하도록 질문 1~2개만 제시하라.",
        "DISTORTION": "현재 단계는 DISTORTION이다. 사고 오류(과장/흑백/독심추론 등) 확인 질문 1~2개만 제시하라.",
        "REFRAME": "현재 단계는 REFRAME이다. 균형잡힌 대안 생각 1개를 만들게 유도하라.",
        "ACTION": "현재 단계는 ACTION이다. 오늘 실행 가능한 작은 행동 1개를 합의하게 하라.",
    }
    return mapping.get(phase, mapping["THOUGHT"])


def _next_phase(phase: str) -> str:
    try:
        idx = PHASE_ORDER.index(phase)
    except ValueError:
        return "THOUGHT"
    return PHASE_ORDER[min(idx + 1, len(PHASE_ORDER) - 1)]


def _safe_int(value: Any, default: int, low: int, high: int) -> int:
    try:
        return int(max(low, min(high, int(value))))
    except Exception:
        return default


def _rule_based_distortion_candidates(user_message: str) -> list[str]:
    text = user_message.lower()
    picked: list[str] = []

    def add(name: str) -> None:
        if name in DISTORTION_NAMES and name not in picked:
            picked.append(name)

    if any(k in text for k in ["없어도 상관", "가치없", "쓸모없", "의미없", "필요없"]):
        add("labeling_negative_identity")
        add("overgeneralization")
    if any(k in text for k in ["분명", "일 거야", "뻔해", "틀림없", "사람들이 날", "그들이"]):
        add("mind_reading")
    if any(k in text for k in ["망했", "끝", "큰일", "최악"]):
        add("catastrophizing")
    if any(k in text for k in ["항상", "절대", "전부", "완전히"]):
        add("all_or_nothing")
        add("overgeneralization")
    if any(k in text for k in ["해야만", "절대 해야", "반드시 해야"]):
        add("should_statements")
    if any(k in text for k in ["내가 다 잘못", "내 책임", "나 때문"]):
        add("personalization_overresponsibility")
    if any(k in text for k in ["느낌이 사실", "기분이 곧 사실", "불안해서 사실 같아", "불안하니까 진짜"]):
        add("emotional_reasoning")

    return picked[:2]


def _build_rule_thought_web(
    user_message: str,
    *,
    distress_0_10: int,
    rumination_0_10: int,
    distortions: list[str] | None = None,
    distortion_counts: dict[str, int] | None = None,
    cbt_phase: str | None,
) -> dict[str, Any]:
    text = user_message.strip().replace("\n", " ")
    low = text.lower()
    thought = text[:160] or "지금 떠오르는 자동사고가 선명하지 않습니다."
    if "“" in text or "\"" in text:
        thought = text[:160]

    emotion_label = "불안" if any(k in low for k in ["불안", "초조", "숨막"]) else ("무기력" if any(k in low for k in ["무기력", "텅 빈", "하기 싫"]) else "속상함")
    distortion_counts = distortion_counts or {}
    distortions = distortions or []
    if rumination_0_10 >= 7:
        style = "past_regret"
    elif distress_0_10 >= 7 and (
        int(distortion_counts.get("catastrophizing_count", 0)) >= 1
        or int(distortion_counts.get("mind_reading_count", 0)) >= 1
    ):
        style = "future_worry"
    elif "labeling_negative_identity" in distortions:
        style = "self_critical"
    elif int(distortion_counts.get("should_statements_count", 0)) >= 1:
        style = "control_fixation"
    elif int(distortion_counts.get("personalization_count", 0)) >= 1:
        style = "over_responsibility"
    elif any(k in low for k in ["나는", "난 ", "가치없", "쓸모없", "무능"]):
        style = "self_critical"
    elif any(k in low for k in ["통제", "완벽", "다 해야"]):
        style = "control_fixation"
    elif any(k in low for k in ["내 탓", "내 책임", "나 때문"]):
        style = "over_responsibility"
    else:
        style = "future_worry"

    sensation: list[str] = []
    if any(k in low for k in ["숨막", "답답"]):
        sensation.append("가슴 답답함")
    if any(k in low for k in ["심장", "두근"]):
        sensation.append("심장 두근거림")

    return {
        "situation": "최근 반복되는 일상 상황에서 감정 반응이 커진 장면이 있습니다.",
        "thought": thought,
        "emotion": [{"label": emotion_label, "intensity_0_10": max(3, min(10, distress_0_10))}],
        "sensation": sensation[:2],
        "intermediate_belief": "잘해야만 가치가 있다는 규칙이 작동했을 가능성이 있다.",
        "core_belief": "나는 충분하지 않다는 믿음이 스쳐갔을 가능성이 있다.",
        "core_experience_hint": "비슷한 평가/비교 경험이 반복되며 연결됐을 가능성이 있다.",
        "cognitive_style": style,
        "practice_point": "오늘은 떠오른 생각과 확인된 사실을 한 줄씩 분리해 적어보기.",
    }


def _normalize_thought_web(raw: Any, user_message: str, extracted: dict[str, Any], cbt_phase: str | None) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return _build_rule_thought_web(
            user_message,
            distress_0_10=int(extracted.get("distress_0_10", 5) or 5),
            rumination_0_10=int(extracted.get("rumination_0_10", 4) or 4),
            distortions=list(extracted.get("distortions", []) or []),
            distortion_counts=dict(extracted.get("distortion", {}) or {}),
            cbt_phase=cbt_phase,
        )

    rule = _build_rule_thought_web(
        user_message,
        distress_0_10=int(extracted.get("distress_0_10", 5) or 5),
        rumination_0_10=int(extracted.get("rumination_0_10", 4) or 4),
        distortions=list(extracted.get("distortions", []) or []),
        distortion_counts=dict(extracted.get("distortion", {}) or {}),
        cbt_phase=cbt_phase,
    )
    out = dict(rule)
    out["situation"] = str(raw.get("situation", rule["situation"])).strip()[:220] or rule["situation"]
    out["thought"] = str(raw.get("thought", rule["thought"])).strip()[:220] or rule["thought"]
    out["intermediate_belief"] = str(raw.get("intermediate_belief", rule["intermediate_belief"])).strip()[:220] or rule["intermediate_belief"]
    out["core_belief"] = str(raw.get("core_belief", rule["core_belief"])).strip()[:220] or rule["core_belief"]
    hint_raw = raw.get("core_experience_hint", rule["core_experience_hint"])
    out["core_experience_hint"] = (str(hint_raw).strip()[:220] if hint_raw else None) or None

    style = str(raw.get("cognitive_style", rule["cognitive_style"])).strip()
    out["cognitive_style"] = style if style in COGNITIVE_STYLES else rule["cognitive_style"]
    out["practice_point"] = str(raw.get("practice_point", rule["practice_point"])).strip()[:220] or rule["practice_point"]

    emotions: list[dict[str, Any]] = []
    for item in (raw.get("emotion") or [])[:2]:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label", "")).strip()[:24]
        inten = _safe_int(item.get("intensity_0_10", 5), 5, 0, 10)
        if label:
            emotions.append({"label": label, "intensity_0_10": inten})
    if not emotions:
        emotions = rule["emotion"]
    out["emotion"] = emotions

    sensations = [str(x).strip()[:24] for x in (raw.get("sensation") or []) if str(x).strip()]
    out["sensation"] = sensations[:2]
    return out


def _ensure_distortion_integrity(user_message: str, extracted: dict[str, Any]) -> dict[str, Any]:
    text = user_message.lower()
    distortion = extracted.get("distortion", {})
    if not isinstance(distortion, dict):
        distortion = {}
    counts: dict[str, int] = {}
    for key in DISTORTION_KEYS:
        counts[key] = _safe_int(distortion.get(key, 0), 0, 0, 20)

    chosen = _normalize_distortions(extracted.get("distortions"), user_message, counts)
    if not chosen:
        chosen = _rule_based_distortion_candidates(user_message)
    if not chosen:
        chosen = ["overgeneralization"]
    chosen = chosen[:2]

    for name in chosen:
        count_key = DISTORTION_TO_COUNT_KEY.get(name)
        if count_key:
            counts[count_key] = max(1, counts.get(count_key, 0))
        elif name == "labeling_negative_identity":
            # 낙인은 카운트 키가 없으므로 근접 카운트(과잉일반화/흑백사고)로 보수 매핑.
            fallback_key = "all_or_nothing_count" if any(k in text for k in ["항상", "절대", "전부"]) else "overgeneralization_count"
            counts[fallback_key] = max(1, counts.get(fallback_key, 0))

    if not any(v >= 1 for v in counts.values()):
        counts["overgeneralization_count"] = 1

    extracted["distortion"] = counts
    extracted["distortions"] = chosen
    return extracted


def _normalize_distortions(raw: Any, user_message: str, distortion_counts: dict[str, int]) -> list[str]:
    out: list[str] = []
    if isinstance(raw, list):
        for item in raw:
            name = str(item).strip()
            if name in DISTORTION_NAMES and name not in out:
                out.append(name)
    if out:
        return out[:2]

    mapped = _rule_based_distortion_candidates(user_message)
    if mapped:
        return mapped

    # Backup from extracted count-like keys
    count_map = {
        "overgeneralization": distortion_counts.get("overgeneralization_count", 0),
        "mind_reading": distortion_counts.get("mind_reading_count", 0),
        "all_or_nothing": distortion_counts.get("all_or_nothing_count", 0),
        "catastrophizing": distortion_counts.get("catastrophizing_count", 0),
        "should_statements": distortion_counts.get("should_statements_count", 0),
        "personalization_overresponsibility": distortion_counts.get("personalization_count", 0),
    }
    sorted_items = sorted(count_map.items(), key=lambda x: x[1], reverse=True)
    for name, val in sorted_items:
        if val > 0 and name not in out:
            out.append(name)
        if len(out) >= 2:
            break
    return out[:2]


def _normalize_challenge_ids(raw: Any, candidates: list[str]) -> list[str]:
    allowed = [c.strip() for c in candidates if isinstance(c, str) and c.strip() and c.strip() in CHALLENGE_CATALOG_IDS]
    if not allowed:
        return []
    allowed_set = set(allowed)
    out: list[str] = []
    if isinstance(raw, list):
        for item in raw:
            cid = str(item).strip()
            if cid in allowed_set and cid not in out:
                out.append(cid)
    return out


def _fallback_heuristic(
    user_message: str,
    active_challenge: str | None = None,
    challenge_phase: str | None = None,
    cbt_phase: str | None = None,
    moderate_plus: bool = False,
    finish_candidate: bool = False,
    thought_web_mode: bool = False,
    challenge_candidates: list[str] | None = None,
    conversation_history: list[dict[str, str]] | None = None,
    crisis_mode: bool = False,
    crisis_level: str = "none",
    crisis_stage: str | None = None,
) -> CBTLLMResult:
    text = user_message.lower()
    extracted = _default_extracted()
    summary_card = _default_summary_card(user_message)

    keyword_map = {
        "catastrophizing_count": ["망", "끝", "큰일", "catastroph", "worst"],
        "all_or_nothing_count": ["항상", "절대", "무조건", "all or nothing"],
        "mind_reading_count": ["분명", "날 싫어", "속으로", "mind reading"],
        "should_statements_count": ["해야", "했어야", "반드시", "should"],
        "personalization_count": ["내 탓", "나 때문", "personal"],
        "overgeneralization_count": ["맨날", "매번", "늘", "overgeneral"],
    }

    for key, words in keyword_map.items():
        hits = sum(1 for w in words if w in text)
        extracted["distortion"][key] = min(5, hits)

    if any(k in text for k in ["잠", "불면", "sleep", "wake"]):
        extracted["sleep_difficulty_0_10"] = 7
    if any(k in text for k in ["불안", "anx", "걱정"]):
        extracted["distress_0_10"] = 7
    if any(k in text for k in ["생각", "반복", "rumination"]):
        extracted["rumination_0_10"] = 7
    if any(k in text for k in ["회피", "피하", "avoid"]):
        extracted["avoidance_0_10"] = 7
    extracted["distortions"] = _normalize_distortions([], user_message, extracted["distortion"])
    extracted = _ensure_distortion_integrity(user_message, extracted)
    if thought_web_mode:
        extracted["thought_web"] = _build_rule_thought_web(
            user_message,
            distress_0_10=int(extracted.get("distress_0_10", 5) or 5),
            rumination_0_10=int(extracted.get("rumination_0_10", 4) or 4),
            distortions=list(extracted.get("distortions", []) or []),
            distortion_counts=dict(extracted.get("distortion", {}) or {}),
            cbt_phase=cbt_phase,
        )

    default_challenges = ["WEEKLY_MINI_CHALLENGE"]
    candidate_ids = [c.strip() for c in (challenge_candidates or []) if c and c.strip() and c.strip() in CHALLENGE_CATALOG_IDS]
    challenges = candidate_ids[:2] if candidate_ids else default_challenges

    challenge_completed = bool(active_challenge and any(hint in text for hint in COMPLETION_HINTS))
    completion_message = "챌린지 수행을 완료하였습니다." if challenge_completed else None
    resolved_phase = _infer_cbt_phase(
        user_message=user_message,
        conversation_history=conversation_history,
        requested_phase=cbt_phase,
        active_challenge=active_challenge,
    )

    if crisis_mode:
        stage = (crisis_stage or "A").upper()
        if stage == "B":
            reply = (
                "도움 연결을 시작한 건 정말 중요한 선택이었어요.\n"
                "지금은 문을 열어두고, 위험 물건을 멀리 두고, 4초 들숨-6초 날숨을 3번만 해보세요.\n"
                "지금 혼자 계신가요, 아니면 누가 곁에 있나요?"
            )
            actions = [
                "문 열어두고 현관 근처에서 대기하기",
                "위험 물건/약/날카로운 물건 치우기",
                "4초 들숨 6초 날숨 3회",
            ]
        elif stage == "C":
            reply = (
                "안전이 조금 확보된 점이 가장 중요해요.\n"
                "다음 1~2시간은 혼자 있지 않고, 곁에 있을 사람 1명을 정해 함께 있어 주세요.\n"
                "응급실/상담에서 말할 핵심 문장 1개를 준비하면 도움이 됩니다."
            )
            actions = [
                "다음 1~2시간은 혼자 있지 않기",
                "연락할 사람 1명에게 상태 공유하기",
                "응급실/상담에서 말할 핵심 문장 준비하기",
            ]
        else:
            reply = (
                "지금은 안전이 최우선이에요.\n"
                "지금 바로 119/112 또는 1393, 1588-9191, 1577-0199에 연락해 주세요.\n"
                "확인할게요. 지금 혼자 계신가요? 이미 해를 끼칠 수 있는 방법이나 물건을 준비하셨나요?\n"
                "가능하면 문을 열어두고 가까운 사람에게 '지금 위험해, 도와줘'라고 보내주세요."
            )
            actions = [
                "119 또는 112 즉시 연락",
                "1393 / 1588-9191 / 1577-0199 상담 연결",
                "가까운 사람에게 즉시 위험 메시지 전송",
            ]
        extracted.update(
            {
                "suicide_risk_flag": True,
                "intent_level": "active" if crisis_level == "high" else "passive",
                "plan_means_flag": True if crisis_level == "high" else False,
                "crisis_lock_remaining": 3,
                "crisis_stage": stage if stage in {"A", "B", "C"} else "A",
            }
        )
        return CBTLLMResult(
            reply=reply,
            extracted=extracted,
            suggested_challenges=[],
            summary_card=summary_card,
            active_challenge=None,
            challenge_step_prompt="지금은 분석보다 안전 확보를 우선하고, 1393 또는 119에 연결해주세요.",
            cbt_phase="EMOTION",
            next_phase="EMOTION",
            challenge_rationale=None,
            crisis_mode=True,
            crisis_level=crisis_level,
            crisis_stage=stage if stage in {"A", "B", "C"} else "A",
            crisis_actions=actions,
        )

    if active_challenge:
        phase = challenge_phase or "continue"
        last_assistant = _last_assistant_message(conversation_history)
        reply_candidates = [
            f"좋아요. 지금은 '{active_challenge}'를 함께 진행하고 있어요. 상황을 사실, 생각, 감정으로 나눠 한 줄씩 적어볼까요?",
            f"좋습니다. '{active_challenge}'를 이어가볼게요. 방금 상황에서 사실로 확인되는 내용부터 한 문장으로 적어주세요.",
            f"계속 잘 따라오고 있어요. '{active_challenge}' 단계에서 지금 떠오른 자동사고를 한 줄로 적어볼까요?",
        ]
        reply = _pick_non_repetitive_reply(reply_candidates, last_assistant)
        step = "1) 사실 2) 떠오른 생각 3) 감정강도(0~10)를 순서대로 적어주세요."
        if phase == "reflect":
            step = "오늘 챌린지 전후 감정강도 변화와 배운 점을 2줄로 정리해주세요."
        if challenge_completed:
            step = "좋아요. 완료한 내용을 바탕으로 다음에 다시 쓸 수 있는 한 줄 요약을 적어주세요."
            reply = (
                f"'{active_challenge}'를 잘 마무리했어요. "
                "이 경험을 생활에서 이어갈 수 있도록 핵심을 함께 정리해볼게요."
            )

        return CBTLLMResult(
            reply=reply,
            extracted=extracted,
            suggested_challenges=challenges,
            summary_card=summary_card,
            active_challenge=active_challenge,
            challenge_step_prompt=step,
            challenge_completed=challenge_completed,
            completed_challenge=active_challenge if challenge_completed else None,
            completion_message=completion_message,
            cbt_phase=resolved_phase,
            next_phase=_next_phase(resolved_phase),
            challenge_rationale="지금 단계에서 가장 부담이 적은 한 가지 행동부터 시작하도록 선택했습니다." if candidate_ids else None,
        )

    if _should_defer_challenge(user_message, conversation_history):
        last_assistant = _last_assistant_message(conversation_history)
        reply = _pick_non_repetitive_reply(
            [
                "좋아요. 오늘 있었던 일을 천천히 정리해볼게요. 먼저 무슨 일이 있었는지 알려주세요.",
                "지금 감정을 만든 사건을 먼저 짧게 적어주세요. 그다음 생각의 흐름을 같이 보겠습니다.",
                "괜찮아요. 해결을 서두르지 않고, 사건-감정-생각 순서로 차근차근 정리해보죠.",
            ],
            last_assistant,
        )
        return CBTLLMResult(
            reply=reply,
            extracted=extracted,
            suggested_challenges=[],
            summary_card=summary_card,
            active_challenge=None,
            challenge_step_prompt="먼저 사건-감정-생각 흐름을 2~3문장으로 적어주세요. 충분히 파악한 뒤 맞춤 챌린지를 추천할게요.",
            cbt_phase=resolved_phase,
        )

    last_assistant = _last_assistant_message(conversation_history)
    reply = _pick_non_repetitive_reply(
        [
            "이야기를 잘 정리해주셨어요. 지금 상태에 맞는 생각 정리 도구를 골라 함께 진행해볼게요.",
            "충분히 맥락을 확인했습니다. 지금부터는 맞춤 생각 정리 단계를 함께 해보겠습니다.",
            "좋습니다. 현재 상태를 반영해 바로 실천 가능한 생각 정리 도구를 제안해드릴게요.",
        ],
        last_assistant,
    )
    step = "아래 추천 챌린지 중 하나를 선택하면 단계별로 같이 진행합니다."
    if moderate_plus:
        reply = (
            f"'{user_message[:24]}'처럼 느껴지는 순간이 반복되면 정말 지치죠. "
            "지금 떠오른 생각과 확인된 사실을 한 줄씩 나눠보면 부담이 조금 줄 수 있어요. "
            "혹시 과잉일반화나 자기낙인이 섞였는지 가볍게 점검해볼 수 있어요. "
            "지금은 2분만 천천히 호흡하고 어깨 힘을 풀어볼까요? "
            "지금 머릿속에서 제일 크게 들리는 문장을 하나만 적어줄래요?"
        )
    if finish_candidate:
        practice_point = (
            extracted.get("thought_web", {}) or {}
        ).get("practice_point", "오늘은 떠오른 생각과 사실을 한 줄씩 분리해보기.")
        quoted = user_message.strip().replace("\n", " ")[:28] or "방금 말한 생각"
        reply = (
            f"'{quoted}'라는 표현에서 지친 감정과 스스로를 낮추는 생각이 같이 보였어요.\n"
            "조금 더 균형 잡아 보면, 지금 힘든 상태가 곧 나의 전체 가치라는 뜻은 아니에요.\n"
            f"{practice_point}\n"
            "원하면 지금 바로 챌린지로 시작하고, 아니면 나중에 이어가도 괜찮아요."
        )
    return CBTLLMResult(
        reply=reply,
        extracted=extracted,
        suggested_challenges=challenges,
        summary_card=summary_card,
        active_challenge=None,
        challenge_step_prompt=step,
        cbt_phase=resolved_phase,
        next_phase=_next_phase(resolved_phase),
        challenge_rationale="현재 상태에서 실패 확률이 낮은 짧은 행동부터 시작하면 반추 고리를 끊는 데 도움이 됩니다." if candidate_ids else None,
    )


def _normalize_extracted(payload: dict[str, Any], user_message: str, cbt_phase: str | None = None, thought_web_mode: bool = False) -> dict[str, Any]:
    out = _default_extracted()
    for key in ["distress_0_10", "rumination_0_10", "avoidance_0_10", "sleep_difficulty_0_10"]:
        v = payload.get(key, out[key])
        out[key] = _safe_int(v, int(out[key]), 0, 10)

    distortion = payload.get("distortion", {})
    for key in DISTORTION_KEYS:
        v = distortion.get(key, 0)
        out["distortion"][key] = _safe_int(v, 0, 0, 20)
    out["distortions"] = _normalize_distortions(payload.get("distortions"), user_message, out["distortion"])
    out = _ensure_distortion_integrity(user_message, out)
    if thought_web_mode:
        out["thought_web"] = _normalize_thought_web(payload.get("thought_web"), user_message, out, cbt_phase)
    else:
        out["thought_web"] = None
    return out


def _extract_json_block(text: str) -> dict[str, Any] | None:
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return None
    raw = match.group(0)
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        return None
    return None


def _normalize_summary_card(payload: dict[str, Any], user_message: str) -> dict[str, str]:
    default = _default_summary_card(user_message)
    out: dict[str, str] = {}
    for key in ["situation", "self_blame_signal", "reframe", "next_action", "encouragement"]:
        raw = payload.get(key, default[key])
        text = str(raw).strip()
        if not text:
            text = default[key]
        out[key] = text[:280]
    return out


def generate_cbt_reply(
    user_message: str,
    active_challenge: str | None = None,
    challenge_phase: str | None = None,
    cbt_phase: str | None = None,
    safety_addendum: str | None = None,
    moderate_plus: bool = False,
    finish_candidate: bool = False,
    thought_web_mode: bool = False,
    challenge_candidates: list[str] | None = None,
    conversation_history: list[dict[str, str]] | None = None,
    crisis_mode: bool = False,
    crisis_level: str = "none",
    crisis_stage: str | None = None,
) -> CBTLLMResult:
    resolved_phase = _infer_cbt_phase(
        user_message=user_message,
        conversation_history=conversation_history,
        requested_phase=cbt_phase,
        active_challenge=active_challenge,
    )
    if crisis_mode:
        return _fallback_heuristic(
            user_message,
            active_challenge=active_challenge,
            challenge_phase=challenge_phase,
            cbt_phase=resolved_phase,
            moderate_plus=moderate_plus,
            finish_candidate=finish_candidate,
            thought_web_mode=thought_web_mode,
            challenge_candidates=challenge_candidates,
            conversation_history=conversation_history,
            crisis_mode=True,
            crisis_level=crisis_level,
            crisis_stage=crisis_stage,
        )

    if not settings.openai_api_key or OpenAI is None:
        return _fallback_heuristic(
            user_message,
            active_challenge=active_challenge,
            challenge_phase=challenge_phase,
            cbt_phase=resolved_phase,
            moderate_plus=moderate_plus,
            finish_candidate=finish_candidate,
            thought_web_mode=thought_web_mode,
            challenge_candidates=challenge_candidates,
            conversation_history=conversation_history,
            crisis_mode=False,
            crisis_level="none",
            crisis_stage=None,
        )

    client = OpenAI(api_key=settings.openai_api_key)

    challenge_instruction = ""
    if active_challenge:
        challenge_instruction = (
            f"The user selected challenge: '{active_challenge}'. "
            "Run it as a step-by-step guided CBT exercise in conversation. "
            "Ask one concrete step at a time, wait for the user answer, then continue. "
            "If the user indicates completion, set challenge_completed true and fill completed_challenge. "
            "Provide challenge_step_prompt for the next action."
        )

    moderate_addendum = ""
    if moderate_plus:
        moderate_addendum = (
            "[MODERATE+ MODE] "
            "아래 5블록을 매 턴 반드시 지켜라. "
            "1) 감정 반영 1~2문장(매뉴얼 문구 반복/과한 미사여구 금지) "
            "2) 생각(해석) vs 사실을 한 문장으로 분리 "
            "3) 인지왜곡 가능성 1~2개를 가설로 제시(단정/진단 금지) + extracted.distortions에도 동일 반영 "
            "4) 지금 가능한 2~5분 안정 행동 1개 "
            "5) 질문은 정확히 1개(다음 단계 연결). "
            "사용자 핵심 문장을 짧게 인용하고, 조언은 1~2개로 제한하라."
        )
    finish_addendum = ""
    if finish_candidate:
        finish_addendum = (
            "[FINISH MODE] "
            "이 턴은 대화를 마무리하는 턴이다. reply는 반드시 4블록으로 작성하라: "
            "1) 1문장 요약(감정+핵심생각, 사용자 표현 짧은 인용 포함) "
            "2) 현실적인 대안 생각 1문장 "
            "3) 오늘 가능한 아주 작은 행동 1개(2~10분) "
            "4) 챌린지 제안 + 선택지(지금 시작/나중에). "
            "질문은 1개 이하, 강요 금지, 조언은 1~2개로 제한. "
            "suggested_challenges는 challenge_candidates에서 1~2개만 선택해 반드시 채워라."
        )
    thought_web_addendum = ""
    if thought_web_mode:
        thought_web_addendum = (
            "[THOUGHT WEB MODE] "
            "automatic_thought가 드러나면 extracted.thought_web를 반드시 생성하라. "
            "keys: situation, thought, emotion(1~2 with intensity_0_10), sensation(0~2), "
            "intermediate_belief, core_belief, core_experience_hint(null 허용), "
            "cognitive_style(past_regret/future_worry/self_critical/control_fixation/over_responsibility), "
            "practice_point(오늘 연습 1줄). "
            "reply에는 intermediate/core_belief를 단정적으로 말하지 말고 가능성으로만 부드럽게 다뤄라."
        )
    candidate_text = ", ".join(challenge_candidates or [])
    crisis_addendum = ""
    if crisis_mode:
        if (crisis_stage or "A").upper() == "B":
            crisis_addendum = (
                "[CRISIS MODE - STAGE B BRIDGE] "
                "전화/연결 진행을 인정하고 대기 행동 2~3개만 짧게 제시하라. "
                "번호 리스트(119/112/1393/1588-9191/1577-0199) 출력 금지. "
                "확인 질문은 정확히 1개만 허용."
            )
        elif (crisis_stage or "A").upper() == "C":
            crisis_addendum = (
                "[CRISIS MODE - STAGE C AFTERCARE] "
                "안전 확인 + 1~2시간 단기 계획(혼자 있지 않기/의료진에게 그대로 말하기/연락할 사람 1명 정하기)을 제시하라. "
                "번호 리스트 출력 금지. CBT 분석 재개 금지(사용자 명시 요청 전까지)."
            )
        else:
            crisis_addendum = (
                "[CRISIS MODE - STAGE A CONNECT] "
                "안전 확보 최우선. 도움 연결 안내(119/112/1393/1588-9191/1577-0199), "
                "직접 위험 질문 1~2개, 즉시 행동 1개를 제시."
            )

    system_prompt = (
        "너는 CBT(인지행동치료) 기반의 전문 심리상담 파트너다. "
        "톤은 따뜻하지만 임상적으로 구조화되어야 하며, 감정 반영-사실 확인-사고 탐색-재구성-행동계획 순서를 유지한다. "
        "절대 진단명 확정, 약물 처방, 의학적 단정 표현을 하지 않는다. "
        "사용자를 비난하거나 훈계하지 말고, 수치심/자기비난을 낮추는 언어를 사용한다. "
        "한국어로 답하고, 짧고 명확한 문장을 사용한다. "
        "같은 시작 문장을 반복하지 말고, 직전 assistant 문장을 그대로 재사용하지 않는다. "
        "매 턴에는 반드시 사용자 최신 발화에 맞춘 구체 질문 1개를 포함한다. "
        "질문은 포괄형 대신 관찰 가능한 사실/감정/자동사고를 묻는 CBT형 질문만 사용한다. "
        "문제 해결을 서두르지 말고, 정보가 부족하면 탐색 질문을 먼저 한다. "
        "사용자가 자책하면 먼저 정상화(normalization) 후 사실과 해석을 분리하도록 돕는다. "
        "응답은 반드시 엄격한 JSON으로만 반환한다. "
        "JSON keys: reply, extracted, suggested_challenges, challenge_rationale, summary_card, active_challenge, challenge_step_prompt, challenge_completed, completed_challenge, completion_message, cbt_phase, next_phase. "
        "extracted must include integer distress_0_10, rumination_0_10, avoidance_0_10, sleep_difficulty_0_10 in range 0..10, "
        "and distortion object with all_or_nothing_count, catastrophizing_count, mind_reading_count, "
        "should_statements_count, personalization_count, overgeneralization_count. "
        "If THOUGHT WEB MODE is on, extracted must also include thought_web object with required keys. "
        "extracted.distortions must always contain 1 or 2 items from: "
        "overgeneralization, mind_reading, all_or_nothing, catastrophizing, should_statements, "
        "personalization_overresponsibility, emotional_reasoning, labeling_negative_identity. "
        "At least one distortion count must be >= 1 and aligned with extracted.distortions. "
        "summary_card must include 5 keys: situation, self_blame_signal, reframe, next_action, encouragement. "
        "reframe은 비난 없이 균형적 사고를 제시하고, next_action은 오늘 바로 가능한 1개 행동으로 작성한다. "
        "When challenges are relevant, suggested_challenges must be 1 or 2 IDs only from the fixed catalog IDs. "
        "challenge_completed must be true only when there is clear textual evidence of completion. "
        "When challenge_completed is true, completion_message should be '챌린지 수행을 완료하였습니다.'. "
        "If challenge_candidates are provided, suggested_challenges must choose from those IDs only. "
        "challenge_rationale은 1문장으로 간결하게 작성한다. "
        f"Current CBT phase is {resolved_phase}. {_phase_instruction(resolved_phase)} "
        f"{(safety_addendum or '').strip()} "
        f"{crisis_addendum if crisis_mode else ''} "
        f"{moderate_addendum} "
        f"{finish_addendum} "
        f"{thought_web_addendum} "
        f"challenge_candidates={candidate_text}. "
        f"{challenge_instruction}"
    )

    messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for turn in (conversation_history or [])[-12:]:
        role = turn.get("role", "user")
        if role not in {"user", "assistant"}:
            continue
        content = str(turn.get("content", "")).strip()
        if content:
            messages.append({"role": role, "content": content[:1200]})

    challenge_meta = ""
    if active_challenge:
        challenge_meta = f"[active_challenge={active_challenge}, phase={challenge_phase or 'continue'}]\n"

    messages.append({"role": "user", "content": f"{challenge_meta}{user_message}"})

    fallback = _fallback_heuristic(
        user_message,
        active_challenge=active_challenge,
        challenge_phase=challenge_phase,
        cbt_phase=resolved_phase,
        moderate_plus=moderate_plus,
        finish_candidate=finish_candidate,
        thought_web_mode=thought_web_mode,
        challenge_candidates=challenge_candidates,
            conversation_history=conversation_history,
            crisis_mode=False,
            crisis_level="none",
            crisis_stage=None,
        )
    try:
        response = client.responses.create(
            model=settings.openai_model,
            input=messages,
            temperature=0.4,
        )
        text = response.output_text if hasattr(response, "output_text") else ""
    except Exception:
        return fallback

    parsed = _extract_json_block(text)
    if not parsed:
        partial_reply = (text or "").strip()[:1500] or fallback.reply
        return CBTLLMResult(
            reply=partial_reply,
            extracted=fallback.extracted,
            suggested_challenges=fallback.suggested_challenges,
            summary_card=fallback.summary_card,
            active_challenge=fallback.active_challenge,
            challenge_step_prompt=fallback.challenge_step_prompt,
            challenge_completed=False,
            completed_challenge=None,
            completion_message=None,
            cbt_phase=resolved_phase,
            next_phase=_next_phase(resolved_phase),
            challenge_rationale=fallback.challenge_rationale,
        )

    reply = str(parsed.get("reply", "")).strip()[:1500] or ((text or "").strip()[:1500] or fallback.reply)
    last_assistant = _last_assistant_message(conversation_history)
    if _is_repetitive_against_last(reply, last_assistant):
        reply = _phase_followup_prompt(resolved_phase, user_message)
    try:
        extracted = _normalize_extracted(
            parsed.get("extracted", {}),
            user_message,
            cbt_phase=resolved_phase,
            thought_web_mode=thought_web_mode,
        )
    except Exception:
        extracted = fallback.extracted
    try:
        summary_card = _normalize_summary_card(parsed.get("summary_card", {}), user_message)
    except Exception:
        summary_card = fallback.summary_card

    candidate_ids = [c.strip() for c in (challenge_candidates or []) if c and c.strip()]
    if candidate_ids:
        challenges = _normalize_challenge_ids(parsed.get("suggested_challenges", []), candidate_ids)
        if not challenges and (resolved_phase == "ACTION" or moderate_plus or finish_candidate):
            challenges = candidate_ids[:2] or fallback.suggested_challenges[:1]
    else:
        challenges_raw = parsed.get("suggested_challenges", [])
        challenges = [str(x).strip()[:120] for x in challenges_raw if str(x).strip() in CHALLENGE_CATALOG_IDS][:2]
        if len(challenges) < 1 and fallback.suggested_challenges:
            challenges = fallback.suggested_challenges[:2]

    selected = parsed.get("active_challenge", active_challenge)
    selected_str = str(selected).strip()[:160] if selected else active_challenge
    step_prompt = str(parsed.get("challenge_step_prompt", "")).strip()[:300] or fallback.challenge_step_prompt

    challenge_completed = bool(parsed.get("challenge_completed", False))
    completed_raw = parsed.get("completed_challenge", selected_str if challenge_completed else None)
    completed_challenge = str(completed_raw).strip()[:160] if completed_raw else None
    completion_message = str(parsed.get("completion_message", "")).strip()[:200] or None
    if challenge_completed and not completion_message:
        completion_message = "챌린지 수행을 완료하였습니다."
    challenge_rationale = str(parsed.get("challenge_rationale", "")).strip()[:220] or fallback.challenge_rationale
    resolved_phase = _normalize_cbt_phase(parsed.get("cbt_phase")) or resolved_phase
    next_phase = _normalize_cbt_phase(parsed.get("next_phase")) or _next_phase(resolved_phase)

    if not active_challenge and _should_defer_challenge(user_message, conversation_history):
        challenges = []
        if not step_prompt:
            step_prompt = "먼저 사건-감정-생각 흐름을 조금 더 들려주세요. 이후 맞춤 챌린지를 추천할게요."
    if (resolved_phase == "ACTION" or moderate_plus or finish_candidate) and not challenges:
        challenges = candidate_ids[:1] if candidate_ids else (fallback.suggested_challenges[:1] or [])
    if not challenge_rationale and challenges:
        challenge_rationale = "지금 상태에서 가장 부담이 적고 바로 실행 가능한 행동이라서 선택했습니다."

    return CBTLLMResult(
        reply=reply,
        extracted=extracted,
        suggested_challenges=challenges,
        summary_card=summary_card,
        active_challenge=selected_str,
        challenge_step_prompt=step_prompt,
        challenge_completed=challenge_completed,
        completed_challenge=completed_challenge,
        completion_message=completion_message,
        cbt_phase=resolved_phase,
        next_phase=next_phase,
        challenge_rationale=challenge_rationale,
    )



def summarize_clinical_narrative(
    *,
    user_messages: list[str],
    score_summary: dict[str, Any],
    behavior_summary: dict[str, Any],
    thought_pattern_hint: str,
    intervention_hint: str,
) -> dict[str, str]:
    fallback = {
        'situation_context': '일상 사건 부담이 반복되는 양상이 나타난다.',
        'emotion_summary': '복합 정서 반응이 이어지는 양상이 나타난다.',
        'cognitive_pattern': thought_pattern_hint or '인지왜곡이 동반되는 사고 흐름 양상이 나타난다.',
        'intervention_summary': intervention_hint or '교정 활동 수행 양상이 나타난다.',
        'overall_impression': '사건-감정-사고 흐름의 변동 양상이 나타난다.',
    }

    if not settings.openai_api_key or OpenAI is None:
        return fallback

    client = OpenAI(api_key=settings.openai_api_key)

    clipped_msgs = [m.strip().replace("\n", " ")[:240] for m in user_messages if m.strip()][:24]
    user_blob = "\n".join(f"- {m}" for m in clipped_msgs) if clipped_msgs else "- 대화 기록이 부족하다."

    prompt = (
        "아래 상담 대화 및 지표를 바탕으로 의사용 참고 서술을 JSON으로 요약하라. "
        "반드시 '-다' 어조의 한국어 문장으로 작성하고, 원문을 그대로 복사하지 말고 정제하라. "
        "진단/판단/권고 표현은 금지하고, 주요 대화를 짧게 인용한 뒤 관찰된 양상만 기술하라. "
        "JSON keys: situation_context, emotion_summary, cognitive_pattern, intervention_summary, overall_impression.\n\n"
        f"대화요약원문:\n{user_blob}\n\n"
        f"점수요약: {score_summary}\n"
        f"행동요약: {behavior_summary}\n"
        f"사고패턴힌트: {thought_pattern_hint}\n"
        f"개입힌트: {intervention_hint}\n"
    )

    try:
        response = client.responses.create(
            model=settings.openai_model,
            input=[
                {"role": "system", "content": "당신은 정신건강의학과 의사용 리포트 요약 도우미다."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
        )
        text = response.output_text if hasattr(response, "output_text") else ""
        parsed = _extract_json_block(text)
        if not isinstance(parsed, dict):
            return fallback

        out: dict[str, str] = {}
        for k, v in fallback.items():
            raw = str(parsed.get(k, "")).strip()
            out[k] = (raw if raw else v)[:500]
        return out
    except Exception:
        return fallback
