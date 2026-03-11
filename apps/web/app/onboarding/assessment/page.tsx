"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  CenteredFormContainer,
  Chip,
  SectionContainer,
} from "../../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../../src/features/auth";
import {
  completeAssessment,
  CoreApiError,
  saveAssessmentAnswer,
  startAssessment,
} from "../../../src/features/core-inputs";
import {
  type AssessmentQuestion,
  ASSESSMENT_SECTIONS,
  GAD7_QUESTIONS,
  ISI_QUESTIONS,
  PHQ9_QUESTIONS,
  TOTAL_ASSESSMENT_QUESTION_COUNT,
} from "../../../src/features/core-inputs/assessment-question-bank";

function mapErrorMessage(code: string): string {
  if (code.includes("firebase_token_invalid")) {
    return "인증 세션이 만료되었습니다. 다시 로그인 후 시도해주세요.";
  }
  if (code.includes("account_not_found")) {
    return "계정 동기화가 완료되지 않았습니다. 다시 로그인 후 시도해주세요.";
  }
  if (code.includes("baseline_assessment_already_completed")) {
    return "초기 진단척도는 이미 완료되었습니다.";
  }
  if (code.includes("assessment_items_incomplete")) {
    return "모든 문항에 응답한 뒤 완료할 수 있습니다.";
  }
  if (code.includes("assessment_not_completed")) {
    return "검사 완료 처리 후 다시 시도해주세요.";
  }
  if (code.includes("assessment_source_invalid")) {
    return "온보딩 검사 세션으로만 baseline 저장이 가능합니다.";
  }
  if (code.includes("email_verification_required")) {
    return "이메일 인증 완료 후 진행할 수 있습니다.";
  }
  return `초기 진단척도 처리에 실패했습니다. (${code})`;
}

function parseError(error: unknown): string {
  if (error instanceof CoreApiError) {
    return mapErrorMessage(error.message);
  }
  if (error instanceof Error) {
    return mapErrorMessage(error.message);
  }
  return mapErrorMessage("unknown_error");
}

interface QuestionBlockProps {
  question: AssessmentQuestion;
  selectedScore: number | undefined;
  onSelect: (itemCode: string, score: number) => void;
}

function QuestionBlock({ question, selectedScore, onSelect }: QuestionBlockProps) {
  const labelId = `label-${question.code}`;
  const optionsClassName =
    question.options.length >= 5 ? "ms-assessment-options ms-assessment-options--5" : "ms-assessment-options";

  return (
    <div
      id={`question-${question.code}`}
      className="ms-assessment-question"
      role="radiogroup"
      aria-labelledby={labelId}
    >
      <p id={labelId} className="ms-assessment-question__text">
        {question.text}
      </p>
      <div className={optionsClassName}>
        {question.options.map((option) => {
          const selected = selectedScore === option.score;
          return (
            <Chip
              key={`${question.code}-${option.score}`}
              role="radio"
              aria-checked={selected}
              selected={selected}
              className="ms-assessment-option"
              onClick={() => onSelect(question.code, option.score)}
            >
              <span className="ms-assessment-option__score">{option.score}</span>
              <span className="ms-assessment-option__label">{option.label}</span>
            </Chip>
          );
        })}
      </div>
    </div>
  );
}

export default function OnboardingAssessmentPage() {
  const router = useRouter();
  const { firebaseUser, session, completeBaselineAssessment, refreshSession } = useAuthContext();

  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const totalRequiredCount = TOTAL_ASSESSMENT_QUESTION_COUNT;
  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const remainingCount = totalRequiredCount - answeredCount;
  const canComplete = Boolean(assessmentId) && remainingCount === 0;
  const canStartBaselineAssessment =
    session?.onboarding.onboarding_status === "baseline_pending" &&
    Boolean(session.profile.birth_year) &&
    session.consents.sensitive_data_required;

  useEffect(() => {
    if (!session) {
      return;
    }
    if (!canStartBaselineAssessment) {
      router.replace("/onboarding");
    }
  }, [canStartBaselineAssessment, router, session]);

  useEffect(() => {
    if (!firebaseUser || !session || assessmentId || !canStartBaselineAssessment || isStarting) {
      return;
    }

    const run = async () => {
      try {
        setIsStarting(true);
        setErrorMessage(null);

        const started = await startAssessment(firebaseUser, "onboarding");
        setAssessmentId(started.assessment_id);
        setAnswers({});
      } catch (error) {
        setErrorMessage(parseError(error));
      } finally {
        setIsStarting(false);
      }
    };

    void run();
  }, [assessmentId, canStartBaselineAssessment, firebaseUser, isStarting, session]);

  const setAnswer = (itemCode: string, score: number) => {
    setAnswers((previous) => ({ ...previous, [itemCode]: score }));
  };

  const findFirstUnansweredCode = (): string | null => {
    for (const section of ASSESSMENT_SECTIONS) {
      for (const question of section.questions) {
        if (answers[question.code] === undefined) {
          return question.code;
        }
      }
    }
    return null;
  };

  const handleCompleteAssessment = async () => {
    if (!firebaseUser || !assessmentId || isSubmitting) {
      return;
    }

    const firstUnansweredCode = findFirstUnansweredCode();
    if (firstUnansweredCode) {
      setErrorMessage("응답하지 않은 문항이 있어 해당 문항으로 이동했습니다.");
      window.setTimeout(() => {
        const target = document.getElementById(`question-${firstUnansweredCode}`);
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      for (const item of PHQ9_QUESTIONS) {
        const score = answers[item.code];
        if (score === undefined) {
          throw new Error("assessment_items_incomplete");
        }
        await saveAssessmentAnswer(firebaseUser, assessmentId, "phq9", item.code, score);
      }
      for (const item of GAD7_QUESTIONS) {
        const score = answers[item.code];
        if (score === undefined) {
          throw new Error("assessment_items_incomplete");
        }
        await saveAssessmentAnswer(firebaseUser, assessmentId, "gad7", item.code, score);
      }
      for (const item of ISI_QUESTIONS) {
        const score = answers[item.code];
        if (score === undefined) {
          throw new Error("assessment_items_incomplete");
        }
        await saveAssessmentAnswer(firebaseUser, assessmentId, "isi", item.code, score);
      }

      const completed = await completeAssessment(firebaseUser, assessmentId);
      let baselineDone = false;
      let lastError: unknown = null;
      let baselineSession: Awaited<ReturnType<typeof completeBaselineAssessment>> | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          baselineSession = await completeBaselineAssessment({ assessment_id: completed.assessment_id });
          baselineDone = true;
          break;
        } catch (error) {
          lastError = error;
          const code = error instanceof Error ? error.message : "";
          if (code.includes("baseline_assessment_already_completed")) {
            baselineDone = true;
            break;
          }
          if (!code.includes("assessment_not_completed")) {
            throw error;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
        }
      }

      if (!baselineDone && lastError) {
        throw lastError;
      }

      const goHome = () => {
        router.replace("/");
        window.setTimeout(() => {
          if (typeof window !== "undefined" && window.location.pathname !== "/") {
            window.location.href = "/";
          }
        }, 120);
      };

      // baseline complete API가 성공(또는 이미 완료)했으면 온보딩 완료로 간주하고 즉시 홈으로 이동한다.
      // 세션 재동기화 지연으로 onboarding에 남는 현상을 방지한다.
      if (baselineDone || baselineSession?.account.account_status === "active") {
        goHome();
        return;
      }

      // 정상적으로는 여기 도달하지 않지만, 방어적으로 한 번 재조회 후 홈 이동 시도
      await refreshSession();
      goHome();
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthRouteGuard policy="require-onboarding">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">초기 진단척도</Badge>
          </div>
        }
      >
        <CenteredFormContainer>
          <SectionContainer
            title="초기 진단척도 검사"
            description="최근 2주 기준으로 각 문항에 가장 가까운 답을 선택해주세요. 문항별로 1개만 선택할 수 있습니다."
          >
            <div className="ms-row">
              <Badge variant="success">온보딩 시작</Badge>
              <Badge variant="success">기본 정보</Badge>
              <Badge variant="success">동의 설정</Badge>
              <Badge variant="brand">초기 진단척도</Badge>
            </div>

            {errorMessage ? <Banner variant="danger" title="저장 실패" description={errorMessage} /> : null}

            {!assessmentId || isStarting ? (
              <Card title="검사 준비 중" description="문항을 불러오고 있습니다. 잠시만 기다려주세요.">
                <Button type="button" variant="secondary" onClick={() => router.push("/onboarding")} disabled={isStarting}>
                  온보딩으로 돌아가기
                </Button>
              </Card>
            ) : (
              <div className="ms-stack">
                <Card title="진행 현황" description={`진행 ${answeredCount}/${totalRequiredCount}`}>
                  {!canComplete ? (
                    <Banner
                      variant="warning"
                      title="응답이 더 필요합니다"
                      description={`아직 ${remainingCount}개 문항이 남아 있습니다. 모든 문항에 답하면 결과를 저장할 수 있습니다.`}
                    />
                  ) : (
                    <Banner
                      variant="success"
                      title="모든 문항 응답 완료"
                      description="검사 완료 버튼을 누르면 baseline 저장 후 홈으로 이동합니다."
                    />
                  )}
                </Card>

                {ASSESSMENT_SECTIONS.map((section) => (
                  <Card key={section.key} title={section.title} description={section.description}>
                    <div className="ms-stack">
                      {section.questions.map((question) => (
                        <QuestionBlock
                          key={question.code}
                          question={question}
                          selectedScore={answers[question.code]}
                          onSelect={setAnswer}
                        />
                      ))}
                    </div>
                  </Card>
                ))}

                <Button type="button" onClick={handleCompleteAssessment} loading={isSubmitting}>
                  검사 완료하고 온보딩 마치기
                </Button>
              </div>
            )}
          </SectionContainer>
        </CenteredFormContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
