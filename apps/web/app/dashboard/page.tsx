"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageContainer,
  SectionContainer,
  SegmentedControl,
} from "../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../src/features/auth";
import {
  CoreApiError,
  getSymptomDashboard,
  type SymptomDashboardPoint,
  type SymptomDashboardResponse,
  type SymptomDashboardSeries,
} from "../../src/features/core-inputs";

type Mode = "7d" | "4w_weekly_avg";

type FlowInsight = {
  title: string;
  description: string;
};

type PlottedPoint = {
  index: number;
  label: string;
  value: number;
  x: number;
  y: number;
};

const modeOptions = [
  { label: "주간", value: "7d" },
  { label: "월간", value: "4w_weekly_avg" },
] as const;

const METRIC_META: Record<SymptomDashboardSeries["metric"], { label: string; color: string }> = {
  dep: { label: "우울", color: "var(--color-chart-depression)" },
  anx: { label: "불안", color: "var(--color-chart-anxiety)" },
  ins: { label: "불면", color: "var(--color-chart-insomnia)" },
};

function parseError(error: unknown): string {
  if (error instanceof CoreApiError) {
    if (error.message === "Failed to fetch") {
      return "서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.";
    }
    return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return "서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.";
    }
    return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  return "알 수 없는 오류가 발생했습니다.";
}

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  return value.slice(0, 10);
}

function formatScore(value: number | null): string {
  if (value === null) {
    return "-";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(1);
}

function hasObserved(points: SymptomDashboardPoint[]): boolean {
  return points.some((point) => point.value !== null);
}

function getDelta(points: SymptomDashboardPoint[]): number | null {
  const observed = points
    .filter((point): point is SymptomDashboardPoint & { value: number } => point.value !== null)
    .map((point) => point.value);

  if (observed.length < 2) {
    return null;
  }

  return observed[observed.length - 1] - observed[0];
}

function getSpread(points: SymptomDashboardPoint[]): number | null {
  const observed = points
    .filter((point): point is SymptomDashboardPoint & { value: number } => point.value !== null)
    .map((point) => point.value);

  if (observed.length < 2) {
    return null;
  }

  return Math.max(...observed) - Math.min(...observed);
}

function buildFlowInsights(dashboard: SymptomDashboardResponse, mode: Mode): FlowInsight[] {
  const rangeLabel = mode === "7d" ? "최근 7일" : "최근 4주";
  const insights: FlowInsight[] = [];

  const currentTop = [...dashboard.series]
    .filter((series) => series.current_score !== null)
    .sort((a, b) => (b.current_score ?? -1) - (a.current_score ?? -1))[0];

  if (currentTop?.current_score !== null) {
    insights.push({
      title: "현재 집중 지표",
      description: `${currentTop.label} 점수가 ${formatScore(currentTop.current_score)}점으로 가장 높게 나타났어요. 오늘은 ${currentTop.label} 완화를 돕는 루틴을 우선 배치해보세요.`,
    });
  }

  const deltaLead = [...dashboard.series]
    .map((series) => ({
      label: series.label,
      delta: getDelta(series.points),
      spread: getSpread(series.points),
    }))
    .filter((item): item is { label: string; delta: number; spread: number | null } => item.delta !== null)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];

  if (deltaLead) {
    const direction = deltaLead.delta > 0 ? "올랐고" : deltaLead.delta < 0 ? "내려갔고" : "유지됐고";
    insights.push({
      title: `${rangeLabel} 변화 포인트`,
      description: `${deltaLead.label}가 기간 시작 대비 ${Math.abs(deltaLead.delta).toFixed(1)}점 ${direction} 변동 폭이 ${deltaLead.spread?.toFixed(1) ?? "-"}점으로 관찰됐어요.`,
    });
  }

  const densityRatio =
    dashboard.data_density.days_in_window > 0
      ? dashboard.data_density.recorded_days_any_metric / dashboard.data_density.days_in_window
      : 0;

  const densityText =
    densityRatio >= 0.75
      ? "기록 밀도가 충분해서 추세 해석 신뢰도가 비교적 안정적입니다."
      : densityRatio >= 0.45
        ? "기록 밀도는 중간 수준입니다. 체크인 누락일을 줄이면 해석 정확도가 더 좋아집니다."
        : "기록 밀도가 낮은 편입니다. 주 4일 이상 체크인하면 변화 흐름이 더 잘 보입니다.";

  const assessmentText =
    dashboard.summary.days_until_recommended_assessment === null
      ? "다음 권장 설문 시점은 아직 계산되지 않았어요."
      : dashboard.summary.days_until_recommended_assessment <= 0
        ? "다음 권장 설문 시점이 도래했습니다."
        : `다음 권장 설문까지 ${dashboard.summary.days_until_recommended_assessment}일 남았습니다.`;

  insights.push({
    title: "기록 충분도와 설문 주기",
    description: `${densityText} ${assessmentText}`,
  });

  return insights.slice(0, 3);
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

function SymptomOverlayChart({ series, mode }: { series: SymptomDashboardSeries[]; mode: Mode }) {
  const width = 920;
  const height = 320;
  const padLeft = 24;
  const padRight = 24;
  const padTop = 24;
  const padBottom = 52;
  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;
  const baselineY = height - padBottom;

  const pointCount = Math.max(
    1,
    ...series.map((item) => item.points.length)
  );
  const step = pointCount > 1 ? chartWidth / (pointCount - 1) : 0;

  const labels = getAxisLabels(series);

  const plottedSeries = series.map((item) => {
    const points = item.points
      .map((point, index) => {
        if (point.value === null) {
          return null;
        }

        const x = padLeft + step * index;
        const y = padTop + ((100 - point.value) / 100) * chartHeight;

        return {
          index,
          label: point.x_label,
          value: point.value,
          x,
          y,
        } as PlottedPoint;
      })
      .filter((point): point is PlottedPoint => point !== null);

    return {
      ...item,
      color: METRIC_META[item.metric].color,
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
            <span className="ms-dashboard-symptom__legend-dot" style={{ backgroundColor: METRIC_META[item.metric].color }} aria-hidden />
            <span>{METRIC_META[item.metric].label}</span>
          </div>
        ))}
      </div>

      <svg
        className="ms-dashboard-symptom__chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="우울 불안 불면 상태 추세"
      >
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
            <path
              key={`${item.metric}-area`}
              d={item.areaPath}
              fill={item.color}
              fillOpacity={0.18}
              stroke="none"
            />
          ) : null
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
          ) : null
        )}

        {plottedSeries.flatMap((item) =>
          item.plottedPoints.map((point) => (
            <circle
              key={`${item.metric}-${point.index}-${point.value}`}
              cx={point.x}
              cy={point.y}
              r={4}
              fill={item.color}
            />
          ))
        )}
      </svg>

      <div className="ms-dashboard-symptom__axis" aria-hidden>
        {labels.map((label, index) => (
          <span
            key={`${label}-${index}`}
            style={{ left: `${((padLeft + step * index) / width) * 100}%` }}
            className={index === labels.length - 1 ? "ms-dashboard-symptom__axis-label ms-dashboard-symptom__axis-label--today" : "ms-dashboard-symptom__axis-label"}
          >
            {index === labels.length - 1 ? (mode === "7d" ? "오늘" : "이번주") : label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { firebaseUser } = useAuthContext();

  const [mode, setMode] = useState<Mode>("7d");
  const [dashboard, setDashboard] = useState<SymptomDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const response = await getSymptomDashboard(firebaseUser, mode);
      setDashboard(response);
    } catch (error) {
      setErrorMessage(parseError(error));
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  const allMissing = useMemo(() => {
    if (!dashboard) {
      return false;
    }
    return dashboard.series.every((series) => !hasObserved(series.points));
  }, [dashboard]);

  const flowInsights = useMemo(() => {
    if (!dashboard) {
      return [];
    }
    return buildFlowInsights(dashboard, mode);
  }, [dashboard, mode]);

  const densityVariant = (dashboard?.data_density.recorded_days_any_metric ?? 0) <= 2 ? "warning" : "info";

  return (
    <AuthRouteGuard policy="require-active">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">대시보드</Badge>
          </div>
        }
      >
        <PageContainer size="lg">
          <SectionContainer title="대시보드" description="우울·불안·불면 지표를 주간/월간 기준으로 확인합니다.">
            {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

            {loading ? (
              <Card className="ms-dashboard-symptom__loading-card">
                <LoadingSkeleton lines={12} />
              </Card>
            ) : errorMessage ? (
              <ErrorState
                title="대시보드를 불러오지 못했습니다"
                description="잠시 후 다시 시도해 주세요."
                retryAction={<Button onClick={() => void load()}>다시 시도</Button>}
              />
            ) : dashboard ? (
              <div className="ms-dashboard-symptom">
                <div className="ms-dashboard-symptom__score-grid" aria-label="현재 지표 점수">
                  {dashboard.series.map((series) => (
                    <article
                      key={series.metric}
                      className={`ms-dashboard-symptom__score-card ms-dashboard-symptom__score-card--${series.metric}`}
                    >
                      <p className="ms-dashboard-symptom__score-label">{series.label} 현재 점수</p>
                      <p className="ms-dashboard-symptom__score-value">{formatScore(series.current_score)}</p>
                      <p className="ms-dashboard-symptom__score-meta">
                        평균 {formatScore(series.window_mean)} · 기록 {series.recorded_days}일
                      </p>
                    </article>
                  ))}
                </div>

                <div className="ms-dashboard-symptom__mode-switch">
                  <SegmentedControl
                    options={[...modeOptions]}
                    value={mode}
                    onChange={setMode}
                    ariaLabel="대시보드 기간 선택"
                  />
                </div>

                {allMissing ? (
                  <EmptyState
                    title={mode === "7d" ? "최근 7일에 기록된 데이터가 없어요" : "최근 4주 기록이 아직 부족해요"}
                    description="체크인 또는 심리검사를 진행하면 추세를 확인할 수 있어요."
                  />
                ) : (
                  <Card
                    className="ms-dashboard-symptom__chart-card"
                    title="상태 흐름"
                    description="빈 날짜는 비워두고 관측값 사이를 연결해 변화 흐름을 보여줍니다."
                  >
                    <div className="ms-dashboard-symptom__meta-row">
                      <span>최근 설문: {formatDate(dashboard.summary.last_assessment_at)}</span>
                      <span>
                        다음 권장: {dashboard.summary.days_until_recommended_assessment ?? "-"}
                        {dashboard.summary.days_until_recommended_assessment !== null ? "일" : ""}
                      </span>
                      <span>업데이트: {formatDate(dashboard.summary.last_updated_at)}</span>
                    </div>
                    <SymptomOverlayChart series={dashboard.series} mode={mode} />
                  </Card>
                )}

                <Banner
                  variant={densityVariant}
                  title="데이터 충분도"
                  description={dashboard.data_density.message}
                />

                <Card title="주요 흐름" description="현재 구간에서 관찰된 변화를 2~3개 핵심 포인트로 정리했습니다.">
                  <div className="ms-dashboard-symptom__insight-grid">
                    {flowInsights.map((insight) => (
                      <article key={insight.title} className="ms-dashboard-symptom__insight-item">
                        <h4 className="ms-dashboard-symptom__insight-title">{insight.title}</h4>
                        <p className="ms-dashboard-symptom__insight-desc">{insight.description}</p>
                      </article>
                    ))}
                  </div>
                </Card>
              </div>
            ) : null}
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
