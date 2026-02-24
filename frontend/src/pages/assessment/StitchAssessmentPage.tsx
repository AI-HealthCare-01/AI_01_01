import type { FormEvent } from 'react'
import './StitchAssessmentPage.css'

type LikertValue = '' | '0' | '1' | '2' | '3'

type AssessmentState = {
  phq9: LikertValue[]
  gad7: LikertValue[]
  sleep: LikertValue[]
  context: {
    daily_functioning: LikertValue
    stressful_event: LikertValue
    social_support: LikertValue
    coping_skill: LikertValue
    motivation_for_change: LikertValue
  }
}

type Option = {
  value: LikertValue
  label: string
}

type CheckPredictResponse = {
  prediction: number
}

type StitchAssessmentPageProps = {
  loading: boolean
  nickname: string
  assessment: AssessmentState
  options: Option[]
  phqQuestions: string[]
  gadQuestions: string[]
  sleepQuestions: string[]
  contextTotal: number
  checkPrediction: CheckPredictResponse | null
  highRiskProbability: number
  severityLabel: (level: number) => string
  invalidKeys: string[]
  onSubmit: (event: FormEvent) => Promise<void>
  onPhqChange: (index: number, value: LikertValue) => void
  onGadChange: (index: number, value: LikertValue) => void
  onSleepChange: (index: number, value: LikertValue) => void
  onContextChange: (key: keyof AssessmentState['context'], value: LikertValue) => void
}

const OPTION_SUB: Record<Exclude<LikertValue, ''>, string> = {
  '0': '전혀 없음',
  '1': '며칠 동안',
  '2': '절반 이상',
  '3': '거의 매일',
}

function OptionButtons({
  value,
  options,
  onSelect,
}: {
  value: LikertValue
  options: Option[]
  onSelect: (next: LikertValue) => void
}) {
  return (
    <div className="saOptions">
      {options.filter((opt) => opt.value !== '').map((option) => (
        (() => {
          const optionValue = option.value as Exclude<LikertValue, ''>
          return (
            <button
              type="button"
              key={optionValue}
              className={`saOptionBtn tone-${optionValue} ${value === optionValue ? 'isActive' : ''}`}
              onClick={() => onSelect(optionValue)}
            >
              <strong>{optionValue}</strong>
              <span>{OPTION_SUB[optionValue]}</span>
            </button>
          )
        })()
      ))}
    </div>
  )
}

export default function StitchAssessmentPage({
  loading,
  nickname,
  assessment,
  options,
  phqQuestions,
  gadQuestions,
  sleepQuestions,
  contextTotal,
  checkPrediction,
  highRiskProbability,
  severityLabel,
  invalidKeys,
  onSubmit,
  onPhqChange,
  onGadChange,
  onSleepChange,
  onContextChange,
}: StitchAssessmentPageProps) {
  const invalidSet = new Set(invalidKeys)

  return (
    <section className="saWrap">
      <header className="saHead">
        <div className="saBrand">
          <div className="saLogo">✦</div>
          <div>
            <p className="saBrandName">MonggleAI</p>
            <p className="saBrandSub">COMPREHENSIVE ASSESSMENT</p>
          </div>
        </div>
        <div className="saProgress">
          <p>PROGRESS</p>
          <strong>65% 완료됨</strong>
        </div>
      </header>

      <div className="saTitleBlock">
        <h1>종합 심리 검사</h1>
        <p>현재 당신의 마음 상태를 카페에서 대화하듯 편안하게 알려주세요.</p>
      </div>

      <form className="saForm" onSubmit={onSubmit}>
        <article className="saCard">
          <p className="saSection">SECTION 01</p>
          <h2>정서 및 기본 지표</h2>
          <div className="saQuestionScroll">
            {phqQuestions.map((question, index) => (
              <div
                id={`sa-q-phq-${index}`}
                className={`saQuestion ${invalidSet.has(`phq-${index}`) ? 'isInvalid' : ''}`}
                key={`phq-${index}`}
              >
                <p>{index + 1}. {question}</p>
                <OptionButtons value={assessment.phq9[index]} options={options} onSelect={(value) => onPhqChange(index, value)} />
              </div>
            ))}
            {gadQuestions.map((question, index) => (
              <div
                id={`sa-q-gad-${index}`}
                className={`saQuestion ${invalidSet.has(`gad-${index}`) ? 'isInvalid' : ''}`}
                key={`gad-${index}`}
              >
                <p>{phqQuestions.length + index + 1}. {question}</p>
                <OptionButtons value={assessment.gad7[index]} options={options} onSelect={(value) => onGadChange(index, value)} />
              </div>
            ))}
          </div>
        </article>

        <article className="saCard">
          <p className="saSection">SECTION 02</p>
          <h2>수면 건강 지표</h2>
          <div className="saQuestionScroll saQuestionScrollSleep">
            {sleepQuestions.map((question, index) => (
              <div
                id={`sa-q-sleep-${index}`}
                className={`saQuestion ${invalidSet.has(`sleep-${index}`) ? 'isInvalid' : ''}`}
                key={`sleep-${index}`}
              >
                <p>{phqQuestions.length + gadQuestions.length + index + 1}. {question}</p>
                <OptionButtons value={assessment.sleep[index]} options={options} onSelect={(value) => onSleepChange(index, value)} />
              </div>
            ))}
          </div>
        </article>

        <article className="saCard">
          <p className="saSection sectionGreen">SECTION 03</p>
          <h2>맥락적 위험 및 환경 지표</h2>
          <div className="saContextList">
            <div id="sa-q-ctx-daily_functioning" className={`saQuestion ${invalidSet.has('ctx-daily_functioning') ? 'isInvalid' : ''}`}>
              <p>일상적인 일(공부, 업무, 가사 등)을 수행하는 데 어려움이 있나요?</p>
              <OptionButtons value={assessment.context.daily_functioning} options={options} onSelect={(value) => onContextChange('daily_functioning', value)} />
            </div>
            <div id="sa-q-ctx-stressful_event" className={`saQuestion ${invalidSet.has('ctx-stressful_event') ? 'isInvalid' : ''}`}>
              <p>최근 큰 스트레스 사건이 기분과 수면에 영향을 주었나요?</p>
              <OptionButtons value={assessment.context.stressful_event} options={options} onSelect={(value) => onContextChange('stressful_event', value)} />
            </div>
            <div id="sa-q-ctx-social_support" className={`saQuestion ${invalidSet.has('ctx-social_support') ? 'isInvalid' : ''}`}>
              <p>주변 지지(가족/친구)가 부족하다고 느끼나요?</p>
              <OptionButtons value={assessment.context.social_support} options={options} onSelect={(value) => onContextChange('social_support', value)} />
            </div>
            <div id="sa-q-ctx-coping_skill" className={`saQuestion ${invalidSet.has('ctx-coping_skill') ? 'isInvalid' : ''}`}>
              <p>스트레스 상황에서 대처하기가 어렵다고 느끼나요?</p>
              <OptionButtons value={assessment.context.coping_skill} options={options} onSelect={(value) => onContextChange('coping_skill', value)} />
            </div>
            <div id="sa-q-ctx-motivation_for_change" className={`saQuestion ${invalidSet.has('ctx-motivation_for_change') ? 'isInvalid' : ''}`}>
              <p>변화를 시도할 에너지/동기가 낮다고 느끼나요?</p>
              <OptionButtons value={assessment.context.motivation_for_change} options={options} onSelect={(value) => onContextChange('motivation_for_change', value)} />
            </div>
          </div>
        </article>

        <button className="saSubmit" disabled={loading}>결과 확인하기 →</button>
      </form>

      {checkPrediction && (
        <div className="saResult">
          <p>{nickname}님의 현재 위험 단계: <strong>{severityLabel(checkPrediction.prediction)}</strong></p>
          <p>고위험 확률(3~4단계): <strong>{(highRiskProbability * 100).toFixed(1)}%</strong></p>
          <p>맥락 합산 점수: <strong>{contextTotal}/15</strong></p>
        </div>
      )}
    </section>
  )
}
