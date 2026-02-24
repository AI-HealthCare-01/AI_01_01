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
    # Request Example:
    # POST /chat/cbt
    # Authorization: Bearer <jwt>
    # {"message":"요즘 잠이 너무 안 오고, 다 망한 것 같아요."}
    #
    # Response Example:
    # 200
    # {"reply":"...","extracted":{...},"suggested_challenges":[...],"disclaimer":"참고용...","timestamp":"..."}
    result = generate_cbt_reply(payload.message)

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
        disclaimer="이 정보는 참고용이며, 진단 아님 안내입니다.",
        timestamp=datetime.now(timezone.utc),
    )
