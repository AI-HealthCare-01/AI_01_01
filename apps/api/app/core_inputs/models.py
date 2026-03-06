from __future__ import annotations

from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field


class CheckinStatus(str, Enum):
    draft = "draft"
    submitted = "submitted"
    skipped = "skipped"


class CompletionMode(str, Enum):
    full = "full"
    partial = "partial"
    reminder_submit = "reminder_submit"


class SleepTotalBucket(str, Enum):
    lt_4h = "lt_4h"
    h4_5 = "h4_5"
    h5_6 = "h5_6"
    h6_7 = "h6_7"
    h7_8 = "h7_8"
    ge_8h = "ge_8h"


class SleepLatencyBucket(str, Enum):
    le_15m = "le_15m"
    m15_30 = "m15_30"
    m30_60 = "m30_60"
    ge_60m = "ge_60m"


class DaylightBucket(str, Enum):
    m0 = "m0"
    m1_9 = "m1_9"
    m10_29 = "m10_29"
    ge_30 = "ge_30"


class ExerciseBucket(str, Enum):
    m0 = "m0"
    m1_9 = "m1_9"
    m10_29 = "m10_29"
    ge_30 = "ge_30"


class AlcoholBucket(str, Enum):
    none = "none"
    one = "one"
    two_three = "two_three"
    ge_four = "ge_four"


class CheckinPayload(BaseModel):
    date: date
    sleep_total_bucket: SleepTotalBucket
    wake_time_local: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    sleep_latency_bucket: SleepLatencyBucket
    mood_1_5: int = Field(ge=1, le=5)
    anxiety_1_5: int = Field(ge=1, le=5)
    energy_1_5: int = Field(ge=1, le=5)
    daylight_bucket: DaylightBucket
    exercise_bucket: ExerciseBucket
    alcohol_bucket: AlcoholBucket
    caffeine_after_2pm_flag: bool
    timezone: str = "Asia/Seoul"
    completion_mode: CompletionMode = CompletionMode.full


class CheckinRecordResponse(BaseModel):
    date: date
    status: CheckinStatus
    current_version_no: int
    payload: CheckinPayload | None
    checked_at: datetime | None


class CheckinFeatureBundleResponse(BaseModel):
    date: date
    mood_1_5: int | None
    anxiety_1_5: int | None
    energy_1_5: int | None
    sleep_total_midpoint_hours: float | None
    sleep_latency_midpoint_minutes: float | None
    days_since_prev_checkin: int | None
    missing_checkin_days_7d: int
    missing_checkin_days_28d: int


class AssessmentSource(str, Enum):
    onboarding = "onboarding"
    day28_reminder = "28day_reminder"
    manual_start = "manual_start"
    clinician_request = "clinician_request"
    other = "other"


class AssessmentStatus(str, Enum):
    draft = "draft"
    completed = "completed"
    late = "late"
    missed = "missed"
    skipped = "skipped"


class AssessmentInstrument(str, Enum):
    phq9 = "phq9"
    gad7 = "gad7"
    isi = "isi"


class AssessmentStartRequest(BaseModel):
    source: AssessmentSource
    scheduled_for: date | None = None


class AssessmentAnswerRequest(BaseModel):
    instrument: AssessmentInstrument
    item_code: str
    response_score: int


class AssessmentSessionResponse(BaseModel):
    assessment_id: str
    user_id: str
    scheduled_for: date | None
    started_at: datetime
    completed_at: datetime | None
    status: AssessmentStatus
    recommended_cycle_days: int
    source: AssessmentSource
    scores: dict[str, int | str | bool | None]


class ChallengeType(str, Enum):
    sustained = "sustained"
    one_time = "one_time"


class ChallengeProgramType(str, Enum):
    one_time = "one_time"
    streak = "streak"
    step_up = "step_up"
    guided_reflection = "guided_reflection"
    bundle_weekly = "bundle_weekly"


class ChallengeSessionStatus(str, Enum):
    recommended = "recommended"
    available = "available"
    active = "active"
    paused = "paused"
    completed = "completed"
    dropped = "dropped"


class ChallengeStatus(str, Enum):
    active = "active"
    paused = "paused"
    completed = "completed"
    dropped = "dropped"


class ChallengeDayStatus(str, Enum):
    pending = "pending"
    done = "done"
    skipped = "skipped"
    late = "late"
    missed = "missed"


class ChallengeCatalogItem(BaseModel):
    challenge_id: str
    name_ko: str
    status: str
    domain: str
    challenge_type: ChallengeType
    program_type: ChallengeProgramType
    default_target_days: int
    difficulty_level: str
    summary_ko: str


class ChallengeRecommendationItem(ChallengeCatalogItem):
    session_status: ChallengeSessionStatus
    reason_code: str | None = None
    reason_copy_ko: str | None = None


class ChallengeExposureRequest(BaseModel):
    challenge_id: str
    exposure_type: str = Field(pattern=r"^(shown|browse)$")
    response_type: str | None = Field(default=None, pattern=r"^(accepted|declined|ignored)$")
    reason_text: str | None = None


class ChallengeEnrollmentCreateRequest(BaseModel):
    challenge_id: str
    start_date: date | None = None
    target_days: int | None = Field(default=None, ge=1, le=28)
    reminder_time_local: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    motivation_note: str | None = Field(default=None, max_length=280)


class ChallengeEnrollmentUpdateRequest(BaseModel):
    status: ChallengeStatus
    dropout_reason_code: str | None = None


class ChallengeEnrollmentResponse(BaseModel):
    enrollment_id: str
    challenge_id: str
    challenge_name: str
    domain: str
    challenge_type: ChallengeType
    program_type: ChallengeProgramType
    status: ChallengeStatus
    session_status: ChallengeSessionStatus
    target_days: int
    scheduled_start_date: date
    scheduled_end_date: date
    reminder_time_local: str | None = None
    started_at: datetime
    ended_at: datetime | None
    done_days: int | None = None
    last_completed_date: date | None = None
    completed_today_flag: bool | None = None
    stale_after_today_flag: bool | None = None


class ChallengeDayLogRequest(BaseModel):
    enrollment_id: str
    date: date
    completed_flag: bool
    day_status: ChallengeDayStatus | None = None
    helpfulness_score_1_5: int | None = Field(default=None, ge=1, le=5)
    pre_mood_1_5: int | None = Field(default=None, ge=1, le=5)
    pre_anxiety_1_5: int | None = Field(default=None, ge=1, le=5)
    post_mood_1_5: int | None = Field(default=None, ge=1, le=5)
    post_anxiety_1_5: int | None = Field(default=None, ge=1, le=5)
    helpfulness_0_10: int | None = Field(default=None, ge=0, le=10)
    effort_0_10: int | None = Field(default=None, ge=0, le=10)
    reflection_note: str | None = Field(default=None, max_length=500)
    skipped_reason_code: str | None = None


class ChallengeDayExecuteRequest(BaseModel):
    date: date
    pre_mood_1_5: int | None = Field(default=None, ge=1, le=5)
    pre_anxiety_1_5: int | None = Field(default=None, ge=1, le=5)
    day_status: ChallengeDayStatus = ChallengeDayStatus.pending
    skipped_reason_code: str | None = None


class ChallengeReflectionRequest(BaseModel):
    date: date
    result_status: ChallengeDayStatus = ChallengeDayStatus.done
    post_mood_1_5: int | None = Field(default=None, ge=1, le=5)
    post_anxiety_1_5: int | None = Field(default=None, ge=1, le=5)
    helpfulness_0_10: int | None = Field(default=None, ge=0, le=10)
    effort_0_10: int | None = Field(default=None, ge=0, le=10)
    reflection_note: str | None = Field(default=None, max_length=500)
    skipped_reason_code: str | None = None


class ChallengeDayLogResponse(BaseModel):
    day_log_id: str
    enrollment_id: str
    challenge_id: str
    date: date
    day_status: ChallengeDayStatus
    completed_flag: bool
    pre_mood_1_5: int | None = None
    pre_anxiety_1_5: int | None = None
    post_mood_1_5: int | None = None
    post_anxiety_1_5: int | None = None
    helpfulness_0_10: int | None = None
    effort_0_10: int | None = None
    reflection_note: str | None = None
    skipped_reason_code: str | None = None
    created_at: datetime
    updated_at: datetime


class ChallengeProgressDayItem(BaseModel):
    date: date
    day_number: int
    day_status: ChallengeDayStatus
    completed_flag: bool
    detail: ChallengeDayLogResponse | None = None


class ChallengeEnrollmentDetailResponse(BaseModel):
    enrollment: ChallengeEnrollmentResponse
    challenge: ChallengeCatalogItem
    recommendation: ChallengeRecommendationItem | None = None
    template_steps: list[str]
    progress_days: list[ChallengeProgressDayItem]
    progress_ratio: float
    done_days: int
    remaining_days: int


class ChallengeCatalogDetailResponse(BaseModel):
    challenge: ChallengeCatalogItem
    session_status: ChallengeSessionStatus
    recommendation: ChallengeRecommendationItem | None = None
    active_enrollment: ChallengeEnrollmentResponse | None = None
    latest_enrollment: ChallengeEnrollmentResponse | None = None
    template_steps: list[str]


class JournalStatus(str, Enum):
    active = "active"
    deleted = "deleted"


class JournalCreateRequest(BaseModel):
    entry_date: date | None = None
    title: str | None = Field(default=None, max_length=100)
    category_tags: list[str] = Field(default_factory=list, max_length=8)
    body: str = Field(min_length=1, max_length=5000)


class JournalUpdateRequest(BaseModel):
    entry_date: date | None = None
    title: str | None = Field(default=None, max_length=100)
    category_tags: list[str] | None = Field(default=None, max_length=8)
    body: str | None = Field(default=None, min_length=1, max_length=5000)


class JournalEntryResponse(BaseModel):
    journal_id: str
    user_id: str
    entry_date: date
    title: str | None
    category_tags: list[str] = Field(default_factory=list)
    searchable_category_tags: list[str] = Field(default_factory=list)
    body: str
    preview_text: str
    status: JournalStatus
    created_at: datetime
    updated_at: datetime


class JournalListItemResponse(BaseModel):
    journal_id: str
    user_id: str
    entry_date: date
    title: str | None
    category_tags: list[str] = Field(default_factory=list)
    searchable_category_tags: list[str] = Field(default_factory=list)
    preview_text: str
    status: JournalStatus
    created_at: datetime
    updated_at: datetime


class JournalCategoryOptionsResponse(BaseModel):
    active_tags: list[str] = Field(default_factory=list)
    inactive_used_tags: list[str] = Field(default_factory=list)


class ActivityFilter(str, Enum):
    all = "all"
    checkin = "checkin"
    challenge = "challenge"
    cbt = "cbt"
    journal = "journal"
    assessment = "assessment"


class ActivityView(str, Enum):
    list = "list"
    calendar = "calendar"


class UserDayActivityItem(BaseModel):
    activity_type: ActivityFilter
    display_label: str
    preview_text: str | None
    count: int | None
    detail_route: str


class UserDayActivitySummary(BaseModel):
    has_checkin: bool
    has_challenge_activity: bool
    challenge_completed_count: int
    active_challenge_count: int
    has_cbt_activity: bool
    cbt_session_count: int
    has_journal_entry: bool
    journal_entry_count: int
    has_assessment: bool
    activity_count_total: int


class UserDayActivityLogResponse(BaseModel):
    user_id: str
    date: date
    summary: UserDayActivitySummary
    items: list[UserDayActivityItem]
