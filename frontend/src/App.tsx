import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import AdminPage from './pages/admin/AdminPage'
import BoardPage from './pages/board/BoardPage'

type PageKey = 'landing' | 'account' | 'checkin' | 'dashboard' | 'diary' | 'journal' | 'challenge' | 'assessment' | 'board' | 'mypage' | 'admin'
type AccountMode = 'login' | 'signup' | 'reset'
type MyPageTab = 'profile' | 'report'
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
type ChatHistoryPayloadTurn = { role: ChatRole; content: string }

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

type ContentChallengeCatalogItem = {
  id: string
  title: string
  description: string
  category: string
}

type ContentChallengeLogItem = {
  id: string
  challenge_name: string
  category: string
  performed_date: string
  duration_minutes: number | null
  detail: string | null
  created_at: string
}

type JournalEntry = {
  id: string
  entry_date: string
  title: string
  content: string
  checkin_snapshot: Record<string, unknown>
  cbt_summary: Record<string, unknown>
  activity_challenges: Array<Record<string, unknown>>
  created_at: string
  updated_at: string
}

type RecommendedPost = {
  id: string
  title: string
  likes_count: number
  comments_count: number
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

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

function displayIfMeaningful(value: string | number | null | undefined, suffix = ''): string {
  if (value == null) return ''
  const text = String(value).trim()
  if (!text || text === '0' || text === '0.0' || text === '0.00') return ''
  return suffix ? `${text}${suffix}` : text
}

function MultiMetricTrendChart({
  labels,
  series,
}: {
  labels: string[]
  series: Array<{ name: string; color: string; values: Array<number | null> }>
}) {
  if (!labels.length || !series.length) return <p className="small">데이터가 없습니다.</p>
  const all = series.flatMap((sr) => sr.values.filter((v): v is number => v != null))
  if (!all.length) return <p className="small">데이터가 없습니다.</p>

  const max = Math.max(...all, 100)
  const min = Math.min(...all, 0)
  const range = Math.max(1, max - min)

  return (
    <svg viewBox="0 0 120 100" width="100%" height={190} role="img" aria-label="multi trend chart">
      {[0, 25, 50, 75, 100].map((g) => (
        <line key={g} x1="0" y1={String(100 - g)} x2="100" y2={String(100 - g)} stroke="#edf2f7" strokeWidth="0.6" />
      ))}
      {series.map((line) => {
        const points = line.values.map((v, idx) => {
          if (v == null) return null
          const x = (idx / Math.max(1, labels.length - 1)) * 100
          const y = 100 - (((v - min) / range) * 100)
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
              <polyline key={`${line.name}-${i}`} fill="none" stroke={line.color} strokeWidth="2.5" points={seg} />
            ))}
            {lastPoint && (
              <text x={Math.min(118, lastPoint.x + 1.6)} y={lastPoint.y} fill={line.color} fontSize="4" dominantBaseline="middle">
                {line.name}
              </text>
            )}
          </g>
        )
      })}
    </svg>
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

function WeeklyCurveChart({ labels, values }: { labels: string[]; values: number[] }) {
  if (!values.length) return <p className="small">데이터가 없습니다.</p>

  const max = Math.max(...values, 1)
  const points = values.map((v, idx) => {
    const x = (idx / Math.max(1, values.length - 1)) * 100
    const y = 85 - ((v / max) * 60)
    return { x, y }
  })

  let d = ''
  points.forEach((p, i) => {
    if (i === 0) {
      d += `M ${p.x} ${p.y}`
      return
    }
    const prev = points[i - 1]
    const midX = (prev.x + p.x) / 2
    d += ` C ${midX} ${prev.y}, ${midX} ${p.y}, ${p.x} ${p.y}`
  })

  return (
    <svg viewBox="0 0 120 90" width="100%" height={180} role="img" aria-label="weekly activity curve">
      <line x1="0" y1="86" x2="120" y2="86" stroke="#e6eaef" strokeWidth="1" />
      <path d={d} fill="none" stroke="#d8b4fe" strokeWidth="2.8" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={`weekly-point-${labels[i] ?? i}`}>
          <circle cx={p.x} cy={p.y} r="1.3" fill="#d8b4fe" />
          <text x={p.x} y="89" textAnchor="middle" fontSize="3.2" fill="#94a3b8">{labels[i]?.slice(5) ?? ''}</text>
        </g>
      ))}
    </svg>
  )
}

type AttendanceCalendarCell = {
  dateKey: string
  day: number
  inMonth: boolean
  attended: boolean
}

function MonthlyAttendanceCalendar({
  monthLabel,
  cells,
}: {
  monthLabel: string
  cells: AttendanceCalendarCell[]
}) {
  const weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
  return (
    <div className="monthCalendarWrap">
      <div className="monthCalendarHead">
        <h3>월간 출석 현황</h3>
        <span>{monthLabel}</span>
      </div>
      <div className="monthCalendarWeekdays">
        {weekdays.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className="monthCalendarGrid">
        {cells.map((cell) => (
          <div key={cell.dateKey} className={`monthDayCell ${cell.inMonth ? '' : 'outMonth'}`}>
            {cell.attended ? <span className="attendedDot">{cell.day}</span> : <span>{cell.day}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function BarKDETrendChart({
  labels,
  series,
}: {
  labels: string[]
  series: Array<{ name: string; color: string; values: Array<number | null> }>
}) {
  if (!labels.length || !series.length) return <p className="small">데이터가 없습니다.</p>

  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null))
  if (!all.length) return <p className="small">데이터가 없습니다.</p>

  const min = Math.min(0, ...all)
  const max = Math.max(100, ...all)
  const range = Math.max(1, max - min)
  const groups = labels.length
  const barGroupWidth = 100 / Math.max(1, groups)
  const eachWidth = Math.max(0.8, (barGroupWidth * 0.75) / Math.max(1, series.length))

  function toY(v: number) {
    return 100 - (((v - min) / range) * 100)
  }

  function kdeSmooth(values: Array<number | null>, bandwidth = 1.4): Array<number | null> {
    const out: Array<number | null> = []
    for (let i = 0; i < values.length; i += 1) {
      let num = 0
      let den = 0
      for (let j = 0; j < values.length; j += 1) {
        const v = values[j]
        if (v == null) continue
        const w = Math.exp(-((i - j) ** 2) / (2 * bandwidth * bandwidth))
        num += v * w
        den += w
      }
      out.push(den > 0 ? num / den : null)
    }
    return out
  }

  return (
    <svg viewBox="0 0 120 100" width="100%" height={210} role="img" aria-label="bar and kde chart">
      {[0, 25, 50, 75, 100].map((g) => (
        <line key={g} x1="0" y1={String(100 - g)} x2="100" y2={String(100 - g)} stroke="#edf2f7" strokeWidth="0.6" />
      ))}

      {series.map((line, sIdx) => {
        const smooth = kdeSmooth(line.values)
        const offset = ((sIdx + 0.5) * eachWidth) - ((series.length * eachWidth) / 2)

        const smoothPoints = smooth
          .map((v, idx) => {
            if (v == null) return null
            const x = (idx + 0.5) * barGroupWidth + offset
            return `${x},${toY(v)}`
          })
          .filter((x): x is string => x != null)

        const lastIdx = [...smooth].map((v, idx) => ({ v, idx })).reverse().find((x) => x.v != null)
        const lastX = lastIdx ? (lastIdx.idx + 0.5) * barGroupWidth + offset : null
        const lastY = lastIdx && lastIdx.v != null ? toY(lastIdx.v) : null

        return (
          <g key={`bar-kde-${line.name}`}>
            {line.values.map((v, idx) => {
              if (v == null) return null
              const x = (idx * barGroupWidth) + (barGroupWidth * 0.12) + (sIdx * eachWidth)
              const y = toY(v)
              return (
                <rect
                  key={`bar-${line.name}-${idx}`}
                  x={x}
                  y={y}
                  width={Math.max(0.8, eachWidth - 0.3)}
                  height={Math.max(1, 100 - y)}
                  fill={line.color}
                  opacity={0.28}
                  rx={0.8}
                />
              )
            })}

            {smoothPoints.length > 1 && (
              <polyline
                fill="none"
                stroke={line.color}
                strokeWidth="2"
                points={smoothPoints.join(' ')}
              />
            )}

            {lastX != null && lastY != null && (
              <text x={Math.min(118, lastX + 1.2)} y={lastY} fill={line.color} fontSize="4" dominantBaseline="middle">
                {line.name}
              </text>
            )}
          </g>
        )
      })}
    </svg>
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

function normalizeNoticeMessage(raw: string): string | null {
  const msg = raw.trim()
  if (!msg) return null

  const hidden = new Set([
    'Ready.',
    '대화 분석 완료',
    '인지행동치료 대화를 시작했습니다.',
    '대화를 마치고 일기 작성 단계로 이동합니다.',
  ])
  if (hidden.has(msg)) return null

  const mapped: Record<string, string> = {
    '로그인 성공': '로그인이 완료되었습니다.',
    '회원가입 완료. 로그인 후 종합심리검사를 1회 진행해주세요.': '회원가입 정보가 저장되었습니다. 로그인 후 종합심리검사를 진행해주세요.',
    '검사 결과를 저장했습니다.': '검사 결과가 저장되었습니다.',
    '체크인 되었습니다.': '체크인 정보가 저장되었습니다.',
    '챌린지 수행 기록을 저장했습니다.': '챌린지 수행 기록이 저장되었습니다.',
    '일기를 저장했습니다.': '일기 내용이 저장되었습니다.',
    '회원정보 수정 완료': '회원정보가 저장되었습니다.',
    '비밀번호가 변경되었습니다. 로그인해주세요.': '비밀번호가 저장되었습니다. 다시 로그인해주세요.',
    '리포트 JPG 파일을 저장했습니다.': '리포트 이미지가 저장되었습니다.',
    '의료진 참고용 요약 리포트를 생성했습니다.': '요약 리포트가 생성되었습니다.',
    '로그아웃되었습니다.': '로그아웃되었습니다.',
  }

  return mapped[msg] ?? msg
}

function App() {
  const [page, setPage] = useState<PageKey>('landing')
  const [accountMode, setAccountMode] = useState<AccountMode>('login')
  const [myTab, setMyTab] = useState<MyPageTab>('profile')
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('today')

  const [token, setToken] = useState<string>('')
  const [me, setMe] = useState<UserOut | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [noticeText, setNoticeText] = useState('')
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)

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
  const [showRecoveryInline, setShowRecoveryInline] = useState(false)
  const [resetNewPassword, setResetNewPassword] = useState('')
  const [resetNewPasswordConfirm, setResetNewPasswordConfirm] = useState('')

  const [assessment, setAssessment] = useState<AssessmentState>(defaultAssessment)
  const [checkPrediction, setCheckPrediction] = useState<CheckPredictResponse | null>(null)

  const [checkin, setCheckin] = useState<LifestyleCheckinState>(defaultCheckin)
  const [checkinCompletedToday, setCheckinCompletedToday] = useState(false)
  const [checkinSummaryText, setCheckinSummaryText] = useState('')
  const [autoCbtStarted, setAutoCbtStarted] = useState(false)

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

  const [contentCatalog, setContentCatalog] = useState<ContentChallengeCatalogItem[]>([])
  const [contentLogs, setContentLogs] = useState<ContentChallengeLogItem[]>([])
  const [recommendedPosts, setRecommendedPosts] = useState<RecommendedPost[]>([])
  const [selectedContentTitle, setSelectedContentTitle] = useState('')
  const [contentDuration, setContentDuration] = useState('')
  const [contentDetail, setContentDetail] = useState('')

  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [journalTitle, setJournalTitle] = useState('오늘의 일기')
  const [journalContent, setJournalContent] = useState('')
  const [journalLibraryOpen, setJournalLibraryOpen] = useState(false)

  const chatMessagesRef = useRef<HTMLDivElement | null>(null)
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null)
  const chatSubmitLockRef = useRef(false)

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
      setCheckinCompletedToday(false)
      setCheckinSummaryText('')
      setAutoCbtStarted(false)
      setRecommendedPosts([])
      setPage('landing')
      return
    }
    void loadProfile()
    void loadMyProfile()
    void loadMyDashboard()
    void loadCheckinHistory()
    void loadPhqHistory()
    void loadAdminAccess()
    void loadContentCatalog()
    void loadContentLogs()
    void loadRecommendedPosts()
    void loadJournalEntries()
    setPage('checkin')
  }, [token])

  useEffect(() => {
    const text = normalizeNoticeMessage(message)
    if (!text) return
    setNoticeText(text)
    setNoticeOpen(true)
  }, [message])

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

  function toChatHistoryPayload(turns: ChatTurn[]): ChatHistoryPayloadTurn[] {
    return turns
      .filter((turn) => !turn.loading)
      .map((turn) => ({ role: turn.role, content: turn.content.trim() }))
      .filter((turn) => turn.content.length > 0)
      .slice(-12)
  }


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

      const today = todayDateString()
      const todayRecord = data.find((x) => x.timestamp.slice(0, 10) === today)
      setCheckinCompletedToday(Boolean(todayRecord))
    } catch (error) {
      setMessage(`체크인 이력 조회 오류: ${(error as Error).message}`)
    }
  }


  async function loadContentCatalog() {
    if (!token) return
    try {
      const response = await fetch(`${API_BASE}/content-challenges/catalog`, { headers: authHeaders })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as { items: ContentChallengeCatalogItem[] }
      setContentCatalog(data.items ?? [])
    } catch (error) {
      setMessage(`챌린지 컨텐츠 조회 오류: ${(error as Error).message}`)
    }
  }

  async function loadContentLogs() {
    if (!token) return
    try {
      const response = await fetch(`${API_BASE}/content-challenges/logs?limit=180`, { headers: authHeaders })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as { items: ContentChallengeLogItem[] }
      setContentLogs(data.items ?? [])
    } catch (error) {
      setMessage(`챌린지 기록 조회 오류: ${(error as Error).message}`)
    }
  }

  async function loadRecommendedPosts() {
    try {
      const response = await fetch(`${API_BASE}/board/posts?page=1&page_size=8`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as { items?: Array<RecommendedPost> }
      const items = (data.items ?? [])
        .slice()
        .sort((a, b) => ((b.likes_count ?? 0) + (b.comments_count ?? 0)) - ((a.likes_count ?? 0) + (a.comments_count ?? 0)))
        .slice(0, 3)
      setRecommendedPosts(items)
    } catch (error) {
      setMessage(`추천 게시물 조회 오류: ${(error as Error).message}`)
    }
  }

  async function loadJournalEntries() {
    if (!token) return
    try {
      const response = await fetch(`${API_BASE}/journals?limit=180`, { headers: authHeaders })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as { items: JournalEntry[] }
      setJournalEntries(data.items ?? [])
    } catch (error) {
      setMessage(`일기 도서관 조회 오류: ${(error as Error).message}`)
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

  async function handleRequestRecoveryQuestion(event?: FormEvent) {
    event?.preventDefault()
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

  async function handleVerifyRecoveryAnswer(event?: FormEvent) {
    event?.preventDefault()
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
    setLogoutConfirmOpen(false)
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
        checkin.screen_time_min_today ? `스크린 ${checkin.screen_time_min_today}분` : null,
      ].filter(Boolean).join(', ')

      setCheckinSummaryText(summary)
      setCheckinCompletedToday(true)
      setAutoCbtStarted(false)
      await loadMyDashboard()
      await loadCheckinHistory()
      setMessage('체크인 되었습니다.')
    } catch (error) {
      setMessage(`체크인 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function startCbtFromCheckinSummary() {
    if (!token) return
    const summary = checkinSummaryText || [
      `기분 ${checkin.mood_score || '-'}/10`,
      checkin.sleep_hours ? `수면 ${checkin.sleep_hours}시간` : null,
    ].filter(Boolean).join(', ')

    setPage('diary')
    if (autoCbtStarted) return

    setLoading(true)
    setChatGenerating(true)
    try {
      const response = await fetch(`${API_BASE}/chat/cbt`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          message: `오늘 체크인 상태 요약: ${summary}. 이 상태를 반영해서 먼저 대화를 시작해줘.`,
          conversation_history: [],
        }),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as ChatResponse
      setChatResult(data)
      setChatHistory([{ role: 'assistant', content: data.reply }])
      setChallengeHintText(data.challenge_step_prompt ?? '')
      setAutoCbtStarted(true)
      setMessage('인지행동치료 대화를 시작했습니다.')
    } catch (error) {
      setMessage(`인지행동치료 시작 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
      setChatGenerating(false)
    }
  }

  function upsertAssistantDraft(content: string, isDraft: boolean) {
    setChatHistory((prev) => {
      const next = [...prev]
      for (let i = next.length - 1; i >= 0; i -= 1) {
        if (next[i].role === 'assistant' && next[i].loading) {
          next[i] = isDraft
            ? { role: 'assistant', content, loading: true }
            : { role: 'assistant', content }
          return next
        }
      }
      const appended: ChatTurn[] = [...prev, isDraft ? { role: 'assistant', content, loading: true } : { role: 'assistant', content }]
      return appended
    })
  }

  async function handleChatSubmit(event: FormEvent) {
    event.preventDefault()
    if (chatSubmitLockRef.current) return
    if (!token) {
      setMessage('로그인 후 인지행동치료 대화를 사용할 수 있습니다.')
      return
    }

    const text = chatMessage.trim()
    if (!text) {
      setMessage('대화 내용을 입력해주세요.')
      return
    }

    chatSubmitLockRef.current = true
    const history = toChatHistoryPayload(chatHistory.filter((turn) => !turn.loading))
    setChatHistory((prev) => [
      ...prev.filter((turn) => !turn.loading),
      { role: 'user', content: text },
      { role: 'assistant', content: '', loading: true },
    ])
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

      const baseReply = (data.reply || '').trim() || '응답을 정리했습니다. 이어서 계속 이야기해볼까요?'
      const completionSuffix = data.challenge_completed && data.completion_message
        ? `\n\n${data.completion_message}`
        : ''
      const replyText = `${baseReply}${completionSuffix}`
      const chunkSize = Math.max(1, Math.ceil(replyText.length / 90))
      let cursor = 0
      while (cursor < replyText.length) {
        cursor = Math.min(replyText.length, cursor + chunkSize)
        const isDraft = cursor < replyText.length
        upsertAssistantDraft(replyText.slice(0, cursor), isDraft)
        if (isDraft) {
          await new Promise((resolve) => window.setTimeout(resolve, 16))
        }
      }

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
      setMessage(`인지행동치료 대화 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
      setChatGenerating(false)
      chatSubmitLockRef.current = false
    }
  }

  function startChallenge(challenge: string) {
    setActiveChallenge(challenge)
    setChallengePhase('start')
    setChallengeStatus((prev) => ({ ...prev, [challenge]: prev[challenge] ?? false }))
    setChallengeHintText('선택한 생각 정리 도구를 단계별로 진행합니다. 사실-감정-생각 순서로 적어주세요.')
    setChatHistory((prev) => [...prev, { role: 'assistant', content: `좋아요. '${challenge}'를 함께 진행해볼게요. 먼저 상황에서 확인 가능한 사실 1가지를 적어주세요. 그 다음 감정과 생각을 함께 정리해볼게요.` }])
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
      setPage('journal')
      setMessage('대화를 마치고 일기 작성 단계로 이동합니다.')
    } catch (error) {
      setMessage(`대화 마치기 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveContentChallenge() {
    if (!token) return
    if (!selectedContentTitle.trim()) {
      setMessage('먼저 수행할 챌린지 컨텐츠를 선택해주세요.')
      return
    }

    const duration = contentDuration.trim() ? Number(contentDuration) : null
    if (duration != null && (Number.isNaN(duration) || duration < 0)) {
      setMessage('수행 시간은 0 이상 숫자로 입력해주세요.')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/content-challenges/logs`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          challenge_name: selectedContentTitle,
          category: '생활습관',
          performed_date: todayDateString(),
          duration_minutes: duration,
          detail: contentDetail.trim() || null,
        }),
      })
      if (!response.ok) throw new Error(await extractApiError(response))

      await loadContentLogs()
      setContentDuration('')
      setContentDetail('')
      setMessage('챌린지 수행 기록을 저장했습니다.')
    } catch (error) {
      setMessage(`챌린지 기록 저장 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveJournalEntry() {
    if (!token) return
    if (!journalContent.trim()) {
      setMessage('일기 내용을 입력해주세요.')
      return
    }

    const today = todayDateString()
    const todayLogs = contentLogs
      .filter((x) => x.performed_date === today)
      .map((x) => ({
        challenge_name: x.challenge_name,
        category: x.category,
        duration_minutes: x.duration_minutes,
        detail: x.detail,
      }))

    const cbtSummary = {
      situation: chatResult?.summary_card?.situation ?? '',
      self_blame_signal: chatResult?.summary_card?.self_blame_signal ?? '',
      reframe: chatResult?.summary_card?.reframe ?? '',
      next_action: chatResult?.summary_card?.next_action ?? '',
      encouragement: chatResult?.summary_card?.encouragement ?? '',
      distress_0_10: chatResult?.extracted?.distress_0_10 ?? null,
    }

    const checkinSnapshot = {
      mood_score: checkin.mood_score === '' ? null : Number(checkin.mood_score),
      sleep_hours: checkin.sleep_hours === '' ? null : Number(checkin.sleep_hours),
      exercise_minutes_today: checkin.exercise_minutes_today === '' ? null : Number(checkin.exercise_minutes_today),
      daylight_minutes_today: checkin.daylight_minutes_today === '' ? null : Number(checkin.daylight_minutes_today),
      screen_time_min_today: checkin.screen_time_min_today === '' ? null : Number(checkin.screen_time_min_today),
      caffeine_after_2pm_flag_today: checkin.caffeine_after_2pm_flag_today === 'yes',
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/journals`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          entry_date: today,
          title: journalTitle.trim() || '오늘의 일기',
          content: journalContent.trim(),
          checkin_snapshot: checkinSnapshot,
          cbt_summary: cbtSummary,
          activity_challenges: todayLogs,
        }),
      })
      if (!response.ok) throw new Error(await extractApiError(response))

      await loadJournalEntries()
      setJournalLibraryOpen(true)
      setMessage('일기를 저장했습니다.')
      setPage('checkin')
    } catch (error) {
      setMessage(`일기 저장 오류: ${(error as Error).message}`)
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
  const activeChallengeInProgress = Boolean(activeChallenge) && !Boolean(challengeStatus[activeChallenge])
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

  const weeklyProgress = useMemo(() => {
    const byDate = new Map<string, { checked: boolean; contentCount: number }>()
    const today = new Date()
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      byDate.set(formatDateYYYYMMDD(d), { checked: false, contentCount: 0 })
    }

    for (const row of checkinHistory) {
      const key = row.timestamp.slice(0, 10)
      if (!byDate.has(key)) continue
      const prev = byDate.get(key)
      if (!prev) continue
      byDate.set(key, { ...prev, checked: true })
    }

    for (const row of contentLogs) {
      if (!byDate.has(row.performed_date)) continue
      const prev = byDate.get(row.performed_date)
      if (!prev) continue
      byDate.set(row.performed_date, { ...prev, contentCount: prev.contentCount + 1 })
    }

    const items = [...byDate.entries()].map(([date, v]) => ({ date, ...v }))
    const attendance = items.filter((x) => x.checked).length
    const challengeDays = items.filter((x) => x.contentCount > 0).length
    return {
      items,
      attendanceRate: Math.round((attendance / Math.max(1, items.length)) * 100),
      challengeRate: Math.round((challengeDays / Math.max(1, items.length)) * 100),
    }
  }, [checkinHistory, contentLogs])

  const monthlyAttendance = useMemo(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    const start = new Date(firstDay)
    const startDay = start.getDay()
    const mondayOffset = startDay === 0 ? 6 : startDay - 1
    start.setDate(start.getDate() - mondayOffset)

    const attendedDates = new Set(checkinHistory.map((row) => row.timestamp.slice(0, 10)))
    const cells: AttendanceCalendarCell[] = []
    for (let i = 0; i < 42; i += 1) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const key = formatDateYYYYMMDD(d)
      cells.push({
        dateKey: key,
        day: d.getDate(),
        inMonth: d.getMonth() === month,
        attended: attendedDates.has(key),
      })
    }

    const monthLabel = `${year}.${String(month + 1).padStart(2, '0')}`
    const monthTotal = lastDay.getDate()
    const monthAttended = cells.filter((c) => c.inMonth && c.attended).length

    return { monthLabel, cells, monthTotal, monthAttended }
  }, [checkinHistory])

  const todayLogs = useMemo(() => contentLogs.filter((x) => x.performed_date === todayDateString()), [contentLogs])
  const todayJournalEntry = useMemo(() => journalEntries.find((x) => x.entry_date === todayDateString()) ?? null, [journalEntries])

  return (
    <main className="page">
      {!token && (
        <header className="hero landingHero">
          <p className="kicker">CBT Mind Partner</p>
          <h1>체크인 + 인지행동치료 + 일기 + 실행형 챌린지</h1>
          <p className="subtitle">체크인 후 인지행동치료 대화로 생각을 정리하고, 일기와 실행형 챌린지까지 한 흐름으로 관리합니다.</p>
          <div className="actions heroActions">
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
            <div className="actions navActions">
              <button className={page === 'mypage' ? '' : 'ghost'} onClick={() => setPage('mypage')}>마이페이지</button>
              <button className={page === 'checkin' ? '' : 'ghost'} onClick={() => setPage('checkin')}>접속화면</button>
              <button className={page === 'dashboard' ? '' : 'ghost'} onClick={() => setPage('dashboard')}>대시보드</button>
              <button className={page === 'diary' ? '' : 'ghost'} onClick={() => setPage('diary')}>인지행동치료</button>
              <button className={page === 'journal' ? '' : 'ghost'} onClick={() => setPage('journal')}>일기</button>
              <button className={page === 'challenge' ? '' : 'ghost'} onClick={() => setPage('challenge')}>챌린지</button>
              <button className={page === 'assessment' ? '' : 'ghost'} onClick={() => setPage('assessment')}>종합심리검사</button>
              <button className={page === 'board' ? '' : 'ghost'} onClick={() => setPage('board')}>게시판</button>
              {isAdmin && <button className={page === 'admin' ? '' : 'ghost'} onClick={() => setPage('admin')}>관리자</button>}
              <button className="ghost" type="button" onClick={() => setLogoutConfirmOpen(true)}>로그아웃</button>
            </div>
          </div>
        </section>
      )}

      {page === 'account' && (
        <section className="panel accountPanel">
          <div className="accountModeTabs actions">
            <button className={accountMode === 'login' ? '' : 'ghost'} type="button" onClick={() => setAccountMode('login')}>로그인</button>
            <button className={accountMode === 'signup' ? '' : 'ghost'} type="button" onClick={() => setAccountMode('signup')}>회원가입</button>
          </div>

          {accountMode === 'login' && (
            <form onSubmit={handleLogin} className="form">
              <h2>로그인</h2>
              <label>이메일<input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required /></label>
              <label>비밀번호<input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required /></label>
              <div className="actions">
                <button disabled={loading}>로그인</button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setShowRecoveryInline((v) => !v)
                    setRecoveryQuestion('')
                    setRecoveryAnswer('')
                  }}
                >
                  비밀번호 찾기
                </button>
              </div>

              {showRecoveryInline && (
                <div className="panel" style={{ marginTop: 8 }}>
                  <h3>비밀번호 찾기</h3>
                  <label>이메일<input value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} required /></label>
                  {!recoveryQuestion ? (
                    <button type="button" disabled={loading} onClick={() => void handleRequestRecoveryQuestion()}>보안질문 보기</button>
                  ) : (
                    <>
                      <label>보안질문<input value={recoveryQuestion} readOnly /></label>
                      <label>답변 입력<input value={recoveryAnswer} onChange={(e) => setRecoveryAnswer(e.target.value)} required /></label>
                      <button type="button" disabled={loading} onClick={() => void handleVerifyRecoveryAnswer()}>답변 확인</button>
                    </>
                  )}
                </div>
              )}
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
        <section className="panel checkinLayout">
          <h2>접속 화면(로그인 후 바로 보이는 화면)</h2>
          <p className="welcomeBadge">{me?.nickname ?? '사용자'}님 어서오세요</p>

          <div className="checkinStatsGrid">
            <div className="panel checkinCard">
              <MonthlyAttendanceCalendar monthLabel={monthlyAttendance.monthLabel} cells={monthlyAttendance.cells} />
              <p className="small">이번 달 출석: {monthlyAttendance.monthAttended}일 / {monthlyAttendance.monthTotal}일</p>
            </div>

            <div className="panel checkinCard">
              <div className="monthCalendarHead">
                <h3>주간 챌린지 활동률 그래프</h3>
                <span>WEEKLY CHALLENGE</span>
              </div>
              <WeeklyCurveChart labels={weeklyProgress.items.map((x) => x.date)} values={weeklyProgress.items.map((x) => x.contentCount)} />
              <p className="small">최근 7일 활동 수행일: {weeklyProgress.items.filter((x) => x.contentCount > 0).length}일 ({weeklyProgress.challengeRate}%)</p>
            </div>
          </div>

          <div className={`panel checkinInputPanel ${checkinCompletedToday ? 'checkinInputDone' : ''}`}>
            {!checkinCompletedToday ? (
              <>
                <h3>데일리 체크인 입력</h3>
                <p className="small">오늘의 상태를 간단히 기록해주세요.</p>
                <div className="miniGrid">
                  <label>오늘의 기분 점수(1~10)<input inputMode="numeric" value={checkin.mood_score} onChange={(e) => handleCheckinInput('mood_score', e.target.value)} /></label>
                  <label>수면 시간(시간)<input inputMode="decimal" value={checkin.sleep_hours} onChange={(e) => handleCheckinInput('sleep_hours', e.target.value)} /></label>
                  <label>운동 시간(분)<input inputMode="numeric" value={checkin.exercise_minutes_today} onChange={(e) => handleCheckinInput('exercise_minutes_today', e.target.value)} /></label>
                  <label>햇빛 노출 시간(분)<input inputMode="numeric" value={checkin.daylight_minutes_today} onChange={(e) => handleCheckinInput('daylight_minutes_today', e.target.value)} /></label>
                  <label>스크린 타임(분)<input inputMode="numeric" value={checkin.screen_time_min_today} onChange={(e) => handleCheckinInput('screen_time_min_today', e.target.value)} /></label>
                  <label>오후 2시 이후 카페인
                    <select value={checkin.caffeine_after_2pm_flag_today} onChange={(e) => setCheckin((prev) => ({ ...prev, caffeine_after_2pm_flag_today: e.target.value as 'yes' | 'no' }))}>
                      <option value="no">없음</option>
                      <option value="yes">있음</option>
                    </select>
                  </label>
                </div>
                <div className="actions checkinPrimaryAction">
                  <button onClick={() => void handleCheckinSubmit()} disabled={loading}>체크인</button>
                </div>
              </>
            ) : (
              <div className="checkinDoneCenter">
                <h3>체크인 완료</h3>
                <p className="small">{checkinSummaryText || '오늘 체크인이 저장되었습니다.'}</p>
                <button onClick={() => void startCbtFromCheckinSummary()} disabled={loading || chatGenerating}>인지행동치료로 이동</button>
              </div>
            )}
          </div>

          <div className="homeMiddleRow">
            <article className="panel homeShortcutCard diaryLibraryCard">
              <h3>일기 보관함</h3>
              <p className="small">기록해둔 일기를 모아 확인할 수 있습니다.</p>
              <div className="actions">
                <button
                  className="ghost"
                  onClick={() => {
                    setJournalLibraryOpen(true)
                    setPage('journal')
                  }}
                >
                  열기
                </button>
              </div>
            </article>

            <article className="panel homeShortcutCard recommendPostCard">
              <h3>게시글 추천 top-k</h3>
              {recommendedPosts.length === 0 ? (
                <p className="small">추천 게시글을 불러오는 중입니다.</p>
              ) : (
                <ul className="probList">
                  {recommendedPosts.map((post) => (
                    <li key={post.id}>
                      <span>{post.title}</span>
                      <button
                        className="ghost"
                        onClick={() => {
                          setBoardFocusPostId(post.id)
                          setPage('board')
                        }}
                      >
                        보기
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </div>

          <div className="challengeTileGrid">
            {contentCatalog.slice(0, 3).map((item) => (
              <article key={item.id} className="panel challengeTile">
                <h3>챌린지</h3>
                <p><strong>{item.title}</strong></p>
                <p className="small">{item.description}</p>
                <button
                  className="ghost"
                  onClick={() => {
                    setSelectedContentTitle(item.title)
                    setPage('challenge')
                  }}
                >
                  시작하기
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {page === 'diary' && token && (
        <section className="panel cbtLayout diaryPanel">
          <article className="cbtMain">
            <h2>인지행동치료 챗봇 대화</h2>
            <div className="chatShell diaryTight">
              <div className="chatMessages" ref={chatMessagesRef}>
                {chatHistory.length === 0 && <div className="chatEmpty">오늘 있었던 사건, 감정, 생각의 흐름을 천천히 이야기해 주세요.</div>}
                {chatHistory.map((turn, idx) => (
                  <div key={`turn-${idx}`} className={`chatBubble ${turn.role === 'user' ? 'chatUser' : 'chatAssistant'}`}>
                    <strong className="chatBubbleHeader">
                      {turn.role === 'user' ? '나' : '인지행동 코치'}
                      {turn.loading && (
                        <span className="chatLoadingInline" title="응답 생성 중" aria-label="응답 생성 중">
                          <span className="loadingDot" />
                        </span>
                      )}
                    </strong>
                    <p>{turn.content}</p>
                  </div>
                ))}
              </div>
              <form onSubmit={handleChatSubmit} className="chatComposer">
                <div className="chatInputRow">
                  <textarea ref={chatInputRef} rows={1} value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} placeholder="사건, 감정, 사고 흐름을 입력해 주세요" />
                  <button className="chatSendBtn" disabled={loading || chatGenerating}>입력</button>
                </div>
                <button type="button" className="chatFinishBtn" onClick={() => void handleFinishDialogue()} disabled={loading || chatGenerating}>대화 마치기</button>
              </form>
            </div>
          </article>

          <aside className="cbtSide">
            <div className="panel sideCard">
              <h3>추천 생각 정리 도구</h3>
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
              <h3>진행 중 생각 정리</h3>
              {activeChallengeInProgress ? (
                <>
                  <p><strong>{activeChallenge}</strong></p>
                  <p className="small">현재 단계: {challengePhase === 'start' ? '시작' : challengePhase === 'continue' ? '진행' : '정리'}</p>
                  <p className="small">{challengeHintText || chatResult?.challenge_step_prompt || '사실 1개, 감정 1개, 자동사고 1개를 순서대로 적어보세요.'}</p>
                </>
              ) : (
                <p className="small">진행 중인 챌린지가 없습니다.</p>
              )}
              {(completedChallenges > 0 || challenges.length > 0) && (
                <p className="small">완료 {completedChallenges}/{challenges.length}</p>
              )}
            </div>
            <div className="panel sideCard">
              <h3>생각 정리 힌트</h3>
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

      {page === 'journal' && token && (
        <section className="panel cbtLayout">
          <article className="cbtMain">
            <h2>일기 쓰기</h2>
            <div className="miniGrid">
              <label>제목<input value={journalTitle} onChange={(e) => setJournalTitle(e.target.value)} /></label>
              <label>일자<input value={todayDateString()} readOnly /></label>
            </div>
            <label>
              일기 내용
              <textarea rows={8} value={journalContent} onChange={(e) => setJournalContent(e.target.value)} placeholder="오늘 있었던 일과 마음의 흐름을 기록해 주세요." />
            </label>
            <div className="actions">
              <button onClick={() => void handleSaveJournalEntry()} disabled={loading}>일기 저장</button>
              <button className="ghost" onClick={() => setJournalLibraryOpen((v) => !v)}>일기 도서관 {journalLibraryOpen ? '닫기' : '열기'}</button>
            </div>
          </article>

          <aside className="cbtSide">
            <div className="panel sideCard">
              <h3>해당 일자 체크인</h3>
              <p><strong>기분:</strong> {displayIfMeaningful(checkin.mood_score)}</p>
              <p><strong>수면:</strong> {displayIfMeaningful(checkin.sleep_hours, '시간')}</p>
              <p><strong>운동:</strong> {displayIfMeaningful(checkin.exercise_minutes_today, '분')}</p>
              <p><strong>햇빛:</strong> {displayIfMeaningful(checkin.daylight_minutes_today, '분')}</p>
            </div>

            <div className="panel sideCard">
              <h3>인지행동치료 요약</h3>
              <p><strong>상황:</strong> {chatResult?.summary_card?.situation ?? '-'}</p>
              <p><strong>재정리:</strong> {chatResult?.summary_card?.reframe ?? '-'}</p>
              <p><strong>다음 행동:</strong> {chatResult?.summary_card?.next_action ?? '-'}</p>
            </div>

            <div className="panel sideCard">
              <h3>오늘 챌린지 수행</h3>
              {todayLogs.length === 0 ? <p className="small">기록이 없습니다.</p> : (
                <ul className="probList">
                  {todayLogs.map((x) => (
                    <li key={`journal-log-${x.id}`}>
                      <span>{x.challenge_name}</span>
                      <strong>{displayIfMeaningful(x.duration_minutes, '분')}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>

          {journalLibraryOpen && (
            <article className="panel" style={{ gridColumn: '1 / -1' }}>
              <h3>일기 도서관</h3>
              {journalEntries.length === 0 ? <p className="small">저장된 일기가 없습니다.</p> : (
                <ul className="probList">
                  {journalEntries.map((entry) => (
                    <li key={entry.id}>
                      <span>{entry.entry_date} | {entry.title}</span>
                      <strong>{entry.content.slice(0, 80)}{entry.content.length > 80 ? '…' : ''}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )}

          {todayJournalEntry && (
            <article className="panel" style={{ gridColumn: '1 / -1' }}>
              <h3>오늘 저장된 일기</h3>
              <p><strong>{todayJournalEntry.title}</strong></p>
              <p>{todayJournalEntry.content}</p>
            </article>
          )}
        </section>
      )}

      {page === 'challenge' && token && (
        <section className="panel cbtLayout">
          <article className="cbtMain">
            <h2>챌린지 컨텐츠 수행</h2>
            <label>
              선택된 챌린지
              <input value={selectedContentTitle} onChange={(e) => setSelectedContentTitle(e.target.value)} placeholder="챌린지 이름" />
            </label>
            <div className="miniGrid">
              <label>수행 시간(분)<input inputMode="numeric" value={contentDuration} onChange={(e) => setContentDuration(e.target.value)} /></label>
              <label>수행 일자<input value={todayDateString()} readOnly /></label>
            </div>
            <label>
              수행 메모
              <textarea rows={5} value={contentDetail} onChange={(e) => setContentDetail(e.target.value)} placeholder="수행 중 느낀 점이나 어려움, 변화 등을 기록해 주세요." />
            </label>
            <div className="actions">
              <button onClick={() => void handleSaveContentChallenge()} disabled={loading}>수행 기록 저장</button>
              <button className="ghost" onClick={() => setPage('journal')}>일기에 반영하기</button>
            </div>
          </article>

          <aside className="cbtSide">
            <div className="panel sideCard">
              <h3>추천 컨텐츠</h3>
              <ul className="probList">
                {contentCatalog.map((item) => (
                  <li key={`challenge-catalog-${item.id}`}>
                    <span>{item.title}</span>
                    <button className="ghost" onClick={() => setSelectedContentTitle(item.title)}>선택</button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
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

      {page === 'dashboard' && token && (
        <section className="panel">
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
              <MiniBarChart
                labels={['DEP', 'ANX', 'INS']}
                values={[latestWeekly?.dep_week_pred_0_100 ?? 0, latestWeekly?.anx_week_pred_0_100 ?? 0, latestWeekly?.ins_week_pred_0_100 ?? 0]}
                color="#0f766e"
              />
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
              <h3>최근 7일 지표 (bar + kde)</h3>
              <BarKDETrendChart
                labels={weeklyRows.map((r, idx) => {
                  if (!r) {
                    const d = new Date()
                    d.setDate(d.getDate() - (6 - idx))
                    return formatDateYYYYMMDD(d).slice(5)
                  }
                  return r.week_start_date.slice(5)
                })}
                series={[
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
                  return (
                    <li key={label}>
                      <span>{label}</span>
                      <strong>우울 {row.dep_week_pred_0_100.toFixed(1)} / 불안 {row.anx_week_pred_0_100.toFixed(1)} / 불면 {row.ins_week_pred_0_100.toFixed(1)}</strong>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {dashboardTab === 'monthly' && (
            <div className="result">
              <h3>주 평균 지표 (bar + kde)</h3>
              <BarKDETrendChart
                labels={monthlyRows.map((r) => r.week.slice(5))}
                series={[
                  { name: '우울', color: '#2563eb', values: monthlyRows.map((r) => r.dep) },
                  { name: '불안', color: '#f59e0b', values: monthlyRows.map((r) => r.anx) },
                  { name: '불면', color: '#ef4444', values: monthlyRows.map((r) => r.ins) },
                ]}
              />
              <ul className="probList">
                {monthlyRows.map((row) => (
                  <li key={row.week}>
                    <span>{row.week} (1주 평균)</span>
                    <strong>우울 {row.dep?.toFixed(1)} / 불안 {row.anx?.toFixed(1)} / 불면 {row.ins?.toFixed(1)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {page === 'mypage' && token && (
        <section className="mypageLayout">
          <aside className="panel mySidebar">
            <h2>마이페이지</h2>
            <div className="sideMenu">
              <button className={myTab === 'profile' ? '' : 'ghost'} onClick={() => setMyTab('profile')}>회원정보 수정</button>
              <button className={myTab === 'report' ? '' : 'ghost'} onClick={() => setMyTab('report')}>요약리포트</button>
            </div>
          </aside>

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

      {token && (
        <nav className="floatingDock" aria-label="빠른 메뉴">
          <button className={page === 'checkin' ? 'active' : ''} onClick={() => setPage('checkin')}>
            <span className="dockIcon" aria-hidden>⌂</span>
            <span>홈</span>
          </button>
          <button className={page === 'diary' ? 'active' : ''} onClick={() => setPage('diary')}>
            <span className="dockIcon" aria-hidden>◍</span>
            <span>대화</span>
          </button>
          <button className={page === 'journal' ? 'active' : ''} onClick={() => setPage('journal')}>
            <span className="dockIcon" aria-hidden>✎</span>
            <span>일기</span>
          </button>
          <button className={page === 'dashboard' ? 'active' : ''} onClick={() => setPage('dashboard')}>
            <span className="dockIcon" aria-hidden>▤</span>
            <span>지표</span>
          </button>
          <button className={page === 'mypage' ? 'active' : ''} onClick={() => setPage('mypage')}>
            <span className="dockIcon" aria-hidden>⚙</span>
            <span>설정</span>
          </button>
        </nav>
      )}

      {noticeOpen && (
        <div className="noticeOverlay" role="dialog" aria-modal="true">
          <div className="noticeCard">
            <p>{noticeText}</p>
            <div className="actions">
              <button
                type="button"
                onClick={() => {
                  setNoticeOpen(false)
                  setMessage('')
                }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {logoutConfirmOpen && (
        <div className="noticeOverlay" role="dialog" aria-modal="true">
          <div className="noticeCard">
            <p>로그아웃 하시겠습니까?</p>
            <div className="actions">
              <button type="button" onClick={logout}>예</button>
              <button type="button" className="ghost" onClick={() => setLogoutConfirmOpen(false)}>아니요</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
