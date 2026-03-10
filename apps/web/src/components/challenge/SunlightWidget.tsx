'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type TimeSlot = 'morning' | 'afternoon' | 'evening'
type WeatherMode = 'sunny' | 'cloudy'
type Step = 1 | 2 | 3

type TimerStatus = 'idle' | 'running' | 'paused' | 'done'

interface Payload {
  timeSlot: TimeSlot
  mood: string
  weatherMode: WeatherMode
  sunlightMinutes: number
  moodChange: string
  nextAction: string
}

interface Props {
  onChange?: (summary: string) => void
  onComplete?: (payload: Payload) => Promise<void> | void
  redirectPath?: string
}

const SUNNY_COLOR = '#F6AD55'
const CLOUDY_COLOR = '#B794F4'
const DONE_COLOR = '#68D391'

function getTimeSlot(hour: number): TimeSlot {
  if (hour >= 6 && hour <= 10) return 'morning'
  if (hour >= 11 && hour <= 16) return 'afternoon'
  return 'evening'
}

function getIntroBanner(hour: number) {
  if (hour >= 6 && hour <= 10) {
    return {
      icon: '🌅',
      bg: '#FFFDE7',
      title: '지금이 최고의 햇빛 타이밍이에요!',
      desc: '아침 햇빛은 하루 기분을 좌우해요.',
    }
  }
  if (hour >= 11 && hour <= 16) {
    return {
      icon: '☀️',
      bg: '#FFF3E0',
      title: '짧은 햇빛 휴식을 취하기 좋은 시간이에요.',
      desc: '',
    }
  }
  return {
    icon: '🌙',
    bg: '#EDE9FE',
    title: '오늘 햇빛을 아직 못 받으셨나요?',
    desc: '지금이라도 창가 햇빛을 받아보세요.',
  }
}

function pad(num: number): string {
  return String(num).padStart(2, '0')
}

export function SunlightWidget({ onChange, onComplete, redirectPath = '/challenge' }: Props) {
  const router = useRouter()

  const now = useMemo(() => new Date(), [])
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  const timeSlot = useMemo(() => getTimeSlot(currentHour), [currentHour])
  const intro = useMemo(() => getIntroBanner(currentHour), [currentHour])

  const [stage, setStage] = useState<'intro' | 'activity' | 'done'>('intro')
  const [step, setStep] = useState<Step>(1)

  const [mood, setMood] = useState('')
  const [weatherMode, setWeatherMode] = useState<WeatherMode | ''>('')

  const [minutesSetting, setMinutesSetting] = useState(10)
  const [secondsLeft, setSecondsLeft] = useState(10 * 60)
  const [timerStatus, setTimerStatus] = useState<TimerStatus>('idle')
  const [skipRequested, setSkipRequested] = useState(false)

  const [moodChange, setMoodChange] = useState('')
  const [nextAction, setNextAction] = useState('')

  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const totalSecondsRef = useRef(10 * 60)

  useEffect(() => {
    if (timerStatus !== 'running') return
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          setTimerStatus('done')
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate(200)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [timerStatus])

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const sunlightMinutes = useMemo(() => {
    if (skipRequested) return 0
    const elapsed = Math.max(0, totalSecondsRef.current - secondsLeft)
    return Math.floor(elapsed / 60)
  }, [secondsLeft, skipRequested])

  const payload = useMemo<Payload | null>(() => {
    if (!weatherMode) return null
    return {
      timeSlot,
      mood,
      weatherMode,
      sunlightMinutes,
      moodChange,
      nextAction,
    }
  }, [timeSlot, mood, weatherMode, sunlightMinutes, moodChange, nextAction])

  useEffect(() => {
    if (!payload) return
    const lines = [
      `timeSlot: ${payload.timeSlot}`,
      `mood: ${payload.mood}`,
      `weatherMode: ${payload.weatherMode}`,
      `sunlightMinutes: ${payload.sunlightMinutes}`,
      `moodChange: ${payload.moodChange}`,
      `nextAction: ${payload.nextAction}`,
    ]
    onChange?.(lines.join('\n'))
  }, [payload, onChange])

  const timerRing = useMemo(() => {
    const radius = 86
    const circumference = 2 * Math.PI * radius
    const total = Math.max(totalSecondsRef.current, 1)
    const progress = Math.max(0, Math.min(1, secondsLeft / total))
    const offset = circumference * (1 - progress)
    const ringColor = timerStatus === 'done' ? DONE_COLOR : weatherMode === 'cloudy' ? CLOUDY_COLOR : SUNNY_COLOR
    return { radius, circumference, offset, ringColor }
  }, [secondsLeft, timerStatus, weatherMode])

  const canNext = useMemo(() => {
    if (step === 1) return Boolean(mood) && Boolean(weatherMode)
    if (step === 2) return timerStatus === 'done' || skipRequested
    return Boolean(moodChange) && nextAction.trim().length > 0
  }, [step, mood, weatherMode, timerStatus, skipRequested, moodChange, nextAction])

  const startActivity = () => {
    setStage('activity')
    setStep(1)
  }

  const goNext = () => {
    if (!canNext) return
    if (step < 3) setStep((step + 1) as Step)
  }

  const goPrev = () => {
    if (step <= 1) return
    setStep((step - 1) as Step)
  }

  const adjustMinutes = (delta: number) => {
    if (timerStatus !== 'idle') return
    const next = Math.max(1, Math.min(30, minutesSetting + delta))
    setMinutesSetting(next)
    const total = next * 60
    totalSecondsRef.current = total
    setSecondsLeft(total)
  }

  const startTimer = () => {
    if (timerStatus !== 'idle') return
    setSkipRequested(false)
    setTimerStatus('running')
  }

  const pauseTimer = () => {
    if (timerStatus !== 'running') return
    setTimerStatus('paused')
  }

  const resumeTimer = () => {
    if (timerStatus !== 'paused') return
    setTimerStatus('running')
  }

  const resetTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    const total = minutesSetting * 60
    totalSecondsRef.current = total
    setSecondsLeft(total)
    setTimerStatus('idle')
    setSkipRequested(false)
  }

  const skipTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setSkipRequested(true)
    setTimerStatus('paused')
  }

  const completeChallenge = async () => {
    if (!payload || !canNext || submitting || submitted) return
    try {
      setSubmitting(true)
      await onComplete?.(payload)
      setSubmitted(true)
      setStage('done')
    } finally {
      setSubmitting(false)
    }
  }

  const mm = pad(Math.floor(secondsLeft / 60))
  const ss = pad(secondsLeft % 60)

  const chips = weatherMode === 'cloudy'
    ? ['맑은 날 야외 햇빛 도전', '매일 아침 커튼 열기', '창가 자리 만들기']
    : ['내일 같은 시간 햇빛 보기', '점심 후 밖에 나가기', '아침 10분 루틴 만들기']

  if (stage === 'done' && payload) {
    return (
      <div className="sw-wrap">
        <div className="sw-card sw-done-card">
          <p className="sw-done-icon">☀️</p>
          <p className="sw-done-title">오늘의 햇빛 챌린지 완료!</p>
          <div className="sw-summary">
            <p>오늘 기분: {payload.mood || '-'}</p>
            <p>날씨 모드: {payload.weatherMode === 'sunny' ? '☀️ 야외' : '☁️ 창가'}</p>
            <p>햇빛 시간: {payload.sunlightMinutes > 0 ? `${payload.sunlightMinutes}분` : '직접 체험'}</p>
            <p>햇빛 후기: {payload.moodChange || '-'}</p>
            <p>다음 계획: {payload.nextAction || '-'}</p>
          </div>
          <button className="ct-btn-primary" onClick={() => router.push(redirectPath)}>처음으로 돌아가기</button>
        </div>
      </div>
    )
  }

  if (stage === 'intro') {
    return (
      <div className="sw-wrap">
        <div className="sw-card" style={{ background: intro.bg }}>
          <p className="sw-banner-title">{intro.icon} {intro.title}</p>
          {intro.desc ? <p className="sw-banner-desc">{intro.desc}</p> : null}
          <p className="sw-time">현재 시각 {pad(currentHour)}:{pad(currentMinute)}</p>
        </div>

        <div className="sw-card">
          <p className="sw-banner-desc">날씨가 흐려도 괜찮아요. 창가 햇빛만으로도 충분한 효과가 있어요. 타이머를 켜고 딱 10분만 햇빛 아래 있어보세요.</p>
          <div className="sw-row">
            <span className="sw-chip">⏱ 10분</span>
            <span className="sw-chip">☀️ 기분 전환</span>
            <span className="sw-chip">🌤 날씨 무관</span>
          </div>
          <button className="ct-btn-primary" onClick={startActivity}>시작하기 →</button>
        </div>
      </div>
    )
  }

  return (
    <div className="sw-wrap">
      <div className="sw-progress">
        <button className="sw-back" onClick={goPrev} disabled={step === 1}>←</button>
        <p className="sw-title">단계 {step} / 3</p>
        <div className="sw-dots">
          {[1, 2, 3].map((n) => (
            <span key={n} className={`sw-dot ${n <= step ? 'active' : ''}`} />
          ))}
        </div>
      </div>

      {step === 1 ? (
        <div className="sw-card">
          <p className="sw-section-title">S1. 컨디션 & 날씨 확인</p>
          <div>
            <p className="sw-help">지금 기분은?</p>
            <div className="sw-row">
              {['😔', '😐', '🙂', '😊', '🥰'].map((emoji) => (
                <button key={emoji} className={`sw-emoji ${mood === emoji ? 'active' : ''}`} onClick={() => setMood(emoji)}>{emoji}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="sw-help">오늘 날씨는?</p>
            <div className="sw-row">
              <button className={`sw-chip ${weatherMode === 'sunny' ? 'active' : ''}`} onClick={() => setWeatherMode('sunny')}>☀️ 맑음</button>
              <button className={`sw-chip ${weatherMode === 'cloudy' ? 'active' : ''}`} onClick={() => setWeatherMode('cloudy')}>☁️ 흐림·비</button>
            </div>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="sw-card">
          <p className="sw-section-title">S2. 햇빛 타이머</p>
          <p className="sw-help">{weatherMode === 'cloudy' ? '☁️ 창가 햇빛도 훌륭한 자연광이에요 👍' : '☀️ 햇빛 아래로 나가보세요!'}</p>

          <div className="sw-ring-wrap">
            <svg width="200" height="200" viewBox="0 0 200 200" className="sw-ring-svg">
              <circle cx="100" cy="100" r={timerRing.radius} fill="none" stroke="#FFF3E0" strokeWidth="12" />
              <circle
                cx="100"
                cy="100"
                r={timerRing.radius}
                fill="none"
                stroke={timerRing.ringColor}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={timerRing.circumference}
                strokeDashoffset={timerRing.offset}
                style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.5s ease' }}
              />
            </svg>
            <div className="sw-ring-center">
              {timerStatus === 'done' ? <p className="sw-ring-done">완료! ☀️</p> : <p className="sw-ring-time">{mm}:{ss}</p>}
            </div>
          </div>

          {timerStatus === 'idle' ? (
            <div className="sw-adjust-row">
              <button className="sw-adjust" onClick={() => adjustMinutes(-1)}>−</button>
              <p className="sw-adjust-value">{minutesSetting}분</p>
              <button className="sw-adjust" onClick={() => adjustMinutes(1)}>+</button>
            </div>
          ) : null}

          <div className="sw-row">
            {timerStatus === 'idle' ? <button className="ct-btn-primary" onClick={startTimer}>☀️ 햇빛 시작</button> : null}
            {timerStatus === 'running' ? <button className="ct-btn-secondary" onClick={pauseTimer}>일시정지</button> : null}
            {timerStatus === 'paused' ? (
              <>
                <button className="ct-btn-primary" onClick={resumeTimer}>계속하기</button>
                <button className="ct-btn-secondary" onClick={resetTimer}>초기화</button>
              </>
            ) : null}
          </div>

          <button className="sw-skip" onClick={skipTimer}>건너뛰기</button>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="sw-card">
          <p className="sw-section-title">S3. 오늘의 햇빛 후기</p>
          <div>
            <p className="sw-help">햇빛을 받고 나니 어때요?</p>
            <div className="sw-list">
              {['🌟 생각보다 좋았어요', '🙂 기분이 조금 나아졌어요', '😐 비슷해요', '🤔 잘 모르겠어요'].map((item) => (
                <button key={item} className={`sw-item ${moodChange === item ? 'active' : ''}`} onClick={() => setMoodChange(item)}>{item}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="sw-help">내일도 해볼까요?</p>
            <div className="sw-row">
              {chips.map((chip) => (
                <button key={chip} className="sw-chip" onClick={() => setNextAction(chip)}>{chip}</button>
              ))}
            </div>
            <textarea className="sw-textarea" value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
          </div>
        </div>
      ) : null}

      <div className="sw-footer">
        {step < 3 ? (
          <button className="ct-btn-primary" onClick={goNext} disabled={!canNext}>다음 단계 →</button>
        ) : (
          <button className="ct-btn-primary" onClick={() => void completeChallenge()} disabled={!canNext || submitting}>
            {submitting ? '처리 중...' : '햇빛 챌린지 완료 ☀️'}
          </button>
        )}
      </div>
    </div>
  )
}
