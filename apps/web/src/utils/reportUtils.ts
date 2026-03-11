import type {
  MindLabReportData,
  ScoreInterpretation,
  SeverityLevel,
} from "../types/report";
import type { SymptomDashboardSeries } from "../features/core-inputs";
import type { AssessmentHistory } from "../types/report";

export function interpretPHQ9(score: number | null): ScoreInterpretation {
  if (score === null) {
    return { level: "normal", label: "기록 없음", color: "#94A3B8" };
  }
  if (score <= 4) {
    return { level: "normal", label: "정상", color: "#10B981" };
  }
  if (score <= 9) {
    return { level: "mild", label: "경미한 우울", color: "#FBBF24" };
  }
  if (score <= 14) {
    return { level: "moderate", label: "중간 우울", color: "#F97316" };
  }
  if (score <= 19) {
    return { level: "severe", label: "중증 우울", color: "#EF4444" };
  }
  return { level: "very_severe", label: "매우 심각", color: "#7C3AED" };
}

export function interpretGAD7(score: number | null): ScoreInterpretation {
  if (score === null) {
    return { level: "normal", label: "기록 없음", color: "#94A3B8" };
  }
  if (score <= 4) {
    return { level: "normal", label: "정상", color: "#10B981" };
  }
  if (score <= 9) {
    return { level: "mild", label: "경미한 불안", color: "#FBBF24" };
  }
  if (score <= 14) {
    return { level: "moderate", label: "중간 불안", color: "#F97316" };
  }
  return { level: "severe", label: "심각한 불안", color: "#EF4444" };
}

export function interpretISI(score: number | null): ScoreInterpretation {
  if (score === null) {
    return { level: "normal", label: "기록 없음", color: "#94A3B8" };
  }
  if (score <= 7) {
    return { level: "normal", label: "정상 수면", color: "#10B981" };
  }
  if (score <= 14) {
    return { level: "mild", label: "경미한 불면", color: "#FBBF24" };
  }
  if (score <= 21) {
    return { level: "moderate", label: "중증 불면", color: "#F97316" };
  }
  return { level: "severe", label: "임상적 불면", color: "#EF4444" };
}

export function interpretRisk(level: 0 | 1 | 2 | 3): ScoreInterpretation {
  const map = {
    0: {
      level: "normal" as SeverityLevel,
      label: "위험 없음",
      color: "#10B981",
    },
    1: {
      level: "mild" as SeverityLevel,
      label: "관찰 필요",
      color: "#FBBF24",
    },
    2: {
      level: "moderate" as SeverityLevel,
      label: "주의",
      color: "#F97316",
    },
    3: {
      level: "severe" as SeverityLevel,
      label: "고위험",
      color: "#EF4444",
    },
  };
  return map[level];
}

export function formatDate(dateStr: string): string {
  return dateStr.replace(/-/g, ".").slice(0, 10);
}

export function getXAxisFormat(
  start: string,
  end: string,
): "day" | "week" | "month" {
  const diff =
    (new Date(end).getTime() - new Date(start).getTime()) / 86400000;
  if (diff <= 7) {
    return "day";
  }
  if (diff <= 31) {
    return "week";
  }
  return "month";
}

export function generateInsights(data: MindLabReportData): string[] {
  const insights: string[] = [];
  const { phq9, gad7, isi } = data.latestAssessment;
  const { checkinDays, checkinGoal } = data.activity;

  if (phq9 !== null && gad7 !== null && phq9 >= 15 && gad7 >= 15) {
    insights.push(
      "우울과 불안이 동시에 높은 상태입니다. 두 가지가 함께 나타날 때는 전문가 상담이 가장 효과적일 수 있어요.",
    );
  } else if (phq9 !== null && isi !== null && phq9 >= 15 && isi >= 15) {
    insights.push(
      "우울과 수면 문제가 함께 나타나고 있습니다. 수면의 질 개선이 기분에도 영향을 줄 수 있어요.",
    );
  }

  if (phq9 !== null) {
    if (phq9 >= 20) {
      insights.push(
        "우울 점수가 매우 높은 수준입니다. 일상의 작은 활동부터 시작해보세요.",
      );
    } else if (phq9 >= 15) {
      insights.push(
        "우울 점수가 중증 수준입니다. 규칙적인 햇빛과 산책이 도움이 될 수 있어요.",
      );
    } else if (phq9 >= 10) {
      insights.push(
        "우울 점수가 중간 수준입니다. 체크인과 챌린지 참여를 유지해보세요.",
      );
    }
  }

  if (gad7 !== null) {
    if (gad7 >= 15) {
      insights.push(
        "불안 수준이 높습니다. 감각 안정 챌린지나 호흡 연습이 도움이 될 수 있어요.",
      );
    } else if (gad7 >= 10) {
      insights.push(
        "불안이 일부 나타나고 있습니다. 짧은 산책이나 감각 집중 활동을 시도해보세요.",
      );
    }
  }

  if (isi !== null) {
    if (isi >= 22) {
      insights.push(
        "수면 문제가 심각한 수준입니다. 규칙적인 기상 시간 유지가 중요해요.",
      );
    } else if (isi >= 15) {
      insights.push(
        "중등도 불면이 나타나고 있습니다. 취침 전 스크린 시간을 줄여보세요.",
      );
    }
  }

  if (checkinDays === 0) {
    insights.push(
      "아직 체크인 기록이 없습니다. 매일 체크인으로 변화를 추적해보세요.",
    );
  } else if (checkinDays / checkinGoal < 0.5) {
    insights.push(
      "체크인 참여율이 낮습니다. 꾸준한 기록이 변화를 만들어요.",
    );
  } else if (checkinDays / checkinGoal >= 0.8) {
    insights.push("꾸준히 체크인하고 있어요! 대단합니다 💪");
  }

  if (insights.length === 0) {
    insights.push("모든 지표가 안정적입니다. 지금처럼 꾸준히 유지해보세요 🌿");
  }

  return insights;
}

export function recommendChallenges(data: MindLabReportData): string[] {
  const { phq9, gad7, isi } = data.latestAssessment;
  const activeIds = data.challenges.list
    .filter((c) => c.status === "active")
    .map((c) => c.id);
  const recs: string[] = [];

  if (data.riskLevel >= 2) {
    return [];
  }

  if (phq9 !== null && phq9 >= 10) {
    if (!activeIds.includes("sunlight-10min")) {
      recs.push("햇빛 10분");
    }
    if (!activeIds.includes("walk-10min")) {
      recs.push("산책 10분");
    }
    if (!activeIds.includes("confidence-list")) {
      recs.push("자신감 리스트");
    }
  }
  if (gad7 !== null && gad7 >= 10) {
    if (!activeIds.includes("sensory-grounding")) {
      recs.push("감각 안정");
    }
  }
  if (isi !== null && isi >= 15) {
    recs.push("수면 루틴");
  }

  return [...new Set(recs)];
}

function toChartLabel(date: string): string {
  const normalized = formatDate(date);
  return normalized.slice(5);
}

function toSeries(
  metric: SymptomDashboardSeries["metric"],
  label: string,
  history: AssessmentHistory[],
  pick: (row: AssessmentHistory) => number | null,
): SymptomDashboardSeries {
  const values = history.map(pick).filter((v): v is number => v !== null);
  const current = values.length > 0 ? values[values.length - 1] : null;
  const mean = values.length > 0 ? values.reduce((acc, v) => acc + v, 0) / values.length : null;
  return {
    metric,
    label,
    points: history.map((item) => ({
      x_label: toChartLabel(item.date),
      value: pick(item),
      observed_days: null,
      is_missing_bucket: pick(item) === null,
    })),
    current_score: current,
    window_mean: mean === null ? null : Math.round(mean * 10) / 10,
    recorded_days: values.length,
  };
}

export function adaptHistoryToStatusFlow(history: AssessmentHistory[]): SymptomDashboardSeries[] {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  return [
    toSeries("dep", "우울", sorted, (row) => row.phq9),
    toSeries("anx", "불안", sorted, (row) => row.gad7),
    toSeries("ins", "불면", sorted, (row) => row.isi),
  ];
}
