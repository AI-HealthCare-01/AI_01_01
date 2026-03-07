from __future__ import annotations

from datetime import date as DateType
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class CbtPlannerAction(str, Enum):
    review_evidence = "review_evidence"
    behavior_experiment = "behavior_experiment"
    grounding = "grounding"
    activity_scheduling = "activity_scheduling"
    sleep_anchor = "sleep_anchor"
    support_contact = "support_contact"


class CbtActionKind(str, Enum):
    external = "external"
    challenge = "challenge"
    none = "none"


class CbtReflectionStatus(str, Enum):
    pending = "pending"
    completed = "completed"
    not_applicable = "not_applicable"


class CbtRiskSource(str, Enum):
    cbt_session = "cbt_session"
    manual_review = "manual_review"
    system_rule = "system_rule"


class CbtRiskFlags(BaseModel):
    functional_impairment_flag: bool = False
    self_harm_flag: bool = False
    suicide_risk_level: int = Field(default=0, ge=0, le=3)
    violence_risk_flag: bool = False


class CbtConversationRole(str, Enum):
    user = "user"
    assistant = "assistant"


class CbtConversationMessage(BaseModel):
    role: CbtConversationRole
    content: str = Field(min_length=1, max_length=2000)
    sender_name: str | None = Field(default=None, min_length=1, max_length=60)


class CbtConversationActionLink(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    route: str = Field(min_length=1, max_length=200)


class CbtQuickReplyType(str, Enum):
    prefill = "prefill"
    action = "action"


class CbtQuickReplyItem(BaseModel):
    type: CbtQuickReplyType
    label: str = Field(min_length=1, max_length=80)
    fill_text: str | None = Field(default=None, min_length=1, max_length=120)
    action_id: str | None = Field(default=None, min_length=1, max_length=80)


class CbtSessionStage(str, Enum):
    situation = "situation"
    emotion = "emotion"
    thought = "thought"
    evidence = "evidence"
    alternative_plan = "alternative_plan"
    summary = "summary"
    # Backward compatibility for old clients.
    reframe = "reframe"
    action = "action"


class CbtConversationTurnRequest(BaseModel):
    messages: list[CbtConversationMessage] = Field(default_factory=list, min_length=1, max_length=24)
    state: dict[str, Any] = Field(default_factory=dict)
    current_stage: CbtSessionStage | None = None
    user_input: str | None = Field(default=None, min_length=1, max_length=2000)
    quick_reply_action_id: str | None = Field(default=None, min_length=1, max_length=80)
    # Backward compatibility for old web clients.
    selected_quick_reply: str | None = Field(default=None, min_length=1, max_length=120)


class CbtConversationTurnResponse(BaseModel):
    assistant_message: str
    assistant_messages: list[CbtConversationMessage] = Field(default_factory=list)
    structured_state_draft: dict[str, Any]
    planner_action: CbtPlannerAction
    current_stage: CbtSessionStage
    phase_key: CbtSessionStage
    subphase_key: str = Field(default="main", min_length=1, max_length=60)
    phase_index: int = Field(ge=0, le=5)
    quick_replies: list[CbtQuickReplyItem] = Field(default_factory=list)
    action_links: list[CbtConversationActionLink] = Field(default_factory=list)
    state_repeat_count: int = 0
    fallback_reason: str | None = None
    conversation_closed: bool = False
    requires_today_record: bool = False
    today_record_route: str | None = None
    risk_level: int = Field(ge=0, le=3)
    safety_first: bool
    safety_message: str | None
    emotion_intensity_pre_0_100: int | None = Field(default=None, ge=0, le=100)
    emotion_intensity_post_0_100: int | None = Field(default=None, ge=0, le=100)
    belief_pre_0_100: int | None = Field(default=None, ge=0, le=100)
    belief_post_0_100: int | None = Field(default=None, ge=0, le=100)
    homework_commitment_0_10: int | None = Field(default=None, ge=0, le=10)
    session_helpfulness_0_10: int | None = Field(default=None, ge=0, le=10)


class CbtSessionCreateRequest(BaseModel):
    date: DateType | None = None
    state: dict[str, Any] = Field(default_factory=dict)
    conversation: list[CbtConversationMessage] = Field(default_factory=list, max_length=24)
    duration_sec: int | None = Field(default=None, ge=0)
    emotion_intensity_pre_0_100: int | None = Field(default=None, ge=0, le=100)
    emotion_intensity_post_0_100: int | None = Field(default=None, ge=0, le=100)
    belief_pre_0_100: int | None = Field(default=None, ge=0, le=100)
    belief_post_0_100: int | None = Field(default=None, ge=0, le=100)
    reframe_quality_0_5: int | None = Field(default=None, ge=0, le=5)
    homework_commitment_0_10: int | None = Field(default=None, ge=0, le=10)
    homework_completed_prev_flag: bool = False
    session_helpfulness_0_10: int | None = Field(default=None, ge=0, le=10)
    planner_action: CbtPlannerAction | None = None
    selected_action_kind: CbtActionKind | None = None
    selected_action_title: str | None = Field(default=None, min_length=1, max_length=120)
    selected_action_description: str | None = Field(default=None, max_length=400)
    selected_action_route: str | None = Field(default=None, max_length=200)


class CbtConversationBootstrapResponse(BaseModel):
    structured_state_draft: dict[str, Any]
    current_stage: CbtSessionStage
    phase_key: CbtSessionStage
    subphase_key: str = Field(default="main", min_length=1, max_length=60)
    phase_index: int = Field(ge=0, le=5)
    assistant_messages: list[CbtConversationMessage]
    quick_replies: list[CbtQuickReplyItem] = Field(default_factory=list)
    action_links: list[CbtConversationActionLink] = Field(default_factory=list)
    requires_today_record: bool = False
    today_record_route: str | None = None


class CbtReflectionUpsertRequest(BaseModel):
    performed: bool
    reflection_note: str = Field(min_length=1, max_length=2000)


class CbtTodoUpsertRequest(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=400)
    kind: CbtActionKind = CbtActionKind.external
    route: str | None = Field(default=None, max_length=200)


class CbtSessionSummaryCard(BaseModel):
    emotion_shift: int | None
    belief_shift: int | None
    distortion_total_count: int
    topic_label: str
    helpfulness_0_10: int | None
    planner_action: CbtPlannerAction
    selected_action_kind: CbtActionKind
    selected_action_title: str
    selected_action_description: str | None
    selected_action_route: str | None
    reflection_status: CbtReflectionStatus
    reflection_performed_flag: bool | None
    reflection_note: str | None
    thought_summary: str | None
    core_belief_summary: str | None
    evidence_summary: str | None
    balanced_statement_summary: str | None


class CbtRiskSignalResponse(BaseModel):
    risk_signal_id: str
    user_id: str
    date: DateType
    functional_impairment_flag: bool
    self_harm_flag: bool
    suicide_risk_level: int
    violence_risk_flag: bool
    risk_source: CbtRiskSource
    created_at: datetime


class CbtSessionResponse(BaseModel):
    session_id: str
    user_id: str
    date: DateType
    started_at: datetime
    duration_sec: int | None
    structured_output: dict[str, Any]
    summary: CbtSessionSummaryCard
    risk_signal: CbtRiskSignalResponse
    risk_level: int
    safety_first: bool
    safety_message: str | None


class CbtRiskSignalUpsertRequest(BaseModel):
    date: DateType | None = None
    functional_impairment_flag: bool = False
    self_harm_flag: bool = False
    suicide_risk_level: int = Field(default=0, ge=0, le=3)
    violence_risk_flag: bool = False
    risk_source: CbtRiskSource = CbtRiskSource.manual_review


class DashboardSymptomMode(str, Enum):
    mode_7d = "7d"
    mode_4w_weekly_avg = "4w_weekly_avg"


class SymptomMetric(str, Enum):
    dep = "dep"
    anx = "anx"
    ins = "ins"


class SymptomPoint(BaseModel):
    x_label: str
    value: float | None = None
    observed_days: int | None = None
    is_missing_bucket: bool = False


class SymptomSeries(BaseModel):
    metric: SymptomMetric
    label: str
    points: list[SymptomPoint]
    current_score: float | None
    window_mean: float | None
    recorded_days: int


class SymptomSummary(BaseModel):
    last_assessment_at: datetime | None
    days_until_recommended_assessment: int | None
    last_updated_at: datetime | None


class DataDensity(BaseModel):
    days_in_window: int
    recorded_days_any_metric: int
    message: str


class SymptomDashboardResponse(BaseModel):
    mode: DashboardSymptomMode
    series: list[SymptomSeries]
    summary: SymptomSummary
    data_density: DataDensity


class ActivitySummaryCards(BaseModel):
    checkin_days_7d: int
    cbt_sessions_7d: int
    challenge_days_7d: int
    last_assessment_days_ago: int | None


class ActivityCalendarDay(BaseModel):
    date: DateType
    checked_in: bool
    is_today: bool


class ActivityCalendar(BaseModel):
    year: int
    month: int
    days: list[ActivityCalendarDay]


class ActivityCbtSummary(BaseModel):
    sessions_7d: int
    active_days_7d: int
    last_session_days_ago: int | None
    top_topics: list[str]


class ActivityChallengeSummary(BaseModel):
    active_count: int
    performed_days_7d: int
    completion_rate_7d: float | None
    dropout_count_28d: int


class ActivitySurveySummary(BaseModel):
    last_assessment_at: datetime | None
    days_until_recommended_assessment: int | None


class ActivityDataDensity(BaseModel):
    message: str


class ActivityDashboardResponse(BaseModel):
    summary_cards: ActivitySummaryCards
    calendar: ActivityCalendar
    cbt: ActivityCbtSummary
    challenge: ActivityChallengeSummary
    survey: ActivitySurveySummary
    data_density: ActivityDataDensity


class ReportPeriod(BaseModel):
    start_date: DateType
    end_date: DateType


class ReportSymptomPoint(BaseModel):
    date: DateType
    dep_state: float
    anx_state: float
    ins_state: float
    has_checkin: bool
    has_state_observation: bool


class ReportAssessmentsLatest(BaseModel):
    completed_at: datetime | None
    phq9_total: int | None
    gad7_total: int | None
    isi_total: int | None
    days_since: int | None


class ReportAssessmentsHistoryItem(BaseModel):
    completed_at: datetime
    phq9_total: int | None
    gad7_total: int | None
    isi_total: int | None


class ReportAssessments(BaseModel):
    latest: ReportAssessmentsLatest
    history: list[ReportAssessmentsHistoryItem]


class ReportChallengeCompletedItem(BaseModel):
    challenge_id: str
    challenge_name: str
    summary_ko: str
    spent_days: int


class ReportChallengeDroppedItem(BaseModel):
    challenge_id: str
    challenge_name: str
    summary_ko: str
    performed_days: int
    target_days: int


class ReportChallengeSummary(BaseModel):
    shown_count: int
    accepted_count: int
    declined_count: int
    active_count: int
    completion_rate: float | None
    dropout_count: int
    helpfulness_mean_0_10: float | None
    by_domain: dict[str, int]
    completed_items: list[ReportChallengeCompletedItem] = Field(default_factory=list)
    dropped_items: list[ReportChallengeDroppedItem] = Field(default_factory=list)


class ReportCbtSummary(BaseModel):
    sessions_count: int
    top_topics: list[str]
    top_skills: list[str]
    homework_attempts: int | None
    helpfulness_mean_0_10: float | None
    pending_reflection_count: int
    completed_reflection_count: int
    highlights: list[dict[str, str]]


class ReportRiskEvent(BaseModel):
    date: DateType
    type: str
    level: int | None
    source: str
    detail: str | None = None


class ReportRiskSummary(BaseModel):
    functional_impairment_any: bool
    self_harm_any: bool
    suicide_risk_max_level: int = Field(ge=0, le=3)
    violence_risk_any: bool
    events: list[ReportRiskEvent]


class ReportComputed(BaseModel):
    symptom_timeseries: list[ReportSymptomPoint]
    sleep_metrics: dict[str, Any]
    lifestyle_metrics: dict[str, Any]
    assessments: ReportAssessments
    challenge_summary: ReportChallengeSummary
    cbt_summary: ReportCbtSummary
    risk_summary: ReportRiskSummary


class ReportSourceDensity(BaseModel):
    days_in_period: int
    checkin_days: int
    assessment_count: int
    challenge_log_days: int
    cbt_sessions: int
    note: str


class ReportSummaryResponse(BaseModel):
    period: ReportPeriod
    computed: ReportComputed
    source_density: ReportSourceDensity


class ReportExportFormat(str, Enum):
    pdf = "pdf"
    png = "png"


class ReportSummaryExportRequest(BaseModel):
    start_date: DateType
    end_date: DateType
    format: ReportExportFormat
    include_sensitive: bool = True
    save_to_vault: bool = True


class ReportSummarySaveRequest(BaseModel):
    start_date: DateType
    end_date: DateType
    include_sensitive: bool = True


class ReportSummarySaveResponse(BaseModel):
    report_id: str
    period_start: DateType
    period_end: DateType
    format: str
    file_name: str
    content_type: str
    created_at: datetime
