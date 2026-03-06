export type AssessmentInstrument = "phq9" | "gad7" | "isi";

export type ScoreOption = {
  score: number;
  label: string;
};

export type AssessmentQuestion = {
  instrument: AssessmentInstrument;
  code: string;
  text: string;
  options: ReadonlyArray<ScoreOption>;
};

export const PHQ_GAD_OPTIONS: ReadonlyArray<ScoreOption> = [
  { score: 0, label: "전혀 없음" },
  { score: 1, label: "며칠" },
  { score: 2, label: "절반 이상" },
  { score: 3, label: "거의 매일" },
];

const ISI_SEVERITY_OPTIONS: ReadonlyArray<ScoreOption> = [
  { score: 0, label: "전혀 없음" },
  { score: 1, label: "약간" },
  { score: 2, label: "중간" },
  { score: 3, label: "심함" },
  { score: 4, label: "매우 심함" },
];

const ISI_SATISFACTION_OPTIONS: ReadonlyArray<ScoreOption> = [
  { score: 0, label: "매우 만족" },
  { score: 1, label: "만족" },
  { score: 2, label: "보통" },
  { score: 3, label: "불만족" },
  { score: 4, label: "매우 불만족" },
];

const ISI_IMPACT_OPTIONS: ReadonlyArray<ScoreOption> = [
  { score: 0, label: "전혀 방해 안 됨" },
  { score: 1, label: "약간" },
  { score: 2, label: "다소" },
  { score: 3, label: "많이" },
  { score: 4, label: "매우 많이" },
];

export const PHQ9_QUESTIONS: ReadonlyArray<AssessmentQuestion> = [
  { instrument: "phq9", code: "PHQ9_1", text: "일 또는 활동에 대한 흥미나 즐거움이 거의 없었다.", options: PHQ_GAD_OPTIONS },
  { instrument: "phq9", code: "PHQ9_2", text: "기분이 가라앉거나 우울하거나 희망이 없다고 느꼈다.", options: PHQ_GAD_OPTIONS },
  { instrument: "phq9", code: "PHQ9_3", text: "잠들기 어렵거나 자주 깨거나, 반대로 너무 많이 잤다.", options: PHQ_GAD_OPTIONS },
  { instrument: "phq9", code: "PHQ9_4", text: "피곤하거나 기운이 거의 없었다.", options: PHQ_GAD_OPTIONS },
  { instrument: "phq9", code: "PHQ9_5", text: "식욕이 줄었거나, 반대로 과식했다.", options: PHQ_GAD_OPTIONS },
  { instrument: "phq9", code: "PHQ9_6", text: "자신을 부정적으로 보거나 실패자처럼 느꼈다.", options: PHQ_GAD_OPTIONS },
  { instrument: "phq9", code: "PHQ9_7", text: "신문 읽기나 TV 보기 같은 일에 집중하기 어려웠다.", options: PHQ_GAD_OPTIONS },
  {
    instrument: "phq9",
    code: "PHQ9_8",
    text: "남들이 알 정도로 말/행동이 느려졌거나, 반대로 너무 안절부절 못했다.",
    options: PHQ_GAD_OPTIONS,
  },
  { instrument: "phq9", code: "PHQ9_9", text: "차라리 죽는 게 낫겠다는 생각이나 자신을 해칠 생각이 들었다.", options: PHQ_GAD_OPTIONS },
];

export const GAD7_QUESTIONS: ReadonlyArray<AssessmentQuestion> = [
  { instrument: "gad7", code: "GAD7_1", text: "초조하거나 불안하거나 조마조마했다.", options: PHQ_GAD_OPTIONS },
  { instrument: "gad7", code: "GAD7_2", text: "걱정을 멈추거나 조절하기 어려웠다.", options: PHQ_GAD_OPTIONS },
  { instrument: "gad7", code: "GAD7_3", text: "여러 가지 걱정을 지나치게 많이 했다.", options: PHQ_GAD_OPTIONS },
  { instrument: "gad7", code: "GAD7_4", text: "편안히 쉬기 어려웠다.", options: PHQ_GAD_OPTIONS },
  { instrument: "gad7", code: "GAD7_5", text: "너무 안절부절못해 가만히 있기 어려웠다.", options: PHQ_GAD_OPTIONS },
  { instrument: "gad7", code: "GAD7_6", text: "쉽게 짜증이 나거나 예민해졌다.", options: PHQ_GAD_OPTIONS },
  { instrument: "gad7", code: "GAD7_7", text: "끔찍한 일이 생길 것 같은 두려움이 들었다.", options: PHQ_GAD_OPTIONS },
];

export const ISI_QUESTIONS: ReadonlyArray<AssessmentQuestion> = [
  { instrument: "isi", code: "ISI_1", text: "잠드는 데 어려움이 있었다.", options: ISI_SEVERITY_OPTIONS },
  { instrument: "isi", code: "ISI_2", text: "잠을 계속 유지하기 어려웠다.", options: ISI_SEVERITY_OPTIONS },
  { instrument: "isi", code: "ISI_3", text: "원하는 시간보다 너무 일찍 깼다.", options: ISI_SEVERITY_OPTIONS },
  { instrument: "isi", code: "ISI_4", text: "현재 수면 패턴에 대한 만족도는 어느 정도인가요?", options: ISI_SATISFACTION_OPTIONS },
  { instrument: "isi", code: "ISI_5", text: "수면 문제가 낮 시간 기능(피로/집중/기분 등)을 얼마나 방해했나요?", options: ISI_IMPACT_OPTIONS },
  { instrument: "isi", code: "ISI_6", text: "수면 문제로 인한 변화(피곤함/예민함 등)를 주변이 알아차린 정도는?", options: ISI_IMPACT_OPTIONS },
  { instrument: "isi", code: "ISI_7", text: "현재 수면 문제에 대해 얼마나 걱정되거나 괴로웠나요?", options: ISI_IMPACT_OPTIONS },
];

export const ASSESSMENT_SECTIONS = [
  {
    key: "phq9" as const,
    title: "마음 에너지 돌아보기",
    description: "최근 2주 동안 얼마나 자주 경험했는지 선택해주세요.",
    questions: PHQ9_QUESTIONS,
  },
  {
    key: "gad7" as const,
    title: "긴장과 걱정 돌아보기",
    description: "최근 2주 동안의 상태를 선택해주세요.",
    questions: GAD7_QUESTIONS,
  },
  {
    key: "isi" as const,
    title: "잠 컨디션 돌아보기",
    description: "최근 2주 동안의 수면 상태를 선택해주세요.",
    questions: ISI_QUESTIONS,
  },
] as const;

export const ALL_ASSESSMENT_QUESTIONS: ReadonlyArray<AssessmentQuestion> = [
  ...PHQ9_QUESTIONS,
  ...GAD7_QUESTIONS,
  ...ISI_QUESTIONS,
];

export const TOTAL_ASSESSMENT_QUESTION_COUNT = ALL_ASSESSMENT_QUESTIONS.length;
