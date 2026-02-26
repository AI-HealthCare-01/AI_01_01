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


def _default_extracted() -> dict[str, Any]:
    return {
        "distress_0_10": 5,
        "rumination_0_10": 4,
        "avoidance_0_10": 4,
        "sleep_difficulty_0_10": 4,
        "distortion": {k: 0 for k in DISTORTION_KEYS},
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


def _fallback_heuristic(
    user_message: str,
    active_challenge: str | None = None,
    challenge_phase: str | None = None,
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

    challenges = [
        "사실-감정-해석 분리 기록 1회",
        "자동사고 반박문 3줄 작성",
        "10분 행동실험 + 전후 감정강도 기록",
    ]

    challenge_completed = bool(active_challenge and any(hint in text for hint in COMPLETION_HINTS))
    completion_message = "챌린지 수행을 완료하였습니다." if challenge_completed else None

    if active_challenge:
        phase = challenge_phase or "continue"
        reply = (
            f"좋아요. 지금은 '{active_challenge}' 챌린지를 함께 진행하고 있어요. "
            "상황을 사실, 생각, 감정으로 나눠서 한 줄씩 적어볼까요?"
        )
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
        )

    if _should_defer_challenge(user_message, conversation_history):
        return CBTLLMResult(
            reply=(
                "좋아요. 오늘 있었던 일을 천천히 함께 정리해볼게요. "
                "무슨 일이 있었고, 그 순간 어떤 생각이 먼저 떠올랐는지 알려주세요."
            ),
            extracted=extracted,
            suggested_challenges=[],
            summary_card=summary_card,
            active_challenge=None,
            challenge_step_prompt="먼저 사건-감정-생각 흐름을 2~3문장으로 적어주세요. 충분히 파악한 뒤 맞춤 챌린지를 추천할게요.",
        )

    reply = (
        "이야기를 잘 정리해주셨어요. 지금 상태를 기준으로 시도해볼 수 있는 챌린지를 골라 같이 진행해볼게요."
    )
    step = "아래 추천 챌린지 중 하나를 선택하면 단계별로 같이 진행합니다."
    return CBTLLMResult(
        reply=reply,
        extracted=extracted,
        suggested_challenges=challenges,
        summary_card=summary_card,
        active_challenge=None,
        challenge_step_prompt=step,
    )


def _normalize_extracted(payload: dict[str, Any]) -> dict[str, Any]:
    out = _default_extracted()
    for key in ["distress_0_10", "rumination_0_10", "avoidance_0_10", "sleep_difficulty_0_10"]:
        v = payload.get(key, out[key])
        out[key] = int(max(0, min(10, int(v))))

    distortion = payload.get("distortion", {})
    for key in DISTORTION_KEYS:
        v = distortion.get(key, 0)
        out["distortion"][key] = int(max(0, min(20, int(v))))
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
    conversation_history: list[dict[str, str]] | None = None,
) -> CBTLLMResult:
    if not settings.openai_api_key or OpenAI is None:
        return _fallback_heuristic(
            user_message,
            active_challenge=active_challenge,
            challenge_phase=challenge_phase,
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

    system_prompt = (
        "You are a warm CBT coach for depression, anxiety, and insomnia support. "
        "Never diagnose or prescribe medication. Keep tone empathic, validating, and practical. "
        "If user shows self-blame or guilt, explicitly normalize emotion and reduce shame. "
        "Use short Korean sentences suitable for app UI. "
        "Before recommending challenges, first explore user's event-emotion-thought flow deeply for enough turns unless user explicitly asks for challenge. "
        "Also extract indicators from the user's text every turn. "
        "Return strict JSON with keys: reply, extracted, suggested_challenges, summary_card, active_challenge, challenge_step_prompt, challenge_completed, completed_challenge, completion_message. "
        "extracted must include distress_0_10, rumination_0_10, avoidance_0_10, sleep_difficulty_0_10, "
        "and distortion object with all_or_nothing_count, catastrophizing_count, mind_reading_count, "
        "should_statements_count, personalization_count, overgeneralization_count. "
        "summary_card must include 5 keys: situation, self_blame_signal, reframe, next_action, encouragement. "
        "reframe should sound like '그건 네 잘못이 전부는 아니다' style without blaming user. "
        "next_action should be one concrete action user can do today."
        "suggested_challenges must be 3 short actionable CBT challenges when it is the right timing. "
        "challenge_completed must be true only when there is clear textual evidence of completion. "
        "When challenge_completed is true, completion_message should be '챌린지 수행을 완료하였습니다.'. "
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

    response = client.responses.create(
        model=settings.openai_model,
        input=messages,
        temperature=0.4,
    )

    text = response.output_text if hasattr(response, "output_text") else ""
    parsed = _extract_json_block(text)
    if not parsed:
        return _fallback_heuristic(
            user_message,
            active_challenge=active_challenge,
            challenge_phase=challenge_phase,
            conversation_history=conversation_history,
        )

    fallback = _fallback_heuristic(
        user_message,
        active_challenge=active_challenge,
        challenge_phase=challenge_phase,
        conversation_history=conversation_history,
    )
    reply = str(parsed.get("reply", "")).strip()[:1500] or fallback.reply
    extracted = _normalize_extracted(parsed.get("extracted", {}))
    summary_card = _normalize_summary_card(parsed.get("summary_card", {}), user_message)

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

    if not active_challenge and _should_defer_challenge(user_message, conversation_history):
        challenges = []
        if not step_prompt:
            step_prompt = "먼저 사건-감정-생각 흐름을 조금 더 들려주세요. 이후 맞춤 챌린지를 추천할게요."

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
