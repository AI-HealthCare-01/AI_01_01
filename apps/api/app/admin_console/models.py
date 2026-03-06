from __future__ import annotations

from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field


class AdminBaseRole(str, Enum):
    owner = "owner"
    admin = "admin"
    support = "support"


class AdminExtensionCode(str, Enum):
    analyst_ml_extension = "analyst_ml_extension"


class AdminExtensionStatus(str, Enum):
    requested = "requested"
    approved = "approved"
    rejected = "rejected"
    revoked = "revoked"


class AdminQueueCode(str, Enum):
    support_queue = "support_queue"
    moderation_queue = "moderation_queue"
    safety_queue = "safety_queue"
    ops_queue = "ops_queue"
    ml_queue = "ml_queue"


class AdminNotificationSeverity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class AdminNotificationStatus(str, Enum):
    unread = "unread"
    read = "read"
    resolved = "resolved"


class RestrictionReasonCode(str, Enum):
    abuse = "abuse"
    hate = "hate"
    threat = "threat"
    spam = "spam"
    safety = "safety"
    policy_violation = "policy_violation"
    other = "other"


class OwnerApprovalObjectType(str, Enum):
    policy_change = "policy_change"
    model_change = "model_change"


class OwnerApprovalStatus(str, Enum):
    pending_owner_approval = "pending_owner_approval"
    approved = "approved"
    rejected = "rejected"


class PolicyChangeStatus(str, Enum):
    draft = "draft"
    pending_owner_approval = "pending_owner_approval"
    approved = "approved"
    rejected = "rejected"
    applied = "applied"


class ModelChangeStatus(str, Enum):
    draft_experiment = "draft_experiment"
    training_running = "training_running"
    evaluation_ready = "evaluation_ready"
    pending_owner_approval = "pending_owner_approval"
    approved = "approved"
    rejected = "rejected"
    deployed = "deployed"
    rolled_back = "rolled_back"


class ModelRetrainingJobStatus(str, Enum):
    pending_owner_approval = "pending_owner_approval"
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class ModelRetrainingRunMode(str, Enum):
    dry_run = "dry_run"
    execute = "execute"


class PolicyDomain(str, Enum):
    challenge_policy = "challenge_policy"
    cbt_policy = "cbt_policy"
    survey_notification_policy = "survey_notification_policy"
    board_policy = "board_policy"
    journal_policy = "journal_policy"


class AdminActorContext(BaseModel):
    admin_user_id: str
    base_role: AdminBaseRole
    extension_codes: list[AdminExtensionCode] = Field(default_factory=list)

    @property
    def is_owner(self) -> bool:
        return self.base_role == AdminBaseRole.owner

    @property
    def is_admin_or_owner(self) -> bool:
        return self.base_role in {AdminBaseRole.owner, AdminBaseRole.admin}

    @property
    def has_analyst_ml_extension(self) -> bool:
        return AdminExtensionCode.analyst_ml_extension in self.extension_codes


class AdminMeResponse(BaseModel):
    actor: AdminActorContext
    permissions: list[str]


class AdminOverviewKpi(BaseModel):
    total_users: int
    dau: int
    wau: int
    mau: int
    signup_count_7d: int
    checkin_count_7d: int
    challenge_count_7d: int
    cbt_sessions_7d: int
    assessments_completed_7d: int
    support_unanswered_count: int
    support_reopened_count: int
    moderation_pending_count: int
    safety_pending_count: int


class AdminQueueSummaryItem(BaseModel):
    queue_code: AdminQueueCode
    count: int


class AdminOverviewResponse(BaseModel):
    kpis: AdminOverviewKpi
    queues: list[AdminQueueSummaryItem]


class AdminUserListItem(BaseModel):
    user_id: str
    nickname: str
    admin_role: AdminBaseRole | None = None
    created_at: datetime
    account_status: str
    recent_login_at: datetime | None = None
    access_days: int
    activity_count: int
    recent_checkin_at: datetime | None = None
    recent_challenge_activity_at: datetime | None = None
    recent_cbt_activity_at: datetime | None = None
    recent_assessment_at: datetime | None = None
    report_count: int
    support_ticket_count: int
    high_risk_flag: bool = False


class AdminUserListResponse(BaseModel):
    items: list[AdminUserListItem]


class AdminUserBanContextResponse(BaseModel):
    user_id: str
    email: str
    target_admin_role: AdminBaseRole | None = None
    recent_ips: list[str]


class RestrictionCreateRequest(BaseModel):
    target_user_id: str
    block_account: bool = False
    block_ip: bool = False
    target_ip: str | None = None
    reason_code: RestrictionReasonCode
    reason_detail: str | None = Field(default=None, max_length=500)
    ends_at: datetime | None = None


class RestrictionActionResponse(BaseModel):
    action_id: str
    target_user_id: str
    block_account: bool
    block_ip: bool
    target_ip: str | None = None
    reason_code: RestrictionReasonCode
    reason_detail: str | None = None
    starts_at: datetime
    ends_at: datetime | None = None
    created_by_admin_user_id: str


class AdminSupportQueueItem(BaseModel):
    ticket_id: str
    user_id: str
    user_email: str
    user_nickname: str
    ticket_type: str
    title: str
    status: str
    priority: str
    sensitive_queue_flag: bool
    updated_at: datetime


class AdminSupportQueueResponse(BaseModel):
    items: list[AdminSupportQueueItem]


class PolicyDraftCreateRequest(BaseModel):
    policy_domain: PolicyDomain
    title: str = Field(min_length=1, max_length=80)
    draft_json: dict[str, object] = Field(default_factory=dict)


class PolicyDraftUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=80)
    draft_json: dict[str, object] | None = None


class PolicyChangeRecord(BaseModel):
    policy_change_id: str
    policy_domain: PolicyDomain
    title: str
    draft_json: dict[str, object]
    status: PolicyChangeStatus
    requested_by_admin_user_id: str
    requested_at: datetime
    decided_by_owner_user_id: str | None = None
    decided_at: datetime | None = None
    decision_note: str | None = None
    applied_at: datetime | None = None


class ModelChangeCreateRequest(BaseModel):
    model_name: str = Field(min_length=1, max_length=80)
    experiment_name: str = Field(min_length=1, max_length=120)
    change_summary: str = Field(min_length=1, max_length=500)
    metrics_json: dict[str, object] = Field(default_factory=dict)


class ModelChangeTransitionRequest(BaseModel):
    next_status: ModelChangeStatus


class ModelChangeRecord(BaseModel):
    model_change_id: str
    model_name: str
    experiment_name: str
    change_summary: str
    metrics_json: dict[str, object]
    status: ModelChangeStatus
    requested_by_admin_user_id: str
    requested_at: datetime
    decided_by_owner_user_id: str | None = None
    decided_at: datetime | None = None
    decision_note: str | None = None
    deployed_at: datetime | None = None
    rolled_back_at: datetime | None = None


class ModelRetrainingJobCreateRequest(BaseModel):
    mode: ModelRetrainingRunMode = ModelRetrainingRunMode.dry_run
    training_window_days: int = Field(default=84, ge=28, le=365)
    data_range_start_date: date | None = None
    data_range_end_date: date | None = None
    include_synthetic_data: bool = True
    require_min_account_age_days_28: bool = True
    require_second_assessment_completion: bool = True
    use_pre_assessment_window_28d: bool = True
    keep_user_after_eligibility: bool = True
    selected_feature_keys: list[str] = Field(default_factory=list)
    dataset_snapshot_id: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=500)


class ModelRetrainingJobTransitionRequest(BaseModel):
    next_status: ModelRetrainingJobStatus
    artifact_uri: str | None = Field(default=None, max_length=200)
    result_summary: dict[str, object] = Field(default_factory=dict)
    failure_reason: str | None = Field(default=None, max_length=500)


class ModelRetrainingJobRecord(BaseModel):
    job_id: str
    model_change_id: str
    model_name: str
    status: ModelRetrainingJobStatus
    mode: ModelRetrainingRunMode
    training_window_days: int
    include_synthetic_data: bool
    dataset_snapshot_id: str | None
    note: str | None
    requested_by_admin_user_id: str
    requested_at: datetime
    approved_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    artifact_uri: str | None = None
    result_summary: dict[str, object] = Field(default_factory=dict)
    failure_reason: str | None = None


class OwnerApprovalSubmitRequest(BaseModel):
    object_type: OwnerApprovalObjectType
    object_id: str


class OwnerApprovalDecision(str, Enum):
    approved = "approved"
    rejected = "rejected"


class OwnerApprovalDecisionRequest(BaseModel):
    decision: OwnerApprovalDecision
    decision_note: str | None = Field(default=None, max_length=500)


class OwnerApprovalRecord(BaseModel):
    approval_id: str
    object_type: OwnerApprovalObjectType
    object_id: str
    status: OwnerApprovalStatus
    requested_by_admin_user_id: str
    requested_at: datetime
    decided_by_owner_user_id: str | None = None
    decided_at: datetime | None = None
    decision_note: str | None = None


class ExtensionRequestCreateRequest(BaseModel):
    extension_code: AdminExtensionCode = AdminExtensionCode.analyst_ml_extension
    note: str | None = Field(default=None, max_length=500)


class ExtensionDecision(str, Enum):
    approved = "approved"
    rejected = "rejected"
    revoked = "revoked"


class ExtensionDecisionRequest(BaseModel):
    decision: ExtensionDecision
    note: str | None = Field(default=None, max_length=500)


class ExtensionRecord(BaseModel):
    extension_id: str
    admin_user_id: str
    extension_code: AdminExtensionCode
    status: AdminExtensionStatus
    requested_at: datetime
    approved_at: datetime | None = None
    approved_by: str | None = None
    note: str | None = None


class AdminRoleAssignRequest(BaseModel):
    base_role: AdminBaseRole


class AdminRoleRecord(BaseModel):
    admin_user_id: str
    base_role: AdminBaseRole
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AdminRoleListItem(BaseModel):
    role: AdminRoleRecord
    extension_status: ExtensionRecord | None = None


class AdminRoleListResponse(BaseModel):
    items: list[AdminRoleListItem]


class AuditLogRecord(BaseModel):
    audit_id: str
    actor_admin_user_id: str
    actor_role: str
    action_type: str
    target_type: str
    target_id: str
    metadata_json: dict[str, object] = Field(default_factory=dict)
    created_at: datetime


class AuditLogListResponse(BaseModel):
    items: list[AuditLogRecord]
