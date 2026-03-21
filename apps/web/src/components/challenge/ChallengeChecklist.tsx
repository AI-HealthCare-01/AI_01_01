'use client'
import { useState } from 'react'

interface Props {
  type: 'morning' | 'sleep'
  onComplete?: (count: number) => void
  onCompletionStateChange?: (completed: boolean) => void
  onSubmitComplete?: () => void
  submitting?: boolean
  completed?: boolean
}

const ITEMS = {
  morning: [
    '기상 후 물 한 잔 마시기',
    '5분 스트레칭',
    '오늘 할 일 3가지 적기',
    '햇빛 10분 쬐기',
    '건강한 아침 식사',
  ],
  sleep: [
    '취침 1시간 전 휴대폰 내려놓기',
    '조명 어둡게 조절',
    '5분 스트레칭 또는 명상',
    '내일 준비물 챙기기',
    '감사한 일 1가지 떠올리기',
  ],
}

export function ChallengeChecklist({
  type,
  onComplete,
  onCompletionStateChange,
  onSubmitComplete,
  submitting = false,
  completed = false,
}: Props) {
  const items = ITEMS[type]
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const allChecked = checked.size === items.length

  const toggle = (i: number) => {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else {
        next.add(i)
        if (next.size === items.length) onComplete?.(items.length)
      }
      onCompletionStateChange?.(next.size === items.length)
      return next
    })
  }

  const pct = Math.round((checked.size / items.length) * 100)

  return (
    <div className="cl-wrap">
      <div className="cl-header">
        <span className="cl-count">{checked.size} / {items.length} 완료</span>
        <span className="cl-pct">{pct}%</span>
      </div>
      <div className="cl-track"><div className="cl-fill" style={{ width: `${pct}%` }} /></div>
      {items.map((item, i) => (
        <div key={i} className="cl-item" onClick={() => toggle(i)}>
          <div className={`cl-box ${checked.has(i) ? 'checked' : ''}`}>
            {checked.has(i) && <div className="cl-check" />}
          </div>
          <span className={`cl-text ${checked.has(i) ? 'done' : ''}`}>{item}</span>
        </div>
      ))}
      {onSubmitComplete ? (
        <div className="cl-complete-row">
          <button
            className="ct-btn-primary cl-complete-btn"
            onClick={onSubmitComplete}
            disabled={!allChecked || submitting || completed}
          >
            {completed ? '오늘 완료됨' : submitting ? '저장 중...' : '오늘 완료'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
