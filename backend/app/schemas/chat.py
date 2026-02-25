from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, conint, constr

MessageStr = constr(min_length=1, max_length=1200)
ChallengeStr = constr(min_length=1, max_length=160)


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


class ChatTurn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    role: Literal["user", "assistant"]
    content: MessageStr


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    message: MessageStr = Field(description="사용자 입력 메시지")
    active_challenge: ChallengeStr | None = None
    challenge_phase: Literal["start", "continue", "reflect"] | None = None
    conversation_history: list[ChatTurn] = Field(default_factory=list)


class SummaryCard(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    situation: str
    self_blame_signal: str
    reframe: str
    next_action: str
    encouragement: str


class ChatResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    reply: str
    disclaimer: str
    timestamp: datetime
    extracted: ExtractedIndicators
    suggested_challenges: list[str]
    active_challenge: str | None = None
    challenge_step_prompt: str | None = None
    challenge_completed: bool = False
    completed_challenge: str | None = None
    completion_message: str | None = None
    summary_card: SummaryCard


class ChallengeRecommendResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    suggested_challenges: list[str]
    window_days: int
