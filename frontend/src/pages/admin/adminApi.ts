import type {
  AdminAccountListResponse,
  AdminAccountSearchUserListResponse,
  AdminAssessmentListResponse,
  AdminChallengePolicy,
  AdminChallengePolicyAuditListResponse,
  AdminGrantHistoryResponse,
  AdminHighRiskListResponse,
  AdminNotificationListResponse,
  AdminSummary,
  AdminUserListResponse,
  PendingReplyPostListResponse,
} from './types'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001'

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    let detail = ''
    try {
      const body = (await response.json()) as { detail?: string }
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      detail = await response.text()
    }
    throw new Error(detail || `HTTP ${response.status}`)
  }

  return (await response.json()) as T
}

export function fetchAdminSummary(token: string) {
  return request<AdminSummary>('/admin/summary', token)
}

export function fetchAdminUsers(
  token: string,
  q: string,
  page = 1,
  pageSize = 20,
  sortBy: 'email' | 'nickname' | 'created_at' | 'assessment_count' | 'chat_count' | 'board_post_count' = 'created_at',
  sortOrder: 'asc' | 'desc' = 'desc',
) {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    sort_by: sortBy,
    sort_order: sortOrder,
  })
  if (q.trim() !== '') params.set('q', q.trim())
  return request<AdminUserListResponse>(`/admin/users?${params.toString()}`, token)
}

export function fetchAdminAssessments(token: string, q: string, highRiskOnly: boolean, page = 1, pageSize = 20) {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    high_risk_only: String(highRiskOnly),
  })
  if (q.trim() !== '') params.set('q', q.trim())
  return request<AdminAssessmentListResponse>(`/admin/assessments?${params.toString()}`, token)
}

export function fetchAdminHighRisk(token: string, limit = 100) {
  return request<AdminHighRiskListResponse>(`/admin/high-risk?limit=${limit}`, token)
}

export function fetchAdminNotifications(token: string, limit = 50) {
  return request<AdminNotificationListResponse>(`/admin/notifications?limit=${limit}`, token)
}

export function fetchPendingReplyPosts(token: string, limit = 100) {
  return request<PendingReplyPostListResponse>(`/admin/board/pending-replies?limit=${limit}`, token)
}

export function fetchAdminAccounts(token: string) {
  return request<AdminAccountListResponse>('/admin/accounts', token)
}

export function searchRegisteredUsersForAdminAdd(token: string, q: string, limit = 10) {
  const params = new URLSearchParams({ q: q.trim(), limit: String(limit) })
  return request<AdminAccountSearchUserListResponse>(`/admin/accounts/search-users?${params.toString()}`, token)
}

export function addAdminAccount(token: string, email: string) {
  return request<AdminAccountListResponse>('/admin/accounts', token, {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function fetchAdminGrantHistory(token: string, limit = 100) {
  return request<AdminGrantHistoryResponse>(`/admin/accounts/grants?limit=${limit}`, token)
}

export function fetchAdminChallengePolicy(token: string) {
  return request<AdminChallengePolicy>('/admin/challenge-policy', token)
}

export function updateAdminChallengePolicy(token: string, payload: AdminChallengePolicy) {
  return request<AdminChallengePolicy>('/admin/challenge-policy', token, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function fetchAdminChallengePolicyAudit(token: string, limit = 50) {
  return request<AdminChallengePolicyAuditListResponse>(`/admin/challenge-policy/audit?limit=${limit}`, token)
}

export function removeAdminAccount(token: string, email: string) {
  return request<AdminAccountListResponse>(`/admin/accounts/${encodeURIComponent(email)}`, token, {
    method: 'DELETE',
  })
}
