export type BoardVisibilityStatus =
  | "visible"
  | "hidden_by_author"
  | "hidden_by_moderator"
  | "deleted";

export type BoardModerationStatus = "clear" | "under_review" | "auto_hidden" | "actioned";

export type ModerationQueueType = "report" | "hate" | "safety";
export type ModerationActionCode = "hide" | "restore" | "delete" | "dismiss";

export interface BoardFeedItem {
  post: {
    post_id: string;
    feed_public_id: string;
    title: string | null;
    display_title: string | null;
    body_text: string;
    body_preview: string;
    tag_ids: string[];
    image_urls: string[];
    created_at: string;
    updated_at: string | null;
    is_notice: boolean;
    is_pinned_notice: boolean;
    is_anonymous: boolean;
    visibility_status: BoardVisibilityStatus;
    moderation_status: BoardModerationStatus;
  };
  author: {
    author_user_id: string;
    display_name: string;
    is_staff: boolean;
  };
  engagement: {
    like_count: number;
    bookmark_count: number;
    comment_count: number;
    report_count: number;
    viewer_liked: boolean;
    viewer_bookmarked: boolean;
  };
}

export interface BoardListResponse {
  items: BoardFeedItem[];
  next_cursor: string | null;
  pinned_notice: BoardFeedItem | null;
}

export interface BoardCommentPayload {
  comment_id: string;
  post_id: string;
  author_user_id: string;
  body_text: string;
  is_anonymous: boolean;
  visibility_status: string;
  created_at: string;
  updated_at: string | null;
}

export interface BoardCommentItem {
  comment_id: string;
  post_id: string;
  author_user_id: string;
  author_display_name: string;
  body_text: string;
  is_anonymous: boolean;
  visibility_status: string;
  created_at: string;
  updated_at: string | null;
}

export interface ModerationQueueItem {
  queue_item_id: string;
  queue_type: ModerationQueueType;
  target_type: string;
  target_id: string;
  target_public_id: string | null;
  target_title: string | null;
  target_preview: string | null;
  source_type: string;
  reason_code: string | null;
  detail_text: string | null;
  confidence: number | null;
  status: string;
  created_at: string;
}

export interface ModerationQueuesResponse {
  groups: Array<{
    queue_type: ModerationQueueType;
    queued_count: number;
    items: ModerationQueueItem[];
  }>;
}

export interface ModerationQueueTargetAuthor {
  user_id: string;
  display_name: string;
  is_anonymous: boolean;
}

export interface ModerationQueuePostTarget {
  post_id: string;
  feed_public_id: string;
  title: string | null;
  body_text: string;
  visibility_status: BoardVisibilityStatus;
  moderation_status: BoardModerationStatus;
  created_at: string;
  updated_at: string | null;
  author: ModerationQueueTargetAuthor;
}

export interface ModerationQueueCommentTarget {
  comment_id: string;
  post_id: string;
  post_feed_public_id: string | null;
  body_text: string;
  visibility_status: string;
  created_at: string;
  updated_at: string | null;
  author: ModerationQueueTargetAuthor;
}

export interface ModerationQueueDetailResponse {
  item: ModerationQueueItem;
  post: ModerationQueuePostTarget | null;
  comment: ModerationQueueCommentTarget | null;
}

export interface ModerationQueueActionResponse {
  result: string;
  queue_item_id: string;
  status: string;
  post_visibility_status: BoardVisibilityStatus | null;
  post_moderation_status: BoardModerationStatus | null;
  comment_visibility_status: string | null;
}

export type SupportTicketType = "inquiry" | "feedback";

export type SupportTicketStatus =
  | "new"
  | "waiting_admin"
  | "in_progress"
  | "answered"
  | "waiting_user"
  | "reopened"
  | "resolved"
  | "closed";

export type SupportTicketPriority = "normal" | "important" | "urgent";

export interface SupportTicketPayload {
  ticket_id: string;
  user_id: string;
  ticket_type: SupportTicketType;
  title: string;
  status: SupportTicketStatus;
  category: string;
  related_feature: string | null;
  priority: SupportTicketPriority;
  reply_requested: boolean;
  sensitive_queue_flag: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
}

export interface SupportMessagePayload {
  message_id: string;
  ticket_id: string;
  author_type: "user" | "admin" | "system";
  author_id: string | null;
  body: string;
  created_at: string;
  is_followup: boolean;
  internal_only: boolean;
}

export interface SupportNotificationPayload {
  notification_id: string;
  recipient_type: "admin" | "user";
  recipient_id: string;
  ticket_id: string;
  event_type: string;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

export interface SupportTicketListItem {
  ticket: SupportTicketPayload;
  latest_message_at: string | null;
  latest_message_preview: string | null;
}

export interface SupportTicketDetailResponse {
  ticket: SupportTicketPayload;
  messages: SupportMessagePayload[];
  notifications: SupportNotificationPayload[];
}

export interface MyPagePostSummary {
  post_id: string;
  feed_public_id: string;
  title: string | null;
  body_preview: string;
  created_at: string;
}

export interface MyPageCommentSummary {
  comment_id: string;
  post_id: string;
  feed_public_id: string;
  post_title: string | null;
  body_preview: string;
  created_at: string;
}

export interface MyPageReportVaultItem {
  report_id: string;
  created_at: string;
  period_start: string;
  period_end: string;
  format: string;
  file_name: string;
}

export interface MyPageHomeResponse {
  profile: {
    user_id: string;
    nickname: string;
    coach_name: string;
    email_masked: string;
    email_verified: boolean;
    created_at: string;
    birth_year: number | null;
    gender: string | null;
    notification_preferences: Record<string, boolean>;
  };
  activity_summary: {
    window_days: number;
    checkin_days: number;
    challenge_active_count: number;
    challenge_completed_days: number;
    cbt_sessions: number;
    journal_days: number;
    last_assessment_at: string | null;
  };
  ticket_summary: {
    waiting_user_count: number;
    answered_count: number;
    reopened_count: number;
  };
  report_summary: {
    vault_count: number;
    recent_reports: MyPageReportVaultItem[];
  };
  quick_links: string[];
}

export interface MyPageProfileUpdateResponse {
  user_id: string;
  nickname: string;
  coach_name: string;
  birth_year: number | null;
  gender: string | null;
  age_years_derived: number | null;
}

export interface MyPageConsentResponse {
  terms_required: boolean;
  privacy_required: boolean;
  sensitive_data_required: boolean;
  personalization_optional: boolean;
  model_improvement_optional: boolean;
  marketing_optional: boolean;
}

export interface SupportQueueSummaryResponse {
  status_counts: Record<string, number>;
  urgent_count: number;
  sensitive_count: number;
}
