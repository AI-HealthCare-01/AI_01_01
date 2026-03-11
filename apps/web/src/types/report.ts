export interface AssessmentHistory {
  date: string;
  phq9: number | null;
  gad7: number | null;
  isi: number | null;
}

export interface ChallengeItem {
  id: string;
  name: string;
  domain: "신체건강" | "정서" | "사회" | "습관";
  status: "active" | "completed" | "abandoned";
}

export interface MindLabReportData {
  period: {
    start: string;
    end: string;
  };
  latestAssessment: {
    phq9: number | null;
    gad7: number | null;
    isi: number | null;
    daysSince: number;
  };
  assessmentHistory: AssessmentHistory[];
  activity: {
    checkinDays: number;
    checkinGoal: number;
    cbtSessions: number;
    cbtReflectionsPending: number;
    cbtReflectionsCompleted: number;
  };
  challenges: {
    activeCount: number;
    completedCount: number;
    list: ChallengeItem[];
  };
  riskLevel: 0 | 1 | 2 | 3;
}

export type SeverityLevel =
  | "normal"
  | "mild"
  | "moderate"
  | "severe"
  | "very_severe";

export interface ScoreInterpretation {
  level: SeverityLevel;
  label: string;
  color: string;
}
