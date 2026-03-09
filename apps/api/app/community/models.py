from __future__ import annotations

from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field


class BoardVisibilityStatus(str, Enum):
    visible = "visible"
    hidden_by_author = "hidden_by_author"
    hidden_by_moderator = "hidden_by_moderator"
    deleted = "deleted"


class BoardModerationStatus(str, Enum):
    clear = "clear"
    under_review = "under_review"
    auto_hidden = "auto_hidden"
    actioned = "actioned"


class BoardReportReasonCode(str, Enum):
    abuse = "abuse"
    hate = "hate"
    threat = "threat"
    sexual_harassment = "sexual_harassment"
    privacy = "privacy"
    spam = "spam"
    self_harm_signal = "self_harm_signal"
    violence_signal = "violence_signal"
    other = "other"


class ModerationQueueType(str, Enum):
    report = "report"
    hate = "hate"
    safety = "safety"


class BoardPostAuthor(BaseModel):
    author_user_id: str
    display_name: str
    is_staff: bool = False


class BoardPostEngagement(BaseModel):
    like_count: int = 0
    bookmark_count: int = 0
    comment_count: int = 0
    report_count: int = 0
    viewer_liked: bool = False
    viewer_bookmarked: bool = False


class BoardPostPayload(BaseModel):
    post_id: str
    feed_public_id: str
    title: str | None = None
    display_title: str | None = None
    body_text: str
    body_preview: str
    tag_ids: list[str] = Field(default_factory=list)
    image_urls: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime | None = None
    is_notice: bool = False
    is_pinned_notice: bool = False
    is_anonymous: bool = False
    visibility_status: BoardVisibilityStatus = BoardVisibilityStatus.visible
    moderation_status: BoardModerationStatus = BoardModerationStatus.clear


class BoardFeedItem(BaseModel):
    post: BoardPostPayload
    author: BoardPostAuthor
    engagement: BoardPostEngagement


class BoardListResponse(BaseModel):
    items: list[BoardFeedItem]
    next_cursor: str | None = None
    pinned_notice: BoardFeedItem | None = None


class BoardPostCreateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=60)
    body_text: str = Field(min_length=1, max_length=1500)
    is_anonymous: bool = False
    is_notice: bool = False
    is_pinned_notice: bool = False
    tag_ids: list[str] = Field(default_factory=list)
    image_urls: list[str] = Field(default_factory=list, max_length=4)


class BoardPostUpdateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=60)
    body_text: str = Field(min_length=1, max_length=1500)


class BoardToggleResponse(BaseModel):
    result: str


class BoardCommentCreateRequest(BaseModel):
    body_text: str = Field(min_length=1, max_length=1000)
    is_anonymous: bool = False


class BoardCommentPayload(BaseModel):
    comment_id: str
    post_id: str
    author_user_id: str
    body_text: str
    is_anonymous: bool
    visibility_status: str
    created_at: datetime
    updated_at: datetime | None = None


class BoardCommentListItem(BaseModel):
    comment_id: str
    post_id: str
    author_user_id: str
    author_display_name: str
    body_text: str
    is_anonymous: bool
    visibility_status: str
    created_at: datetime
    updated_at: datetime | None = None


class BoardReportRequest(BaseModel):
    reason_code: BoardReportReasonCode
    detail_text: str | None = Field(default=None, max_length=500)


class ModerationQueueItem(BaseModel):
    queue_item_id: str
    queue_type: ModerationQueueType
    target_type: str
    target_id: str
    target_public_id: str | None = None
    target_title: str | None = None
    target_preview: str | None = None
    source_type: str
    reason_code: str | None = None
    detail_text: str | None = None
    confidence: float | None = None
    status: str
    created_at: datetime


class ModerationQueueGroup(BaseModel):
    queue_type: ModerationQueueType
    queued_count: int
    items: list[ModerationQueueItem]


class ModerationQueuesResponse(BaseModel):
    groups: list[ModerationQueueGroup]


class ModerationActionCode(str, Enum):
    hide = "hide"
    restore = "restore"
    delete = "delete"
    dismiss = "dismiss"


class ModerationQueueTargetAuthor(BaseModel):
    user_id: str
    display_name: str
    is_anonymous: bool = False


class ModerationQueuePostTarget(BaseModel):
    post_id: str
    feed_public_id: str
    title: str | None = None
    body_text: str
    visibility_status: BoardVisibilityStatus
    moderation_status: BoardModerationStatus
    created_at: datetime
    updated_at: datetime | None = None
    author: ModerationQueueTargetAuthor


class ModerationQueueCommentTarget(BaseModel):
    comment_id: str
    post_id: str
    post_feed_public_id: str | None = None
    body_text: str
    visibility_status: str
    created_at: datetime
    updated_at: datetime | None = None
    author: ModerationQueueTargetAuthor


class ModerationQueueDetailResponse(BaseModel):
    item: ModerationQueueItem
    post: ModerationQueuePostTarget | None = None
    comment: ModerationQueueCommentTarget | None = None


class ModerationQueueActionRequest(BaseModel):
    action_code: ModerationActionCode


class ModerationQueueActionResponse(BaseModel):
    result: str
    queue_item_id: str
    status: str
    post_visibility_status: BoardVisibilityStatus | None = None
    post_moderation_status: BoardModerationStatus | None = None
    comment_visibility_status: str | None = None


class SupportTicketType(str, Enum):
    inquiry = "inquiry"
    feedback = "feedback"


class SupportTicketStatus(str, Enum):
    new = "new"
    waiting_admin = "waiting_admin"
    in_progress = "in_progress"
    answered = "answered"
    waiting_user = "waiting_user"
    reopened = "reopened"
    resolved = "resolved"
    closed = "closed"


class SupportTicketPriority(str, Enum):
    normal = "normal"
    important = "important"
    urgent = "urgent"


class SupportMessageAuthorType(str, Enum):
    user = "user"
    admin = "admin"
    system = "system"


class SupportTicketPayload(BaseModel):
    ticket_id: str
    user_id: str
    ticket_type: SupportTicketType
    title: str
    status: SupportTicketStatus
    category: str
    related_feature: str | None = None
    priority: SupportTicketPriority
    reply_requested: bool
    sensitive_queue_flag: bool
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None = None
    closed_at: datetime | None = None


class SupportMessagePayload(BaseModel):
    message_id: str
    ticket_id: str
    author_type: SupportMessageAuthorType
    author_id: str | None = None
    body: str
    created_at: datetime
    is_followup: bool = False
    internal_only: bool = False


class SupportNotificationPayload(BaseModel):
    notification_id: str
    recipient_type: str
    recipient_id: str
    ticket_id: str
    event_type: str
    is_read: bool
    created_at: datetime
    read_at: datetime | None = None


class SupportTicketListItem(BaseModel):
    ticket: SupportTicketPayload
    latest_message_at: datetime | None = None
    latest_message_preview: str | None = None


class SupportTicketDetailResponse(BaseModel):
    ticket: SupportTicketPayload
    messages: list[SupportMessagePayload]
    notifications: list[SupportNotificationPayload] = Field(default_factory=list)


class SupportTicketCreateRequest(BaseModel):
    ticket_type: SupportTicketType
    title: str = Field(min_length=1, max_length=60)
    category: str = Field(min_length=1, max_length=40)
    related_feature: str | None = Field(default=None, max_length=60)
    body: str = Field(min_length=1, max_length=2000)
    reply_requested: bool = True


class SupportFollowupRequest(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class SupportResolveResponse(BaseModel):
    result: str
    status: SupportTicketStatus


class SupportAdminReplyRequest(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    status: SupportTicketStatus = SupportTicketStatus.answered


class SupportNotificationListResponse(BaseModel):
    items: list[SupportNotificationPayload]


class SupportQueueSummaryResponse(BaseModel):
    status_counts: dict[str, int]
    urgent_count: int
    sensitive_count: int


class MyPageQuickLink(str, Enum):
    profile = "profile"
    security = "security"
    activity_log = "activity-log"
    bookmarks = "bookmarks"
    my_posts = "my-posts"
    my_comments = "my-comments"
    support_tickets = "support-tickets"
    report_vault = "report-vault"
    consents = "consents"


class MyPageProfileSummary(BaseModel):
    user_id: str
    nickname: str
    coach_name: str
    email_masked: str
    email_verified: bool
    created_at: datetime
    birth_year: int | None = None
    gender: str | None = None
    notification_preferences: dict[str, bool] = Field(default_factory=dict)


class MyPageActivitySummary(BaseModel):
    window_days: int
    checkin_days: int
    challenge_active_count: int
    challenge_completed_days: int
    cbt_sessions: int
    journal_days: int
    last_assessment_at: datetime | None = None


class MyPageTicketSummary(BaseModel):
    waiting_user_count: int
    answered_count: int
    reopened_count: int


class MyPageReportVaultItem(BaseModel):
    report_id: str
    created_at: datetime
    period_start: date
    period_end: date
    format: str
    file_name: str


class MyPageReportSummary(BaseModel):
    vault_count: int
    recent_reports: list[MyPageReportVaultItem]


class MyPageHomeResponse(BaseModel):
    profile: MyPageProfileSummary
    activity_summary: MyPageActivitySummary
    ticket_summary: MyPageTicketSummary
    report_summary: MyPageReportSummary
    quick_links: list[MyPageQuickLink]


class MyPageProfileUpdateRequest(BaseModel):
    nickname: str | None = Field(default=None, min_length=2, max_length=40)
    coach_name: str | None = Field(default=None, min_length=2, max_length=40)
    birth_year: int | None = Field(default=None, ge=1900, le=2100)
    gender: str | None = None


class MyPageProfileUpdateResponse(BaseModel):
    user_id: str
    nickname: str
    coach_name: str
    birth_year: int | None = None
    gender: str | None = None
    age_years_derived: int | None = None


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=6, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)
    new_password_confirm: str = Field(min_length=8, max_length=128)


class PasswordChangeResponse(BaseModel):
    result: str
    requires_firebase_action: bool
    message: str


class MyPagePostSummary(BaseModel):
    post_id: str
    feed_public_id: str
    title: str | None = None
    body_preview: str
    created_at: datetime


class MyPageCommentSummary(BaseModel):
    comment_id: str
    post_id: str
    feed_public_id: str
    post_title: str | None = None
    body_preview: str
    created_at: datetime


class MyPageConsentResponse(BaseModel):
    terms_required: bool
    privacy_required: bool
    sensitive_data_required: bool
    personalization_optional: bool
    model_improvement_optional: bool
    marketing_optional: bool


class MyPageConsentUpdateRequest(BaseModel):
    personalization_optional: bool | None = None
    model_improvement_optional: bool | None = None
    marketing_optional: bool | None = None
