import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import AdminPage from './pages/admin/AdminPage'

type PageKey = 'assessment' | 'cbt' | 'mypage' | 'admin' | 'account'
type MyPageTab = 'dashboard' | 'profile'
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
}

type PasswordVerifyResponse = {
  matched: boolean
}

type ChatRole = 'user' | 'assistant'

type ChatTurn = {
  role: ChatRole
  content: string
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
    distortion: Record<string, number>
  }
  suggested_challenges: string[]
  active_challenge?: string | null
  challenge_step_prompt?: string | null
  challenge_completed?: boolean
  completed_challenge?: string | null
  completion_message?: string | null
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

type PHQ9AssessmentSummary = {
  id: string
  total_score: number
  severity: string
  created_at: string
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

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001'

const LIKERT_OPTIONS: Array<{ value: LikertValue; label: string }> = [
  { value: '', label: '선택해주세요' },
  { value: '0', label: '전혀 그렇지 않았어요' },
  { value: '1', label: '가끔 그랬어요' },
  { value: '2', label: '자주 그랬어요' },
  { value: '3', label: '거의 대부분 그랬어요' },
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

function riskBand(score: number): string {
  if (score >= 75) return '고위험'
  if (score >= 50) return '중위험'
  return '안정'
}

function deltaText(current: number, prev?: number): string {
  if (prev == null) return '-'
  return `${(current - prev).toFixed(1)}`
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
  const [page, setPage] = useState<PageKey>('account')
  const [myTab, setMyTab] = useState<MyPageTab>('dashboard')

  const [token, setToken] = useState<string>(() => localStorage.getItem('access_token') ?? '')
  const [me, setMe] = useState<UserOut | null>(null)

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('Ready.')

  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupNickname, setSignupNickname] = useState('')
  const [showSignupForm, setShowSignupForm] = useState(false)

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  const [assessment, setAssessment] = useState<AssessmentState>(defaultAssessment)
  const [checkPrediction, setCheckPrediction] = useState<CheckPredictResponse | null>(null)

  const [chatMessage, setChatMessage] = useState('')
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([])
  const [chatResult, setChatResult] = useState<ChatResponse | null>(null)
  const [activeChallenge, setActiveChallenge] = useState('')
  const [challengePhase, setChallengePhase] = useState<'start' | 'continue' | 'reflect'>('continue')
  const [challengeStatus, setChallengeStatus] = useState<Record<string, boolean>>({})
  const [cbtCheckinMood, setCbtCheckinMood] = useState('')
  const [cbtCheckinSleep, setCbtCheckinSleep] = useState('')

  const [dashboard, setDashboard] = useState<WeeklyDashboardResponse | null>(null)
  const [phqHistory, setPhqHistory] = useState<PHQ9AssessmentSummary[]>([])

  const [profile, setProfile] = useState<ProfileOut | null>(null)
  const [profileNickname, setProfileNickname] = useState('')
  const [profileCurrentPw, setProfileCurrentPw] = useState('')
  const [profileNewPw, setProfileNewPw] = useState('')
  const [profilePanel, setProfilePanel] = useState<'none' | 'nickname' | 'password'>('none')
  const [passwordVerified, setPasswordVerified] = useState(false)

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token],
  )

  useEffect(() => {
    if (!token) {
      setMe(null)
      setProfile(null)
      setPhqHistory([])
      return
    }
    void loadProfile()
    void loadMyProfile()
    void loadPhqHistory()
  }, [token])

  useEffect(() => {
    if (!chatResult) return
    setChallengeStatus((prev) => {
      const next = { ...prev }
      for (const challenge of chatResult.suggested_challenges) {
        if (next[challenge] == null) next[challenge] = false
      }
      return next
    })
  }, [chatResult])

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

  async function loadMyProfile() {
    try {
      const response = await fetch(`${API_BASE}/auth/me/profile`, { headers: authHeaders })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as ProfileOut
      setProfile(data)
      setProfileNickname(data.nickname)
      setProfileCurrentPw('')
      setProfileNewPw('')
      setProfilePanel('none')
      setPasswordVerified(false)
    } catch (error) {
      setMessage(`MyPage profile load error: ${(error as Error).message}`)
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
        body: JSON.stringify({
          email: signupEmail,
          password: signupPassword,
          nickname: signupNickname,
        }),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      await response.json()
      setMessage('계정이 생성되었습니다.')
      setShowSignupForm(false)
      setSignupEmail('')
      setSignupPassword('')
      setSignupNickname('')
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
    const validationError = validateAssessment()
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
        body: JSON.stringify(buildPayload(assessment)),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as CheckPredictResponse
      setCheckPrediction(data)

      if (token) {
        const answers = {
          q1: Number(assessment.phq9[0]),
          q2: Number(assessment.phq9[1]),
          q3: Number(assessment.phq9[2]),
          q4: Number(assessment.phq9[3]),
          q5: Number(assessment.phq9[4]),
          q6: Number(assessment.phq9[5]),
          q7: Number(assessment.phq9[6]),
          q8: Number(assessment.phq9[7]),
          q9: Number(assessment.phq9[8]),
        }
        const saveRes = await fetch(`${API_BASE}/assessments/phq9`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ answers }),
        })
        if (!saveRes.ok) throw new Error(await extractApiError(saveRes))
        await saveRes.json()
        await loadMyDashboard()
        await loadPhqHistory()
      }

      setMessage('검사 결과가 생성되었습니다. 대시보드에 즉시 반영됩니다.')
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

    const text = chatMessage.trim()
    if (!text) {
      setMessage('대화 내용을 입력하세요.')
      return
    }

    setLoading(true)
    setMessage('CBT 대화 분석 중...')

    const historyForRequest = chatHistory.slice(-12)
    setChatHistory((prev) => [...prev, { role: 'user', content: text }])

    try {
      const payload: Record<string, unknown> = {
        message: text,
        conversation_history: historyForRequest,
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

      setChatHistory((prev) => {
        const next: ChatTurn[] = [...prev, { role: 'assistant', content: data.reply }]
        if (data.challenge_completed && data.completion_message) {
          next.push({ role: 'assistant', content: data.completion_message })
        }
        return next
      })
      setChatResult(data)
      setChatMessage('')

      if (data.active_challenge) {
        setActiveChallenge(data.active_challenge)
        setChallengePhase(data.challenge_completed ? 'reflect' : 'continue')
      }

      if (data.challenge_completed && data.completed_challenge) {
        setChallengeStatus((prev) => ({ ...prev, [data.completed_challenge as string]: true }))
      }

      setMessage('CBT 응답 및 지표 추출 완료')
    } catch (error) {
      setMessage(`CBT 채팅 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  function startChallenge(challenge: string) {
    setActiveChallenge(challenge)
    setChallengePhase('start')
    setChatHistory((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: `좋아요. '${challenge}' 챌린지를 지금부터 함께 진행할게요. 준비되면 현재 상황을 한 문장으로 알려주세요.`,
      },
    ])
    setMessage(`선택한 챌린지: ${challenge}`)
  }

  async function handleSaveCbtCheckin() {
    if (!token) {
      setMessage('체크인 저장은 로그인 후 가능합니다.')
      return
    }
    if (!chatResult) {
      setMessage('먼저 CBT 대화를 진행해주세요.')
      return
    }
    if (cbtCheckinMood === '') {
      setMessage('오늘의 기분 점수(1~10)를 입력하세요.')
      return
    }

    const mood = Number(cbtCheckinMood)
    const sleep = cbtCheckinSleep === '' ? null : Number(cbtCheckinSleep)
    if (Number.isNaN(mood) || mood < 1 || mood > 10) {
      setMessage('기분 점수는 1~10 범위여야 합니다.')
      return
    }
    if (sleep != null && (Number.isNaN(sleep) || sleep < 0 || sleep > 24)) {
      setMessage('수면 시간은 0~24 범위여야 합니다.')
      return
    }

    const challenges = chatResult.suggested_challenges
    const completedCount = challenges.filter((c) => challengeStatus[c]).length

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/checkins`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          mood_score: mood,
          sleep_hours: sleep,
          exercised: completedCount > 0,
          note: activeChallenge ? `active_challenge:${activeChallenge}` : 'cbt_checkin',
          challenge_completed_count: completedCount,
          challenge_total_count: challenges.length,
        }),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      await response.json()
      await loadMyDashboard()
      setMessage(`대화 마치기 완료 (챌린지 ${completedCount}/${challenges.length})`)
      setCbtCheckinMood('')
      setCbtCheckinSleep('')
    } catch (error) {
      setMessage(`체크인 저장 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function loadMyDashboard() {
    if (!token) {
      setMessage('로그인 후 마이 대시보드를 조회할 수 있습니다.')
      return
    }
    setLoading(true)
    setMessage('내 대시보드 로딩 중...')
    try {
      const response = await fetch(`${API_BASE}/ai/nowcast/dashboard/me`, { headers: authHeaders })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as WeeklyDashboardResponse
      setDashboard(data)
      setMessage('내 대시보드 조회 완료')
    } catch (error) {
      setMessage(`내 대시보드 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function loadPhqHistory() {
    if (!token) return
    try {
      const response = await fetch(`${API_BASE}/assessments/phq9`, { headers: authHeaders })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as PHQ9AssessmentSummary[]
      setPhqHistory(data)
    } catch (error) {
      setMessage(`검사 이력 조회 오류: ${(error as Error).message}`)
    }
  }

  async function handleNicknameSave() {
    if (!token) {
      setMessage('로그인 후 이용 가능합니다.')
      return
    }
    if (!profile || profileNickname.trim() === '' || profileNickname === profile.nickname) {
      setMessage('변경된 닉네임이 없습니다.')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/auth/me/profile`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ nickname: profileNickname }),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      await loadMyProfile()
      await loadProfile()
      setMessage('닉네임이 수정되었습니다.')
      window.alert('완료되었습니다!')
    } catch (error) {
      setMessage(`닉네임 수정 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyCurrentPassword() {
    if (!token) {
      setMessage('로그인 후 이용 가능합니다.')
      return
    }
    if (profileCurrentPw.trim() === '') {
      setMessage('현재 비밀번호를 입력하세요.')
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
      if (data.matched) setMessage('현재 비밀번호 확인 완료')
    } catch (error) {
      setPasswordVerified(false)
      setMessage(`비밀번호 확인 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handlePasswordSave() {
    if (!token) {
      setMessage('로그인 후 이용 가능합니다.')
      return
    }
    if (!passwordVerified) {
      setMessage('현재 비밀번호 확인을 먼저 진행하세요.')
      return
    }
    if (profileNewPw.trim() === '') {
      setMessage('변경할 비밀번호를 입력하세요.')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/auth/me/profile`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({
          current_password: profileCurrentPw,
          new_password: profileNewPw,
        }),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      setProfileCurrentPw('')
      setProfileNewPw('')
      setPasswordVerified(false)
      setMessage('비밀번호가 수정되었습니다.')
      window.alert('완료되었습니다!')
    } catch (error) {
      setMessage(`비밀번호 수정 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  const nickname = me?.nickname ?? '게스트'
  const highRiskProbability = checkPrediction == null ? 0 : (checkPrediction.probabilities['3'] ?? 0) + (checkPrediction.probabilities['4'] ?? 0)

  const phqTotal = sumLikert(assessment.phq9)
  const gadTotal = sumLikert(assessment.gad7)
  const sleepTotal = sumLikert(assessment.sleep)
  const contextTotal =
    Number(assessment.context.daily_functioning || 0) +
    Number(assessment.context.stressful_event || 0) +
    Number(assessment.context.social_support || 0) +
    Number(assessment.context.coping_skill || 0) +
    Number(assessment.context.motivation_for_change || 0)
  const latestWeekly = dashboard?.rows?.length ? dashboard.rows[dashboard.rows.length - 1] : null
  const prevWeekly = dashboard && dashboard.rows.length > 1 ? dashboard.rows[dashboard.rows.length - 2] : null
  const chartRows = useMemo(() => {
    if (!dashboard?.rows?.length) return []
    return dashboard.rows.map((row) => ({
      dateLabel: new Date(row.week_start_date).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }),
      composite: row.symptom_composite_pred_0_100,
      dep: row.dep_week_pred_0_100,
      anx: row.anx_week_pred_0_100,
      ins: row.ins_week_pred_0_100,
    }))
  }, [dashboard])
  const chartWidth = 760
  const chartHeight = 280
  const chartPadding = { top: 20, right: 24, bottom: 44, left: 46 }
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom
  const xStep = chartRows.length > 1 ? plotWidth / (chartRows.length - 1) : 0
  const yTicks = [0, 25, 50, 75, 100]
  const points = chartRows.map((row, idx) => {
    const x = chartPadding.left + (chartRows.length > 1 ? idx * xStep : plotWidth / 2)
    const y = chartPadding.top + ((100 - Math.max(0, Math.min(100, row.composite))) / 100) * plotHeight
    return { ...row, x, y, idx }
  })
  const depPolylinePoints = points
    .map((p) => `${p.x},${chartPadding.top + ((100 - Math.max(0, Math.min(100, p.dep))) / 100) * plotHeight}`)
    .join(' ')
  const anxPolylinePoints = points
    .map((p) => `${p.x},${chartPadding.top + ((100 - Math.max(0, Math.min(100, p.anx))) / 100) * plotHeight}`)
    .join(' ')
  const insPolylinePoints = points
    .map((p) => `${p.x},${chartPadding.top + ((100 - Math.max(0, Math.min(100, p.ins))) / 100) * plotHeight}`)
    .join(' ')
  const compositePolylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ')
  const xLabelStep = Math.max(1, Math.ceil(chartRows.length / 6))

  return (
    <main className="page">
      <header className="hero">
        <p className="kicker">Mind Check Console</p>
        <h1>서비스 콘솔</h1>
        <p className="subtitle">설문 문항 선택, CBT 대화형 챌린지, 실시간 추세 반영 대시보드</p>
      </header>

      <section className="panel">
        <div className="actions">
          <button className={page === 'assessment' ? '' : 'ghost'} onClick={() => setPage('assessment')}>검사</button>
          <button className={page === 'cbt' ? '' : 'ghost'} onClick={() => setPage('cbt')}>CBT 채팅</button>
          <button className={page === 'mypage' ? '' : 'ghost'} onClick={() => setPage('mypage')}>마이페이지</button>
          <button className={page === 'admin' ? '' : 'ghost'} onClick={() => setPage('admin')}>관리자</button>
          <button className={page === 'account' ? '' : 'ghost'} onClick={() => setPage('account')}>회원/로그인</button>
        </div>
      </section>

      {page === 'assessment' && (
        <section className="panel">
          <h2>심리검사</h2>

          <form onSubmit={handleSurveySubmit} className="form">
            <article className="panel questionBlock">
              <h3>우울 관련 문항 (PHQ-9)</h3>
              <p className="small">자동 총점: {phqTotal} / 27</p>
              <div className="questionList">
                {PHQ9_QUESTIONS.map((q, idx) => (
                  <label key={`phq-${idx}`}>
                    {idx + 1}. {q}
                    <select value={assessment.phq9[idx]} onChange={(e) => setPhqAnswer(idx, e.target.value as LikertValue)}>
                      {LIKERT_OPTIONS.map((opt) => (
                        <option key={`phq-${idx}-${opt.value}`} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </article>

            <article className="panel questionBlock">
              <h3>불안 관련 문항 (GAD-7)</h3>
              <p className="small">자동 총점: {gadTotal} / 21</p>
              <div className="questionList">
                {GAD7_QUESTIONS.map((q, idx) => (
                  <label key={`gad-${idx}`}>
                    {idx + 1}. {q}
                    <select value={assessment.gad7[idx]} onChange={(e) => setGadAnswer(idx, e.target.value as LikertValue)}>
                      {LIKERT_OPTIONS.map((opt) => (
                        <option key={`gad-${idx}-${opt.value}`} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </article>

            <article className="panel questionBlock">
              <h3>수면 관련 문항</h3>
              <p className="small">자동 총점: {sleepTotal} / 9</p>
              <div className="questionList">
                {SLEEP_QUESTIONS.map((q, idx) => (
                  <label key={`sleep-${idx}`}>
                    {idx + 1}. {q}
                    <select value={assessment.sleep[idx]} onChange={(e) => setSleepAnswer(idx, e.target.value as LikertValue)}>
                      {LIKERT_OPTIONS.map((opt) => (
                        <option key={`sleep-${idx}-${opt.value}`} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </article>

            <article className="panel questionBlock">
              <h3>생활 맥락 체크</h3>
              <p className="small">자동 총점: {contextTotal} / 15</p>
              <div className="questionList">
                <label>
                  최근 일상생활(학업/업무/집안일)을 해내는 데 어려움이 느껴졌나요?
                  <select value={assessment.context.daily_functioning} onChange={(e) => setContextAnswer('daily_functioning', e.target.value as LikertValue)}>
                    {LIKERT_OPTIONS.map((opt) => <option key={`ctx-daily-${opt.value}`} value={opt.value}>{opt.label}</option>)}
                  </select>
                </label>
                <label>
                  최근 스트레스 사건이 마음 상태에 크게 영향을 준다고 느꼈나요?
                  <select value={assessment.context.stressful_event} onChange={(e) => setContextAnswer('stressful_event', e.target.value as LikertValue)}>
                    {LIKERT_OPTIONS.map((opt) => <option key={`ctx-stress-${opt.value}`} value={opt.value}>{opt.label}</option>)}
                  </select>
                </label>
                <label>
                  힘든 상황에서 도움을 요청하거나 기대기 어렵다고 느꼈나요?
                  <select value={assessment.context.social_support} onChange={(e) => setContextAnswer('social_support', e.target.value as LikertValue)}>
                    {LIKERT_OPTIONS.map((opt) => <option key={`ctx-social-${opt.value}`} value={opt.value}>{opt.label}</option>)}
                  </select>
                </label>
                <label>
                  불편한 감정을 다루는 나만의 방법이 부족하다고 느꼈나요?
                  <select value={assessment.context.coping_skill} onChange={(e) => setContextAnswer('coping_skill', e.target.value as LikertValue)}>
                    {LIKERT_OPTIONS.map((opt) => <option key={`ctx-coping-${opt.value}`} value={opt.value}>{opt.label}</option>)}
                  </select>
                </label>
                <label>
                  지금 상태를 바꿔보고 싶은 마음이 잘 생기지 않았나요?
                  <select value={assessment.context.motivation_for_change} onChange={(e) => setContextAnswer('motivation_for_change', e.target.value as LikertValue)}>
                    {LIKERT_OPTIONS.map((opt) => <option key={`ctx-motivation-${opt.value}`} value={opt.value}>{opt.label}</option>)}
                  </select>
                </label>
              </div>
            </article>

            <button disabled={loading}>결과 보기</button>
          </form>

          {checkPrediction && (
            <div className="result">
              <p>{nickname}님의 결과는 <strong>{severityToKorean(checkPrediction.prediction)}</strong>입니다.</p>
              <p>고위험 확률(3~4단계): <strong>{(highRiskProbability * 100).toFixed(1)}%</strong></p>
            </div>
          )}
        </section>
      )}

      {page === 'cbt' && (
        <section className="panel cbtPanel">
          <h2>CBT 대화 코치</h2>
          <p className="small">대화를 통해 상태 지표를 추출하고, 선택한 챌린지를 단계별로 함께 진행합니다.</p>

          <div className="miniGrid cbtTopInputs">
            <label>
              오늘의 기분 점수 (1~10)
              <input value={cbtCheckinMood} onChange={(e) => setCbtCheckinMood(e.target.value)} inputMode="numeric" placeholder="예: 6" />
            </label>
            <label>
              오늘 수면 시간 (선택)
              <input value={cbtCheckinSleep} onChange={(e) => setCbtCheckinSleep(e.target.value)} inputMode="decimal" placeholder="예: 6.5" />
            </label>
          </div>

          <div className="chatShell">
            <div className="chatMessages">
              {chatHistory.length === 0 && (
                <div className="chatEmpty">오늘 있었던 일이나 마음 상태를 편하게 적어주세요. 제가 대화를 이어가며 지표를 추출하고 챌린지를 함께 진행할게요.</div>
              )}
              {chatHistory.map((turn, idx) => (
                <div key={`turn-${idx}`} className={`chatBubble ${turn.role === 'user' ? 'chatUser' : 'chatAssistant'}`}>
                  <strong>{turn.role === 'user' ? '나' : '코치'}</strong>
                  <p>{turn.content}</p>
                </div>
              ))}

              {chatResult?.challenge_step_prompt && (
                <div className="chatBubble chatAssistant">
                  <strong>다음 단계</strong>
                  <p>{chatResult.challenge_step_prompt}</p>
                </div>
              )}
            </div>

            {activeChallenge && (
              <p className="small">진행 중 챌린지: <strong>{activeChallenge}</strong></p>
            )}

            {chatResult && (
              <div className="challengeArea">
                <p className="small"><strong>챌린지 선택</strong></p>
                <div className="actions">
                  {chatResult.suggested_challenges.map((c) => (
                    <button key={c} type="button" className="ghost" onClick={() => startChallenge(c)}>{c}</button>
                  ))}
                </div>
                <ul className="probList">
                  {chatResult.suggested_challenges.map((c) => (
                    <li key={`status-${c}`}>
                      <span>{c}</span>
                      <strong>{challengeStatus[c] ? '완료' : '진행 전/진행 중'}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <form onSubmit={handleChatSubmit} className="chatComposer">
              <textarea
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                rows={3}
                placeholder="오늘 있었던 일, 감정, 떠오른 생각을 입력하세요"
              />
              <div className="actions">
                <button disabled={loading}>보내기</button>
                {activeChallenge && (
                  <button type="button" className="ghost" onClick={() => setChallengePhase('reflect')}>회고 모드</button>
                )}
                <button type="button" disabled={loading} onClick={() => void handleSaveCbtCheckin()}>
                  대화 마치기
                </button>
              </div>
            </form>
          </div>
        </section>
      )}

      {page === 'mypage' && (
        <section className="mypageLayout">
          <aside className="panel mySidebar">
            <h2>마이페이지 메뉴</h2>
            <div className="sideMenu">
              <button className={myTab === 'dashboard' ? '' : 'ghost'} onClick={() => setMyTab('dashboard')}>대시보드</button>
              <button className={myTab === 'profile' ? '' : 'ghost'} onClick={() => setMyTab('profile')}>회원정보수정</button>
            </div>
          </aside>

          {myTab === 'dashboard' && (
            <article className="panel myMainPanel">
              <h2>My Dashboard</h2>
              <p className="small">데이터가 생길 때마다 일 단위로 즉시 반영됩니다.</p>
              <div className="actions"><button disabled={loading} onClick={() => void loadMyDashboard()}>내 대시보드 조회</button></div>
              {dashboard && (
                <>
                  <p>최근 주차 수: {dashboard.rows.length}</p>
                  {latestWeekly && (
                    <>
                      <p className="small">
                        현재 상태: <strong>{riskBand(latestWeekly.symptom_composite_pred_0_100)}</strong> (composite {latestWeekly.symptom_composite_pred_0_100.toFixed(1)})
                      </p>
                      <p className="small">
                        최근 변화: {deltaText(latestWeekly.symptom_composite_pred_0_100, prevWeekly?.symptom_composite_pred_0_100)}
                      </p>
                    </>
                  )}
                  <section className="lineChartSection">
                    <h3>종합 점수 추이</h3>
                    <div className="lineChartLegend">
                      <span><i className="legendSwatch legendComposite" />종합(강조)</span>
                      <span><i className="legendSwatch legendDep" />DEP</span>
                      <span><i className="legendSwatch legendAnx" />ANX</span>
                      <span><i className="legendSwatch legendIns" />INS</span>
                    </div>
                    {points.length === 0 ? (
                      <p className="small">그래프에 표시할 점수가 없습니다.</p>
                    ) : (
                      <>
                        <div className="lineChartWrap">
                          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="날짜별 종합점수 추이">
                            {yTicks.map((tick) => {
                              const y = chartPadding.top + ((100 - tick) / 100) * plotHeight
                              return (
                                <g key={`y-${tick}`}>
                                  <line x1={chartPadding.left} x2={chartWidth - chartPadding.right} y1={y} y2={y} className="chartGridLine" />
                                  <text x={chartPadding.left - 8} y={y + 4} textAnchor="end" className="chartAxisText">{tick}</text>
                                </g>
                              )
                            })}
                            <line x1={chartPadding.left} x2={chartPadding.left} y1={chartPadding.top} y2={chartHeight - chartPadding.bottom} className="chartAxisLine" />
                            <line
                              x1={chartPadding.left}
                              x2={chartWidth - chartPadding.right}
                              y1={chartHeight - chartPadding.bottom}
                              y2={chartHeight - chartPadding.bottom}
                              className="chartAxisLine"
                            />
                            {points.length > 1 && (
                              <>
                                <polyline points={depPolylinePoints} fill="none" className="chartSeriesSub chartSeriesDep" />
                                <polyline points={anxPolylinePoints} fill="none" className="chartSeriesSub chartSeriesAnx" />
                                <polyline points={insPolylinePoints} fill="none" className="chartSeriesSub chartSeriesIns" />
                                <polyline points={compositePolylinePoints} fill="none" className="chartSeriesLine" />
                              </>
                            )}
                            {points.map((point) => (
                              <g key={`point-${point.idx}`}>
                                <circle cx={point.x} cy={point.y} r={4} className="chartPoint" />
                                {(point.idx % xLabelStep === 0 || point.idx === points.length - 1) && (
                                  <text x={point.x} y={chartHeight - chartPadding.bottom + 18} textAnchor="middle" className="chartAxisText">
                                    {point.dateLabel}
                                  </text>
                                )}
                              </g>
                            ))}
                          </svg>
                        </div>
                        <p className="small">X축: 날짜 / Y축: 종합점수(0~100)</p>
                      </>
                    )}
                  </section>
                </>
              )}

              <section className="historySection">
                <h3>심리검사 점수 추이 (PHQ-9)</h3>
                {phqHistory.length === 0 ? (
                  <p className="small">아직 저장된 PHQ-9 검사 이력이 없습니다.</p>
                ) : (
                  <>
                    <div className="historyChart">
                      {phqHistory
                        .slice()
                        .reverse()
                        .map((item) => (
                          <div className="historyBarRow" key={item.id}>
                            <span className="historyDate">{new Date(item.created_at).toLocaleString('ko-KR')}</span>
                            <div className="historyBarTrack">
                              <div className="historyBarFill" style={{ width: `${(item.total_score / 27) * 100}%` }} />
                            </div>
                            <strong className="historyScore">{item.total_score}</strong>
                          </div>
                        ))}
                    </div>
                    <p className="small">X축: 날짜시간 / Y축: PHQ-9 점수(0~27)</p>
                  </>
                )}
              </section>
            </article>
          )}

          {myTab === 'profile' && (
            <article className="panel myMainPanel">
              <h2>회원정보수정</h2>
              <div className="profileBlocks">
                <section className="profileBlock">
                  <button
                    type="button"
                    className="profileBlockHeader"
                    onClick={() => setProfilePanel(profilePanel === 'nickname' ? 'none' : 'nickname')}
                  >
                    닉네임 수정하기
                  </button>
                  {profilePanel === 'nickname' && (
                    <div className="form">
                      <p className="small">현재 닉네임: {profile?.nickname ?? '-'}</p>
                      <label>
                        변경할 닉네임
                        <input value={profileNickname} onChange={(e) => setProfileNickname(e.target.value)} />
                      </label>
                      <div className="actions">
                        <button type="button" disabled={loading} onClick={() => void handleNicknameSave()}>닉네임 저장</button>
                      </div>
                    </div>
                  )}
                </section>

                <section className="profileBlock">
                  <button
                    type="button"
                    className="profileBlockHeader"
                    onClick={() => setProfilePanel(profilePanel === 'password' ? 'none' : 'password')}
                  >
                    비밀번호 수정하기
                  </button>
                  {profilePanel === 'password' && (
                    <div className="form">
                      <label>
                        현재 비밀번호
                        <input type="password" value={profileCurrentPw} onChange={(e) => setProfileCurrentPw(e.target.value)} />
                      </label>
                      <div className="actions">
                        <button type="button" disabled={loading} onClick={() => void handleVerifyCurrentPassword()}>현재 비밀번호 확인</button>
                      </div>
                      {passwordVerified && (
                        <>
                          <label>
                            변경할 비밀번호
                            <input type="password" value={profileNewPw} onChange={(e) => setProfileNewPw(e.target.value)} />
                          </label>
                          <div className="actions">
                            <button type="button" disabled={loading} onClick={() => void handlePasswordSave()}>비밀번호 저장</button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </section>
              </div>
            </article>
          )}
        </section>
      )}

      {page === 'admin' && (
        <section className="panel">
          {!token ? (
            <p>로그인을 먼저 해주세요.</p>
          ) : (
            <AdminPage token={token} />
          )}
        </section>
      )}

      {page === 'account' && (
        <section className="panel">
          <article>
            <h2>로그인</h2>
            <form onSubmit={handleLogin} className="form">
              <label>
                Email
                <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
              </label>
              <label>
                Password
                <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} minLength={8} required />
              </label>
              {me && (
                <p className="badge">Signed in as {me.nickname} ({me.email})</p>
              )}
              {!me && <p className="small">계정이 없는경우 회원가입을 하셔야합니다</p>}
              <div className="actions">
                <button disabled={loading}>Login</button>
                <button type="button" className="ghost" onClick={logout}>Logout</button>
              </div>
            </form>
            <p className="mono">API: {API_BASE}</p>
          </article>

          <hr style={{ border: 0, borderTop: '1px solid #dbe7eb', margin: '1.1rem 0' }} />

          <article>
            <h3>회원가입</h3>
            {!showSignupForm ? (
              <div className="actions">
                <button type="button" className="ghost" onClick={() => setShowSignupForm(true)}>회원가입</button>
              </div>
            ) : (
              <form onSubmit={handleSignup} className="form">
                <label>
                  Email
                  <input value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required />
                </label>
                <label>
                  Password
                  <input type="password" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} minLength={8} required />
                </label>
                <label>
                  Nickname
                  <input value={signupNickname} onChange={(e) => setSignupNickname(e.target.value)} required />
                </label>
                <div className="actions">
                  <button disabled={loading}>회원가입 신청</button>
                  <button type="button" className="ghost" onClick={() => setShowSignupForm(false)}>취소</button>
                </div>
              </form>
            )}
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
