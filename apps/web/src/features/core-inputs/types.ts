export type SleepTotalBucket = "lt_4h" | "h4_5" | "h5_6" | "h6_7" | "h7_8" | "ge_8h";
export type SleepLatencyBucket = "le_15m" | "m15_30" | "m30_60" | "ge_60m";
export type DaylightBucket = "m0" | "m1_9" | "m10_29" | "ge_30";
export type ExerciseBucket = "m0" | "m1_9" | "m10_29" | "ge_30";
export type AlcoholBucket = "none" | "one" | "two_three" | "ge_four";

export interface CheckinPayload {
  date: string;
  sleep_total_bucket: SleepTotalBucket;
  wake_time_local: string;
  sleep_latency_bucket: SleepLatencyBucket;
  mood_1_5: number;
  anxiety_1_5: number;
  energy_1_5: number;
  daylight_bucket: DaylightBucket;
  exercise_bucket: ExerciseBucket;
  alcohol_bucket: AlcoholBucket;
  caffeine_after_2pm_flag: boolean;
  timezone: string;
  completion_mode: "full" | "partial" | "reminder_submit";
}

export interface CheckinRecord {
  date: string;
  status: "draft" | "submitted" | "skipped";
  current_version_no: number;
  payload: CheckinPayload | null;
  checked_at: string | null;
}

export interface CheckinFeatureBundle {
  date: string;
  mood_1_5: number | null;
  anxiety_1_5: number | null;
  energy_1_5: number | null;
  sleep_total_midpoint_hours: number | null;
  sleep_latency_midpoint_minutes: number | null;
  days_since_prev_checkin: number | null;
  missing_checkin_days_7d: number;
  missing_checkin_days_28d: number;
}

export interface AssessmentSession {
  assessment_id: string;
  user_id: string;
  scheduled_for: string | null;
  started_at: string;
  completed_at: string | null;
  status: "draft" | "completed" | "late" | "missed" | "skipped";
  recommended_cycle_days: number;
  source: "onboarding" | "28day_reminder" | "manual_start" | "clinician_request" | "other";
  scores: {
    phq9_total: number | null;
    gad7_total: number | null;
    isi_total: number | null;
    phq9_band: string | null;
    gad7_band: string | null;
    isi_band: string | null;
    phq9_item9_nonzero: boolean;
  };
}

export interface ChallengeCatalogItem {
  challenge_id: string;
  name_ko: string;
  status: string;
  domain: string;
  challenge_type: "sustained" | "one_time";
  program_type: ChallengeProgramType;
  default_target_days: number;
  difficulty_level: string;
  summary_ko: string;
}

export type ChallengeProgramType = "one_time" | "streak" | "step_up" | "guided_reflection" | "bundle_weekly";

export type ChallengeSessionStatus =
  | "recommended"
  | "available"
  | "active"
  | "paused"
  | "completed"
  | "dropped";

export type ChallengeDayStatus = "pending" | "done" | "skipped" | "late" | "missed";

export interface ChallengeRecommendationItem extends ChallengeCatalogItem {
  session_status: ChallengeSessionStatus;
  reason_code: string | null;
  reason_copy_ko: string | null;
}

export interface ChallengeEnrollment {
  enrollment_id: string;
  challenge_id: string;
  challenge_name: string;
  domain: string;
  challenge_type: "sustained" | "one_time";
  program_type: ChallengeProgramType;
  status: "active" | "paused" | "completed" | "dropped";
  session_status: ChallengeSessionStatus;
  target_days: number;
  scheduled_start_date: string;
  scheduled_end_date: string;
  reminder_time_local: string | null;
  started_at: string;
  ended_at: string | null;
  done_days?: number | null;
  last_completed_date?: string | null;
  completed_today_flag?: boolean | null;
  stale_after_today_flag?: boolean | null;
}

export interface ChallengeRecommendationBundle {
  recommendations: {
    risk_level: number;
    suppressed: boolean;
    reason: string | null;
    safety_message?: string | null;
    signal_source?: string;
    signal_scores?: Record<string, number>;
    items: ChallengeRecommendationItem[];
  };
  active_enrollments: ChallengeEnrollment[];
  enrollments: {
    active: ChallengeEnrollment[];
    paused: ChallengeEnrollment[];
    completed: ChallengeEnrollment[];
    dropped: ChallengeEnrollment[];
  };
}

export interface ChallengeCatalogDetail {
  challenge: ChallengeCatalogItem;
  session_status: ChallengeSessionStatus;
  recommendation: ChallengeRecommendationItem | null;
  active_enrollment: ChallengeEnrollment | null;
  latest_enrollment: ChallengeEnrollment | null;
  template_steps: string[];
}

export interface ChallengeDayLog {
  day_log_id: string;
  enrollment_id: string;
  challenge_id: string;
  date: string;
  day_status: ChallengeDayStatus;
  completed_flag: boolean;
  pre_mood_1_5: number | null;
  pre_anxiety_1_5: number | null;
  post_mood_1_5: number | null;
  post_anxiety_1_5: number | null;
  helpfulness_0_10: number | null;
  effort_0_10: number | null;
  reflection_note: string | null;
  skipped_reason_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChallengeProgressDayItem {
  date: string;
  day_number: number;
  day_status: ChallengeDayStatus;
  completed_flag: boolean;
  detail: ChallengeDayLog | null;
}

export interface ChallengeEnrollmentDetail {
  enrollment: ChallengeEnrollment;
  challenge: ChallengeCatalogItem;
  recommendation: ChallengeRecommendationItem | null;
  template_steps: string[];
  progress_days: ChallengeProgressDayItem[];
  progress_ratio: number;
  done_days: number;
  remaining_days: number;
}

export interface JournalListItem {
  journal_id: string;
  user_id: string;
  entry_date: string;
  title: string | null;
  category_tags: string[];
  searchable_category_tags: string[];
  preview_text: string;
  status: "active" | "deleted";
  created_at: string;
  updated_at: string;
}

export interface JournalEntry extends JournalListItem {
  body: string;
}

export interface JournalCategoryOptions {
  active_tags: string[];
  inactive_used_tags: string[];
}

export interface ActivityLogItem {
  activity_type: "checkin" | "challenge" | "cbt" | "journal" | "assessment";
  display_label: string;
  preview_text: string | null;
  count: number | null;
  detail_route: string;
}

export interface ActivityLogDay {
  user_id: string;
  date: string;
  summary: {
    has_checkin: boolean;
    has_challenge_activity: boolean;
    challenge_completed_count: number;
    active_challenge_count: number;
    has_cbt_activity: boolean;
    cbt_session_count: number;
    has_journal_entry: boolean;
    journal_entry_count: number;
    has_assessment: boolean;
    activity_count_total: number;
  };
  items: ActivityLogItem[];
}

export interface CbtSessionCreateRequest {
  date?: string;
  state: Record<string, unknown>;
  conversation?: CbtConversationMessage[];
  duration_sec?: number;
  emotion_intensity_pre_0_100?: number;
  emotion_intensity_post_0_100?: number;
  belief_pre_0_100?: number;
  belief_post_0_100?: number;
  reframe_quality_0_5?: number;
  homework_commitment_0_10?: number;
  homework_completed_prev_flag?: boolean;
  session_helpfulness_0_10?: number;
  planner_action?:
    | "review_evidence"
    | "behavior_experiment"
    | "grounding"
    | "activity_scheduling"
    | "sleep_anchor"
    | "support_contact";
  selected_action_kind?: "external" | "challenge" | "none";
  selected_action_title?: string;
  selected_action_description?: string | null;
  selected_action_route?: string | null;
}

export interface CbtSessionTodoUpsertRequest {
  title: string;
  description?: string | null;
  kind?: "external" | "challenge";
  route?: string | null;
}

export interface CbtConversationMessage {
  role: "user" | "assistant";
  content: string;
  sender_name?: string | null;
  message_id?: string | null;
}

export type CbtSessionStage =
  | "situation"
  | "emotion"
  | "thought"
  | "evidence"
  | "alternative_plan"
  | "summary"
  | "reframe"
  | "action";

export interface CbtQuickReplyItem {
  type: "prefill" | "action";
  label: string;
  fill_text?: string | null;
  action_id?: string | null;
}

export interface CbtConversationActionLink {
  label: string;
  route: string;
}

export interface CbtConversationBootstrapResponse {
  structured_state_draft: Record<string, unknown>;
  current_stage: CbtSessionStage;
  phase_key: CbtSessionStage;
  subphase_key: string;
  phase_index: number;
  assistant_messages: CbtConversationMessage[];
  quick_replies: CbtQuickReplyItem[];
  action_links: CbtConversationActionLink[];
  requires_today_record: boolean;
  today_record_route: string | null;
}

export interface CbtConversationTurnResponse {
  assistant_message: string;
  assistant_messages: CbtConversationMessage[];
  structured_state_draft: Record<string, unknown>;
  planner_action:
    | "review_evidence"
    | "behavior_experiment"
    | "grounding"
    | "activity_scheduling"
    | "sleep_anchor"
    | "support_contact";
  current_stage: CbtSessionStage;
  phase_key: CbtSessionStage;
  subphase_key: string;
  phase_index: number;
  quick_replies: CbtQuickReplyItem[];
  action_links: CbtConversationActionLink[];
  state_repeat_count: number;
  fallback_reason: string | null;
  conversation_closed: boolean;
  requires_today_record: boolean;
  today_record_route: string | null;
  risk_level: number;
  safety_first: boolean;
  safety_message: string | null;
  emotion_intensity_pre_0_100: number | null;
  emotion_intensity_post_0_100: number | null;
  belief_pre_0_100: number | null;
  belief_post_0_100: number | null;
  homework_commitment_0_10: number | null;
  session_helpfulness_0_10: number | null;
}

export interface CbtRiskSignal {
  risk_signal_id: string;
  user_id: string;
  date: string;
  functional_impairment_flag: boolean;
  self_harm_flag: boolean;
  suicide_risk_level: number;
  violence_risk_flag: boolean;
  risk_source: "cbt_session" | "manual_review" | "system_rule";
  created_at: string;
}

export interface CbtSessionSummary {
  emotion_shift: number | null;
  belief_shift: number | null;
  distortion_total_count: number;
  topic_label: string;
  helpfulness_0_10: number | null;
  planner_action:
    | "review_evidence"
    | "behavior_experiment"
    | "grounding"
    | "activity_scheduling"
    | "sleep_anchor"
    | "support_contact";
  selected_action_kind: "external" | "challenge" | "none";
  selected_action_title: string;
  selected_action_description: string | null;
  selected_action_route: string | null;
  reflection_status: "pending" | "completed" | "not_applicable";
  reflection_performed_flag: boolean | null;
  reflection_note: string | null;
  thought_summary: string | null;
  core_belief_summary: string | null;
  evidence_summary: string | null;
  balanced_statement_summary: string | null;
}

export interface CbtSessionResponse {
  session_id: string;
  user_id: string;
  date: string;
  started_at: string;
  duration_sec: number | null;
  structured_output: Record<string, unknown>;
  summary: CbtSessionSummary;
  risk_signal: CbtRiskSignal;
  risk_level: number;
  safety_first: boolean;
  safety_message: string | null;
}

export interface SymptomDashboardPoint {
  x_label: string;
  value: number | null;
  observed_days: number | null;
  is_missing_bucket: boolean;
}

export interface SymptomDashboardSeries {
  metric: "dep" | "anx" | "ins";
  label: string;
  points: SymptomDashboardPoint[];
  current_score: number | null;
  window_mean: number | null;
  recorded_days: number;
}

export interface SymptomDashboardResponse {
  mode: "7d" | "4w_weekly_avg";
  series: SymptomDashboardSeries[];
  summary: {
    last_assessment_at: string | null;
    days_until_recommended_assessment: number | null;
    last_updated_at: string | null;
  };
  data_density: {
    days_in_window: number;
    recorded_days_any_metric: number;
    message: string;
  };
}

export interface ActivityDashboardResponse {
  summary_cards: {
    checkin_days_7d: number;
    cbt_sessions_7d: number;
    challenge_days_7d: number;
    last_assessment_days_ago: number | null;
  };
  calendar: {
    year: number;
    month: number;
    days: Array<{
      date: string;
      checked_in: boolean;
      is_today: boolean;
    }>;
  };
  cbt: {
    sessions_7d: number;
    active_days_7d: number;
    last_session_days_ago: number | null;
    top_topics: string[];
  };
  challenge: {
    active_count: number;
    performed_days_7d: number;
    completion_rate_7d: number | null;
    dropout_count_28d: number;
  };
  survey: {
    last_assessment_at: string | null;
    days_until_recommended_assessment: number | null;
  };
  data_density: {
    message: string;
  };
}

export interface ReportSummaryResponse {
  period: {
    start_date: string;
    end_date: string;
  };
  computed: {
    symptom_timeseries: Array<{
      date: string;
      dep_state: number;
      anx_state: number;
      ins_state: number;
      has_checkin: boolean;
      has_state_observation: boolean;
    }>;
    sleep_metrics: {
      sleep_total_mean_min: number;
      wake_time_mean_min: number | null;
      wake_time_std_min: number;
      wake_time_consistency_label: string;
      sleep_latency_mean_min: number;
      sleep_latency_bucket_dist: Record<string, number>;
      sleep_latency_bucket_mode: string;
    };
    lifestyle_metrics: {
      exercise_bucket_counts: Record<string, number>;
      daylight_bucket_counts: Record<string, number>;
      alcohol_bucket_counts: Record<string, number>;
      late_caffeine_days: number;
      exercise_mean_min_per_day: number;
      daylight_mean_min_per_day: number;
      exercise_days: number;
      weeks_in_period: number;
      exercise_weekly_avg_days: number;
      late_caffeine_weekly_avg_days: number;
    };
    assessments: {
      latest: {
        completed_at: string | null;
        phq9_total: number | null;
        gad7_total: number | null;
        isi_total: number | null;
        days_since: number | null;
      };
      history: Array<{
        completed_at: string;
        phq9_total: number | null;
        gad7_total: number | null;
        isi_total: number | null;
      }>;
    };
    challenge_summary: {
      shown_count: number;
      accepted_count: number;
      declined_count: number;
      active_count: number;
      completion_rate: number | null;
      dropout_count: number;
      helpfulness_mean_0_10: number | null;
      by_domain: Record<string, number>;
      completed_items: Array<{
        challenge_id: string;
        challenge_name: string;
        summary_ko: string;
        spent_days: number;
      }>;
      dropped_items: Array<{
        challenge_id: string;
        challenge_name: string;
        summary_ko: string;
        performed_days: number;
        target_days: number;
      }>;
    };
    cbt_summary: {
      sessions_count: number;
      top_topics: string[];
      top_skills: string[];
      homework_attempts: number | null;
      helpfulness_mean_0_10: number | null;
      pending_reflection_count: number;
      completed_reflection_count: number;
      highlights: Array<{
        thought: string;
        belief: string;
        evidence: string;
        balanced_statement: string;
        action: string;
        action_result: string;
        reflection_note: string;
        date: string;
      }>;
    };
    risk_summary: {
      functional_impairment_any: boolean;
      self_harm_any: boolean;
      suicide_risk_max_level: number;
      violence_risk_any: boolean;
      events: Array<{
        date: string;
        type: string;
        level: number | null;
        source: string;
        detail: string | null;
      }>;
    };
  };
  source_density: {
    days_in_period: number;
    checkin_days: number;
    assessment_count: number;
    challenge_log_days: number;
    cbt_sessions: number;
    note: string;
  };
}
