'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

interface DayRecord {
  date: string
  glasses: number
  achieved: boolean
}

interface WaterData {
  goal: number
  mlPerGlass: number
  days: DayRecord[]
  fishSize: number
  startDate: string
}

interface Props {
  onChange?: (summary: string) => void
  onComplete?: () => Promise<void> | void
  redirectPath?: string
}

type Stage = 'intro' | 'active' | 'day_done' | 'final_done'
type Step = 1 | 2 | 3

const STORAGE_KEY = 'water_intake_data'

const GOALS = [6, 8, 10]
const CUP_SIZES = [200, 250, 350]
const DEFAULT_GOAL = 8
const DEFAULT_CUP = 250

function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(base: string, offset: number): string {
  const d = new Date(base)
  d.setDate(d.getDate() + offset)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dayIndex(startDate: string): number {
  const start = new Date(startDate)
  const now = new Date(todayStr())
  const diff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return 0
  if (diff > 6) return 6
  return diff
}

function fishSizeByDay(dayNo: number): number {
  if (dayNo <= 2) return 10
  if (dayNo <= 4) return 14
  if (dayNo <= 6) return 18
  return 22
}

function fishState(glasses: number, goal: number): 'need' | 'slow' | 'good' | 'great' | 'done' {
  if (glasses <= 0) return 'need'
  if (glasses < 4) return 'slow'
  if (glasses < 7) return 'good'
  if (glasses < goal) return 'great'
  return 'done'
}

function waterColor(ratio: number): string {
  if (ratio <= 0.3) return '#BFDBFE'
  if (ratio <= 0.6) return '#60A5FA'
  if (ratio < 1) return '#3B82F6'
  return '#1D4ED8'
}

function parseStorage(): WaterData {
  const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null
  if (!raw) {
    const startDate = todayStr()
    return {
      goal: DEFAULT_GOAL,
      mlPerGlass: DEFAULT_CUP,
      days: Array.from({ length: 7 }, (_, i) => ({
        date: addDays(startDate, i),
        glasses: 0,
        achieved: false,
      })),
      fishSize: 1,
      startDate,
    }
  }
  try {
    const parsed = JSON.parse(raw) as WaterData
    if (!Array.isArray(parsed.days) || !parsed.startDate) throw new Error('invalid')
    return {
      goal: parsed.goal || DEFAULT_GOAL,
      mlPerGlass: parsed.mlPerGlass || DEFAULT_CUP,
      days: parsed.days.slice(0, 7),
      fishSize: parsed.fishSize || 1,
      startDate: parsed.startDate,
    }
  } catch {
    const startDate = todayStr()
    return {
      goal: DEFAULT_GOAL,
      mlPerGlass: DEFAULT_CUP,
      days: Array.from({ length: 7 }, (_, i) => ({
        date: addDays(startDate, i),
        glasses: 0,
        achieved: false,
      })),
      fishSize: 1,
      startDate,
    }
  }
}

function saveStorage(data: WaterData) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function FishTank({
  glasses,
  goal,
  fishRadius,
  showCrown,
  readOnly,
  celebration,
}: {
  glasses: number
  goal: number
  fishRadius: number
  showCrown?: boolean
  readOnly?: boolean
  celebration?: boolean
}) {
  const ratio = Math.max(0, Math.min(1, glasses / Math.max(goal, 1)))
  const waterHeight = 120 * ratio
  const color = waterColor(ratio)
  const state = fishState(glasses, goal)

  const fishY = state === 'need' ? 130 : 90
  const fishFill = state === 'need' ? '#9CA3AF' : '#F97316'
  const bubble = state === 'need' ? '물이 필요해요...' : state === 'slow' ? '조금 나아졌어요' : state === 'good' ? '기분이 좋아요!' : state === 'great' ? '최고예요! 💪' : '오늘 목표 완료! 🎉'

  return (
    <div className={`wi-tank ${readOnly ? 'readonly' : ''} ${celebration ? 'celebrate' : ''}`}>
      <svg viewBox="0 0 360 220" className="wi-tank-svg" role="img" aria-label="물고기 어항">
        <rect x="20" y="20" width="320" height="170" rx="18" ry="18" fill="#FFFFFF" stroke="#BFDBFE" strokeWidth="3" />

        <text x="44" y="44" className="wi-plant">🌿</text>
        <text x="300" y="48" className="wi-plant">🌿</text>

        <clipPath id="water-clip">
          <rect x="24" y={186 - waterHeight} width="312" height={waterHeight} rx="14" ry="14" />
        </clipPath>
        <rect x="24" y={186 - waterHeight} width="312" height={waterHeight} fill={color} className="wi-water" />
        {ratio >= 1 ? (
          <g className="wi-wave" clipPath="url(#water-clip)">
            <path d="M 24 88 Q 42 78 60 88 T 96 88 T 132 88 T 168 88 T 204 88 T 240 88 T 276 88 T 312 88 T 336 88" fill="none" stroke="#93C5FD" strokeWidth="3" />
          </g>
        ) : null}

        <g className={`wi-fish wi-fish-${state}`}>
          <ellipse cx="170" cy={fishY} rx={fishRadius + 6} ry={fishRadius} fill={fishFill} />
          <polygon points={`${170 + fishRadius + 6},${fishY} ${170 + fishRadius + 20},${fishY - 8} ${170 + fishRadius + 20},${fishY + 8}`} fill={fishFill} />
          <circle cx={165} cy={fishY - 2} r="2" fill="#111827" />
          {state === 'done' ? <text x="188" y={fishY - 16} className="wi-sparkle">✨</text> : null}
          {showCrown ? <text x="168" y={fishY - fishRadius - 8} className="wi-crown">👑</text> : null}
        </g>

        <rect x="76" y="52" width="208" height="26" rx="13" fill="#FFFFFFCC" />
        <text x="180" y="69" textAnchor="middle" className="wi-bubble-text">{bubble}</text>
      </svg>
    </div>
  )
}

export function WaterIntakeWidget({ onChange, onComplete, redirectPath = '/challenge' }: Props) {
  const router = useRouter()

  const [stage, setStage] = useState<Stage>('intro')
  const [step, setStep] = useState<Step>(1)
  const [data, setData] = useState<WaterData | null>(null)
  const [isCoolingDown, setIsCoolingDown] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [showDropFx, setShowDropFx] = useState(false)
  const [celebration, setCelebration] = useState(false)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    const next = parseStorage()
    setData(next)
  }, [])

  const idx = useMemo(() => (data ? dayIndex(data.startDate) : 0), [data])
  const today = data?.days[idx]
  const goal = data?.goal ?? DEFAULT_GOAL
  const mlPerGlass = data?.mlPerGlass ?? DEFAULT_CUP
  const glasses = today?.glasses ?? 0
  const achievedToday = glasses >= goal
  const dayNo = idx + 1
  const todayMl = glasses * mlPerGlass
  const fishRadius = fishSizeByDay(dayNo)

  useEffect(() => {
    if (!data || !today) return
    const lines = [
      `day: ${dayNo}`,
      `glasses: ${today.glasses}`,
      `goal: ${goal}`,
      `mlPerGlass: ${mlPerGlass}`,
      `achieved: ${today.achieved ? 'yes' : 'no'}`,
    ]
    onChange?.(lines.join('\n'))
  }, [data, today, dayNo, goal, mlPerGlass, onChange])

  const applyData = (updater: (prev: WaterData) => WaterData) => {
    setData((prev) => {
      if (!prev) return prev
      const next = updater(prev)
      saveStorage(next)
      return next
    })
  }

  const startChallenge = () => {
    if (!data) return
    if (dayNo === 1) {
      setStep(1)
    } else {
      setStep(2)
    }
    setStage('active')
  }

  const updateGoal = (value: number) => {
    applyData((prev) => ({ ...prev, goal: value }))
  }

  const updateCup = (value: number) => {
    applyData((prev) => ({ ...prev, mlPerGlass: value }))
  }

  const goToDrink = () => {
    setStep(2)
  }

  const addGlass = () => {
    if (!data || isCoolingDown) return
    setIsCoolingDown(true)
    setCanUndo(true)
    setShowDropFx(true)
    window.setTimeout(() => setShowDropFx(false), 800)
    window.setTimeout(() => setIsCoolingDown(false), 1000)

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(50)
    }

    applyData((prev) => {
      const nextDays = [...prev.days]
      const current = nextDays[idx]
      const nextGlasses = current.glasses + 1
      const nowAchieved = nextGlasses >= prev.goal
      nextDays[idx] = { ...current, glasses: nextGlasses, achieved: nowAchieved }
      return { ...prev, days: nextDays }
    })
  }

  useEffect(() => {
    if (!achievedToday) return
    setCelebration(true)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([100, 50, 100, 50, 100])
    }
    const t = window.setTimeout(() => setCelebration(false), 3000)
    return () => window.clearTimeout(t)
  }, [achievedToday])

  const undoLast = () => {
    if (!data || !canUndo) return
    applyData((prev) => {
      const nextDays = [...prev.days]
      const current = nextDays[idx]
      const nextGlasses = Math.max(0, current.glasses - 1)
      nextDays[idx] = { ...current, glasses: nextGlasses, achieved: nextGlasses >= prev.goal }
      return { ...prev, days: nextDays }
    })
    setCanUndo(false)
  }

  const closeDay = () => {
    setStep(3)
  }

  const finishDay = async () => {
    if (!data || working) return
    try {
      setWorking(true)
      await onComplete?.()
      applyData((prev) => {
        const nextDays = [...prev.days]
        const current = nextDays[idx]
        nextDays[idx] = { ...current, achieved: current.glasses >= prev.goal }
        const achievedCount = nextDays.filter((d) => d.achieved).length
        const sizeLevel = achievedCount >= 7 ? 4 : achievedCount >= 5 ? 3 : achievedCount >= 3 ? 2 : 1
        return { ...prev, days: nextDays, fishSize: sizeLevel }
      })
      if (dayNo >= 7) {
        setStage('final_done')
      } else {
        setStage('day_done')
      }
    } finally {
      setWorking(false)
    }
  }

  if (!data || !today) return null

  const achievedDays = data.days.filter((d) => d.achieved).length
  const totalMl = data.days.reduce((acc, d) => acc + d.glasses * data.mlPerGlass, 0)
  const bestDay = data.days.reduce(
    (best, day, i) => (day.glasses > best.glasses ? { day: i + 1, glasses: day.glasses } : best),
    { day: 1, glasses: data.days[0]?.glasses ?? 0 },
  )

  if (stage === 'final_done') {
    return (
      <div className="wi-wrap">
        <div className="wi-card wi-final">
          <FishTank glasses={goal} goal={goal} fishRadius={20} showCrown celebration />
          <p className="wi-final-title">🎉 7일 챌린지 완료!</p>
          <p className="wi-final-sub">물고기가 무사히 자랐어요!</p>

          <div className="wi-bars">
            {data.days.map((day, i) => {
              const ratio = Math.max(0, Math.min(1, day.glasses / goal))
              return (
                <div key={day.date} className="wi-bar-row">
                  <span className="wi-bar-label">Day{i + 1}</span>
                  <div className="wi-bar-track">
                    <div className="wi-bar-fill" style={{ width: `${ratio * 100}%`, background: day.achieved ? '#3B82F6' : '#BFDBFE' }} />
                  </div>
                  <span className="wi-bar-meta">{day.glasses}/{goal}</span>
                </div>
              )
            })}
          </div>

          <div className="wi-summary">
            <p>💧 7일 총 섭취량: {totalMl}ml</p>
            <p>✅ 목표 달성일: {achievedDays}일 / 7일</p>
            <p>🏆 최고 달성일: Day {bestDay.day} ({bestDay.glasses}잔)</p>
          </div>
          <button className="ct-btn-primary" onClick={() => router.push(redirectPath)}>처음으로 돌아가기</button>
        </div>
      </div>
    )
  }

  if (stage === 'day_done') {
    return (
      <div className="wi-wrap">
        <div className="wi-card">
          <FishTank glasses={glasses} goal={goal} fishRadius={fishRadius} readOnly />
          <p className="wi-summary-title">오늘 요약</p>
          <div className="wi-summary">
            <p>💧 총 {glasses}잔 ({todayMl}ml)</p>
            <p>🎯 목표: {goal}잔 → {glasses >= goal ? '달성 ✓' : `미달성 ${goal - glasses}잔 부족`}</p>
          </div>
          <p className="wi-fish-msg">{glasses >= goal ? '오늘도 잘 챙겨줬어요! 내일도 부탁해요 🐠' : '괜찮아요, 내일 더 잘 할 수 있어요 🤍'}</p>
          <button className="ct-btn-primary" onClick={() => router.push(redirectPath)}>내일 또 봐요! 🐠</button>
        </div>
      </div>
    )
  }

  return (
    <div className="wi-wrap">
      {stage === 'intro' ? (
        <div className="wi-card wi-intro">
          <p className="wi-icon">🐠</p>
          <p className="wi-title">내 물고기를 살려줘</p>
          <p className="wi-desc">
            오늘부터 7일, 물고기 한 마리를 맡게 됐어요.
            물을 마실 때마다 어항의 수위가 올라가고 물고기가 건강해져요.
            7일 동안 물고기를 건강하게 키워보세요.
          </p>
          <FishTank glasses={0} goal={goal} fishRadius={8} />
          <div className="wi-chip-row">
            <span className="wi-chip">💧 하루 8잔</span>
            <span className="wi-chip">📅 7일</span>
            <span className="wi-chip">🐠 물고기 성장</span>
          </div>
          <button className="ct-btn-primary" onClick={startChallenge}>물고기 입양하기 🐠</button>
        </div>
      ) : (
        <div className="wi-card">
          <div className="wi-progress3">
            <span className={`wi-dot ${step >= 1 ? 'active' : ''}`}>1</span>
            <span className={`wi-dot ${step >= 2 ? 'active' : ''}`}>2</span>
            <span className={`wi-dot ${step >= 3 ? 'active' : ''}`}>3</span>
          </div>

          {step === 1 ? (
            <>
              <p className="wi-step-title">S1. 오늘의 목표 설정</p>
              <p className="wi-desc">하루에 물을 몇 잔 마실 목표인가요?</p>
              <div className="wi-option-row">
                {GOALS.map((value) => (
                  <button key={value} className={`wi-option ${goal === value ? 'active' : ''}`} onClick={() => updateGoal(value)}>
                    {value}잔
                  </button>
                ))}
              </div>
              <p className="wi-desc">컵 용량을 골라주세요</p>
              <div className="wi-option-row">
                {CUP_SIZES.map((value) => (
                  <button key={value} className={`wi-option ${mlPerGlass === value ? 'active' : ''}`} onClick={() => updateCup(value)}>
                    {value}ml
                  </button>
                ))}
              </div>
              <p className="wi-help">하루 권장 수분 섭취량은 약 2L예요 (250ml 기준 8잔)</p>
              <button className="ct-btn-primary" onClick={goToDrink}>물고기 입양 완료! →</button>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <p className="wi-step-title">S2. 물 마시기 기록</p>
              <FishTank glasses={glasses} goal={goal} fishRadius={fishRadius} celebration={celebration} />
              <div className="wi-status">
                <p className="wi-status-main">{glasses} / {goal} 잔</p>
                <p className="wi-status-sub">오늘 {todayMl}ml 마셨어요</p>
              </div>

              <button className="wi-water-btn" onClick={addGlass} disabled={isCoolingDown}>
                <span>💧</span>
                <span>물 한 잔 마셨어요</span>
              </button>
              {showDropFx ? (
                <div className="wi-drop-fx">
                  <span>💧</span><span>💧</span><span>💧</span>
                </div>
              ) : null}
              {isCoolingDown ? <p className="wi-help">방금 기록했어요 ✓</p> : null}
              {achievedToday ? <p className="wi-success">🎉 오늘 목표 달성! 물고기가 행복해요</p> : null}
              <button className="ct-btn-text" onClick={undoLast} disabled={!canUndo}>마지막 기록 취소</button>

              <div className="wi-days">
                {data.days.map((day, i) => (
                  <span key={day.date} className="wi-day-pill">
                    Day{i + 1} {day.achieved ? '✓' : i === idx ? '🔵' : '○'}
                  </span>
                ))}
              </div>

              <button className={`ct-btn-primary ${!achievedToday ? 'wi-soft' : ''}`} onClick={closeDay}>
                {achievedToday ? '오늘 마무리하기 →' : '목표 미달성으로 마무리'}
              </button>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <p className="wi-step-title">S3. 하루 마무리</p>
              <FishTank glasses={glasses} goal={goal} fishRadius={fishRadius} readOnly />
              <div className="wi-summary">
                <p>💧 총 {glasses}잔 ({todayMl}ml)</p>
                <p>🎯 목표: {goal}잔 → {glasses >= goal ? '달성 ✓' : `미달성 ${goal - glasses}잔 부족`}</p>
              </div>
              <p className="wi-fish-msg">{glasses >= goal ? '오늘도 잘 챙겨줬어요! 내일도 부탁해요 🐠' : '괜찮아요, 내일 더 잘 할 수 있어요 🤍'}</p>
              <button className="ct-btn-primary" onClick={() => void finishDay()} disabled={working}>
                {working ? '저장 중...' : '마무리 저장'}
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
