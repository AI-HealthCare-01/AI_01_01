export type SurveyInputType = 'number' | 'select'

export type SurveyQuestion = {
  line: number
  field: string
  label: string
  inputType: SurveyInputType
  required: boolean
  min?: number
  max?: number
  step?: number
  options?: Array<{ label: string; value: string }>
  help?: string
}

// Source of truth: do not rename existing field keys. Only append optional fields.
export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    line: 1,
    field: 'sleep_hours_week_avg',
    label: '일주일 평균 수면시간(시간)',
    inputType: 'number',
    required: false,
    min: 0,
    max: 24,
    step: 0.5,
    help: '빈값 허용. 입력 시 0으로 자동 변환하지 않음.',
  },
  {
    line: 2,
    field: 'exercise_minutes',
    label: '하루 평균 운동시간(분)',
    inputType: 'number',
    required: false,
    min: 0,
    max: 300,
    step: 5,
  },
  {
    line: 3,
    field: 'phq_total',
    label: '우울 점수 합계(PHQ total)',
    inputType: 'number',
    required: true,
    min: 0,
    max: 27,
  },
  {
    line: 4,
    field: 'gad_total',
    label: '불안 점수 합계(GAD total)',
    inputType: 'number',
    required: true,
    min: 0,
    max: 21,
  },
  {
    line: 5,
    field: 'sleep_total',
    label: '수면 위험 점수 합계(sleep total)',
    inputType: 'number',
    required: true,
    min: 0,
    max: 9,
  },
  {
    line: 6,
    field: 'context_risk_total',
    label: '상황 위험 점수 합계(context risk total)',
    inputType: 'number',
    required: true,
    min: 0,
    max: 15,
  },
  {
    line: 7,
    field: 'stressful_event',
    label: '스트레스 사건 영향도',
    inputType: 'select',
    required: true,
    options: [
      { label: '없음', value: '0' },
      { label: '조금', value: '1' },
      { label: '보통', value: '2' },
      { label: '심함', value: '3' },
    ],
  },
  {
    line: 8,
    field: 'daily_functioning',
    label: '일상 기능 저하',
    inputType: 'select',
    required: true,
    options: [
      { label: '없음', value: '0' },
      { label: '조금', value: '1' },
      { label: '보통', value: '2' },
      { label: '심함', value: '3' },
    ],
  },
  {
    line: 9,
    field: 'social_support',
    label: '사회적 지지 부족',
    inputType: 'select',
    required: true,
    options: [
      { label: '없음', value: '0' },
      { label: '조금', value: '1' },
      { label: '보통', value: '2' },
      { label: '심함', value: '3' },
    ],
  },
  {
    line: 10,
    field: 'coping_skill',
    label: '대처 기술 부족',
    inputType: 'select',
    required: true,
    options: [
      { label: '없음', value: '0' },
      { label: '조금', value: '1' },
      { label: '보통', value: '2' },
      { label: '심함', value: '3' },
    ],
  },
  {
    line: 11,
    field: 'motivation_for_change',
    label: '변화 동기 저하',
    inputType: 'select',
    required: true,
    options: [
      { label: '없음', value: '0' },
      { label: '조금', value: '1' },
      { label: '보통', value: '2' },
      { label: '심함', value: '3' },
    ],
  },
  {
    line: 12,
    field: 'phq9_suicidal_ideation',
    label: '자해/자살 사고',
    inputType: 'select',
    required: true,
    options: [
      { label: '없음', value: '0' },
      { label: '조금', value: '1' },
      { label: '보통', value: '2' },
      { label: '심함', value: '3' },
    ],
  },
]
