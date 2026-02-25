export type AdminSummary = {
  total_users: number
  total_assessments: number
  high_risk_assessments: number
  assessments_today: number
  board_question_feedback_alerts: number
  today_visitors: number
  login_users_today: number
}

export type AdminUserItem = {
  id: string
  email: string
  nickname: string
  created_at: string
  assessment_count: number
  latest_assessment_at: string | null
}

export type AdminAssessmentItem = {
  id: string
  user_id: string
  user_email: string
  user_nickname: string
  type: string
  total_score: number
  severity: string
  created_at: string
}

export type AdminHighRiskItem = {
  assessment_id: string
  user_id: string
  user_email: string
  user_nickname: string
  type: string
  total_score: number
  severity: string
  risk_reason: string
  created_at: string
}

export type AdminNotificationItem = {
  id: string
  type: string
  title: string
  message: string
  ref_post_id: string | null
  is_read: boolean
  created_at: string
}

export type PendingReplyPostItem = {
  post_id: string
  category: string
  title: string
  author_nickname: string
  created_at: string
}

export type AdminChallengePolicy = {
  window_days: number
  similarity_threshold: number
  repeatable_techniques: string[]
}

export type AdminChallengePolicyAuditItem = {
  id: string
  actor_email: string
  actor_nickname: string | null
  created_at: string
  before_json: Record<string, unknown>
  after_json: Record<string, unknown>
  diff_json: Record<string, { before: unknown; after: unknown }>
}

export type AdminAccountItem = {
  email: string
  source: string
  is_owner: boolean
}

export type AdminGrantHistoryItem = {
  granted_at: string
  granted_by_email: string
  granted_by_nickname: string | null
  granted_to_email: string
}

export type AdminUserListResponse = {
  page: number
  page_size: number
  total: number
  items: AdminUserItem[]
}

export type AdminAssessmentListResponse = {
  page: number
  page_size: number
  total: number
  items: AdminAssessmentItem[]
}

export type AdminHighRiskListResponse = {
  total: number
  items: AdminHighRiskItem[]
}

export type AdminNotificationListResponse = {
  total: number
  items: AdminNotificationItem[]
}

export type PendingReplyPostListResponse = {
  total: number
  items: PendingReplyPostItem[]
}

export type AdminChallengePolicyAuditListResponse = {
  total: number
  items: AdminChallengePolicyAuditItem[]
}

export type AdminAccountListResponse = {
  total: number
  owner_email: string | null
  current_user_is_owner: boolean
  items: AdminAccountItem[]
}

export type AdminGrantHistoryResponse = {
  total: number
  items: AdminGrantHistoryItem[]
}
