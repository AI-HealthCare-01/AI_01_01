import type {
  AdminAssessmentListResponse,
  AdminHighRiskListResponse,
  AdminSummary,
  AdminUserListResponse,
} from './types'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001'

async function request<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
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

export function fetchAdminUsers(token: string, q: string, page = 1, pageSize = 20) {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
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
