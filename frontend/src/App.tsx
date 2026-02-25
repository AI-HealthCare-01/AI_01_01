import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import AdminPage from './pages/admin/AdminPage'
import BoardPage from './pages/board/BoardPage'
import StitchCbtPage from './pages/cbt/StitchCbtPage'
import StitchAssessmentPage from './pages/assessment/StitchAssessmentPage'

type PageKey = 'assessment' | 'cbt' | 'board' | 'mypage' | 'admin' | 'account'
type AccountMode = 'login' | 'signup'
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
  phone_number: string | null
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
  { value: '', label: '선택하세요' },
  { value: '0', label: '0: 전혀 없음' },
  { value: '1', label: '1: 며칠 동안' },
  { value: '2', label: '2: 절반 이상' },
  { value: '3', label: '3: 거의 매일' },
]

const PHQ9_QUESTIONS = [
  '흥미/즐거움 저하',
  '우울감/절망감',
  '수면 문제(잠들기/유지/과다수면)',
  '피로감/기력 저하',
  '식욕 저하/과식',
  '자책감/실패감',
  '집중 곤란',
  '행동 지연/초조',
  '자해/자살 사고',
]

const GAD7_QUESTIONS = [
  '초조/불안/긴장',
  '걱정을 멈추기 어려움',
  '과도한 걱정',
  '이완 어려움',
  '안절부절 못함',
  '쉽게 짜증/예민',
  '끔찍한 일에 대한 두려움',
]

const SLEEP_QUESTIONS = [
  '잠들기 어려움',
  '수면 유지 어려움/자주 깸',
  '수면 문제로 인한 낮 기능 저하',
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
  const [accountMode, setAccountMode] = useState<AccountMode>('login')
  const [accountNotice, setAccountNotice] = useState('')

  const [token, setToken] = useState<string>(() => localStorage.getItem('access_token') ?? '')
  const [me, setMe] = useState<UserOut | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('Ready.')

  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupNickname, setSignupNickname] = useState('')

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  const [assessment, setAssessment] = useState<AssessmentState>(defaultAssessment)
  const [checkPrediction, setCheckPrediction] = useState<CheckPredictResponse | null>(null)
  const [invalidQuestionKeys, setInvalidQuestionKeys] = useState<string[]>([])

  const [chatMessage, setChatMessage] = useState('요즘 잠이 너무 안 오고, 다 망할 것 같다는 생각이 자주 들어요.')
  const [chatResult, setChatResult] = useState<ChatResponse | null>(null)
  const [cbtCheckinMood, setCbtCheckinMood] = useState('')
  const [cbtCheckinSleep, setCbtCheckinSleep] = useState('')
  const [challengeChecks, setChallengeChecks] = useState<boolean[]>([])
  const [dashboard, setDashboard] = useState<WeeklyDashboardResponse | null>(null)

  const [profile, setProfile] = useState<ProfileOut | null>(null)
  const [profileNickname, setProfileNickname] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [profileNewEmail, setProfileNewEmail] = useState('')
  const [profileCurrentPw, setProfileCurrentPw] = useState('')
  const [profileNewPw, setProfileNewPw] = useState('')
  const [showPasswordReset, setShowPasswordReset] = useState(false)

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token],
  )

  useEffect(() => {
    setChallengeChecks(chatResult ? chatResult.suggested_challenges.map(() => false) : [])
  }, [chatResult])

  useEffect(() => {
    if (!token) {
      setMe(null)
      setProfile(null)
      setIsAdmin(false)
      return
    }
    void loadProfile()
    void loadMyProfile()
    void loadAdminAccess()
  }, [token])

  useEffect(() => {
    if (page === 'mypage' && token && dashboard == null) {
      void loadMyDashboard()
    }
  }, [page, token, dashboard])

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
      setProfilePhone(data.phone_number ?? '')
      setProfileNewEmail('')
      setProfileCurrentPw('')
      setProfileNewPw('')
    } catch (error) {
      setMessage(`MyPage profile load error: ${(error as Error).message}`)
    }
  }

  async function loadAdminAccess() {
    try {
      const response = await fetch(`${API_BASE}/admin/summary`, { headers: authHeaders })
      setIsAdmin(response.ok)
    } catch {
      setIsAdmin(false)
    }
  }

  async function handleSignup(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setAccountNotice('')
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
      const data = (await response.json()) as UserOut
      setMessage(`회원가입 완료: ${data.email}`)
      setAccountNotice('회원가입이 완료되었습니다. 로그인해주세요.')
      setAccountMode('login')
    } catch (error) {
      setMessage(`회원가입 오류: ${(error as Error).message}`)
      setAccountNotice((error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setAccountNotice('')
    setMessage('Signing in...')
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      })
      if (!response.ok) {
        const errorMessage = await extractApiError(response)
        if (response.status === 401) {
          throw new Error('회원정보가 일치하지 않습니다.')
        }
        throw new Error(errorMessage)
      }
      const data = (await response.json()) as TokenResponse
      localStorage.setItem('access_token', data.access_token)
      setToken(data.access_token)
      setMessage(`로그인 완료. 토큰 만료 ${data.expires_in / 60}분`)
      setAccountNotice('')
      setPage('cbt')
    } catch (error) {
      setMessage(`로그인 오류: ${(error as Error).message}`)
      setAccountNotice((error as Error).message)
    } finally {
      setLoading(false)
    }
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
    if (assessment.phq9.some((v) => v === '')) return 'PHQ-9 문항을 모두 선택해주세요.'
    if (assessment.gad7.some((v) => v === '')) return 'GAD-7 문항을 모두 선택해주세요.'
    if (assessment.sleep.some((v) => v === '')) return '수면 문항을 모두 선택해주세요.'

    const contextValues = Object.values(assessment.context)
    if (contextValues.some((v) => v === '')) return '맥락 문항을 모두 선택해주세요.'

    return null
  }

  function collectInvalidQuestionKeys(): string[] {
    const keys: string[] = []
    assessment.phq9.forEach((value, index) => {
      if (value === '') keys.push(`phq-${index}`)
    })
    assessment.gad7.forEach((value, index) => {
      if (value === '') keys.push(`gad-${index}`)
    })
    assessment.sleep.forEach((value, index) => {
      if (value === '') keys.push(`sleep-${index}`)
    })
    if (assessment.context.daily_functioning === '') keys.push('ctx-daily_functioning')
    if (assessment.context.stressful_event === '') keys.push('ctx-stressful_event')
    if (assessment.context.social_support === '') keys.push('ctx-social_support')
    if (assessment.context.coping_skill === '') keys.push('ctx-coping_skill')
    if (assessment.context.motivation_for_change === '') keys.push('ctx-motivation_for_change')
    return keys
  }

  async function handleSurveySubmit(event: FormEvent) {
    event.preventDefault()
    const validationError = validateAssessment()
    if (validationError) {
      const nextInvalidKeys = collectInvalidQuestionKeys()
      setInvalidQuestionKeys(nextInvalidKeys)
      if (nextInvalidKeys.length > 0) {
        const targetId = `sa-q-${nextInvalidKeys[0]}`
        requestAnimationFrame(() => {
          document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        })
      }
      setMessage(validationError)
      return
    }

    setInvalidQuestionKeys([])
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

  async function handleSaveCbtCheckin() {
    if (!token) {
      setMessage('체크인 저장은 로그인 후 가능합니다.')
      return
    }
    if (!chatResult) {
      setMessage('먼저 CBT 응답을 받아 챌린지를 생성하세요.')
      return
    }
    if (cbtCheckinMood === '') {
      setMessage('체크인 기분 점수(1~10)를 입력하세요.')
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

    const completedCount = challengeChecks.filter(Boolean).length
    const totalCount = chatResult.suggested_challenges.length

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/checkins`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          mood_score: mood,
          sleep_hours: sleep,
          exercised: completedCount > 0,
          note: 'CBT challenge checkin',
          challenge_completed_count: completedCount,
          challenge_total_count: totalCount,
        }),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      await response.json()
      setMessage(`체크인 저장 완료 (챌린지 ${completedCount}/${totalCount})`)
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

  async function handleProfileSave(event: FormEvent) {
    event.preventDefault()
    if (!token) {
      setMessage('로그인 후 이용 가능합니다.')
      return
    }

    const payload: Record<string, string> = {}
    if (profile && profileNickname !== profile.nickname) payload.nickname = profileNickname
    if (profilePhone !== (profile?.phone_number ?? '')) payload.phone_number = profilePhone
    if (profileNewPw) {
      payload.current_password = profileCurrentPw
      payload.new_password = profileNewPw
    }
    if (profileNewEmail) payload.new_email = profileNewEmail

    if (Object.keys(payload).length === 0) {
      setMessage('변경된 값이 없습니다.')
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
      await loadMyProfile()
      await loadProfile()
      setMessage('회원정보가 수정되었습니다.')
    } catch (error) {
      setMessage(`회원정보 수정 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  const nickname = me?.nickname ?? '게스트'
  const highRiskProbability = checkPrediction == null ? 0 : (checkPrediction.probabilities['3'] ?? 0) + (checkPrediction.probabilities['4'] ?? 0)
  const contextTotal =
    Number(assessment.context.daily_functioning || 0) +
    Number(assessment.context.stressful_event || 0) +
    Number(assessment.context.social_support || 0) +
    Number(assessment.context.coping_skill || 0) +
    Number(assessment.context.motivation_for_change || 0)
  const latestWeekly = dashboard?.rows?.length ? dashboard.rows[dashboard.rows.length - 1] : null
  const diaryDays = dashboard?.rows?.length ?? 0
  const stressPercent = latestWeekly ? Math.round(latestWeekly.symptom_composite_pred_0_100) : 12
  const stressLabel = stressPercent <= 33 ? '낮음' : stressPercent <= 66 ? '중간' : '높음'
  const calmMinutes = latestWeekly ? Math.max(30, Math.round((100 - latestWeekly.ins_week_pred_0_100) * 1.5)) : 120

  return (
    <main className={`page ${page === 'cbt' ? 'page-cbt' : 'page-app'}`}>

      {page === 'assessment' && (
        <StitchAssessmentPage
          loading={loading}
          nickname={nickname}
          assessment={assessment}
          options={LIKERT_OPTIONS}
          phqQuestions={PHQ9_QUESTIONS}
          gadQuestions={GAD7_QUESTIONS}
          sleepQuestions={SLEEP_QUESTIONS}
          contextTotal={contextTotal}
          checkPrediction={checkPrediction}
          highRiskProbability={highRiskProbability}
          severityLabel={severityToKorean}
          invalidKeys={invalidQuestionKeys}
          onSubmit={handleSurveySubmit}
          onPhqChange={setPhqAnswer}
          onGadChange={setGadAnswer}
          onSleepChange={setSleepAnswer}
          onContextChange={setContextAnswer}
        />
      )}

      {page === 'cbt' && (
        <StitchCbtPage
          loading={loading}
          nickname={nickname}
          message={message}
          token={token}
          chatMessage={chatMessage}
          chatResult={chatResult}
          challengeChecks={challengeChecks}
          cbtCheckinMood={cbtCheckinMood}
          cbtCheckinSleep={cbtCheckinSleep}
          dashboard={dashboard}
          onSubmitChat={handleChatSubmit}
          onChatMessageChange={setChatMessage}
          onToggleChallenge={(index, checked) => {
            setChallengeChecks((prev) => {
              const next = [...prev]
              next[index] = checked
              return next
            })
          }}
          onMoodChange={setCbtCheckinMood}
          onSleepChange={setCbtCheckinSleep}
          onSaveCheckin={handleSaveCbtCheckin}
          onLoadDashboard={loadMyDashboard}
          onGoAssessment={() => setPage('assessment')}
          onGoBoard={() => setPage('board')}
          onGoMyPage={() => setPage('mypage')}
          onGoAccount={() => setPage('account')}
          onGoAdmin={() => setPage('admin')}
          isAdmin={isAdmin}
        />
      )}

      {page === 'mypage' && (
        <section className="mpv2Wrap">
          <header className="mpv2Head">
            <div>
              <h1>마이페이지</h1>
              <p>개인 정보와 활동 리포트를 관리하세요.</p>
            </div>
            <div className="mpv2Mood">편안함 (Feeling Calm)</div>
          </header>

          <div className="mpv2Grid">
            <section className="mpv2Main">
              <article className="mpv2Card">
                <h2>대시보드</h2>
                <div className="mpv2Stats">
                  <div className="mpv2StatBox">
                    <p className="k">최근 활동</p>
                    <strong>{diaryDays}일 연속 일기 작성</strong>
                    <span>활동 중</span>
                  </div>
                  <div className="mpv2StatBox">
                    <p className="k">스트레스 지수</p>
                    <strong>{stressLabel} ({stressPercent}%)</strong>
                    <div className="mpv2MiniBar"><i style={{ width: `${Math.min(100, stressPercent)}%` }} /></div>
                  </div>
                  <div className="mpv2StatBox">
                    <p className="k">마음 챙김 시간</p>
                    <strong>총 {calmMinutes}분</strong>
                    <span>이번 주 기준</span>
                  </div>
                </div>
              </article>

              <article className="mpv2Card mpv2Report">
                <div className="mpv2ReportTop">
                  <div>
                    <h2>요약 리포트</h2>
                    <p className="small">최근 심리 검사 결과 및 웰니스 데이터</p>
                  </div>
                  <button type="button" className="mpv2DarkBtn">PDF 다운로드</button>
                </div>
                <div className="mpv2ReportBody">
                  <div className="mpv2Insight">
                    <p className="label">정서적 안정감</p>
                    <div className="mpv2Bars">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i className="on" />
                    </div>
                    <p className="quote">
                      "최근 일주일 동안 정서적 상태를 잘 유지하고 계시네요.
                      긍정적인 감정의 빈도가 지난달 대비 증가했습니다."
                    </p>
                  </div>
                  <div className="mpv2GraphPlaceholder">
                    <span>WELLNESS GRAPH</span>
                  </div>
                </div>
              </article>
            </section>

            <aside className="mpv2Side">
              <article className="mpv2Card mpv2Profile">
                <h2>회원정보 수정</h2>
                <form onSubmit={handleProfileSave} className="form mpv2ProfileForm">
                  <label>
                    닉네임
                    <input value={profileNickname} onChange={(e) => setProfileNickname(e.target.value)} />
                  </label>
                  <label>
                    이메일 주소(변경 시 입력)
                    <input
                      value={profileNewEmail}
                      onChange={(e) => setProfileNewEmail(e.target.value)}
                      placeholder={profile?.email ?? 'you@example.com'}
                    />
                  </label>
                  <label>
                    전화번호
                    <input value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} placeholder="010-1234-5678" />
                  </label>

                  {showPasswordReset && (
                    <>
                      <label>
                        현재 비밀번호
                        <input type="password" value={profileCurrentPw} onChange={(e) => setProfileCurrentPw(e.target.value)} />
                      </label>
                      <label>
                        새 비밀번호
                        <input type="password" value={profileNewPw} onChange={(e) => setProfileNewPw(e.target.value)} />
                      </label>
                    </>
                  )}

                  <button className="mpv2DarkBtn" disabled={loading}>변경사항 저장하기</button>
                  <button
                    type="button"
                    className="mpv2LightBtn"
                    onClick={() => setShowPasswordReset((prev) => !prev)}
                  >
                    {showPasswordReset ? '비밀번호 재설정 닫기' : '비밀번호 재설정'}
                  </button>
                </form>
              </article>
            </aside>
          </div>
        </section>
      )}

      {page === 'account' && (
        <section className="accountShell">
          <article className="accountCard">
            <div className="accountLogo">✦</div>
            <h2>{accountMode === 'login' ? 'MonggleAI' : 'Create Account'}</h2>
            <p className="accountSub">{accountMode === 'login' ? 'YOUR MINDFUL SANCTUARY' : 'JOIN THE CAFE COMMUNITY'}</p>

            {accountMode === 'login' ? (
              <form onSubmit={handleLogin} className="form accountForm">
                <label>
                  EMAIL ADDRESS
                  <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required placeholder="hello@monggle.ai" />
                </label>
                <label>
                  PASSWORD
                  <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} minLength={8} required />
                </label>
                <button className="accountPrimary" disabled={loading}>Login</button>
                {accountNotice && accountMode === 'login' && <p className="small">{accountNotice}</p>}
              </form>
            ) : (
              <form onSubmit={handleSignup} className="form accountForm">
                <label>
                  EMAIL ADDRESS
                  <input value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required placeholder="you@example.com" />
                </label>
                <label>
                  PASSWORD
                  <input type="password" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} minLength={8} required />
                </label>
                <label>
                  NICKNAME
                  <input value={signupNickname} onChange={(e) => setSignupNickname(e.target.value)} required placeholder="Monggle User" />
                </label>
                <button className="accountPrimary" disabled={loading}>Create Account</button>
                {accountNotice && accountMode === 'signup' && <p className="small">{accountNotice}</p>}
              </form>
            )}

            <div className="accountDivider"><span>OR CONTINUE WITH</span></div>
            <button
              type="button"
              className="accountGhost"
              onClick={() => setAccountMode(accountMode === 'login' ? 'signup' : 'login')}
            >
              {accountMode === 'login' ? '회원가입하기' : '로그인하기'}
            </button>

            <p className="accountSwitch">
              {accountMode === 'login' ? (
                <>
                  New to the cafe?{' '}
                  <button type="button" className="accountLink" onClick={() => setAccountMode('signup')}>
                    회원가입하기
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button type="button" className="accountLink" onClick={() => setAccountMode('login')}>
                    Login
                  </button>
                </>
              )}
            </p>
            <p className="mono">API: {API_BASE}</p>
            {me && <p className="badge">Signed in as {me.nickname} ({me.email})</p>}
          </article>
        </section>
      )}

      {page === 'board' && (
        <BoardPage token={token} myUserId={me?.id ?? null} isAdmin={isAdmin} />
      )}

      {page === 'admin' && (
        <section className="panel">
          {!token ? (
            <p>로그인을 먼저 해주세요.</p>
          ) : !isAdmin ? (
            <p>관리자 계정이 아닙니다.</p>
          ) : (
            <AdminPage token={token} />
          )}
        </section>
      )}

      {page !== 'cbt' && (
        <footer className="globalDock">
          {!token && <button type="button" className={page === 'account' ? 'active' : ''} onClick={() => setPage('account')}>회원가입</button>}
          <button type="button" className={page === 'assessment' ? 'active' : ''} onClick={() => setPage('assessment')}>검사</button>
          <button type="button" onClick={() => setPage('cbt')}>채팅</button>
          <button type="button" className={page === 'board' ? 'active' : ''} onClick={() => setPage('board')}>게시판</button>
          <button type="button" className={page === 'mypage' ? 'active' : ''} onClick={() => setPage('mypage')}>My Page</button>
          {isAdmin && <button type="button" className={page === 'admin' ? 'active' : ''} onClick={() => setPage('admin')}>관리자</button>}
        </footer>
      )}

      {page !== 'cbt' && (
        <footer className="status">
          <span>{loading ? 'Working...' : 'Idle'}</span>
          <span>{message}</span>
        </footer>
      )}
    </main>
  )
}

export default App
