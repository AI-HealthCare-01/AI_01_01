from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.routes_auth import get_current_user
from app.db import crud
from app.db.session import get_db
from app.schemas.auth import UserOut
from app.schemas.chat import ChallengeRecommendResponse, ChatRequest, ChatResponse
from app.services.challenge_recommend import (
    default_challenge_policy,
    detect_technique,
    normalize_challenge_key,
    normalize_challenge_policy,
    pick_non_duplicate_challenges,
)
from app.services.llm import generate_cbt_reply

router = APIRouter(prefix="/chat", tags=["chat"])
CHALLENGE_POLICY_CONFIG_KEY = "challenge_policy_v1"
CHALLENGE_CATALOG_IDS = [
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
]
HIGH_RISK_KEYWORDS = [
    "자살", "자해", "죽고 싶", "죽고싶", "목숨", "해치고 싶", "kill myself", "suicide", "self-harm",
]
HIGH_RISK_DIRECT_PATTERNS = [
    "오늘 죽", "지금 죽", "마무리할래", "끝내고 싶", "사라지고 싶", "유서", "잘 있어", "지금까지 고마웠어",
]
MEDIUM_RISK_KEYWORDS = [
    "살기 싫", "버티기 힘들", "절망", "공황", "패닉", "극심한 불안", "불면", "무가치", "hopeless", "panic",
]
PLAN_MEANS_KEYWORDS = ["준비했", "칼", "약", "목맬", "투신", "방법", "수단", "장소", "시간 정했"]
VIOLENT_TARGET_KEYWORDS = ["다른 사람", "남을", "타인을", "누군가", "사람을"]
VIOLENT_ACTION_KEYWORDS = ["죽이고", "해치고", "찌르고", "폭행", "때리고", "보복"]
VIOLENT_DIRECT_PATTERNS = ["다른 사람을 죽이고 싶", "남을 죽이고 싶", "타인을 해치고 싶"]
SAFETY_RELEASE_KEYWORDS = ["안전해", "괜찮아졌", "연락했", "도움받고", "지금은 괜찮", "병원 왔", "옆에 사람 있어"]
CRISIS_LOCK_TURNS = 5
CRISIS_STAGE_A_TRIGGER_KEYWORDS = [
    "죽고", "자살", "마무리", "준비중", "오늘 죽", "살기 싫", "끝내",
]
CRISIS_STAGE_A_TO_B_KEYWORDS = [
    "전화", "통화", "연결", "응급실", "구급차", "119에", "상담사",
]
CRISIS_STAGE_B_TO_C_KEYWORDS = [
    "도착", "옆에", "안전", "문 열었", "누가 왔", "응급실 도착",
]
CRISIS_EXIT_KEYWORDS = ["대화 종료", "마무리", "안정됨", "이제 괜찮아", "도움 받고 있어"]
MODERATE_PLUS_KEYWORDS = [
    "가치없", "의미없", "필요없", "없어도 상관", "쓸모없",
    "나는 무능", "나는 문제", "난 망했", "난 항상", "난 결국",
    "계속 생각나", "멈출 수가", "또 떠올라", "반복", "지쳐",
    "아무 감정", "무기력", "아무것도 하기 싫", "텅 빈",
]

CHALLENGE_CANDIDATE_RULES = {
    "ANXIETY": ["SENSORY_MEDITATION", "MEDITATION_5MIN", "RHYTHM_GAME"],
    "SLEEP": ["SLEEP_HYGIENE_ROUTINE", "MORNING_PATTERN", "JOURNAL_STREAK"],
    "LOW_ENERGY": ["SUNLIGHT_5MIN_3D", "WALK_10MIN_3D", "WEEKLY_MINI_CHALLENGE"],
    "RELATION_SELFBLAME": ["GRATITUDE_LOTTERY", "IPT_SUPPORTERS_MAP", "JOURNAL_STREAK"],
}


def _contains_any(text: str, words: list[str]) -> bool:
    return any(w in text for w in words)


def _detect_crisis_signal(message: str) -> dict[str, Any]:
    text = message.lower()
    high = _contains_any(text, HIGH_RISK_KEYWORDS) or _contains_any(text, HIGH_RISK_DIRECT_PATTERNS)
    moderate = _contains_any(text, MEDIUM_RISK_KEYWORDS)
    violent = _contains_any(text, VIOLENT_DIRECT_PATTERNS) or (
        _contains_any(text, VIOLENT_TARGET_KEYWORDS) and _contains_any(text, VIOLENT_ACTION_KEYWORDS)
    )
    plan_means = _contains_any(text, PLAN_MEANS_KEYWORDS)
    intent_level = "active" if (high or violent) else ("passive" if moderate else "none")
    crisis_level = "high" if (high or violent) else ("moderate" if moderate else "none")
    return {
        "crisis_mode": crisis_level != "none",
        "crisis_level": crisis_level,
        "intent_level": intent_level,
        "plan_means_flag": plan_means,
        "violent_risk_flag": violent,
    }


def _normalize_text(text: str) -> str:
    return " ".join(str(text).lower().split())


def _pick_non_repeated_template(candidates: list[str], last_reply: str) -> str:
    norm_last = _normalize_text(last_reply)
    for item in candidates:
        norm_item = _normalize_text(item)
        if norm_item and norm_item != norm_last:
            return item
    return candidates[0] if candidates else ""


def _pick_rotating_template(candidates: list[str], last_reply: str, prior_index: int) -> tuple[str, int]:
    if not candidates:
        return "", 0
    total = len(candidates)
    start = (max(0, prior_index) + 1) % total
    norm_last = _normalize_text(last_reply)
    for offset in range(total):
        idx = (start + offset) % total
        cand = candidates[idx]
        if _normalize_text(cand) != norm_last:
            return cand, idx
    return candidates[start], start


def _contains_hotline_list(reply: str) -> bool:
    text = reply.lower()
    return any(k in text for k in ["119", "112", "1393", "1588-9191", "1577-0199"])


def _resolve_crisis_stage_and_lock(
    *,
    message: str,
    crisis_mode: bool,
    prior_stage: str | None,
    prior_lock: int,
    crisis_triggered_now: bool,
) -> tuple[str | None, int]:
    if not crisis_mode:
        return None, 0

    text = message.lower()
    a_trigger = _contains_any(text, CRISIS_STAGE_A_TRIGGER_KEYWORDS)
    b_trigger = _contains_any(text, CRISIS_STAGE_A_TO_B_KEYWORDS)
    c_trigger = _contains_any(text, CRISIS_STAGE_B_TO_C_KEYWORDS)

    if c_trigger:
        return "C", 1

    # B는 최소 2턴 유지: 이 구간에서는 A로 즉시 롤백하지 않는다.
    if prior_stage == "B" and prior_lock > 0 and not c_trigger:
        return "B", max(0, prior_lock - 1)

    if b_trigger:
        return "B", 2

    # A는 최소 3~5턴 유지(여기선 5턴 시작)
    if prior_stage == "A" and prior_lock > 0 and not b_trigger and not c_trigger:
        return "A", max(0, prior_lock - 1)

    if a_trigger or crisis_triggered_now:
        return "A", CRISIS_LOCK_TURNS

    if prior_stage in {"A", "B", "C"}:
        return prior_stage, max(0, prior_lock - 1)
    return "A", CRISIS_LOCK_TURNS


def _crisis_actions(level: str, stage: str, message: str, violent_risk_flag: bool = False) -> list[str]:
    if stage == "A":
        if violent_risk_flag:
            return [
                "112에 즉시 먼저 연락하기",
                "즉시 대상과 물리적으로 떨어져 안전한 공간으로 이동하기",
                "위험 물건/약을 손 닿지 않는 곳으로 치우기",
            ]
        if level == "high":
            return [
                "지금 119 또는 112에 바로 전화하기",
                "1393 / 1588-9191 / 1577-0199 중 한 곳에 즉시 연결하기",
                "문을 열어두고 위험 물건에서 떨어져 있기",
            ]
        return [
            "지금 1393 또는 119/112로 즉시 연결하기",
            "가까운 사람에게 '지금 위험해, 도와줘' 메시지 보내기",
            "위험 물건과 거리를 두고 혼자 있지 않기",
        ]
    if stage == "B":
        actions = [
            "가능하면 문을 열어두고 현관 근처에서 기다리기",
            "위험 물건/약/날카로운 물건을 손 닿지 않는 곳으로 치우기",
            "4초 들이마시고 6초 내쉬기를 3회 반복하기",
        ]
        if any(k in message.lower() for k in ["구급차", "오고 있어", "온다"]):
            actions[0] = "문을 열어두고 위치 공유 후 현관 근처에서 대기하기"
        return actions
    return [
        "다음 1~2시간은 혼자 있지 않고 곁에 있는 사람과 함께 있기",
        "응급실/상담에서 말할 핵심 1문장 준비하기 (예: '지금 자해 충동이 올라와요')",
        "지금 연락할 사람 1명을 정해 짧게 상태 공유하기",
    ]


def _build_crisis_reply(
    level: str,
    stage: str,
    last_reply: str,
    message: str,
    hotline_count: int,
    prior_template_index: int,
    violent_risk_flag: bool,
) -> tuple[str, int]:
    if stage == "A":
        if violent_risk_flag:
            templates = [
                (
                    "지금은 안전이 최우선입니다.\n"
                    "타해 위험 신호가 있어 112(경찰)에 즉시 먼저 연락해 주세요. 필요하면 119/1393/1588-9191/1577-0199도 함께 이용하세요.\n"
                    "확인할게요. 지금 혼자 계신가요? 해를 끼칠 수 있는 물건/약이 가까이에 있나요?\n"
                    "지금 즉시 대상과 물리적으로 떨어지고, 문을 열어둔 채 안전한 공간으로 이동해 주세요."
                ),
                (
                    "지금은 분석보다 즉시 안전 조치가 필요해요.\n"
                    "다른 사람을 해칠 위험이 느껴지면 112를 먼저 연결하세요. 이후 119나 1393에도 도움을 요청하세요.\n"
                    "지금 혼자인가요? 위험 물건이 손 닿는 곳에 있나요?\n"
                    "지금 바로 대상과 거리를 벌리고, 가까운 사람에게 '지금 위험해서 도움이 필요해'라고 한 문장 보내주세요."
                ),
                (
                    "지금은 긴급 상황으로 보고 안전을 먼저 맞출게요.\n"
                    "112에 즉시 연락해 현재 상태를 알리고 도움을 받으세요.\n"
                    "확인 질문입니다. 혼자 있나요? 주변에 위험 물건이 있나요?\n"
                    "즉시 상대와 떨어진 뒤 현관 근처나 공용공간처럼 안전한 곳으로 이동하세요."
                ),
            ]
            return _pick_rotating_template(templates, last_reply, prior_template_index)
        if hotline_count >= 2:
            templates = [
                (
                    "지금은 안전 확보가 가장 중요해요.\n"
                    "이미 안내한 번호 중 한 곳에 바로 연결해 주세요.\n"
                    "확인할게요. 지금 혼자 계신가요? 해를 끼칠 수 있는 물건이 가까이에 있나요?\n"
                    "문을 열어두고, 주변 사람에게 즉시 도움 요청 메시지를 보내주세요."
                ),
                (
                    "지금은 분석보다 안전 행동이 먼저예요.\n"
                    "이미 안내된 긴급/상담 연결을 지금 실행해 주세요.\n"
                    "지금 혼자인지, 위험 물건이 가까운지만 짧게 알려주세요.\n"
                    "가능하면 현관 근처에서 대기하고 도움 요청을 유지해 주세요."
                ),
            ]
            return _pick_rotating_template(templates, last_reply, prior_template_index)
        templates = [
            (
                "지금은 안전이 최우선이에요.\n"
                "지금 바로 119(응급), 112(경찰), 1393(자살예방 상담), 1588-9191(생명의전화), 1577-0199(정신건강 위기상담) 중 한 곳에 연락해 주세요.\n"
                "확인할게요. 지금 혼자 계신가요? 이미 해를 끼칠 수 있는 방법이나 물건을 준비하셨나요?\n"
                "가능하면 문을 열어두고, 가까운 사람에게 '지금 위험해, 도와줘'라고 바로 보내주세요."
            ),
            (
                "지금은 다른 분석보다 안전 확보가 먼저예요.\n"
                "우선 119/112/1393 중 한 곳에 즉시 연결해 주세요.\n"
                "짧게 확인할게요. 지금 혼자 계신가요? 주변에 해를 끼칠 수 있는 물건이 가까이 있나요?\n"
                "전화 연결하면서 문을 열어두고, 가까운 사람 한 명에게 바로 도움 요청 메시지를 보내주세요."
            ),
            (
                "지금은 안전을 먼저 확보해야 해요.\n"
                "119/112/1393/1588-9191/1577-0199 중 가능한 번호로 지금 바로 연결해 주세요.\n"
                "확인할게요. 지금 혼자 계신가요? 위험 물건이나 약이 가까이에 있나요?\n"
                "문을 열어두고, 주변 사람 한 명에게 '지금 위험해서 도움이 필요해'라고 보내주세요."
            ),
        ]
        return _pick_rotating_template(templates, last_reply, prior_template_index)
    if stage == "B":
        templates = [
            (
                "연결을 시작한 건 정말 중요한 선택이었어요. 지금 그 행동이 당신을 지키고 있어요.\n"
                "지금은 대기 안전만 짧게 맞출게요: 문 열어두기/위험 물건 치우기/4초 들숨 6초 날숨 3회.\n"
                "지금 혼자 계신가요, 아니면 누가 곁에 있나요?"
            ),
            (
                "지금 도움을 연결 중인 점이 가장 중요해요. 잘하고 있어요.\n"
                "대기 동안은 현관 근처에서 기다리고, 위험 물건은 멀리 두고, 숨을 4초-6초로 3번만 맞춰보세요.\n"
                "지금 곁에 함께 있는 사람이 있나요?"
            ),
            (
                "지금 전화 연결을 유지한 건 정말 중요한 선택이에요.\n"
                "지금은 문 열어두기, 위험 물건 치우기, 4초 들숨/6초 날숨 3회를 짧게 반복해 주세요.\n"
                "지금 혼자 계신가요, 아니면 누가 옆에 있나요?"
            ),
        ]
        if any(k in message.lower() for k in ["구급차", "오고 있어", "온다"]):
            templates[0] = (
                "구급차가 오고 있다면 지금 대응이 아주 잘 되고 있어요.\n"
                "문을 열어두고 위치를 공유한 뒤 현관 근처에서 기다리세요. 위험 물건은 손 닿지 않게 치워주세요.\n"
                "지금 혼자 계신가요, 아니면 누가 곁에 있나요?"
            )
        return _pick_rotating_template(templates, last_reply, prior_template_index)
    templates = [
        (
            "안전이 조금 확보된 점이 정말 중요해요.\n"
            "다음 1~2시간 계획만 짧게 잡아볼게요: 누구와 함께 있을지 정하고, 응급실/상담에서 말할 핵심 한 문장을 준비해요.\n"
            "지금 연락할 사람 1명을 정해서 '지금 곁에 있어줘'라고 보내보세요."
        ),
        (
            "지금 안전해졌다는 신호가 보여요. 여기까지 온 것 자체가 큰 보호 행동이에요.\n"
            "당장은 분석으로 돌아가지 말고, 다음 1~2시간을 함께 보낼 사람 1명과 연락 계획을 먼저 세워요.\n"
            "원하면 이후에 마음 정리를 다시 도와드릴게요."
        ),
        (
            "여기까지 온 게 정말 중요해요. 안전을 지키는 선택을 해냈어요.\n"
            "다음 1~2시간은 혼자 있지 말고, 의료진에게 '자해 생각이 강했다'고 그대로 전달해 주세요.\n"
            "지금 연락할 사람 1명을 정해 함께 있어 달라고 요청해 주세요."
        ),
    ]
    return _pick_rotating_template(templates, last_reply, prior_template_index)


def _build_crisis_extracted(
    latest_extracted: dict[str, Any],
    *,
    crisis_level: str,
    intent_level: str,
    plan_means_flag: bool,
    lock_remaining: int,
    crisis_stage: str | None,
    hotline_count: int,
    template_index: int,
    violent_risk_flag: bool,
) -> dict[str, Any]:
    distortion = latest_extracted.get("distortion", {})
    if not isinstance(distortion, dict):
        distortion = {}
    return {
        "distress_0_10": max(8, _safe_score(latest_extracted.get("distress_0_10", 8), 8)),
        "rumination_0_10": max(6, _safe_score(latest_extracted.get("rumination_0_10", 6), 6)),
        "avoidance_0_10": max(5, _safe_score(latest_extracted.get("avoidance_0_10", 5), 5)),
        "sleep_difficulty_0_10": _safe_score(latest_extracted.get("sleep_difficulty_0_10", 6), 6),
        "distortion": {
            "all_or_nothing_count": int(distortion.get("all_or_nothing_count", 0) or 0),
            "catastrophizing_count": max(1, int(distortion.get("catastrophizing_count", 0) or 0)),
            "mind_reading_count": int(distortion.get("mind_reading_count", 0) or 0),
            "should_statements_count": int(distortion.get("should_statements_count", 0) or 0),
            "personalization_count": int(distortion.get("personalization_count", 0) or 0),
            "overgeneralization_count": int(distortion.get("overgeneralization_count", 0) or 0),
        },
        "distortions": ["catastrophizing", "labeling_negative_identity"],
        "thought_web": None,
        "suicide_risk_flag": crisis_level != "none",
        "intent_level": intent_level,
        "plan_means_flag": bool(plan_means_flag),
        "crisis_lock_remaining": max(0, min(10, lock_remaining)),
        "crisis_stage": crisis_stage if crisis_stage in {"A", "B", "C"} else None,
        "crisis_hotline_count": max(0, min(10, hotline_count)),
        "crisis_template_index": max(0, min(20, template_index)),
        "violent_risk_flag": bool(violent_risk_flag),
    }


def _classify_risk_level(message: str) -> str:
    text = message.lower()
    if any(k in text for k in HIGH_RISK_KEYWORDS):
        return "HIGH"
    if any(k in text for k in MEDIUM_RISK_KEYWORDS):
        return "MEDIUM"
    return "LOW"


def _safe_score(value: object, default: int = 0) -> int:
    try:
        return max(0, min(10, int(value)))  # noqa: PLR2004
    except Exception:
        return default


def _sanitize_challenge_candidates(raw: list[str] | None) -> list[str]:
    if not raw:
        return []
    allowed = set(CHALLENGE_CATALOG_IDS)
    out: list[str] = []
    for item in raw:
        cid = str(item).strip()
        if cid in allowed and cid not in out:
            out.append(cid)
    return out


def _is_slot_filled(user_texts: list[str], patterns: list[str]) -> bool:
    joined = " ".join(user_texts).lower()
    return any(p in joined for p in patterns)


def _is_finish_candidate(
    message: str,
    *,
    cbt_phase: str | None,
    active_challenge: str | None,
    history_user_texts: list[str],
) -> bool:
    text = message.lower()
    if cbt_phase == "ACTION" or bool(active_challenge):
        return True
    if any(k in text for k in ["해볼게", "지금 할게", "해보고 싶어", "시작할게", "해보겠습니다"]):
        return True
    if any(k in text for k in ["다르게 생각", "완전히는 아냐", "증거를 보면", "그럴 수도"]):
        return True

    all_user_texts = history_user_texts + [message]
    emotion_ok = _is_slot_filled(all_user_texts, ["불안", "우울", "힘들", "속상", "지침", "무기력"])
    situation_ok = _is_slot_filled(all_user_texts, ["상황", "오늘", "아까", "회사", "학교", "집에서", "사건"])
    thought_ok = _is_slot_filled(all_user_texts, ["생각", "자동사고", "난", "나는", "해석"])
    distortion_ok = _is_slot_filled(all_user_texts, ["항상", "절대", "망했", "내 탓", "가치없", "없어도 상관"])
    reframe_ok = _is_slot_filled(all_user_texts, ["대안", "다르게", "한 가지 가능성", "균형"])
    return emotion_ok and situation_ok and thought_ok and distortion_ok and reframe_ok


def _looks_like_automatic_thought(message: str) -> bool:
    text = message.lower()
    return any(
        k in text
        for k in [
            "\"",
            "나는 ",
            "난 ",
            "일 거야",
            "일거야",
            "항상",
            "절대",
            "없어도 상관",
            "가치없",
            "쓸모없",
        ]
    )


def _is_thought_web_mode(
    *,
    message: str,
    cbt_phase: str | None,
    distress_0_10: int,
    rumination_0_10: int,
) -> bool:
    if (cbt_phase or "").upper() in {"THOUGHT", "DISTORTION", "REFRAME", "ACTION"}:
        return True
    if _looks_like_automatic_thought(message):
        return True
    return rumination_0_10 >= 6 or distress_0_10 >= 7


def _is_moderate_plus(message: str, recent_user_text: str = "", prior_distress: int | None = None) -> bool:
    text = f"{message} {recent_user_text}".lower()
    if any(k in text for k in MODERATE_PLUS_KEYWORDS):
        return True
    return (prior_distress or 0) >= 7


def _build_challenge_candidates(
    message: str,
    *,
    moderate_plus: bool,
    distress_0_10: int | None = None,
    sleep_difficulty_0_10: int | None = None,
    avoidance_0_10: int | None = None,
    sleep_hours: float | None = None,
    recent_distortions: list[str] | None = None,
) -> list[str]:
    text = message.lower()
    distortions = [d for d in (recent_distortions or []) if isinstance(d, str)]
    a = (distress_0_10 or 0) >= 7 or any(k in text for k in ["불안", "초조", "멍", "숨막"])
    b = (sleep_difficulty_0_10 or 0) >= 6 or (sleep_hours is not None and sleep_hours < 5.5) or any(
        k in text for k in ["잠", "불면", "잠들기", "수면"]
    )
    c = (avoidance_0_10 or 0) >= 6 or any(k in text for k in ["무기력", "하기싫", "텅빈", "우울"])
    d = ("labeling_negative_identity" in distortions) or any(k in text for k in ["혼자", "관계", "미움", "자기비난"])

    candidates: list[str] = []
    if a and b:
        candidates.extend(CHALLENGE_CANDIDATE_RULES["ANXIETY"][:2])
        candidates.extend(CHALLENGE_CANDIDATE_RULES["SLEEP"][:1])
    else:
        if a:
            candidates.extend(CHALLENGE_CANDIDATE_RULES["ANXIETY"])
        if b:
            candidates.extend(CHALLENGE_CANDIDATE_RULES["SLEEP"])
    if c:
        candidates.extend(CHALLENGE_CANDIDATE_RULES["LOW_ENERGY"])
    if d:
        candidates.extend(CHALLENGE_CANDIDATE_RULES["RELATION_SELFBLAME"])
    if moderate_plus and not candidates:
        candidates.extend(CHALLENGE_CANDIDATE_RULES["LOW_ENERGY"])
    if not candidates:
        candidates = ["WEEKLY_MINI_CHALLENGE"]

    unique: list[str] = []
    allowed = set(CHALLENGE_CATALOG_IDS)
    for item in candidates:
        if item in allowed and item not in unique:
            unique.append(item)
    return unique[:5]


async def _load_challenge_policy(db: AsyncSession) -> dict[str, object]:
    raw = await crud.get_app_config_json(db, CHALLENGE_POLICY_CONFIG_KEY)
    return normalize_challenge_policy(raw or default_challenge_policy())


@router.get("/challenges/recommend", response_model=ChallengeRecommendResponse)
async def recommend_challenges(
    window_days: int | None = Query(default=None, ge=1, le=60),
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChallengeRecommendResponse:
    policy = await _load_challenge_policy(db)
    days = int(window_days if window_days is not None else policy["window_days"])
    recent = await crud.list_recent_challenge_histories(db=db, user_id=current_user.id, days=days)
    suggested = pick_non_duplicate_challenges(
        llm_suggestions=[],
        recent_challenge_names=[h.challenge_name for h in recent],
        recent_techniques=[h.technique for h in recent],
        size=3,
        similarity_threshold=float(policy["similarity_threshold"]),
        repeatable_techniques=list(policy["repeatable_techniques"]),
    )
    return ChallengeRecommendResponse(suggested_challenges=suggested, window_days=days)


@router.post("/cbt", response_model=ChatResponse)
async def chat_cbt(
    payload: ChatRequest,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    policy = await _load_challenge_policy(db)
    risk_level = _classify_risk_level(payload.message)
    history_user_texts = [str(turn.content).strip() for turn in payload.conversation_history[-8:] if turn.role == "user"]
    recent_user_text = " ".join(history_user_texts[-4:])
    latest_event = await crud.get_latest_chat_event(db=db, user_id=current_user.id)
    latest_extracted = latest_event.extracted if latest_event and isinstance(latest_event.extracted, dict) else {}
    last_assistant_reply = str(latest_event.assistant_reply or "") if latest_event else ""
    prior_crisis_lock = int(latest_extracted.get("crisis_lock_remaining", 0) or 0)
    prior_hotline_count = int(latest_extracted.get("crisis_hotline_count", 0) or 0)
    prior_template_index = int(latest_extracted.get("crisis_template_index", 0) or 0)
    prior_crisis_level = str(latest_extracted.get("intent_level", "none") or "none")
    prior_crisis_stage = str(latest_extracted.get("crisis_stage", "") or "").upper()
    crisis_detect = _detect_crisis_signal(payload.message)
    safety_released = _contains_any(payload.message.lower(), SAFETY_RELEASE_KEYWORDS)
    explicit_exit = _contains_any(payload.message.lower(), CRISIS_EXIT_KEYWORDS)
    crisis_mode = bool(crisis_detect["crisis_mode"]) or prior_crisis_lock > 0
    crisis_level = str(crisis_detect["crisis_level"])
    if crisis_level == "none" and prior_crisis_lock > 0:
        crisis_level = "high" if prior_crisis_level == "active" else "moderate"
    crisis_stage, crisis_lock_remaining = _resolve_crisis_stage_and_lock(
        message=payload.message,
        crisis_mode=crisis_mode,
        prior_stage=prior_crisis_stage,
        prior_lock=prior_crisis_lock,
        crisis_triggered_now=bool(crisis_detect["crisis_mode"]),
    )
    if explicit_exit and prior_crisis_stage == "C" and safety_released:
        crisis_mode = False
        crisis_level = "none"
        crisis_stage = None
        crisis_lock_remaining = 0
    if risk_level == "HIGH":
        crisis_mode = True
        crisis_level = "high"
        if crisis_stage is None:
            crisis_stage = "A"
            crisis_lock_remaining = CRISIS_LOCK_TURNS

    # Crisis mode에서는 CBT 파이프라인(왜곡/생각그물/챌린지)을 중단하고
    # stage별 하드 템플릿을 우선 적용한다.
    if crisis_mode:
        safe_reply, used_template_index = _build_crisis_reply(
            crisis_level,
            crisis_stage or "A",
            last_reply=last_assistant_reply,
            message=payload.message,
            hotline_count=prior_hotline_count,
            prior_template_index=prior_template_index,
            violent_risk_flag=bool(crisis_detect.get("violent_risk_flag", False)),
        )
        next_hotline_count = prior_hotline_count + (1 if _contains_hotline_list(safe_reply) else 0)
        extracted = _build_crisis_extracted(
            latest_extracted,
            crisis_level=crisis_level,
            intent_level=str(crisis_detect["intent_level"] if crisis_detect["intent_level"] != "none" else ("active" if crisis_level == "high" else "passive")),
            plan_means_flag=bool(crisis_detect["plan_means_flag"]),
            lock_remaining=crisis_lock_remaining,
            crisis_stage=crisis_stage,
            hotline_count=next_hotline_count,
            template_index=used_template_index,
            violent_risk_flag=bool(crisis_detect.get("violent_risk_flag", False)),
        )
        summary_card = {
            "situation": payload.message[:120],
            "self_blame_signal": "고위험 신호가 관찰되어 즉시 안전 확보가 필요합니다.",
            "reframe": "지금의 고통은 도움을 받을 가치가 있는 상태입니다.",
            "next_action": "지금 단계 행동을 1개만 바로 실행해 주세요. 연결/대기/동행이 핵심입니다.",
            "encouragement": "도움을 요청하는 행동은 매우 중요한 보호 행동입니다.",
        }
        await crud.create_chat_event(
            db=db,
            user_id=current_user.id,
            user_message=payload.message,
            assistant_reply=safe_reply,
            extracted=extracted,
            suggested_challenges=[],
        )
        return ChatResponse(
            reply=safe_reply,
            extracted=extracted,
            suggested_challenges=[],
            summary_card=summary_card,
            cbt_phase="EMOTION",
            phase="EMOTION",
            next_phase="SITUATION",
            challenge_rationale=None,
            active_challenge=None,
            challenge_step_prompt="지금은 분석보다 안전 확보가 우선입니다. 현재 위치와 함께 도움 요청 문장을 보내보세요.",
            challenge_completed=False,
            completed_challenge=None,
            completion_message=None,
            disclaimer="이 정보는 참고용이며, 진단 아님 안내입니다.",
            timestamp=datetime.now(timezone.utc),
            crisis_mode=True,
            crisis_level="high" if crisis_level == "high" else "moderate",
            crisis_stage=crisis_stage if crisis_stage in {"A", "B", "C"} else "A",
            crisis_actions=_crisis_actions(
                crisis_level,
                crisis_stage or "A",
                payload.message,
                violent_risk_flag=bool(crisis_detect.get("violent_risk_flag", False)),
            ),
        )
    prior_distress = _safe_score(latest_extracted.get("distress_0_10", 0), 0)
    prior_rumination = _safe_score(latest_extracted.get("rumination_0_10", 0), 0)
    prior_sleep_difficulty = _safe_score(latest_extracted.get("sleep_difficulty_0_10", 0), 0)
    prior_avoidance = _safe_score(latest_extracted.get("avoidance_0_10", 0), 0)
    prior_distortions = latest_extracted.get("distortions", [])
    latest_checkin = await crud.get_latest_checkin(db=db, user_id=current_user.id)
    finish_candidate = _is_finish_candidate(
        payload.message,
        cbt_phase=payload.cbt_phase,
        active_challenge=payload.active_challenge,
        history_user_texts=history_user_texts,
    )
    thought_web_mode = _is_thought_web_mode(
        message=payload.message,
        cbt_phase=payload.cbt_phase,
        distress_0_10=prior_distress,
        rumination_0_10=prior_rumination,
    )

    moderate_plus = _is_moderate_plus(
        payload.message,
        recent_user_text=recent_user_text,
        prior_distress=prior_distress,
    )
    incoming_candidates = _sanitize_challenge_candidates(payload.challenge_candidates)
    challenge_candidates = incoming_candidates or _build_challenge_candidates(
        payload.message,
        moderate_plus=moderate_plus,
        distress_0_10=prior_distress,
        sleep_difficulty_0_10=prior_sleep_difficulty,
        avoidance_0_10=prior_avoidance,
        sleep_hours=latest_checkin.sleep_hours if latest_checkin else None,
        recent_distortions=prior_distortions if isinstance(prior_distortions, list) else [],
    )
    if (payload.cbt_phase == "ACTION" or payload.active_challenge or finish_candidate) and not challenge_candidates:
        challenge_candidates = ["WEEKLY_MINI_CHALLENGE"]

    safety_addendum = ""
    if risk_level == "MEDIUM":
        safety_addendum = (
            "Safety mode: ask one brief safety-check question first, "
            "then suggest contacting a trusted person or professional support if distress stays high."
        )

    result = await run_in_threadpool(
        generate_cbt_reply,
        user_message=payload.message,
        active_challenge=payload.active_challenge,
        challenge_phase=payload.challenge_phase,
        cbt_phase=payload.cbt_phase,
        safety_addendum=safety_addendum,
        moderate_plus=moderate_plus,
        finish_candidate=finish_candidate,
        thought_web_mode=thought_web_mode,
        challenge_candidates=challenge_candidates,
        conversation_history=[item.model_dump() for item in payload.conversation_history],
        crisis_mode=False,
        crisis_level="none",
        crisis_stage=None,
    )

    recent = await crud.list_recent_challenge_histories(db=db, user_id=current_user.id, days=int(policy["window_days"]))
    filtered_suggestions = (
        pick_non_duplicate_challenges(
            llm_suggestions=result.suggested_challenges,
            recent_challenge_names=[h.challenge_name for h in recent],
            recent_techniques=[h.technique for h in recent],
            size=3,
            similarity_threshold=float(policy["similarity_threshold"]),
            repeatable_techniques=list(policy["repeatable_techniques"]),
        )
        if result.suggested_challenges
        else []
    )
    filtered_suggestions = _sanitize_challenge_candidates(filtered_suggestions)
    if (moderate_plus or finish_candidate or (result.cbt_phase or "THOUGHT") == "ACTION") and not filtered_suggestions:
        filtered_suggestions = challenge_candidates[:1]
    summary_card = dict(result.summary_card)
    if finish_candidate and filtered_suggestions:
        summary_card["next_action"] = f"{summary_card.get('next_action', '')} / 추천 챌린지: {filtered_suggestions[0]}".strip(" /")

    if result.challenge_completed and result.completed_challenge:
        done_name = result.completed_challenge.strip()[:200]
        done_key = normalize_challenge_key(done_name)
        recent_keys = {h.challenge_key for h in recent}
        if done_key and done_key not in recent_keys:
            await crud.create_challenge_history(
                db=db,
                user_id=current_user.id,
                challenge_name=done_name,
                challenge_key=done_key,
                technique=detect_technique(done_name),
                source="chat",
                completed=True,
            )

    await crud.create_chat_event(
        db=db,
        user_id=current_user.id,
        user_message=payload.message,
        assistant_reply=result.reply,
        extracted=result.extracted,
        suggested_challenges=filtered_suggestions,
    )

    return ChatResponse(
        reply=result.reply,
        extracted=result.extracted,
        suggested_challenges=filtered_suggestions,
        summary_card=summary_card,
        challenge_rationale=result.challenge_rationale,
        cbt_phase=result.cbt_phase,
        phase=result.cbt_phase,
        next_phase=result.next_phase,
        active_challenge=result.active_challenge,
        challenge_step_prompt=result.challenge_step_prompt,
        challenge_completed=result.challenge_completed,
        completed_challenge=result.completed_challenge,
        completion_message=result.completion_message,
        disclaimer="이 정보는 참고용이며, 진단 아님 안내입니다.",
        timestamp=datetime.now(timezone.utc),
        crisis_mode=False,
        crisis_level="none",
        crisis_stage=None,
        crisis_actions=[],
    )
