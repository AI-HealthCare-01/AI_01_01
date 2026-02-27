from datetime import datetime, timezone

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
HIGH_RISK_KEYWORDS = [
    "자살", "자해", "죽고 싶", "죽고싶", "목숨", "해치고 싶", "kill myself", "suicide", "self-harm",
]
MEDIUM_RISK_KEYWORDS = [
    "살기 싫", "버티기 힘들", "절망", "공황", "패닉", "극심한 불안", "불면", "무가치", "hopeless", "panic",
]
MODERATE_PLUS_KEYWORDS = [
    "가치없", "의미없", "필요없", "없어도 상관", "쓸모없",
    "나는 무능", "나는 문제", "난 망했", "난 항상", "난 결국",
    "계속 생각나", "멈출 수가", "또 떠올라", "반복", "지쳐",
    "아무 감정", "무기력", "아무것도 하기 싫", "텅 빈",
]

CHALLENGE_CANDIDATE_RULES = {
    "ANXIETY": ["SENSORY_MEDITATION", "MEDITATION_5MIN", "RHYTHM_GAME"],
    "LOW_ENERGY": ["SUNLIGHT_5MIN_3D", "WALK_10MIN_3D", "WEEKLY_MINI_CHALLENGE"],
    "SLEEP": ["SLEEP_HYGIENE_ROUTINE", "MORNING_PATTERN", "JOURNAL_STREAK"],
    "RELATION_SELFBLAME": ["GRATITUDE_LOTTERY", "IPT_SUPPORTERS_MAP", "JOURNAL_STREAK"],
}


def _classify_risk_level(message: str) -> str:
    text = message.lower()
    if any(k in text for k in HIGH_RISK_KEYWORDS):
        return "HIGH"
    if any(k in text for k in MEDIUM_RISK_KEYWORDS):
        return "MEDIUM"
    return "LOW"


def _is_moderate_plus(message: str) -> bool:
    text = message.lower()
    return any(k in text for k in MODERATE_PLUS_KEYWORDS)


def _build_challenge_candidates(message: str, moderate_plus: bool) -> list[str]:
    text = message.lower()
    candidates: list[str] = []

    def extend_unique(items: list[str]) -> None:
        for item in items:
            if item not in candidates:
                candidates.append(item)

    if any(k in text for k in ["불안", "숨막", "멍", "초조"]):
        extend_unique(CHALLENGE_CANDIDATE_RULES["ANXIETY"])
    if any(k in text for k in ["무기력", "하기싫", "텅빈", "우울"]):
        extend_unique(CHALLENGE_CANDIDATE_RULES["LOW_ENERGY"])
    if any(k in text for k in ["잠", "불면", "잠들기", "수면"]):
        extend_unique(CHALLENGE_CANDIDATE_RULES["SLEEP"])
    if any(k in text for k in ["혼자", "관계", "미움", "자기비난", "내가 다 잘못"]):
        extend_unique(CHALLENGE_CANDIDATE_RULES["RELATION_SELFBLAME"])

    if moderate_plus and not candidates:
        extend_unique(CHALLENGE_CANDIDATE_RULES["LOW_ENERGY"])
    return candidates[:4]


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
    moderate_plus = _is_moderate_plus(payload.message)
    challenge_candidates = payload.challenge_candidates or _build_challenge_candidates(payload.message, moderate_plus)
    if (payload.cbt_phase == "ACTION" or payload.active_challenge) and not challenge_candidates:
        challenge_candidates = CHALLENGE_CANDIDATE_RULES["LOW_ENERGY"][:2]

    if risk_level == "HIGH":
        safe_reply = (
            "지금 안전이 가장 중요해요. 혼자 버티지 말고 즉시 주변의 신뢰할 수 있는 사람이나 응급 지원에 연락해 주세요. "
            "한국이라면 119(응급), 112(위기), 1393(자살예방 상담)으로 바로 도움을 요청할 수 있어요."
        )
        extracted = {
            "distress_0_10": 10,
            "rumination_0_10": 8,
            "avoidance_0_10": 7,
            "sleep_difficulty_0_10": 7,
            "distortion": {
                "all_or_nothing_count": 0,
                "catastrophizing_count": 0,
                "mind_reading_count": 0,
                "should_statements_count": 0,
                "personalization_count": 0,
                "overgeneralization_count": 0,
            },
            "distortions": ["catastrophizing", "labeling_negative_identity"],
        }
        summary_card = {
            "situation": payload.message[:120],
            "self_blame_signal": "고위험 신호가 관찰되어 즉시 안전 확보가 필요합니다.",
            "reframe": "지금의 고통은 도움을 받을 가치가 있는 상태입니다.",
            "next_action": "주변 지지자 1명 또는 119/112/1393 중 한 곳에 즉시 연락하세요.",
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
        )

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
        challenge_candidates=challenge_candidates,
        conversation_history=[item.model_dump() for item in payload.conversation_history],
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
    if (moderate_plus or (result.cbt_phase or "THOUGHT") == "ACTION") and not filtered_suggestions:
        filtered_suggestions = challenge_candidates[:1]

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
        summary_card=result.summary_card,
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
    )
