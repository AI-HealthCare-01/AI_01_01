'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type Step = 1 | 2 | 3 | 4

type Strength =
  | '배려'
  | '공감'
  | '끈기'
  | '용기'
  | '성장'
  | '호기심'
  | '문제해결'
  | '창의성'
  | '성실'
  | '책임감'
  | '솔직함'

type SituationKey =
  | 'helped'
  | 'hard_task'
  | 'learned'
  | 'solved'
  | 'consistent'
  | 'expressed'

interface Payload {
  selectedSituations: string[]
  discoveredStrengths: string[]
  confirmedStrengths: string[]
  confidenceStatement: string
  nextAction: string
}

interface Props {
  onChange?: (summary: string) => void
  onComplete?: (payload: Payload) => Promise<void> | void
  redirectPath?: string
}

const SITUATIONS: Array<{ key: SituationKey; icon: string; title: string; desc: string; strengths: Strength[] }> = [
  { key: 'helped', icon: '🤝', title: '누군가를 도왔다', desc: '친구, 동료, 가족의 부탁을 들어줬어요', strengths: ['배려', '공감'] },
  { key: 'hard_task', icon: '💪', title: '어려운 일을 해냈다', desc: '하기 싫었지만 결국 해냈어요', strengths: ['끈기', '용기'] },
  { key: 'learned', icon: '📚', title: '뭔가를 배웠다', desc: '새로운 것을 시도하거나 익혔어요', strengths: ['성장', '호기심'] },
  { key: 'solved', icon: '🔧', title: '문제를 해결했다', desc: '막혔던 일을 풀어냈어요', strengths: ['문제해결', '창의성'] },
  { key: 'consistent', icon: '⏰', title: '꾸준히 했다', desc: '작은 것이라도 계속했어요', strengths: ['성실', '책임감'] },
  { key: 'expressed', icon: '💬', title: '마음을 표현했다', desc: '하고 싶은 말을 했거나 감정을 나눴어요', strengths: ['솔직함', '용기'] },
]

const DEFAULT_STRENGTHS: Strength[] = ['배려', '끈기', '성장']

const STRENGTH_META: Record<Strength, { icon: string; desc: string; sentence: string; recommendation: string[] }> = {
  배려: {
    icon: '💜',
    desc: '나는 주변 사람을 잘 살피는 사람이에요',
    sentence: '나는 주변을 따뜻하게 살피는 사람이다',
    recommendation: ['가까운 사람에게 먼저 연락해보기'],
  },
  공감: {
    icon: '💗',
    desc: '나는 상대의 마음을 잘 이해하는 사람이에요',
    sentence: '나는 상대의 마음을 잘 이해하는 사람이다',
    recommendation: ['가까운 사람에게 먼저 연락해보기'],
  },
  끈기: {
    icon: '💪',
    desc: '나는 포기하지 않고 계속 해내는 사람이에요',
    sentence: '나는 포기하지 않고 끝까지 해내는 사람이다',
    recommendation: ['오늘 미뤄둔 일 하나 끝내보기'],
  },
  용기: {
    icon: '🔥',
    desc: '나는 두려워도 한 걸음 내딛는 사람이에요',
    sentence: '나는 두려워도 한 걸음 나아가는 사람이다',
    recommendation: ['하고 싶었던 말 한 마디 해보기'],
  },
  성장: {
    icon: '✨',
    desc: '나는 어제보다 나아지려는 사람이에요',
    sentence: '나는 매일 조금씩 성장하는 사람이다',
    recommendation: ['관심 있는 것 10분 찾아보기'],
  },
  호기심: {
    icon: '🧠',
    desc: '나는 새로운 것을 즐기며 배우는 사람이에요',
    sentence: '나는 새로운 것을 즐기며 배우는 사람이다',
    recommendation: ['관심 있는 것 10분 찾아보기'],
  },
  문제해결: {
    icon: '🛠',
    desc: '나는 어려움 속에서도 길을 찾는 사람이에요',
    sentence: '나는 어려운 상황에서 길을 찾는 사람이다',
    recommendation: ['고민 중인 문제 종이에 써보기'],
  },
  창의성: {
    icon: '🎨',
    desc: '나는 새로운 방식으로 생각하는 사람이에요',
    sentence: '나는 새로운 방식으로 생각하는 사람이다',
    recommendation: ['평소와 다른 방법으로 뭔가 해보기'],
  },
  성실: {
    icon: '📌',
    desc: '나는 꾸준하게 노력하는 사람이에요',
    sentence: '나는 꾸준히 노력하는 사람이다',
    recommendation: ['오늘 미뤄둔 일 하나 끝내보기'],
  },
  책임감: {
    icon: '✅',
    desc: '나는 맡은 일을 끝까지 챙기는 사람이에요',
    sentence: '나는 맡은 일에 최선을 다하는 사람이다',
    recommendation: ['오늘 약속 하나 지켜보기'],
  },
  솔직함: {
    icon: '🗣',
    desc: '나는 나답게 마음을 표현하는 사람이에요',
    sentence: '나는 나답게 마음을 표현하는 사람이다',
    recommendation: ['하고 싶었던 말 한 마디 해보기'],
  },
}

const COMBO_SENTENCE_BY_PAIR: Record<string, string> = {
  '배려+끈기': '나는 주변을 살피며 끝까지 해내는 사람이다',
  '공감+용기': '나는 상대의 마음을 이해하며 용기 있게 행동하는 사람이다',
  '성장+호기심': '나는 호기심을 바탕으로 꾸준히 성장하는 사람이다',
  '문제해결+창의성': '나는 새로운 시각으로 문제를 해결하는 사람이다',
  '성실+책임감': '나는 꾸준하고 책임감 있게 행동하는 사람이다',
}

function pairKey(a: Strength, b: Strength): string {
  return [a, b].sort().join('+')
}

export function ConfidenceListWidget({ onChange, onComplete, redirectPath = '/challenge' }: Props) {
  const router = useRouter()

  const [stage, setStage] = useState<'intro' | 'active' | 'done'>('intro')
  const [step, setStep] = useState<Step>(1)

  const [selectedSituations, setSelectedSituations] = useState<Set<SituationKey>>(new Set())
  const [noneSelected, setNoneSelected] = useState(false)

  const [strengthVotes, setStrengthVotes] = useState<Record<Strength, 'up' | 'down' | undefined>>({} as Record<Strength, 'up' | 'down' | undefined>)

  const [confidenceStatement, setConfidenceStatement] = useState('')
  const [nextActionSelection, setNextActionSelection] = useState('')
  const [nextActionInput, setNextActionInput] = useState('')

  const [completed, setCompleted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const discoveredStrengths = useMemo<Strength[]>(() => {
    if (noneSelected || selectedSituations.size === 0) {
      return DEFAULT_STRENGTHS
    }
    const set = new Set<Strength>()
    for (const key of selectedSituations) {
      const row = SITUATIONS.find((item) => item.key === key)
      row?.strengths.forEach((s) => set.add(s))
    }
    return Array.from(set)
  }, [noneSelected, selectedSituations])

  const confirmedStrengths = useMemo<Strength[]>(() => {
    return discoveredStrengths.filter((s) => strengthVotes[s] === 'up')
  }, [discoveredStrengths, strengthVotes])

  const suggestions = useMemo(() => {
    const base = confirmedStrengths.map((s) => STRENGTH_META[s].sentence)
    if (confirmedStrengths.length >= 2) {
      const first = confirmedStrengths[0]
      const second = confirmedStrengths[1]
      const combo = COMBO_SENTENCE_BY_PAIR[pairKey(first, second)]
      if (combo) base.unshift(combo)
    }
    return Array.from(new Set(base))
  }, [confirmedStrengths])

  const recommendationCards = useMemo(() => {
    const items = confirmedStrengths.flatMap((s) => STRENGTH_META[s].recommendation)
    return Array.from(new Set(items))
  }, [confirmedStrengths])

  const nextAction = useMemo(() => nextActionInput.trim() || nextActionSelection, [nextActionInput, nextActionSelection])

  const canNext = useMemo(() => {
    if (step === 1) return selectedSituations.size > 0 || noneSelected
    if (step === 2) return confirmedStrengths.length > 0
    if (step === 3) return confidenceStatement.trim().length > 0
    return nextAction.trim().length > 0
  }, [step, selectedSituations.size, noneSelected, confirmedStrengths.length, confidenceStatement, nextAction])

  const payload = useMemo<Payload>(() => ({
    selectedSituations: noneSelected ? [] : Array.from(selectedSituations).map((key) => SITUATIONS.find((s) => s.key === key)?.title ?? key),
    discoveredStrengths,
    confirmedStrengths,
    confidenceStatement,
    nextAction,
  }), [noneSelected, selectedSituations, discoveredStrengths, confirmedStrengths, confidenceStatement, nextAction])

  useEffect(() => {
    const lines = [
      `selectedSituations: ${payload.selectedSituations.join(', ') || '-'}`,
      `discoveredStrengths: ${payload.discoveredStrengths.join(', ') || '-'}`,
      `confirmedStrengths: ${payload.confirmedStrengths.join(', ') || '-'}`,
      `confidenceStatement: ${payload.confidenceStatement || '-'}`,
      `nextAction: ${payload.nextAction || '-'}`,
    ]
    onChange?.(lines.join('\n'))
  }, [payload, onChange])

  const toggleSituation = (key: SituationKey) => {
    setNoneSelected(false)
    setSelectedSituations((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const markNone = () => {
    setSelectedSituations(new Set())
    setNoneSelected(true)
  }

  const voteStrength = (strength: Strength, vote: 'up' | 'down') => {
    setStrengthVotes((prev) => ({ ...prev, [strength]: vote }))
  }

  const goNext = () => {
    if (!canNext) return
    if (step < 4) setStep((step + 1) as Step)
  }

  const goPrev = () => {
    if (step <= 1) return
    setStep((step - 1) as Step)
  }

  const start = () => {
    setStage('active')
    setStep(1)
  }

  const complete = async () => {
    if (!canNext || submitting || completed) return
    try {
      setSubmitting(true)
      await onComplete?.(payload)
      setCompleted(true)
      setStage('done')
    } finally {
      setSubmitting(false)
    }
  }

  if (stage === 'intro') {
    return (
      <div className="cf-wrap">
        <div className="cf-card">
          <p className="cf-intro-icon">✨</p>
          <p className="cf-intro-title">나도 몰랐던 내 강점을 발견해보세요</p>
          <p className="cf-help">
            자신감은 거창한 성공이 아니라 일상의 작은 순간에서 나와요.
            몇 가지 질문에 답하다 보면 나만의 강점이 보이기 시작할 거예요.
          </p>
          <div className="cf-row">
            <span className="cf-chip">⏱ 10분</span>
            <span className="cf-chip">📅 2일</span>
            <span className="cf-chip">💡 강점 발견</span>
          </div>
          <div className="cf-summary-box">
            <p>Day 1 — 강점 탐색 (S1 + S2)</p>
            <p>Day 2 — 강점 정리 (S3 + S4)</p>
          </div>
          <button className="ct-btn-primary" onClick={start}>시작하기 →</button>
        </div>
      </div>
    )
  }

  if (stage === 'done') {
    return (
      <div className="cf-wrap">
        <div className="cf-card cf-done-card">
          <p className="cf-intro-icon">✨</p>
          <p className="cf-intro-title">나의 강점을 발견했어요!</p>

          <div className="cf-badges">
            {payload.confirmedStrengths.map((strength) => (
              <span key={strength} className="cf-strength-badge">{STRENGTH_META[strength as Strength].icon} {strength}</span>
            ))}
          </div>

          <div className="cf-statement-box">
            <p>{payload.confidenceStatement}</p>
          </div>

          <div className="cf-summary-box">
            <p>오늘의 한 걸음</p>
            <p>{payload.nextAction}</p>
          </div>

          <p className="cf-help">이 강점은 오늘도 당신 안에 있었어요 💜</p>
          <button className="ct-btn-primary" onClick={() => router.push(redirectPath)}>처음으로 돌아가기</button>
        </div>
      </div>
    )
  }

  return (
    <div className="cf-wrap">
      <div className="cf-progress">
        <button className="cf-back" onClick={goPrev} disabled={step === 1}>←</button>
        <p className="cf-title">현재 단계 {step} / 4</p>
        <div className="cf-dots">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={`cf-dot ${n <= step ? 'active' : ''}`} />
          ))}
        </div>
      </div>

      {step === 1 ? (
        <div className="cf-card">
          <p className="cf-section">S1. 최근 잘한 일 떠올리기</p>
          <p className="cf-help">최근 일주일 안에 이런 순간이 있었나요? 작은 것도 충분해요.</p>

          <div className="cf-situation-grid">
            {SITUATIONS.map((item) => {
              const active = selectedSituations.has(item.key)
              return (
                <button key={item.key} className={`cf-situation-card ${active ? 'active' : ''}`} onClick={() => toggleSituation(item.key)}>
                  <p className="cf-situation-title">{item.icon} {item.title}</p>
                  <p className="cf-situation-desc">{item.desc}</p>
                  {active ? <span className="cf-situation-check">✓</span> : null}
                </button>
              )
            })}
          </div>

          <button className="cf-none" onClick={markNone}>해당 없음</button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="cf-card">
          <p className="cf-section">S2. 강점 발견</p>
          <p className="cf-help">이 강점이 나랑 맞나요?</p>

          <div className="cf-strength-grid">
            {discoveredStrengths.map((strength) => {
              const vote = strengthVotes[strength]
              return (
                <div key={strength} className={`cf-strength-card ${vote === 'down' ? 'muted' : ''}`}>
                  <p className="cf-situation-title">{STRENGTH_META[strength].icon} {strength}</p>
                  <p className="cf-situation-desc">{STRENGTH_META[strength].desc}</p>
                  <div className="cf-row">
                    <button className={`cf-chip ${vote === 'up' ? 'active' : ''}`} onClick={() => voteStrength(strength, 'up')}>👍</button>
                    <button className={`cf-chip ${vote === 'down' ? 'active' : ''}`} onClick={() => voteStrength(strength, 'down')}>👎</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="cf-card">
          <p className="cf-section">S3. 나만의 강점 카드</p>
          <div className="cf-badges">
            {confirmedStrengths.map((strength) => (
              <span key={strength} className="cf-strength-badge">{STRENGTH_META[strength].icon} {strength}</span>
            ))}
          </div>

          <p className="cf-help">
            {confirmedStrengths.length <= 1
              ? '이게 바로 나의 핵심 강점이에요'
              : confirmedStrengths.length === 2
                ? '두 가지 강점을 가진 사람이에요'
                : '다양한 강점을 가진 사람이에요 🌟'}
          </p>

          <div className="cf-row">
            {suggestions.map((s) => (
              <button key={s} className="cf-suggest" onClick={() => setConfidenceStatement(s)}>{s}</button>
            ))}
          </div>

          <textarea className="cf-textarea" value={confidenceStatement} onChange={(e) => setConfidenceStatement(e.target.value)} />
        </div>
      ) : null}

      {step === 4 ? (
        <div className="cf-card">
          <p className="cf-section">S4. 앞으로의 한 걸음</p>
          <div className="cf-summary-box">
            <div className="cf-badges">
              {confirmedStrengths.map((strength) => (
                <span key={strength} className="cf-strength-badge">{STRENGTH_META[strength].icon} {strength}</span>
              ))}
            </div>
            <p>{confidenceStatement}</p>
          </div>

          <p className="cf-help">이 강점을 어디서 써볼 수 있을까요?</p>
          <div className="cf-row">
            {recommendationCards.map((item) => (
              <button key={item} className={`cf-chip ${nextActionSelection === item ? 'active' : ''}`} onClick={() => { setNextActionSelection(item); setNextActionInput('') }}>
                {item}
              </button>
            ))}
          </div>

          <input className="cf-input" value={nextActionInput} onChange={(e) => { setNextActionInput(e.target.value); setNextActionSelection('') }} />
        </div>
      ) : null}

      <div className="cf-footer">
        {step < 4 ? (
          <button className="ct-btn-primary" onClick={goNext} disabled={!canNext}>다음 단계 →</button>
        ) : (
          <button className="ct-btn-primary" onClick={() => void complete()} disabled={!canNext || submitting}>
            {submitting ? '처리 중...' : '자신감 리스트 완료 ✨'}
          </button>
        )}
      </div>
    </div>
  )
}
