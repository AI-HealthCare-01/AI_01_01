"use client";

import type { SymptomDashboardSeries } from "../../features/core-inputs";

type Mode = "7d" | "4w_weekly_avg";

type PlottedPoint = {
  index: number;
  x: number;
  y: number;
  value: number;
};

const METRIC_META: Record<SymptomDashboardSeries["metric"], { label: string; color: string }> = {
  dep: { label: "우울", color: "var(--color-chart-depression)" },
  anx: { label: "불안", color: "var(--color-chart-anxiety)" },
  ins: { label: "불면", color: "var(--color-chart-insomnia)" },
};

function resolveMetricMeta(metric: string): { label: string; color: string } {
  const known = METRIC_META[metric as SymptomDashboardSeries["metric"]];
  if (known) {
    return known;
  }
  return {
    label: metric || "지표",
    color: "var(--color-chart-depression)",
  };
}

function getAxisLabels(series: SymptomDashboardSeries[]): string[] {
  if (series.length === 0) {
    return [];
  }

  const longestSeries = [...series].sort((a, b) => b.points.length - a.points.length)[0];
  return longestSeries.points.map((point) => point.x_label);
}

function buildPolyline(points: PlottedPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function buildAreaPath(points: PlottedPoint[], baselineY: number): string | null {
  if (points.length < 2) {
    return null;
  }

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  return `${linePath} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`;
}

export function StatusFlowGraph({
  series,
  mode,
}: {
  series: SymptomDashboardSeries[];
  mode: Mode;
}) {
  const width = 920;
  const height = 320;
  const padLeft = 24;
  const padRight = 24;
  const padTop = 24;
  const padBottom = 52;
  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;
  const baselineY = height - padBottom;

  const pointCount = Math.max(1, ...series.map((item) => item.points.length));
  const step = pointCount > 1 ? chartWidth / (pointCount - 1) : 0;

  const labels = getAxisLabels(series);

  const plottedSeries = series.map((item) => {
    const metricMeta = resolveMetricMeta(item.metric);
    const points = item.points
      .map((point, index) => {
        if (point.value === null) {
          return null;
        }

        const x = padLeft + step * index;
        const y = padTop + ((100 - point.value) / 100) * chartHeight;

        return {
          index,
          value: point.value,
          x,
          y,
        } as PlottedPoint;
      })
      .filter((point): point is PlottedPoint => point !== null);

    return {
      ...item,
      color: metricMeta.color,
      plottedPoints: points,
      polyline: buildPolyline(points),
      areaPath: buildAreaPath(points, baselineY),
    };
  });

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="ms-dashboard-symptom__chart-shell">
      <div className="ms-dashboard-symptom__legend" aria-label="지표 범례">
        {series.map((item) => (
          <div key={item.metric} className="ms-dashboard-symptom__legend-item">
            <span
              className="ms-dashboard-symptom__legend-dot"
              style={{ backgroundColor: resolveMetricMeta(item.metric).color }}
              aria-hidden
            />
            <span>{resolveMetricMeta(item.metric).label}</span>
          </div>
        ))}
      </div>

      <svg className="ms-dashboard-symptom__chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="우울 불안 불면 상태 추세">
        {gridLines.map((ratio) => {
          const y = padTop + ratio * chartHeight;
          return (
            <line
              key={`grid-${ratio}`}
              x1={padLeft}
              y1={y}
              x2={width - padRight}
              y2={y}
              stroke="var(--color-chart-grid)"
              strokeWidth={1}
            />
          );
        })}

        {plottedSeries.map((item) =>
          item.areaPath ? (
            <path key={`${item.metric}-area`} d={item.areaPath} fill={item.color} fillOpacity={0.18} stroke="none" />
          ) : null,
        )}

        {plottedSeries.map((item) =>
          item.polyline ? (
            <polyline
              key={`${item.metric}-line`}
              fill="none"
              stroke={item.color}
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              points={item.polyline}
            />
          ) : null,
        )}

        {plottedSeries.flatMap((item) =>
          item.plottedPoints.map((point) => (
            <circle key={`${item.metric}-${point.index}-${point.value}`} cx={point.x} cy={point.y} r={4} fill={item.color} />
          )),
        )}
      </svg>

      <div className="ms-dashboard-symptom__axis" aria-hidden>
        {labels.map((label, index) => (
          <span
            key={`${label}-${index}`}
            style={{ left: `${((padLeft + step * index) / width) * 100}%` }}
            className={
              index === labels.length - 1
                ? "ms-dashboard-symptom__axis-label ms-dashboard-symptom__axis-label--today"
                : "ms-dashboard-symptom__axis-label"
            }
          >
            {index === labels.length - 1 ? (mode === "7d" ? "오늘" : "이번주") : label}
          </span>
        ))}
      </div>
    </div>
  );
}
