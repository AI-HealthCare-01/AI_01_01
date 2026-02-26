from pydantic import BaseModel, ConfigDict, Field, conlist


class AdminSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    total_users: int
    total_assessments: int
    high_risk_assessments: int
    assessments_today: int
    board_question_feedback_alerts: int = 0
    today_visitors: int = 0
    login_users_today: int = 0


class AdminUserItem(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: str
    email: str
    nickname: str
    created_at: str
    assessment_count: int
    login_count: int = 0
    login_days: int = 0
    latest_login_ip: str | None = None
    board_post_count: int = 0
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
    occurred_at: str
    dep_score: float | None = None
    anx_score: float | None = None
    ins_score: float | None = None
    composite_score: float | None = None
    major_risk_factors: str
    type: str | None = None
    total_score: int | None = None
    severity: str | None = None


class AdminHighRiskListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    total: int
    items: list[AdminHighRiskItem]


class AdminNotificationItem(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: str
    type: str
    title: str
    message: str
    ref_post_id: str | None
    is_read: bool
    created_at: str


class AdminNotificationListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    total: int
    items: list[AdminNotificationItem]


class AdminChallengePolicyResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    window_days: int = Field(ge=1, le=60)
    similarity_threshold: float = Field(ge=0.2, le=0.95)
    repeatable_techniques: conlist(str, min_length=1, max_length=20)


class AdminChallengePolicyUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    window_days: int = Field(ge=1, le=60)
    similarity_threshold: float = Field(ge=0.2, le=0.95)
    repeatable_techniques: conlist(str, min_length=1, max_length=20)


class AdminChallengePolicyAuditItem(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: str
    actor_email: str
    actor_nickname: str | None
    created_at: str
    before_json: dict
    after_json: dict
    diff_json: dict


class AdminChallengePolicyAuditListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    total: int
    items: list[AdminChallengePolicyAuditItem]


class AdminAccountItem(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    email: str
    source: str
    is_owner: bool = False


class AdminAccountListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    total: int
    owner_email: str | None = None
    current_user_is_owner: bool = False
    items: list[AdminAccountItem]


class AdminAccountAddRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    email: str = Field(min_length=5, max_length=320)


class AdminAccountSearchUserItem(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: str
    email: str
    nickname: str


class AdminAccountSearchUserListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    total: int
    items: list[AdminAccountSearchUserItem]


class AdminGrantHistoryItem(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    granted_at: str
    granted_by_email: str
    granted_by_nickname: str | None
    granted_to_email: str


class AdminGrantHistoryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    total: int
    items: list[AdminGrantHistoryItem]


class AdminBlockedIPItem(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: str
    ip_address: str
    reason: str | None = None
    is_active: bool
    created_at: str


class AdminBlockedIPListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    total: int
    items: list[AdminBlockedIPItem]


class AdminBlockedIPCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    ip_address: str = Field(min_length=3, max_length=64)
    reason: str | None = Field(default=None, max_length=200)


class AdminBlockedEmailItem(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    email: str
    reason: str | None = None
    blocked_at: str


class AdminBlockedEmailListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    total: int
    items: list[AdminBlockedEmailItem]


class AdminBlockedEmailCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    email: str = Field(min_length=5, max_length=320)
    reason: str | None = Field(default=None, max_length=200)


class AdminBoardRiskKeywordsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    keywords: list[str]


class AdminBoardRiskKeywordsUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    keywords: conlist(str, min_length=1, max_length=80)


class PendingReplyPostItem(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    post_id: str
    category: str
    title: str
    author_nickname: str
    created_at: str


class PendingReplyPostListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    total: int
    items: list[PendingReplyPostItem]


class AdminPagingQuery(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    page: int = Field(default=1, ge=1, le=2000)
    page_size: int = Field(default=20, ge=1, le=100)
