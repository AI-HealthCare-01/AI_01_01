import { useEffect, useMemo, useState } from 'react'
import AdminTable from '../../components/admin/AdminTable'
import StatCard from '../../components/admin/StatCard'
import {
  fetchAdminAssessments,
  fetchAdminHighRisk,
  fetchAdminSummary,
  fetchAdminUsers,
} from './adminApi'
import type {
  AdminAssessmentItem,
  AdminHighRiskItem,
  AdminSummary,
  AdminUserItem,
} from './types'
import './AdminPage.css'

function formatDate(input: string | null) {
  if (!input) return '-'
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return input
  return d.toLocaleString('ko-KR')
}

type AdminPageProps = {
  token: string
}

export default function AdminPage({ token }: AdminPageProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [highRiskOnly, setHighRiskOnly] = useState(false)

  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [users, setUsers] = useState<AdminUserItem[]>([])
  const [assessments, setAssessments] = useState<AdminAssessmentItem[]>([])
  const [highRisk, setHighRisk] = useState<AdminHighRiskItem[]>([])

  const canLoad = useMemo(() => token.trim().length > 0, [token])

  async function loadAll() {
    if (!canLoad) {
      setError('관리자 JWT 토큰이 필요합니다.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const [summaryRes, usersRes, assessmentsRes, highRiskRes] = await Promise.all([
        fetchAdminSummary(token),
        fetchAdminUsers(token, query, 1, 20),
        fetchAdminAssessments(token, query, highRiskOnly, 1, 20),
        fetchAdminHighRisk(token, 30),
      ])
      setSummary(summaryRes)
      setUsers(usersRes.items)
      setAssessments(assessmentsRes.items)
      setHighRisk(highRiskRes.items)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section className="adminPage">
      <h2 className="adminTitle">관리자 페이지</h2>

      <div className="adminToolbar">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이메일/닉네임 검색"
        />
        <label>
          <input
            type="checkbox"
            checked={highRiskOnly}
            onChange={(e) => setHighRiskOnly(e.target.checked)}
          />
          고위험만 보기
        </label>
        <button onClick={loadAll} disabled={loading}>
          {loading ? '로딩 중...' : '새로고침'}
        </button>
      </div>

      {error && <p className="adminDanger">{error}</p>}

      {summary && (
        <section className="adminStatGrid">
          <StatCard label="총 사용자" value={summary.total_users} />
          <StatCard label="총 검사" value={summary.total_assessments} />
          <StatCard label="오늘 검사" value={summary.assessments_today} />
          <StatCard label="고위험 검사" value={summary.high_risk_assessments} />
        </section>
      )}

      <section className="adminSection">
        <h3>사용자 목록</h3>
        <AdminTable headers={['이메일', '닉네임', '가입일', '검사 수', '최근 검사일']}>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.email}</td>
              <td>{user.nickname}</td>
              <td>{formatDate(user.created_at)}</td>
              <td>{user.assessment_count}</td>
              <td>{formatDate(user.latest_assessment_at)}</td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={5} className="adminMuted">데이터가 없습니다.</td>
            </tr>
          )}
        </AdminTable>
      </section>

      <section className="adminSection">
        <h3>검사 이력</h3>
        <AdminTable headers={['일시', '이메일', '닉네임', '검사', '점수', '심각도']}>
          {assessments.map((item) => (
            <tr key={item.id}>
              <td>{formatDate(item.created_at)}</td>
              <td>{item.user_email}</td>
              <td>{item.user_nickname}</td>
              <td>{item.type}</td>
              <td>{item.total_score}</td>
              <td>{item.severity}</td>
            </tr>
          ))}
          {assessments.length === 0 && (
            <tr>
              <td colSpan={6} className="adminMuted">데이터가 없습니다.</td>
            </tr>
          )}
        </AdminTable>
      </section>

      <section className="adminSection">
        <h3>고위험 플래그 목록</h3>
        <AdminTable headers={['일시', '이메일', '닉네임', '검사', '점수', '사유']}>
          {highRisk.map((item) => (
            <tr key={item.assessment_id}>
              <td>{formatDate(item.created_at)}</td>
              <td>{item.user_email}</td>
              <td>{item.user_nickname}</td>
              <td>{item.type}</td>
              <td>{item.total_score}</td>
              <td>{item.risk_reason}</td>
            </tr>
          ))}
          {highRisk.length === 0 && (
            <tr>
              <td colSpan={6} className="adminMuted">고위험 데이터가 없습니다.</td>
            </tr>
          )}
        </AdminTable>
      </section>
    </section>
  )
}
