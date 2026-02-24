from pydantic import BaseModel, ConfigDict, Field


class AdminSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    total_users: int
    total_assessments: int
    high_risk_assessments: int
    assessments_today: int


class AdminUserItem(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: str
    email: str
    nickname: str
    created_at: str
    assessment_count: int
    latest_assessment_at: str | None = None


class AdminUserListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    page: int
    page_size: int
    total: int
    items: list[AdminUserItem]


class AdminAssessmentItem(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: str
    user_id: str
    user_email: str
    user_nickname: str
    type: str
    total_score: int
    severity: str
    created_at: str


class AdminAssessmentListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    page: int
    page_size: int
    total: int
    items: list[AdminAssessmentItem]


class AdminHighRiskItem(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    assessment_id: str
    user_id: str
    user_email: str
    user_nickname: str
    type: str
    total_score: int
    severity: str
    risk_reason: str
    created_at: str


class AdminHighRiskListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    total: int
    items: list[AdminHighRiskItem]


class AdminPagingQuery(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    page: int = Field(default=1, ge=1, le=2000)
    page_size: int = Field(default=20, ge=1, le=100)
