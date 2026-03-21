"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import {
  AppShell,
  Banner,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingSkeleton,
  PageContainer,
  PasswordInput,
  Select,
  SectionContainer,
} from "../src/components/ui";
import { OnboardingTour } from "../src/components/OnboardingTour";
import { MonthlyCheckinCalendar } from "../src/components/checkin/MonthlyCheckinCalendar";
import { useAuthContext } from "../src/features/auth";
import { mapLoginErrorMessage } from "../src/features/auth/login-error";
import { ANALYTICS_EVENTS, trackEvent } from "../src/features/monitoring";
import { isOnboardingComplete, shouldGoOnboarding } from "../src/features/auth/status";
import {
  CoreApiError,
  getActivityLog,
  listCheckinFeatures,
  listPendingCbtReflections,
  getCheckinToday,
  listAssessmentHistory,
  listChallengeEnrollments,
  saveCheckinToday,
  type ActivityLogDay,
  type AssessmentSession,
  type ChallengeEnrollment,
  type CheckinFeatureBundle,
  type CheckinPayload,
  type CheckinRecord,
} from "../src/features/core-inputs";
import { type YearMonth } from "../src/features/core-inputs/checkin-calendar";
import {
  CommunityApiError,
  listBoardFeed,
  type BoardFeedItem,
} from "../src/features/community";

interface KstDateInfo {
  year: number;
  month: number;
  day: number;
  hour: number;
  date: string;
}

const CHECKIN_SLEEP_TOTAL_OPTIONS = [
  { label: "4시간 미만", value: "lt_4h" },
  { label: "4~5시간", value: "h4_5" },
  { label: "5~6시간", value: "h5_6" },
  { label: "6~7시간", value: "h6_7" },
  { label: "7~8시간", value: "h7_8" },
  { label: "8시간 이상", value: "ge_8h" },
] as const;

const CHECKIN_SLEEP_LATENCY_OPTIONS = [
  { label: "15분 이하", value: "le_15m" },
  { label: "15~30분", value: "m15_30" },
  { label: "30~60분", value: "m30_60" },
  { label: "60분 이상", value: "ge_60m" },
] as const;

const CHECKIN_DAYLIGHT_OPTIONS = [
  { label: "0분", value: "m0" },
  { label: "1~9분", value: "m1_9" },
  { label: "10~29분", value: "m10_29" },
  { label: "30분 이상", value: "ge_30" },
] as const;

const CHECKIN_EXERCISE_OPTIONS = CHECKIN_DAYLIGHT_OPTIONS;

const CHECKIN_ALCOHOL_OPTIONS = [
  { label: "없음", value: "none" },
  { label: "1잔", value: "one" },
  { label: "2~3잔", value: "two_three" },
  { label: "4잔 이상", value: "ge_four" },
] as const;

const CHECKIN_YES_NO_OPTIONS = [
  { label: "아니오", value: "no" },
  { label: "예", value: "yes" },
] as const;

const CHECKIN_MOOD_OPTIONS = [
  { label: "1 · 매우 가라앉음", value: "1" },
  { label: "2 · 조금 가라앉음", value: "2" },
  { label: "3 · 보통", value: "3" },
  { label: "4 · 비교적 괜찮음", value: "4" },
  { label: "5 · 매우 좋음", value: "5" },
] as const;

const CHECKIN_ANXIETY_OPTIONS = [
  { label: "1 · 매우 편안함", value: "1" },
  { label: "2 · 조금 편안함", value: "2" },
  { label: "3 · 보통", value: "3" },
  { label: "4 · 다소 불안함", value: "4" },
  { label: "5 · 매우 불안함", value: "5" },
] as const;

const CHECKIN_ENERGY_OPTIONS = [
  { label: "1 · 매우 낮음", value: "1" },
  { label: "2 · 낮은 편", value: "2" },
  { label: "3 · 보통", value: "3" },
  { label: "4 · 높은 편", value: "4" },
  { label: "5 · 매우 높음", value: "5" },
] as const;

const SLEEP_TOTAL_MIDPOINT_BY_BUCKET: Record<CheckinPayload["sleep_total_bucket"], number> = {
  lt_4h: 3.5,
  h4_5: 4.5,
  h5_6: 5.5,
  h6_7: 6.5,
  h7_8: 7.5,
  ge_8h: 8.5,
};

function toDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getKstDateInfo(value = new Date()): KstDateInfo {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  const hour = getPart("hour");

  return {
    year,
    month,
    day,
    hour,
    date: toDateString(year, month, day),
  };
}

function parseError(error: unknown): string {
  if (error instanceof CoreApiError || error instanceof CommunityApiError) {
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
  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function getAccessGuide(
  phase: "loading" | "signed_out" | "signed_in",
  emailVerified: boolean,
  onboardingComplete: boolean,
  needsOnboarding: boolean,
): { title: string; description: string; route: string; cta: string } {
  if (phase !== "signed_in") {
    return {
      title: "로그인 후 개인 홈이 열립니다",
      description: "회원가입 또는 로그인 후 대시보드와 기록 기능을 바로 사용할 수 있습니다.",
      route: "/auth/login",
      cta: "로그인",
    };
  }

  if (!emailVerified) {
    return {
      title: "이메일 확인이 필요합니다",
      description: "이메일 인증을 완료하면 홈/대시보드/커뮤니티 접근이 활성화됩니다.",
      route: "/auth/verify-email",
      cta: "이메일 확인",
    };
  }

  if (needsOnboarding || !onboardingComplete) {
    return {
      title: "온보딩을 완료해 주세요",
      description: "출생년도, 동의, 초기 진단척도 입력이 끝나면 홈 데이터가 표시됩니다.",
      route: "/onboarding",
      cta: "온보딩 진행",
    };
  }

  return {
    title: "Mindsight 홈",
    description: "실데이터 기준으로 오늘의 상태와 활동을 확인할 수 있습니다.",
    route: "/",
    cta: "이동",
  };
}

function getDayGreetingMessage(hour: number): string {
  if (hour >= 5 && hour < 12) {
    return "오늘도 활기차게 하루를 시작해요!";
  }
  if (hour >= 12 && hour < 18) {
    return "남은 오늘도 화이팅!";
  }
  return "오늘 하루를 차분하게 마무리해볼까요?";
}

function parseDateUtc(value: string): number | null {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    return null;
  }
  return Date.UTC(year, month - 1, day);
}

function getChallengeProgressDay(enrollment: ChallengeEnrollment, todayDate: string): number {
  const start = parseDateUtc(enrollment.scheduled_start_date);
  const today = parseDateUtc(todayDate);
  if (start === null || today === null) {
    return 1;
  }

  const elapsed = Math.floor((today - start) / 86_400_000) + 1;
  return Math.max(1, Math.min(enrollment.target_days, elapsed));
}

function resolveChallengeDoneDays(enrollment: ChallengeEnrollment, todayDate: string): number {
  if (typeof enrollment.done_days === "number" && Number.isFinite(enrollment.done_days)) {
    return Math.max(0, Math.min(enrollment.target_days, enrollment.done_days));
  }
  return getChallengeProgressDay(enrollment, todayDate);
}

function isOneDayChallenge(enrollment: ChallengeEnrollment): boolean {
  return enrollment.challenge_type === "one_time" || enrollment.target_days === 1;
}

function isStaleOneDayChallenge(enrollment: ChallengeEnrollment, todayDate: string): boolean {
  if (!isOneDayChallenge(enrollment)) {
    return false;
  }
  if (enrollment.stale_after_today_flag) {
    return true;
  }

  const doneDays = resolveChallengeDoneDays(enrollment, todayDate);
  if (doneDays < enrollment.target_days) {
    return false;
  }

  if (enrollment.last_completed_date && enrollment.last_completed_date < todayDate) {
    return true;
  }

  const scheduledEnd = parseDateUtc(enrollment.scheduled_end_date);
  const today = parseDateUtc(todayDate);
  if (scheduledEnd !== null && today !== null && scheduledEnd < today) {
    return true;
  }

  return false;
}

function getChallengeSlotStyle(_progressRatio: number): CSSProperties {
  const style: CSSProperties = {
    background:
      "linear-gradient(145deg, color-mix(in oklab, var(--color-brand-primary-soft) 66%, transparent) 0%, color-mix(in oklab, var(--color-brand-primary) 36%, transparent) 100%)",
    borderColor: "color-mix(in oklab, var(--color-brand-primary) 56%, white)",
  };
  (style as Record<string, string>)["--ms-challenge-text-color"] = "hsl(246 47% 21%)";
  (style as Record<string, string>)["--ms-challenge-meta-color"] = "hsl(248 34% 30%)";
  (style as Record<string, string>)["--ms-challenge-track-color"] = "rgba(76, 84, 135, 0.18)";
  return style;
}

function defaultCheckinPayload(date: string): CheckinPayload {
  return {
    date,
    sleep_total_bucket: "h6_7",
    wake_time_local: "07:00",
    sleep_latency_bucket: "m15_30",
    mood_1_5: 3,
    anxiety_1_5: 3,
    energy_1_5: 3,
    daylight_bucket: "m10_29",
    exercise_bucket: "m1_9",
    alcohol_bucket: "none",
    caffeine_after_2pm_flag: false,
    timezone: "Asia/Seoul",
    completion_mode: "full",
  };
}

function getPopularityScore(item: BoardFeedItem): number {
  return item.engagement.like_count * 2 + item.engagement.comment_count * 3 + item.engagement.bookmark_count * 2;
}

function getPopularFeedTitle(item: BoardFeedItem): string {
  const title = item.post.title?.trim();
  if (title) {
    return title;
  }

  const preview = (item.post.body_preview || item.post.body_text || "").trim();
  if (!preview) {
    return "(내용 없음)";
  }

  const snippet = preview.slice(0, 24);
  return `${snippet}...`;
}

function normalizeIsoDate(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  const candidate = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

function addDaysToIsoDate(dateValue: string, days: number): string | null {
  const base = parseDateUtc(dateValue);
  if (base === null) {
    return null;
  }
  const nextDate = new Date(base + days * 86_400_000);
  const year = nextDate.getUTCFullYear();
  const month = nextDate.getUTCMonth() + 1;
  const day = nextDate.getUTCDate();
  return toDateString(year, month, day);
}

function formatDayMonth(dateValue: string): string {
  const [year, month, day] = dateValue.split("-");
  if (!year || !month || !day) {
    return dateValue;
  }
  return `${month}/${day}`;
}

function resolveNextAssessmentDate(history: AssessmentSession[]): string | null {
  const completedDates = history
    .filter((item) => item.status === "completed")
    .map((item) => normalizeIsoDate(item.completed_at) ?? normalizeIsoDate(item.started_at))
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left));

  const latestCompletedDate = completedDates[0];
  if (!latestCompletedDate) {
    return null;
  }

  return addDaysToIsoDate(latestCompletedDate, 28);
}

function makeFeatureBundleFromPayload(record: CheckinRecord): CheckinFeatureBundle | null {
  if (record.status !== "submitted" || !record.payload) {
    return null;
  }
  return {
    date: record.date,
    mood_1_5: record.payload.mood_1_5,
    anxiety_1_5: record.payload.anxiety_1_5,
    energy_1_5: record.payload.energy_1_5,
    sleep_total_midpoint_hours: SLEEP_TOTAL_MIDPOINT_BY_BUCKET[record.payload.sleep_total_bucket] ?? null,
    sleep_latency_midpoint_minutes: null,
    days_since_prev_checkin: null,
    missing_checkin_days_7d: 0,
    missing_checkin_days_28d: 0,
  };
}

export default function HomePage() {
  const router = useRouter();
  const { firebaseUser, session, phase, signInWithEmail } = useAuthContext();

  const [checkinRecord, setCheckinRecord] = useState<CheckinRecord | null>(null);
  const [todayActivityLog, setTodayActivityLog] = useState<ActivityLogDay | null>(null);
  const [monthActivityLog, setMonthActivityLog] = useState<ActivityLogDay[]>([]);
  const [monthCheckinFeatures, setMonthCheckinFeatures] = useState<CheckinFeatureBundle[]>([]);
  const [activeChallenges, setActiveChallenges] = useState<ChallengeEnrollment[]>([]);
  const [assessmentHistory, setAssessmentHistory] = useState<AssessmentSession[]>([]);
  const [popularPosts, setPopularPosts] = useState<BoardFeedItem[]>([]);
  const [pendingCbtReflectionCount, setPendingCbtReflectionCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [checkinNotice, setCheckinNotice] = useState<string | null>(null);
  const [checkinErrorMessage, setCheckinErrorMessage] = useState<string | null>(null);
  const [savingCheckin, setSavingCheckin] = useState(false);
  const [checkinPayload, setCheckinPayload] = useState<CheckinPayload | null>(null);
  const [landingEmail, setLandingEmail] = useState("");
  const [landingPassword, setLandingPassword] = useState("");
  const [landingError, setLandingError] = useState<string | null>(null);
  const [landingSubmitting, setLandingSubmitting] = useState(false);
  const [checkinSwitchMotion, setCheckinSwitchMotion] = useState(false);
  const checkinSwitchMotionTimerRef = useRef<number | null>(null);

  const accountStatus = session?.account.account_status;
  const emailVerified = Boolean(firebaseUser?.emailVerified);
  const onboardingComplete = isOnboardingComplete(session);
  const onboardingNeeded = shouldGoOnboarding(session);
  const isActive = phase === "signed_in" && emailVerified && onboardingComplete && !onboardingNeeded;
  const accessGuide = getAccessGuide(phase, emailVerified, onboardingComplete, onboardingNeeded);

  const kstNow = getKstDateInfo();
  const dayGreetingMessage = getDayGreetingMessage(kstNow.hour);
  const nickname = session?.account.nickname || "사용자";

  const calendarMonth = useMemo<YearMonth>(() => ({ year: kstNow.year, month: kstNow.month }), [kstNow.month, kstNow.year]);

  const monthCheckinSet = useMemo(() => {
    const set = new Set<string>();
    for (const day of monthActivityLog) {
      if (day.summary.has_checkin) {
        set.add(day.date);
      }
    }
    if (checkinRecord?.status === "submitted") {
      set.add(checkinRecord.date);
    }
    return set;
  }, [checkinRecord, monthActivityLog]);

  const monthCheckinFeatureMap = useMemo(() => {
    const map = new Map<string, CheckinFeatureBundle>();
    for (const feature of monthCheckinFeatures) {
      map.set(feature.date, feature);
    }
    if (checkinRecord) {
      const fallbackFeature = makeFeatureBundleFromPayload(checkinRecord);
      if (fallbackFeature) {
        map.set(checkinRecord.date, fallbackFeature);
      }
    }
    return map;
  }, [checkinRecord, monthCheckinFeatures]);

  const visibleActiveChallenges = useMemo(
    () => activeChallenges.filter((challenge) => !isStaleOneDayChallenge(challenge, kstNow.date)),
    [activeChallenges, kstNow.date],
  );

  const challengeSlots = useMemo(() => {
    const slots: Array<ChallengeEnrollment | null> = [...visibleActiveChallenges.slice(0, 3)];
    while (slots.length < 3) {
      slots.push(null);
    }
    return slots;
  }, [visibleActiveChallenges]);

  const todaySummary = todayActivityLog?.summary;
  const checkinCompleted = checkinRecord?.status === "submitted";
  const hasAnyActiveChallenge = visibleActiveChallenges.length > 0;
  const challengeCompletedToday = visibleActiveChallenges.some((challenge) => Boolean(challenge.completed_today_flag));
  const challengeHasProgress = visibleActiveChallenges.some(
    (challenge) => typeof challenge.done_days === "number" && challenge.done_days > 0,
  );
  const challengeActionLabel = challengeCompletedToday
    ? "완료"
    : hasAnyActiveChallenge && challengeHasProgress
      ? "진행 중"
      : "도전하기";
  const cbtDialogueDone = Boolean(todaySummary?.has_cbt_activity);
  const cbtReflectionDone = pendingCbtReflectionCount === 0;
  const cbtFullyDone = cbtDialogueDone && cbtReflectionDone;
  const nextAssessmentDate = useMemo(() => resolveNextAssessmentDate(assessmentHistory), [assessmentHistory]);
  const completedAssessmentToday = useMemo(() => {
    if (todaySummary?.has_assessment) {
      return true;
    }
    return assessmentHistory.some((item) => {
      if (item.status !== "completed") {
        return false;
      }
      const completedDate = normalizeIsoDate(item.completed_at) ?? normalizeIsoDate(item.started_at);
      return completedDate === kstNow.date;
    });
  }, [assessmentHistory, kstNow.date, todaySummary?.has_assessment]);
  const fallbackNextAssessmentDate = useMemo(
    () => (completedAssessmentToday ? addDaysToIsoDate(kstNow.date, 28) : null),
    [completedAssessmentToday, kstNow.date],
  );
  const effectiveNextAssessmentDate = nextAssessmentDate ?? fallbackNextAssessmentDate;
  const assessmentScheduled = Boolean(
    effectiveNextAssessmentDate &&
      (completedAssessmentToday || kstNow.date < effectiveNextAssessmentDate),
  );
  const assessmentPendingLabel =
    assessmentScheduled && effectiveNextAssessmentDate
      ? `예정: ${formatDayMonth(effectiveNextAssessmentDate)}`
      : "검사하기";

  const todayActions = [
    {
      key: "cbt",
      label: "CBT",
      pendingActionLabel: cbtDialogueDone ? "대화완료" : "대화하기",
      primaryDisabled: cbtDialogueDone,
      secondaryActionLabel: cbtReflectionDone ? "회고완료" : "회고하기",
      secondaryDisabled: cbtReflectionDone,
      secondaryHref: "/cbt/session?tab=reflection",
      done: cbtFullyDone,
      disabled: false,
      href: "/cbt/session?tab=chat",
    },
    {
      key: "challenge",
      label: "챌린지",
      pendingActionLabel: challengeActionLabel,
      done: challengeCompletedToday,
      disabled: false,
      href: "/challenge",
    },
    {
      key: "journal",
      label: "한줄일기",
      pendingActionLabel: "작성하기",
      done: Boolean(todaySummary?.has_journal_entry),
      disabled: false,
      href: "/journal",
    },
    {
      key: "assessment",
      label: "심리상태 검사",
      pendingActionLabel: assessmentPendingLabel,
      done: false,
      disabled: assessmentScheduled,
      href: "/assessments",
    },
  ] as const;

  useEffect(() => {
    if (phase !== "signed_in" || !firebaseUser) {
      return;
    }

    if (!emailVerified || accountStatus === "pending_email_verification") {
      router.replace("/auth/verify-email");
      return;
    }

    if (onboardingNeeded) {
      router.replace("/onboarding");
      return;
    }

    if (accountStatus && ["restricted", "suspended", "deleted"].includes(accountStatus)) {
      router.replace("/auth/login");
    }
  }, [accountStatus, emailVerified, firebaseUser, onboardingNeeded, phase, router]);

  const onLandingLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (landingSubmitting) {
      return;
    }

    try {
      setLandingSubmitting(true);
      setLandingError(null);

      const nextSession = await signInWithEmail(landingEmail.trim(), landingPassword);
      if (!nextSession) {
        throw new Error("session_bootstrap_failed");
      }

      if (!nextSession.account.email_verified) {
        router.replace("/auth/verify-email");
        return;
      }

      if (isOnboardingComplete(nextSession)) {
        router.replace("/");
        return;
      }

      router.replace("/onboarding");
    } catch (error) {
      const code = error instanceof Error ? error.message : "unknown";
      setLandingError(mapLoginErrorMessage(code));
    } finally {
      setLandingSubmitting(false);
    }
  };

  const load = useCallback(async () => {
    if (!firebaseUser || !isActive) {
      return;
    }

    const now = getKstDateInfo();
    const monthStart = toDateString(now.year, now.month, 1);
    const monthEnd = toDateString(now.year, now.month, new Date(now.year, now.month, 0).getDate());

    try {
      setLoading(true);
      setErrorMessage(null);
      setWarningMessage(null);

      const [checkinResult, todayLogResult, monthLogResult, monthFeatureResult, challengeResult, assessmentResult, feedResult, pendingReflectionResult] =
        await Promise.allSettled([
        getCheckinToday(firebaseUser, now.date),
        getActivityLog(firebaseUser, {
          start_date: now.date,
          end_date: now.date,
          view: "list",
        }),
        getActivityLog(firebaseUser, {
          start_date: monthStart,
          end_date: monthEnd,
          view: "calendar",
        }),
        listCheckinFeatures(firebaseUser, {
          start_date: monthStart,
          end_date: monthEnd,
        }),
        listChallengeEnrollments(firebaseUser, "active"),
        listAssessmentHistory(firebaseUser),
        listBoardFeed(firebaseUser, { limit: 20 }),
        listPendingCbtReflections(firebaseUser, { limit: 100 }),
      ]);

      let rejectedCount = 0;

      if (checkinResult.status === "fulfilled") {
        setCheckinRecord(checkinResult.value);
        setCheckinPayload(checkinResult.value.payload ?? defaultCheckinPayload(now.date));
      } else {
        rejectedCount += 1;
        setCheckinRecord(null);
        setCheckinPayload(defaultCheckinPayload(now.date));
      }

      if (todayLogResult.status === "fulfilled") {
        const todayLog = todayLogResult.value.find((item) => item.date === now.date) ?? todayLogResult.value[0] ?? null;
        setTodayActivityLog(todayLog);
      } else {
        rejectedCount += 1;
        setTodayActivityLog(null);
      }

      if (monthLogResult.status === "fulfilled") {
        setMonthActivityLog(monthLogResult.value);
      } else {
        rejectedCount += 1;
        setMonthActivityLog([]);
      }

      if (monthFeatureResult.status === "fulfilled") {
        setMonthCheckinFeatures(monthFeatureResult.value);
      } else {
        rejectedCount += 1;
        setMonthCheckinFeatures([]);
      }

      if (challengeResult.status === "fulfilled") {
        setActiveChallenges(challengeResult.value.slice(0, 3));
      } else {
        rejectedCount += 1;
        setActiveChallenges([]);
      }

      if (assessmentResult.status === "fulfilled") {
        setAssessmentHistory(assessmentResult.value);
      } else {
        rejectedCount += 1;
        setAssessmentHistory([]);
      }

      if (feedResult.status === "fulfilled") {
        const ranked = [...feedResult.value.items]
          .sort((left, right) => getPopularityScore(right) - getPopularityScore(left))
          .slice(0, 3);
        setPopularPosts(ranked);
      } else {
        rejectedCount += 1;
        setPopularPosts([]);
      }

      if (pendingReflectionResult.status === "fulfilled") {
        setPendingCbtReflectionCount(pendingReflectionResult.value.length);
      } else {
        rejectedCount += 1;
        setPendingCbtReflectionCount(0);
      }

      if (rejectedCount >= 3) {
        setErrorMessage("홈 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } else if (rejectedCount > 0) {
        setWarningMessage("일부 홈 데이터가 지연되어 최신 정보가 모두 표시되지 않을 수 있습니다.");
      }
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, isActive]);

  useEffect(() => {
    if (!isActive) {
      setLoading(false);
      setCheckinRecord(null);
      setCheckinPayload(defaultCheckinPayload(getKstDateInfo().date));
      setTodayActivityLog(null);
      setMonthActivityLog([]);
      setMonthCheckinFeatures([]);
      setActiveChallenges([]);
      setAssessmentHistory([]);
      setPopularPosts([]);
      setPendingCbtReflectionCount(0);
      setErrorMessage(null);
      setWarningMessage(null);
      return;
    }
    void load();
  }, [isActive, load]);

  const updateCheckinPayload = <K extends keyof CheckinPayload>(key: K, value: CheckinPayload[K]) => {
    setCheckinPayload((previous) => {
      if (!previous) {
        return previous;
      }
      return { ...previous, [key]: value };
    });
  };

  const triggerCheckinSwitchMotion = useCallback(() => {
    setCheckinSwitchMotion(true);
    if (checkinSwitchMotionTimerRef.current !== null) {
      window.clearTimeout(checkinSwitchMotionTimerRef.current);
    }
    checkinSwitchMotionTimerRef.current = window.setTimeout(() => {
      setCheckinSwitchMotion(false);
      checkinSwitchMotionTimerRef.current = null;
    }, 560);
  }, []);

  useEffect(
    () => () => {
      if (checkinSwitchMotionTimerRef.current !== null) {
        window.clearTimeout(checkinSwitchMotionTimerRef.current);
      }
    },
    [],
  );

  const onSaveCheckinInHome = useCallback(async () => {
    if (!firebaseUser || !checkinPayload || savingCheckin) {
      return;
    }

    const payload: CheckinPayload = {
      ...checkinPayload,
      date: kstNow.date,
      timezone: "Asia/Seoul",
    };

    try {
      setSavingCheckin(true);
      setCheckinErrorMessage(null);
      setCheckinNotice(null);

      let nextRecord: CheckinRecord;
      try {
        const shouldEdit = Boolean(checkinRecord && checkinRecord.current_version_no > 0);
        nextRecord = await saveCheckinToday(firebaseUser, payload, shouldEdit);
      } catch (error) {
        if (!(error instanceof CoreApiError) || !error.message.includes("checkin_already_exists")) {
          throw error;
        }
        nextRecord = await saveCheckinToday(firebaseUser, payload, true);
      }

      setCheckinRecord(nextRecord);
      setCheckinPayload(nextRecord.payload ?? payload);
      trackEvent(ANALYTICS_EVENTS.checkinSubmitted, {
        source: "home",
        is_edit: Boolean(checkinRecord && checkinRecord.current_version_no > 0),
        mood_1_5: payload.mood_1_5,
        anxiety_1_5: payload.anxiety_1_5,
        energy_1_5: payload.energy_1_5
      });
      setCheckinNotice("오늘 체크인이 저장되었습니다.");
      triggerCheckinSwitchMotion();
      await load();
    } catch (error) {
      setCheckinErrorMessage(parseError(error));
    } finally {
      setSavingCheckin(false);
    }
  }, [checkinPayload, checkinRecord, firebaseUser, kstNow.date, load, savingCheckin, triggerCheckinSwitchMotion]);

  if (phase === "signed_out") {
    return (
      <main className="ms-landing-page" aria-label="Mindsight 랜딩">
        <div className="ms-landing-page__card">
          <div className="ms-landing-page__content">
            <section className="ms-landing-copy" aria-label="서비스 소개">
              <h1 className="ms-landing-copy__title">
                <span className="ms-landing-copy__title-line">MindSight</span>
              </h1>
              <p className="ms-landing-copy__subtitle">당신의 회복 루틴을 함께합니다.</p>
              <p className="ms-landing-copy__description">
                마음을 기록하고 회복을 이어가는 개인 맞춤 케어
                <br />
                체크인, 챌린지, 한줄일기, CBT를 통해 오늘의 회복 루틴을 시작하세요.
              </p>
            </section>

            <Card className="ms-landing-login-card" title="Sign In">
              <form className="ms-stack" onSubmit={onLandingLoginSubmit}>
                <Input
                  label="이메일"
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={landingEmail}
                  onChange={(event) => setLandingEmail(event.target.value)}
                />
                <PasswordInput
                  label="비밀번호"
                  placeholder="비밀번호 입력"
                  required
                  value={landingPassword}
                  onChange={(event) => setLandingPassword(event.target.value)}
                />

                {landingError ? <Banner variant="danger" title="로그인 실패" description={landingError} /> : null}

                <Button fullWidth loading={landingSubmitting} type="submit">
                  로그인
                </Button>
              </form>

              <div className="ms-landing-login-card__links">
                <Link href="/auth/signup" className="ms-inline-link">
                  회원가입
                </Link>
                <Link href="/auth/reset-password" className="ms-inline-link">
                  비밀번호 찾기
                </Link>
              </div>

            </Card>
          </div>
        </div>
      </main>
    );
  }

  return (
    <AppShell>
      <PageContainer size="lg">
        {!isActive ? (
          <SectionContainer title="접근 상태 확인" description="이메일 확인 및 온보딩 완료 후 개인 홈이 열립니다.">
            <Card title={accessGuide.title} description={accessGuide.description}>
              <div className="ms-row">
                <Button onClick={() => router.push(accessGuide.route)}>{accessGuide.cta}</Button>
                <Button variant="secondary" onClick={() => router.push("/auth/login")}>다시 로그인</Button>
              </div>
            </Card>
          </SectionContainer>
        ) : (
          <SectionContainer>
            {warningMessage ? <Banner variant="warning" title="일부 데이터 지연" description={warningMessage} /> : null}
            {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}
            {checkinNotice ? <Banner variant="success" title="저장 완료" description={checkinNotice} /> : null}
            {checkinErrorMessage ? <Banner variant="danger" title="체크인 저장 실패" description={checkinErrorMessage} /> : null}

            <div className="ms-home-v3">
              <OnboardingTour />
              <header className="ms-home-v3__intro">
                <h1 className="ms-home-v3__title">{nickname}님, 안녕하세요!</h1>
                <p className="ms-home-v3__subtitle">{dayGreetingMessage}</p>
              </header>

              <div className="ms-home-v3__grid">
                <Card
                  id="tour-checkin"
                  className="ms-home-v3__card"
                  title={checkinCompleted ? "오늘의 활동" : "Check-in"}
                  description={checkinCompleted ? "오늘 완료할 활동을 순서대로 진행해보세요." : "오늘 상태를 기록해주세요."}
                >
                  {loading ? (
                    <LoadingSkeleton lines={4} />
                  ) : checkinCompleted ? (
                    <div className={`ms-home-today-actions${checkinSwitchMotion ? " ms-home-today-actions--enter" : ""}`}>
                      {todayActions.map((item) => (
                        <div
                          key={item.key}
                          className={`ms-home-today-action ms-home-today-action--tone-${item.key}${item.done ? " ms-home-today-action--done" : ""}${
                            !item.done && item.disabled ? " ms-home-today-action--scheduled" : ""
                          }`}
                        >
                          <span className="ms-home-today-action__label">{item.label}</span>
                          {item.key === "cbt" ? (
                            <div className="ms-home-today-action__ctas">
                              <button
                                type="button"
                                className="ms-home-today-action__cta"
                                disabled={Boolean(item.primaryDisabled)}
                                onClick={() => router.push(item.href)}
                              >
                                {item.pendingActionLabel}
                              </button>
                              <button
                                type="button"
                                className="ms-home-today-action__cta"
                                disabled={Boolean(item.secondaryDisabled)}
                                onClick={() => {
                                  if (item.secondaryHref) {
                                    router.push(item.secondaryHref);
                                  }
                                }}
                              >
                                {item.secondaryActionLabel}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="ms-home-today-action__cta"
                              disabled={item.done || item.disabled}
                              onClick={() => router.push(item.href)}
                            >
                              {item.done ? "완료" : item.pendingActionLabel}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="ms-home-checkin-box">
                      <div className="ms-home-checkin-form">
                        <div className="ms-home-checkin-form__row ms-home-checkin-form__row--three">
                          <Select
                            label="총 수면시간"
                            value={checkinPayload?.sleep_total_bucket ?? "h6_7"}
                            onChange={(event) =>
                              updateCheckinPayload("sleep_total_bucket", event.target.value as CheckinPayload["sleep_total_bucket"])
                            }
                            options={[...CHECKIN_SLEEP_TOTAL_OPTIONS]}
                          />
                          <Input
                            label="기상시간"
                            type="time"
                            value={checkinPayload?.wake_time_local ?? "07:00"}
                            onChange={(event) => updateCheckinPayload("wake_time_local", event.target.value)}
                          />
                          <Select
                            label="잠들기까지 걸린 시간"
                            value={checkinPayload?.sleep_latency_bucket ?? "m15_30"}
                            onChange={(event) =>
                              updateCheckinPayload(
                                "sleep_latency_bucket",
                                event.target.value as CheckinPayload["sleep_latency_bucket"],
                              )
                            }
                            options={[...CHECKIN_SLEEP_LATENCY_OPTIONS]}
                          />
                        </div>
                        <div className="ms-home-checkin-form__row ms-home-checkin-form__row--three">
                          <Select
                            label="기분"
                            value={String(checkinPayload?.mood_1_5 ?? 3)}
                            onChange={(event) => updateCheckinPayload("mood_1_5", Number(event.target.value))}
                            options={[...CHECKIN_MOOD_OPTIONS]}
                          />
                          <Select
                            label="불안"
                            value={String(checkinPayload?.anxiety_1_5 ?? 3)}
                            onChange={(event) => updateCheckinPayload("anxiety_1_5", Number(event.target.value))}
                            options={[...CHECKIN_ANXIETY_OPTIONS]}
                          />
                          <Select
                            label="에너지"
                            value={String(checkinPayload?.energy_1_5 ?? 3)}
                            onChange={(event) => updateCheckinPayload("energy_1_5", Number(event.target.value))}
                            options={[...CHECKIN_ENERGY_OPTIONS]}
                          />
                        </div>
                        <div className="ms-home-checkin-form__row ms-home-checkin-form__row--four">
                          <Select
                            label="햇빛 노출"
                            value={checkinPayload?.daylight_bucket ?? "m10_29"}
                            onChange={(event) =>
                              updateCheckinPayload("daylight_bucket", event.target.value as CheckinPayload["daylight_bucket"])
                            }
                            options={[...CHECKIN_DAYLIGHT_OPTIONS]}
                          />
                          <Select
                            label="운동"
                            value={checkinPayload?.exercise_bucket ?? "m1_9"}
                            onChange={(event) =>
                              updateCheckinPayload("exercise_bucket", event.target.value as CheckinPayload["exercise_bucket"])
                            }
                            options={[...CHECKIN_EXERCISE_OPTIONS]}
                          />
                          <Select
                            label="오후 2시 이후 카페인"
                            value={checkinPayload?.caffeine_after_2pm_flag ? "yes" : "no"}
                            onChange={(event) => updateCheckinPayload("caffeine_after_2pm_flag", event.target.value === "yes")}
                            options={[...CHECKIN_YES_NO_OPTIONS]}
                          />
                          <Select
                            label="음주"
                            value={checkinPayload?.alcohol_bucket ?? "none"}
                            onChange={(event) =>
                              updateCheckinPayload("alcohol_bucket", event.target.value as CheckinPayload["alcohol_bucket"])
                            }
                            options={[...CHECKIN_ALCOHOL_OPTIONS]}
                          />
                        </div>
                      </div>
                      <Button loading={savingCheckin} onClick={() => void onSaveCheckinInHome()}>
                        체크인 저장
                      </Button>
                    </div>
                  )}
                </Card>

                <Card
                  id="tour-calendar"
                  className="ms-home-v3__card"
                  title="월간 출석 캘린더"
                  description={`${kstNow.year}년 ${kstNow.month}월 체크인 기록`}
                >
                  {loading ? (
                    <LoadingSkeleton lines={5} />
                  ) : (
                    <MonthlyCheckinCalendar
                      month={calendarMonth}
                      checkedDateSet={monthCheckinSet}
                      featureMap={monthCheckinFeatureMap}
                      todayDate={kstNow.date}
                      ariaLabel="홈 월간 체크인 캘린더"
                    />
                  )}
                </Card>

                <Card id="tour-challenge" className="ms-home-v3__card" title="진행 중인 챌린지" description="최대 3개까지 동시에 진행할 수 있습니다.">
                  {loading ? (
                    <LoadingSkeleton lines={3} />
                  ) : (
                    <div className="ms-home-challenge-slots">
                      {challengeSlots.map((challenge, index) => {
                        if (!challenge) {
                          return (
                            <button
                              key={`empty-${index}`}
                              type="button"
                              className="ms-home-challenge-slot ms-home-challenge-slot--add"
                              onClick={() => router.push("/challenge")}
                            >
                              <span className="ms-home-challenge-slot__plus">+</span>
                              <span className="ms-home-challenge-slot__meta">챌린지 추가</span>
                            </button>
                          );
                        }

                        const progressDay = resolveChallengeDoneDays(challenge, kstNow.date);
                        const progressRatio = challenge.target_days > 0 ? Math.max(0, Math.min(1, progressDay / challenge.target_days)) : 0;
                        const isCompleted = Boolean(challenge.completed_today_flag) || challenge.status === "completed";

                        return (
                          <button
                            key={challenge.enrollment_id}
                            type="button"
                            disabled={isCompleted}
                            className={`ms-home-challenge-slot ms-home-challenge-slot--active${
                              isCompleted ? " ms-home-challenge-slot--disabled" : ""
                            }`}
                            style={isCompleted ? undefined : getChallengeSlotStyle(progressRatio)}
                            onClick={() => router.push(`/challenge/session/${challenge.enrollment_id}/progress`)}
                          >
                            <span className="ms-home-challenge-slot__title">{challenge.challenge_name}</span>
                            <span className="ms-home-challenge-slot__meta">
                              {progressDay}/{challenge.target_days}일
                            </span>
                            <span className="ms-home-challenge-slot__progress-track" aria-hidden="true">
                              <span
                                className="ms-home-challenge-slot__progress-fill"
                                style={{
                                  width: `${Math.round(progressRatio * 100)}%`,
                                }}
                              />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Card>

                <Card id="tour-posts" className="ms-home-v3__card" title="인기글">
                  {loading ? (
                    <LoadingSkeleton lines={4} />
                  ) : popularPosts.length === 0 ? (
                    <EmptyState title="아직 인기글이 없습니다" description="게시판이 업데이트되면 여기에 표시됩니다." />
                  ) : (
                    <div className="ms-home-popular-list">
                      {popularPosts.map((item, index) => (
                        <button
                          key={item.post.post_id}
                          type="button"
                          className="ms-home-popular-item"
                          onClick={() => router.push(`/board-feed?q=${encodeURIComponent(item.post.feed_public_id)}`)}
                        >
                          <span className="ms-home-popular-item__rank">{index + 1}</span>
                          <span className="ms-home-popular-item__title">{getPopularFeedTitle(item)}</span>
                          <span className="ms-home-popular-item__meta">
                            ♥ {item.engagement.like_count} · 댓글 {item.engagement.comment_count}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </SectionContainer>
        )}
      </PageContainer>
    </AppShell>
  );
}
