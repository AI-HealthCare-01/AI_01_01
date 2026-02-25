import type { FormEvent } from 'react'
import './StitchCbtPage.css'

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
}

type WeeklyDashboardResponse = {
  user_id: string
  rows: WeeklyDashboardRow[]
}

type StitchCbtPageProps = {
  loading: boolean
  nickname: string
  message: string
  token: string
  chatMessage: string
  chatResult: ChatResponse | null
  challengeChecks: boolean[]
  cbtCheckinMood: string
  cbtCheckinSleep: string
  dashboard: WeeklyDashboardResponse | null
  onSubmitChat: (event: FormEvent) => Promise<void>
  onChatMessageChange: (value: string) => void
  onToggleChallenge: (index: number, checked: boolean) => void
  onMoodChange: (value: string) => void
  onSleepChange: (value: string) => void
  onSaveCheckin: () => Promise<void>
  onLoadDashboard: () => Promise<void>
  onGoAssessment: () => void
  onGoBoard: () => void
  onGoMyPage: () => void
  onGoAccount: () => void
  onGoAdmin: () => void
  isAdmin: boolean
}

function buildTrendPath(rows: WeeklyDashboardRow[]): string {
  if (rows.length === 0) return 'M 18 112 C 68 112, 86 64, 132 84 C 172 102, 214 56, 262 70 C 298 80, 332 58, 350 72'
  const width = 332
  const height = 72
  const offsetX = 18
  const offsetY = 44
  const step = rows.length > 1 ? width / (rows.length - 1) : width
  return rows
    .map((row, idx) => {
      const x = Math.round(offsetX + idx * step)
      const y = Math.round(offsetY + (100 - row.symptom_composite_pred_0_100) / 100 * height)
      return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')
}

function toStatus(challengeChecks: boolean[]): string {
  const total = challengeChecks.length
  if (total === 0) return 'DAILY RECAP'
  const done = challengeChecks.filter(Boolean).length
  if (done === 0) return 'NEED TO VENT'
  if (done < total) return 'FEELING ANXIOUS'
  return 'CENTERED'
}

export default function StitchCbtPage({
  loading,
  nickname,
  message,
  token,
  chatMessage,
  chatResult,
  challengeChecks,
  cbtCheckinMood,
  cbtCheckinSleep,
  dashboard,
  onSubmitChat,
  onChatMessageChange,
  onToggleChallenge,
  onMoodChange,
  onSleepChange,
  onSaveCheckin,
  onLoadDashboard,
  onGoAssessment,
  onGoBoard,
  onGoMyPage,
  onGoAccount,
  onGoAdmin,
  isAdmin,
}: StitchCbtPageProps) {
  const rows = dashboard?.rows ?? []
  const trendPath = buildTrendPath(rows)
  const latest = rows.length > 0 ? rows[rows.length - 1] : null
  const stability = latest ? Math.round(100 - latest.symptom_composite_pred_0_100) : 85
  const sleepBars = rows.length > 0
    ? rows.slice(-7).map((row) => Math.round((100 - row.ins_week_pred_0_100) * 0.8))
    : [34, 46, 62, 42, 27, 53, 38]

  const chips = [
    toStatus(challengeChecks),
    chatResult ? `CHALLENGES ${chatResult.suggested_challenges.length}` : 'NEED TO VENT',
    'DAILY RECAP',
  ]

  return (
    <section className="cbtV2">
      <header className="v2Top">
        <div className="v2Logo">
          <div className="v2LogoMark">✦</div>
          <div>
            <p className="v2LogoName">MonggleAI</p>
            <p className="v2LogoSub">CAFE SESSION</p>
          </div>
        </div>
        <div className="v2SessionWrap">
          <button className="v2LiveBtn" type="button" onClick={() => void onLoadDashboard()} disabled={loading}>
            <span className="dot" />
            LIVE SESSION
          </button>
          <span className="v2Avatar" />
        </div>
      </header>

      <div className="v2Main">
        <article className="v2ChatCard">
          <header className="v2ChatHead">
            <div className="v2ChatIdentity">
              <div className="v2MochiFace">☕</div>
              <div>
                <p className="v2MochiName">Monggle Bunny</p>
                <p className="v2MochiSub">Your cafe companion</p>
              </div>
            </div>
            <span className="v2Dots">•••</span>
          </header>

          <div className="v2Messages">
            <div className="v2Bubble assistant">
              "Hi {nickname}! I've been waiting for you. How has your heart been feeling since we last spoke?"
            </div>
            <p className="v2Time">MONGGLE • 10:24 AM</p>

            <div className="v2Bubble user">
              {chatMessage || "I've been feeling overwhelmed with work today. It's hard to breathe."}
            </div>
            <p className="v2Time right">{nickname.toUpperCase()} • 10:25 AM</p>

            {chatResult && (
              <>
                <div className="v2Bubble assistant">{chatResult.reply}</div>
                <p className="v2Time">MONGGLE • JUST NOW</p>
              </>
            )}
          </div>

          <form className="v2Composer" onSubmit={onSubmitChat}>
            <input
              value={chatMessage}
              onChange={(event) => onChatMessageChange(event.target.value)}
              placeholder="Type your thoughts..."
            />
            <button disabled={loading} aria-label="send">↑</button>
          </form>

          <div className="v2ChipRow">
            {chips.map((chip) => <span key={chip}>{chip}</span>)}
          </div>
        </article>

        <aside className="v2Right">
          <section className="v2Panel">
            <div className="v2PanelHead">
              <div>
                <p className="title">Risk Analysis</p>
                <p className="sub">LIVE PROBE</p>
              </div>
            </div>
            <svg viewBox="0 0 380 150" className="v2Trend" aria-hidden="true">
              <g className="ghostBars">
                <rect x="18" y="78" width="30" height="46" rx="14" />
                <rect x="62" y="62" width="30" height="62" rx="14" />
                <rect x="106" y="70" width="30" height="54" rx="14" />
                <rect x="150" y="52" width="30" height="72" rx="14" />
                <rect x="194" y="60" width="30" height="64" rx="14" />
                <rect x="238" y="66" width="30" height="58" rx="14" />
                <rect x="282" y="54" width="30" height="70" rx="14" />
                <rect x="326" y="68" width="30" height="56" rx="14" />
              </g>
              <path d={trendPath} />
              <circle cx="150" cy="104" r="17" className="good" />
              <rect x="248" y="98" width="36" height="22" rx="11" className="bad" />
            </svg>
            <div className="v2Stability">
              <span>STABILITY</span>
              <div className="bar">
                <i style={{ width: `${stability}%` }} />
              </div>
              <strong>{stability}%</strong>
            </div>
          </section>

          <section className="v2Panel">
            <div className="v2PanelHead">
              <div>
                <p className="title">Wellness Stats</p>
                <p className="sub">SLEEP QUALITY</p>
              </div>
            </div>
            <div className="v2Bars">
              {sleepBars.map((value, idx) => (
                <div className="v2BarCol" key={`bar-${idx}`}>
                  <i style={{ height: `${Math.max(16, value)}px` }} />
                  <span>{['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'][idx] ?? 'DAY'}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="v2TipCard">
            <p className="tipTitle">
              <span className="tipLamp" aria-hidden />
              QUICK TIP
            </p>
            <p className="tipBody">
              {chatResult?.suggested_challenges[0] ?? 'Take a deep breath of fresh air. Even a short pause can shift your perspective.'}
            </p>
            <div className="tipActions">
              <label>
                <input
                  type="checkbox"
                  checked={challengeChecks[0] ?? false}
                  onChange={(event) => onToggleChallenge(0, event.target.checked)}
                />
                Mark done
              </label>
              <button type="button" onClick={() => void onSaveCheckin()} disabled={loading}>
                NEXT SUGGESTION →
              </button>
            </div>
            <div className="tipInputs">
              <input
                value={cbtCheckinMood}
                onChange={(event) => onMoodChange(event.target.value)}
                placeholder="Mood 1-10"
                inputMode="numeric"
              />
              <input
                value={cbtCheckinSleep}
                onChange={(event) => onSleepChange(event.target.value)}
                placeholder="Sleep h"
                inputMode="decimal"
              />
            </div>
          </section>
        </aside>
      </div>

      <footer className="v2Dock">
        <button type="button" onClick={onGoAssessment}>검사</button>
        <button type="button" className="active">채팅</button>
        <button type="button" onClick={onGoBoard}>게시판</button>
        <button type="button" onClick={onGoMyPage}>My Page</button>
        {isAdmin && <button type="button" onClick={onGoAdmin}>관리자</button>}
        {!token && <button type="button" onClick={onGoAccount}>회원가입</button>}
      </footer>

      <p className="v2Message">{token ? message : `Guest mode • ${message}`}</p>
    </section>
  )
}
