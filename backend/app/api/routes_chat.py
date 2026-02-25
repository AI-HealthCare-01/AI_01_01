from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

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

    result = generate_cbt_reply(
        user_message=payload.message,
        active_challenge=payload.active_challenge,
        challenge_phase=payload.challenge_phase,
        conversation_history=[item.model_dump() for item in payload.conversation_history],
    )

    recent = await crud.list_recent_challenge_histories(db=db, user_id=current_user.id, days=int(policy["window_days"]))
    filtered_suggestions = pick_non_duplicate_challenges(
        llm_suggestions=result.suggested_challenges,
        recent_challenge_names=[h.challenge_name for h in recent],
        recent_techniques=[h.technique for h in recent],
        size=3,
        similarity_threshold=float(policy["similarity_threshold"]),
        repeatable_techniques=list(policy["repeatable_techniques"]),
    )

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
        active_challenge=result.active_challenge,
        challenge_step_prompt=result.challenge_step_prompt,
        challenge_completed=result.challenge_completed,
        completed_challenge=result.completed_challenge,
        completion_message=result.completion_message,
        disclaimer="이 정보는 참고용이며, 진단 아님 안내입니다.",
        timestamp=datetime.now(timezone.utc),
    )
