export type AdminBaseRole = "owner" | "admin" | "support";

export type AdminExtensionCode = "analyst_ml_extension";

export type AdminExtensionStatus = "requested" | "approved" | "rejected" | "revoked";

export type AdminQueueCode =
  | "support_queue"
  | "moderation_queue"
  | "safety_queue"
  | "ops_queue"
  | "ml_queue";

export interface AdminActorContext {
  admin_user_id: string;
  base_role: AdminBaseRole;
  extension_codes: AdminExtensionCode[];
}

export interface AdminMeResponse {
  actor: AdminActorContext;
  permissions: string[];
}

export interface AdminOverviewResponse {
  kpis: {
    total_users: number;
    dau: number;
    wau: number;
    mau: number;
    signup_count_7d: number;
    checkin_count_7d: number;
    challenge_count_7d: number;
    cbt_sessions_7d: number;
    assessments_completed_7d: number;
    support_unanswered_count: number;
    support_reopened_count: number;
    moderation_pending_count: number;
    safety_pending_count: number;
  };
  queues: Array<{
    queue_code: AdminQueueCode;
    count: number;
  }>;
}

export interface AdminUserListItem {
  user_id: string;
  nickname: string;
  admin_role: AdminBaseRole | null;
  created_at: string;
  account_status: string;
  recent_login_at: string | null;
  access_days: number;
  activity_count: number;
  recent_checkin_at: string | null;
  recent_challenge_activity_at: string | null;
  recent_cbt_activity_at: string | null;
  recent_assessment_at: string | null;
  report_count: number;
  support_ticket_count: number;
  high_risk_flag: boolean;
}

export interface AdminUserListResponse {
  items: AdminUserListItem[];
}

export interface AdminUserBanContextResponse {
  user_id: string;
  email: string;
  target_admin_role: AdminBaseRole | null;
  recent_ips: string[];
}

export type RestrictionReasonCode =
  | "abuse"
  | "hate"
  | "threat"
  | "spam"
  | "safety"
  | "policy_violation"
  | "other";

export interface RestrictionActionResponse {
  action_id: string;
  target_user_id: string;
  block_account: boolean;
  block_ip: boolean;
  target_ip: string | null;
  reason_code: RestrictionReasonCode;
  reason_detail: string | null;
  starts_at: string;
  ends_at: string | null;
  created_by_admin_user_id: string;
}

export interface AdminSupportQueueItem {
  ticket_id: string;
  user_id: string;
  user_email: string;
  user_nickname: string;
  ticket_type: string;
  title: string;
  status: string;
  priority: string;
  sensitive_queue_flag: boolean;
  updated_at: string;
}

export interface AdminSupportQueueResponse {
  items: AdminSupportQueueItem[];
}

export type PolicyDomain =
  | "challenge_policy"
  | "cbt_policy"
  | "survey_notification_policy"
  | "board_policy"
  | "journal_policy";

export type PolicyChangeStatus =
  | "draft"
  | "pending_owner_approval"
  | "approved"
  | "rejected"
  | "applied";

export interface PolicyChangeRecord {
  policy_change_id: string;
  policy_domain: PolicyDomain;
  title: string;
  draft_json: Record<string, unknown>;
  status: PolicyChangeStatus;
  requested_by_admin_user_id: string;
  requested_at: string;
  decided_by_owner_user_id: string | null;
  decided_at: string | null;
  decision_note: string | null;
  applied_at: string | null;
}

export type ModelChangeStatus =
  | "draft_experiment"
  | "training_running"
  | "evaluation_ready"
  | "pending_owner_approval"
  | "approved"
  | "rejected"
  | "deployed"
  | "rolled_back";

export interface ModelChangeRecord {
  model_change_id: string;
  model_name: string;
  experiment_name: string;
  change_summary: string;
  metrics_json: Record<string, unknown>;
  status: ModelChangeStatus;
  requested_by_admin_user_id: string;
  requested_at: string;
  decided_by_owner_user_id: string | null;
  decided_at: string | null;
  decision_note: string | null;
  deployed_at: string | null;
  rolled_back_at: string | null;
}

export type ModelRetrainingJobStatus =
  | "pending_owner_approval"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type ModelRetrainingRunMode = "dry_run" | "execute";

export interface ModelRetrainingJobRecord {
  job_id: string;
  model_change_id: string;
  model_name: string;
  status: ModelRetrainingJobStatus;
  mode: ModelRetrainingRunMode;
  training_window_days: number;
  data_range_start_date?: string | null;
  data_range_end_date?: string | null;
  include_synthetic_data: boolean;
  dataset_snapshot_id: string | null;
  note: string | null;
  requested_by_admin_user_id: string;
  requested_at: string;
  approved_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  artifact_uri: string | null;
  result_summary: Record<string, unknown>;
  failure_reason: string | null;
}

export type OwnerApprovalObjectType = "policy_change" | "model_change";

export type OwnerApprovalStatus = "pending_owner_approval" | "approved" | "rejected";

export interface OwnerApprovalRecord {
  approval_id: string;
  object_type: OwnerApprovalObjectType;
  object_id: string;
  status: OwnerApprovalStatus;
  requested_by_admin_user_id: string;
  requested_at: string;
  decided_by_owner_user_id: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

export interface ExtensionRecord {
  extension_id: string;
  admin_user_id: string;
  extension_code: AdminExtensionCode;
  status: AdminExtensionStatus;
  requested_at: string;
  approved_at: string | null;
  approved_by: string | null;
  note: string | null;
}

export interface AdminRoleRecord {
  admin_user_id: string;
  base_role: AdminBaseRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminRoleListResponse {
  items: Array<{
    role: AdminRoleRecord;
    extension_status: ExtensionRecord | null;
  }>;
}

export interface AuditLogListResponse {
  items: Array<{
    audit_id: string;
    actor_admin_user_id: string;
    actor_role: string;
    action_type: string;
    target_type: string;
    target_id: string;
    metadata_json: Record<string, unknown>;
    created_at: string;
  }>;
}
