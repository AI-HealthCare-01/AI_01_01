import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type PageKey = 'assessment' | 'account' | 'cbt'

type UserOut = {
  id: string
  email: string
  nickname: string
  created_at: string
}

type TokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
}

type CheckPredictRequest = {
  phq_total: number
  gad_total: number
  sleep_total: number
  context_risk_total: number
  phq9_suicidal_ideation: number
  daily_functioning: number
  stressful_event: number
  social_support: number
  coping_skill: number
  motivation_for_change: number
}

type CheckPredictResponse = {
  prediction: number
  probabilities: Record<string, number>
  model_path: string
}

type SurveyInput = {
  sleep_hours_week_avg: string
  depressed_level: string
  anxiety_level: string
  daily_functioning_impact: string
  stressful_event_impact: string
  social_support_lack: string
  coping_difficulty: string
  motivation_low: string
  suicidal_ideation: string
}

type SurveyOption = {
  value: string
  label: string
}

type SurveyField = {
  key: keyof SurveyInput
  label: string
  help: string
  inputType: 'number' | 'select'
  min?: number
  max?: number
  step?: number
  options?: SurveyOption[]
}

type ChatResponse = {
  reply: string
  disclaimer: string
  timestamp: string
  extracted: {
    distress_0_10: number
    rumination_0_10: number
    avoidance_0_10: number
    sleep_difficulty_0_10: number
    distortion: {
      all_or_nothing_count: number
      catastrophizing_count: number
      mind_reading_count: number
      should_statements_count: number
      personalization_count: number
      overgeneralization_count: number
    }
  }
  suggested_challenges: string[]
}

type WeeklyDashboardRow = {
  week_start_date: string
  dep_week_pred_0_100: number
  anx_week_pred_0_100: number
  ins_week_pred_0_100: number
  symptom_composite_pred_0_100: number
  alert_level?: string
  alert_reason_codes?: string
}

type WeeklyDashboardResponse = {
  user_id: string
  rows: WeeklyDashboardRow[]
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001'

const defaultSurvey: SurveyInput = {
  sleep_hours_week_avg: '',
  depressed_level: '',
  anxiety_level: '',
  daily_functioning_impact: '',
  stressful_event_impact: '',
  social_support_lack: '',
  coping_difficulty: '',
  motivation_low: '',
  suicidal_ideation: '',
}

const SCALE_0_TO_4_OPTIONS: SurveyOption[] = [
  { value: '0', label: '전혀 없음' },
  { value: '1', label: '약간 있음' },
  { value: '2', label: '보통' },
  { value: '3', label: '자주 느낌' },
  { value: '4', label: '매우 심함/매우 자주' },
]

const SURVEY_FIELDS: SurveyField[] = [
  {
    key: 'sleep_hours_week_avg',
    label: '일주일간 평균 수면시간은?',
    inputType: 'number',
    help: '시간 단위로 직접 입력하세요. 예: 6.5',
    min: 0,
    max: 12,
    step: 0.5,
  },
  { key: 'depressed_level', label: '최근 2주 우울함을 얼마나 느끼시나요?', inputType: 'select', help: '체감 수준을 선택하세요.', options: SCALE_0_TO_4_OPTIONS },
  { key: 'anxiety_level', label: '최근 2주 불안함을 얼마나 느끼시나요?', inputType: 'select', help: '체감 수준을 선택하세요.', options: SCALE_0_TO_4_OPTIONS },
  { key: 'daily_functioning_impact', label: '일상 기능 저하 정도는?', inputType: 'select', help: '체감 수준을 선택하세요.', options: SCALE_0_TO_4_OPTIONS },
  { key: 'stressful_event_impact', label: '최근 스트레스 사건 영향은?', inputType: 'select', help: '체감 수준을 선택하세요.', options: SCALE_0_TO_4_OPTIONS },
  { key: 'social_support_lack', label: '주변 지지가 부족하다고 느끼시나요?', inputType: 'select', help: '체감 수준을 선택하세요.', options: SCALE_0_TO_4_OPTIONS },
  { key: 'coping_difficulty', label: '스트레스 대처가 얼마나 어렵나요?', inputType: 'select', help: '체감 수준을 선택하세요.', options: SCALE_0_TO_4_OPTIONS },
  { key: 'motivation_low', label: '변화를 시도할 의지가 부족한가요?', inputType: 'select', help: '체감 수준을 선택하세요.', options: SCALE_0_TO_4_OPTIONS },
  { key: 'suicidal_ideation', label: '자해/자살 관련 생각이 있었나요?', inputType: 'select', help: '체감 수준을 선택하세요.', options: SCALE_0_TO_4_OPTIONS },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function toZeroToThree(value: number) {
  return Math.round(clamp(value, 0, 4) * 0.75)
}

function sleepHoursToSleepTotal(hours: number) {
  const h = clamp(hours, 0, 12)
  let riskLevel = 0
  if (h < 4 || h > 11) riskLevel = 3
  else if (h < 5 || h > 10) riskLevel = 2
  else if (h < 6 || h > 9) riskLevel = 1
  return riskLevel * 3
}

function buildPayload(survey: SurveyInput): CheckPredictRequest {
  const depressed = Number(survey.depressed_level)
  const anxiety = Number(survey.anxiety_level)
  const dailyFunctioning = toZeroToThree(Number(survey.daily_functioning_impact))
  const stressfulEvent = toZeroToThree(Number(survey.stressful_event_impact))
  const socialSupport = toZeroToThree(Number(survey.social_support_lack))
  const copingSkill = toZeroToThree(Number(survey.coping_difficulty))
  const motivation = toZeroToThree(Number(survey.motivation_low))
  const suicidal = toZeroToThree(Number(survey.suicidal_ideation))

  return {
    phq_total: Math.round((clamp(depressed, 0, 4) / 4) * 27),
    gad_total: Math.round((clamp(anxiety, 0, 4) / 4) * 21),
    sleep_total: sleepHoursToSleepTotal(Number(survey.sleep_hours_week_avg)),
    context_risk_total: Math.min(15, dailyFunctioning + stressfulEvent + socialSupport + copingSkill + motivation),
    phq9_suicidal_ideation: suicidal,
    daily_functioning: dailyFunctioning,
    stressful_event: stressfulEvent,
    social_support: socialSupport,
    coping_skill: copingSkill,
    motivation_for_change: motivation,
  }
}

async function extractApiError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: string }
    if (data.detail && typeof data.detail === 'string') return data.detail
  } catch {
    // ignore
  }
  return `HTTP ${response.status}`
}

function severityToKorean(level: number): string {
  if (level <= 0) return '낮은 수준'
  if (level === 1) return '경미한 수준'
  if (level === 2) return '비교적 높은 수준'
  if (level === 3) return '높은 수준'
  return '매우 높은 수준'
}

function App() {
  const [page, setPage] = useState<PageKey>('assessment')

  const [token, setToken] = useState<string>(() => localStorage.getItem('access_token') ?? '')
  const [me, setMe] = useState<UserOut | null>(null)

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('Ready.')

  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupNickname, setSignupNickname] = useState('')

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  const [survey, setSurvey] = useState<SurveyInput>(defaultSurvey)
  const [checkPrediction, setCheckPrediction] = useState<CheckPredictResponse | null>(null)

  const [chatMessage, setChatMessage] = useState('요즘 잠이 너무 안 오고, 다 망할 것 같다는 생각이 자주 들어요.')
  const [chatResult, setChatResult] = useState<ChatResponse | null>(null)
  const [dashboardUserId, setDashboardUserId] = useState('U000001')
  const [dashboard, setDashboard] = useState<WeeklyDashboardResponse | null>(null)

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token],
  )

  useEffect(() => {
    if (!token) {
      setMe(null)
      return
    }
    void loadProfile()
  }, [token])

  async function loadProfile() {
    try {
      const response = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as UserOut
      setMe(data)
    } catch (error) {
      setMessage(`Profile error: ${(error as Error).message}`)
    }
  }

  async function handleSignup(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setMessage('Creating account...')
    try {
      const response = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: signupEmail, password: signupPassword, nickname: signupNickname }),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as UserOut
      setMessage(`회원가입 완료: ${data.email}`)
    } catch (error) {
      setMessage(`회원가입 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setMessage('Signing in...')
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as TokenResponse
      localStorage.setItem('access_token', data.access_token)
      setToken(data.access_token)
      setMessage(`로그인 완료. 토큰 만료 ${data.expires_in / 60}분`)
    } catch (error) {
      setMessage(`로그인 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    localStorage.removeItem('access_token')
    setToken('')
    setMessage('로그아웃됨')
  }

  function onSurveyChange(key: keyof SurveyInput, value: string) {
    const field = SURVEY_FIELDS.find((item) => item.key === key)
    if (!field) return
    if (field.inputType === 'select') {
      setSurvey((prev) => ({ ...prev, [key]: value }))
      return
    }
    if (value === '') {
      setSurvey((prev) => ({ ...prev, [key]: '' }))
      return
    }
    if (!/^-?\d+(\.\d+)?$/.test(value)) return
    const numeric = Number(value)
    if (Number.isNaN(numeric)) return
    if (field.min != null && numeric < field.min) return
    if (field.max != null && numeric > field.max) return
    setSurvey((prev) => ({ ...prev, [key]: value }))
  }

  function validateSurvey(): string | null {
    for (const field of SURVEY_FIELDS) {
      const raw = survey[field.key]
      if (raw === '') return `${field.label} 항목을 입력해주세요.`
      if (field.inputType === 'number') {
        const value = Number(raw)
        if (Number.isNaN(value)) return `${field.label} 항목이 숫자 형식이 아닙니다.`
        if (field.min != null && value < field.min) return `${field.label} 값이 최소 범위보다 작습니다.`
        if (field.max != null && value > field.max) return `${field.label} 값이 최대 범위를 초과했습니다.`
      }
    }
    return null
  }

  async function handleSurveySubmit(event: FormEvent) {
    event.preventDefault()
    const validationError = validateSurvey()
    if (validationError) {
      setMessage(validationError)
      return
    }

    setLoading(true)
    setMessage('설문 분석 중...')
    try {
      const response = await fetch(`${API_BASE}/ai/check/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(survey)),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as CheckPredictResponse
      setCheckPrediction(data)
      setMessage('검사 결과가 생성되었습니다.')
    } catch (error) {
      setMessage(`검사 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleChatSubmit(event: FormEvent) {
    event.preventDefault()
    if (!token) {
      setMessage('CBT 채팅은 로그인 후 사용 가능합니다.')
      return
    }
    setLoading(true)
    setMessage('CBT 대화 분석 중...')
    try {
      const response = await fetch(`${API_BASE}/chat/cbt`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ message: chatMessage }),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as ChatResponse
      setChatResult(data)
      setMessage('CBT 응답 및 지표 추출 완료')
    } catch (error) {
      setMessage(`CBT 채팅 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function loadDashboard() {
    setLoading(true)
    setMessage('nowcast 대시보드 로딩 중...')
    try {
      const response = await fetch(`${API_BASE}/ai/nowcast/dashboard/${dashboardUserId}`)
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as WeeklyDashboardResponse
      setDashboard(data)
      setMessage('nowcast 대시보드 조회 완료')
    } catch (error) {
      setMessage(`대시보드 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  const nickname = me?.nickname ?? '게스트'
  const highRiskProbability = checkPrediction == null ? 0 : (checkPrediction.probabilities['3'] ?? 0) + (checkPrediction.probabilities['4'] ?? 0)

  return (
    <main className="page">
      <header className="hero">
        <p className="kicker">Mind Check Console</p>
        <h1>심리검사 + CBT + Nowcast 대시보드</h1>
        <p className="subtitle">LLM CBT 대화에서 지표를 추출하고, 질환별 추이를 주간 대시보드로 확인합니다.</p>
      </header>

      <section className="panel">
        <div className="actions">
          <button className={page === 'assessment' ? '' : 'ghost'} onClick={() => setPage('assessment')}>검사 페이지</button>
          <button className={page === 'cbt' ? '' : 'ghost'} onClick={() => setPage('cbt')}>CBT 채팅/대시보드</button>
          <button className={page === 'account' ? '' : 'ghost'} onClick={() => setPage('account')}>회원/로그인</button>
        </div>
      </section>

      {page === 'assessment' && (
        <section className="panel">
          <h2>심리검사</h2>
          <form onSubmit={handleSurveySubmit} className="miniGrid">
            {SURVEY_FIELDS.map((field) => (
              <label key={field.key}>
                {field.label}
                {field.inputType === 'select' ? (
                  <select value={survey[field.key]} onChange={(e) => onSurveyChange(field.key, e.target.value)}>
                    <option value="">선택하세요</option>
                    {(field.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                ) : (
                  <input type="text" inputMode="decimal" value={survey[field.key]} onChange={(e) => onSurveyChange(field.key, e.target.value.trim())} placeholder={`${field.min ?? ''} ~ ${field.max ?? ''}`} />
                )}
                <span className="hint">{field.help}</span>
              </label>
            ))}
            <button disabled={loading}>결과 보기</button>
          </form>

          {checkPrediction && (
            <div className="result">
              <p>{nickname}님의 검사 결과는 현재 우울 관련 어려움이 <strong>{severityToKorean(checkPrediction.prediction)}</strong>으로 나타났습니다.</p>
              <p>고위험 확률(3~4단계)은 <strong>{(highRiskProbability * 100).toFixed(1)}%</strong> 입니다.</p>
              <p className="small">참고용 결과이며 의료적 진단이 아닙니다.</p>
            </div>
          )}
        </section>
      )}

      {page === 'cbt' && (
        <section className="grid">
          <article className="panel">
            <h2>CBT 채팅 (LLM)</h2>
            <form onSubmit={handleChatSubmit} className="form">
              <label>
                오늘의 생각/감정
                <textarea value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} rows={5} />
              </label>
              <button disabled={loading}>CBT 응답 받기</button>
            </form>
            {!token && <p className="small">로그인 후 대화 기록이 저장됩니다.</p>}

            {chatResult && (
              <div className="result">
                <p><strong>코치 응답:</strong> {chatResult.reply}</p>
                <p><strong>추출 지표:</strong> distress {chatResult.extracted.distress_0_10}/10, rumination {chatResult.extracted.rumination_0_10}/10, avoidance {chatResult.extracted.avoidance_0_10}/10, sleep {chatResult.extracted.sleep_difficulty_0_10}/10</p>
                <ul className="probList">
                  {Object.entries(chatResult.extracted.distortion).map(([k, v]) => (
                    <li key={k}><span>{k}</span><strong>{v}</strong></li>
                  ))}
                </ul>
                <p><strong>추천 챌린지:</strong></p>
                <ul className="probList">
                  {chatResult.suggested_challenges.map((c) => (<li key={c}><span>{c}</span></li>))}
                </ul>
              </div>
            )}
          </article>

          <article className="panel">
            <h2>Nowcast 주간 대시보드 (Demo)</h2>
            <label>
              Synthetic User ID
              <input value={dashboardUserId} onChange={(e) => setDashboardUserId(e.target.value)} placeholder="예: U000001" />
            </label>
            <div className="actions">
              <button disabled={loading} onClick={loadDashboard}>대시보드 조회</button>
            </div>
            {dashboard && (
              <ul className="probList">
                {dashboard.rows.map((row) => (
                  <li key={row.week_start_date}>
                    <span>{row.week_start_date} | composite {row.symptom_composite_pred_0_100.toFixed(1)} | alert {row.alert_level ?? 'low'}</span>
                    <strong>dep {row.dep_week_pred_0_100.toFixed(1)} / anx {row.anx_week_pred_0_100.toFixed(1)} / ins {row.ins_week_pred_0_100.toFixed(1)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </section>
      )}

      {page === 'account' && (
        <section className="grid">
          <article className="panel">
            <h2>회원가입</h2>
            <form onSubmit={handleSignup} className="form">
              <label>Email<input value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required /></label>
              <label>Password<input type="password" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} minLength={8} required /></label>
              <label>Nickname<input value={signupNickname} onChange={(e) => setSignupNickname(e.target.value)} required /></label>
              <button disabled={loading}>Create Account</button>
            </form>
          </article>

          <article className="panel">
            <h2>로그인</h2>
            <form onSubmit={handleLogin} className="form">
              <label>Email<input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required /></label>
              <label>Password<input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} minLength={8} required /></label>
              <div className="actions">
                <button disabled={loading}>Login</button>
                <button type="button" className="ghost" onClick={logout}>Logout</button>
              </div>
            </form>
            <p className="mono">API: {API_BASE}</p>
            {me && <p className="badge">Signed in as {me.nickname} ({me.email})</p>}
          </article>
        </section>
      )}

      <footer className="status">
        <span>{loading ? 'Working...' : 'Idle'}</span>
        <span>{message}</span>
      </footer>
    </main>
  )
}

export default App
