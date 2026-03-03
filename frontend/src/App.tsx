import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, RefObject } from 'react'
import './App.css'
import AdminPage from './pages/admin/AdminPage'
import BoardPage from './pages/board/BoardPage'
import CbtCrisisBanner from './components/CbtCrisisBanner'

type PageKey = 'landing' | 'account' | 'checkin' | 'dashboard' | 'diary' | 'journal' | 'challenge' | 'assessment' | 'board' | 'mypage' | 'admin'
type AccountMode = 'login' | 'signup' | 'reset'
type MyPageTab = 'profile' | 'report'
type DashboardTab = 'today' | 'risk' | 'weekly' | 'monthly'
type TestKey = 'PHQ' | 'GAD' | 'ISI'

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
type RiskLevel = 'low' | 'moderate' | 'high'
type AssessmentReportInput = {
  phq_score: number
  gad_score: number
  isi_score: number
  risk_level: RiskLevel
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
type ChatTurn = { role: ChatRole; content: string; loading?: boolean; createdAt?: number }
type ChatHistoryPayloadTurn = { role: ChatRole; content: string }

type ChatResponse = {
  reply: string
  session_id: string
  disclaimer: string
  timestamp: string
  cbt_phase?: 'EMOTION' | 'SITUATION' | 'THOUGHT' | 'DISTORTION' | 'REFRAME' | 'ACTION' | null
  next_phase?: 'EMOTION' | 'SITUATION' | 'THOUGHT' | 'DISTORTION' | 'REFRAME' | 'ACTION' | null
  extracted: {
    distress_0_10: number
    rumination_0_10: number
    avoidance_0_10: number
    sleep_difficulty_0_10: number
    distortion: Record<string, number>
    thought_web?: {
      situation: string
      thought: string
      emotion: Array<{ label: string; intensity_0_10: number }>
      sensation: string[]
      intermediate_belief: string
      core_belief: string
      core_experience_hint?: string | null
      cognitive_style: 'past_regret' | 'future_worry' | 'self_critical' | 'control_fixation' | 'over_responsibility'
      practice_point: string
    } | null
    suicide_risk_flag?: boolean
    intent_level?: 'none' | 'passive' | 'active'
    plan_means_flag?: boolean
    crisis_lock_remaining?: number
    crisis_stage?: 'A' | 'B' | 'C' | null
    crisis_hotline_count?: number
    crisis_template_index?: number
    violent_risk_flag?: boolean
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
  crisis_mode?: boolean
  crisis_level?: 'none' | 'moderate' | 'high'
  crisis_stage?: 'A' | 'B' | 'C' | null
  crisis_actions?: string[]
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

type TestProgress = {
  index: number
  answers: Array<number | null>
}

type AssessmentFlowState = Record<TestKey, TestProgress>

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

type MenuNavAction =
  | { type: 'page'; page: PageKey }
  | { type: 'account'; mode: AccountMode }
  | { type: 'logout' }

type MenuItem = {
  key: string
  label: string
  icon: string
  active: boolean
  action: MenuNavAction
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001'

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

const SLIDER_LABELS = ['전혀 없음', '며칠 동안', '일주일 이상', '거의 매일']

function initScoreArray(length: number): Array<number | null> {
  return Array.from({ length }, () => null)
}

const defaultAssessmentFlow: AssessmentFlowState = {
  PHQ: { index: 0, answers: initScoreArray(PHQ9_QUESTIONS.length) },
  GAD: { index: 0, answers: initScoreArray(GAD7_QUESTIONS.length) },
  ISI: { index: 0, answers: initScoreArray(SLEEP_QUESTIONS.length) },
}

const DUMMY_REPORT_DATA: AssessmentReportInput = {
  phq_score: 12,
  gad_score: 10,
  isi_score: 8,
  risk_level: 'moderate',
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

const CHAT_SESSION_STORAGE_KEY = 'mh_chat_session_id'

function createChatSessionId(): string {
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID()
  }
  const rand = Math.random().toString(16).slice(2).padEnd(12, '0')
  return `00000000-0000-4000-8000-${rand.slice(0, 12)}`
}

function calculateRiskLevel(phq: number, gad: number, isi: number): RiskLevel {
  if (phq >= 15 || gad >= 15 || isi >= 15) return 'high'
  if (phq >= 8 || gad >= 8 || isi >= 8) return 'moderate'
  return 'low'
}

function riskSummaryText(risk: RiskLevel): string {
  if (risk === 'high') return '전문적인 관리가 필요합니다.'
  if (risk === 'moderate') return '주의 깊은 관리가 필요합니다.'
  return '전반적으로 안정적인 상태입니다.'
}

function metricInterpretation(metric: 'PHQ-9' | 'GAD-7' | 'ISI', score: number): string {
  if (metric === 'PHQ-9') {
    if (score >= 15) return '우울 증상이 뚜렷하게 관찰됩니다. 에너지 저하와 자기비난이 반복될 수 있어요.'
    if (score >= 8) return '기분 저하가 누적되는 구간입니다. 수면·활동 리듬 관리가 중요합니다.'
    return '현재 우울 지표는 비교적 안정 범위입니다. 일상 루틴을 유지해 주세요.'
  }
  if (metric === 'GAD-7') {
    if (score >= 15) return '불안 긴장이 높은 상태입니다. 예측성 걱정과 신체 긴장이 동반될 수 있어요.'
    if (score >= 8) return '스트레스 반응이 증가한 상태입니다. 과호흡·반추 관리가 필요합니다.'
    return '불안 지표는 안정 범위에 가깝습니다. 과부하 신호만 주기적으로 점검해 주세요.'
  }
  if (score >= 15) return '수면 유지/입면 어려움이 심한 구간입니다. 수면 위생 루틴 강화가 필요합니다.'
  if (score >= 8) return '수면 회복력이 다소 떨어진 상태입니다. 취침 전 루틴을 일정하게 유지해 보세요.'
  return '수면 지표는 비교적 안정적입니다. 기상/취침 시간을 일정하게 가져가면 좋습니다.'
}

function ReportHeader({ riskLevel, reportDate }: { riskLevel: RiskLevel; reportDate: string }) {
  return (
    <header className="reportHeader">
      <div>
        <h3>검사 결과 분석 리포트</h3>
        <p className={`reportRiskBadge reportSummaryBadge ${riskLevel}`}>
          예측 결과: {riskLevel === 'high' ? '매우 높은 수준의 관리와 관심이 필요합니다.' : riskSummaryText(riskLevel)}
        </p>
      </div>
      <div className="reportHeaderRight">
        <span>{reportDate}</span>
        <button type="button" className="ghost">share</button>
      </div>
    </header>
  )
}

function ScoreGauge({
  label,
  value,
  max,
  accent = '#0f172a',
}: {
  label: string
  value: number
  max: number
  accent?: string
}) {
  const radius = 45
  const circumference = 2 * Math.PI * radius
  const pct = clampPercent((value / max) * 100)
  const dashOffset = circumference * (1 - pct / 100)
  return (
    <div className="reportGaugeItem">
      <div className="reportGaugeWrap">
        <svg viewBox="0 0 100 100" className="reportGaugeSvg" aria-hidden="true">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#E5E7EB" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={accent}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="reportGaugeRing"
          />
        </svg>
        <div className="reportGaugeCenter">
          <span>{value}</span>
          <small>{label}</small>
        </div>
      </div>
      <p>{label === 'PHQ-9' ? '우울' : label === 'GAD-7' ? '불안' : '불면'}</p>
    </div>
  )
}

function TripleGaugeSection({ phqScore, gadScore, isiScore }: { phqScore: number; gadScore: number; isiScore: number }) {
  return (
    <div className="reportGaugeGroup">
      <ScoreGauge label="PHQ-9" value={phqScore} max={27} />
      <ScoreGauge label="GAD-7" value={gadScore} max={21} />
      <ScoreGauge label="ISI" value={isiScore} max={21} accent="#B8FFA9" />
    </div>
  )
}

function OverallAnalysisCard({ riskLevel, phqScore, gadScore, isiScore }: { riskLevel: RiskLevel; phqScore: number; gadScore: number; isiScore: number }) {
  const normalizedAverage = ((phqScore / 27) + (gadScore / 21) + (isiScore / 21)) / 3
  const mentalEnergy = Math.max(0, Math.round((1 - normalizedAverage) * 100))
  const riskLabel = riskLevel === 'high' ? '고위험군' : riskLevel === 'moderate' ? '중등도 위험' : '안정군'
  return (
    <section className="reportOverallCard">
      <div>
        <h4>종합 멘탈 밸런스</h4>
        <p className="reportOverallText">
          현재 우울, 불안, 불면 지표를 종합하면 지속적인 관리가 필요합니다.
          특히 수면 회복을 먼저 개선하면 정서 안정에 도움됩니다.
        </p>
      </div>
      <div className="reportOverallBottom">
        <div className="reportRiskBlock">
          <p>종합 위험도</p>
          <strong>{riskLabel}</strong>
        </div>
        <div className="reportEnergyCard">
          <span>심리 에너지</span>
          <strong>{mentalEnergy}%</strong>
        </div>
      </div>
    </section>
  )
}

function MetricCard({ title, score, maxScore }: { title: 'PHQ-9' | 'GAD-7' | 'ISI'; score: number; maxScore: number }) {
  const risk = calculateRiskLevel(title === 'PHQ-9' ? score : 0, title === 'GAD-7' ? score : 0, title === 'ISI' ? score : 0)
  const label = risk === 'high' ? '고위험군' : risk === 'moderate' ? '중등도 위험' : '안정군'
  return (
    <article className="reportMetricCard">
      <div className="reportMetricHead">
        <div>
          <h5>{title}</h5>
          <p>{title === 'PHQ-9' ? '우울 지표' : title === 'GAD-7' ? '불안 지표' : '불면 지표'}</p>
        </div>
        <div className="reportMetricValue">{score}</div>
      </div>
      <span className={`reportRiskBadge ${risk}`}>{label}</span>
      <p className="reportMetricText">{metricInterpretation(title, score)}</p>
      <small className="reportMetricScale">최대 점수 {maxScore}</small>
    </article>
  )
}

function ConsultationCTA({ riskLevel, onClick }: { riskLevel: RiskLevel; onClick: () => void }) {
  return (
    <div className="reportCtaWrap">
      <button
        type="button"
        className={riskLevel === 'high' ? 'reportCtaBtn high' : 'reportCtaBtn'}
        onClick={onClick}
      >
        전문가와 상담하기
      </button>
      <p className="reportCtaCaption">
        본 리포트는 인공지능 분석 결과이며, 정확한 진단은 전문의 상담이 필요합니다.
      </p>
    </div>
  )
}

function AssessmentReportPage({
  data,
  reportDate,
  onConsult,
}: {
  data: AssessmentReportInput
  reportDate: string
  onConsult: () => void
}) {
  return (
    <section className="reportPage">
      <ReportHeader riskLevel={data.risk_level} reportDate={reportDate} />
      <div className="reportTopIntro">
        <div className="assessmentHelperBubble">
          <div className="assessmentHelperAvatar">M</div>
          <p>분석 결과가 나왔어요. 함께 차근차근 살펴볼까요?</p>
        </div>
      </div>
      <div className="reportTopPanel">
        <TripleGaugeSection phqScore={data.phq_score} gadScore={data.gad_score} isiScore={data.isi_score} />
        <OverallAnalysisCard
          riskLevel={data.risk_level}
          phqScore={data.phq_score}
          gadScore={data.gad_score}
          isiScore={data.isi_score}
        />
      </div>
      <div className="reportMetricGrid">
        <MetricCard title="PHQ-9" score={data.phq_score} maxScore={27} />
        <MetricCard title="GAD-7" score={data.gad_score} maxScore={21} />
        <MetricCard title="ISI" score={data.isi_score} maxScore={21} />
      </div>
      <ConsultationCTA riskLevel={data.risk_level} onClick={onConsult} />
    </section>
  )
}

function clampPercent(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function AppHeader({
  menuOpen,
  isDesktop,
  menuItems,
  onMenuItemSelect,
  menuContainerRef,
  onWrapperEnter,
  onWrapperLeave,
  onTriggerClick,
  onDropdownEnter,
  onDropdownLeave,
}: {
  menuOpen: boolean
  isDesktop: boolean
  menuItems: MenuItem[]
  onMenuItemSelect: (item: MenuItem) => void
  menuContainerRef: RefObject<HTMLDivElement | null>
  onWrapperEnter: () => void
  onWrapperLeave: () => void
  onTriggerClick: () => void
  onDropdownEnter: () => void
  onDropdownLeave: () => void
}) {
  return (
    <header className="appHeader" aria-label="앱 헤더">
      <div
        ref={menuContainerRef}
        className="topRightMenu"
        onMouseEnter={onWrapperEnter}
        onMouseLeave={onWrapperLeave}
      >
        <button
          type="button"
          className={`menuTrigger ${menuOpen ? 'open' : ''}`}
          aria-label="메뉴 열기"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={onTriggerClick}
        >
          ☰
        </button>
        {menuOpen && (
          <>
            {isDesktop && <div className="menuHoverBridge" aria-hidden />}
            <div
              className="topRightDropdown"
              role="menu"
              aria-label="주요 메뉴"
              onMouseEnter={onDropdownEnter}
              onMouseLeave={onDropdownLeave}
            >
              {menuItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  aria-label={item.label}
                  className={`menuItem ${item.active ? 'active' : ''}`}
                  onClick={() => onMenuItemSelect(item)}
                >
                  <span className="menuItemIcon" aria-hidden>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </header>
  )
}

function pickCheckinHeadlineByMood(moodScore: number): string {
  const high = [
    '오늘 하루도 활기차게 시작해볼까요?',
    '좋은 흐름이에요. 이 에너지를 잘 이어가봐요.',
    '컨디션이 괜찮아 보여요. 리듬을 유지해볼까요?',
  ]
  const mid = [
    '오늘 페이스를 천천히 맞춰가볼까요?',
    '지금 상태면 작은 루틴 하나가 큰 도움이 돼요.',
    '무리하지 않고, 할 수 있는 것부터 시작해봐요.',
  ]
  const low = [
    '지금은 속도를 늦추고 호흡부터 맞춰봐요.',
    '오늘은 버티는 것만으로도 충분히 잘하고 있어요.',
    '작은 행동 하나만 해도 흐름이 바뀔 수 있어요.',
  ]
  const pool = moodScore >= 8 ? high : moodScore >= 5 ? mid : low
  return pool[Math.floor(Math.random() * pool.length)] ?? '오늘 하루도 활기차게 시작해볼까요?'
}

function CheckinRing({
  label,
  valueText,
  percent,
  color,
}: {
  label: string
  valueText: string
  percent: number
  color: string
}) {
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const normalized = clampPercent(percent)
  const offset = circumference * (1 - normalized / 100)
  return (
    <div className="checkinRingCard">
      <svg viewBox="0 0 72 72" className="checkinRingSvg" aria-hidden="true">
        <circle cx="36" cy="36" r={radius} className="checkinRingTrack" />
        <circle
          cx="36"
          cy="36"
          r={radius}
          className="checkinRingProgress"
          style={{
            stroke: color,
            strokeDasharray: `${circumference} ${circumference}`,
            strokeDashoffset: offset,
          }}
        />
      </svg>
      <div className="checkinRingCenter">
        <strong>{valueText}</strong>
      </div>
      <p>{label}</p>
    </div>
  )
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

function buildPayloadFromFlow(flow: AssessmentFlowState): CheckPredictRequest {
  const phqTotal = flow.PHQ.answers.reduce<number>((acc, v) => acc + Number(v ?? 0), 0)
  const gadTotal = flow.GAD.answers.reduce<number>((acc, v) => acc + Number(v ?? 0), 0)
  const sleepTotal = flow.ISI.answers.reduce<number>((acc, v) => acc + Number(v ?? 0), 0)
  const daily = 0
  const stressful = 0
  const social = 0
  const coping = 0
  const motivation = 0
  const contextRisk = 0

  return {
    phq_total: phqTotal,
    gad_total: gadTotal,
    sleep_total: sleepTotal,
    context_risk_total: contextRisk,
    phq9_suicidal_ideation: Number(flow.PHQ.answers[8] ?? 0),
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
  const [page, setPage] = useState<PageKey>('account')
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

  const [assessmentFlow, setAssessmentFlow] = useState<AssessmentFlowState>(defaultAssessmentFlow)
  const [assessmentErrors, setAssessmentErrors] = useState<Record<TestKey, boolean>>({
    PHQ: false,
    GAD: false,
    ISI: false,
  })
  const [checkPrediction, setCheckPrediction] = useState<CheckPredictResponse | null>(null)

  const [checkin, setCheckin] = useState<LifestyleCheckinState>(defaultCheckin)
  const [checkinCompletedToday, setCheckinCompletedToday] = useState(false)
  const [checkinSummaryText, setCheckinSummaryText] = useState('')
  const [checkinDoneHeadline, setCheckinDoneHeadline] = useState('오늘 하루도 활기차게 시작해볼까요?')
  const [autoCbtStarted, setAutoCbtStarted] = useState(false)

  const [chatMessage, setChatMessage] = useState('')
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([])
  const [chatSearchQuery, setChatSearchQuery] = useState('')
  const [chatResult, setChatResult] = useState<ChatResponse | null>(null)
  const [chatSessionId, setChatSessionId] = useState<string>(() => {
    const saved = typeof window !== 'undefined' ? window.sessionStorage.getItem(CHAT_SESSION_STORAGE_KEY) : ''
    if (saved && /^[0-9a-fA-F-]{36}$/.test(saved)) return saved
    return createChatSessionId()
  })
  const [activeChallenge, setActiveChallenge] = useState('')
  const [challengePhase, setChallengePhase] = useState<'start' | 'continue' | 'reflect'>('continue')
  const [challengeStatus, setChallengeStatus] = useState<Record<string, boolean>>({})
  const [chatGenerating, setChatGenerating] = useState(false)
  const [challengeHintText, setChallengeHintText] = useState('')
  const [chatChallengeCtaDismissed, setChatChallengeCtaDismissed] = useState(false)
  const [dialogueFinishedOpen, setDialogueFinishedOpen] = useState(false)
  const [crisisActionChecked, setCrisisActionChecked] = useState<Record<string, boolean>>({})
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
  const [selectedJournalEntry, setSelectedJournalEntry] = useState<JournalEntry | null>(null)
  const [selectedJournalEditing, setSelectedJournalEditing] = useState(false)
  const [selectedJournalTitleDraft, setSelectedJournalTitleDraft] = useState('')
  const [selectedJournalContentDraft, setSelectedJournalContentDraft] = useState('')

  const chatMessagesRef = useRef<HTMLDivElement | null>(null)
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null)
  const chatSubmitLockRef = useRef(false)
  const pageHistorySyncReadyRef = useRef(false)
  const isPopNavigatingRef = useRef(false)
  const topRightMenuRef = useRef<HTMLDivElement | null>(null)
  const closeMenuTimerRef = useRef<number | null>(null)
  const [topMenuOpen, setTopMenuOpen] = useState(false)
  const [menuPinnedByClick, setMenuPinnedByClick] = useState(false)
  const [isDesktopMenu, setIsDesktopMenu] = useState<boolean>(() => window.innerWidth >= 768)

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
  const crisisActionKey = useMemo(
    () => `${chatResult?.timestamp ?? ''}:${chatResult?.crisis_stage ?? ''}:${(chatResult?.crisis_actions ?? []).join('|')}`,
    [chatResult?.timestamp, chatResult?.crisis_stage, chatResult?.crisis_actions],
  )

  useEffect(() => {
    window.sessionStorage.setItem(CHAT_SESSION_STORAGE_KEY, chatSessionId)
  }, [chatSessionId])

  useEffect(() => {
    setCrisisActionChecked({})
  }, [crisisActionKey])

  useEffect(() => {
    if (!token) {
      setMe(null)
      setProfile(null)
      setIsAdmin(false)
      setCheckinCompletedToday(false)
      setCheckinSummaryText('')
      setAutoCbtStarted(false)
      setRecommendedPosts([])
      setChatSessionId(createChatSessionId())
      setPage('account')
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
    window.history.replaceState({ appPage: page, accountMode }, '')
    pageHistorySyncReadyRef.current = true
  }, [])

  useEffect(() => {
    if (!pageHistorySyncReadyRef.current) return
    if (isPopNavigatingRef.current) {
      isPopNavigatingRef.current = false
      return
    }
    const current = window.history.state as { appPage?: PageKey; accountMode?: AccountMode } | null
    if (current?.appPage === page && current?.accountMode === accountMode) return
    window.history.pushState({ appPage: page, accountMode }, '')
  }, [page, accountMode])

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const next = event.state as { appPage?: PageKey; accountMode?: AccountMode } | null
      if (!next?.appPage) return
      isPopNavigatingRef.current = true
      setPage(next.appPage)
      if (next.accountMode) setAccountMode(next.accountMode)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    const handleResize = () => setIsDesktopMenu(window.innerWidth >= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (!topRightMenuRef.current) return
      const target = event.target as Node | null
      if (target && !topRightMenuRef.current.contains(target)) {
        if (closeMenuTimerRef.current != null) {
          window.clearTimeout(closeMenuTimerRef.current)
          closeMenuTimerRef.current = null
        }
        setMenuPinnedByClick(false)
        setTopMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('touchstart', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('touchstart', handleOutsideClick)
    }
  }, [])

  useEffect(() => {
    const handleEsc = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (closeMenuTimerRef.current != null) {
          window.clearTimeout(closeMenuTimerRef.current)
          closeMenuTimerRef.current = null
        }
        setMenuPinnedByClick(false)
        setTopMenuOpen(false)
      }
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [])

  useEffect(() => () => {
    if (closeMenuTimerRef.current != null) {
      window.clearTimeout(closeMenuTimerRef.current)
      closeMenuTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!chatResult) return
    setChatChallengeCtaDismissed(false)
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
      .map((turn) => ({ role: turn.role, content: turn.content.trim().slice(0, 1200) }))
      .filter((turn) => turn.content.length > 0)
      .slice(-12)
  }

  function exportRecentChatHistory() {
    const now = Date.now()
    const oneHourAgo = now - (60 * 60 * 1000)
    const rows = chatHistory.filter((turn) => {
      if (turn.loading) return false
      if (!turn.content.trim()) return false
      const t = turn.createdAt ?? 0
      return t >= oneHourAgo
    })

    if (!rows.length) {
      setMessage('최근 1시간 내 추출할 대화가 없습니다.')
      return
    }

    const lines = rows.map((turn) => {
      const stamp = new Date(turn.createdAt ?? now).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      const speaker = turn.role === 'user' ? '사용자' : '모치AI'
      return `[${stamp}] ${speaker}: ${turn.content.replace(/\n/g, ' ').trim()}`
    })

    const header = `MochiAI CBT 대화 추출 (최근 1시간)\n생성시각: ${new Date(now).toLocaleString('ko-KR')}\n\n`
    const blob = new Blob([header + lines.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const dt = new Date(now)
    const filename = `cbt_history_${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}_${String(dt.getHours()).padStart(2, '0')}${String(dt.getMinutes()).padStart(2, '0')}.txt`
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
    setMessage('최근 1시간 대화를 텍스트로 추출했습니다.')
  }

  async function sendSupporterCrisisMessage() {
    const text = "지금 위험해서 도움이 필요해. 가능하면 지금 바로 연락해줘."
    try {
      await navigator.clipboard.writeText(text)
      setMessage('지지자에게 보낼 문구를 복사했습니다.')
    } catch {
      setMessage('복사에 실패했습니다. 직접 전송해 주세요: 지금 위험해서 도움이 필요해.')
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
      if (todayRecord) {
        const summary = [
          `기분 ${todayRecord.mood_score}/10`,
          todayRecord.sleep_hours != null ? `수면 ${todayRecord.sleep_hours}시간` : null,
          todayRecord.exercise_minutes_today != null ? `운동 ${todayRecord.exercise_minutes_today}분` : null,
          todayRecord.daylight_minutes_today != null ? `햇빛 ${todayRecord.daylight_minutes_today}분` : null,
          todayRecord.screen_time_min_today != null ? `스크린 ${todayRecord.screen_time_min_today}분` : null,
        ].filter(Boolean).join(', ')
        setCheckinSummaryText(summary)
        setCheckinDoneHeadline(pickCheckinHeadlineByMood(Number(todayRecord.mood_score || 0)))
      } else {
        setCheckinSummaryText('')
        setCheckinDoneHeadline('오늘 하루도 활기차게 시작해볼까요?')
      }
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
      const items = data.items ?? []
      setJournalEntries(items)
      if (selectedJournalEntry && !items.some((x) => x.id === selectedJournalEntry.id)) {
        setSelectedJournalEntry(null)
      }
    } catch (error) {
      setMessage(`일기 도서관 조회 오류: ${(error as Error).message}`)
    }
  }

  async function handleOpenJournalEntry(entryId: string) {
    if (!token) return
    try {
      const response = await fetch(`${API_BASE}/journals/${entryId}`, { headers: authHeaders })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as JournalEntry
      setSelectedJournalEntry(data)
      setSelectedJournalEditing(false)
      setSelectedJournalTitleDraft(data.title)
      setSelectedJournalContentDraft(data.content)
      setMessage('')
    } catch (error) {
      setMessage(`일기 조회 오류: ${(error as Error).message}`)
    }
  }

  async function handleToggleSelectedJournalEdit() {
    if (!token || !selectedJournalEntry) return
    if (!selectedJournalEditing) {
      setSelectedJournalTitleDraft(selectedJournalEntry.title)
      setSelectedJournalContentDraft(selectedJournalEntry.content)
      setSelectedJournalEditing(true)
      return
    }

    if (!selectedJournalContentDraft.trim()) {
      setMessage('일기 내용을 입력해주세요.')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/journals`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          entry_date: selectedJournalEntry.entry_date,
          title: selectedJournalTitleDraft.trim() || '오늘의 일기',
          content: selectedJournalContentDraft.trim(),
          checkin_snapshot: selectedJournalEntry.checkin_snapshot ?? {},
          cbt_summary: selectedJournalEntry.cbt_summary ?? {},
          activity_challenges: selectedJournalEntry.activity_challenges ?? [],
        }),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      const updated = (await response.json()) as JournalEntry
      setSelectedJournalEntry(updated)
      setJournalEntries((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      setSelectedJournalEditing(false)
      setMessage('수정된 일기를 저장했습니다.')
    } catch (error) {
      setMessage(`일기 수정 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
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

  function getTestMeta(key: TestKey) {
    if (key === 'PHQ') return { title: 'PHQ-9', questions: PHQ9_QUESTIONS }
    if (key === 'GAD') return { title: 'GAD-7', questions: GAD7_QUESTIONS }
    return { title: 'ISI', questions: SLEEP_QUESTIONS }
  }

  function setTestAnswer(key: TestKey, value: number) {
    setAssessmentFlow((prev) => {
      const current = prev[key]
      const nextAnswers = [...current.answers]
      nextAnswers[current.index] = value
      return { ...prev, [key]: { ...current, answers: nextAnswers } }
    })
    setAssessmentErrors((prev) => ({ ...prev, [key]: false }))
  }

  function moveTestIndex(key: TestKey, dir: -1 | 1) {
    setAssessmentFlow((prev) => {
      const current = prev[key]
      const max = current.answers.length - 1
      const nextIndex = Math.max(0, Math.min(max, current.index + dir))
      return { ...prev, [key]: { ...current, index: nextIndex } }
    })
  }

  function setTestIndex(key: TestKey, index: number) {
    setAssessmentFlow((prev) => {
      const current = prev[key]
      const max = current.answers.length - 1
      const nextIndex = Math.max(0, Math.min(max, index))
      return { ...prev, [key]: { ...current, index: nextIndex } }
    })
  }

  function handleNextQuestion(key: TestKey) {
    const current = assessmentFlow[key]
    if (current.answers[current.index] == null) {
      setAssessmentErrors((prev) => ({ ...prev, [key]: true }))
      setMessage(`${getTestMeta(key).title} 현재 문항 점수를 먼저 선택해주세요.`)
      return
    }
    moveTestIndex(key, 1)
  }

  function isTestCompleted(key: TestKey): boolean {
    return assessmentFlow[key].answers.every((v) => v != null)
  }

  function validateAssessmentFlow(): string | null {
    const testOrder: TestKey[] = ['PHQ', 'GAD', 'ISI']
    const missing: TestKey[] = testOrder.filter((key) => !isTestCompleted(key))
    if (missing.length === 0) return null
    setAssessmentErrors({
      PHQ: missing.includes('PHQ'),
      GAD: missing.includes('GAD'),
      ISI: missing.includes('ISI'),
    })
    const first = missing[0]
    if (first === 'PHQ') return 'PHQ를 먼저 완료해주세요.'
    if (first === 'GAD') return 'GAD를 먼저 완료해주세요.'
    return 'ISI를 먼저 완료해주세요.'
  }

  async function handleSurveySubmit(event: FormEvent) {
    event.preventDefault()
    const err = validateAssessmentFlow()
    if (err) {
      setMessage(err)
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/ai/check/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayloadFromFlow(assessmentFlow)),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as CheckPredictResponse
      setCheckPrediction(data)

      if (token) {
        const answers = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`q${i + 1}`, Number(assessmentFlow.PHQ.answers[i] ?? 0)]))
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
      setCheckinDoneHeadline(pickCheckinHeadlineByMood(mood))
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
          session_id: chatSessionId,
          conversation_history: [],
        }),
      })
      if (!response.ok) throw new Error(await extractApiError(response))
      const data = (await response.json()) as ChatResponse
      if (data.session_id) setChatSessionId(data.session_id)
      setChatResult(data)
      setChatHistory([{ role: 'assistant', content: data.reply, createdAt: Date.now() }])
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
          const createdAt = next[i].createdAt ?? Date.now()
          next[i] = isDraft
            ? { role: 'assistant', content, loading: true, createdAt }
            : { role: 'assistant', content, createdAt }
          return next
        }
      }
      const createdAt = Date.now()
      const appended: ChatTurn[] = [...prev, isDraft ? { role: 'assistant', content, loading: true, createdAt } : { role: 'assistant', content, createdAt }]
      return appended
    })
  }

  async function handleChatSubmit(event: FormEvent) {
    event.preventDefault()
    await submitChatMessage()
  }

  async function submitChatMessage() {
    if (chatSubmitLockRef.current) return
    if (!token) {
      setMessage('로그인 후 인지행동치료 대화를 사용할 수 있습니다.')
      return
    }

    const text = chatMessage.trim().slice(0, 1200)
    if (!text) {
      setMessage('대화 내용을 입력해주세요.')
      return
    }

    chatSubmitLockRef.current = true
    const history = toChatHistoryPayload(chatHistory.filter((turn) => !turn.loading))
    const userTurnTime = Date.now()
    setChatHistory((prev) => [
      ...prev.filter((turn) => !turn.loading),
      { role: 'user', content: text, createdAt: userTurnTime },
      { role: 'assistant', content: '', loading: true, createdAt: userTurnTime },
    ])
    setChatMessage('')
    setLoading(true)
    setChatGenerating(true)

    try {
      const payload: Record<string, unknown> = {
        message: text,
        session_id: chatSessionId,
        conversation_history: history,
      }
      const cbtPhase = chatResult?.next_phase ?? chatResult?.cbt_phase
      if (cbtPhase) payload.cbt_phase = cbtPhase
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
      if (data.session_id) setChatSessionId(data.session_id)

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

      setMessage('')
    } catch (error) {
      setChatHistory((prev) => prev.filter((turn) => !turn.loading))
      setMessage(`인지행동치료 대화 오류: ${(error as Error).message}`)
    } finally {
      setLoading(false)
      setChatGenerating(false)
      chatSubmitLockRef.current = false
    }
  }

  function handleChatTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter') return
    if (event.shiftKey) return
    if (event.nativeEvent.isComposing) return
    event.preventDefault()
    void submitChatMessage()
  }

  function startChallenge(challenge: string) {
    setActiveChallenge(challenge)
    setChallengePhase('start')
    setChallengeStatus((prev) => ({ ...prev, [challenge]: prev[challenge] ?? false }))
    setChallengeHintText('선택한 생각 정리 도구를 단계별로 진행합니다. 사실-감정-생각 순서로 적어주세요.')
    setChatHistory((prev) => [...prev, { role: 'assistant', content: `좋아요. '${challenge}'를 함께 진행해볼게요. 먼저 상황에서 확인 가능한 사실 1가지를 적어주세요. 그 다음 감정과 생각을 함께 정리해볼게요.`, createdAt: Date.now() }])
  }

  function startSuggestedChallengeNow() {
    const first = (chatResult?.suggested_challenges ?? [])[0]
    if (!first) return
    startChallenge(first)
    setChatChallengeCtaDismissed(true)
  }

  function dismissSuggestedChallengeCta() {
    setChatChallengeCtaDismissed(true)
    setMessage('지금은 보류하고, 원할 때 챌린지를 시작할 수 있어요.')
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

    const targetDate = todayDateString()
    const todayLogs = contentLogs
      .filter((x) => x.performed_date === targetDate)
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
          entry_date: targetDate,
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

  const phqTotal = assessmentFlow.PHQ.answers.reduce<number>((acc, v) => acc + Number(v ?? 0), 0)
  const gadTotal = assessmentFlow.GAD.answers.reduce<number>((acc, v) => acc + Number(v ?? 0), 0)
  const sleepTotal = assessmentFlow.ISI.answers.reduce<number>((acc, v) => acc + Number(v ?? 0), 0)
  const assessmentTotalQuestions = PHQ9_QUESTIONS.length + GAD7_QUESTIONS.length + SLEEP_QUESTIONS.length
  const assessmentAnswered = [...assessmentFlow.PHQ.answers, ...assessmentFlow.GAD.answers, ...assessmentFlow.ISI.answers].filter((v) => v != null).length
  const assessmentProgress = Math.round((assessmentAnswered / Math.max(1, assessmentTotalQuestions)) * 100)
  const assessmentAllCompleted = isTestCompleted('PHQ') && isTestCompleted('GAD') && isTestCompleted('ISI')
  const assessmentGuideText = !isTestCompleted('PHQ')
    ? 'PHQ를 먼저 완료해주세요.'
    : !isTestCompleted('GAD')
      ? 'GAD를 먼저 완료해주세요.'
      : !isTestCompleted('ISI')
        ? 'ISI를 먼저 완료해주세요.'
        : '세 가지 검사가 모두 완료되었습니다.'
  const reportRiskLevel = calculateRiskLevel(phqTotal, gadTotal, sleepTotal)
  const reportData: AssessmentReportInput = checkPrediction
    ? { phq_score: phqTotal, gad_score: gadTotal, isi_score: sleepTotal, risk_level: reportRiskLevel }
    : DUMMY_REPORT_DATA
  const reportDate = new Date().toLocaleDateString('ko-KR')

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
  const thoughtWeb = chatResult?.extracted?.thought_web ?? null
  const normalizeSearchText = useCallback((text: string) => text.toLowerCase().replace(/\s+/g, ''), [])
  const filteredChatHistory = useMemo(() => {
    const q = normalizeSearchText(chatSearchQuery.trim())
    if (!q) return chatHistory
    return chatHistory.filter((turn) => normalizeSearchText(turn.content).includes(q))
  }, [chatHistory, chatSearchQuery, normalizeSearchText])
  const todayCheckinRecord = useMemo(() => {
    const today = todayDateString()
    return checkinHistory.find((x) => x.timestamp.slice(0, 10) === today) ?? null
  }, [checkinHistory])
  const checkinVisualMetrics = useMemo(() => {
    const mood = Number(todayCheckinRecord?.mood_score ?? checkin.mood_score ?? 0)
    const sleep = Number(todayCheckinRecord?.sleep_hours ?? checkin.sleep_hours ?? 0)
    const exercise = Number(todayCheckinRecord?.exercise_minutes_today ?? checkin.exercise_minutes_today ?? 0)
    const daylight = Number(todayCheckinRecord?.daylight_minutes_today ?? checkin.daylight_minutes_today ?? 0)
    const screen = Number(todayCheckinRecord?.screen_time_min_today ?? checkin.screen_time_min_today ?? 0)
    return [
      { key: 'mood', label: '기분 점수', valueText: `${Number.isFinite(mood) ? mood : 0}/10`, percent: clampPercent(((Number.isFinite(mood) ? mood : 0) / 10) * 100), color: '#76d46f' },
      { key: 'sleep', label: '수면 시간', valueText: `${Number.isFinite(sleep) ? sleep : 0}h`, percent: clampPercent(((Number.isFinite(sleep) ? sleep : 0) / 8) * 100), color: '#9d8cf5' },
      { key: 'exercise', label: '운동', valueText: `${Number.isFinite(exercise) ? exercise : 0}m`, percent: clampPercent(((Number.isFinite(exercise) ? exercise : 0) / 60) * 100), color: '#63b3ff' },
      { key: 'daylight', label: '햇빛', valueText: `${Number.isFinite(daylight) ? daylight : 0}m`, percent: clampPercent(((Number.isFinite(daylight) ? daylight : 0) / 60) * 100), color: '#f3b44f' },
      { key: 'screen', label: '스크린 균형', valueText: `${Number.isFinite(screen) ? screen : 0}m`, percent: clampPercent(100 - (((Number.isFinite(screen) ? screen : 0) / 240) * 100)), color: '#4b5563' },
    ]
  }, [todayCheckinRecord, checkin])
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

  const todayJournalEntry = useMemo(() => journalEntries.find((x) => x.entry_date === todayDateString()) ?? null, [journalEntries])
  const moodFallbackRisk = todayCheckinRecord?.mood_score != null
    ? Math.max(0, Math.min(100, (10 - Number(todayCheckinRecord.mood_score)) * 10))
    : null
  const sleepFallbackRisk = todayCheckinRecord?.sleep_hours != null
    ? Math.max(0, Math.min(100, (Math.abs(Number(todayCheckinRecord.sleep_hours) - 7.5) / 4.5) * 100))
    : null
  const diaryDep = Math.round(latestWeekly?.dep_week_pred_0_100 ?? moodFallbackRisk ?? 55)
  const diaryAnx = Math.round(latestWeekly?.anx_week_pred_0_100 ?? moodFallbackRisk ?? 55)
  const diaryIns = Math.round(latestWeekly?.ins_week_pred_0_100 ?? sleepFallbackRisk ?? 55)
  const diaryRiskLabel = (latestWeekly?.alert_level ?? 'low') === 'high' ? 'HIGH RISK' : (latestWeekly?.alert_level ?? 'low') === 'medium' ? 'MEDIUM RISK' : 'LOW RISK'

  const topMenuItems = useMemo<MenuItem[]>(() => {
    if (!token) {
      return [
        { key: 'menu-login', label: '로그인', icon: '🔐', active: page === 'account' && accountMode === 'login', action: { type: 'account', mode: 'login' } },
        { key: 'menu-signup', label: '회원가입', icon: '📝', active: page === 'account' && accountMode === 'signup', action: { type: 'account', mode: 'signup' } },
      ]
    }

    const items: MenuItem[] = [
      { key: 'menu-checkin', label: '체크인', icon: '🏠', active: page === 'checkin', action: { type: 'page', page: 'checkin' } },
      { key: 'menu-mypage', label: '마이페이지', icon: '👤', active: page === 'mypage', action: { type: 'page', page: 'mypage' } },
      { key: 'menu-diary', label: '마음일기', icon: '💬', active: page === 'diary', action: { type: 'page', page: 'diary' } },
      { key: 'menu-journal', label: '일기', icon: '📓', active: page === 'journal', action: { type: 'page', page: 'journal' } },
      { key: 'menu-challenge', label: '챌린지', icon: '🎯', active: page === 'challenge', action: { type: 'page', page: 'challenge' } },
      { key: 'menu-assessment', label: '종합심리검사', icon: '📊', active: page === 'assessment', action: { type: 'page', page: 'assessment' } },
      { key: 'menu-board', label: '게시판', icon: '🧾', active: page === 'board', action: { type: 'page', page: 'board' } },
    ]
    if (isAdmin) {
      items.push({ key: 'menu-admin', label: '관리자', icon: '🛡', active: page === 'admin', action: { type: 'page', page: 'admin' } })
    }
    items.push({ key: 'menu-logout', label: '로그아웃', icon: '↩', active: false, action: { type: 'logout' } })
    return items
  }, [token, page, accountMode, isAdmin])

  function handleTopMenuItemSelect(item: MenuItem) {
    if (closeMenuTimerRef.current != null) {
      window.clearTimeout(closeMenuTimerRef.current)
      closeMenuTimerRef.current = null
    }
    setMenuPinnedByClick(false)
    if (item.action.type === 'logout') {
      logout()
      setTopMenuOpen(false)
      return
    }
    if (item.action.type === 'account') {
      setPage('account')
      setAccountMode(item.action.mode)
      setTopMenuOpen(false)
      return
    }
    setPage(item.action.page)
    setTopMenuOpen(false)
  }

  function clearMenuCloseTimer() {
    if (closeMenuTimerRef.current != null) {
      window.clearTimeout(closeMenuTimerRef.current)
      closeMenuTimerRef.current = null
    }
  }

  function openTopMenu() {
    clearMenuCloseTimer()
    setTopMenuOpen(true)
  }

  function scheduleTopMenuClose(delay = 250) {
    clearMenuCloseTimer()
    if (menuPinnedByClick) return
    closeMenuTimerRef.current = window.setTimeout(() => {
      setTopMenuOpen(false)
      closeMenuTimerRef.current = null
    }, delay)
  }

  function handleTopMenuWrapperEnter() {
    if (!isDesktopMenu) return
    openTopMenu()
  }

  function handleTopMenuWrapperLeave() {
    if (!isDesktopMenu) return
    scheduleTopMenuClose(260)
  }

  function handleTopMenuDropdownEnter() {
    if (!isDesktopMenu) return
    openTopMenu()
  }

  function handleTopMenuDropdownLeave() {
    if (!isDesktopMenu) return
    scheduleTopMenuClose(260)
  }

  function handleTopMenuTriggerClick() {
    clearMenuCloseTimer()
    if (topMenuOpen && menuPinnedByClick) {
      setTopMenuOpen(false)
      setMenuPinnedByClick(false)
      return
    }
    setTopMenuOpen(true)
    setMenuPinnedByClick(true)
  }

  return (
    <main className="page">
      <AppHeader
        menuOpen={topMenuOpen}
        isDesktop={isDesktopMenu}
        menuItems={topMenuItems}
        onMenuItemSelect={handleTopMenuItemSelect}
        menuContainerRef={topRightMenuRef}
        onWrapperEnter={handleTopMenuWrapperEnter}
        onWrapperLeave={handleTopMenuWrapperLeave}
        onTriggerClick={handleTopMenuTriggerClick}
        onDropdownEnter={handleTopMenuDropdownEnter}
        onDropdownLeave={handleTopMenuDropdownLeave}
      />
      {!token && (
        <section className="mochiAuthShell">
          <div className="mochiLoginCard">
            <div className="mochiBrand">
              <div className="mochiBrandIcon">M</div>
              <h1>MochiAI</h1>
              <p>Your Mindful Sanctuary</p>
            </div>

            {accountMode === 'login' && (
              <>
                <form onSubmit={handleLogin} className="mochiForm">
                  <label>
                    <span>Email Address</span>
                    <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="hello@mochi.ai" required />
                  </label>
                  <label>
                    <div className="mochiLabelRow">
                      <span>Password</span>
                      <button
                        type="button"
                        className="mochiTextLink"
                        onClick={() => {
                          setShowRecoveryInline((v) => !v)
                          setRecoveryQuestion('')
                          setRecoveryAnswer('')
                        }}
                      >
                        Forgot?
                      </button>
                    </div>
                    <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="••••••••" required />
                  </label>
                  <button disabled={loading}>Login</button>
                </form>

                {showRecoveryInline && (
                  <div className="mochiRecoveryBox">
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

                <button
                  type="button"
                  className="mochiGoogleBtn ghost"
                  onClick={() => {
                    setShowRecoveryInline((v) => !v)
                    setRecoveryQuestion('')
                    setRecoveryAnswer('')
                  }}
                >
                  Forgot password?
                </button>
              </>
            )}

            {accountMode === 'signup' && (
              <>
                <form onSubmit={handleSignup} className="mochiForm">
                  <label>
                    <span>Email Address</span>
                    <input value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} placeholder="hello@mochi.ai" required />
                  </label>
                  <label>
                    <span>Password</span>
                    <input type="password" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} required minLength={8} />
                  </label>
                  <label>
                    <span>Confirm Password</span>
                    <input type="password" value={signupPasswordConfirm} onChange={(e) => setSignupPasswordConfirm(e.target.value)} required minLength={8} />
                  </label>
                  <label>
                    <span>Nickname</span>
                    <input value={signupNickname} onChange={(e) => setSignupNickname(e.target.value)} required />
                  </label>
                  <label>
                    <span>Security Question</span>
                    <select value={signupSecurityQuestion} onChange={(e) => setSignupSecurityQuestion(e.target.value)}>
                      {SECURITY_QUESTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Security Answer</span>
                    <input value={signupSecurityAnswer} onChange={(e) => setSignupSecurityAnswer(e.target.value)} required />
                  </label>
                  <button disabled={loading}>Sign Up</button>
                </form>
                <p className="mochiSwitchText">
                  Already have an account?{' '}
                  <button type="button" className="mochiInlineButton" onClick={() => setAccountMode('login')}>Login</button>
                </p>
              </>
            )}

            {accountMode === 'reset' && (
              <>
                <form onSubmit={handleResetPassword} className="mochiForm">
                  <label>
                    <span>New Password</span>
                    <input type="password" value={resetNewPassword} onChange={(e) => setResetNewPassword(e.target.value)} required minLength={8} />
                  </label>
                  <label>
                    <span>Confirm Password</span>
                    <input type="password" value={resetNewPasswordConfirm} onChange={(e) => setResetNewPasswordConfirm(e.target.value)} required minLength={8} />
                  </label>
                  <button disabled={loading}>비밀번호 변경</button>
                </form>
                <p className="mochiSwitchText">
                  <button type="button" className="mochiInlineButton" onClick={() => setAccountMode('login')}>로그인으로 돌아가기</button>
                </p>
              </>
            )}
          </div>
        </section>
      )}

      {page === 'account' && token && (
        <section className="panel accountPanel">
          <h2>계정</h2>
          <p>이미 로그인된 상태입니다. 상단 메뉴에서 체크인, 대화, 마이페이지 기능을 이용하세요.</p>
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
                <p className="checkinDoneHeadline">{checkinDoneHeadline}</p>
                <h3 className="checkinDoneTitle">
                  <span className="checkinDoneIcon" aria-hidden="true">✅</span>
                  체크인 완료!
                </h3>
                <div className="checkinRingGrid">
                  {checkinVisualMetrics.map((metric) => (
                    <CheckinRing
                      key={metric.key}
                      label={metric.label}
                      valueText={metric.valueText}
                      percent={metric.percent}
                      color={metric.color}
                    />
                  ))}
                </div>
                <p className="small">{checkinSummaryText || '입력한 체크인 데이터가 시각화되었습니다.'}</p>
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
        <section className="cbtRefinedPage">
          <div className="cbtRefinedGrid">
            <article className="cbtRefinedMain">
              <div className="cbtRefinedMainHead">
                <div className="cbtRefinedCoach">
                  <div className="cbtRefinedCoachAvatar">M</div>
                  <div>
                    <h3>모치짱</h3>
                    <span>이야기 들을 준비가 되었어요...</span>
                  </div>
                </div>
                <button type="button" className="cbtRefinedHistory" onClick={exportRecentChatHistory}>history</button>
              </div>

              <div className="cbtRefinedMessages" ref={chatMessagesRef}>
                {chatResult?.crisis_mode && (
                  <CbtCrisisBanner
                    crisisStage={chatResult.crisis_stage}
                    crisisActions={Array.isArray(chatResult.crisis_actions) ? chatResult.crisis_actions : []}
                    crisisActionChecked={crisisActionChecked}
                    onToggleAction={(action, checked) => {
                      setCrisisActionChecked((prev) => ({ ...prev, [action]: checked }))
                    }}
                    onSendSupporterMessage={() => void sendSupporterCrisisMessage()}
                  />
                )}
                {chatHistory.length === 0 && <div className="chatEmpty">오늘 있었던 사건, 감정, 생각의 흐름을 천천히 이야기해 주세요.</div>}
                {chatHistory.length > 0 && filteredChatHistory.length === 0 && (
                  <div className="chatEmpty">검색 결과가 없습니다.</div>
                )}
                {filteredChatHistory.map((turn, idx) => (
                  <div key={`turn-${idx}`} className={`cbtRefinedRow ${turn.role === 'user' ? 'user' : 'assistant'}`}>
                    <div className="cbtRefinedAvatar">{turn.role === 'user' ? 'U' : 'M'}</div>
                    <div className="cbtRefinedBubbleWrap">
                      <div className={`cbtRefinedBubble ${turn.role === 'user' ? 'user' : 'assistant'}`}>
                        <p>{turn.content}</p>
                        {turn.loading && (
                          <span className="chatLoadingInline" title="응답 생성 중" aria-label="응답 생성 중">
                            <span className="loadingDot" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {(thoughtWeb || challenges.length > 0) && !(chatResult?.crisis_mode && chatResult?.crisis_stage === 'B') && (
                  <div className="cbtRefinedThoughtWeb">
                    <h4>생각그물 요약</h4>
                    {thoughtWeb && (
                      <>
                        <p><strong>자동사고:</strong> {thoughtWeb.thought}</p>
                        <p><strong>연습 포인트:</strong> {thoughtWeb.practice_point}</p>
                      </>
                    )}
                    {challenges.length > 0 && !chatChallengeCtaDismissed && (
                      <div className="actions">
                        <button type="button" onClick={startSuggestedChallengeNow}>지금 시작</button>
                        <button type="button" className="ghost" onClick={dismissSuggestedChallengeCta}>나중에</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <form onSubmit={handleChatSubmit} className="cbtRefinedComposer">
                <div className="cbtRefinedInputRow">
                  <textarea
                    ref={chatInputRef}
                    rows={1}
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyDown={handleChatTextareaKeyDown}
                    placeholder="당신의 생각을 속삭여주세요..."
                  />
                  <button type="submit" className="cbtRefinedSend" disabled={loading || chatGenerating}>send</button>
                </div>
                <button type="button" className="chatFinishBtn" onClick={() => void handleFinishDialogue()} disabled={loading || chatGenerating}>대화 마치기</button>
              </form>
            </article>

            <aside className="cbtRefinedSide">
              <article className="cbtRefinedCard">
                <div className="cbtSearchWrap">
                  <span>search</span>
                  <input
                    aria-label="현재 세션 내 상담 기록 검색"
                    placeholder="현재 세션 내 검색 (공백 무시)"
                    value={chatSearchQuery}
                    onChange={(e) => setChatSearchQuery(e.target.value)}
                  />
                </div>
                <p className="cbtSearchHint">현재 탭에 로드된 대화에서만 찾습니다. 예: ‘잠못자’ = ‘잠 못 자’</p>
              </article>

              <article className="cbtRefinedCard">
                <div className="cbtCardHead">
                  <div>
                    <h4>위험도 분석</h4>
                    <p>30일 건강 트렌드</p>
                  </div>
                </div>
                <div className="cbtTrendChart">
                  <svg viewBox="0 0 310 128" role="img" aria-label="risk trend line">
                    <path d="M0,100 Q30,110 60,80 T120,60 T180,30 T240,50 T310,20" />
                    <circle cx="180" cy="30" r="4" />
                    <circle cx="310" cy="20" r="5" />
                  </svg>
                </div>
                <div className="cbtTrendAxis">
                  <span>1일차</span><span>15일차</span><span>오늘</span>
                </div>
              </article>

              <article className="cbtRefinedCard">
                <div className="cbtCardHead">
                  <h4>웰니스 지수</h4>
                  <button type="button">상세보기</button>
                </div>
                <div className="cbtWellnessBox">
                  <div className="cbtStatusHead">
                    <div>
                      <p>현재 상태</p>
                      <h5>{liveEmotionSummary.moodLabel}</h5>
                    </div>
                    <span>{diaryRiskLabel}</span>
                  </div>
                  <div className="cbtMetricRow">
                    <div><span>우울 (DEP)</span><strong>{diaryDep}%</strong></div>
                    <div className="cbtMetricBar peach"><b style={{ width: `${Math.max(4, diaryDep)}%` }} /></div>
                  </div>
                  <div className="cbtMetricRow">
                    <div><span>불안 (ANX)</span><strong>{diaryAnx}%</strong></div>
                    <div className="cbtMetricBar lavender"><b style={{ width: `${Math.max(4, diaryAnx)}%` }} /></div>
                  </div>
                  <div className="cbtMetricRow">
                    <div><span>불면 (INS)</span><strong>{diaryIns}%</strong></div>
                    <div className="cbtMetricBar neon"><b style={{ width: `${Math.max(4, diaryIns)}%` }} /></div>
                  </div>
                </div>
              </article>

              <article className="cbtRefinedCard">
                <h4>진행 중 생각 정리</h4>
                {activeChallengeInProgress ? (
                  <>
                    <p><strong>{activeChallenge}</strong></p>
                    <p className="small">현재 단계: {challengePhase === 'start' ? '시작' : challengePhase === 'continue' ? '진행' : '정리'}</p>
                    <p className="small">{challengeHintText || chatResult?.challenge_step_prompt || '사실 1개, 감정 1개, 자동사고 1개를 순서대로 적어보세요.'}</p>
                  </>
                ) : (
                  <p className="small">진행 중인 챌린지가 없습니다.</p>
                )}
                <p className="small">완료 {completedChallenges}/{challenges.length}</p>
              </article>

              <article className="cbtRefinedCard cbtTipCard">
                <h4>오늘의 모치 팁</h4>
                <p>{challengeHintText || chatResult?.challenge_step_prompt || '압박감이 느껴질 때는 5분만 눈을 감고 주변 소리에 집중해보세요.'}</p>
              </article>
            </aside>
          </div>

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

          {journalLibraryOpen && (
            <article className="panel" style={{ gridColumn: '1 / -1' }}>
              <h3>일기 도서관</h3>
              {journalEntries.length === 0 ? <p className="small">저장된 일기가 없습니다.</p> : (
                <ul className="probList">
                  {journalEntries.map((entry) => (
                    <li key={entry.id}>
                      <span>
                        {entry.entry_date} | {entry.title}
                        {selectedJournalEntry?.id === entry.id ? ' (현재 조회 중)' : ''}
                      </span>
                      <strong>{entry.content.slice(0, 80)}{entry.content.length > 80 ? '…' : ''}</strong>
                      <div className="actions">
                        <button
                          type="button"
                          className=""
                          onClick={() => void handleOpenJournalEntry(entry.id)}
                        >
                          조회
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )}

          {selectedJournalEntry && (
            <article className="panel" style={{ gridColumn: '1 / -1' }}>
              <h3>선택한 일기 조회</h3>
              <p><strong>{selectedJournalEntry.entry_date}</strong></p>
              {selectedJournalEditing ? (
                <>
                  <label>제목<input value={selectedJournalTitleDraft} onChange={(e) => setSelectedJournalTitleDraft(e.target.value)} /></label>
                  <label>내용<textarea rows={8} value={selectedJournalContentDraft} onChange={(e) => setSelectedJournalContentDraft(e.target.value)} /></label>
                </>
              ) : (
                <>
                  <p><strong>{selectedJournalEntry.title}</strong></p>
                  <p>{selectedJournalEntry.content}</p>
                </>
              )}
              <div className="actions">
                <button type="button" onClick={() => void handleToggleSelectedJournalEdit()} disabled={loading}>
                  {selectedJournalEditing ? '수정 완료' : '수정'}
                </button>
              </div>
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
        <section className="assessmentPage">
          <div className="assessmentProgressRail">
            <div className="assessmentProgressFill" style={{ width: `${assessmentProgress}%` }} />
          </div>
          <div className="assessmentHeader">
            <div>
              <h2>종합 심리 검사 센터</h2>
              <p>현재 진행 중인 3가지 주요 지표 검사입니다.</p>
            </div>
            <div className="assessmentHelperBubble">
              <div className="assessmentHelperAvatar">M</div>
              <p>천천히 당신의 마음을 들여다보는 시간이에요.</p>
            </div>
          </div>

          <form onSubmit={handleSurveySubmit} className="assessmentForm">
            {[
              { key: 'PHQ' as const, title: 'PHQ-9', subtitle: '우울증 선별 검사', sectionClass: 'sectionLavender', questions: PHQ9_QUESTIONS, score: `${phqTotal}/27` },
              { key: 'GAD' as const, title: 'GAD-7', subtitle: '불안 장애 검사', sectionClass: 'sectionPeach', questions: GAD7_QUESTIONS, score: `${gadTotal}/21` },
              { key: 'ISI' as const, title: 'ISI', subtitle: '불면증 심각도 지표', sectionClass: 'sectionNeon', questions: SLEEP_QUESTIONS, score: `${sleepTotal}/9` },
            ].map((test) => {
              const state = assessmentFlow[test.key]
              const currentQuestion = test.questions[state.index]
              const currentAnswer = state.answers[state.index]
              const completed = isTestCompleted(test.key)
              const canNext = currentAnswer != null

              return (
                <article key={`assessment-${test.key}`} className={`assessmentSection ${test.sectionClass} ${assessmentErrors[test.key] ? 'assessmentSectionError' : ''}`}>
                  <div className="assessmentSectionHead assessmentSectionHeadWide">
                    <div>
                      <span>{test.title}</span>
                      <p>{test.subtitle}</p>
                    </div>
                    <em>{state.index + 1}/{test.questions.length}</em>
                    <b className={completed ? 'assessmentDoneBadge active' : 'assessmentDoneBadge'}>{completed ? '완료됨' : '진행중'}</b>
                  </div>

                  <div className="assessmentCarousel">
                    <div key={`${test.key}-${state.index}`} className="assessmentSlide">
                      {completed && (
                        <div className="assessmentCompleteOverlay">
                          <div className="assessmentCompleteIcon">✓</div>
                          <strong>{test.title} 검사 완료됨</strong>
                          <button type="button" className="ghost" onClick={() => setTestIndex(test.key, 0)}>수정하기</button>
                        </div>
                      )}
                      <p className="assessmentSlideQuestion">{state.index + 1}. {currentQuestion}</p>
                      <div className="assessmentSliderWrap">
                        <input
                          type="range"
                          min={0}
                          max={3}
                          step={1}
                          value={currentAnswer ?? 0}
                          onChange={(e) => setTestAnswer(test.key, Number(e.target.value))}
                          className="assessmentSlider"
                          style={{
                            background: `linear-gradient(to right, #0f172a 0%, #0f172a ${(((currentAnswer ?? 0) / 3) * 100)}%, #dbe4ea ${(((currentAnswer ?? 0) / 3) * 100)}%, #dbe4ea 100%)`,
                          }}
                        />
                        <div className="assessmentSliderLabels">
                          {SLIDER_LABELS.map((label, idx) => (
                            <button
                              key={`${test.key}-label-${idx}`}
                              type="button"
                              className={currentAnswer === idx ? 'active' : ''}
                              onClick={() => setTestAnswer(test.key, idx)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="assessmentNav">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => moveTestIndex(test.key, -1)}
                      disabled={state.index === 0 || completed}
                    >
                      이전
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNextQuestion(test.key)}
                      disabled={state.index >= test.questions.length - 1 || !canNext || completed}
                    >
                      다음
                    </button>
                  </div>
                </article>
              )
            })}

            <div className="assessmentSubmitWrap">
              <div className="assessmentBottomProgress">
                <p>{assessmentProgress}% Completed</p>
                <div className="assessmentBottomTrack">
                  <div className="assessmentBottomFill" style={{ width: `${assessmentProgress}%` }} />
                </div>
              </div>
              <button className="assessmentSubmitBtn" disabled={loading || !assessmentAllCompleted}>
                전체 결과 확인하기 {assessmentAllCompleted ? '' : '🔒'}
              </button>
              <p>{assessmentGuideText}</p>
            </div>
          </form>

          {checkPrediction && (
            <AssessmentReportPage
              data={reportData}
              reportDate={reportDate}
              onConsult={() => setPage('board')}
            />
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
