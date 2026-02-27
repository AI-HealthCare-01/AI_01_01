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


def _default_extracted() -> dict[str, Any]:
    return {
        "distress_0_10": 5,
        "rumination_0_10": 4,
        "avoidance_0_10": 4,
        "sleep_difficulty_0_10": 4,
        "distortion": {k: 0 for k in DISTORTION_KEYS},
        "distortions": [],
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
    enough_depth = user_turns >= 3 and len(user_message.strip()) >= 20
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
    if any(k in text for k in ["분명", "뻔해", "틀림없", "반드시 그렇게"]):
        add("mind_reading")
        add("catastrophizing")
    if any(k in text for k in ["항상", "절대", "전부", "완전히"]):
        add("all_or_nothing")
        add("overgeneralization")
    if any(k in text for k in ["내가 다 잘못", "내 책임", "나 때문"]):
        add("personalization_overresponsibility")
    if any(k in text for k in ["느낌이 사실", "기분이 곧 사실", "불안하니까 진짜"]):
        add("emotional_reasoning")

    return picked[:2]


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
    allowed = [c.strip() for c in candidates if isinstance(c, str) and c.strip()]
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
    challenge_candidates: list[str] | None = None,
    conversation_history: list[dict[str, str]] | None = None,
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

    default_challenges = [
        "사실-감정-해석 분리 기록 1회",
        "자동사고 반박문 3줄 작성",
        "10분 행동실험 + 전후 감정강도 기록",
    ]
    candidate_ids = [c.strip() for c in (challenge_candidates or []) if c and c.strip()]
    challenges = candidate_ids[:2] if candidate_ids else default_challenges

    challenge_completed = bool(active_challenge and any(hint in text for hint in COMPLETION_HINTS))
    completion_message = "챌린지 수행을 완료하였습니다." if challenge_completed else None
    resolved_phase = _infer_cbt_phase(
        user_message=user_message,
        conversation_history=conversation_history,
        requested_phase=cbt_phase,
        active_challenge=active_challenge,
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


def _normalize_extracted(payload: dict[str, Any], user_message: str) -> dict[str, Any]:
    out = _default_extracted()
    for key in ["distress_0_10", "rumination_0_10", "avoidance_0_10", "sleep_difficulty_0_10"]:
        v = payload.get(key, out[key])
        out[key] = _safe_int(v, int(out[key]), 0, 10)

    distortion = payload.get("distortion", {})
    for key in DISTORTION_KEYS:
        v = distortion.get(key, 0)
        out["distortion"][key] = _safe_int(v, 0, 0, 20)
    out["distortions"] = _normalize_distortions(payload.get("distortions"), user_message, out["distortion"])
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
    challenge_candidates: list[str] | None = None,
    conversation_history: list[dict[str, str]] | None = None,
) -> CBTLLMResult:
    resolved_phase = _infer_cbt_phase(
        user_message=user_message,
        conversation_history=conversation_history,
        requested_phase=cbt_phase,
        active_challenge=active_challenge,
    )
    if not settings.openai_api_key or OpenAI is None:
        return _fallback_heuristic(
            user_message,
            active_challenge=active_challenge,
            challenge_phase=challenge_phase,
            cbt_phase=resolved_phase,
            moderate_plus=moderate_plus,
            challenge_candidates=challenge_candidates,
            conversation_history=conversation_history,
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
            "사용자의 표현에 무가치감/부정적 자기개념/반추가 보이면 아래 구조를 매 턴 반드시 지켜라: "
            "1) 감정 반영 1~2문장(매뉴얼 문구 반복 금지) "
            "2) 생각(해석) vs 사실을 한 문장으로 분리 "
            "3) 인지왜곡 가능성 1~2개를 가설로 제시(단정/진단 금지) "
            "4) 지금 가능한 2~5분 행동 1개 제시 "
            "5) 질문은 1개만. "
            "사용자 핵심 문장을 짧게 인용하고, 조언은 1~2개로 제한하라."
        )
    candidate_text = ", ".join(challenge_candidates or [])

    system_prompt = (
        "You are a warm CBT coach for depression, anxiety, and insomnia support. "
        "Never diagnose or prescribe medication. Keep tone empathic, validating, and practical. "
        "If user shows self-blame or guilt, explicitly normalize emotion and reduce shame. "
        "Use short Korean sentences suitable for app UI. Do not expose CBT mechanism labels like '바로 해결로 가기보다' in your reply. "
        "Before recommending thought-organization exercises, first explore user's event-emotion-thought flow deeply for enough turns unless user explicitly asks for one. "
        "Also extract indicators from the user's text every turn. "
        "Return strict JSON with keys: reply, extracted, suggested_challenges, challenge_rationale, summary_card, active_challenge, challenge_step_prompt, challenge_completed, completed_challenge, completion_message, cbt_phase, next_phase. "
        "extracted must include distress_0_10, rumination_0_10, avoidance_0_10, sleep_difficulty_0_10, "
        "and distortion object with all_or_nothing_count, catastrophizing_count, mind_reading_count, "
        "should_statements_count, personalization_count, overgeneralization_count. "
        "summary_card must include 5 keys: situation, self_blame_signal, reframe, next_action, encouragement. "
        "reframe should sound like '그건 네 잘못이 전부는 아니다' style without blaming user. "
        "next_action should be one concrete action user can do today."
        "suggested_challenges must be 3 short actionable CBT challenges when it is the right timing. "
        "challenge_completed must be true only when there is clear textual evidence of completion. "
        "When challenge_completed is true, completion_message should be '챌린지 수행을 완료하였습니다.'. "
        "If challenge_candidates are provided, suggested_challenges must choose from those IDs only. "
        "Also include challenge_rationale in one sentence. "
        f"Current CBT phase is {resolved_phase}. {_phase_instruction(resolved_phase)} "
        f"{(safety_addendum or '').strip()} "
        f"{moderate_addendum} "
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
        challenge_candidates=challenge_candidates,
        conversation_history=conversation_history,
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
    try:
        extracted = _normalize_extracted(parsed.get("extracted", {}), user_message)
    except Exception:
        extracted = fallback.extracted
    try:
        summary_card = _normalize_summary_card(parsed.get("summary_card", {}), user_message)
    except Exception:
        summary_card = fallback.summary_card

    candidate_ids = [c.strip() for c in (challenge_candidates or []) if c and c.strip()]
    if candidate_ids:
        challenges = _normalize_challenge_ids(parsed.get("suggested_challenges", []), candidate_ids)
        if not challenges and (resolved_phase == "ACTION" or moderate_plus):
            challenges = candidate_ids[:2] or fallback.suggested_challenges[:1]
    else:
        challenges_raw = parsed.get("suggested_challenges", [])
        challenges = [str(x).strip()[:120] for x in challenges_raw if str(x).strip()][:3]
        if len(challenges) < 3 and fallback.suggested_challenges:
            challenges = fallback.suggested_challenges

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
    if (resolved_phase == "ACTION" or moderate_plus) and not challenges:
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
