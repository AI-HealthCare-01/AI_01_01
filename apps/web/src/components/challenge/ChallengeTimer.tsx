'use client'
import { useState, useEffect, useRef } from 'react'

interface Props {
  totalSeconds: number
  label?: string
  onComplete?: () => void
}

export function ChallengeTimer({ totalSeconds, label, onComplete }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds)
  const [status, setStatus] = useState<'idle'|'running'|'paused'|'done'>('idle')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onCompleteRef = useRef<Props['onComplete']>(onComplete)

  const radius = 60
  const circumference = 2 * Math.PI * radius
  const progress = totalSeconds > 0 ? secondsLeft / totalSeconds : 0
  const offset = circumference * (1 - progress)
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    if (status === 'running') {
      intervalRef.current = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!)
            setStatus('done')
            onCompleteRef.current?.()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [status])

  const reset = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setSecondsLeft(totalSeconds)
    setStatus('idle')
  }

  return (
    <div className="ct-wrap">
      {label && <p className="ct-label">{label}</p>}
      <div className="ct-ring-wrap">
        <svg width="148" height="148" viewBox="0 0 148 148">
          <circle cx="74" cy="74" r={radius} fill="none"
            stroke="var(--color-surface-sub)" strokeWidth="8"/>
          <circle cx="74" cy="74" r={radius} fill="none"
            stroke={status === 'done' ? 'var(--color-sage)' : 'var(--color-primary)'}
            strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            style={{ transform:'rotate(-90deg)', transformOrigin:'center',
              transition:'stroke-dashoffset 0.8s ease, stroke 0.4s ease' }}
          />
        </svg>
        <div className="ct-center">
          {status === 'done'
            ? <span className="ct-done">완료 ✓</span>
            : <><span className="ct-time">{mm}:{ss}</span>
               <span className="ct-sublabel">남은 시간</span></>
          }
        </div>
      </div>
      <div className="ct-btns">
        {status === 'idle' && <button className="ct-btn-primary" onClick={() => setStatus('running')}>▶ 시작</button>}
        {status === 'running' && <button className="ct-btn-secondary" onClick={() => setStatus('paused')}>⏸ 일시정지</button>}
        {status === 'paused' && <button className="ct-btn-primary" onClick={() => setStatus('running')}>▶ 재개</button>}
        {status !== 'idle' && <button className="ct-btn-text" onClick={reset}>↺ 초기화</button>}
      </div>
    </div>
  )
}
