from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, conint

LikertScore = conint(ge=0, le=3)


class PHQ9Answers(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    q1: LikertScore
    q2: LikertScore
    q3: LikertScore
    q4: LikertScore
    q5: LikertScore
    q6: LikertScore
    q7: LikertScore
    q8: LikertScore
    q9: LikertScore


class PHQ9CreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    answers: PHQ9Answers


class PHQ9AssessmentResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: UUID
    total_score: int
    severity: str
    description: str
    disclaimer: str = Field(default="이 결과는 참고용이며, 진단 아님 안내입니다.")
    created_at: datetime


class PHQ9AssessmentDetailResponse(PHQ9AssessmentResponse):
    answers: PHQ9Answers
