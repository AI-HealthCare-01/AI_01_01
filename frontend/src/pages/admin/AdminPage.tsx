import { useEffect, useMemo, useState } from 'react'
import AdminTable from '../../components/admin/AdminTable'
import StatCard from '../../components/admin/StatCard'
import {
  addAdminAccount,
  addAdminBlockedEmail,
  addAdminBlockedIp,
  fetchAdminAccounts,
  fetchAdminBlockedEmails,
  fetchAdminBlockedIps,
  fetchAdminBoardRiskKeywords,
  fetchAdminChallengePolicy,
  fetchAdminChallengePolicyAudit,
  fetchAdminGrantHistory,
  fetchAdminHighRisk,
  fetchAdminSummary,
  fetchAdminUsers,
  fetchPendingReplyPosts,
  removeAdminAccount,
  removeAdminBlockedEmail,
  searchRegisteredUsersForAdminAdd,
  updateAdminBoardRiskKeywords,
  updateAdminChallengePolicy,
  removeAdminBlockedIp,
} from './adminApi'
import type {
  AdminAccountItem,
  AdminAccountSearchUserItem,
  AdminBlockedEmailItem,
  AdminBlockedIPItem,
  AdminChallengePolicy,
  AdminBoardRiskKeywords,
  AdminChallengePolicyAuditItem,
  AdminGrantHistoryItem,
  AdminHighRiskItem,
  AdminSummary,
  AdminUserItem,
  PendingReplyPostItem,
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
  onOpenBoardPost: (postId: string) => void
}

type AdminMenu = 'dashboard' | 'accounts' | 'pending' | 'policy' | 'moderation'

const TECHNIQUE_LABELS: Record<string, string> = {
  cognitive_reframe: '인지왜곡 교정',
  catastrophizing_check: '파국화 점검',
  self_compassion_reframe: '자기비난 완화',
  behavioral_activation: '행동활성화',
  anxiety_regulation: '불안 조절',
  worry_scheduling: '걱정 시간 배정',
  sleep_hygiene: '수면 위생',
  positive_data_log: '긍정 데이터 기록',
  general: '일반',
}

const TECHNIQUE_OPTIONS = Object.keys(TECHNIQUE_LABELS)

function toPolicyText(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => TECHNIQUE_LABELS[String(v)] ?? String(v)).join(', ')
  if (typeof value === 'number') return Number(value).toString()
  return String(value ?? '-')
}

export default function AdminPage({ token, onOpenBoardPost }: AdminPageProps) {
  const [menu, setMenu] = useState<AdminMenu>('dashboard')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [userSortBy, setUserSortBy] = useState<'created_at' | 'email' | 'nickname' | 'assessment_count' | 'login_days' | 'latest_login_ip' | 'board_post_count'>('created_at')
  const [userSortOrder, setUserSortOrder] = useState<'asc' | 'desc'>('desc')

  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [users, setUsers] = useState<AdminUserItem[]>([])
  const [highRisk, setHighRisk] = useState<AdminHighRiskItem[]>([])
  const [pendingReplies, setPendingReplies] = useState<PendingReplyPostItem[]>([])

  const [accounts, setAccounts] = useState<AdminAccountItem[]>([])
  const [accountOwnerEmail, setAccountOwnerEmail] = useState<string | null>(null)
  const [currentUserIsOwner, setCurrentUserIsOwner] = useState(false)
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [adminSearchQuery, setAdminSearchQuery] = useState('')
  const [adminSearchResults, setAdminSearchResults] = useState<AdminAccountSearchUserItem[]>([])
  const [grants, setGrants] = useState<AdminGrantHistoryItem[]>([])

  const [policy, setPolicy] = useState<AdminChallengePolicy>({
    window_days: 14,
    similarity_threshold: 0.55,
    repeatable_techniques: ['cognitive_reframe', 'catastrophizing_check', 'self_compassion_reframe'],
  })
  const [policyAudits, setPolicyAudits] = useState<AdminChallengePolicyAuditItem[]>([])

  const [boardRiskKeywords, setBoardRiskKeywords] = useState<AdminBoardRiskKeywords>({ keywords: [] })
  const [boardRiskKeywordsText, setBoardRiskKeywordsText] = useState('')
  const [blockedIps, setBlockedIps] = useState<AdminBlockedIPItem[]>([])
  const [blockedEmails, setBlockedEmails] = useState<AdminBlockedEmailItem[]>([])
  const [blockSearch, setBlockSearch] = useState('')
  const [blockCandidates, setBlockCandidates] = useState<AdminUserItem[]>([])

  const canLoad = useMemo(() => token.trim().length > 0, [token])

  function hideZero(value: number | string | null | undefined): string {
    if (value == null) return ''
    const text = String(value).trim()
    if (text === '' || text === '0' || text === '0.0' || text === '0.00') return ''
    return text
  }

  async function loadAll() {
    if (!canLoad) {
      setError('관리자 JWT 토큰이 필요합니다.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const [summaryRes, usersRes, highRiskRes, policyRes, auditRes, pendingRes, accRes, grantsRes, keywordsRes, blockedRes, blockedEmailRes] = await Promise.allSettled([
        fetchAdminSummary(token),
        fetchAdminUsers(token, query, 1, 20, userSortBy, userSortOrder),
        fetchAdminHighRisk(token, 30),
        fetchAdminChallengePolicy(token),
        fetchAdminChallengePolicyAudit(token, 30),
        fetchPendingReplyPosts(token, 50),
        fetchAdminAccounts(token),
        fetchAdminGrantHistory(token, 50),
        fetchAdminBoardRiskKeywords(token),
        fetchAdminBlockedIps(token, false, 200),
        fetchAdminBlockedEmails(token),
      ])

      const errors: string[] = []
      const errText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value)
      else errors.push(`요약: ${errText(summaryRes.reason)}`)

      if (usersRes.status === 'fulfilled') setUsers(usersRes.value.items)
      else errors.push(`사용자목록: ${errText(usersRes.reason)}`)

      if (highRiskRes.status === 'fulfilled') setHighRisk(highRiskRes.value.items)
      else errors.push(`고위험목록: ${errText(highRiskRes.reason)}`)

      if (policyRes.status === 'fulfilled') setPolicy(policyRes.value)
      else errors.push(`정책: ${errText(policyRes.reason)}`)

      if (auditRes.status === 'fulfilled') setPolicyAudits(auditRes.value.items)
      else errors.push(`정책이력: ${errText(auditRes.reason)}`)

      if (pendingRes.status === 'fulfilled') setPendingReplies(pendingRes.value.items)
      else errors.push(`미답변목록: ${errText(pendingRes.reason)}`)

      if (accRes.status === 'fulfilled') {
        setAccounts(accRes.value.items)
        setAccountOwnerEmail(accRes.value.owner_email)
        setCurrentUserIsOwner(accRes.value.current_user_is_owner)
      } else {
        errors.push(`관리자계정: ${errText(accRes.reason)}`)
      }

      if (grantsRes.status === 'fulfilled') setGrants(grantsRes.value.items)
      else errors.push(`권한이력: ${errText(grantsRes.reason)}`)

      if (keywordsRes.status === 'fulfilled') {
        setBoardRiskKeywords(keywordsRes.value)
        setBoardRiskKeywordsText((keywordsRes.value.keywords || []).join(', '))
      } else {
        errors.push(`위험키워드: ${errText(keywordsRes.reason)}`)
      }

      if (blockedRes.status === 'fulfilled') setBlockedIps(blockedRes.value.items)
      else errors.push(`IP차단: ${errText(blockedRes.reason)}`)

      if (blockedEmailRes.status === 'fulfilled') setBlockedEmails(blockedEmailRes.value.items)
      else errors.push(`이메일차단: ${errText(blockedEmailRes.reason)}`)

      if (errors.length > 0) {
        setError(errors.join(' | '))
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleSearchAdminCandidates() {
    if (!adminSearchQuery.trim()) {
      setAdminSearchResults([])
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await searchRegisteredUsersForAdminAdd(token, adminSearchQuery.trim(), 10)
      setAdminSearchResults(res.items)
    } catch (e) {
      setError((e as Error).message)
      setAdminSearchResults([])
    } finally {
      setLoading(false)
    }
  }

  async function handleSavePolicy() {
    setLoading(true)
    setError('')
    try {
      const saved = await updateAdminChallengePolicy(token, policy)
      setPolicy(saved)
      const auditRes = await fetchAdminChallengePolicyAudit(token, 30)
      setPolicyAudits(auditRes.items)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }


  async function handleSaveBoardRiskKeywords() {
    const cleaned = boardRiskKeywordsText
      .split(/[\n,]/)
      .map((x) => x.trim())
      .filter(Boolean)
    if (cleaned.length === 0) {
      setError('위험 키워드를 1개 이상 입력하세요.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const saved = await updateAdminBoardRiskKeywords(token, cleaned)
      setBoardRiskKeywords(saved)
      setBoardRiskKeywordsText(saved.keywords.join(', '))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRemoveBlockedIp(ipAddress: string) {
    setLoading(true)
    setError('')
    try {
      const res = await removeAdminBlockedIp(token, ipAddress)
      setBlockedIps(res.items)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRemoveBlockedEmail(email: string) {
    setLoading(true)
    setError('')
    try {
      const res = await removeAdminBlockedEmail(token, email)
      setBlockedEmails(res.items)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSearchBlockCandidates() {
    const keyword = blockSearch.trim()
    if (!keyword) {
      setBlockCandidates([])
      return
    }

    setLoading(true)
    setError('')
    try {
      const res = await fetchAdminUsers(token, keyword, 1, 50, 'created_at', 'desc')
      setBlockCandidates(res.items)
    } catch (e) {
      setError((e as Error).message)
      setBlockCandidates([])
    } finally {
      setLoading(false)
    }
  }

  async function handleBlockEmailFromCandidate(email: string) {
    setLoading(true)
    setError('')
    try {
      const res = await addAdminBlockedEmail(token, email, '관리자 수동 차단')
      setBlockedEmails(res.items)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleBlockIpFromCandidate(ipAddress: string, email: string) {
    if (!ipAddress.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await addAdminBlockedIp(token, ipAddress, `${email} 관련 차단`)
      setBlockedIps(res.items)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddAdmin() {
    if (!newAdminEmail.trim()) return
    setLoading(true)
    setError('')
    try {
      const result = await addAdminAccount(token, newAdminEmail.trim())
      setAccounts(result.items)
      setAccountOwnerEmail(result.owner_email)
      setCurrentUserIsOwner(result.current_user_is_owner)
      setNewAdminEmail('')
      setAdminSearchQuery('')
      setAdminSearchResults([])
      const grantsRes = await fetchAdminGrantHistory(token, 50)
      setGrants(grantsRes.items)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRemoveAdmin(email: string) {
    setLoading(true)
    setError('')
    try {
      const result = await removeAdminAccount(token, email)
      setAccounts(result.items)
      setAccountOwnerEmail(result.owner_email)
      setCurrentUserIsOwner(result.current_user_is_owner)
      const grantsRes = await fetchAdminGrantHistory(token, 50)
      setGrants(grantsRes.items)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function toggleTechnique(technique: string) {
    setPolicy((prev) => {
      const has = prev.repeatable_techniques.includes(technique)
      const next = has ? prev.repeatable_techniques.filter((x) => x !== technique) : [...prev.repeatable_techniques, technique]
      return { ...prev, repeatable_techniques: next.length ? next : prev.repeatable_techniques }
    })
  }

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section className="adminPage">
      <h2 className="adminTitle">관리자 페이지</h2>

      <div className="adminToolbar">
        <button className={menu === 'dashboard' ? '' : 'ghost'} onClick={() => setMenu('dashboard')}>대시보드</button>
        <button className={menu === 'accounts' ? '' : 'ghost'} onClick={() => setMenu('accounts')}>관리자 계정 추가</button>
        <button className={menu === 'pending' ? '' : 'ghost'} onClick={() => setMenu('pending')}>문의/피드백 미답변</button>
        <button className={menu === 'policy' ? '' : 'ghost'} onClick={() => setMenu('policy')}>생각 정리 추천 정책</button>
        <button className={menu === 'moderation' ? '' : 'ghost'} onClick={() => setMenu('moderation')}>모더레이션 관리</button>
        <button className="ghost" onClick={loadAll} disabled={loading}>{loading ? '로딩 중...' : '새로고침'}</button>
      </div>

      {error && <p className="adminDanger">{error}</p>}

      {menu === 'dashboard' && (
        <>
          {summary && (
            <section className="adminStatGrid">
              <StatCard label="오늘 접속자 수" value={summary.today_visitors} />
              <StatCard label="로그인 유저 수" value={summary.login_users_today} />
              <StatCard label="총 사용자" value={summary.total_users} />
              <StatCard label="고위험 플래그" value={summary.high_risk_assessments} />
              <StatCard label="게시판 알림" value={summary.board_question_feedback_alerts} />
            </section>
          )}

          <div className="adminDashboardStack">
            <section className="adminSection">
              <h3>사용자 목록 조회</h3>
              <div className="adminToolbar">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이메일/닉네임 검색" />
                <select value={userSortBy} onChange={(e) => setUserSortBy(e.target.value as typeof userSortBy)}>
                  <option value="created_at">가입일</option>
                  <option value="email">이메일</option>
                  <option value="nickname">닉네임</option>
                  <option value="assessment_count">검사 수</option>
                  <option value="login_days">접속 일수</option>
                  <option value="latest_login_ip">최근 접속 IP</option>
                  <option value="board_post_count">게시글 수</option>
                </select>
                <select value={userSortOrder} onChange={(e) => setUserSortOrder(e.target.value as typeof userSortOrder)}>
                  <option value="desc">내림차순</option>
                  <option value="asc">오름차순</option>
                </select>
                <button onClick={loadAll} disabled={loading}>조회</button>
              </div>
              <AdminTable headers={['이메일', '닉네임', '가입일', '최근 접속 IP', '검사 수', '접속 일수', '게시글 수']}>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.email}</td>
                    <td>{user.nickname}</td>
                    <td>{formatDate(user.created_at)}</td>
                    <td>{user.latest_login_ip ?? '미수집'}</td>
                    <td>{hideZero(user.assessment_count)}</td>
                    <td>{hideZero(user.login_days)}</td>
                    <td>{hideZero(user.board_post_count)}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="adminMuted">데이터가 없습니다.</td>
                  </tr>
                )}
              </AdminTable>
            </section>

            <section className="adminSection">
              <h3>고위험 플래그 목록</h3>
              <AdminTable headers={['일시', '이메일', '닉네임', '우울', '불안', '불면', '종합', '주요 위험 변수']}>
                {highRisk.map((item) => (
                  <tr key={item.assessment_id}>
                    <td>{formatDate(item.occurred_at)}</td>
                    <td>{item.user_email}</td>
                    <td>{item.user_nickname}</td>
                    <td>{hideZero(item.dep_score == null ? null : item.dep_score.toFixed(1))}</td>
                    <td>{hideZero(item.anx_score == null ? null : item.anx_score.toFixed(1))}</td>
                    <td>{hideZero(item.ins_score == null ? null : item.ins_score.toFixed(1))}</td>
                    <td>{hideZero(item.composite_score == null ? null : item.composite_score.toFixed(1))}</td>
                    <td>{item.major_risk_factors}</td>
                  </tr>
                ))}
                {highRisk.length === 0 && (
                  <tr>
                    <td colSpan={8} className="adminMuted">고위험 데이터가 없습니다.</td>
                  </tr>
                )}
              </AdminTable>
            </section>
          </div>
        </>
      )}

      {menu === 'accounts' && (
        <>
          <section className="adminSection">
            <h3>관리자 계정 추가</h3>
            <div className="adminToolbar">
              <input value={adminSearchQuery} onChange={(e) => setAdminSearchQuery(e.target.value)} placeholder="회원 이메일/닉네임 검색" />
              <button className="ghost" onClick={() => void handleSearchAdminCandidates()} disabled={loading}>회원 조회</button>
            </div>
            {adminSearchResults.length > 0 && (
              <ul className="probList" style={{ marginTop: 8 }}>
                {adminSearchResults.map((u) => (
                  <li key={u.id}>
                    <span>{u.nickname} ({u.email})</span>
                    <button className="ghost" onClick={() => setNewAdminEmail(u.email)}>선택</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="adminToolbar" style={{ marginTop: 8 }}>
              <input value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} placeholder="선택된 회원 이메일" />
              <button onClick={() => void handleAddAdmin()} disabled={loading || !newAdminEmail.trim()}>권한 부여</button>
            </div>
            <p className="adminMuted">총 관리자 계정: {accounts.length} / 오너: {accountOwnerEmail ?? '-'}</p>
            <AdminTable headers={['이메일', '출처', '오너', '권한 회수']}>
              {accounts.map((acc) => (
                <tr key={`${acc.email}-${acc.source}`}>
                  <td>{acc.email}</td>
                  <td>{acc.source}</td>
                  <td>{acc.is_owner ? '예' : '아니오'}</td>
                  <td>
                    <button
                      className="ghost"
                      disabled={!currentUserIsOwner || acc.is_owner || loading}
                      onClick={() => void handleRemoveAdmin(acc.email)}
                    >
                      회수
                    </button>
                  </td>
                </tr>
              ))}
            </AdminTable>
          </section>

          <section className="adminSection">
            <h3>권한 부여 이력</h3>
            <AdminTable headers={['권한 부여 시각', '권한 부여 관리자', '권한 부여받은 계정']}>
              {grants.map((item, idx) => (
                <tr key={`${item.granted_at}-${item.granted_to_email}-${idx}`}>
                  <td>{formatDate(item.granted_at)}</td>
                  <td>{item.granted_by_nickname ? `${item.granted_by_nickname} (${item.granted_by_email})` : item.granted_by_email}</td>
                  <td>{item.granted_to_email}</td>
                </tr>
              ))}
              {grants.length === 0 && (
                <tr>
                  <td colSpan={3} className="adminMuted">권한 부여 이력이 없습니다.</td>
                </tr>
              )}
            </AdminTable>
          </section>
        </>
      )}

      {menu === 'pending' && (
        <section className="adminSection">
          <h3>게시판 미답변 목록 (문의/피드백)</h3>
          <AdminTable headers={['작성 시각', '유형', '제목', '작성자', '이동']}>
            {pendingReplies.map((item) => (
              <tr key={item.post_id}>
                <td>{formatDate(item.created_at)}</td>
                <td>{item.category}</td>
                <td>{item.title}</td>
                <td>{item.author_nickname}</td>
                <td><button className="ghost" onClick={() => onOpenBoardPost(item.post_id)}>게시물 보기</button></td>
              </tr>
            ))}
            {pendingReplies.length === 0 && (
              <tr>
                <td colSpan={5} className="adminMuted">미답변 게시물이 없습니다.</td>
              </tr>
            )}
          </AdminTable>
        </section>
      )}

      {menu === 'policy' && (
        <>
          <section className="adminSection">
            <h3>생각 정리 추천 정책</h3>
            <div className="adminToolbar" style={{ gap: 12, alignItems: 'center' }}>
              <label>
                중복 회피 기간(일)
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={policy.window_days}
                  onChange={(e) => setPolicy((p) => ({ ...p, window_days: Number(e.target.value || 14) }))}
                />
              </label>
              <label>
                유사도 임계치(0.2~0.95)
                <input
                  type="number"
                  step="0.01"
                  min={0.2}
                  max={0.95}
                  value={policy.similarity_threshold}
                  onChange={(e) => setPolicy((p) => ({ ...p, similarity_threshold: Number(e.target.value || 0.55) }))}
                />
              </label>
            </div>
            <p className="adminMuted">반복 허용 생각 정리 기법</p>
            <div className="adminToolbar" style={{ flexWrap: 'wrap', gap: 10 }}>
              {TECHNIQUE_OPTIONS.map((tech) => (
                <label key={tech}>
                  <input
                    type="checkbox"
                    checked={policy.repeatable_techniques.includes(tech)}
                    onChange={() => toggleTechnique(tech)}
                  />
                  {TECHNIQUE_LABELS[tech]}
                </label>
              ))}
            </div>
            <div className="adminToolbar" style={{ marginTop: 10 }}>
              <button onClick={handleSavePolicy} disabled={loading}>정책 저장</button>
            </div>
          </section>

          <section className="adminSection">
            <h3>정책 변경 이력</h3>
            <AdminTable headers={['변경 시각', '관리자', '변경 내용']}>
              {policyAudits.map((item) => (
                <tr key={item.id}>
                  <td>{formatDate(item.created_at)}</td>
                  <td>{item.actor_nickname ? `${item.actor_nickname} (${item.actor_email})` : item.actor_email}</td>
                  <td>
                    {Object.entries(item.diff_json).map(([k, v]) => (
                      <div key={`${item.id}-${k}`}>
                        <strong>{k}</strong>: {toPolicyText(v.before)} → {toPolicyText(v.after)}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
              {policyAudits.length === 0 && (
                <tr>
                  <td colSpan={3} className="adminMuted">변경 이력이 없습니다.</td>
                </tr>
              )}
            </AdminTable>
          </section>

        </>
      )}

      {menu === 'moderation' && (
        <>
          <section className="adminSection">
            <h3>게시물 위험 키워드 설정</h3>
            <p className="adminMuted">쉼표(,) 또는 줄바꿈으로 구분해서 입력하세요.</p>
            <textarea
              rows={4}
              value={boardRiskKeywordsText}
              onChange={(e) => setBoardRiskKeywordsText(e.target.value)}
              placeholder="예: 협박, 폭행, 자해"
            />
            <div className="adminToolbar" style={{ marginTop: 10 }}>
              <button onClick={handleSaveBoardRiskKeywords} disabled={loading}>위험 키워드 저장</button>
              <span className="adminMuted">현재 {hideZero(boardRiskKeywords.keywords.length) || '없음'}</span>
            </div>
          </section>

          <section className="adminSection">
            <h3>계정 차단 관리</h3>
            <div className="adminToolbar">
              <input
                value={blockSearch}
                onChange={(e) => setBlockSearch(e.target.value)}
                placeholder="이메일 또는 IP 주소 검색"
              />
              <button onClick={() => void handleSearchBlockCandidates()} disabled={loading}>조회</button>
            </div>

            <AdminTable headers={['이메일', '닉네임', '최근 접속 IP', '이메일 차단', 'IP 차단']}>
              {blockCandidates.map((user) => (
                <tr key={`candidate-${user.id}`}>
                  <td>{user.email}</td>
                  <td>{user.nickname}</td>
                  <td>{user.latest_login_ip ?? '미수집'}</td>
                  <td>
                    <button className="ghost" disabled={loading} onClick={() => void handleBlockEmailFromCandidate(user.email)}>
                      이메일 차단
                    </button>
                  </td>
                  <td>
                    <button
                      className="ghost"
                      disabled={loading || !user.latest_login_ip}
                      onClick={() => void handleBlockIpFromCandidate(user.latest_login_ip ?? '', user.email)}
                    >
                      IP 차단
                    </button>
                  </td>
                </tr>
              ))}
              {blockCandidates.length === 0 && (
                <tr>
                  <td colSpan={5} className="adminMuted">검색 결과가 없습니다.</td>
                </tr>
              )}
            </AdminTable>

            <h3 style={{ marginTop: 12 }}>차단 목록</h3>
            <AdminTable headers={['유형', '대상', '사유', '등록 시각', '해제']}>
              {blockedEmails.map((item) => (
                <tr key={`blocked-email-${item.email}-${item.blocked_at}`}>
                  <td>이메일</td>
                  <td>{item.email}</td>
                  <td>{item.reason ?? ''}</td>
                  <td>{formatDate(item.blocked_at)}</td>
                  <td><button className="ghost" disabled={loading} onClick={() => void handleRemoveBlockedEmail(item.email)}>해제</button></td>
                </tr>
              ))}
              {blockedIps.map((item) => (
                <tr key={`blocked-ip-${item.id}`}>
                  <td>IP</td>
                  <td>{item.ip_address}</td>
                  <td>{item.reason ?? ''}</td>
                  <td>{formatDate(item.created_at)}</td>
                  <td>
                    <button className="ghost" disabled={loading || !item.is_active} onClick={() => void handleRemoveBlockedIp(item.ip_address)}>
                      해제
                    </button>
                  </td>
                </tr>
              ))}
              {blockedEmails.length === 0 && blockedIps.length === 0 && (
                <tr>
                  <td colSpan={5} className="adminMuted">차단된 대상이 없습니다.</td>
                </tr>
              )}
            </AdminTable>
          </section>
        </>
      )}
    </section>
  )
}
