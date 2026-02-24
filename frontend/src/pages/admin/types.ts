export type AdminSummary = {
  total_users: number
  total_assessments: number
  high_risk_assessments: number
  assessments_today: number
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
