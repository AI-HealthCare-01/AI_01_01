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


@dataclass(slots=True)
class CBTLLMResult:
    reply: str
    extracted: dict[str, Any]
    suggested_challenges: list[str]


def _default_extracted() -> dict[str, Any]:
    return {
        "distress_0_10": 5,
        "rumination_0_10": 4,
        "avoidance_0_10": 4,
        "sleep_difficulty_0_10": 4,
        "distortion": {k: 0 for k in DISTORTION_KEYS},
    }


def _fallback_heuristic(user_message: str) -> CBTLLMResult:
    text = user_message.lower()
    extracted = _default_extracted()

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

    reply = (
        "지금 느끼는 감정을 구체적으로 말해줘서 고마워요. 우선 자동사고를 사실/해석으로 나눠보면 도움이 됩니다. "
        "오늘은 1) 증거 찾기 2) 대안 생각 3) 10분 행동실험 중 하나를 시도해 보세요."
    )
    challenges = [
        "사실-해석 분리 기록 1회",
        "자동사고 반박문 3줄 작성",
        "10분 걷기 + 감정강도 전후 기록",
    ]
    return CBTLLMResult(reply=reply, extracted=extracted, suggested_challenges=challenges)


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


def generate_cbt_reply(user_message: str) -> CBTLLMResult:
    if not settings.openai_api_key or OpenAI is None:
        return _fallback_heuristic(user_message)

    client = OpenAI(api_key=settings.openai_api_key)
    system_prompt = (
        "You are a CBT coach for depression, anxiety, and insomnia support. "
        "Never diagnose. Keep tone safe and practical. "
        "Return strict JSON with keys: reply, extracted, suggested_challenges. "
        "extracted must include distress_0_10, rumination_0_10, avoidance_0_10, sleep_difficulty_0_10, "
        "and distortion object with all_or_nothing_count, catastrophizing_count, mind_reading_count, "
        "should_statements_count, personalization_count, overgeneralization_count. "
        "suggested_challenges must be 3 short actionable CBT challenges."
    )

    response = client.responses.create(
        model=settings.openai_model,
        input=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        temperature=0.4,
    )
    text = response.output_text if hasattr(response, "output_text") else ""
    parsed = _extract_json_block(text)

    if not parsed:
        return _fallback_heuristic(user_message)

    reply = str(parsed.get("reply", ""))[:1500].strip() or _fallback_heuristic(user_message).reply
    extracted = _normalize_extracted(parsed.get("extracted", {}))
    challenges_raw = parsed.get("suggested_challenges", [])
    challenges = [str(x).strip()[:120] for x in challenges_raw if str(x).strip()][:3]
    if len(challenges) < 3:
        challenges = _fallback_heuristic(user_message).suggested_challenges

    return CBTLLMResult(reply=reply, extracted=extracted, suggested_challenges=challenges)
