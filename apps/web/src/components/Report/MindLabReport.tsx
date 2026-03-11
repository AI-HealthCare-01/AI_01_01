"use client";

import { useMemo, useState } from "react";

import { Banner, Badge, Button, Card } from "../ui";
import { StatusFlowGraph } from "../dashboard/StatusFlowGraph";
import type {
  MindLabReportData,
  ScoreInterpretation,
} from "../../types/report";
import { PrintTrendCharts } from "./PrintTrendCharts";
import { exportReportPDF, exportReportPNG } from "../../utils/exportReport";
import {
  adaptHistoryToStatusFlow,
  formatDate,
  generateInsights,
  interpretGAD7,
  interpretISI,
  interpretPHQ9,
  interpretRisk,
  recommendChallenges,
} from "../../utils/reportUtils";

type MetricKey = "phq9" | "gad7" | "isi";

const METRIC_MAX: Record<MetricKey, number> = {
  phq9: 27,
  gad7: 21,
  isi: 28,
};

const METRIC_TITLE: Record<MetricKey, string> = {
  phq9: "PHQ-9",
  gad7: "GAD-7",
  isi: "ISI",
};

const DOMAIN_ORDER: Array<"신체건강" | "정서" | "사회" | "습관"> = [
  "신체건강",
  "정서",
  "사회",
  "습관",
];

function getDaysSinceBadge(daysSince: number): {
  text: string;
  tone: "success" | "warn" | "danger";
} {
  if (daysSince <= 7) {
    return { text: "최근 검사", tone: "success" };
  }
  if (daysSince <= 30) {
    return { text: `${daysSince}일 전 검사`, tone: "warn" };
  }
  return { text: "검사 갱신 필요", tone: "danger" };
}

function metricInterpretation(metric: MetricKey, score: number | null): ScoreInterpretation {
  if (metric === "phq9") {
    return interpretPHQ9(score);
  }
  if (metric === "gad7") {
    return interpretGAD7(score);
  }
  return interpretISI(score);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function MindLabReport({ data }: { data: MindLabReportData }) {
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "png" | null>(null);

  const today = useMemo(() => formatDate(new Date().toISOString().slice(0, 10)), []);
  const daysBadge = getDaysSinceBadge(data.latestAssessment.daysSince);

  const latestByMetric: Record<MetricKey, number | null> = {
    phq9: data.latestAssessment.phq9,
    gad7: data.latestAssessment.gad7,
    isi: data.latestAssessment.isi,
  };

  const sortedHistory = useMemo(
    () => [...data.assessmentHistory].sort((a, b) => a.date.localeCompare(b.date)),
    [data.assessmentHistory],
  );
  const statusFlowData = useMemo(() => adaptHistoryToStatusFlow(sortedHistory), [sortedHistory]);
  const statusFlowMode = useMemo<"7d" | "4w_weekly_avg">(() => {
    const start = new Date(data.period.start).getTime();
    const end = new Date(data.period.end).getTime();
    const diff = Math.max(0, (end - start) / 86400000);
    return diff <= 10 ? "7d" : "4w_weekly_avg";
  }, [data.period.end, data.period.start]);

  const domainCounts = useMemo(() => {
    const map: Record<"신체건강" | "정서" | "사회" | "습관", number> = {
      신체건강: 0,
      정서: 0,
      사회: 0,
      습관: 0,
    };
    data.challenges.list.forEach((item) => {
      map[item.domain] += 1;
    });
    return map;
  }, [data.challenges.list]);

  const challengeTotal = data.challenges.list.length;
  const challengeCompletion = challengeTotal > 0 ? Math.round((data.challenges.completedCount / challengeTotal) * 100) : 0;

  const insights = useMemo(() => generateInsights(data), [data]);
  const recommended = useMemo(() => recommendChallenges(data), [data]);

  const onExportPdf = async () => {
    try {
      setExporting("pdf");
      await exportReportPDF(data.period, {
        beforeCapture: async () => {
          setIsPrintMode(true);
          await new Promise((resolve) => setTimeout(resolve, 400));
        },
        afterCapture: async () => {
          setIsPrintMode(false);
          await new Promise((resolve) => setTimeout(resolve, 50));
        },
      });
    } finally {
      setExporting(null);
    }
  };

  const onExportPng = async () => {
    try {
      setExporting("png");
      await exportReportPNG(data.period, {
        beforeCapture: async () => {
          setIsPrintMode(true);
          await new Promise((resolve) => setTimeout(resolve, 400));
        },
        afterCapture: async () => {
          setIsPrintMode(false);
          await new Promise((resolve) => setTimeout(resolve, 50));
        },
      });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div id="mindlab-report-root" className="mlr-root">
      <div className="mlr-export-row">
        <Button onClick={() => void onExportPdf()} disabled={exporting !== null}>
          {exporting === "pdf" ? "생성 중..." : "📄 PDF 다운로드"}
        </Button>
        <Button variant="secondary" onClick={() => void onExportPng()} disabled={exporting !== null}>
          {exporting === "png" ? "생성 중..." : "🖼 PNG 다운로드"}
        </Button>
      </div>

      <Card>
        <div className="mlr-header">
          <div>
            <p className="mlr-logo">MindLab</p>
            <h2 className="mlr-title">Personal Wellness Report</h2>
            <p className="mlr-meta">
              기간: {formatDate(data.period.start)} - {formatDate(data.period.end)} · 생성일: {today}
            </p>
          </div>
        </div>
        <Banner
          variant="warning"
          title="주의"
          description="⚠️ 이 리포트는 자기 이해를 위한 참고 자료이며 의학적 진단이나 처방을 대체하지 않습니다."
        />
      </Card>

      <div className="mlr-grid4">
        {(["phq9", "gad7", "isi"] as MetricKey[]).map((key) => {
          const score = latestByMetric[key];
          const interp = metricInterpretation(key, score);
          return (
            <Card key={key} className="mlr-status-card">
              <div className="mlr-status-top" style={{ background: interp.color }} />
              <p className="mlr-status-label">{METRIC_TITLE[key]}</p>
              <p className="mlr-status-score">{score === null ? "-" : score}</p>
              <p className="mlr-status-desc">{interp.label}</p>
            </Card>
          );
        })}
        <Card className="mlr-status-card">
          <div className="mlr-status-top" style={{ background: interpretRisk(data.riskLevel).color }} />
          <p className="mlr-status-label">위험도</p>
          <p className="mlr-status-score">{data.riskLevel}</p>
          <p className="mlr-status-desc">{interpretRisk(data.riskLevel).label}</p>
          {data.riskLevel >= 2 ? (
            <p className="mlr-risk-callout">전문가 상담을 권장합니다. 자살예방상담전화 1393 (24시간)</p>
          ) : null}
        </Card>
      </div>

      <Card title="검사 최신성">
        <Badge variant={daysBadge.tone === "success" ? "success" : daysBadge.tone === "warn" ? "warning" : "danger"}>
          {daysBadge.text}
        </Badge>
      </Card>

      <Card title="점수 게이지">
        <div className="mlr-stack">
          {(["phq9", "gad7", "isi"] as MetricKey[]).map((key) => {
            const score = latestByMetric[key];
            const max = METRIC_MAX[key];
            const interp = metricInterpretation(key, score);
            const ratio = score === null ? 0 : clampPercent((score / max) * 100);
            return (
              <div key={key}>
                <div className="mlr-gauge-head">
                  <p>{METRIC_TITLE[key]}</p>
                  <p>
                    {score === null ? "-" : score}/{max}
                  </p>
                </div>
                <div className="mlr-gauge-track">
                  <div className="mlr-gauge-fill" style={{ width: `${ratio}%`, background: interp.color }} />
                  {score !== null ? <span className="mlr-gauge-marker" style={{ left: `${ratio}%` }}>▼</span> : null}
                </div>
                <div className="mlr-gauge-scale">
                  <span>정상</span>
                  <span>경미</span>
                  <span>중간</span>
                  <span>심각</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="검사 추이">
        {!isPrintMode && sortedHistory.length === 0 ? (
          <p className="mlr-muted">검사 기록이 없어 변화 추적이 불가합니다.</p>
        ) : null}
        {!isPrintMode && sortedHistory.length > 0 ? (
          <StatusFlowGraph series={statusFlowData} mode={statusFlowMode} />
        ) : null}
        {isPrintMode ? (
          <PrintTrendCharts history={sortedHistory} />
        ) : null}
        {/*
          <TrendChart ... />
        */}
        {isPrintMode && sortedHistory.length === 0 ? (
          <p className="mlr-muted">검사 기록이 없어 상태흐름을 표시할 수 없습니다</p>
        ) : null}
      </Card>

      <Card title="활동 참여">
        <div className="mlr-grid2">
          <div>
            <p className="mlr-stat-title">체크인</p>
            <p className="mlr-stat-big">
              {data.activity.checkinDays} / {data.activity.checkinGoal}일
            </p>
            <div className="mlr-progress-track">
              <div
                className="mlr-progress-fill"
                style={{ width: `${clampPercent((data.activity.checkinDays / Math.max(1, data.activity.checkinGoal)) * 100)}%` }}
              />
            </div>
          </div>
          <div>
            <p className="mlr-stat-title">CBT 세션</p>
            <p className="mlr-stat-big">{data.activity.cbtSessions}회 완료</p>
            <p className="mlr-muted">
              성찰 완료 {data.activity.cbtReflectionsCompleted} / 대기 {data.activity.cbtReflectionsPending}
            </p>
            <div className="mlr-progress-track">
              <div
                className="mlr-progress-fill"
                style={{
                  width: `${clampPercent((data.activity.cbtReflectionsCompleted / Math.max(1, data.activity.cbtReflectionsCompleted + data.activity.cbtReflectionsPending)) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
        <p className="mlr-muted">활성 챌린지: {data.challenges.activeCount}개 진행 중</p>
      </Card>

      <Card title="데일리 체크인 요약">
        <p className="mlr-stat-big">
          {data.activity.checkinDays} / {data.activity.checkinGoal}일
        </p>
        <p className="mlr-muted">
          기간 내 체크인 참여율{" "}
          {Math.round(
            (data.activity.checkinDays / Math.max(1, data.activity.checkinGoal)) * 100,
          )}
          %
        </p>
      </Card>

      <Card title="CBT 마무리 포인트">
        <p className="mlr-stat-big">{data.activity.cbtSessions}회</p>
        <p className="mlr-muted">
          성찰 완료 {data.activity.cbtReflectionsCompleted}건 · 성찰 대기{" "}
          {data.activity.cbtReflectionsPending}건
        </p>
      </Card>

      <Card title="챌린지 분석">
        {challengeTotal === 0 ? (
          <p className="mlr-muted">참여한 챌린지가 없습니다.</p>
        ) : (
          <>
            <div className="mlr-stack">
              {DOMAIN_ORDER.map((domain) => {
                const count = domainCounts[domain];
                const pct = clampPercent((count / challengeTotal) * 100);
                return (
                  <div key={domain}>
                    <div className="mlr-gauge-head">
                      <p>{domain}</p>
                      <p>{count}</p>
                    </div>
                    <div className="mlr-progress-track">
                      <div className="mlr-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mlr-muted">
              완료율: Completed {data.challenges.completedCount} / Total {challengeTotal} ({challengeCompletion}%)
            </p>
            <div className="mlr-chip-wrap">
              {data.challenges.list.map((challenge) => (
                <span key={`${challenge.id}-${challenge.status}`} className={`mlr-chip ${challenge.status}`}>
                  {challenge.name}
                  {challenge.status === "completed" ? " ✓" : ""}
                </span>
              ))}
            </div>
          </>
        )}
      </Card>

      {data.riskLevel > 0 ? (
        <Card title="위험 신호">
          <p className="mlr-risk-line">현재 위험도: {interpretRisk(data.riskLevel).label}</p>
          <p className="mlr-risk-line">
            위험 신호가 감지되었습니다. 혼자 감당하지 않아도 됩니다. 자살예방상담전화 1393 (24시간 무료)
          </p>
        </Card>
      ) : null}

      <Card title="개인 인사이트">
        <ul className="mlr-insights">
          {insights.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {data.riskLevel < 2 && recommended.length > 0 ? (
          <div>
            <p className="mlr-stat-title">추천 챌린지</p>
            <div className="mlr-chip-wrap">
              {recommended.map((item) => (
                <span key={item} className="mlr-chip active">
                  {item}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
