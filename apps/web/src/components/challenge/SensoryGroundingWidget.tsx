'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Step = 1 | 2 | 3 | 4 | 5 | 6
type MoodChange = '😌 좀 나아졌어요' | '😐 비슷해요' | '⚡ 더 활기차졌어요'
type SenseKey = 'sight' | 'touch' | 'hearing' | 'smell' | 'taste'

interface Payload {
  sight: string[]
  touch: string[]
  hearing: string[]
  smell: string[]
  taste: string[]
  moodChange: string
}

interface Props {
  onChange?: (summary: string) => void
  onComplete?: (payload: Payload) => Promise<void> | void
  redirectPath?: string
}

type SenseDef = {
  icon: string
  key: SenseKey
  title: string
  subtitle: string
  target: number
  gradient: string
  accent: string
  chips: string[]
  nextLabel: string
}

const SENSE_STEPS: SenseDef[] = [
  {
    icon: '👀',
    key: 'sight',
    title: '지금 눈에 보이는 것들을 찾아보세요',
    subtitle: '색깔, 모양, 빛, 움직임 - 뭐든 좋아요',
    target: 5,
    gradient: 'linear-gradient(145deg, #FFF9C4 0%, #FFF3E0 100%)',
    accent: '#F59E0B',
    chips: ['🪟 창문', '🌿 식물', '💡 불빛', '📱 화면', '🪑 가구', '👗 옷', '🎨 색깔', '🌤 하늘', '📚 책', '🖼 그림', '👐 내 손', '🚗 차량', '☕ 컵', '🕯 그림자', '🌸 꽃', '📦 물건', '🪞 거울', '🏠 벽', '✏️ 선', '💧 물'],
    nextLabel: '다음 감각으로 →',
  },
  {
    icon: '🤲',
    key: 'touch',
    title: '지금 손이나 피부로 느껴지는 것들은요?',
    subtitle: '온도, 질감, 무게, 압력 - 느껴보세요',
    target: 4,
    gradient: 'linear-gradient(145deg, #E8F5E9 0%, #F1F8E9 100%)',
    accent: '#38A169',
    chips: ['🧴 부드러움', '🪨 거칠음', '🌡 따뜻함', '❄️ 차가움', '💨 바람', '👕 옷감', '🖥 책상', '🛋 쿠션', '📱 폰 표면', '🧦 양말', '💍 금속', '🌿 식물', '💧 습기', '🔑 딱딱함', '🪑 의자'],
    nextLabel: '다음 감각으로 →',
  },
  {
    icon: '👂',
    key: 'hearing',
    title: '잠깐 눈을 감고 들어보세요',
    subtitle: '멀리서 들리는 소리도 괜찮아요',
    target: 3,
    gradient: 'linear-gradient(145deg, #E3F2FD 0%, #E8EAF6 100%)',
    accent: '#3B82F6',
    chips: ['🚗 차 소리', '🌬 바람', '🎵 음악', '📺 TV', '👥 사람 목소리', '🐦 새소리', '⌨️ 타이핑', '🔔 알림음', '🚰 물소리', '🌿 나뭇잎', '❄️ 에어컨', '🔧 기계음', '👣 발소리', '🕐 시계', '💬 대화소리'],
    nextLabel: '다음 감각으로 →',
  },
  {
    icon: '👃',
    key: 'smell',
    title: '코로 천천히 숨을 들이쉬어 보세요',
    subtitle: '아주 희미한 냄새도 괜찮아요',
    target: 2,
    gradient: 'linear-gradient(145deg, #FCE4EC 0%, #FFF0F5 100%)',
    accent: '#EC4899',
    chips: ['☕ 커피', '🌸 꽃향기', '🍃 풀냄새', '🧼 비누', '🍳 음식', '💨 공기', '🌧 비냄새', '🕯 향초', '📚 종이', '🧴 로션', '🌲 나무', '🫧 청결함'],
    nextLabel: '다음 감각으로 →',
  },
  {
    icon: '👅',
    key: 'taste',
    title: '마지막! 입 안이나 목에서 느껴지는 건요?',
    subtitle: '지금 느껴지는 맛이나 감촉 하나면 돼요',
    target: 1,
    gradient: 'linear-gradient(145deg, #EDE7F6 0%, #F3E8FF 100%)',
    accent: '#8B5CF6',
    chips: ['💧 물맛', '☕ 쓴맛', '🍬 단맛', '🫙 짠맛', '🍋 신맛', '🫧 청량함', '👅 텅 빔', '🌿 상쾌함', '🥛 부드러움', '🔥 매운맛'],
    nextLabel: '감각 지도 완성 →',
  },
]

const STEP_ICONS = ['👀', '🤲', '👂', '👃', '👅', '🌟']

function moodMessage(mood: string): string {
  if (mood.startsWith('😌')) return '잠깐의 탐험이 도움이 됐군요 🌿'
  if (mood.startsWith('⚡')) return '감각이 살아났어요! 오늘도 파이팅 🌟'
  return '그래도 지금 이 순간에 있었어요 💙'
}

function wedgePath(cx: number, cy: number, inner: number, outer: number, start: number, end: number): string {
  const p1 = [cx + inner * Math.cos(start), cy + inner * Math.sin(start)]
  const p2 = [cx + outer * Math.cos(start), cy + outer * Math.sin(start)]
  const p3 = [cx + outer * Math.cos(end), cy + outer * Math.sin(end)]
  const p4 = [cx + inner * Math.cos(end), cy + inner * Math.sin(end)]
  return `M ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]} A ${outer} ${outer} 0 0 1 ${p3[0]} ${p3[1]} L ${p4[0]} ${p4[1]} A ${inner} ${inner} 0 0 0 ${p1[0]} ${p1[1]} Z`
}

function SenseMap({
  payload,
  animated,
}: {
  payload: Payload
  animated?: boolean
}) {
  const sectors = [
    { icon: '👀', label: '시각', chips: payload.sight.slice(0, 3), color: '#F59E0B', start: -Math.PI * 0.9, end: -Math.PI * 0.58 },
    { icon: '🤲', label: '촉각', chips: payload.touch.slice(0, 2), color: '#38A169', start: -Math.PI * 0.5, end: -Math.PI * 0.18 },
    { icon: '👂', label: '청각', chips: payload.hearing.slice(0, 2), color: '#3B82F6', start: -Math.PI * 0.1, end: Math.PI * 0.22 },
    { icon: '👃', label: '후각', chips: payload.smell.slice(0, 1), color: '#EC4899', start: Math.PI * 0.3, end: Math.PI * 0.62 },
    { icon: '👅', label: '미각', chips: payload.taste.slice(0, 1), color: '#8B5CF6', start: Math.PI * 0.7, end: Math.PI * 1.02 },
  ]
  const cx = 190
  const cy = 160
  const inner = 46
  const outer = 122

  return (
    <div className="sg-map-wrap">
      <svg className="sg-map" viewBox="0 0 380 320" role="img" aria-label="감각 지도">
        {sectors.map((sector, index) => {
          const mid = (sector.start + sector.end) / 2
          const labelX = cx + 142 * Math.cos(mid)
          const labelY = cy + 142 * Math.sin(mid)
          const chipX = cx + 172 * Math.cos(mid)
          const chipY = cy + 172 * Math.sin(mid)
          return (
            <g
              key={sector.label}
              className={animated ? 'sg-map-sector sg-map-sector--animated' : 'sg-map-sector'}
              style={{ animationDelay: `${index * 0.3}s` }}
            >
              <path d={wedgePath(cx, cy, inner, outer, sector.start, sector.end)} fill={sector.color} opacity="0.22" />
              <line x1={cx} y1={cy} x2={labelX} y2={labelY} stroke={sector.color} strokeWidth="2" />
              <text x={labelX} y={labelY - 2} textAnchor="middle" className="sg-map-icon">{sector.icon}</text>
              <text x={labelX} y={labelY + 14} textAnchor="middle" className="sg-map-label">{sector.label}</text>
              <text x={chipX} y={chipY} textAnchor="middle" className="sg-map-chip">{sector.chips.join(' · ') || '-'}</text>
            </g>
          )
        })}
        <circle cx={cx} cy={cy} r="34" fill="#FFFFFF" stroke="#D1D5DB" strokeWidth="2" />
        <text x={cx} y={cy + 4} textAnchor="middle" className="sg-map-center">나</text>
      </svg>
    </div>
  )
}

export function SensoryGroundingWidget({ onChange, onComplete, redirectPath = '/challenge' }: Props) {
  const router = useRouter()

  const [stage, setStage] = useState<'intro' | 'active' | 'done'>('intro')
  const [step, setStep] = useState<Step>(1)
  const [soundCount, setSoundCount] = useState(3)
  const [showSoundChips, setShowSoundChips] = useState(false)
  const [showSmellChips, setShowSmellChips] = useState(false)
  const [customSightInput, setCustomSightInput] = useState('')
  const [customSightChips, setCustomSightChips] = useState<string[]>([])
  const [moodChange, setMoodChange] = useState<MoodChange | ''>('')
  const [submitting, setSubmitting] = useState(false)

  const [selectedSenses, setSelectedSenses] = useState<Record<SenseKey, string[]>>({
    sight: [],
    touch: [],
    hearing: [],
    smell: [],
    taste: [],
  })

  const reachedRef = useRef<Record<string, boolean>>({})

  const introStyle = useMemo(
    () => ({
      background: 'linear-gradient(130deg, #FFF9C4 0%, #E8F5E9 25%, #E3F2FD 50%, #FCE4EC 75%, #EDE7F6 100%)',
      transition: 'background 0.5s ease',
    }),
    [],
  )

  const currentSense = step <= 5 ? SENSE_STEPS[step - 1] : null
  const activeBackground = step === 6
    ? 'linear-gradient(130deg, #FFF9C4 0%, #E8F5E9 25%, #E3F2FD 50%, #FCE4EC 75%, #EDE7F6 100%)'
    : (currentSense?.gradient ?? '#fff')

  const optionsByStep = useMemo(() => {
    return {
      sight: [...SENSE_STEPS[0].chips, ...customSightChips],
      touch: SENSE_STEPS[1].chips,
      hearing: SENSE_STEPS[2].chips,
      smell: SENSE_STEPS[3].chips,
      taste: SENSE_STEPS[4].chips,
    }
  }, [customSightChips])

  const remaining = useMemo(() => {
    if (!currentSense) return 0
    const count = selectedSenses[currentSense.key].length
    return Math.max(0, currentSense.target - count)
  }, [currentSense, selectedSenses])

  const canNext = useMemo(() => {
    if (step <= 5 && currentSense) {
      return selectedSenses[currentSense.key].length >= currentSense.target
    }
    if (step === 6) return Boolean(moodChange)
    return false
  }, [step, currentSense, selectedSenses, moodChange])

  useEffect(() => {
    const lines = [
      `sight: ${selectedSenses.sight.join(', ') || '-'}`,
      `touch: ${selectedSenses.touch.join(', ') || '-'}`,
      `hearing: ${selectedSenses.hearing.join(', ') || '-'}`,
      `smell: ${selectedSenses.smell.join(', ') || '-'}`,
      `taste: ${selectedSenses.taste.join(', ') || '-'}`,
      `moodChange: ${moodChange || '-'}`,
    ]
    onChange?.(lines.join('\n'))
  }, [selectedSenses, moodChange, onChange])

  useEffect(() => {
    if (step !== 3) {
      setShowSoundChips(false)
      setSoundCount(3)
      return
    }
    setShowSoundChips(false)
    setSoundCount(3)
    const timerA = window.setTimeout(() => setSoundCount(2), 1000)
    const timerB = window.setTimeout(() => setSoundCount(1), 2000)
    const timerC = window.setTimeout(() => {
      setSoundCount(0)
      setShowSoundChips(true)
    }, 3000)
    return () => {
      window.clearTimeout(timerA)
      window.clearTimeout(timerB)
      window.clearTimeout(timerC)
    }
  }, [step])

  useEffect(() => {
    if (step !== 4) {
      setShowSmellChips(false)
      return
    }
    setShowSmellChips(false)
    const timer = window.setTimeout(() => setShowSmellChips(true), 6000)
    return () => window.clearTimeout(timer)
  }, [step])

  useEffect(() => {
    if (!currentSense || step > 5) return
    const key = `step-${step}`
    const hit = selectedSenses[currentSense.key].length >= currentSense.target
    if (hit && !reachedRef.current[key]) {
      reachedRef.current[key] = true
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(100)
      }
    }
    if (!hit) reachedRef.current[key] = false
  }, [step, currentSense, selectedSenses])

  const toggleChip = (chip: string) => {
    if (!currentSense) return
    const key = currentSense.key
    const target = currentSense.target
    setSelectedSenses((prev) => {
      const current = prev[key]
      const exists = current.includes(chip)
      if (exists) {
        return { ...prev, [key]: current.filter((v) => v !== chip) }
      }
      if (current.length >= target) return prev
      return { ...prev, [key]: [...current, chip] }
    })
  }

  const addCustomSight = () => {
    const value = customSightInput.trim()
    if (!value) return
    if (optionsByStep.sight.includes(value)) {
      setCustomSightInput('')
      return
    }
    setCustomSightChips((prev) => [...prev, value])
    setCustomSightInput('')
  }

  const goNext = () => {
    if (!canNext) return
    if (step < 6) {
      setStep((step + 1) as Step)
      return
    }
  }

  const goPrev = () => {
    if (step <= 1) return
    setStep((step - 1) as Step)
  }

  const start = () => {
    setStage('active')
    setStep(1)
  }

  const finish = async () => {
    if (!moodChange || submitting) return
    const payload: Payload = { ...selectedSenses, moodChange }
    try {
      setSubmitting(true)
      await onComplete?.(payload)
      setStage('done')
    } finally {
      setSubmitting(false)
    }
  }

  const resetAll = () => {
    setStage('intro')
    setStep(1)
    setSoundCount(3)
    setShowSoundChips(false)
    setShowSmellChips(false)
    setCustomSightInput('')
    setCustomSightChips([])
    setMoodChange('')
    setSelectedSenses({
      sight: [],
      touch: [],
      hearing: [],
      smell: [],
      taste: [],
    })
  }

  if (stage === 'intro') {
    return (
      <div className="sg-wrap">
        <div className="sg-card sg-intro" style={introStyle}>
          <p className="sg-intro-icon">🌈</p>
          <p className="sg-intro-title">지금 이 순간으로 돌아오는 5초</p>
          <p className="sg-intro-desc">
            머릿속이 복잡할 때, 감각에 집중하면 생각이 멈추고 지금 여기로 돌아와요.
            5가지 감각을 하나씩 탐험해보세요.
          </p>
          <div className="sg-chip-row">
            <span className="sg-chip">⚡ 5분</span>
            <span className="sg-chip">🎯 1회 완성</span>
            <span className="sg-chip">🌈 기분 전환</span>
          </div>
          <div className="sg-preview">
            <span>👀 5</span><span>→</span><span>🤲 4</span><span>→</span><span>👂 3</span><span>→</span><span>👃 2</span><span>→</span><span>👅 1</span>
          </div>
          <button className="ct-btn-primary" onClick={start}>탐험 시작 →</button>
        </div>
      </div>
    )
  }

  const payload: Payload = { ...selectedSenses, moodChange: moodChange || '' }

  if (stage === 'done') {
    return (
      <div className="sg-wrap">
        <div className="sg-card">
          <SenseMap payload={payload} />
          <div className="sg-summary">
            <p>👀 시각: {payload.sight.join(', ') || '-'}</p>
            <p>🤲 촉각: {payload.touch.join(', ') || '-'}</p>
            <p>👂 청각: {payload.hearing.join(', ') || '-'}</p>
            <p>👃 후각: {payload.smell.join(', ') || '-'}</p>
            <p>👅 미각: {payload.taste.join(', ') || '-'}</p>
            <p>기분 변화: {payload.moodChange || '-'}</p>
          </div>
          <p className="sg-footer-msg">{moodMessage(payload.moodChange)}</p>
          <div className="sg-action-row">
            <button className="ct-btn-secondary" onClick={resetAll}>다시 탐험하기</button>
            <button className="ct-btn-primary" onClick={() => router.push(redirectPath)}>처음으로</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="sg-wrap">
      <div className="sg-card sg-active" style={{ background: activeBackground, transition: 'background 0.5s ease' }}>
        <div className="sg-progress">
          <button className="sg-back" onClick={goPrev} disabled={step === 1}>←</button>
          <div className="sg-progress-icons">
            {STEP_ICONS.map((icon, idx) => {
              const current = idx + 1 === step
              const done = idx + 1 < step
              return (
                <span key={icon} className={`sg-progress-icon ${current ? 'current' : ''} ${done ? 'done' : ''}`}>
                  {done ? '✓' : icon}
                </span>
              )
            })}
          </div>
        </div>

        {step <= 5 && currentSense ? (
          <>
            <p className="sg-step-title">{`S${step}. ${currentSense.icon} ${currentSense.key === 'sight' ? '보이는 것' : currentSense.key === 'touch' ? '만져지는 것' : currentSense.key === 'hearing' ? '들리는 것' : currentSense.key === 'smell' ? '맡아지는 것' : '느껴지는 것'} ${currentSense.target}가지`}</p>
            <div className="sg-counter-wrap">
              <span key={`${step}-${remaining}`} className="sg-counter">{remaining}</span>
            </div>
            <p className="sg-guide">{currentSense.title}</p>
            <p className="sg-guide-sub">{currentSense.subtitle}</p>

            {step === 3 && !showSoundChips ? (
              <div className="sg-audio-wait">
                <div className="sg-wave">
                  <span />
                  <span />
                  <span />
                </div>
                <p className="sg-countdown">{soundCount > 0 ? `${soundCount}…` : '선택 시작!'}</p>
              </div>
            ) : null}

            {step === 4 && !showSmellChips ? (
              <div className="sg-breathing">
                <div className="sg-breath-circle" />
                <p className="sg-guide-sub">들이쉬기 · 내쉬기</p>
                <button className="ct-btn-text" onClick={() => setShowSmellChips(true)}>건너뛰기</button>
              </div>
            ) : null}

            {(step !== 3 || showSoundChips) && (step !== 4 || showSmellChips) ? (
              <>
                <div className="sg-chip-grid">
                  {optionsByStep[currentSense.key].map((chip: string) => {
                    const isSelected = selectedSenses[currentSense.key].includes(chip)
                    const blocked = !isSelected && selectedSenses[currentSense.key].length >= currentSense.target
                    return (
                      <button
                        key={chip}
                        className={`sg-select-chip ${isSelected ? 'active' : ''}`}
                        style={isSelected ? { borderColor: currentSense.accent, color: currentSense.accent } : undefined}
                        onClick={() => toggleChip(chip)}
                        disabled={blocked}
                      >
                        {chip}
                      </button>
                    )
                  })}
                </div>
                {step === 1 ? (
                  <div className="sg-custom-row">
                    <button className="ct-btn-secondary" onClick={addCustomSight}>+ 직접 추가</button>
                    <input
                      className="sg-input"
                      value={customSightInput}
                      onChange={(e) => setCustomSightInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addCustomSight()
                        }
                      }}
                      placeholder="직접 발견한 항목 입력"
                    />
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="sg-next-row">
              <button className="ct-btn-primary" onClick={goNext} disabled={!canNext}>{currentSense.nextLabel}</button>
            </div>
          </>
        ) : null}

        {step === 6 ? (
          <>
            <p className="sg-complete-title">🌟 감각 탐험 완료!</p>
            <SenseMap payload={payload} animated />
            <p className="sg-guide">탐험 전후로 기분이 어때요?</p>
            <div className="sg-chip-row">
              {(['😌 좀 나아졌어요', '😐 비슷해요', '⚡ 더 활기차졌어요'] as MoodChange[]).map((item) => (
                <button key={item} className={`sg-select-chip ${moodChange === item ? 'active' : ''}`} onClick={() => setMoodChange(item)}>
                  {item}
                </button>
              ))}
            </div>
            <div className="sg-next-row">
              <button className="ct-btn-primary" onClick={() => void finish()} disabled={!moodChange || submitting}>
                {submitting ? '저장 중...' : '오늘의 감각 저장 ✨'}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
