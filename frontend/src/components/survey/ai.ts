import { SURVEY_QUESTIONS } from './surveyMapping'

export type SurveyFormValue = string
export type SurveyFormState = Record<string, SurveyFormValue>

export type CheckPredictPayload = {
  phq_total: number
  gad_total: number
  sleep_total: number
  context_risk_total: number
  phq9_suicidal_ideation: number
  daily_functioning: number
  stressful_event: number
  social_support: number
  coping_skill: number
  motivation_for_change: number
  sleep_hours_week_avg?: number
  exercise_minutes?: number
}

export const CHECK_PREDICT_ENDPOINT = '/ai/check/predict'

function toOptionalNumber(raw: string): number | undefined {
  if (raw === '') return undefined
  const parsed = Number(raw)
  if (Number.isNaN(parsed)) return undefined
  return parsed
}

function toRequiredNumber(raw: string, field: string): number {
  if (raw === '') {
    throw new Error(`필수 항목 누락: ${field}`)
  }
  const parsed = Number(raw)
  if (Number.isNaN(parsed)) {
    throw new Error(`숫자 형식 오류: ${field}`)
  }
  return parsed
}

export function createEmptySurveyState(): SurveyFormState {
  return Object.fromEntries(SURVEY_QUESTIONS.map((q) => [q.field, '']))
}

export function buildCheckPredictPayload(form: SurveyFormState): CheckPredictPayload {
  return {
    phq_total: toRequiredNumber(form.phq_total, 'phq_total'),
    gad_total: toRequiredNumber(form.gad_total, 'gad_total'),
    sleep_total: toRequiredNumber(form.sleep_total, 'sleep_total'),
    context_risk_total: toRequiredNumber(form.context_risk_total, 'context_risk_total'),
    phq9_suicidal_ideation: toRequiredNumber(form.phq9_suicidal_ideation, 'phq9_suicidal_ideation'),
    daily_functioning: toRequiredNumber(form.daily_functioning, 'daily_functioning'),
    stressful_event: toRequiredNumber(form.stressful_event, 'stressful_event'),
    social_support: toRequiredNumber(form.social_support, 'social_support'),
    coping_skill: toRequiredNumber(form.coping_skill, 'coping_skill'),
    motivation_for_change: toRequiredNumber(form.motivation_for_change, 'motivation_for_change'),
    sleep_hours_week_avg: toOptionalNumber(form.sleep_hours_week_avg),
    exercise_minutes: toOptionalNumber(form.exercise_minutes),
  }
}

export function validateSurveyForm(form: SurveyFormState): string | null {
  for (const q of SURVEY_QUESTIONS) {
    const value = form[q.field] ?? ''
    if (q.required && value === '') {
      return `${q.label} 입력이 필요합니다.`
    }
    if (value === '') continue

    if (q.inputType === 'number') {
      const n = Number(value)
      if (Number.isNaN(n)) return `${q.label}은 숫자여야 합니다.`
      if (q.min != null && n < q.min) return `${q.label}은 최소 ${q.min} 이상이어야 합니다.`
      if (q.max != null && n > q.max) return `${q.label}은 최대 ${q.max} 이하여야 합니다.`
    }
  }

  return null
}
