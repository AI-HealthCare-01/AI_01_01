from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes_auth import get_current_user
from app.db import crud
from app.db.session import get_db
from app.schemas.auth import UserOut
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.llm import generate_cbt_reply

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/cbt", response_model=ChatResponse)
async def chat_cbt(
    payload: ChatRequest,
    current_user: UserOut = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    result = generate_cbt_reply(
        user_message=payload.message,
        active_challenge=payload.active_challenge,
        challenge_phase=payload.challenge_phase,
        conversation_history=[item.model_dump() for item in payload.conversation_history],
    )

    await crud.create_chat_event(
        db=db,
        user_id=current_user.id,
        user_message=payload.message,
        assistant_reply=result.reply,
        extracted=result.extracted,
        suggested_challenges=result.suggested_challenges,
    )

    return ChatResponse(
        reply=result.reply,
        extracted=result.extracted,
        suggested_challenges=result.suggested_challenges,
        summary_card=result.summary_card,
        active_challenge=result.active_challenge,
        challenge_step_prompt=result.challenge_step_prompt,
        challenge_completed=result.challenge_completed,
        completed_challenge=result.completed_challenge,
        completion_message=result.completion_message,
        disclaimer="이 정보는 참고용이며, 진단 아님 안내입니다.",
        timestamp=datetime.now(timezone.utc),
    )
