"use client";

import { useEffect, useMemo, useState } from "react";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  PageContainer,
  SectionContainer,
} from "../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../src/features/auth";
import {
  ALL_ASSESSMENT_QUESTIONS,
  ASSESSMENT_SECTIONS,
  type AssessmentQuestion,
  TOTAL_ASSESSMENT_QUESTION_COUNT,
} from "../../src/features/core-inputs/assessment-question-bank";
import {
  completeAssessment,
  CoreApiError,
  getChallengeRecommendations,
  listAssessmentHistory,
  saveAssessmentAnswer,
  startAssessment,
  type AssessmentSession,
} from "../../src/features/core-inputs";

type YearMonth = {
  year: number;
  month: number;
};

const ASSESSMENT_CALENDAR_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function parseError(error: unknown): string {
  if (error instanceof CoreApiError) {
    if (error.message === "assessment_items_incomplete") {
      return "모든 문항에 응답한 뒤 완료할 수 있습니다.";
    }
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

function scoreTone(metric: "phq9" | "gad7" | "isi", value: number | null): "low" | "mid" | "high" | "empty" {
  if (value === null || value === undefined) {
    return "empty";
  }
  if (metric === "phq9") {
    if (value >= 15) {
      return "high";
    }
    if (value >= 10) {
      return "mid";
    }
    return "low";
  }
  if (metric === "gad7") {
    if (value >= 15) {
      return "high";
    }
    if (value >= 10) {
      return "mid";
    }
    return "low";
  }
  if (value >= 22) {
    return "high";
  }
  if (value >= 15) {
    return "mid";
  }
  return "low";
}

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  return value.slice(0, 10);
}

function getKstYearMonth(value = new Date()): YearMonth {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(value);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: getPart("year"),
    month: getPart("month"),
  };
}

function shiftMonth(cursor: YearMonth, offset: number): YearMonth {
  const next = new Date(Date.UTC(cursor.year, cursor.month - 1 + offset, 1));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
  };
}

function buildMonthCalendarCells(cursor: YearMonth): Array<{ date: string | null; dayLabel: string }> {
  const firstDay = new Date(Date.UTC(cursor.year, cursor.month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();
  const cells: Array<{ date: string | null; dayLabel: string }> = [];

  for (let index = 0; index < firstDay; index += 1) {
    cells.push({ date: null, dayLabel: "" });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      date: `${cursor.year}-${String(cursor.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      dayLabel: String(day),
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ date: null, dayLabel: "" });
  }

  return cells;
}

type QuestionPointer = {
  sectionIndex: number;
  questionIndex: number;
};

type PointerInfo = QuestionPointer & {
  question: AssessmentQuestion;
  totalInSection: number;
  orderInSection: number;
};

function resolvePointerInfo(pointer: QuestionPointer): PointerInfo | null {
  const section = ASSESSMENT_SECTIONS[pointer.sectionIndex];
  if (!section) {
    return null;
  }
  const question = section.questions[pointer.questionIndex];
  if (!question) {
    return null;
  }
  return {
    ...pointer,
    question,
    totalInSection: section.questions.length,
    orderInSection: pointer.questionIndex + 1,
  };
}

export default function AssessmentsPage() {
  const { firebaseUser } = useAuthContext();

  const [history, setHistory] = useState<AssessmentSession[]>([]);
  const [currentAssessmentId, setCurrentAssessmentId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [sectionIndex, setSectionIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [sectionIntroDone, setSectionIntroDone] = useState<Record<number, boolean>>({});
  const [sectionIntroVisible, setSectionIntroVisible] = useState(true);
  const [showCompletionCard, setShowCompletionCard] = useState(false);
  const [selectedOptionKey, setSelectedOptionKey] = useState<string | null>(null);
  const [historyMonth, setHistoryMonth] = useState<YearMonth>(getKstYearMonth());
  const [riskLevel, setRiskLevel] = useState<number | null>(null);
  const [riskMessage, setRiskMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const totalAnswered = useMemo(() => Object.keys(answers).length, [answers]);
  const remainingCount = TOTAL_ASSESSMENT_QUESTION_COUNT - totalAnswered;
  const canComplete = Boolean(currentAssessmentId) && remainingCount === 0;

  const completedHistory = useMemo(
    () =>
      history.filter(
        (session) =>
          session.status === "completed" &&
          session.scores.phq9_total !== null &&
          session.scores.gad7_total !== null &&
          session.scores.isi_total !== null,
      ),
    [history],
  );

  const currentSection = ASSESSMENT_SECTIONS[sectionIndex];
  const currentQuestion = currentSection?.questions[questionIndex] ?? null;

  const globalOrder = useMemo(() => {
    let consumed = 0;
    for (let index = 0; index < sectionIndex; index += 1) {
      consumed += ASSESSMENT_SECTIONS[index]?.questions.length ?? 0;
    }
    return consumed + questionIndex + 1;
  }, [questionIndex, sectionIndex]);

  const previousPointerInfo = useMemo(() => {
    if (questionIndex > 0) {
      return resolvePointerInfo({ sectionIndex, questionIndex: questionIndex - 1 });
    }
    if (sectionIndex > 0) {
      const previousSection = ASSESSMENT_SECTIONS[sectionIndex - 1];
      return resolvePointerInfo({
        sectionIndex: sectionIndex - 1,
        questionIndex: previousSection.questions.length - 1,
      });
    }
    return null;
  }, [questionIndex, sectionIndex]);

  const nextPointerInfo = useMemo(() => {
    if (questionIndex < currentSection.questions.length - 1) {
      return resolvePointerInfo({ sectionIndex, questionIndex: questionIndex + 1 });
    }
    if (sectionIndex < ASSESSMENT_SECTIONS.length - 1) {
      return resolvePointerInfo({ sectionIndex: sectionIndex + 1, questionIndex: 0 });
    }
    return null;
  }, [currentSection.questions.length, questionIndex, sectionIndex]);

  const completedDateSet = useMemo(() => {
    const dates = new Set<string>();
    for (const session of completedHistory) {
      const value = formatDate(session.completed_at ?? session.started_at);
      if (value !== "-") {
        dates.add(value);
      }
    }
    return dates;
  }, [completedHistory]);

  const historyCalendarCells = useMemo(() => buildMonthCalendarCells(historyMonth), [historyMonth]);

  useEffect(() => {
    const run = async () => {
      if (!firebaseUser) {
        return;
      }

      try {
        setLoading(true);
        const [historyResult, recommendationResult] = await Promise.allSettled([
          listAssessmentHistory(firebaseUser),
          getChallengeRecommendations(firebaseUser),
        ]);

        if (historyResult.status === "fulfilled") {
          setHistory(historyResult.value);
        } else {
          throw historyResult.reason;
        }

        if (recommendationResult.status === "fulfilled") {
          setRiskLevel(recommendationResult.value.recommendations.risk_level);
          setRiskMessage(recommendationResult.value.recommendations.safety_message ?? null);
        } else {
          setRiskLevel(null);
          setRiskMessage(null);
        }
      } catch (error) {
        setErrorMessage(parseError(error));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [firebaseUser]);

  const onStart = async () => {
    if (!firebaseUser || working) {
      return;
    }

    try {
      setWorking(true);
      setErrorMessage(null);
      setNotice(null);

      const session = await startAssessment(firebaseUser, "manual_start");
      setCurrentAssessmentId(session.assessment_id);
      setAnswers({});
      setSectionIndex(0);
      setQuestionIndex(0);
      setSectionIntroDone({});
      setSectionIntroVisible(true);
      setShowCompletionCard(false);
      setSelectedOptionKey(null);
      setNotice("심리검사를 시작했습니다. 최근 2주를 기준으로 답해주세요.");
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setWorking(false);
    }
  };

  const moveToPointer = (pointer: QuestionPointer | null) => {
    if (!pointer) {
      return;
    }
    setSectionIndex(pointer.sectionIndex);
    setQuestionIndex(pointer.questionIndex);
    setSelectedOptionKey(null);
    setShowCompletionCard(false);
    setSectionIntroVisible(pointer.questionIndex === 0 && !sectionIntroDone[pointer.sectionIndex]);
  };

  const enterCurrentSection = () => {
    setSectionIntroDone((previous) => ({
      ...previous,
      [sectionIndex]: true,
    }));
    setSectionIntroVisible(false);
  };

  const selectAnswer = (score: number) => {
    if (!currentQuestion || selectedOptionKey !== null || working) {
      return;
    }

    const optionKey = `${currentQuestion.code}:${score}`;
    setSelectedOptionKey(optionKey);
    setAnswers((previous) => ({ ...previous, [currentQuestion.code]: score }));

    window.setTimeout(() => {
      setSelectedOptionKey(null);
      if (nextPointerInfo) {
        moveToPointer(nextPointerInfo);
        return;
      }
      setShowCompletionCard(true);
    }, 400);
  };

  const onComplete = async () => {
    if (!firebaseUser || !currentAssessmentId || working || !canComplete) {
      return;
    }

    try {
      setWorking(true);
      setErrorMessage(null);
      setNotice(null);

      for (const question of ALL_ASSESSMENT_QUESTIONS) {
        const score = answers[question.code];
        if (score === undefined) {
          throw new CoreApiError(400, "assessment_items_incomplete");
        }
        await saveAssessmentAnswer(firebaseUser, currentAssessmentId, question.instrument, question.code, score);
      }

      const completed = await completeAssessment(firebaseUser, currentAssessmentId);
      const [historyResult, recommendationResult] = await Promise.allSettled([
        listAssessmentHistory(firebaseUser),
        getChallengeRecommendations(firebaseUser),
      ]);

      if (historyResult.status === "fulfilled") {
        setHistory(historyResult.value);
      } else {
        throw historyResult.reason;
      }
      if (recommendationResult.status === "fulfilled") {
        setRiskLevel(recommendationResult.value.recommendations.risk_level);
        setRiskMessage(recommendationResult.value.recommendations.safety_message ?? null);
      }
      setCurrentAssessmentId(null);
      setAnswers({});
      setSectionIndex(0);
      setQuestionIndex(0);
      setSectionIntroDone({});
      setSectionIntroVisible(true);
      setShowCompletionCard(false);
      setSelectedOptionKey(null);
      setNotice(
        completed.scores.phq9_item9_nonzero
          ? "검사가 완료되었습니다. 안전 안내를 함께 확인해주세요."
          : "검사가 완료되었습니다."
      );
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setWorking(false);
    }
  };

  const latest = completedHistory[0] ?? null;
  const showRiskFlag = (riskLevel ?? 0) >= 2 || Boolean(latest?.scores.phq9_item9_nonzero);

  return (
    <AuthRouteGuard policy="require-active">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">심리검사</Badge>
          </div>
        }
      >
        <PageContainer size="lg">
          <SectionContainer title="심리 검사" description="최근 2주 상태를 점검하고 변화 흐름을 기록합니다.">
            {notice ? <Banner variant="success" title="안내" description={notice} /> : null}
            {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

            {!currentAssessmentId ? (
              <div className="ms-stack">
                <div className="ms-assessment-home-grid">
                  <Card
                    className="ms-assessment-home-card"
                    title="최근 검사 지표"
                    action={<Badge variant="neutral">검사일 {formatDate(latest?.completed_at ?? null)}</Badge>}
                  >
                    <div className="ms-assessment-score-grid">
                      <article
                        className={`ms-assessment-score-item ms-assessment-score-item--${scoreTone(
                          "phq9",
                          latest?.scores.phq9_total ?? null
                        )}`}
                      >
                        <p className="ms-assessment-score-item__value">{latest?.scores.phq9_total ?? "-"}/27</p>
                        <p className="ms-assessment-score-item__label">우울</p>
                      </article>
                      <article
                        className={`ms-assessment-score-item ms-assessment-score-item--${scoreTone(
                          "gad7",
                          latest?.scores.gad7_total ?? null
                        )}`}
                      >
                        <p className="ms-assessment-score-item__value">{latest?.scores.gad7_total ?? "-"}/21</p>
                        <p className="ms-assessment-score-item__label">불안</p>
                      </article>
                      <article
                        className={`ms-assessment-score-item ms-assessment-score-item--${scoreTone(
                          "isi",
                          latest?.scores.isi_total ?? null
                        )}`}
                      >
                        <p className="ms-assessment-score-item__value">{latest?.scores.isi_total ?? "-"}/28</p>
                        <p className="ms-assessment-score-item__label">불면</p>
                      </article>
                    </div>
                  </Card>

                  <Card className="ms-assessment-home-card" title="위험 안내">
                    {showRiskFlag ? (
                      <div className="ms-stack">
                        <Badge variant="warning">위험 플래그</Badge>
                        <p className="ms-card__desc">
                          최근 기록에서 위험 신호가 감지되었습니다. 지금은 일반 루틴보다 안전한 지원을 먼저 고려해 주세요.
                        </p>
                        <p className="ms-card__desc">
                          가까운 병원 진료나 전문 상담을 가능한 빠르게 연결해보는 것을 권합니다.
                        </p>
                        {riskMessage ? <p className="ms-card__desc">{riskMessage}</p> : null}
                      </div>
                    ) : (
                      <p className="ms-card__desc">
                        현재 기준으로 높은 위험 플래그는 보이지 않습니다. 평소 리듬을 유지하며 정기 점검을 이어가세요.
                      </p>
                    )}
                  </Card>
                </div>

                <Card className="ms-assessment-start-card" title="심리검사 시작하기">
                  <div className="ms-assessment-start-card__row">
                    <p className="ms-card__desc">최근 2주간 심리상태를 점검합니다.</p>
                    <Button className="ms-assessment-start-card__cta" onClick={onStart} loading={working} disabled={loading}>
                      검사 시작하기
                    </Button>
                  </div>
                </Card>

                <Card className="ms-assessment-history-card" title="검사 이력" description="최신순">
                  {completedHistory.length === 0 ? (
                    <EmptyState title="검사 이력이 없습니다" description="검사 시작하기 버튼으로 첫 검사를 진행해보세요." />
                  ) : (
                    <div className="ms-assessment-history-split">
                      <div className="ms-assessment-history-list">
                        {completedHistory.map((session) => (
                          <article key={session.assessment_id} className="ms-assessment-history-item">
                            <div className="ms-assessment-history-item__head">
                              <p className="ms-assessment-history-item__date">
                                {formatDate(session.completed_at ?? session.started_at)}
                              </p>
                              <Badge variant="neutral">{session.status}</Badge>
                            </div>
                            <div className="ms-row">
                              <Badge variant="info">우울 {session.scores.phq9_total ?? "-"}/27</Badge>
                              <Badge variant="info">불안 {session.scores.gad7_total ?? "-"}/21</Badge>
                              <Badge variant="info">불면 {session.scores.isi_total ?? "-"}/28</Badge>
                            </div>
                          </article>
                        ))}
                      </div>

                      <Card title="캘린더 보기" description="검사를 완료한 날짜를 표시합니다.">
                        <div className="ms-activity-log-calendar-nav">
                          <Button size="sm" variant="secondary" onClick={() => setHistoryMonth((previous) => shiftMonth(previous, -1))}>
                            이전
                          </Button>
                          <p className="ms-activity-log-calendar-nav__label">
                            {historyMonth.year}년 {historyMonth.month}월
                          </p>
                          <Button size="sm" variant="secondary" onClick={() => setHistoryMonth((previous) => shiftMonth(previous, 1))}>
                            다음
                          </Button>
                        </div>

                        <div className="ms-home-calendar-weekdays">
                          {ASSESSMENT_CALENDAR_WEEKDAYS.map((day) => (
                            <span key={day}>{day}</span>
                          ))}
                        </div>
                        <div className="ms-home-calendar-grid">
                          {historyCalendarCells.map((cell, index) => {
                            if (!cell.date) {
                              return (
                                <div
                                  key={`assessment-calendar-empty-${index}`}
                                  className="ms-home-calendar-cell ms-home-calendar-cell--empty"
                                  aria-hidden="true"
                                />
                              );
                            }
                            const hasAssessment = completedDateSet.has(cell.date);
                            return (
                              <div
                                key={cell.date}
                                className={`ms-home-calendar-cell${
                                  hasAssessment ? " ms-home-calendar-cell--active ms-home-calendar-cell--tone-happy" : ""
                                }`}
                                title={`${cell.date} · ${hasAssessment ? "검사 완료" : "기록 없음"}`}
                              >
                                {cell.dayLabel}
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    </div>
                  )}
                </Card>
              </div>
            ) : (
              <Card className="ms-assessment-runner" title="심리검사 진행">
                {currentQuestion ? (
                  <div className="ms-stack">
                    <div className="ms-assessment-runner__head">
                      <p className="ms-assessment-runner__section-title">
                        섹션{sectionIndex + 1} {currentSection.title}
                      </p>
                      <p className="ms-assessment-runner__global-progress">
                        전체 {globalOrder}/{TOTAL_ASSESSMENT_QUESTION_COUNT}
                      </p>
                    </div>

                    <div className="ms-assessment-runner__section-strip" aria-label="검사 섹션">
                      {ASSESSMENT_SECTIONS.map((section, index) => (
                        <span
                          key={section.key}
                          className={`ms-assessment-runner__section-chip${
                            index === sectionIndex
                              ? " is-active"
                              : index < sectionIndex
                                ? " is-complete"
                                : ""
                          }`}
                        >
                          섹션{index + 1}
                        </span>
                      ))}
                    </div>

                    <div className="ms-assessment-runner__lane">
                      {previousPointerInfo ? (
                        <button
                          type="button"
                          className="ms-assessment-runner__peek"
                          onClick={() => moveToPointer(previousPointerInfo)}
                          aria-label="이전 문항으로 이동"
                        >
                          <span className="ms-assessment-runner__peek-count">
                            {`${previousPointerInfo.orderInSection}/${previousPointerInfo.totalInSection}`}
                          </span>
                        </button>
                      ) : (
                        <span className="ms-assessment-runner__peek ms-assessment-runner__peek--hidden" aria-hidden />
                      )}

                      {previousPointerInfo ? (
                        <button
                          type="button"
                          className="ms-assessment-runner__nav"
                          onClick={() => moveToPointer(previousPointerInfo)}
                          aria-label="이전 문항"
                        >
                          ‹
                        </button>
                      ) : (
                        <span className="ms-assessment-runner__nav ms-assessment-runner__nav--hidden" aria-hidden />
                      )}

                      {sectionIntroVisible ? (
                        <article className="ms-assessment-runner__question-card ms-assessment-runner__question-card--intro">
                          <p className="ms-assessment-runner__intro-index">섹션{sectionIndex + 1}</p>
                          <p className="ms-assessment-runner__intro-title">{currentSection.title}</p>
                          <p className="ms-assessment-runner__intro-desc">{currentSection.description}</p>
                          <Button className="ms-assessment-runner__intro-button" onClick={enterCurrentSection}>
                            시작하기
                          </Button>
                        </article>
                      ) : showCompletionCard ? (
                        <article className="ms-assessment-runner__question-card ms-assessment-runner__question-card--intro">
                          <p className="ms-assessment-runner__intro-index">검사 마무리</p>
                          <p className="ms-assessment-runner__intro-title">모든 문항에 응답했습니다.</p>
                          <p className="ms-assessment-runner__intro-desc">아래 버튼을 눌러 결과를 저장하세요.</p>
                          <Button
                            className="ms-assessment-runner__intro-button ms-assessment-runner__intro-button--complete"
                            onClick={() => void onComplete()}
                            loading={working}
                            disabled={!canComplete}
                          >
                            검사 완료
                          </Button>
                        </article>
                      ) : (
                        <article className="ms-assessment-runner__question-card">
                          <p className="ms-assessment-runner__question-count">
                            {globalOrder}/{TOTAL_ASSESSMENT_QUESTION_COUNT}
                          </p>
                          <p
                            id={`assessment-question-${currentQuestion.code}`}
                            className="ms-assessment-runner__question-text"
                          >
                            {currentQuestion.text}
                          </p>
                          <div className="ms-assessment-runner__option-wrap">
                            <div
                              className={`ms-assessment-runner__option-grid ms-assessment-runner__option-grid--${Math.min(
                                currentQuestion.options.length,
                                5
                              )}`}
                              role="radiogroup"
                              aria-labelledby={`assessment-question-${currentQuestion.code}`}
                            >
                              {currentQuestion.options.map((option) => {
                                const selected = selectedOptionKey === `${currentQuestion.code}:${option.score}`;
                                return (
                                  <button
                                    key={`${currentQuestion.code}-${option.score}`}
                                    type="button"
                                    className={`ms-assessment-runner__option ${selected ? "is-selected" : ""}`}
                                    onClick={() => selectAnswer(option.score)}
                                    aria-pressed={selected}
                                    disabled={selectedOptionKey !== null}
                                  >
                                    <span className="ms-assessment-runner__option-score">{option.score}</span>
                                    <span className="ms-assessment-runner__option-label">{option.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </article>
                      )}

                      {nextPointerInfo ? (
                        <button
                          type="button"
                          className="ms-assessment-runner__nav"
                          onClick={() => moveToPointer(nextPointerInfo)}
                          aria-label="다음 문항"
                        >
                          ›
                        </button>
                      ) : (
                        <span className="ms-assessment-runner__nav ms-assessment-runner__nav--hidden" aria-hidden />
                      )}

                      {nextPointerInfo ? (
                        <button
                          type="button"
                          className="ms-assessment-runner__peek"
                          onClick={() => moveToPointer(nextPointerInfo)}
                          aria-label="다음 문항으로 이동"
                        >
                          <span className="ms-assessment-runner__peek-count">
                            {`${nextPointerInfo.orderInSection}/${nextPointerInfo.totalInSection}`}
                          </span>
                        </button>
                      ) : (
                        <span className="ms-assessment-runner__peek ms-assessment-runner__peek--hidden" aria-hidden />
                      )}
                    </div>

                    {!canComplete ? (
                      <Banner
                        variant="warning"
                        title="응답이 더 필요합니다"
                        description={`아직 ${remainingCount}개 문항이 남아 있습니다.`}
                      />
                    ) : null}
                  </div>
                ) : (
                  <EmptyState title="문항을 불러오지 못했습니다" description="잠시 후 다시 시도해주세요." />
                )}
              </Card>
            )}
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
