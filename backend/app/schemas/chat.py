from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, constr

MessageStr = constr(min_length=1, max_length=500)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    message: MessageStr = Field(description="사용자 입력 메시지")


class ChatResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    reply: str
    disclaimer: str
    timestamp: datetime
