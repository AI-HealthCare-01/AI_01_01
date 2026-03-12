'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type Zone = '가족' | '친구' | '직장/학교' | '기타'
type Closeness = '매우 가까움' | '가까움' | '보통' | '멀어짐'
type Step = 1 | 2 | 3 | 4 | 5

export type BubbleNode = {
  name: string
  x: number
  y: number
  r: number
  zone: Zone
  color: string
  isCore: boolean
  changed: boolean
}

interface InterpersonalMapState {
  mood: string
  people: string[]
  placements: { name: string; zone: string }[]
  coreRelations: string[]
  records: { name: string; note: string }[]
  focus: string
  action: { text: string; date: string }
  satisfaction: string
}

interface HistoryEntry {
  date: string
  mood: string
  people: string[]
  placements: Record<string, string>
  closeness: Record<string, string>
  core: string[]
  focus: string
  action: string
}

interface StoredData {
  history: HistoryEntry[]
  lastPeople: string[]
  lastPlacements: Record<string, string>
  lastCloseness: Record<string, string>
}

interface Props {
  onChange?: (summary: string) => void
  onComplete?: (state: InterpersonalMapState) => Promise<void> | void
  redirectPath?: string
}

const STORAGE_KEY = 'interpersonal_map_v4'
const WIDTH = 340
const HEIGHT = 300

const STEP_COUNT = 5
const ZONES: Zone[] = ['가족', '친구', '직장/학교', '기타']
const CLOSENESS_OPTIONS: Closeness[] = ['매우 가까움', '가까움', '보통', '멀어짐']
const MOODS = ['😔', '😐', '🙂', '😊', '🥰']
const FOCUS_OPTIONS = ['관계 강화', '새로운 연결', '거리 두기', '감사 표현']
const SATISFACTIONS = ['😕', '😊', '🥰']

const ZONE_META: Record<Zone, { color: string; center: { x: number; y: number } }> = {
  가족: { color: '#E53E3E', center: { x: 85, y: 85 } },
  친구: { color: '#2B6CB0', center: { x: 255, y: 85 } },
  '직장/학교': { color: '#276749', center: { x: 85, y: 215 } },
  기타: { color: '#6B46C1', center: { x: 255, y: 215 } },
}

function closenessRadius(level: string | undefined): number {
  if (level === '매우 가까움') return 26
  if (level === '가까움') return 23
  if (level === '보통') return 19
  return 15
}

function truncateName(name: string): string {
  if (name.length <= 4) return name
  return `${name.slice(0, 4)}…`
}

function formatKoreanDate(d = new Date()): string {
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}

function parseStoredData(raw: string | null): StoredData {
  if (!raw) {
    return { history: [], lastPeople: [], lastPlacements: {}, lastCloseness: {} }
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredData>
    return {
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, 10) : [],
      lastPeople: Array.isArray(parsed.lastPeople) ? parsed.lastPeople : [],
      lastPlacements: parsed.lastPlacements ?? {},
      lastCloseness: parsed.lastCloseness ?? {},
    }
  } catch {
    return { history: [], lastPeople: [], lastPlacements: {}, lastCloseness: {} }
  }
}

export function computeBubbleLayout(
  people: string[],
  placements: Record<string, string>,
  closeness: Record<string, string>,
  coreRelations: string[],
  previousPlacements: Record<string, string>,
  previousCloseness: Record<string, string>,
): BubbleNode[] {
  const grouped = ZONES.map((zone) => ({
    zone,
    names: people.filter((name) => placements[name] === zone && Boolean(closeness[name])),
  }))

  const nodes: BubbleNode[] = []

  for (const group of grouped) {
    const center = ZONE_META[group.zone].center
    const color = ZONE_META[group.zone].color
    const count = group.names.length

    if (count === 0) continue

    if (count === 1) {
      const name = group.names[0]
      nodes.push({
        name,
        x: center.x,
        y: center.y,
        r: closenessRadius(closeness[name]),
        zone: group.zone,
        color,
        isCore: coreRelations.includes(name),
        changed:
          (Boolean(previousPlacements[name]) && previousPlacements[name] !== placements[name]) ||
          (Boolean(previousCloseness[name]) && previousCloseness[name] !== closeness[name]),
      })
      continue
    }

    const spread = 24 + Math.min(30, count * 6)
    group.names.forEach((name, idx) => {
      const angle = (Math.PI * 2 * idx) / count
      nodes.push({
        name,
        x: center.x + Math.cos(angle) * spread,
        y: center.y + Math.sin(angle) * spread,
        r: closenessRadius(closeness[name]),
        zone: group.zone,
        color,
        isCore: coreRelations.includes(name),
        changed:
          (Boolean(previousPlacements[name]) && previousPlacements[name] !== placements[name]) ||
          (Boolean(previousCloseness[name]) && previousCloseness[name] !== closeness[name]),
      })
    })
  }

  return nodes
}

function buildChangeSummary(
  previousPeople: string[],
  people: string[],
  previousPlacements: Record<string, string>,
  placements: Record<string, string>,
  previousCloseness: Record<string, string>,
  closeness: Record<string, string>,
): string[] {
  const lines: string[] = []

  const added = people.filter((name) => !previousPeople.includes(name))
  if (added.length > 0) {
    lines.push(`✨ 새로 추가: ${added.join(', ')}`)
  }

  people.forEach((name) => {
    const prevZone = previousPlacements[name]
    const currentZone = placements[name]
    if (prevZone && currentZone && prevZone !== currentZone) {
      lines.push(`${name} · 영역 ${prevZone} → ${currentZone}`)
    }

    const prevClose = previousCloseness[name]
    const currentClose = closeness[name]
    if (prevClose && currentClose && prevClose !== currentClose) {
      lines.push(`${name} · 친밀도 ${prevClose} → ${currentClose}`)
    }
  })

  if (lines.length === 0) {
    lines.push('이전과 동일한 관계 구성이에요')
  }

  return lines
}

interface BubbleChartProps {
  nodes: BubbleNode[]
  showLegend?: boolean
  readOnly?: boolean
  width?: number
  height?: number
}

export function BubbleChart({ nodes, showLegend = false, readOnly = false, width, height }: BubbleChartProps) {
  return (
    <div className={`imw-chart-wrap ${readOnly ? 'imw-chart-wrap--readonly' : ''}`}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="imw-chart"
        role="img"
        aria-label="관계 버블 지도"
        style={{ width: width ? `${width}px` : undefined, height: height ? `${height}px` : undefined }}
      >
        <rect x="0" y="0" width="170" height="150" fill="var(--bg-elevated)" />
        <rect x="170" y="0" width="170" height="150" fill="var(--bg-elevated)" />
        <rect x="0" y="150" width="170" height="150" fill="var(--bg-elevated)" />
        <rect x="170" y="150" width="170" height="150" fill="var(--bg-elevated)" />

        <line x1="170" y1="0" x2="170" y2="300" stroke="var(--border-default)" strokeDasharray="4 4" />
        <line x1="0" y1="150" x2="340" y2="150" stroke="var(--border-default)" strokeDasharray="4 4" />

        <text x="12" y="22" className="imw-chart-label">가족</text>
        <text x="182" y="22" className="imw-chart-label">친구</text>
        <text x="12" y="172" className="imw-chart-label">직장/학교</text>
        <text x="182" y="172" className="imw-chart-label">기타</text>

        {nodes.map((node) => (
          <g key={node.name}>
            {node.changed ? (
              <circle
                cx={node.x}
                cy={node.y}
                r={node.r + 6}
                fill="none"
                stroke="var(--sunlight-primary)"
                strokeWidth="2"
                strokeDasharray="4 3"
              />
            ) : null}
            {node.isCore ? (
              <circle cx={node.x} cy={node.y} r={node.r + 3} fill="none" stroke="var(--sunlight-accent)" strokeWidth="3" />
            ) : null}
            <circle cx={node.x} cy={node.y} r={node.r} fill={node.color} opacity="0.92" />
            <text x={node.x} y={node.y + 4} textAnchor="middle" className="imw-chart-node-text">
              {truncateName(node.name)}
            </text>
            {node.isCore ? (
              <text x={node.x} y={node.y + node.r + 14} textAnchor="middle" className="imw-chart-star">⭐</text>
            ) : null}
          </g>
        ))}
      </svg>

      {showLegend ? (
        <div className="imw-legend">
          <span className="imw-legend-item"><i style={{ background: '#E53E3E' }} />가족</span>
          <span className="imw-legend-item"><i style={{ background: '#2B6CB0' }} />친구</span>
          <span className="imw-legend-item"><i style={{ background: '#276749' }} />직장/학교</span>
          <span className="imw-legend-item"><i style={{ background: '#6B46C1' }} />기타</span>
          <span className="imw-legend-help">● 크기 = 친밀도</span>
          <span className="imw-legend-help">⭐ = 핵심관계</span>
          <span className="imw-legend-help">╌ 변화</span>
        </div>
      ) : null}
    </div>
  )
}

export function InterpersonalMapWidget({ onChange, onComplete, redirectPath = '/challenge' }: Props) {
  const router = useRouter()

  const [stage, setStage] = useState<'start' | 'active' | 'done'>('start')
  const [step, setStep] = useState<Step>(1)
  const [mood, setMood] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [people, setPeople] = useState<string[]>([])
  const [placements, setPlacements] = useState<Record<string, string>>({})
  const [closeness, setCloseness] = useState<Record<string, string>>({})
  const [coreRelations, setCoreRelations] = useState<string[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [focus, setFocus] = useState('')
  const [actionText, setActionText] = useState('')
  const [actionDate, setActionDate] = useState('')
  const [satisfaction, setSatisfaction] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [previousPeople, setPreviousPeople] = useState<string[]>([])
  const [previousPlacements, setPreviousPlacements] = useState<Record<string, string>>({})
  const [previousCloseness, setPreviousCloseness] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = parseStoredData(window.localStorage.getItem(STORAGE_KEY))
    setHistory(stored.history)
    setPreviousPeople(stored.lastPeople)
    setPreviousPlacements(stored.lastPlacements)
    setPreviousCloseness(stored.lastCloseness)
  }, [])

  useEffect(() => {
    if (step !== 1 || !mood || stage !== 'active') return
    const t = window.setTimeout(() => setStep(2), 380)
    return () => window.clearTimeout(t)
  }, [mood, step, stage])

  const hasPrevious = previousPeople.length > 0

  const nodes = useMemo(
    () => computeBubbleLayout(people, placements, closeness, coreRelations, previousPlacements, previousCloseness),
    [people, placements, closeness, coreRelations, previousPlacements, previousCloseness],
  )

  const previousNodes = useMemo(
    () => computeBubbleLayout(previousPeople, previousPlacements, previousCloseness, [], {}, {}),
    [previousPeople, previousPlacements, previousCloseness],
  )

  const changeSummary = useMemo(
    () => buildChangeSummary(previousPeople, people, previousPlacements, placements, previousCloseness, closeness),
    [previousPeople, people, previousPlacements, placements, previousCloseness, closeness],
  )

  const allPeopleConfigured = useMemo(
    () => people.length > 0 && people.every((name) => Boolean(placements[name]) && Boolean(closeness[name])),
    [people, placements, closeness],
  )

  const stepReady = useMemo(() => {
    if (step === 1) return Boolean(mood)
    if (step === 2) return allPeopleConfigured
    if (step === 3) return coreRelations.length > 0
    if (step === 4) return Boolean(focus) && Boolean(actionText.trim())
    return Boolean(satisfaction)
  }, [step, mood, allPeopleConfigured, coreRelations.length, focus, actionText, satisfaction])

  const stateForSubmit = useMemo<InterpersonalMapState>(() => {
    return {
      mood,
      people,
      placements: people
        .filter((name) => placements[name])
        .map((name) => ({ name, zone: placements[name] })),
      coreRelations,
      records: coreRelations.map((name) => ({ name, note: notes[name] ?? '' })),
      focus,
      action: { text: actionText, date: actionDate },
      satisfaction,
    }
  }, [mood, people, placements, coreRelations, notes, focus, actionText, actionDate, satisfaction])

  const executionSummary = useMemo(() => {
    const lines = [
      `현재 상태: ${mood || '미선택'}`,
      `사람: ${people.join(', ') || '없음'}`,
      `핵심 관계: ${coreRelations.join(', ') || '없음'}`,
      `초점: ${focus || '미선택'}`,
      `행동 계획: ${actionText || '미입력'}${actionDate ? ` (${actionDate})` : ''}`,
      `만족도: ${satisfaction || '미선택'}`,
    ]
    return lines.join('\n')
  }, [mood, people, coreRelations, focus, actionText, actionDate, satisfaction])

  useEffect(() => {
    onChange?.(executionSummary)
  }, [executionSummary, onChange])

  const persistData = () => {
    if (typeof window === 'undefined') return

    const nextEntry: HistoryEntry = {
      date: formatKoreanDate(),
      mood,
      people,
      placements,
      closeness,
      core: coreRelations,
      focus,
      action: `${actionText}${actionDate ? ` (${actionDate})` : ''}`,
    }

    const nextHistory = [nextEntry, ...history].slice(0, 10)
    const payload: StoredData = {
      history: nextHistory,
      lastPeople: people,
      lastPlacements: placements,
      lastCloseness: closeness,
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    setHistory(nextHistory)
    setPreviousPeople(people)
    setPreviousPlacements(placements)
    setPreviousCloseness(closeness)
  }

  const goNext = () => {
    if (!stepReady || step >= STEP_COUNT) return
    setStep((step + 1) as Step)
  }

  const goPrev = () => {
    if (step <= 1) return
    setStep((step - 1) as Step)
  }

  const onAddPerson = () => {
    const name = nameInput.trim()
    if (!name) return
    if (people.includes(name)) {
      setNameInput('')
      return
    }
    setPeople((prev) => [...prev, name])
    setNameInput('')
  }

  const onRemovePerson = (name: string) => {
    setPeople((prev) => prev.filter((item) => item !== name))
    setPlacements((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
    setCloseness((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
    setCoreRelations((prev) => prev.filter((item) => item !== name))
    setNotes((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  const toggleCore = (name: string) => {
    setCoreRelations((prev) => {
      if (prev.includes(name)) return prev.filter((item) => item !== name)
      if (prev.length >= 3) return prev
      return [...prev, name]
    })
  }

  const startFresh = () => {
    setStage('active')
    setStep(1)
    setMood('')
    setPeople([])
    setPlacements({})
    setCloseness({})
    setCoreRelations([])
    setNotes({})
    setFocus('')
    setActionText('')
    setActionDate('')
    setSatisfaction('')
    setSubmitError(null)
  }

  const resumeWithPrevious = () => {
    setStage('active')
    setStep(2)
    setMood('')
    setPeople(previousPeople)
    setPlacements(previousPlacements)
    setCloseness(previousCloseness)
    setCoreRelations([])
    setNotes({})
    setFocus('')
    setActionText('')
    setActionDate('')
    setSatisfaction('')
    setSubmitError(null)
  }

  const clearSavedData = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY)
    }
    setHistory([])
    setPreviousPeople([])
    setPreviousPlacements({})
    setPreviousCloseness({})
    startFresh()
  }

  const completeChallenge = async () => {
    if (!stepReady || saving) return
    try {
      setSaving(true)
      setSubmitError(null)
      persistData()
      await onComplete?.(stateForSubmit)
      setStage('done')
    } catch {
      setSubmitError('완료 처리 중 오류가 발생했습니다. 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  if (stage === 'start') {
    return (
      <div className="imw-wrap">
        <div className="imw-card">
          <p className="imw-label">대인관계 지지자 지도</p>
          <p className="imw-help">최근 10회 히스토리를 참고해 이어서 진행하거나 새로 시작할 수 있어요.</p>

          {hasPrevious ? (
            <>
              <p className="imw-label">이전 버블 지도 미리보기</p>
              <BubbleChart nodes={previousNodes} showLegend />
              <div className="imw-action-row">
                <button className="ct-btn-primary" onClick={resumeWithPrevious}>이어서 진행하기</button>
                <button className="ct-btn-secondary" onClick={clearSavedData}>초기화</button>
                <button className="ct-btn-secondary" onClick={startFresh}>새로 시작하기</button>
              </div>
            </>
          ) : (
            <button className="ct-btn-primary" onClick={startFresh}>시작하기</button>
          )}
        </div>

        <div className="imw-card">
          <p className="imw-label">최근 히스토리</p>
          {history.length > 0 ? (
            <div className="imw-history-list">
              {history.map((item, index) => (
                <div key={`${item.date}-${index}`} className="imw-history-item">
                  <p className="imw-history-date">{item.date} · {item.mood}</p>
                  <p className="imw-help">핵심: {item.core.join(', ') || '없음'} / 초점: {item.focus || '미선택'}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="imw-help">아직 저장된 활동이 없습니다.</p>
          )}
        </div>
      </div>
    )
  }

  if (stage === 'done') {
    return (
      <div className="imw-wrap">
        <div className="imw-card">
          <p className="imw-label">완료 화면</p>
          <BubbleChart nodes={nodes} showLegend />

          {hasPrevious ? (
            <div className="imw-change-card">
              <p className="imw-change-title">이전 대비 변화</p>
              {changeSummary.map((line) => (
                <p key={line} className="imw-help">{line}</p>
              ))}
            </div>
          ) : null}

          <div className="imw-summary">
            <p className="imw-summary__title">핵심 지지자</p>
            <p className="imw-help">{coreRelations.join(', ') || '없음'}</p>
            <p className="imw-summary__title">행동 계획</p>
            <p className="imw-help">{actionText || '미입력'} {actionDate ? `(${actionDate})` : ''}</p>
          </div>

          <button className="ct-btn-primary" onClick={() => router.push(redirectPath)}>
            처음으로 돌아가기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="imw-wrap">
      <div className="imw-progress">
        <div className="imw-progress__head">
          <button className="imw-back-btn" onClick={goPrev} disabled={step === 1}>←</button>
          <p className="imw-progress__title">현재 단계 {step} / 5</p>
        </div>
        <div className="imw-progress__steps imw-progress__steps--five">
          {Array.from({ length: STEP_COUNT }, (_, i) => i + 1).map((index) => (
            <span key={index} className={`imw-progress__step ${index <= step ? 'done' : ''}`}>{index}</span>
          ))}
        </div>
      </div>

      {step === 1 ? (
        <div className="imw-card">
          <p className="imw-label">Step 1 · 감정 체크</p>
          <div className="imw-emoji-row">
            {MOODS.map((emoji) => (
              <button key={emoji} className={`imw-emoji ${mood === emoji ? 'active' : ''}`} onClick={() => setMood(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
          <p className="imw-help">선택하면 자동으로 다음 단계로 이동합니다.</p>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="imw-card">
          <p className="imw-label">Step 2 · 관계 배치</p>
          <div className="imw-input-row">
            <input
              className="imw-input"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onAddPerson()
                }
              }}
              placeholder="이름 입력 후 Enter 또는 추가"
            />
            <button className="imw-add-btn" onClick={onAddPerson}>추가</button>
          </div>

          <div className="imw-person-list">
            {people.map((name) => (
              <div key={name} className="imw-person-row">
                <span className="imw-person-name">{name}</span>
                <select
                  className="imw-select"
                  value={placements[name] ?? ''}
                  onChange={(e) => setPlacements((prev) => ({ ...prev, [name]: e.target.value }))}
                >
                  <option value="">영역 선택</option>
                  {ZONES.map((zone) => (
                    <option key={zone} value={zone}>{zone}</option>
                  ))}
                </select>
                <select
                  className="imw-select"
                  value={closeness[name] ?? ''}
                  onChange={(e) => setCloseness((prev) => ({ ...prev, [name]: e.target.value }))}
                >
                  <option value="">친밀도 선택</option>
                  {CLOSENESS_OPTIONS.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
                <button className="imw-remove-btn" onClick={() => onRemovePerson(name)}>삭제</button>
              </div>
            ))}
          </div>

          <BubbleChart nodes={nodes} showLegend />

          {hasPrevious ? (
            <div className="imw-change-card">
              <p className="imw-change-title">변화 요약</p>
              {changeSummary.map((line) => (
                <p key={line} className="imw-help">{line}</p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="imw-card">
          <p className="imw-label">Step 3 · 핵심 관계 선택</p>
          <BubbleChart nodes={nodes} showLegend />

          <p className="imw-help">{coreRelations.length}명 선택됨 (최대 3명)</p>
          <div className="imw-check-list">
            {people.map((name) => {
              const checked = coreRelations.includes(name)
              const disabled = !checked && coreRelations.length >= 3
              return (
                <label key={name} className={`imw-check-item ${disabled ? 'disabled' : ''}`}>
                  <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleCore(name)} />
                  <span>{name}</span>
                </label>
              )
            })}
          </div>

          {coreRelations.map((name) => (
            <div key={name} className="imw-note-row">
              <label className="imw-help">{name} 메모</label>
              <textarea
                className="imw-textarea"
                value={notes[name] ?? ''}
                onChange={(e) => setNotes((prev) => ({ ...prev, [name]: e.target.value }))}
                placeholder="선택 입력"
              />
            </div>
          ))}
        </div>
      ) : null}

      {step === 4 ? (
        <div className="imw-card">
          <p className="imw-label">Step 4 · 초점 & 행동 계획</p>
          <div className="imw-chip-row">
            {FOCUS_OPTIONS.map((item) => (
              <button key={item} className={`imw-chip ${focus === item ? 'active' : ''}`} onClick={() => setFocus(item)}>
                {item}
              </button>
            ))}
          </div>
          <textarea
            className="imw-textarea"
            value={actionText}
            onChange={(e) => setActionText(e.target.value)}
            placeholder="어떤 행동을 해볼까요?"
          />
          <input
            type="date"
            className="imw-input"
            value={actionDate}
            onChange={(e) => setActionDate(e.target.value)}
          />
        </div>
      ) : null}

      {step === 5 ? (
        <div className="imw-card">
          <p className="imw-label">Step 5 · 마무리</p>
          <BubbleChart nodes={nodes} showLegend />

          {hasPrevious ? (
            <div className="imw-change-card">
              <p className="imw-change-title">변화 요약</p>
              {changeSummary.map((line) => (
                <p key={line} className="imw-help">{line}</p>
              ))}
            </div>
          ) : null}

          <div className="imw-summary">
            <p className="imw-summary__title">핵심 지지자</p>
            <p className="imw-help">{coreRelations.join(', ') || '없음'}</p>
            <p className="imw-summary__title">초점 & 행동 계획</p>
            <p className="imw-help">{focus || '미선택'} / {actionText || '미입력'} {actionDate ? `(${actionDate})` : ''}</p>
          </div>

          <div className="imw-emoji-row">
            {SATISFACTIONS.map((emoji) => (
              <button key={emoji} className={`imw-emoji ${satisfaction === emoji ? 'active' : ''}`} onClick={() => setSatisfaction(emoji)}>
                {emoji}
              </button>
            ))}
          </div>

          {submitError ? <p className="imw-error">{submitError}</p> : null}
        </div>
      ) : null}

      <div className="imw-footer">
        {step < 5 ? (
          <button className="ct-btn-primary" onClick={goNext} disabled={!stepReady}>다음 단계</button>
        ) : (
          <button className="ct-btn-primary" onClick={() => void completeChallenge()} disabled={!stepReady || saving}>
            {saving ? '처리 중...' : '챌린지 완료'}
          </button>
        )}
      </div>
    </div>
  )
}
