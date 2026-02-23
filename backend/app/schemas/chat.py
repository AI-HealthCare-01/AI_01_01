from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, conint, constr

MessageStr = constr(min_length=1, max_length=1200)


class DistortionMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    all_or_nothing_count: conint(ge=0, le=20) = 0
    catastrophizing_count: conint(ge=0, le=20) = 0
    mind_reading_count: conint(ge=0, le=20) = 0
    should_statements_count: conint(ge=0, le=20) = 0
    personalization_count: conint(ge=0, le=20) = 0
    overgeneralization_count: conint(ge=0, le=20) = 0


class ExtractedIndicators(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    distress_0_10: conint(ge=0, le=10)
    rumination_0_10: conint(ge=0, le=10)
    avoidance_0_10: conint(ge=0, le=10)
    sleep_difficulty_0_10: conint(ge=0, le=10)
    distortion: DistortionMetrics


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    message: MessageStr = Field(description="사용자 입력 메시지")


class ChatResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    reply: str
    disclaimer: str
    timestamp: datetime
    extracted: ExtractedIndicators
    suggested_challenges: list[str]
