"use client";

import type { AssessmentHistory } from "../../types/report";

type MetricKey = "phq9" | "gad7" | "isi";

const TITLES: Record<MetricKey, string> = {
  phq9: "PHQ-9 추이",
  gad7: "GAD-7 추이",
  isi: "ISI 추이",
};

const MAX: Record<MetricKey, number> = {
  phq9: 27,
  gad7: 21,
  isi: 28,
};

function buildPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return "";
  }
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function getDelta(values: number[]): { curr: number; prev: number; delta: number } | null {
  if (values.length < 2) {
    return null;
  }
  const curr = values[values.length - 1];
  const prev = values[values.length - 2];
  return { curr, prev, delta: curr - prev };
}

function renderDelta(delta: { curr: number; prev: number; delta: number } | null): {
  text: string;
  color: string;
} {
  if (!delta) {
    return { text: "기록 없음", color: "#94A3B8" };
  }
  if (delta.delta > 0) {
    return {
      text: `직전 대비: ${delta.curr} 이전: ${delta.prev} ▲${delta.delta} 악화`,
      color: "#EF4444",
    };
  }
  if (delta.delta < 0) {
    return {
      text: `직전 대비: ${delta.curr} 이전: ${delta.prev} ▼${Math.abs(delta.delta)} 개선`,
      color: "#10B981",
    };
  }
  return {
    text: `직전 대비: ${delta.curr} 이전: ${delta.prev} → 변화없음`,
    color: "#94A3B8",
  };
}

function MetricChart({ metric, history }: { metric: MetricKey; history: AssessmentHistory[] }) {
  const width = 560;
  const height = 190;
  const padX = 24;
  const padY = 16;
  const maxY = MAX[metric];

  const values = history
    .map((row) => row[metric])
    .filter((value): value is number => value !== null);

  const deltaText = renderDelta(getDelta(values));

  const points = history
    .map((row, index) => {
      const value = row[metric];
      if (value === null) {
        return null;
      }
      const x =
        history.length === 1
          ? width / 2
          : padX + (index / Math.max(1, history.length - 1)) * (width - padX * 2);
      const y = padY + ((maxY - value) / maxY) * (height - padY * 2);
      return { x, y };
    })
    .filter((point): point is { x: number; y: number } => point !== null);

  return (
    <div className="mlr-print-block">
      <p className="mlr-print-title">{TITLES[metric]}</p>
      <p className="mlr-print-delta" style={{ color: deltaText.color }}>
        {deltaText.text}
      </p>
      {points.length === 0 ? (
        <p className="mlr-muted">기록 없음</p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="mlr-chart" role="img" aria-label={TITLES[metric]}>
          <line x1="24" y1="174" x2="536" y2="174" stroke="#CBD5E1" strokeWidth="1" />
          <line x1="24" y1="16" x2="24" y2="174" stroke="#CBD5E1" strokeWidth="1" />
          <path d={buildPath(points)} fill="none" stroke="#6366F1" strokeWidth="2.5" />
          {points.map((point, index) => (
            <circle key={`${metric}-${index}`} cx={point.x} cy={point.y} r="4" fill="#6366F1" />
          ))}
        </svg>
      )}
    </div>
  );
}

export function PrintTrendCharts({ history }: { history: AssessmentHistory[] }) {
  return (
    <div className="mlr-stack">
      <MetricChart metric="phq9" history={history} />
      <MetricChart metric="gad7" history={history} />
      <MetricChart metric="isi" history={history} />
    </div>
  );
}
