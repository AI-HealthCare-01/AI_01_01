"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  PageContainer,
  SectionContainer,
  SegmentedControl,
  Tag,
} from "../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../src/features/auth";
import {
  CoreApiError,
  getChallengeCatalog,
  getChallengeRecommendations,
  logChallengeExposure,
  type ChallengeCatalogItem,
  type ChallengeEnrollment,
  type ChallengeRecommendationBundle,
} from "../../src/features/core-inputs";

const STATUS_LABEL: Record<ChallengeEnrollment["status"], string> = {
  active: "진행 중",
  paused: "일시중지",
  completed: "완료",
  dropped: "시작 가능",
};

const DOMAIN_LABEL: Record<string, string> = {
  sleep: "잠 편안하게",
  activation: "활기차게",
  regulation: "마음 편안하게",
  social: "함께하기",
  wellbeing: "나를 돌보기",
};

const PROGRAM_TYPE_LABEL: Record<string, string> = {
  one_time: "가볍게 한 번",
  streak: "매일 이어가기",
  step_up: "조금씩 늘리기",
  guided_reflection: "천천히 돌아보기",
  bundle_weekly: "한 주 루틴",
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

function latestStatusByChallenge(enrollments: ChallengeEnrollment[]): Map<string, ChallengeEnrollment> {
  const map = new Map<string, ChallengeEnrollment>();
  for (const item of enrollments) {
    if (!map.has(item.challenge_id)) {
      map.set(item.challenge_id, item);
    }
  }
  return map;
}

function toKstDateString(value = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

function getActiveSlotStyle(progressRatio: number): CSSProperties {
  const ratio = Math.max(0, Math.min(1, progressRatio));
  const style: CSSProperties = {
    background:
      "linear-gradient(145deg, color-mix(in oklab, var(--color-brand-primary-soft) 66%, transparent) 0%, color-mix(in oklab, var(--color-brand-primary) 36%, transparent) 100%)",
    borderColor: "color-mix(in oklab, var(--color-brand-primary) 56%, white)",
  };
  (style as Record<string, string>)["--ms-challenge-slot-text"] = "hsl(246 47% 21%)";
  (style as Record<string, string>)["--ms-challenge-slot-meta"] = "hsl(248 34% 30%)";
  (style as Record<string, string>)["--ms-challenge-slot-track"] = "rgba(76, 84, 135, 0.18)";
  (style as Record<string, string>)["--ms-challenge-slot-fill"] = `color-mix(in oklab, white ${Math.max(
    14,
    Math.round(24 - ratio * 10),
  )}%, var(--color-brand-primary))`;
  return style;
}

function handleCatalogCardKeyDown(
  event: ReactKeyboardEvent<HTMLElement>,
  onOpen: () => void,
) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  onOpen();
}

function resolveCatalogStatusLabel(latest: ChallengeEnrollment | undefined): string {
  if (!latest || latest.status === "dropped") {
    return "시작 가능";
  }
  return STATUS_LABEL[latest.status];
}

export default function ChallengePage() {
  const { firebaseUser } = useAuthContext();
  const router = useRouter();

  const [catalog, setCatalog] = useState<ChallengeCatalogItem[]>([]);
  const [bundle, setBundle] = useState<ChallengeRecommendationBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dismissedRecommendationIds, setDismissedRecommendationIds] = useState<string[]>([]);
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const loggedShownKeysRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }

    const [catalogRows, bundleData] = await Promise.all([
      getChallengeCatalog(firebaseUser),
      getChallengeRecommendations(firebaseUser),
    ]);

    setCatalog(catalogRows);
    setBundle(bundleData);
  }, [firebaseUser]);

  useEffect(() => {
    const run = async () => {
      if (!firebaseUser) {
        return;
      }

      try {
        setLoading(true);
        await refresh();
      } catch (error) {
        setErrorMessage(parseError(error));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [firebaseUser, refresh]);

  useEffect(() => {
    const run = async () => {
      if (!firebaseUser || !bundle) {
        return;
      }

      const candidates = bundle.recommendations.items
        .map((item) => item.challenge_id)
        .filter((challengeId) => !loggedShownKeysRef.current.has(challengeId));

      if (candidates.length === 0) {
        return;
      }

      for (const challengeId of candidates) {
        loggedShownKeysRef.current.add(challengeId);
      }

      await Promise.all(
        candidates.map((challengeId) =>
          logChallengeExposure(firebaseUser, {
            challenge_id: challengeId,
            exposure_type: "shown",
          }).catch(() => undefined),
        ),
      );
    };

    void run();
  }, [bundle, firebaseUser]);

  const todayKst = useMemo(() => toKstDateString(), []);

  const visibleRecommendations = useMemo(() => {
    if (!bundle) {
      return [];
    }
    return bundle.recommendations.items.filter((item) => !dismissedRecommendationIds.includes(item.challenge_id));
  }, [bundle, dismissedRecommendationIds]);

  const featuredRecommendation = visibleRecommendations[0] ?? null;

  const activeEnrollments = useMemo(() => {
    if (!bundle) {
      return [];
    }
    return [...bundle.enrollments.active, ...bundle.enrollments.paused].filter(
      (enrollment) =>
        enrollment.status !== "dropped" &&
        enrollment.status !== "completed" &&
        !isStaleOneDayChallenge(enrollment, todayKst),
    );
  }, [bundle, todayKst]);

  const activeSlots = useMemo(() => {
    const slots: Array<ChallengeEnrollment | null> = [...activeEnrollments.slice(0, 3)];
    while (slots.length < 3) {
      slots.push(null);
    }
    return slots;
  }, [activeEnrollments]);

  const latestStatusMap = useMemo(() => {
    if (!bundle) {
      return new Map<string, ChallengeEnrollment>();
    }
    const merged = [
      ...bundle.enrollments.active,
      ...bundle.enrollments.paused,
      ...bundle.enrollments.completed,
      ...bundle.enrollments.dropped,
    ];
    return latestStatusByChallenge(merged);
  }, [bundle]);

  const domainOptions = useMemo(() => {
    const domains = Array.from(new Set(catalog.map((item) => item.domain)));
    return [
      { label: "전체", value: "all" },
      ...domains.map((domain) => ({ label: DOMAIN_LABEL[domain] ?? domain, value: domain })),
    ];
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    if (domainFilter === "all") {
      return catalog;
    }
    return catalog.filter((item) => item.domain === domainFilter);
  }, [catalog, domainFilter]);

  useEffect(() => {
    if (domainFilter === "all") {
      return;
    }
    if (!catalog.some((item) => item.domain === domainFilter)) {
      setDomainFilter("all");
    }
  }, [catalog, domainFilter]);

  const scrollToCatalog = () => {
    const node = document.getElementById("challenge-catalog");
    if (!node) {
      return;
    }
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const respondRecommendation = async (challengeId: string) => {
    if (!firebaseUser || working) {
      return;
    }

    try {
      setWorking(true);
      setErrorMessage(null);
      setNotice(null);

      await logChallengeExposure(firebaseUser, {
        challenge_id: challengeId,
        exposure_type: "shown",
        response_type: "declined",
      });

      setDismissedRecommendationIds((previous) =>
        previous.includes(challengeId) ? previous : [...previous, challengeId],
      );
      setNotice("추천 목록에서 제외했습니다.");
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setWorking(false);
    }
  };

  return (
    <AuthRouteGuard policy="require-active">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">챌린지</Badge>
          </div>
        }
      >
        <PageContainer size="lg">
          <SectionContainer title="챌린지">
            {notice ? <Banner variant="success" title="안내" description={notice} /> : null}
            {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

            <div className="ms-challenge-home">
              <div className="ms-challenge-home__quickbar">
                <p className="ms-challenge-home__quickcopy">오늘의 회복 루틴에 맞는 챌린지를 선택해보세요.</p>
                <div className="ms-challenge-home__quickstats">
                  <Tag variant="brand">진행 {activeEnrollments.length}/3</Tag>
                  <Tag variant="success">완료 {bundle?.enrollments.completed.length ?? 0}</Tag>
                  <Tag variant="neutral">카탈로그 {catalog.length}개</Tag>
                </div>
              </div>

              <div className="ms-challenge-home__overview-grid">
                <Card className="ms-challenge-home__active-card" title="진행 중인 챌린지">
                  <div className="ms-challenge-active-slots">
                    {activeSlots.map((enrollment, index) => {
                      if (!enrollment) {
                        return (
                          <button
                            key={`empty-${index}`}
                            type="button"
                            className="ms-challenge-active-slot ms-challenge-active-slot--empty"
                            onClick={scrollToCatalog}
                          >
                            <span className="ms-challenge-active-slot__plus" aria-hidden="true">
                              +
                            </span>
                            <span className="ms-challenge-active-slot__empty-text">챌린지 추가</span>
                          </button>
                        );
                      }

                      const progressDay = resolveChallengeDoneDays(enrollment, todayKst);
                      const progressRatio = enrollment.target_days > 0 ? Math.max(0, Math.min(1, progressDay / enrollment.target_days)) : 0;
                      const completedToday = Boolean(enrollment.completed_today_flag);

                      return (
                        <button
                          key={enrollment.enrollment_id}
                          type="button"
                          className={
                            enrollment.status === "paused"
                              ? "ms-challenge-active-slot ms-challenge-active-slot--paused"
                              : `ms-challenge-active-slot${completedToday ? " ms-challenge-active-slot--disabled" : ""}`
                          }
                          style={
                            enrollment.status === "paused" || completedToday ? undefined : getActiveSlotStyle(progressRatio)
                          }
                          disabled={completedToday}
                          onClick={() => router.push(`/challenge/session/${enrollment.enrollment_id}/progress`)}
                        >
                          <p className="ms-challenge-active-slot__title">{enrollment.challenge_name}</p>
                          <p className="ms-challenge-active-slot__meta">
                            {progressDay}/{enrollment.target_days}일
                          </p>
                          <span className="ms-challenge-active-slot__progress-track" aria-hidden="true">
                            <span
                              className="ms-challenge-active-slot__progress-fill"
                              style={{ width: `${Math.round(progressRatio * 100)}%` }}
                            />
                          </span>
                          <span className="ms-challenge-active-slot__status">
                            {completedToday ? "완료(오늘)" : STATUS_LABEL[enrollment.status]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </Card>

                <Card className="ms-challenge-home__recommend-card" title="오늘의 추천 챌린지">
                  {loading ? (
                    <p className="ms-card__desc">추천 챌린지를 불러오는 중입니다.</p>
                  ) : bundle?.recommendations.suppressed ? (
                    <Banner
                      variant="warning"
                      title="안전 안내"
                      description={
                        bundle.recommendations.safety_message ??
                        "현재 상태에서는 일반 챌린지보다 안전 안내를 우선합니다."
                      }
                    />
                  ) : featuredRecommendation ? (
                    <article className="ms-challenge-featured">
                      <div className="ms-row">
                        <Tag variant="info">{DOMAIN_LABEL[featuredRecommendation.domain] ?? featuredRecommendation.domain}</Tag>
                        <Tag variant="brand">
                          {PROGRAM_TYPE_LABEL[featuredRecommendation.program_type] ?? featuredRecommendation.program_type}
                        </Tag>
                      </div>
                      <h3 className="ms-challenge-featured__title">{featuredRecommendation.name_ko}</h3>
                      <p className="ms-challenge-featured__desc">
                        {featuredRecommendation.reason_copy_ko ?? featuredRecommendation.summary_ko}
                      </p>
                      <div className="ms-row">
                        <Button onClick={() => router.push(`/challenge/${featuredRecommendation.challenge_id}/enroll`)}>
                          시작하기
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => router.push(`/challenge/${featuredRecommendation.challenge_id}`)}
                        >
                          상세
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => void respondRecommendation(featuredRecommendation.challenge_id)}
                          disabled={working}
                        >
                          추천 제외
                        </Button>
                      </div>
                    </article>
                  ) : (
                    <EmptyState title="추천 챌린지가 없습니다" description="카탈로그에서 직접 챌린지를 선택해보세요." />
                  )}
                </Card>
              </div>

              <Card
                id="challenge-catalog"
                className="ms-challenge-home__catalog-card"
                title="챌린지 카탈로그"
                description="카드를 누르면 상세 페이지에서 내용을 확인하고 시작할 수 있습니다."
              >
                <div className="ms-challenge-home__catalog-filter">
                  <SegmentedControl<string>
                    options={domainOptions}
                    value={domainFilter}
                    onChange={setDomainFilter}
                    ariaLabel="챌린지 도메인 필터"
                  />
                </div>

                {loading && catalog.length === 0 ? (
                  <p className="ms-card__desc">카탈로그를 불러오는 중입니다.</p>
                ) : filteredCatalog.length === 0 ? (
                  <EmptyState title="표시할 챌린지가 없습니다" description="다른 필터를 선택해 주세요." />
                ) : (
                  <div className="ms-challenge-catalog-grid">
                    {filteredCatalog.map((item) => {
                      const latest = latestStatusMap.get(item.challenge_id);
                      const openDetail = () => router.push(`/challenge/${item.challenge_id}`);
                      return (
                        <article
                          key={item.challenge_id}
                          className="ms-challenge-catalog-item ms-challenge-catalog-item--clickable"
                          role="button"
                          tabIndex={0}
                          aria-label={`${item.name_ko} 상세 보기`}
                          onClick={openDetail}
                          onKeyDown={(event) => handleCatalogCardKeyDown(event, openDetail)}
                        >
                          <div className="ms-challenge-catalog-item__head">
                            <h3 className="ms-challenge-catalog-item__title">{item.name_ko}</h3>
                            <p className="ms-challenge-catalog-item__desc">{item.summary_ko}</p>
                          </div>

                          <div className="ms-row">
                            <Tag variant="info">{DOMAIN_LABEL[item.domain] ?? item.domain}</Tag>
                            <Tag variant="neutral">소요 {item.default_target_days}일</Tag>
                            <Tag variant={latest && latest.status !== "dropped" ? "brand" : "neutral"}>
                              {resolveCatalogStatusLabel(latest)}
                            </Tag>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
