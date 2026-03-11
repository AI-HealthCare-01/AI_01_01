"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingSkeleton,
  PageContainer,
  SectionContainer,
  SegmentedControl,
} from "../../../src/components/ui";
import { MindLabReport } from "../../../src/components/Report/MindLabReport";
import { AuthRouteGuard, useAuthContext } from "../../../src/features/auth";
import {
  CommunityApiError,
  deleteMyPageReportVaultItem,
  listMyPageReportVault,
  type MyPageReportVaultItem,
} from "../../../src/features/community";
import {
  CoreApiError,
  getReportSummary,
  saveReportSummary,
  type ReportSummaryResponse,
} from "../../../src/features/core-inputs";
import type { ChallengeItem, MindLabReportData } from "../../../src/types/report";

type PeriodPreset = "week" | "month" | "custom";
type ExportFormat = "pdf" | "png";
type ReportRange = { start: string; end: string };
type ActiveReportSource = "live" | "history";

function toDateString(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseError(error: unknown): string {
  if (error instanceof CommunityApiError) {
    if (error.message === "Failed to fetch") {
      return "서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.";
    }
    return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
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

function defaultRangeForPreset(preset: Exclude<PeriodPreset, "custom">): ReportRange {
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  const start = new Date(end);
  start.setDate(end.getDate() - (preset === "week" ? 6 : 27));

  return {
    start: toDateString(start),
    end: toDateString(end),
  };
}

function isValidDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatScore(value: number | null, total: number): string {
  return `${value ?? "-"}/${total}`;
}

function formatDuration(valueMinutes: number | null | undefined): string {
  if (valueMinutes === null || valueMinutes === undefined || Number.isNaN(valueMinutes)) {
    return "-";
  }

  const total = Math.max(0, Math.round(valueMinutes));
  const hour = Math.floor(total / 60);
  const minute = total % 60;

  if (hour > 0 && minute > 0) {
    return `${hour}시간 ${minute}분`;
  }
  if (hour > 0) {
    return `${hour}시간`;
  }
  return `${minute}분`;
}

function formatClock(valueMinutes: number | null | undefined): string {
  if (valueMinutes === null || valueMinutes === undefined || Number.isNaN(valueMinutes)) {
    return "-";
  }

  const rounded = Math.max(0, Math.round(valueMinutes));
  const hour = Math.floor((rounded % (24 * 60)) / 60);
  const minute = rounded % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatWeeklyCount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}회` : `${rounded.toFixed(1)}회`;
}

function riskTypeLabel(type: string): string {
  if (type === "suicide_risk") {
    return "자해/자살 위험";
  }
  if (type === "self_harm") {
    return "자해 위험";
  }
  if (type === "violence_risk") {
    return "타해 위험";
  }
  return "기능 저하";
}

function normalizeChallengeDomain(challengeId: string): ChallengeItem["domain"] {
  if (["sunlight-10min", "walk-10min", "water-intake"].includes(challengeId)) {
    return "신체건강";
  }
  if (["confidence-list", "sensory-grounding"].includes(challengeId)) {
    return "정서";
  }
  if (["interpersonal-map", "CH_SOC_001"].includes(challengeId)) {
    return "사회";
  }
  return "습관";
}

function toMindLabReportData(report: ReportSummaryResponse): MindLabReportData {
  const history = report.computed.assessments.history.map((item) => ({
    date: item.completed_at.slice(0, 10),
    phq9: item.phq9_total,
    gad7: item.gad7_total,
    isi: item.isi_total,
  }));

  const challengeList: ChallengeItem[] = [
    ...report.computed.challenge_summary.completed_items.map((item) => ({
      id: item.challenge_id,
      name: item.challenge_name,
      domain: normalizeChallengeDomain(item.challenge_id),
      status: "completed" as const,
    })),
    ...report.computed.challenge_summary.dropped_items.map((item) => ({
      id: item.challenge_id,
      name: item.challenge_name,
      domain: normalizeChallengeDomain(item.challenge_id),
      status: "abandoned" as const,
    })),
  ];

  const knownActive = challengeList.filter((item) => item.status === "active").length;
  const placeholderActiveCount = Math.max(0, report.computed.challenge_summary.active_count - knownActive);
  for (let i = 0; i < placeholderActiveCount; i += 1) {
    challengeList.push({
      id: `active-${i + 1}`,
      name: `진행 중 챌린지 ${i + 1}`,
      domain: "습관",
      status: "active",
    });
  }

  const risk = Math.max(0, Math.min(3, report.computed.risk_summary.suicide_risk_max_level)) as 0 | 1 | 2 | 3;

  return {
    period: {
      start: report.period.start_date,
      end: report.period.end_date,
    },
    latestAssessment: {
      phq9: report.computed.assessments.latest.phq9_total,
      gad7: report.computed.assessments.latest.gad7_total,
      isi: report.computed.assessments.latest.isi_total,
      daysSince: report.computed.assessments.latest.days_since ?? 999,
    },
    assessmentHistory: history,
    activity: {
      checkinDays: report.source_density.checkin_days,
      checkinGoal: report.source_density.days_in_period,
      cbtSessions: report.computed.cbt_summary.sessions_count,
      cbtReflectionsPending: report.computed.cbt_summary.pending_reflection_count,
      cbtReflectionsCompleted: report.computed.cbt_summary.completed_reflection_count,
    },
    challenges: {
      activeCount: report.computed.challenge_summary.active_count,
      completedCount: report.computed.challenge_summary.completed_items.length,
      list: challengeList,
    },
    riskLevel: risk,
  };
}

export default function ReportSummaryPage() {
  const { firebaseUser } = useAuthContext();
  const hiddenExportRef = useRef<HTMLDivElement | null>(null);

  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [draftRange, setDraftRange] = useState<ReportRange>(defaultRangeForPreset("month"));
  const [activeRange, setActiveRange] = useState<ReportRange | null>(null);
  const [activeReportSource, setActiveReportSource] = useState<ActiveReportSource>("live");
  const [includeSensitive, setIncludeSensitive] = useState(true);
  const [hasViewedReport, setHasViewedReport] = useState(false);
  const [report, setReport] = useState<ReportSummaryResponse | null>(null);
  const [historyItems, setHistoryItems] = useState<MyPageReportVaultItem[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyDeletingId, setHistoryDeletingId] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [downloadKey, setDownloadKey] = useState<string | null>(null);
  const [autoViewRange, setAutoViewRange] = useState<ReportRange | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const query = new URLSearchParams(window.location.search);
    const startDate = query.get("start_date");
    const endDate = query.get("end_date");
    const includeSensitiveParam = query.get("include_sensitive");

    if (startDate && endDate && isValidDateString(startDate) && isValidDateString(endDate)) {
      setPreset("custom");
      setDraftRange({ start: startDate, end: endDate });
      setAutoViewRange({ start: startDate, end: endDate });
    }

    if (includeSensitiveParam === "true" || includeSensitiveParam === "false") {
      setIncludeSensitive(includeSensitiveParam === "true");
    }
  }, []);

  useEffect(() => {
    if (preset === "custom") {
      return;
    }
    setDraftRange(defaultRangeForPreset(preset));
  }, [preset]);

  const canViewReport = useMemo(() => {
    if (preset !== "custom") {
      return true;
    }
    return (
      Boolean(draftRange.start) &&
      Boolean(draftRange.end) &&
      draftRange.start <= draftRange.end
    );
  }, [draftRange.end, draftRange.start, preset]);

  const hasData = useMemo(() => {
    if (!report) {
      return false;
    }
    return (
      report.source_density.checkin_days > 0 ||
      report.source_density.challenge_log_days > 0 ||
      report.source_density.cbt_sessions > 0 ||
      report.source_density.assessment_count > 0
    );
  }, [report]);

  const reportDataForExport = useMemo(() => {
    if (!report) {
      return null;
    }
    return toMindLabReportData(report);
  }, [report]);

  const loadReport = useCallback(async (nextRange: ReportRange, sensitive: boolean) => {
    if (!firebaseUser) {
      return;
    }

    try {
      setReportLoading(true);
      setErrorMessage(null);
      setHasViewedReport(true);
      const next = await getReportSummary(firebaseUser, {
        start_date: nextRange.start,
        end_date: nextRange.end,
        include_sensitive: sensitive,
      });
      setReport(next);
      setActiveRange(nextRange);
    } catch (error) {
      setErrorMessage(parseError(error));
      setReport(null);
    } finally {
      setReportLoading(false);
    }
  }, [firebaseUser]);

  const loadHistory = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }

    try {
      setHistoryLoading(true);
      const rows = await listMyPageReportVault(firebaseUser, 30);
      setHistoryItems(rows);
    } catch (error) {
      setErrorMessage(parseError(error));
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!firebaseUser || !autoViewRange) {
      return;
    }
    void loadReport(autoViewRange, includeSensitive);
    setAutoViewRange(null);
  }, [autoViewRange, firebaseUser, includeSensitive, loadReport]);

  const onViewReport = async () => {
    if (!canViewReport) {
      return;
    }
    setActiveReportSource("live");
    await loadReport(draftRange, includeSensitive);
  };

  const onExport = async (format: ExportFormat) => {
    if (!reportDataForExport || !hiddenExportRef.current) {
      return;
    }

    try {
      setDownloadKey(`current-${format}`);
      setErrorMessage(null);
      const targetText = format === "pdf" ? "PDF 다운로드" : "PNG 다운로드";
      const targetButton = Array.from(hiddenExportRef.current.querySelectorAll("button")).find((button) =>
        (button.textContent || "").includes(targetText)
      ) as HTMLButtonElement | undefined;
      if (!targetButton) {
        throw new Error("export_button_not_found");
      }
      targetButton.click();
      await new Promise((resolve) => setTimeout(resolve, 1200));
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setDownloadKey(null);
    }
  };

  const onSave = async () => {
    if (!firebaseUser || !activeRange) {
      return;
    }

    try {
      setSaveLoading(true);
      setNoticeMessage(null);
      setErrorMessage(null);
      await saveReportSummary(firebaseUser, {
        start_date: activeRange.start,
        end_date: activeRange.end,
        include_sensitive: includeSensitive,
      });
      setNoticeMessage("리포트를 저장했습니다. 지난 리포트 보기와 리포트 보관함에서 확인할 수 있습니다.");
      await loadHistory();
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setSaveLoading(false);
    }
  };

  const onLoadHistoryReport = async (item: MyPageReportVaultItem) => {
    const nextRange = { start: item.period_start, end: item.period_end };
    setPreset("custom");
    setDraftRange(nextRange);
    setActiveReportSource("history");
    await loadReport(nextRange, true);
  };

  const onDeleteHistoryReport = async (item: MyPageReportVaultItem) => {
    if (!firebaseUser) {
      return;
    }

    const confirmed = window.confirm("삭제하시겠습니까?");
    if (!confirmed) {
      return;
    }

    try {
      setHistoryDeletingId(item.report_id);
      setNoticeMessage(null);
      setErrorMessage(null);
      await deleteMyPageReportVaultItem(firebaseUser, item.report_id);
      setNoticeMessage("저장된 리포트를 삭제했습니다.");
      await loadHistory();
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setHistoryDeletingId(null);
    }
  };

  const latestAssessmentDate = report?.computed.assessments.latest.completed_at?.slice(0, 10) ?? "-";
  const completedChallenges = report?.computed.challenge_summary.completed_items ?? [];
  const droppedChallenges = report?.computed.challenge_summary.dropped_items ?? [];
  const cbtHighlights = report?.computed.cbt_summary.highlights.slice(0, 3) ?? [];
  const riskEvents = report?.computed.risk_summary.events ?? [];

  return (
    <AuthRouteGuard policy="require-active">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">리포트</Badge>
          </div>
        }
      >
        <PageContainer size="lg">
          <SectionContainer title="리포트" description="기간을 선택해 리포트를 확인하고 PDF/PNG로 내보낼 수 있습니다.">
            {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}
            {noticeMessage ? <Banner variant="success" title="저장 완료" description={noticeMessage} /> : null}

            <Card className="ms-report-period-card" title="기간">
              <div className="ms-report-period-controls">
                <div className="ms-report-period-tabs">
                  <SegmentedControl
                    options={[
                      { label: "일주일", value: "week" },
                      { label: "한 달", value: "month" },
                      { label: "기간 지정", value: "custom" },
                    ]}
                    value={preset}
                    onChange={(next) => setPreset(next)}
                    ariaLabel="리포트 기간 선택"
                  />
                </div>
                <Input
                  label="시작일"
                  type="date"
                  value={draftRange.start}
                  onChange={(event) =>
                    setDraftRange((previous) => ({ ...previous, start: event.target.value }))
                  }
                  disabled={preset !== "custom"}
                />
                <Input
                  label="종료일"
                  type="date"
                  value={draftRange.end}
                  onChange={(event) =>
                    setDraftRange((previous) => ({ ...previous, end: event.target.value }))
                  }
                  disabled={preset !== "custom"}
                />
                <Button onClick={() => void onViewReport()} loading={reportLoading} disabled={!canViewReport}>
                  리포트 보기
                </Button>
              </div>
              {preset === "custom" && !canViewReport ? (
                <p className="ms-report-period-hint">기간 지정에서는 시작일과 종료일을 모두 선택해야 합니다.</p>
              ) : null}
            </Card>

            <Card className="ms-report-preview-card" title="요약 리포트">
              {reportLoading ? (
                <LoadingSkeleton lines={14} />
              ) : !hasViewedReport ? (
                <EmptyState
                  title="리포트를 아직 조회하지 않았습니다"
                  description="기간을 고른 뒤 '리포트 보기' 버튼을 눌러 내용을 확인하세요."
                />
              ) : !report || !hasData ? (
                <EmptyState
                  title="선택 기간의 데이터가 부족합니다"
                  description="기간을 조정하거나 체크인/활동 기록을 더 쌓은 뒤 다시 확인해 주세요."
                />
              ) : (
                <div className="ms-stack">
                  <div className="ms-report-preview-meta">
                    <Badge variant="info">
                      {report.period.start_date} ~ {report.period.end_date}
                    </Badge>
                    <Badge variant="neutral">최근 검사일 {latestAssessmentDate}</Badge>
                  </div>

                  <div className="ms-report-preview-grid">
                    <article className="ms-report-preview-metric ms-report-preview-metric--dep">
                      <p className="ms-report-preview-metric__label">우울 점수</p>
                      <p className="ms-report-preview-metric__value">
                        {formatScore(report.computed.assessments.latest.phq9_total, 27)}
                      </p>
                      <p className="ms-report-preview-metric__meta">최근 진단척도 검사 기준</p>
                    </article>
                    <article className="ms-report-preview-metric ms-report-preview-metric--anx">
                      <p className="ms-report-preview-metric__label">불안 점수</p>
                      <p className="ms-report-preview-metric__value">
                        {formatScore(report.computed.assessments.latest.gad7_total, 21)}
                      </p>
                      <p className="ms-report-preview-metric__meta">최근 진단척도 검사 기준</p>
                    </article>
                    <article className="ms-report-preview-metric ms-report-preview-metric--ins">
                      <p className="ms-report-preview-metric__label">불면 점수</p>
                      <p className="ms-report-preview-metric__value">
                        {formatScore(report.computed.assessments.latest.isi_total, 28)}
                      </p>
                      <p className="ms-report-preview-metric__meta">최근 진단척도 검사 기준</p>
                    </article>
                  </div>

                  <div className="ms-report-preview-summary">
                    <p className="ms-report-preview-summary__title">챌린지</p>
                    <div className="ms-stack">
                      <p className="ms-card__desc">수행 완료</p>
                      {completedChallenges.length === 0 ? (
                        <p className="ms-card__desc">기록 없음</p>
                      ) : (
                        completedChallenges.map((item, index) => (
                          <p key={`${item.challenge_id}-completed-${index}`} className="ms-card__desc">
                            {item.challenge_name} · {item.summary_ko} · ({item.spent_days}일)
                          </p>
                        ))
                      )}
                      <p className="ms-card__desc">중도 포기</p>
                      {droppedChallenges.length === 0 ? (
                        <p className="ms-card__desc">기록 없음</p>
                      ) : (
                        droppedChallenges.map((item, index) => (
                          <p key={`${item.challenge_id}-dropped-${index}`} className="ms-card__desc">
                            {item.challenge_name} · {item.summary_ko} · ({item.performed_days}일/{item.target_days}일)
                          </p>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="ms-report-preview-summary">
                    <p className="ms-report-preview-summary__title">수면</p>
                    <p className="ms-card__desc">
                      하루 평균 수면 시간: {formatDuration(report.computed.sleep_metrics.sleep_total_mean_min)}
                    </p>
                    <p className="ms-card__desc">
                      평균 기상 시간: {formatClock(report.computed.sleep_metrics.wake_time_mean_min)}
                    </p>
                    <p className="ms-card__desc">
                      기상시간 일정한 정도: {report.computed.sleep_metrics.wake_time_consistency_label}
                    </p>
                    <p className="ms-card__desc">
                      평균 잠들기까지 걸린 시간:{" "}
                      {formatDuration(report.computed.sleep_metrics.sleep_latency_mean_min)}
                    </p>
                  </div>

                  <div className="ms-report-preview-summary">
                    <p className="ms-report-preview-summary__title">운동</p>
                    <p className="ms-card__desc">
                      하루 평균 운동 시간:{" "}
                      {formatDuration(report.computed.lifestyle_metrics.exercise_mean_min_per_day)}
                    </p>
                    <p className="ms-card__desc">
                      주 평균 운동 횟수:{" "}
                      {formatWeeklyCount(report.computed.lifestyle_metrics.exercise_weekly_avg_days)}
                    </p>
                  </div>

                  <div className="ms-report-preview-summary">
                    <p className="ms-report-preview-summary__title">활동</p>
                    <p className="ms-card__desc">
                      하루 평균 햇빛 노출 시간:{" "}
                      {formatDuration(report.computed.lifestyle_metrics.daylight_mean_min_per_day)}
                    </p>
                    <p className="ms-card__desc">
                      주 평균 운동 횟수:{" "}
                      {formatWeeklyCount(report.computed.lifestyle_metrics.exercise_weekly_avg_days)}
                    </p>
                    <p className="ms-card__desc">
                      주 평균 오후 2시 카페인 섭취 횟수:{" "}
                      {formatWeeklyCount(report.computed.lifestyle_metrics.late_caffeine_weekly_avg_days)}
                    </p>
                  </div>

                  <div className="ms-report-preview-summary">
                    <p className="ms-report-preview-summary__title">CBT 주요 세션</p>
                    {cbtHighlights.length === 0 ? (
                      <p className="ms-card__desc">기록 없음</p>
                    ) : (
                      <div className="ms-report-cbt-session-list">
                        {cbtHighlights.map((highlight, index) => (
                          <article key={`${highlight.date}-${index}`} className="ms-report-cbt-session-item">
                            <p className="ms-card__desc">
                              <strong>세션일자</strong> · {highlight.date || "-"}
                            </p>
                            <p className="ms-card__desc">
                              <strong>핵심신념</strong> · {highlight.belief || "-"}
                            </p>
                            <p className="ms-card__desc">
                              <strong>교정문장</strong> · {highlight.balanced_statement || "-"}
                            </p>
                            <p className="ms-card__desc">
                              <strong>TO DO</strong> · {highlight.action || "정하지 않음"}
                            </p>
                            <p className="ms-card__desc">
                              <strong>회고 내용</strong> · {highlight.reflection_note || "-"}
                            </p>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="ms-report-preview-summary">
                    <p className="ms-report-preview-summary__title">위험 플래그</p>
                    {riskEvents.length === 0 ? (
                      <p className="ms-card__desc">기록 없음</p>
                    ) : (
                      riskEvents.map((event, index) => (
                        <p key={`${event.date}-${index}`} className="ms-card__desc">
                          {event.date} · {riskTypeLabel(event.type)}
                          {event.level !== null ? ` (레벨 ${event.level})` : ""}
                          {event.type === "functional_impairment" && event.detail ? ` · ${event.detail}` : ""}
                        </p>
                      ))
                    )}
                  </div>

                  <p className="ms-report-preview-disclaimer">
                    본 리포트는 자가 기록 기반의 참고 자료이며, 의료적 진단이나 법적 판단을 대체하지 않습니다.
                  </p>

                  <div className="ms-report-export-row">
                    <Button
                      variant="secondary"
                      onClick={() => void onSave()}
                      loading={saveLoading}
                      disabled={!activeRange || downloadKey !== null || activeReportSource === "history"}
                    >
                      저장
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void onExport("pdf")}
                      loading={downloadKey === "current-pdf"}
                      disabled={!activeRange || saveLoading || (downloadKey !== null && downloadKey !== "current-pdf")}
                    >
                      PDF 내보내기
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void onExport("png")}
                      loading={downloadKey === "current-png"}
                      disabled={!activeRange || saveLoading || (downloadKey !== null && downloadKey !== "current-png")}
                    >
                      PNG 내보내기
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            {reportDataForExport ? (
              <div className="ms-report-hidden-export" ref={hiddenExportRef} aria-hidden>
                <MindLabReport data={reportDataForExport} />
              </div>
            ) : null}

            <Card className="ms-report-history-card" title="지난 리포트 보기">
              {historyLoading ? (
                <LoadingSkeleton lines={6} />
              ) : historyItems.length === 0 ? (
                <EmptyState
                  title="지난 리포트가 없습니다"
                  description="리포트를 저장하거나 내보내면 이 영역에서 이전 리포트를 다시 불러올 수 있습니다."
                />
              ) : (
                <div className="ms-report-history-list">
                  {historyItems.map((item) => {
                    return (
                      <article key={item.report_id} className="ms-report-history-item">
                        <div className="ms-report-history-item__main">
                          <p className="ms-report-history-item__title">{item.file_name}</p>
                          <p className="ms-card__desc">
                            {item.period_start} ~ {item.period_end} · 생성일 {item.created_at.slice(0, 10)}
                          </p>
                        </div>
                        <div className="ms-row">
                          <Badge variant="neutral">{item.format.toUpperCase()}</Badge>
                          <Button size="sm" variant="tertiary" onClick={() => void onLoadHistoryReport(item)}>
                            보기
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void onDeleteHistoryReport(item)}
                            loading={historyDeletingId === item.report_id}
                            disabled={historyDeletingId !== null}
                          >
                            삭제
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </Card>
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
