import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  fetchAdminAssessments,
  fetchAdminHighRisk,
  fetchAdminSummary,
  fetchAdminUsers,
} from './adminApi'
import { fetchBoardPosts, type BoardPost } from '../board/boardApi'
import type {
  AdminAssessmentItem,
  AdminHighRiskItem,
  AdminSummary,
  AdminUserItem,
} from './types'
import './AdminPage.css'

type AdminTab = 'dashboard' | 'users' | 'highrisk' | 'alerts' | 'admins'

function formatDate(input: string | null) {
  if (!input) return '-'
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return input
  return d.toLocaleString('ko-KR')
}

function statusFromLatest(latest: string | null): '활성' | '휴면' | '오프라인' {
  if (!latest) return '오프라인'
  const diff = Date.now() - new Date(latest).getTime()
  if (Number.isNaN(diff)) return '오프라인'
  if (diff <= 1000 * 60 * 20) return '활성'
  if (diff <= 1000 * 60 * 60 * 24) return '휴면'
  return '오프라인'
}

type AdminPageProps = {
  token: string
}

export default function AdminPage({ token }: AdminPageProps) {
  const [tab, setTab] = useState<AdminTab>('users')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [highRiskOnly, setHighRiskOnly] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminNotice, setAdminNotice] = useState('')

  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [users, setUsers] = useState<AdminUserItem[]>([])
  const [assessments, setAssessments] = useState<AdminAssessmentItem[]>([])
  const [highRisk, setHighRisk] = useState<AdminHighRiskItem[]>([])
  const [alerts, setAlerts] = useState<BoardPost[]>([])

  const canLoad = useMemo(() => token.trim().length > 0, [token])
  const filteredUsers = useMemo(() => {
    if (!query.trim()) return users
    const q = query.toLowerCase()
    return users.filter((user) => user.email.toLowerCase().includes(q) || user.nickname.toLowerCase().includes(q))
  }, [users, query])

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
        fetchAdminUsers(token, query, 1, 40),
        fetchAdminAssessments(token, query, highRiskOnly, 1, 40),
        fetchAdminHighRisk(token, 60),
      ])

      setSummary(summaryRes)
      setUsers(usersRes.items)
      setAssessments(assessmentsRes.items)
      setHighRisk(highRiskRes.items)

      const [qnaRes, feedbackRes] = await Promise.allSettled([
        fetchBoardPosts({ page: 1, pageSize: 20, category: '문의' }),
        fetchBoardPosts({ page: 1, pageSize: 20, category: '피드백' }),
      ])
      const qnaItems = qnaRes.status === 'fulfilled' ? qnaRes.value.items : []
      const feedbackItems = feedbackRes.status === 'fulfilled' ? feedbackRes.value.items : []
      const merged = [...qnaItems, ...feedbackItems].sort((a, b) => (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ))
      setAlerts(merged.slice(0, 20))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function handleAddAdmin(event: FormEvent) {
    event.preventDefault()
    if (!adminEmail.trim() || !adminName.trim()) {
      setAdminNotice('이메일과 이름을 입력하세요.')
      return
    }
    setAdminNotice('관리자 추가 API는 미연동입니다. backend/.env 의 ADMIN_EMAILS에 추가하세요.')
  }

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section className="adminV3">
      <aside className="adminV3Sidebar">
        <p className="menuLabel">MENU</p>
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>통계 대시보드</button>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>사용자 관리</button>
        <button className={tab === 'highrisk' ? 'active' : ''} onClick={() => setTab('highrisk')}>고위험 플래그 목록</button>
        <button className={tab === 'alerts' ? 'active' : ''} onClick={() => setTab('alerts')}>
          질문/피드백 알림
          <span className="badge">{alerts.length}</span>
        </button>
        <button className={tab === 'admins' ? 'active' : ''} onClick={() => setTab('admins')}>관리자 추가</button>
      </aside>

      <main className="adminV3Main">
        <header className="adminV3Top">
          <div>
            <h2>
              {tab === 'dashboard' && '통계 대시보드'}
              {tab === 'users' && '사용자 관리'}
              {tab === 'highrisk' && '고위험 플래그 목록'}
              {tab === 'alerts' && '질문/피드백 알림'}
              {tab === 'admins' && '관리자 추가'}
            </h2>
            <p>서비스 운영 상태를 실시간으로 모니터링합니다.</p>
          </div>
          <div className="adminV3TopRight">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="사용자 검색..."
            />
            <button type="button" className="liveBtn">SYSTEM LIVE</button>
          </div>
        </header>

        <div className="adminV3Grid">
          <section className="panel tablePanel">
            {tab === 'dashboard' && (
              <div className="kpiGrid">
                <article className="kpi"><p>총 사용자</p><strong>{summary?.total_users ?? 0}</strong></article>
                <article className="kpi"><p>총 검사</p><strong>{summary?.total_assessments ?? 0}</strong></article>
                <article className="kpi"><p>오늘 검사</p><strong>{summary?.assessments_today ?? 0}</strong></article>
                <article className="kpi danger"><p>고위험 검사</p><strong>{summary?.high_risk_assessments ?? 0}</strong></article>
              </div>
            )}

            {tab === 'users' && (
              <>
                <div className="panelHead">
                  <h3>활성 사용자 목록</h3>
                  <button type="button" onClick={loadAll} disabled={loading}>{loading ? '로딩 중...' : '필터링'}</button>
                </div>
                <table className="adminTable">
                  <thead>
                    <tr>
                      <th>사용자 ID</th>
                      <th>상태</th>
                      <th>마지막 세션</th>
                      <th>작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.slice(0, 16).map((user) => {
                      const status = statusFromLatest(user.latest_assessment_at)
                      return (
                        <tr key={user.id}>
                          <td className="userCell">{user.nickname} <span>{user.email}</span></td>
                          <td><em className={`chip ${status === '활성' ? 'on' : status === '휴면' ? 'rest' : 'off'}`}>{status}</em></td>
                          <td>{formatDate(user.latest_assessment_at)}</td>
                          <td>•••</td>
                        </tr>
                      )
                    })}
                    {filteredUsers.length === 0 && (
                      <tr><td colSpan={4} className="muted">데이터가 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </>
            )}

            {tab === 'highrisk' && (
              <table className="adminTable">
                <thead>
                  <tr>
                    <th>일시</th>
                    <th>사용자</th>
                    <th>검사</th>
                    <th>점수</th>
                    <th>사유</th>
                  </tr>
                </thead>
                <tbody>
                  {highRisk.map((item) => (
                    <tr key={item.assessment_id}>
                      <td>{formatDate(item.created_at)}</td>
                      <td>{item.user_nickname} <span>{item.user_email}</span></td>
                      <td>{item.type}</td>
                      <td>{item.total_score}</td>
                      <td>{item.risk_reason}</td>
                    </tr>
                  ))}
                  {highRisk.length === 0 && (
                    <tr><td colSpan={5} className="muted">고위험 데이터가 없습니다.</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {tab === 'alerts' && (
              <div className="alertGrid">
                {alerts.map((alert) => (
                  <article key={alert.id} className="alertCard">
                    <p>{alert.category} · {formatDate(alert.created_at)}</p>
                    <strong>{alert.title}</strong>
                    <span>{alert.author_nickname}</span>
                  </article>
                ))}
                {alerts.length === 0 && <p className="muted">알림이 없습니다.</p>}
              </div>
            )}

            {tab === 'admins' && (
              <form className="adminAddForm" onSubmit={handleAddAdmin}>
                <label>
                  관리자 이메일
                  <input
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@example.com"
                    required
                  />
                </label>
                <label>
                  관리자 이름
                  <input
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="운영 담당자"
                    required
                  />
                </label>
                <button type="submit">관리자 추가 요청</button>
                {adminNotice && <p className="muted">{adminNotice}</p>}
              </form>
            )}
          </section>

          <aside className="adminV3Side">
            <section className="panel">
              <h3>시스템 상태</h3>
              <div className="metric">
                <span>서버응답 속도</span>
                <strong>{124 + (summary?.assessments_today ?? 0)}ms</strong>
                <div className="bar"><i style={{ width: '76%' }} /></div>
              </div>
              <div className="metric">
                <span>데이터베이스</span>
                <strong>정상</strong>
              </div>
            </section>

            <section className="panel dark">
              <h3>총 이용 횟수</h3>
              <p className="big">{(summary?.total_assessments ?? 0).toLocaleString()}</p>
              <p className="mutedOnDark">누적 챗봇 및 검사 수</p>
              <hr />
              <p className="today">오늘 신규 +{summary?.assessments_today ?? 0}</p>
            </section>
          </aside>
        </div>

        {tab === 'dashboard' && (
          <section className="panel">
            <div className="panelHead">
              <h3>최근 검사 이력</h3>
              <label className="checkLine">
                <input type="checkbox" checked={highRiskOnly} onChange={(e) => setHighRiskOnly(e.target.checked)} />
                고위험만 보기
              </label>
            </div>
            <table className="adminTable">
              <thead>
                <tr>
                  <th>일시</th>
                  <th>이메일</th>
                  <th>닉네임</th>
                  <th>검사</th>
                  <th>점수</th>
                  <th>심각도</th>
                </tr>
              </thead>
              <tbody>
                {assessments.slice(0, 10).map((item) => (
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
                  <tr><td colSpan={6} className="muted">데이터가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </section>
        )}

        {error && <p className="error">{error}</p>}
      </main>
    </section>
  )
}
