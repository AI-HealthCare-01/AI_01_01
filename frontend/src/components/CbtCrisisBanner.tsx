import './CbtCrisisBanner.css'

type CrisisStage = 'A' | 'B' | 'C'

type CbtCrisisBannerProps = {
  crisisStage?: CrisisStage | null
  crisisActions: string[]
  crisisActionChecked: Record<string, boolean>
  onToggleAction: (action: string, checked: boolean) => void
  onSendSupporterMessage: () => void | Promise<void>
}

function normalizeStage(stage?: CrisisStage | null): CrisisStage {
  if (stage === 'B' || stage === 'C') return stage
  return 'A'
}

function stageDescription(stage: CrisisStage): string {
  if (stage === 'B') return '도움 연결 중입니다. 지금은 안전 대기가 중요해요.'
  if (stage === 'C') return '안전 확보 이후 단계예요. 지금은 짧은 사후 안전계획을 유지해요.'
  return '지금은 대화 탐색보다 즉시 도움 연결이 우선입니다.'
}

export default function CbtCrisisBanner({
  crisisStage,
  crisisActions,
  crisisActionChecked,
  onToggleAction,
  onSendSupporterMessage,
}: CbtCrisisBannerProps) {
  const stage = normalizeStage(crisisStage)
  const stageClass = stage === 'A' ? 'stageA' : stage === 'B' ? 'stageB' : 'stageC'
  const showHotlineButtons = stage === 'A'
  const supporterButtonLabel = stage === 'C' ? '안전 동행 요청' : '지지자에게 메시지 보내기'

  return (
    <div className={`cbtCrisisBanner ${stageClass}`} role="status" aria-live="polite">
      <h4>안전 우선 모드</h4>
      <p>{stageDescription(stage)}</p>

      <div className="actions">
        {showHotlineButtons && (
          <>
            <a href="tel:1393" className="crisisCallBtn" aria-label="1393 자살예방 상담전화">
              1393
            </a>
            <a href="tel:119" className="crisisCallBtn" aria-label="119 긴급 신고">
              119
            </a>
            <a href="tel:112" className="crisisCallBtn" aria-label="112 경찰 신고">
              112
            </a>
          </>
        )}
        <button type="button" className="ghost" onClick={() => void onSendSupporterMessage()}>
          {supporterButtonLabel}
        </button>
      </div>

      {Array.isArray(crisisActions) && crisisActions.length > 0 && (
        <ul className="crisisChecklist">
          {crisisActions.map((action, idx) => (
            <li key={`crisis-action-${idx}`}>
              <label className="crisisChecklistItem">
                <input
                  type="checkbox"
                  checked={Boolean(crisisActionChecked[action])}
                  onChange={(e) => onToggleAction(action, e.target.checked)}
                />
                <span>{action}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

