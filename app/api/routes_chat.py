from datetime import datetime, timezone

from fastapi import APIRouter

from app.schemas.chat import ChatRequest, ChatResponse
from app.services.llm import generate_supportive_reply

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    # Request Example:
    # POST /chat
    # {"message":"오늘 기분이 너무 가라앉아요."}
    #
    # Response Example:
    # 200
    # {"reply":"...","disclaimer":"이 정보는 참고용이며, 진단 아님 안내입니다.","timestamp":"..."}
    return ChatResponse(
        reply=generate_supportive_reply(payload.message),
        disclaimer="이 정보는 참고용이며, 진단 아님 안내입니다.",
        timestamp=datetime.now(timezone.utc),
    )
