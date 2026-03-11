'use client'

import { useMemo } from 'react'

import { BubbleChart, computeBubbleLayout } from './InterpersonalMapWidget'

interface HistoryEntry {
  date: string
  people: string[]
  placements: Record<string, string>
  closeness: Record<string, string>
  core: string[]
  focus: string
  action: string
}

interface StoredData {
  history: HistoryEntry[]
}

const DEFAULT_STORAGE_KEY = 'interpersonal_map_v4'

function parseStoredData(raw: string | null): StoredData | null {
  if (!raw) return { history: [] }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredData>
    if (!Array.isArray(parsed.history)) return { history: [] }
    return { history: parsed.history }
  } catch {
    return null
  }
}

function buildComparisonLines(previous: HistoryEntry, current: HistoryEntry): string[] {
  const lines: string[] = []

  const addedPeople = current.people.filter((name) => !previous.people.includes(name))
  if (addedPeople.length > 0) {
    lines.push(`✨ 새로 추가: ${addedPeople.join(', ')}`)
  }

  const removedPeople = previous.people.filter((name) => !current.people.includes(name))
  if (removedPeople.length > 0) {
    lines.push(`👋 빠짐: ${removedPeople.join(', ')}`)
  }

  current.people.forEach((name) => {
    if (!previous.people.includes(name)) return
    const previousZone = previous.placements[name]
    const currentZone = current.placements[name]
    if (previousZone && currentZone && previousZone !== currentZone) {
      lines.push(`${name} 영역 변화: ${previousZone} → ${currentZone}`)
    }
    const previousCloseness = previous.closeness[name]
    const currentCloseness = current.closeness[name]
    if (previousCloseness && currentCloseness && previousCloseness !== currentCloseness) {
      lines.push(`${name} 친밀도: ${previousCloseness} → ${currentCloseness}`)
    }
  })

  const addedCore = current.core.filter((name) => !previous.core.includes(name))
  if (addedCore.length > 0) {
    lines.push(`⭐ 핵심 추가: ${addedCore.join(', ')}`)
  }

  const removedCore = previous.core.filter((name) => !current.core.includes(name))
  if (removedCore.length > 0) {
    lines.push(`💫 핵심 변화: ${removedCore.join(', ')} 빠짐`)
  }

  if (lines.length === 0) {
    lines.push('이전과 동일한 관계 구성이에요')
  }

  return lines
}

export function RelationshipMapComparison({ storageKey = DEFAULT_STORAGE_KEY }: { storageKey?: string }) {
  const history = useMemo(() => {
    if (typeof window === 'undefined') {
      return null
    }
    const parsed = parseStoredData(window.localStorage.getItem(storageKey))
    return parsed?.history ?? null
  }, [storageKey])

  const safeHistory = history ?? []
  const current = safeHistory[0]
  const previous = safeHistory[1]

  const currentNodes = useMemo(
    () => (
      current
        ? computeBubbleLayout(
            current.people,
            current.placements,
            current.closeness,
            current.core,
            previous?.placements ?? {},
            previous?.closeness ?? {},
          )
        : []
    ),
    [current, previous],
  )

  const previousNodes = useMemo(
    () => (
      previous
        ? computeBubbleLayout(previous.people, previous.placements, previous.closeness, previous.core, {}, {})
        : []
    ),
    [previous],
  )

  const changes = useMemo(() => {
    if (!current || !previous) return []
    return buildComparisonLines(previous, current)
  }, [current, previous])

  const visibleChanges = changes.slice(0, 3)
  const hiddenCount = Math.max(0, changes.length - visibleChanges.length)

  if (history === null) return null

  return (
    <div className="rmc-wrap">
      <div className="rmc-head">
        <p className="rmc-title">🗺️ 관계 지도 변화</p>
        <p className="rmc-sub">이전 활동과 현재를 비교해보세요</p>
      </div>

      {!current || !previous ? (
        <p className="rmc-empty">📊 다음 활동 완료 후 변화를 비교할 수 있어요</p>
      ) : (
        <>
          <div className="rmc-grid">
            <div className="rmc-card">
              <p className="rmc-label">이전</p>
              <p className="rmc-date">{previous.date}</p>
              <BubbleChart nodes={previousNodes} readOnly width={160} height={140} />
              <p className="rmc-meta">핵심: {previous.core.join(', ') || '없음'}</p>
              <p className="rmc-meta">초점: {previous.focus || '미선택'}</p>
            </div>
            <div className="rmc-card">
              <p className="rmc-label">현재</p>
              <p className="rmc-date">{current.date}</p>
              <BubbleChart nodes={currentNodes} readOnly width={160} height={140} />
              <p className="rmc-meta">핵심: {current.core.join(', ') || '없음'}</p>
              <p className="rmc-meta">초점: {current.focus || '미선택'}</p>
            </div>
          </div>

          <div className="rmc-change">
            {visibleChanges.map((line) => (
              <p key={line} className="rmc-line">{line}</p>
            ))}
            {hiddenCount > 0 ? <p className="rmc-line">외 {hiddenCount}개 변화</p> : null}
          </div>
        </>
      )}
    </div>
  )
}
