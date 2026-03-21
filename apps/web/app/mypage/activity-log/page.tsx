"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingSkeleton,
  PageContainer,
  SectionContainer,
  Select,
  StatCard,
  Tabs,
  type TabItem,
} from "../../../src/components/ui";
import { MonthlyCheckinCalendar } from "../../../src/components/checkin/MonthlyCheckinCalendar";
import { AuthRouteGuard, useAuthContext } from "../../../src/features/auth";
import {
  CoreApiError,
  getActivityLog,
  getDashboardActivity,
  listCheckinFeatures,
  type ActivityDashboardResponse,
  type ActivityLogDay,
  type CheckinFeatureBundle,
} from "../../../src/features/core-inputs";
import {
  CALENDAR_TONE_LABEL,
  CHECKIN_CALENDAR_WEEKDAYS,
  getKstYearMonth,
  resolveCalendarMoodTone,
  shiftMonth,
  type YearMonth,
} from "../../../src/features/core-inputs/checkin-calendar";
import { MyPageTabShell } from "../../../src/features/mypage/tab-shell";

type PeriodOption = "7d" | "28d" | "custom";
type ActivityFilter = "all" | "checkin" | "challenge" | "cbt" | "journal" | "assessment";

const periodOptions = [
  { label: "최근 일주일", value: "7d" },
  { label: "최근 한달", value: "28d" },
  { label: "사용자 지정", value: "custom" },
] as const;

const filterTabs: TabItem<ActivityFilter>[] = [
  { label: "전체", value: "all", content: null },
  { label: "체크인", value: "checkin", content: null },
  { label: "챌린지", value: "challenge", content: null },
  { label: "CBT", value: "cbt", content: null },
  { label: "한줄일기", value: "journal", content: null },
  { label: "설문", value: "assessment", content: null },
];

function toDateString(input: Date): string {
  const y = input.getFullYear();
  const m = String(input.getMonth() + 1).padStart(2, "0");
  const d = String(input.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getRange(period: PeriodOption): { start_date: string; end_date: string } {
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  const start = new Date(end);
  start.setDate(end.getDate() - (period === "7d" ? 6 : 27));

  return {
    start_date: toDateString(start),
    end_date: toDateString(end),
  };
}

function getKstTodayString(value = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function getMonthRange(cursor: YearMonth): { start_date: string; end_date: string } {
  const start = new Date(Date.UTC(cursor.year, cursor.month - 1, 1));
  const end = new Date(Date.UTC(cursor.year, cursor.month, 0));
  return {
    start_date: toDateString(start),
    end_date: toDateString(end),
  };
}

function buildMonthCalendarCells(cursor: YearMonth): Array<{ date: string | null; dayLabel: string }> {
  const firstDay = new Date(Date.UTC(cursor.year, cursor.month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();

  const cells: Array<{ date: string | null; dayLabel: string }> = [];
  for (let i = 0; i < firstDay; i += 1) {
    cells.push({ date: null, dayLabel: "" });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${cursor.year}-${String(cursor.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ date, dayLabel: String(day) });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ date: null, dayLabel: "" });
  }
  return cells;
}

function parseError(error: unknown): string {
  if (error instanceof CoreApiError) {
    if (error.message === "email_verification_required") {
      return "이메일 확인 후 이용할 수 있습니다.";
    }
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

export default function ActivityLogPage() {
  const { firebaseUser } = useAuthContext();

  const initialCustomRange = useMemo(() => getRange("7d"), []);
  const kstToday = useMemo(() => getKstTodayString(), []);
  const [period, setPeriod] = useState<PeriodOption>("7d");
  const [customStartDate, setCustomStartDate] = useState(initialCustomRange.start_date);
  const [customEndDate, setCustomEndDate] = useState(initialCustomRange.end_date);
  const [calendarMonth, setCalendarMonth] = useState<YearMonth>(getKstYearMonth());
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [rows, setRows] = useState<ActivityLogDay[]>([]);
  const [calendarRows, setCalendarRows] = useState<ActivityLogDay[]>([]);
  const [dashboard, setDashboard] = useState<ActivityDashboardResponse | null>(null);
  const [monthCheckinFeatures, setMonthCheckinFeatures] = useState<CheckinFeatureBundle[]>([]);
  const [dashboardMonthCheckinFeatures, setDashboardMonthCheckinFeatures] = useState<CheckinFeatureBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCalendarScrollY, setPendingCalendarScrollY] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dashboardErrorMessage, setDashboardErrorMessage] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});

  const customRangeError = useMemo(() => {
    if (period !== "custom") {
      return null;
    }
    if (!customStartDate || !customEndDate) {
      return "시작일과 종료일을 모두 선택해주세요.";
    }
    if (customStartDate > customEndDate) {
      return "시작일은 종료일보다 늦을 수 없습니다.";
    }
    return null;
  }, [customEndDate, customStartDate, period]);

  const query = useMemo(() => {
    const range =
      period === "custom"
        ? {
            start_date: customStartDate,
            end_date: customEndDate,
          }
        : getRange(period);
    return {
      ...range,
      filter,
    } as const;
  }, [customEndDate, customStartDate, period, filter]);

  const calendarRange = useMemo(() => getMonthRange(calendarMonth), [calendarMonth]);
  const dashboardMonthRange = useMemo(() => getMonthRange(getKstYearMonth()), []);

  const load = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      setDashboardErrorMessage(null);

      if (customRangeError) {
        setRows([]);
        setErrorMessage(customRangeError);
        setLoading(false);
        return;
      }

      const [activityLogResult, activityDashboardResult, checkinFeaturesResult, dashboardCheckinFeaturesResult, calendarLogResult] = await Promise.allSettled([
        getActivityLog(firebaseUser, query),
        getDashboardActivity(firebaseUser),
        listCheckinFeatures(firebaseUser, {
          start_date: calendarRange.start_date,
          end_date: calendarRange.end_date,
        }),
        listCheckinFeatures(firebaseUser, {
          start_date: dashboardMonthRange.start_date,
          end_date: dashboardMonthRange.end_date,
        }),
        getActivityLog(firebaseUser, {
          start_date: calendarRange.start_date,
          end_date: calendarRange.end_date,
          filter: "all",
        }),
      ]);

      if (activityLogResult.status === "fulfilled") {
        setRows(activityLogResult.value);
      } else {
        setErrorMessage(parseError(activityLogResult.reason));
        setRows([]);
      }

      if (activityDashboardResult.status === "fulfilled") {
        setDashboard(activityDashboardResult.value);
      } else {
        setDashboardErrorMessage(parseError(activityDashboardResult.reason));
        setDashboard(null);
      }

      if (checkinFeaturesResult.status === "fulfilled") {
        setMonthCheckinFeatures(checkinFeaturesResult.value);
      } else {
        setMonthCheckinFeatures([]);
      }

      if (dashboardCheckinFeaturesResult.status === "fulfilled") {
        setDashboardMonthCheckinFeatures(dashboardCheckinFeaturesResult.value);
      } else {
        setDashboardMonthCheckinFeatures([]);
      }

      if (calendarLogResult.status === "fulfilled") {
        setCalendarRows(calendarLogResult.value);
      } else {
        setCalendarRows([]);
      }
    } finally {
      setLoading(false);
    }
  }, [calendarRange.end_date, calendarRange.start_date, customRangeError, dashboardMonthRange.end_date, dashboardMonthRange.start_date, firebaseUser, query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading || pendingCalendarScrollY === null) {
      return;
    }
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: pendingCalendarScrollY, behavior: "auto" });
      setPendingCalendarScrollY(null);
    });
  }, [loading, pendingCalendarScrollY]);

  const monthCheckinFeatureMap = useMemo(() => {
    const map = new Map<string, CheckinFeatureBundle>();
    for (const feature of monthCheckinFeatures) {
      map.set(feature.date, feature);
    }
    return map;
  }, [monthCheckinFeatures]);

  const calendarActivityMap = useMemo(() => {
    const map = new Map<string, ActivityLogDay>();
    for (const row of calendarRows) {
      map.set(row.date, row);
    }
    return map;
  }, [calendarRows]);

  const dashboardMonthCheckinFeatureMap = useMemo(() => {
    const map = new Map<string, CheckinFeatureBundle>();
    for (const feature of dashboardMonthCheckinFeatures) {
      map.set(feature.date, feature);
    }
    return map;
  }, [dashboardMonthCheckinFeatures]);

  const dashboardCalendarCheckedDateSet = useMemo(() => {
    const set = new Set<string>();
    for (const feature of dashboardMonthCheckinFeatures) {
      set.add(feature.date);
    }
    return set;
  }, [dashboardMonthCheckinFeatures]);

  const dashboardCalendarMonth = useMemo(() => {
    if (!dashboard) {
      return null;
    }
    return {
      year: dashboard.calendar.year,
      month: dashboard.calendar.month,
    } satisfies YearMonth;
  }, [dashboard]);

  const calendarCells = useMemo(() => buildMonthCalendarCells(calendarMonth), [calendarMonth]);

  const switchCalendarMonth = (offset: number) => {
    const previousScrollY = typeof window !== "undefined" ? window.scrollY : null;
    if (previousScrollY !== null) {
      setPendingCalendarScrollY(previousScrollY);
    }
    setCalendarMonth((previous) => shiftMonth(previous, offset));
  };

  return (
    <AuthRouteGuard policy="require-active">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">활동 로그</Badge>
          </div>
        }
      >
        <PageContainer size="lg">
          <SectionContainer
            title="마이페이지"
            description="왼쪽 탭을 선택하면 해당 항목 내용을 오른쪽에서 확인할 수 있습니다."
          >
            <MyPageTabShell
              surfaceClassName="ms-mypage-panel-surface--no-scroll"
              contentClassName="ms-mypage-panel-surface__content--no-scroll"
            >
              <Card title="활동 요약" description="체크인/챌린지/CBT/설문 흐름을 먼저 확인합니다.">
                {loading ? (
                  <LoadingSkeleton lines={10} />
                ) : dashboardErrorMessage ? (
                  <ErrorState
                    title="활동 요약을 불러오지 못했습니다"
                    description={dashboardErrorMessage}
                    retryAction={<Button onClick={load}>다시 시도</Button>}
                  />
                ) : !dashboard ? (
                  <EmptyState title="표시할 활동 요약이 없습니다" description="잠시 후 다시 시도해주세요." />
                ) : (
                  <div className="ms-stack">
                    <div className="ms-grid ms-grid--two">
                      <Card title="활동 요약">
                        <div className="ms-grid ms-grid--two">
                          <StatCard
                            label="최근 7일 체크인한 날"
                            value={`${dashboard.summary_cards.checkin_days_7d}일`}
                            helperText="기록한 날짜 기준"
                          />
                          <StatCard
                            label="최근 7일 CBT 세션"
                            value={`${dashboard.summary_cards.cbt_sessions_7d}회`}
                            helperText={
                              dashboard.cbt.last_session_days_ago !== null
                                ? `마지막 활동 ${dashboard.cbt.last_session_days_ago}일 전`
                                : "활동 기록 없음"
                            }
                          />
                          <StatCard
                            label="최근 7일 챌린지 수행일"
                            value={`${dashboard.summary_cards.challenge_days_7d}일`}
                            helperText={`진행 중 ${dashboard.challenge.active_count}개`}
                          />
                          <StatCard
                            label="최근 검사일"
                            value={formatDate(dashboard.survey.last_assessment_at)}
                            helperText={
                              dashboard.summary_cards.last_assessment_days_ago !== null
                                ? `${dashboard.summary_cards.last_assessment_days_ago}일 전`
                                : "설문 기록 없음"
                            }
                          />
                        </div>
                      </Card>

                      <Card title="월간 체크인 캘린더" description={`${dashboard.calendar.year}년 ${dashboard.calendar.month}월`}>
                        {dashboardCalendarMonth ? (
                          <MonthlyCheckinCalendar
                            month={dashboardCalendarMonth}
                            checkedDateSet={dashboardCalendarCheckedDateSet}
                            featureMap={dashboardMonthCheckinFeatureMap}
                            todayDate={kstToday}
                            ariaLabel="마이페이지 월간 체크인 캘린더"
                          />
                        ) : null}
                      </Card>
                    </div>

                    <div className="ms-grid ms-grid--two">
                      <Card title="CBT 활동 요약" description="최근 7일 세션 수, 활동일, 마지막 활동일">
                        <div className="ms-stack">
                          <p className="ms-card__desc">최근 7일 세션: {dashboard.cbt.sessions_7d}회</p>
                          <p className="ms-card__desc">최근 7일 활동일: {dashboard.cbt.active_days_7d}일</p>
                          <p className="ms-card__desc">
                            마지막 활동: {dashboard.cbt.last_session_days_ago !== null ? `${dashboard.cbt.last_session_days_ago}일 전` : "-"}
                          </p>
                          <p className="ms-card__desc">
                            주요 주제: {dashboard.cbt.top_topics.length > 0 ? dashboard.cbt.top_topics.join(", ") : "기록 없음"}
                          </p>
                        </div>
                      </Card>
                      <Card title="챌린지 활동 요약" description="진행 중/수행일/완료율/중도포기">
                        <div className="ms-stack">
                          <p className="ms-card__desc">진행 중: {dashboard.challenge.active_count}개</p>
                          <p className="ms-card__desc">최근 7일 수행일: {dashboard.challenge.performed_days_7d}일</p>
                          <p className="ms-card__desc">
                            완료율: {dashboard.challenge.completion_rate_7d !== null ? `${dashboard.challenge.completion_rate_7d}%` : "-"}
                          </p>
                          <p className="ms-card__desc">최근 한달 중도포기: {dashboard.challenge.dropout_count_28d}건</p>
                        </div>
                      </Card>
                    </div>

                    <Banner variant="info" title="데이터 충분도" description={dashboard.data_density.message} />
                  </div>
                )}
              </Card>

              <Card title="활동 내역 조회">
                <div className="ms-grid ms-grid--two">
                  <Select
                    label="기간"
                    value={period}
                    onChange={(event) => setPeriod(event.target.value as PeriodOption)}
                    options={[...periodOptions]}
                  />
                  {period === "custom" ? (
                    <div className="ms-grid ms-grid--two">
                      <Input
                        label="시작일"
                        type="date"
                        value={customStartDate}
                        onChange={(event) => setCustomStartDate(event.target.value)}
                        errorText={customRangeError ?? undefined}
                      />
                      <Input
                        label="종료일"
                        type="date"
                        value={customEndDate}
                        onChange={(event) => setCustomEndDate(event.target.value)}
                        errorText={customRangeError ?? undefined}
                      />
                    </div>
                  ) : (
                    <div className="ms-field">
                      <span className="ms-field__label">조회 방식</span>
                      <p className="ms-field__meta">
                        {period === "7d" ? "오늘을 포함한 최근 일주일을 조회합니다." : "오늘을 포함한 최근 한달을 조회합니다."}
                      </p>
                    </div>
                  )}
                </div>

                <Tabs<ActivityFilter>
                  items={filterTabs.map((item) => ({
                    ...item,
                    content: <span className="ms-visually-hidden">필터 선택</span>,
                  }))}
                  value={filter}
                  onChange={setFilter}
                  ariaLabel="활동로그 필터"
                />
              </Card>

              {loading ? (
                <Card>
                  <LoadingSkeleton lines={8} />
                </Card>
              ) : errorMessage ? (
                <ErrorState
                  title="활동로그를 불러오지 못했습니다"
                  description={errorMessage}
                  retryAction={<Button onClick={load}>다시 시도</Button>}
                />
              ) : (
                <Card title="리스트 보기" description="기록이 있는 날짜 중심">
                  <div className="ms-grid ms-grid--two ms-activity-log-split">
                    <div className="ms-activity-log-list-pane">
                      {rows.length === 0 ? (
                        <EmptyState title="표시할 활동이 없습니다" description="필터/기간을 변경해보세요." />
                      ) : (
                        <div className="ms-stack">
                          {rows.map((day) => (
                            <details key={day.date} className="ms-activity-log-day" open={Boolean(expandedDays[day.date])}>
                              <summary
                                className="ms-activity-log-day__summary"
                                onClick={(event) => {
                                  event.preventDefault();
                                  setExpandedDays((previous) => ({
                                    ...previous,
                                    [day.date]: !previous[day.date],
                                  }));
                                }}
                              >
                                <div className="ms-activity-log-day__summary-head">
                                  <p className="ms-activity-log-day__title">{day.date}</p>
                                  <p className="ms-activity-log-day__meta">
                                    활동 {day.summary.activity_count_total}개 · 챌린지 완료 {day.summary.challenge_completed_count}건
                                  </p>
                                </div>
                                <span className="ms-activity-log-day__toggle">
                                  {expandedDays[day.date] ? "접기" : "펼쳐보기"}
                                </span>
                              </summary>

                              <div className="ms-activity-log-day__badges">
                                {day.summary.has_checkin ? <Badge variant="info">체크인</Badge> : null}
                                {day.summary.has_challenge_activity ? <Badge variant="success">챌린지</Badge> : null}
                                {day.summary.has_cbt_activity ? <Badge variant="warning">CBT</Badge> : null}
                                {day.summary.has_journal_entry ? <Badge variant="brand">한줄일기</Badge> : null}
                                {day.summary.has_assessment ? <Badge variant="neutral">설문</Badge> : null}
                              </div>

                              <div className="ms-stack">
                                {day.items.map((item) => (
                                  <Card key={`${day.date}-${item.activity_type}-${item.detail_route}`}>
                                    <p className="ms-card__title">{item.display_label}</p>
                                    <p className="ms-card__desc">{item.preview_text || "요약 정보가 없습니다."}</p>
                                    <div className="ms-row">
                                      <Badge variant="neutral">{item.activity_type}</Badge>
                                      <Link href={item.detail_route} className="ms-inline-link">상세 보기</Link>
                                    </div>
                                  </Card>
                                ))}
                              </div>
                            </details>
                          ))}
                        </div>
                      )}
                    </div>

                    <Card title="월간 캘린더" description="연/월 이동으로 활동 날짜를 확인할 수 있습니다.">
                      <div className="ms-activity-log-calendar-nav">
                        <Button size="sm" variant="secondary" onClick={() => switchCalendarMonth(-1)}>
                          이전
                        </Button>
                        <p className="ms-activity-log-calendar-nav__label">
                          {calendarMonth.year}년 {calendarMonth.month}월
                        </p>
                        <Button size="sm" variant="secondary" onClick={() => switchCalendarMonth(1)}>
                          다음
                        </Button>
                      </div>

                      <div className="ms-home-calendar-weekdays">
                        {CHECKIN_CALENDAR_WEEKDAYS.map((day) => (
                          <span key={day}>{day}</span>
                        ))}
                      </div>
                      <div className="ms-home-calendar-grid">
                        {calendarCells.map((cell, index) => {
                          if (!cell.date) {
                            return (
                              <div key={`empty-${index}`} className="ms-home-calendar-cell ms-home-calendar-cell--empty" aria-hidden="true" />
                            );
                          }

                          const dayLog = calendarActivityMap.get(cell.date);
                          const hasActivity = (dayLog?.summary.activity_count_total ?? 0) > 0;
                          const tone = hasActivity ? resolveCalendarMoodTone(monthCheckinFeatureMap.get(cell.date)) : null;
                          const isToday = cell.date === kstToday;

                          return (
                            <div
                              key={cell.date}
                              className={`ms-home-calendar-cell${hasActivity ? " ms-home-calendar-cell--active" : ""}${
                                tone ? ` ms-home-calendar-cell--tone-${tone}` : ""
                              }${isToday ? " ms-home-calendar-cell--today" : ""}${isToday && hasActivity ? " ms-home-calendar-cell--today-active" : ""}`}
                              title={`${cell.date} · 활동 ${dayLog?.summary.activity_count_total ?? 0}개`}
                            >
                              {cell.dayLabel}
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  </div>
                </Card>
              )}
            </MyPageTabShell>
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
