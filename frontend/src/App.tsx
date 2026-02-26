import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import AdminPage from './pages/admin/AdminPage'
import BoardPage from './pages/board/BoardPage'

type PageKey = 'landing' | 'account' | 'checkin' | 'diary' | 'assessment' | 'board' | 'mypage' | 'admin'
type AccountMode = 'login' | 'signup' | 'find' | 'reset'
type MyPageTab = 'dashboard' | 'profile' | 'report'
type DashboardTab = 'today' | 'risk' | 'weekly' | 'monthly'
type LikertValue = '' | '0' | '1' | '2' | '3'

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

type ProfileOut = {
  email: string
  nickname: string
  phone_number?: string | null
}

type PasswordVerifyResponse = { matched: boolean }
type RecoveryQuestionResponse = { question: string }
type RecoveryVerifyResponse = { matched: boolean }

type ChatRole = 'user' | 'assistant'
type ChatTurn = { role: ChatRole; content: string; loading?: boolean }

type ChatResponse = {
  reply: string
  disclaimer: string
  timestamp: string
  extracted: {
    distress_0_10: number
    rumination_0_10: number
    avoidance_0_10: number
    sleep_difficulty_0_10: number
    distortion: Record<string, number>
  }
  suggested_challenges: string[]
  active_challenge?: string | null
  challenge_step_prompt?: string | null
  challenge_completed?: boolean
  completed_challenge?: string | null
  completion_message?: string | null
  summary_card?: {
    situation: string
    self_blame_signal: string
    reframe: string
    next_action: string
    encouragement: string
  }
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

type CheckinHistoryItem = {
  timestamp: string
  mood_score: number
  sleep_hours: number | null
  exercise_minutes_today: number | null
  daylight_minutes_today: number | null
  screen_time_min_today: number | null
  sleep_quality_0_10_today: number | null
}


type PHQ9AssessmentSummary = {
  id: string
  total_score: number
  severity: string
  created_at: string
}

type ClinicalReport = {
  period_start: string
  period_end: string
  generated_at: string
  summary_text: string
  risk_flags: Array<{ code: string; title: string; detail: string }>
  score_summary: {
    composite_latest: number | null
    dep_latest: number | null
    anx_latest: number | null
    ins_latest: number | null
    composite_delta: number | null
  }
  behavior_summary: {
    avg_sleep_hours: number | null
    avg_mood_score: number | null
    checkin_days: number
    cbt_sessions: number
    distortion_total_mean: number | null
    challenge_completed_total: number
    challenge_total: number
    challenge_completion_rate: number | null
  }
  clinician_note: string
  narrative_sections: Array<{ title: string; detail: string; major_dialogue?: string | null; llm_summary?: string | null }>
  score_trends: Array<{
    week_start_date: string
    composite: number
    dep: number
    anx: number
    ins: number
    composite_delta_from_prev: number | null
  }>
}

type AssessmentState = {
  phq9: LikertValue[]
  gad7: LikertValue[]
  sleep: LikertValue[]
  context: {
    daily_functioning: LikertValue
    stressful_event: LikertValue
    social_support: LikertValue
    coping_skill: LikertValue
    motivation_for_change: LikertValue
  }
}

type LifestyleCheckinState = {
  mood_score: string
  sleep_hours: string
  steps_today: string
  exercise_minutes_today: string
  daylight_minutes_today: string
  screen_time_min_today: string
  meal_regularity_0_10_today: string
  caffeine_after_2pm_flag_today: 'yes' | 'no'
  alcohol_flag_today: 'yes' | 'no'
  sleep_onset_latency_min_today: string
  awakenings_count_today: string
  sleep_quality_0_10_today: string
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001'

const LIKERT_OPTIONS: Array<{ value: LikertValue; label: string }> = [
  { value: '', label: '선택해주세요' },
  { value: '0', label: '전혀 그렇지 않았어요' },
  { value: '1', label: '가끔 그랬어요' },
  { value: '2', label: '자주 그랬어요' },
  { value: '3', label: '거의 대부분 그랬어요' },
]

const SECURITY_QUESTIONS = [
  '가장 기억에 남는 어린 시절 별명은?',
  '가장 좋아했던 초등학교 선생님 성함은?',
  '처음 키운 반려동물 이름은?',
  '내가 가장 좋아하는 음식은?',
]

const PHQ9_QUESTIONS = [
  '하루 중 즐거움이나 흥미가 줄어든 느낌이 있었나요?',
  '마음이 가라앉거나 희망이 줄어든 느낌이 있었나요?',
  '잠들기 어렵거나 자주 깨는 등 수면이 불편했나요?',
  '평소보다 쉽게 피곤해지고 기운이 떨어졌나요?',
  '식욕이 줄거나 반대로 많이 먹게 되는 변화가 있었나요?',
  '스스로를 부정적으로 보거나 자책하는 마음이 들었나요?',
  '집중이 잘 안 되어 일이나 대화가 어렵게 느껴졌나요?',
  '몸이나 생각의 속도가 너무 느리거나, 반대로 너무 들뜬 느낌이 있었나요?',
  '나를 해치고 싶거나 삶을 포기하고 싶은 생각이 스쳐간 적이 있었나요?',
]

const GAD7_QUESTIONS = [
  '긴장되거나 불안한 상태가 자주 이어졌나요?',
  '걱정이 시작되면 멈추기 어렵다고 느꼈나요?',
  '여러 일을 한꺼번에 걱정하게 되는 날이 많았나요?',
  '몸과 마음의 긴장을 풀기 어렵다고 느꼈나요?',
  '가만히 쉬어도 마음이 계속 불편하고 안절부절했나요?',
  '사소한 일에도 예민해지거나 짜증이 늘었나요?',
  '앞으로 나쁜 일이 생길까 봐 걱정이 커졌나요?',
]

const SLEEP_QUESTIONS = [
  '잠들기까지 시간이 오래 걸리거나 쉽게 잠들지 못했나요?',
  '자는 중간에 자주 깨거나 다시 잠들기 어려웠나요?',
  '수면 문제 때문에 낮 시간의 컨디션이 떨어졌나요?',
]

function initLikertArray(length: number): LikertValue[] {
  return Array.from({ length }, () => '') as LikertValue[]
}

const defaultAssessment: AssessmentState = {
  phq9: initLikertArray(9),
  gad7: initLikertArray(7),
  sleep: initLikertArray(3),
  context: {
    daily_functioning: '',
    stressful_event: '',
    social_support: '',
    coping_skill: '',
    motivation_for_change: '',
  },
}

const defaultCheckin: LifestyleCheckinState = {
  mood_score: '',
  sleep_hours: '',
  steps_today: '',
  exercise_minutes_today: '',
  daylight_minutes_today: '',
  screen_time_min_today: '',
  meal_regularity_0_10_today: '',
  caffeine_after_2pm_flag_today: 'no',
  alcohol_flag_today: 'no',
  sleep_onset_latency_min_today: '',
  awakenings_count_today: '',
  sleep_quality_0_10_today: '',
}

function sumLikert(values: LikertValue[]): number {
  return values.reduce((acc, v) => acc + Number(v || 0), 0)
}

function severityToKorean(level: number): string {
  if (level <= 0) return '낮은 수준'
  if (level === 1) return '경미한 수준'
  if (level === 2) return '비교적 높은 수준'
  if (level === 3) return '높은 수준'
  return '매우 높은 수준'
}

function formatDelta(current: number, prev?: number): string {
  if (prev == null) return '-'
  const d = current - prev
  return `${d >= 0 ? '+' : ''}${d.toFixed(1)}`
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


function formatDateYYYYMMDD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfWeekMonday(input: Date): Date {
  const d = new Date(input)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function MultiMetricTrendChart({
  labels,
  series,
  emptyMessage,
}: {
  labels: string[]
  series: Array<{ name: string; color: string; values: Array<number | null>; emphasis?: boolean }>
  emptyMessage?: string
}) {
  const resolvedEmptyMessage = emptyMessage ?? '데이터가 없으니 그래프를 만들 수 없습니다. 먼저 검사/체크인을 진행해주세요.'
  if (!labels.length || !series.length) return <p className="chartEmpty">{resolvedEmptyMessage}</p>
  const all = series.flatMap((sr) => sr.values.filter((v): v is number => v != null))
  if (!all.length) return <p className="chartEmpty">{resolvedEmptyMessage}</p>

  const max = Math.max(...all, 100)
  const min = Math.min(...all, 0)
  const range = Math.max(1, max - min)
  const xLabelStep = Math.max(1, Math.ceil(labels.length / 5))
  const chartWidth = Math.max(720, labels.length * 88)
  const chartHeight = 320
  const leftPad = 56
  const rightPad = 24
  const topPad = 16
  const bottomPad = 58
  const plotWidth = chartWidth - leftPad - rightPad
  const plotHeight = chartHeight - topPad - bottomPad

  return (
    <div className="chartCard">
      <div className="chartViewport">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} width={chartWidth} height={chartHeight} role="img" aria-label="multi trend chart">
        {[0, 25, 50, 75, 100].map((g) => (
          <line
            key={g}
            x1={leftPad}
            y1={topPad + ((100 - g) / 100) * plotHeight}
            x2={chartWidth - rightPad}
            y2={topPad + ((100 - g) / 100) * plotHeight}
            stroke="#edf2f7"
            strokeWidth="1"
          />
        ))}
        <line x1={leftPad} y1={topPad} x2={leftPad} y2={chartHeight - bottomPad} stroke="#94a3b8" strokeWidth="1.1" />
        <line x1={leftPad} y1={chartHeight - bottomPad} x2={chartWidth - rightPad} y2={chartHeight - bottomPad} stroke="#94a3b8" strokeWidth="1.1" />
        {series.map((line) => {
          const points = line.values.map((v, idx) => {
            if (v == null) return null
            const x = leftPad + (idx / Math.max(1, labels.length - 1)) * plotWidth
            const y = topPad + (1 - ((v - min) / range)) * plotHeight
            return { x, y }
          })

          const segments: string[] = []
          let current: string[] = []
          points.forEach((p) => {
            if (!p) {
              if (current.length > 1) segments.push(current.join(' '))
              current = []
              return
            }
            current.push(`${p.x},${p.y}`)
          })
          if (current.length > 1) segments.push(current.join(' '))

          const lastPoint = [...points].reverse().find((p) => p != null) ?? null

          return (
            <g key={line.name}>
              {segments.map((seg, i) => (
                <polyline
                  key={`${line.name}-${i}`}
                  fill="none"
                  stroke={line.color}
                  strokeWidth={line.emphasis ? '3.8' : '1.8'}
                  opacity={line.emphasis ? '1' : '0.56'}
                  points={seg}
                />
              ))}
              {lastPoint && (
                <circle
                  cx={lastPoint.x}
                  cy={lastPoint.y}
                  r={line.emphasis ? '1.6' : '1.1'}
                  fill={line.color}
                  opacity={line.emphasis ? '1' : '0.75'}
                />
              )}
            </g>
          )
        })}
        {labels.map((label, idx) => {
          if (!(idx % xLabelStep === 0 || idx === labels.length - 1)) return null
          const x = leftPad + (idx / Math.max(1, labels.length - 1)) * plotWidth
          return (
            <text key={`${label}-${idx}`} x={x} y={chartHeight - 24} textAnchor="middle" fontSize="11" fill="#64748b">
              {label}
            </text>
          )
        })}
        {[0, 25, 50, 75, 100].map((tick) => (
          <text
            key={`tick-${tick}`}
            x={leftPad - 10}
            y={topPad + ((100 - tick) / 100) * plotHeight + 4}
            textAnchor="end"
            fontSize="11"
            fill="#64748b"
          >
            {tick}
          </text>
        ))}
      </svg>
      </div>
      <div className="chartLegend">
        {series.map((line) => (
          <span key={`legend-${line.name}`}>
            <i style={{ background: line.color, opacity: line.emphasis ? 1 : 0.56 }} />
            {line.name}
          </span>
        ))}
      </div>
    </div>
  )
}


function MiniBarChart({ labels, values, color }: { labels: string[]; values: number[]; color: string }) {
  if (!values.length) return <p className="small">데이터가 없습니다.</p>
  const max = Math.max(...values, 1)
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {values.map((v, i) => (
        <div key={`${labels[i]}-${i}`} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 60px', gap: 8, alignItems: 'center' }}>
          <span className="small">{labels[i]}</span>
          <div style={{ background: '#e5eef1', borderRadius: 8, height: 10 }}>
            <div style={{ width: `${Math.max(4, (v / max) * 100)}%`, background: color, height: '100%', borderRadius: 8 }} />
          </div>
          <strong>{v.toFixed(1)}</strong>
        </div>
      ))}
    </div>
  )
}

function buildPayload(assessment: AssessmentState): CheckPredictRequest {
  const phqTotal = sumLikert(assessment.phq9)
  const gadTotal = sumLikert(assessment.gad7)
  const sleepTotal = sumLikert(assessment.sleep)

  const daily = Number(assessment.context.daily_functioning)
  const stressful = Number(assessment.context.stressful_event)
  const social = Number(assessment.context.social_support)
  const coping = Number(assessment.context.coping_skill)
  const motivation = Number(assessment.context.motivation_for_change)

  const contextRisk = daily + stressful + social + coping + motivation

  return {
    phq_total: phqTotal,
    gad_total: gadTotal,
    sleep_total: sleepTotal,
    context_risk_total: contextRisk,
    phq9_suicidal_ideation: Number(assessment.phq9[8] || 0),
    daily_functioning: daily,
    stressful_event: stressful,
    social_support: social,
    coping_skill: coping,
    motivation_for_change: motivation,
  }
}

function App() {
  const [page, setPage] = useState<PageKey>('landing')
  const [accountMode, setAccountMode] = useState<AccountMode>('login')
  const [myTab, setMyTab] = useState<MyPageTab>('dashboard')
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('today')

  const [token, setToken] = useState<string>('')
  const [me, setMe] = useState<UserOut | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('Ready.')

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState('')
  const [signupNickname, setSignupNickname] = useState('')
  const [signupSecurityQuestion, setSignupSecurityQuestion] = useState(SECURITY_QUESTIONS[0])
  const [signupSecurityAnswer, setSignupSecurityAnswer] = useState('')

  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoveryQuestion, setRecoveryQuestion] = useState('')
  const [recoveryAnswer, setRecoveryAnswer] = useState('')
  const [recoveryVerified, setRecoveryVerified] = useState(false)
  const [resetNewPassword, setResetNewPassword] = useState('')
  const [resetNewPasswordConfirm, setResetNewPasswordConfirm] = useState('')

  const [assessment, setAssessment] = useState<AssessmentState>(defaultAssessment)
  const [checkPrediction, setCheckPrediction] = useState<CheckPredictResponse | null>(null)

  const [checkin, setCheckin] = useState<LifestyleCheckinState>(defaultCheckin)

  const [chatMessage, setChatMessage] = useState('')
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([])
  const [chatResult, setChatResult] = useState<ChatResponse | null>(null)
  const [activeChallenge, setActiveChallenge] = useState('')
  const [challengePhase, setChallengePhase] = useState<'start' | 'continue' | 'reflect'>('continue')
  const [challengeStatus, setChallengeStatus] = useState<Record<string, boolean>>({})
  const [chatGenerating, setChatGenerating] = useState(false)
  const [challengeHintText, setChallengeHintText] = useState('')
  const [dialogueFinishedOpen, setDialogueFinishedOpen] = useState(false)
  const [boardFocusPostId, setBoardFocusPostId] = useState<string | null>(null)

  const chatMessagesRef = useRef<HTMLDivElement | null>(null)
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null)

  const [dashboard, setDashboard] = useState<WeeklyDashboardResponse | null>(null)
  const [checkinHistory, setCheckinHistory] = useState<CheckinHistoryItem[]>([])
  const [, setPhqHistory] = useState<PHQ9AssessmentSummary[]>([])
  const [reportStartDate, setReportStartDate] = useState(() => new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
  const [reportEndDate, setReportEndDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [clinicalReport, setClinicalReport] = useState<ClinicalReport | null>(null)

  const [profile, setProfile] = useState<ProfileOut | null>(null)
  const [profileNickname, setProfileNickname] = useState('')
  const [profileCurrentPw, setProfileCurrentPw] = useState('')
  const [profileNewPw, setProfileNewPw] = useState('')
  const [profileNewPwConfirm, setProfileNewPwConfirm] = useState('')
  const [passwordVerified, setPasswordVerified] = useState(false)

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token])

  useEffect(() => {
    if (!token) {
      setMe(null)
      setProfile(null)
      setIsAdmin(false)
      setPage('landing')
      return
    }
    void loadProfile()
    void loadMyProfile()
    void loadMyDashboard()
    void loadCheckinHistory()
    void loadPhqHistory()
    void loadAdminAccess()
    setPage('checkin')
  }, [token])

  useEffect(() => {
    if (!chatResult) return
    setChallengeStatus((prev) => {
      const next = { ...prev }
      for (const c of chatResult.suggested_challenges) {
        if (next[c] == null) next[c] = false
      }
      return next
    })
  }, [chatResult])

  useEffect(() => {
    if (!chatMessagesRef.current) return
    chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
  }, [chatHistory, chatGenerating])

  useEffect(() => {
    if (!chatInputRef.current) return
    chatInputRef.current.style.height = '0px'
    chatInputRef.current.style.height = `${Math.min(160, Math.max(44, chatInputRef.current.scrollHeight))}px`
  }, [chatMessage, page])


  async function loadAdminAccess() {
    try {
      const response = await fetch(`${API_BASE}/admin/summary`, { headers: authHeaders })
      setIsAdmin(response.ok)
    } catch {
      setIsAdmin(false)
    }
  }

  async function loadProfile() {
    try {
      const response = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders })
      if (response.status === 401) {
        setToken('')
        localStorage.removeItem('access_token')
        setPage('landing')
        return
      }
      if (!response.ok) throw new Error(await extractApiError(response))
      setMe((await response.json()) as UserOut)
    } catch (error) {
      setMessage(`프로필 조회 오류: ${(error as Error).message}`)
    }
  }

  async function loadMyProfile() {
    try {
      const response = await fetch(`${API_BASE}/auth/me/profile`, { headers: authHeaders })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as ProfileOut
      setProfile(data)
      setProfileNickname(data.nickname)
      setProfileCurrentPw('')
      setProfileNewPw('')
      setProfileNewPwConfirm('')
      setPasswordVerified(false)
    } catch (error) {
      setMessage(`회원정보 조회 오류: ${(error as Error).message}`)
    }
  }

  async function loadPhqHistory() {
    if (!token) return
    try {
      const response = await fetch(`${API_BASE}/assessments/phq9`, { headers: authHeaders })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as PHQ9AssessmentSummary[]
      setPhqHistory(data)
      if (data.length === 0) {
        setPage('assessment')
        setMessage('첫 로그인 후에는 종합심리검사를 먼저 1회 진행해주세요.')
      }
    } catch (error) {
      setMessage(`검사 이력 조회 오류: ${(error as Error).message}`)
    }
  }

  async function loadMyDashboard() {
    if (!token) return
    try {
      const response = await fetch(`${API_BASE}/ai/nowcast/dashboard/me`, { headers: authHeaders })
      if (!response.ok) throw new Error(await extractApiError(response))
      setDashboard((await response.json()) as WeeklyDashboardResponse)
    } catch (error) {
      setMessage(`대시보드 조회 오류: ${(error as Error).message}`)
    }
  }

  async function loadCheckinHistory() {
    if (!token) return
    try {
      const response = await fetch(`${API_BASE}/checkins/history?days=90`, { headers: authHeaders })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as CheckinHistoryItem[]
      setCheckinHistory(data)
    } catch (error) {
      setMessage(`체크인 이력 조회 오류: ${(error as Error).message}`)
    }
  }

  async function handleGenerateClinicalReport() {
    if (!token) {
      setMessage('로그인 후 리포트를 생성할 수 있습니다.')
      return
    }
    if (!reportStartDate || !reportEndDate) {
      setMessage('리포트 기간을 선택해주세요.')
      return
    }

    setLoading(true)
    try {
      const qs = new URLSearchParams({ start_date: reportStartDate, end_date: reportEndDate })
      const response = await fetch(`${API_BASE}/reports/clinical/me?${qs.toString()}`, { headers: authHeaders })
      if (!response.ok) throw new Error(await extractApiError(response))
      setClinicalReport((await response.json()) as ClinicalReport)
      setMessage('의료진 참고용 요약 리포트를 생성했습니다.')
    } catch (error) {
      setMessage(`리포트 생성 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }
  async function handleDownloadReportJpg() {
    if (!clinicalReport) {
      setMessage('먼저 리포트를 확인해주세요.')
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 1700
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setMessage('리포트 이미지 생성에 실패했습니다.')
      return
    }

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 36px sans-serif'
    ctx.fillText('CBT 요약 리포트', 60, 80)
    ctx.font = '24px sans-serif'
    ctx.fillText(`기간: ${clinicalReport.period_start} ~ ${clinicalReport.period_end}`, 60, 130)

    let y = 190
    const drawLine = (text: string, isTitle = false) => {
      ctx.font = isTitle ? 'bold 24px sans-serif' : '20px sans-serif'
      const maxWidth = 1080
      const words = text.split(' ')
      let line = ''
      for (const w of words) {
        const t = line ? `${line} ${w}` : w
        if (ctx.measureText(t).width > maxWidth) {
          ctx.fillText(line, 60, y)
          y += 34
          line = w
        } else {
          line = t
        }
      }
      if (line) {
        ctx.fillText(line, 60, y)
        y += 34
      }
      y += 8
    }

    drawLine('대화 기반 임상 참고 서술', true)
    for (const item of clinicalReport.narrative_sections) {
      drawLine(`${item.title}: ${item.detail}`)
    }

    drawLine('점수 참고지표', true)
    drawLine(`Composite 최근 ${clinicalReport.score_summary.composite_latest ?? '-'} / 변화 ${clinicalReport.score_summary.composite_delta ?? '-'}`)
    for (const row of clinicalReport.score_trends) {
      drawLine(`${row.week_start_date} | comp ${row.composite.toFixed(1)} / dep ${row.dep.toFixed(1)} / anx ${row.anx.toFixed(1)} / ins ${row.ins.toFixed(1)}`)
    }

    drawLine('위험 신호', true)
    if (!clinicalReport.risk_flags.length) {
      drawLine('현재 기간에서 뚜렷한 고위험 플래그가 없습니다.')
    } else {
      for (const f of clinicalReport.risk_flags) {
        drawLine(`${f.title}: ${f.detail}`)
      }
    }

    drawLine('진료 메모', true)
    drawLine(clinicalReport.clinician_note)

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `clinical_report_${clinicalReport.period_start}_${clinicalReport.period_end}.jpg`
    a.click()
    setMessage('리포트 JPG 파일을 저장했습니다.')
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as TokenResponse
      setToken(data.access_token)
      setMessage('로그인 성공')
    } catch (error) {
      setMessage(`로그인 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleSignup(event: FormEvent) {
    event.preventDefault()
    if (signupPassword !== signupPasswordConfirm) {
      setMessage('비밀번호 확인 값이 일치하지 않습니다.')
      return
    }
    if (!signupSecurityAnswer.trim()) {
      setMessage('보안 질문 답을 입력해주세요.')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: signupEmail,
          password: signupPassword,
          nickname: signupNickname,
          security_question: signupSecurityQuestion,
          security_answer: signupSecurityAnswer,
        }),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      setMessage('회원가입 완료. 로그인 후 종합심리검사를 1회 진행해주세요.')
      setAccountMode('login')
    } catch (error) {
      setMessage(`회원가입 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleRequestRecoveryQuestion(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/auth/password-recovery/question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail }),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as RecoveryQuestionResponse
      setRecoveryQuestion(data.question)
      setMessage('보안 질문을 확인해주세요.')
    } catch (error) {
      setMessage(`비밀번호 찾기 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyRecoveryAnswer(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/auth/password-recovery/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail, security_answer: recoveryAnswer }),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as RecoveryVerifyResponse
      setRecoveryVerified(data.matched)
      setAccountMode('reset')
      setMessage('답변 확인 완료. 새 비밀번호를 입력해주세요.')
    } catch (error) {
      setMessage(`답변 확인 오류: ${(error as Error).message}`)
      setRecoveryVerified(false)
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword(event: FormEvent) {
    event.preventDefault()
    if (!recoveryVerified) {
      setMessage('보안 질문 답변 확인을 먼저 진행해주세요.')
      return
    }
    if (resetNewPassword !== resetNewPasswordConfirm) {
      setMessage('새 비밀번호 확인 값이 일치하지 않습니다.')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/auth/password-recovery/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: recoveryEmail,
          security_answer: recoveryAnswer,
          new_password: resetNewPassword,
        }),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      setMessage('비밀번호가 변경되었습니다. 로그인해주세요.')
      setAccountMode('login')
      setRecoveryQuestion('')
      setRecoveryAnswer('')
      setRecoveryVerified(false)
      setResetNewPassword('')
      setResetNewPasswordConfirm('')
    } catch (error) {
      setMessage(`비밀번호 변경 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    localStorage.removeItem('access_token')
    setToken('')
    setMessage('로그아웃되었습니다.')
  }

  function setPhqAnswer(index: number, value: LikertValue) {
    setAssessment((prev) => {
      const next = [...prev.phq9]
      next[index] = value
      return { ...prev, phq9: next }
    })
  }

  function setGadAnswer(index: number, value: LikertValue) {
    setAssessment((prev) => {
      const next = [...prev.gad7]
      next[index] = value
      return { ...prev, gad7: next }
    })
  }

  function setSleepAnswer(index: number, value: LikertValue) {
    setAssessment((prev) => {
      const next = [...prev.sleep]
      next[index] = value
      return { ...prev, sleep: next }
    })
  }

  function setContextAnswer(key: keyof AssessmentState['context'], value: LikertValue) {
    setAssessment((prev) => ({ ...prev, context: { ...prev.context, [key]: value } }))
  }

  function validateAssessment(): string | null {
    if (assessment.phq9.some((v) => v === '')) return '우울 문항을 모두 선택해주세요.'
    if (assessment.gad7.some((v) => v === '')) return '불안 문항을 모두 선택해주세요.'
    if (assessment.sleep.some((v) => v === '')) return '수면 문항을 모두 선택해주세요.'
    if (Object.values(assessment.context).some((v) => v === '')) return '생활 맥락 문항을 모두 선택해주세요.'
    return null
  }

  async function handleSurveySubmit(event: FormEvent) {
    event.preventDefault()
    const err = validateAssessment()
    if (err) {
      setMessage(err)
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/ai/check/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(assessment)),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as CheckPredictResponse
      setCheckPrediction(data)

      if (token) {
        const answers = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`q${i + 1}`, Number(assessment.phq9[i])]))
        const saveRes = await fetch(`${API_BASE}/assessments/phq9`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ answers }),
        })
        if (!saveRes.ok) throw new Error(await extractApiError(saveRes))
        await loadPhqHistory()
        await loadMyDashboard()
      }
      setMessage('검사 결과를 저장했습니다.')
    } catch (error) {
      setMessage(`검사 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  function handleCheckinInput(key: keyof LifestyleCheckinState, value: string) {
    setCheckin((prev) => ({ ...prev, [key]: value }))
  }

  async function handleCheckinSubmit() {
    if (!token) {
      setMessage('로그인 후 체크인할 수 있습니다.')
      return
    }
    if (!checkin.mood_score) {
      setMessage('오늘의 기분 점수를 입력해주세요.')
      return
    }

    const mood = Number(checkin.mood_score)
    if (Number.isNaN(mood) || mood < 1 || mood > 10) {
      setMessage('기분 점수는 1~10 범위여야 합니다.')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/checkins`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          mood_score: mood,
          sleep_hours: checkin.sleep_hours === '' ? null : Number(checkin.sleep_hours),
          exercised: Number(checkin.exercise_minutes_today || 0) > 0,
          note: 'daily_lifestyle_checkin',
          challenge_completed_count: 0,
          challenge_total_count: 0,
          steps_today: checkin.steps_today === '' ? null : Number(checkin.steps_today),
          exercise_minutes_today: checkin.exercise_minutes_today === '' ? null : Number(checkin.exercise_minutes_today),
          daylight_minutes_today: checkin.daylight_minutes_today === '' ? null : Number(checkin.daylight_minutes_today),
          screen_time_min_today: checkin.screen_time_min_today === '' ? null : Number(checkin.screen_time_min_today),
          meal_regularity_0_10_today: checkin.meal_regularity_0_10_today === '' ? null : Number(checkin.meal_regularity_0_10_today),
          caffeine_after_2pm_flag_today: checkin.caffeine_after_2pm_flag_today === 'yes',
          alcohol_flag_today: checkin.alcohol_flag_today === 'yes',
          sleep_onset_latency_min_today: checkin.sleep_onset_latency_min_today === '' ? null : Number(checkin.sleep_onset_latency_min_today),
          awakenings_count_today: checkin.awakenings_count_today === '' ? null : Number(checkin.awakenings_count_today),
          sleep_quality_0_10_today: checkin.sleep_quality_0_10_today === '' ? null : Number(checkin.sleep_quality_0_10_today),
        }),
      })
      if (!response.ok) throw new Error(await extractApiError(response))

      const summary = [
        `기분 ${checkin.mood_score}/10`,
        checkin.sleep_hours ? `수면 ${checkin.sleep_hours}시간` : null,
        checkin.exercise_minutes_today ? `운동 ${checkin.exercise_minutes_today}분` : null,
        checkin.daylight_minutes_today ? `햇빛 ${checkin.daylight_minutes_today}분` : null,
      ].filter(Boolean).join(', ')

      setPage('diary')
      setChatMessage(`오늘 체크인 요약: ${summary}. 이 데이터를 참고해서 오늘 상태를 같이 정리해줘.`)
      await loadMyDashboard()
      await loadCheckinHistory()
      setMessage('체크인이 저장되었습니다. 감정일기 대화를 시작해보세요.')
    } catch (error) {
      setMessage(`체크인 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  function upsertAssistantDraft(content: string, isDraft: boolean, completionMessage?: string | null) {
    setChatHistory((prev) => {
      const next = [...prev]
      for (let i = next.length - 1; i >= 0; i -= 1) {
        if (next[i].role === 'assistant' && next[i].loading) {
          next[i] = { role: 'assistant', content, loading: isDraft }
          if (!isDraft && completionMessage) next.push({ role: 'assistant', content: completionMessage })
          return next
        }
      }
      const appended: ChatTurn[] = [...prev, { role: 'assistant', content, loading: isDraft }]
      if (!isDraft && completionMessage) appended.push({ role: 'assistant', content: completionMessage })
      return appended
    })
  }

  async function handleChatSubmit(event: FormEvent) {
    event.preventDefault()
    if (!token) {
      setMessage('로그인 후 감정일기 대화를 사용할 수 있습니다.')
      return
    }

    const text = chatMessage.trim()
    if (!text) {
      setMessage('대화 내용을 입력해주세요.')
      return
    }

    const history = chatHistory.slice(-12)
    setChatHistory((prev) => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '', loading: true }])
    setChatMessage('')
    setLoading(true)
    setChatGenerating(true)

    try {
      const payload: Record<string, unknown> = {
        message: text,
        conversation_history: history,
      }
      if (activeChallenge) {
        payload.active_challenge = activeChallenge
        payload.challenge_phase = challengePhase
      }

      const response = await fetch(`${API_BASE}/chat/cbt`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as ChatResponse

      setChatResult(data)

      const replyText = (data.reply || '').trim() || '응답을 정리했습니다. 이어서 계속 이야기해볼까요?'
      const chunkSize = Math.max(1, Math.ceil(replyText.length / 90))
      let cursor = 0
      while (cursor < replyText.length) {
        cursor = Math.min(replyText.length, cursor + chunkSize)
        upsertAssistantDraft(replyText.slice(0, cursor), cursor < replyText.length)
        await new Promise((resolve) => window.setTimeout(resolve, 16))
      }

      upsertAssistantDraft(replyText, false, data.challenge_completed ? (data.completion_message ?? null) : null)

      if (data.active_challenge) {
        setActiveChallenge(data.active_challenge)
        setChallengePhase(data.challenge_completed ? 'reflect' : 'continue')
      }
      if (data.challenge_completed && data.completed_challenge) {
        setChallengeStatus((prev) => ({ ...prev, [data.completed_challenge as string]: true }))
      }

      const difficultyWords = ['어렵', '모르겠', '막혀', '힘들', 'confused', 'stuck']
      const isStuck = difficultyWords.some((w) => text.toLowerCase().includes(w))
      if (isStuck || (data.extracted?.distress_0_10 ?? 0) >= 7) {
        setChallengeHintText(data.challenge_step_prompt ?? '지금 단계가 어렵다면 사실 1개, 생각 1개, 감정 1개만 짧게 적어보세요.')
      } else if (data.challenge_step_prompt) {
        setChallengeHintText(data.challenge_step_prompt)
      }

      setMessage('대화 분석 완료')
    } catch (error) {
      setChatHistory((prev) => prev.filter((turn) => !turn.loading))
      setMessage(`감정일기 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
      setChatGenerating(false)
    }
  }

  function startChallenge(challenge: string) {
    setActiveChallenge(challenge)
    setChallengePhase('start')
    setChallengeHintText('선택한 챌린지를 단계별로 진행합니다. 사실-감정-생각을 순서대로 적어주세요.')
    setChatHistory((prev) => [...prev, { role: 'assistant', content: `좋아요. '${challenge}'를 함께 해볼게요. 먼저 지금 상황에서 사실로 확인되는 내용 1가지를 적어주세요. 다음 단계에서 감정과 생각을 차례로 정리해볼게요.` }])
  }

  async function handleFinishDialogue() {
    if (!token) return
    const challenges = (chatResult?.suggested_challenges ?? [])
    const completedCount = challenges.filter((c) => challengeStatus[c]).length

    const mood = Number(checkin.mood_score || 5)
    const sleep = checkin.sleep_hours === '' ? null : Number(checkin.sleep_hours)

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/checkins`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          mood_score: mood,
          sleep_hours: sleep,
          exercised: Number(checkin.exercise_minutes_today || 0) > 0 || completedCount > 0,
          note: activeChallenge ? `dialogue_end|active_challenge:${activeChallenge}` : 'dialogue_end',
          challenge_completed_count: completedCount,
          challenge_total_count: challenges.length,
          steps_today: checkin.steps_today === '' ? null : Number(checkin.steps_today),
          exercise_minutes_today: checkin.exercise_minutes_today === '' ? null : Number(checkin.exercise_minutes_today),
          daylight_minutes_today: checkin.daylight_minutes_today === '' ? null : Number(checkin.daylight_minutes_today),
          screen_time_min_today: checkin.screen_time_min_today === '' ? null : Number(checkin.screen_time_min_today),
          meal_regularity_0_10_today: checkin.meal_regularity_0_10_today === '' ? null : Number(checkin.meal_regularity_0_10_today),
          caffeine_after_2pm_flag_today: checkin.caffeine_after_2pm_flag_today === 'yes',
          alcohol_flag_today: checkin.alcohol_flag_today === 'yes',
          sleep_onset_latency_min_today: checkin.sleep_onset_latency_min_today === '' ? null : Number(checkin.sleep_onset_latency_min_today),
          awakenings_count_today: checkin.awakenings_count_today === '' ? null : Number(checkin.awakenings_count_today),
          sleep_quality_0_10_today: checkin.sleep_quality_0_10_today === '' ? null : Number(checkin.sleep_quality_0_10_today),
        }),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      await loadMyDashboard()
      await loadCheckinHistory()
      setDialogueFinishedOpen(true)
      setMessage('대화를 마치고 지표 저장을 완료했습니다.')
    } catch (error) {
      setMessage(`대화 마치기 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyCurrentPassword() {
    if (!token || !profileCurrentPw.trim()) {
      setMessage('현재 비밀번호를 입력해주세요.')
      return
    }
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/auth/me/password/verify`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ current_password: profileCurrentPw }),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as PasswordVerifyResponse
      setPasswordVerified(data.matched)
      setMessage('현재 비밀번호 확인 완료')
    } catch (error) {
      setPasswordVerified(false)
      setMessage(`비밀번호 확인 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleProfileSave(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    if (profileNewPw && profileNewPw !== profileNewPwConfirm) {
      setMessage('새 비밀번호 확인 값이 일치하지 않습니다.')
      return
    }
    if (profileNewPw && !passwordVerified) {
      setMessage('현재 비밀번호 확인을 먼저 진행해주세요.')
      return
    }

    const payload: Record<string, string> = {}
    if (profileNickname.trim() && profileNickname !== profile?.nickname) payload.nickname = profileNickname
    if (profileNewPw.trim()) {
      payload.current_password = profileCurrentPw
      payload.new_password = profileNewPw
    }

    if (Object.keys(payload).length === 0) {
      setMessage('변경된 항목이 없습니다.')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/auth/me/profile`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      await loadProfile()
      await loadMyProfile()
      setMessage('회원정보 수정 완료')
    } catch (error) {
      setMessage(`회원정보 수정 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  const phqTotal = sumLikert(assessment.phq9)
  const gadTotal = sumLikert(assessment.gad7)
  const sleepTotal = sumLikert(assessment.sleep)
  const contextTotal = Number(assessment.context.daily_functioning || 0) + Number(assessment.context.stressful_event || 0) + Number(assessment.context.social_support || 0) + Number(assessment.context.coping_skill || 0) + Number(assessment.context.motivation_for_change || 0)

  const latestWeekly = dashboard?.rows?.length ? dashboard.rows[dashboard.rows.length - 1] : null

  const weeklyRows = useMemo(() => {
    const rows = dashboard?.rows ?? []
    const byDate = new Map(rows.map((r) => [r.week_start_date, r]))
    const out: Array<WeeklyDashboardRow | null> = []
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = formatDateYYYYMMDD(d)
      out.push(byDate.get(key) ?? null)
    }
    return out
  }, [dashboard])

  const dailyLifestyleRows = useMemo(() => {
    const src = [...checkinHistory].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    const byDate = new Map(src.map((r) => [r.timestamp.slice(0, 10), r]))
    const out: Array<CheckinHistoryItem | null> = []
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = formatDateYYYYMMDD(d)
      out.push(byDate.get(key) ?? null)
    }
    return out
  }, [checkinHistory])

  const weeklyLifestyleRows = useMemo(() => {
    const src = [...checkinHistory].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    const grouped = new Map<string, CheckinHistoryItem[]>()
    for (const row of src) {
      const wk = formatDateYYYYMMDD(startOfWeekMonday(new Date(`${row.timestamp.slice(0, 10)}T00:00:00`)))
      const prev = grouped.get(wk) ?? []
      grouped.set(wk, [...prev, row])
    }
    const keys = [...grouped.keys()].sort().slice(-8)
    return keys.map((k) => {
      const arr = grouped.get(k) ?? []
      const mean = (vals: Array<number | null>) => {
        const only = vals.filter((v): v is number => v != null)
        return only.length ? only.reduce((a, b) => a + b, 0) / only.length : null
      }
      return {
        week: k,
        sleep: mean(arr.map((x) => x.sleep_hours)),
        exercise: mean(arr.map((x) => x.exercise_minutes_today)),
        daylight: mean(arr.map((x) => x.daylight_minutes_today)),
        screen: mean(arr.map((x) => x.screen_time_min_today)),
      }
    })
  }, [checkinHistory])

  const monthlyRows = useMemo(() => {
    const rows = dashboard?.rows ?? []
    if (!rows.length) return [] as Array<{ week: string; dep: number | null; anx: number | null; ins: number | null; comp: number | null }>

    const grouped = new Map<string, WeeklyDashboardRow[]>()
    for (const row of rows) {
      const dateObj = new Date(`${row.week_start_date}T00:00:00`)
      const weekKey = formatDateYYYYMMDD(startOfWeekMonday(dateObj))
      const prev = grouped.get(weekKey) ?? []
      grouped.set(weekKey, [...prev, row])
    }

    const sortedKeys = [...grouped.keys()].sort()
    return sortedKeys.slice(-8).map((k) => {
      const arr = grouped.get(k) ?? []
      const dep = arr.reduce((a, b) => a + b.dep_week_pred_0_100, 0) / arr.length
      const anx = arr.reduce((a, b) => a + b.anx_week_pred_0_100, 0) / arr.length
      const ins = arr.reduce((a, b) => a + b.ins_week_pred_0_100, 0) / arr.length
      const comp = (dep + anx + ins) / 3
      return { week: k, dep, anx, ins, comp }
    })
  }, [dashboard])
  const hasWeeklyScoreData = weeklyRows.some((row) => row != null)
  const hasMonthlyScoreData = monthlyRows.some((row) => row.comp != null)
  const hasDailyLifestyleData = dailyLifestyleRows.some((row) => row != null)
  const hasWeeklyLifestyleData = weeklyLifestyleRows.some((row) => [row.sleep, row.exercise, row.daylight, row.screen].some((v) => v != null))

  const topRisk = useMemo(() => {
    if (!chatResult) return [] as Array<{ key: string; label: string; value: number; guide: string }>
    const d = chatResult.extracted.distortion
    const labelMap: Record<string, string> = {
      catastrophizing_count: '파국화 경향',
      all_or_nothing_count: '흑백사고 경향',
      mind_reading_count: '독심추론 경향',
      should_statements_count: '과한 당위문',
      personalization_count: '개인화 경향',
      overgeneralization_count: '과잉일반화',
    }
    const guideMap: Record<string, string> = {
      catastrophizing_count: '미래를 최악으로 단정하는 생각이 반복될 수 있어요. 사실 근거를 하나씩 확인해보세요.',
      all_or_nothing_count: '흑백으로 판단하는 경향이 보이면 중간지점을 찾는 연습이 도움이 됩니다.',
      mind_reading_count: '상대 마음을 단정하기보다 확인 가능한 사실부터 정리해보는 게 좋아요.',
      should_statements_count: '나에게 과한 당위가 걸리면 피로가 커질 수 있어요. 유연한 표현으로 바꿔보세요.',
      personalization_count: '모든 원인을 나에게 돌리는 경향이 보이면 외부 요인도 함께 살펴보세요.',
      overgeneralization_count: '한 번의 경험을 전체로 확대해석하지 않도록 예외 사례를 함께 적어보세요.',
    }
    return Object.entries(d)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => ({ key: k, label: labelMap[k] ?? k, value: v, guide: guideMap[k] ?? '현재 패턴을 무리 없이 조정할 수 있도록 작은 단위 실천을 권장합니다.' }))
  }, [chatResult])

  const challenges = (chatResult?.suggested_challenges ?? [])
  const completedChallenges = challenges.filter((c) => challengeStatus[c]).length
  const liveEmotionSummary = useMemo(() => {
    const recentUserText = [...chatHistory].reverse().find((t) => t.role === 'user')?.content ?? chatMessage
    const label = (chatResult?.extracted?.distress_0_10 ?? 0) >= 7 ? '고긴장' : (chatResult?.extracted?.distress_0_10 ?? 0) >= 4 ? '중간 긴장' : '비교적 안정'
    const situation = chatResult?.summary_card?.situation ?? (recentUserText ? recentUserText.slice(0, 100) : '-')
    return {
      moodLabel: label,
      situation,
      selfBlameSignal: chatResult?.summary_card?.self_blame_signal ?? '-',
      reframe: chatResult?.summary_card?.reframe ?? '-',
      nextAction: chatResult?.summary_card?.next_action ?? '-',
    }
  }, [chatHistory, chatMessage, chatResult])
  const highRiskProbability = checkPrediction == null ? 0 : (checkPrediction.probabilities['3'] ?? 0) + (checkPrediction.probabilities['4'] ?? 0)

  return (
    <main className="page">
      {!token && (
        <header className="hero landingHero">
          <p className="kicker">CBT Mind Partner</p>
          <h1>매일 체크인 + 감정일기 + 심리지표 대시보드</h1>
          <p className="subtitle">하루 상태를 기록하면, 대화형 코치가 인지왜곡과 챌린지 수행을 함께 도와주고 변화 추이를 보여줍니다.</p>
          <div className="actions">
            <button onClick={() => { setPage('account'); setAccountMode('login') }}>Log in</button>
            <button className="ghost" onClick={() => { setPage('account'); setAccountMode('signup') }}>Sign Up</button>
          </div>
        </header>
      )}

      {token && (
        <section className="panel topNavPanel">
          <div className="topBar">
            <div className="brandBox">
              <strong>MindCare</strong>
              <span>{me?.nickname ?? '사용자'}님</span>
            </div>
            <div className="actions">
              <button className={page === 'mypage' ? '' : 'ghost'} onClick={() => setPage('mypage')}>마이페이지</button>
              <button className={page === 'checkin' ? '' : 'ghost'} onClick={() => setPage('checkin')}>체크인</button>
              <button className={page === 'diary' ? '' : 'ghost'} onClick={() => setPage('diary')}>마음일기</button>
              <button className={page === 'assessment' ? '' : 'ghost'} onClick={() => setPage('assessment')}>종합심리검사</button>
              <button className={page === 'board' ? '' : 'ghost'} onClick={() => setPage('board')}>게시판</button>
              {isAdmin && <button className={page === 'admin' ? '' : 'ghost'} onClick={() => setPage('admin')}>관리자</button>}
              <button className="ghost" onClick={logout}>로그아웃</button>
            </div>
          </div>
        </section>
      )}

      {page === 'account' && (
        <section className="panel accountPanel">
          <div className="actions accountModeTabs">
            <button className={accountMode === 'login' ? '' : 'ghost'} onClick={() => setAccountMode('login')}>로그인</button>
            <button className={accountMode === 'signup' ? '' : 'ghost'} onClick={() => setAccountMode('signup')}>회원가입</button>
            <button className={accountMode === 'find' ? '' : 'ghost'} onClick={() => setAccountMode('find')}>비밀번호 찾기</button>
          </div>

          {accountMode === 'login' && (
            <form onSubmit={handleLogin} className="form">
              <h2>로그인</h2>
              <label>이메일<input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required /></label>
              <label>비밀번호<input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required /></label>
              <div className="actions">
                <button disabled={loading}>로그인</button>
                <button type="button" className="ghost" onClick={() => setAccountMode('find')}>비밀번호 찾기</button>
              </div>
            </form>
          )}

          {accountMode === 'signup' && (
            <form onSubmit={handleSignup} className="form">
              <h2>회원가입</h2>
              <label>이메일<input value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required /></label>
              <label>비밀번호<input type="password" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} required minLength={8} /></label>
              <label>비밀번호 확인<input type="password" value={signupPasswordConfirm} onChange={(e) => setSignupPasswordConfirm(e.target.value)} required minLength={8} /></label>
              <label>닉네임<input value={signupNickname} onChange={(e) => setSignupNickname(e.target.value)} required /></label>
              <label>보안 질문 선택
                <select value={signupSecurityQuestion} onChange={(e) => setSignupSecurityQuestion(e.target.value)}>
                  {SECURITY_QUESTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
                </select>
              </label>
              <label>보안 질문 답<input value={signupSecurityAnswer} onChange={(e) => setSignupSecurityAnswer(e.target.value)} required /></label>
              <p className="small">회원가입 후 첫 로그인 시 종합심리검사를 반드시 1회 진행해야 합니다.</p>
              <button disabled={loading}>계정 생성</button>
            </form>
          )}

          {accountMode === 'find' && (
            <form onSubmit={recoveryQuestion ? handleVerifyRecoveryAnswer : handleRequestRecoveryQuestion} className="form">
              <h2>비밀번호 찾기</h2>
              <label>이메일<input value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} required /></label>
              {!recoveryQuestion ? (
                <button disabled={loading}>보안질문 보기</button>
              ) : (
                <>
                  <label>보안질문<input value={recoveryQuestion} readOnly /></label>
                  <label>답변 입력<input value={recoveryAnswer} onChange={(e) => setRecoveryAnswer(e.target.value)} required /></label>
                  <button disabled={loading}>답변 확인</button>
                </>
              )}
            </form>
          )}

          {accountMode === 'reset' && (
            <form onSubmit={handleResetPassword} className="form">
              <h2>비밀번호 변경</h2>
              <label>새 비밀번호<input type="password" value={resetNewPassword} onChange={(e) => setResetNewPassword(e.target.value)} required minLength={8} /></label>
              <label>새 비밀번호 확인<input type="password" value={resetNewPasswordConfirm} onChange={(e) => setResetNewPasswordConfirm(e.target.value)} required minLength={8} /></label>
              <button disabled={loading}>비밀번호 변경</button>
            </form>
          )}
        </section>
      )}

      {page === 'checkin' && token && (
        <section className="panel cbtLayout">
          <article className="cbtMain">
            <h2>접속 메인 화면: 체크인</h2>
            <div className="miniGrid">
              <label>걸음 수<input inputMode="numeric" value={checkin.steps_today} onChange={(e) => handleCheckinInput('steps_today', e.target.value)} /></label>
              <label>운동 시간(분)<input inputMode="numeric" value={checkin.exercise_minutes_today} onChange={(e) => handleCheckinInput('exercise_minutes_today', e.target.value)} /></label>
              <label>햇빛 노출 시간(분)<input inputMode="numeric" value={checkin.daylight_minutes_today} onChange={(e) => handleCheckinInput('daylight_minutes_today', e.target.value)} /></label>
              <label>스크린 타임(분)<input inputMode="numeric" value={checkin.screen_time_min_today} onChange={(e) => handleCheckinInput('screen_time_min_today', e.target.value)} /></label>
              <label>식사 규칙성(0~10)<input inputMode="numeric" value={checkin.meal_regularity_0_10_today} onChange={(e) => handleCheckinInput('meal_regularity_0_10_today', e.target.value)} /></label>
              <label>오후 2시 이후 카페인
                <select value={checkin.caffeine_after_2pm_flag_today} onChange={(e) => setCheckin((prev) => ({ ...prev, caffeine_after_2pm_flag_today: e.target.value as 'yes' | 'no' }))}>
                  <option value="no">없음</option>
                  <option value="yes">있음</option>
                </select>
              </label>
              <label>음주 여부
                <select value={checkin.alcohol_flag_today} onChange={(e) => setCheckin((prev) => ({ ...prev, alcohol_flag_today: e.target.value as 'yes' | 'no' }))}>
                  <option value="no">없음</option>
                  <option value="yes">있음</option>
                </select>
              </label>
              <label>수면 시간(시간)<input inputMode="decimal" value={checkin.sleep_hours} onChange={(e) => handleCheckinInput('sleep_hours', e.target.value)} /></label>
              <label>잠들기까지 걸린 시간(분)<input inputMode="numeric" value={checkin.sleep_onset_latency_min_today} onChange={(e) => handleCheckinInput('sleep_onset_latency_min_today', e.target.value)} /></label>
              <label>중간 각성 횟수<input inputMode="numeric" value={checkin.awakenings_count_today} onChange={(e) => handleCheckinInput('awakenings_count_today', e.target.value)} /></label>
              <label>수면 질(0~10)<input inputMode="numeric" value={checkin.sleep_quality_0_10_today} onChange={(e) => handleCheckinInput('sleep_quality_0_10_today', e.target.value)} /></label>
              <label>오늘의 기분 점수(1~10)<input inputMode="numeric" value={checkin.mood_score} onChange={(e) => handleCheckinInput('mood_score', e.target.value)} /></label>
            </div>
            <div className="actions">
              <button onClick={() => void handleCheckinSubmit()} disabled={loading}>체크인</button>
              <button className="ghost" onClick={() => setPage('diary')}>마음일기 이동</button>
            </div>
          </article>
        </section>
      )}

      {page === 'diary' && token && (
        <section className="panel cbtLayout diaryPanel">
          <article className="cbtMain">
            <h2>마음일기</h2>
            <div className="chatShell diaryTight">
              <div className="chatMessages" ref={chatMessagesRef}>
                {chatHistory.length === 0 && <div className="chatEmpty">오늘 있었던 사건, 감정, 생각을 편하게 이야기해 주세요.</div>}
                {chatHistory.map((turn, idx) => (
                  <div key={`turn-${idx}`} className={`chatBubble ${turn.role === 'user' ? 'chatUser' : 'chatAssistant'}`}>
                    <strong className="chatBubbleHeader">
                      {turn.role === 'user' ? '나' : '마음코치'}
                      {turn.loading && (
                        <span className="chatLoadingInline">
                          <span className="loadingDot" />
                          응답 생성 중
                        </span>
                      )}
                    </strong>
                    <p>{turn.content}</p>
                  </div>
                ))}
              </div>
              <form onSubmit={handleChatSubmit} className="chatComposer">
                <div className="chatInputRow">
                  <textarea ref={chatInputRef} rows={1} value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} placeholder="오늘 있었던 일, 감정, 떠오른 생각을 적어주세요" />
                  <button className="chatSendBtn" disabled={loading || chatGenerating}>입력</button>
                </div>
                <button type="button" className="chatFinishBtn" onClick={() => void handleFinishDialogue()} disabled={loading || chatGenerating}>대화 마치기</button>
              </form>
            </div>
          </article>

          <aside className="cbtSide">
            <div className="panel sideCard">
              <h3>추천 챌린지 선택</h3>
              {challenges.length === 0 && <p className="small">대화를 충분히 나누면 현재 상태에 맞춰 추천해드릴게요.</p>}
              <ul className="probList">
                {challenges.map((c) => (
                  <li key={c}>
                    <span>{c}</span>
                    <button className="ghost" type="button" onClick={() => startChallenge(c)}>선택</button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="panel sideCard">
              <h3>진행 중 챌린지</h3>
              <p>{activeChallenge ? activeChallenge : '선택된 챌린지가 없습니다.'}</p>
              <p className="small">완료 {completedChallenges}/{challenges.length}</p>
            </div>
            <div className="panel sideCard">
              <h3>챌린지 힌트</h3>
              <p>{challengeHintText || chatResult?.challenge_step_prompt || '진행이 어렵다면 현재 감정강도(0~10)와 떠오른 생각 1개를 먼저 적어보세요.'}</p>
            </div>
            <div className="panel sideCard">
              <h3>감정 요약 카드</h3>
              <p><strong>현재 정서:</strong> {liveEmotionSummary.moodLabel}</p>
              <p><strong>상황:</strong> {liveEmotionSummary.situation}</p>
              <p><strong>왜곡 신호:</strong> {liveEmotionSummary.selfBlameSignal}</p>
              <p><strong>재해석:</strong> {liveEmotionSummary.reframe}</p>
              <p><strong>다음 행동:</strong> {liveEmotionSummary.nextAction}</p>
            </div>
          </aside>

          {dialogueFinishedOpen && (
            <div className="dialogueDoneOverlay" role="dialog" aria-modal="true">
              <div className="dialogueDoneCard">
                <h3>대화를 마칩니다</h3>
                <p>오늘도 수고하셨습니다. 기록해주신 내용은 대시보드와 리포트에 반영되었어요.</p>
                <div className="actions">
                  <button type="button" onClick={() => setDialogueFinishedOpen(false)}>확인</button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {page === 'assessment' && (
        <section className="panel">
          <h2>종합 심리 검사</h2>
          <form onSubmit={handleSurveySubmit} className="form">
            <article className="panel questionBlock">
              <h3>마음 에너지 변화</h3>
              <p className="small">총점: {phqTotal}/27</p>
              <div className="questionList">
                {PHQ9_QUESTIONS.map((q, idx) => (
                  <div key={`phq-${idx}`} className="questionItem">
                    <p>{idx + 1}. {q}</p>
                    <div className="likertButtons">
                      {LIKERT_OPTIONS.filter((opt) => opt.value !== '').map((opt) => (
                        <button
                          key={`phq-${idx}-${opt.value}`}
                          type="button"
                          className={assessment.phq9[idx] === opt.value ? 'likertBtn active' : 'likertBtn ghost'}
                          onClick={() => setPhqAnswer(idx, opt.value as LikertValue)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel questionBlock">
              <h3>긴장과 걱정 반응</h3>
              <p className="small">총점: {gadTotal}/21</p>
              <div className="questionList">
                {GAD7_QUESTIONS.map((q, idx) => (
                  <div key={`gad-${idx}`} className="questionItem">
                    <p>{idx + 1}. {q}</p>
                    <div className="likertButtons">
                      {LIKERT_OPTIONS.filter((opt) => opt.value !== '').map((opt) => (
                        <button
                          key={`gad-${idx}-${opt.value}`}
                          type="button"
                          className={assessment.gad7[idx] === opt.value ? 'likertBtn active' : 'likertBtn ghost'}
                          onClick={() => setGadAnswer(idx, opt.value as LikertValue)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel questionBlock">
              <h3>수면 회복 상태</h3>
              <p className="small">총점: {sleepTotal}/9</p>
              <div className="questionList">
                {SLEEP_QUESTIONS.map((q, idx) => (
                  <div key={`sleep-${idx}`} className="questionItem">
                    <p>{idx + 1}. {q}</p>
                    <div className="likertButtons">
                      {LIKERT_OPTIONS.filter((opt) => opt.value !== '').map((opt) => (
                        <button
                          key={`sleep-${idx}-${opt.value}`}
                          type="button"
                          className={assessment.sleep[idx] === opt.value ? 'likertBtn active' : 'likertBtn ghost'}
                          onClick={() => setSleepAnswer(idx, opt.value as LikertValue)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel questionBlock">
              <h3>생활 맥락 체크</h3>
              <p className="small">총점: {contextTotal}/15</p>
              <div className="questionList">
                {[
                  ['daily_functioning', '최근 일상 기능이 눈에 띄게 떨어졌나요?'],
                  ['stressful_event', '최근 스트레스 사건 영향이 크게 느껴졌나요?'],
                  ['social_support', '지지받기 어렵다고 느껴졌나요?'],
                  ['coping_skill', '감정 대처가 어렵게 느껴졌나요?'],
                  ['motivation_for_change', '변화하고 싶은 동기가 떨어졌나요?'],
                ].map(([key, text]) => (
                  <div key={String(key)} className="questionItem">
                    <p>{text}</p>
                    <div className="likertButtons">
                      {LIKERT_OPTIONS.filter((opt) => opt.value !== '').map((opt) => (
                        <button
                          key={`ctx-${String(key)}-${opt.value}`}
                          type="button"
                          className={assessment.context[key as keyof AssessmentState['context']] === opt.value ? 'likertBtn active' : 'likertBtn ghost'}
                          onClick={() => setContextAnswer(key as keyof AssessmentState['context'], opt.value as LikertValue)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <button disabled={loading}>결과 확인하기</button>
          </form>

          {checkPrediction && (
            <div className="result">
              <p>예측 결과: <strong>{severityToKorean(checkPrediction.prediction)}</strong></p>
              <p>고위험 확률(3~4단계): <strong>{(highRiskProbability * 100).toFixed(1)}%</strong></p>
            </div>
          )}
        </section>
      )}

      {page === 'mypage' && token && (
        <section className="mypageLayout">
          <aside className="panel mySidebar">
            <h2>마이페이지</h2>
            <div className="sideMenu">
              <button className={myTab === 'dashboard' ? '' : 'ghost'} onClick={() => setMyTab('dashboard')}>대시보드</button>
              <button className={myTab === 'profile' ? '' : 'ghost'} onClick={() => setMyTab('profile')}>회원정보 수정</button>
              <button className={myTab === 'report' ? '' : 'ghost'} onClick={() => setMyTab('report')}>요약리포트</button>
            </div>
          </aside>

          {myTab === 'dashboard' && (
            <article className="panel myMainPanel">
              <h2>대시보드</h2>
              <div className="actions">
                <button className={dashboardTab === 'today' ? '' : 'ghost'} onClick={() => setDashboardTab('today')}>today</button>
                <button className={dashboardTab === 'risk' ? '' : 'ghost'} onClick={() => setDashboardTab('risk')}>주요 위험 변수</button>
                <button className={dashboardTab === 'weekly' ? '' : 'ghost'} onClick={() => setDashboardTab('weekly')}>weekly</button>
                <button className={dashboardTab === 'monthly' ? '' : 'ghost'} onClick={() => setDashboardTab('monthly')}>monthly</button>
                <button className="ghost" onClick={() => void loadMyDashboard()}>새로고침</button>
              </div>

              {dashboardTab === 'today' && (
                <div className="result">
                  <p>오늘/최근 일자: <strong>{latestWeekly?.week_start_date ?? '-'}</strong></p>
                  <p>composite: <strong>{latestWeekly ? latestWeekly.symptom_composite_pred_0_100.toFixed(1) : '-'}</strong></p>
                  <p>alert: <strong>{latestWeekly?.alert_level ?? 'low'}</strong></p>
                  {!latestWeekly ? (
                    <p className="chartEmpty">데이터가 없으니 그래프를 만들 수 없습니다. 먼저 종합심리검사를 1회 이상 진행해주세요.</p>
                  ) : (
                    <MiniBarChart
                      labels={['DEP', 'ANX', 'INS']}
                      values={[latestWeekly.dep_week_pred_0_100, latestWeekly.anx_week_pred_0_100, latestWeekly.ins_week_pred_0_100]}
                      color="#0f766e"
                    />
                  )}
                </div>
              )}

              {dashboardTab === 'risk' && (
                <div className="result">
                  {topRisk.length === 0 ? (
                    <p className="small">대화 기반 위험 변수 데이터가 아직 없습니다.</p>
                  ) : (
                    <ul className="probList">
                      {topRisk.map((x) => (
                        <li key={x.key}>
                          <span>{x.label} ({x.value.toFixed(1)})</span>
                          <strong>{x.guide}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {dashboardTab === 'weekly' && (
                <div className="result">
                  {!hasWeeklyScoreData ? (
                    <p className="chartEmpty">데이터가 없으니 그래프를 만들 수 없습니다. 먼저 종합심리검사를 진행해주세요.</p>
                  ) : (
                    <>
                      <MultiMetricTrendChart
                        labels={weeklyRows.map((r, idx) => {
                          if (!r) {
                            const d = new Date()
                            d.setDate(d.getDate() - (6 - idx))
                            return formatDateYYYYMMDD(d).slice(5)
                          }
                          return r.week_start_date.slice(5)
                        })}
                        series={[
                          { name: '종합', color: '#0f766e', values: weeklyRows.map((r) => (r ? r.symptom_composite_pred_0_100 : null)), emphasis: true },
                          { name: '우울', color: '#2563eb', values: weeklyRows.map((r) => (r ? r.dep_week_pred_0_100 : null)) },
                          { name: '불안', color: '#f59e0b', values: weeklyRows.map((r) => (r ? r.anx_week_pred_0_100 : null)) },
                          { name: '불면', color: '#ef4444', values: weeklyRows.map((r) => (r ? r.ins_week_pred_0_100 : null)) },
                        ]}
                      />
                      <ul className="probList">
                        {weeklyRows.map((row, idx) => {
                          const d = new Date()
                          d.setDate(d.getDate() - (6 - idx))
                          const label = formatDateYYYYMMDD(d)
                          if (!row) {
                            return (
                              <li key={`empty-${label}`}>
                                <span>{label}</span>
                                <strong>기록 없음</strong>
                              </li>
                            )
                          }
                          const prev = idx > 0 ? weeklyRows[idx - 1] : null
                          return (
                            <li key={label}>
                              <span>{label} | composite {row.symptom_composite_pred_0_100.toFixed(1)} ({formatDelta(row.symptom_composite_pred_0_100, prev?.symptom_composite_pred_0_100)})</span>
                              <strong>우울 {row.dep_week_pred_0_100.toFixed(1)} / 불안 {row.anx_week_pred_0_100.toFixed(1)} / 불면 {row.ins_week_pred_0_100.toFixed(1)}</strong>
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  )}

                  <h3>생활습관 추이 (최근 7일)</h3>
                  <MultiMetricTrendChart
                    labels={dailyLifestyleRows.map((r, idx) => {
                      if (!r) {
                        const d = new Date()
                        d.setDate(d.getDate() - (6 - idx))
                        return formatDateYYYYMMDD(d).slice(5)
                      }
                      return r.timestamp.slice(5, 10)
                    })}
                    series={[
                      { name: '수면시간(h)', color: '#0f766e', values: dailyLifestyleRows.map((r) => (r ? r.sleep_hours : null)) },
                      { name: '운동(분)', color: '#2563eb', values: dailyLifestyleRows.map((r) => (r ? r.exercise_minutes_today : null)) },
                      { name: '햇빛(분)', color: '#f59e0b', values: dailyLifestyleRows.map((r) => (r ? r.daylight_minutes_today : null)) },
                      { name: '스크린(분)', color: '#ef4444', values: dailyLifestyleRows.map((r) => (r ? r.screen_time_min_today : null)) },
                    ]}
                    emptyMessage={hasDailyLifestyleData ? undefined : '생활 체크인 데이터가 없으니 그래프를 만들 수 없습니다. 체크인을 먼저 저장해주세요.'}
                  />
                </div>
              )}

              {dashboardTab === 'monthly' && (
                <div className="result">
                  {!hasMonthlyScoreData ? (
                    <p className="chartEmpty">데이터가 없으니 그래프를 만들 수 없습니다. 주간 데이터가 누적되면 월간 추이가 생성됩니다.</p>
                  ) : (
                    <>
                      <MultiMetricTrendChart
                        labels={monthlyRows.map((r) => r.week.slice(5))}
                        series={[
                          { name: '종합', color: '#0f766e', values: monthlyRows.map((r) => r.comp), emphasis: true },
                          { name: '우울', color: '#2563eb', values: monthlyRows.map((r) => r.dep) },
                          { name: '불안', color: '#f59e0b', values: monthlyRows.map((r) => r.anx) },
                          { name: '불면', color: '#ef4444', values: monthlyRows.map((r) => r.ins) },
                        ]}
                      />
                      <ul className="probList">
                        {monthlyRows.map((row, idx) => {
                          const prev = idx > 0 ? monthlyRows[idx - 1] : undefined
                          return (
                            <li key={row.week}>
                              <span>{row.week} (1주 평균) | composite {row.comp?.toFixed(1)} ({formatDelta(row.comp ?? 0, prev?.comp ?? undefined)})</span>
                              <strong>우울 {row.dep?.toFixed(1)} / 불안 {row.anx?.toFixed(1)} / 불면 {row.ins?.toFixed(1)}</strong>
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  )}

                  <h3>생활습관 추이 (주 평균)</h3>
                  <MultiMetricTrendChart
                    labels={weeklyLifestyleRows.map((r) => r.week.slice(5))}
                    series={[
                      { name: '수면시간(h)', color: '#0f766e', values: weeklyLifestyleRows.map((r) => r.sleep) },
                      { name: '운동(분)', color: '#2563eb', values: weeklyLifestyleRows.map((r) => r.exercise) },
                      { name: '햇빛(분)', color: '#f59e0b', values: weeklyLifestyleRows.map((r) => r.daylight) },
                      { name: '스크린(분)', color: '#ef4444', values: weeklyLifestyleRows.map((r) => r.screen) },
                    ]}
                    emptyMessage={hasWeeklyLifestyleData ? undefined : '생활 체크인 데이터가 없으니 그래프를 만들 수 없습니다. 체크인을 먼저 저장해주세요.'}
                  />
                </div>
              )}
            </article>
          )}

          {myTab === 'profile' && (
            <article className="panel myMainPanel">
              <h2>회원정보 수정</h2>
              <form className="form" onSubmit={handleProfileSave}>
                <label>닉네임<input value={profileNickname} onChange={(e) => setProfileNickname(e.target.value)} /></label>
                <label>이메일(현재)<input value={profile?.email ?? ''} readOnly /></label>
                <label>현재 비밀번호(필수)<input type="password" value={profileCurrentPw} onChange={(e) => setProfileCurrentPw(e.target.value)} /></label>
                <div className="actions">
                  <button type="button" className="ghost" onClick={() => void handleVerifyCurrentPassword()}>현재 비밀번호 확인</button>
                </div>
                <label>새 비밀번호<input type="password" value={profileNewPw} onChange={(e) => setProfileNewPw(e.target.value)} /></label>
                <label>새 비밀번호 확인<input type="password" value={profileNewPwConfirm} onChange={(e) => setProfileNewPwConfirm(e.target.value)} /></label>
                <button disabled={loading}>저장</button>
              </form>
            </article>
          )}

          {myTab === 'report' && (
            <article className="panel myMainPanel">
              <h2>요약 리포트 (진료 참고용)</h2>
              <p className="small">의사가 바로 참고할 수 있도록 위험 신호, 점수 변화, 수면/기분 패턴 중심으로 구성됩니다.</p>
              <div className="miniGrid">
                <label>시작일<input type="date" value={reportStartDate} onChange={(e) => setReportStartDate(e.target.value)} /></label>
                <label>종료일<input type="date" value={reportEndDate} onChange={(e) => setReportEndDate(e.target.value)} /></label>
              </div>
              <div className="actions"><button type="button" onClick={() => void handleGenerateClinicalReport()} disabled={loading}>리포트 보기</button><button type="button" className="ghost" onClick={() => void handleDownloadReportJpg()} disabled={!clinicalReport}>리포트 추출</button></div>

              {clinicalReport && (
                <div className="result">
                  <p><strong>기간:</strong> {clinicalReport.period_start} ~ {clinicalReport.period_end}</p>
                  <p><strong>요약:</strong> {clinicalReport.summary_text}</p>

                  <div className="miniGrid" style={{ marginTop: 8 }}>
                    <div className="panel" style={{ marginTop: 0 }}>
                      <h3>점수 변화</h3>
                      <p><strong>최근 Composite:</strong> {clinicalReport.score_summary.composite_latest?.toFixed(1) ?? '-'}</p>
                      <p><strong>변화량:</strong> {clinicalReport.score_summary.composite_delta?.toFixed(1) ?? '-'}</p>
                    </div>
                    <div className="panel" style={{ marginTop: 0 }}>
                      <h3>챌린지 수행</h3>
                      <p><strong>완료/전체:</strong> {clinicalReport.behavior_summary.challenge_completed_total} / {clinicalReport.behavior_summary.challenge_total}</p>
                      <p><strong>완료율:</strong> {clinicalReport.behavior_summary.challenge_completion_rate == null ? '-' : `${(clinicalReport.behavior_summary.challenge_completion_rate * 100).toFixed(1)}%`}</p>
                    </div>
                  </div>

                  <h3>지표 추이 시각화</h3>
                  <MultiMetricTrendChart
                    labels={clinicalReport.score_trends.map((r) => r.week_start_date.slice(5))}
                    series={[
                      { name: '종합', color: '#0f766e', values: clinicalReport.score_trends.map((r) => r.composite) },
                      { name: '우울', color: '#2563eb', values: clinicalReport.score_trends.map((r) => r.dep) },
                      { name: '불안', color: '#f59e0b', values: clinicalReport.score_trends.map((r) => r.anx) },
                      { name: '불면', color: '#ef4444', values: clinicalReport.score_trends.map((r) => r.ins) },
                    ]}
                  />


                  <h3>대화 기반 임상 참고 서술</h3>
                  <ul className="probList">
                    {clinicalReport.narrative_sections.map((item, idx) => (
                      <li key={`narrative-${idx}`}>
                        <span>{item.title}</span>
                        <p className="small" style={{ margin: 0 }}><strong>주요 대화:</strong> {item.major_dialogue ?? '-'}</p>
                        <p className="small" style={{ margin: '2px 0 0' }}><strong>분석 요약:</strong></p>
                        <strong>{item.llm_summary ?? item.detail}</strong>
                      </li>
                    ))}
                  </ul>

                  <h3>점수 참고지표 (기간 변화)</h3>
                  <p><strong>Composite(최근):</strong> {clinicalReport.score_summary.composite_latest?.toFixed(1) ?? '-'} / 변화 {clinicalReport.score_summary.composite_delta?.toFixed(1) ?? '-'}</p>
                  <ul className="probList">
                    {clinicalReport.score_trends.map((row) => (
                      <li key={row.week_start_date}>
                        <span>{row.week_start_date}</span>
                        <strong>comp {row.composite.toFixed(1)} ({row.composite_delta_from_prev == null ? '-' : (row.composite_delta_from_prev >= 0 ? '+' : '') + row.composite_delta_from_prev.toFixed(1)}) / dep {row.dep.toFixed(1)} anx {row.anx.toFixed(1)} ins {row.ins.toFixed(1)}</strong>
                      </li>
                    ))}
                  </ul>

                  <h3>의학적 참고 위험 신호</h3>
                  <ul className="probList">
                    {clinicalReport.risk_flags.length === 0 && <li>현재 기간에서 뚜렷한 고위험 플래그가 없습니다.</li>}
                    {clinicalReport.risk_flags.map((flag) => (
                      <li key={flag.code}>
                        <span>{flag.title}</span>
                        <strong>{flag.detail}</strong>
                      </li>
                    ))}
                  </ul>

                  <p className="small" style={{ marginTop: 10 }}>{clinicalReport.clinician_note}</p>
                </div>
              )}
            </article>
          )}
        </section>
      )}

      {page === 'board' && <BoardPage token={token} myUserId={me?.id ?? null} isAdmin={isAdmin} focusPostId={boardFocusPostId} />}

      {page === 'admin' && (
        <section className="panel">
          {!token ? <p>로그인을 먼저 해주세요.</p> : !isAdmin ? <p>관리자 계정이 아닙니다.</p> : <AdminPage token={token} onOpenBoardPost={(postId) => { setBoardFocusPostId(postId); setPage('board') }} />}
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
