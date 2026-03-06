"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  StatCard,
  Tag,
  Textarea,
} from "../../../../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../../../../src/features/auth";
import {
  completeChallengeEnrollment,
  CoreApiError,
  executeChallengeDay,
  getChallengeEnrollmentDetail,
  saveChallengeReflection,
  updateChallengeEnrollment,
  type ChallengeEnrollmentDetail,
  type ChallengeProgramType,
} from "../../../../../src/features/core-inputs";

type ExecutionMode = "external" | "timer" | "text";

const EXTERNAL_EXECUTION_IDS = new Set(["CH_SLEEP_001", "CH_ACT_001", "CH_ACT_002", "CH_ACT_003"]);
const TIMER_EXECUTION_IDS = new Set(["CH_REG_001", "CH_REG_002"]);
const TEXT_EXECUTION_IDS = new Set(["CH_SOC_001", "CH_WELL_001"]);

function todayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseError(error: unknown): string {
  if (error instanceof CoreApiError) {
    if (error.message === "enrollment_not_active") {
      return "현재 세션이 일시중지 또는 종료 상태입니다. 진행 현황에서 상태를 확인해주세요.";
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
    return error.message;
  }
  return "알 수 없는 오류가 발생했습니다.";
}

function resolveExecutionMode(challengeId: string, programType: ChallengeProgramType): ExecutionMode {
  if (EXTERNAL_EXECUTION_IDS.has(challengeId)) {
    return "external";
  }
  if (TIMER_EXECUTION_IDS.has(challengeId)) {
    return "timer";
  }
  if (TEXT_EXECUTION_IDS.has(challengeId)) {
    return "text";
  }
  if (programType === "guided_reflection" || programType === "one_time") {
    return "text";
  }
  return "external";
}

function defaultTimerSeconds(challengeId: string): number {
  if (challengeId === "CH_REG_001") {
    return 180;
  }
  if (challengeId === "CH_REG_002") {
    return 300;
  }
  return 180;
}

function clampScore(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export default function ChallengeProgressPage() {
  const { firebaseUser } = useAuthContext();
  const router = useRouter();
  const params = useParams<{ enrollmentId: string }>();
  const enrollmentId = Array.isArray(params.enrollmentId) ? params.enrollmentId[0] : params.enrollmentId;
  const executeCardRef = useRef<HTMLDivElement | null>(null);

  const [detail, setDetail] = useState<ChallengeEnrollmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [savingDailyRun, setSavingDailyRun] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [targetDate, setTargetDate] = useState(todayString());
  const [preMood, setPreMood] = useState(3);
  const [preAnxiety, setPreAnxiety] = useState(3);
  const [postMood, setPostMood] = useState(3);
  const [postAnxiety, setPostAnxiety] = useState(3);
  const [helpfulness, setHelpfulness] = useState(7);
  const [effort, setEffort] = useState(6);
  const [reflectionNote, setReflectionNote] = useState("");

  const [executionChecks, setExecutionChecks] = useState<boolean[]>([]);
  const [activityNotes, setActivityNotes] = useState<string[]>([]);
  const [executionText, setExecutionText] = useState("");
  const [timerSecondsTotal, setTimerSecondsTotal] = useState(180);
  const [timerSecondsRemaining, setTimerSecondsRemaining] = useState(180);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerCompleted, setTimerCompleted] = useState(false);

  const load = useCallback(async () => {
    if (!firebaseUser || !enrollmentId) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const response = await getChallengeEnrollmentDetail(firebaseUser, enrollmentId);
      setDetail(response);
    } catch (error) {
      setErrorMessage(parseError(error));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [enrollmentId, firebaseUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const progressPct = useMemo(() => {
    if (!detail) {
      return 0;
    }
    return Math.round(detail.progress_ratio * 100);
  }, [detail]);

  const executionMode = useMemo<ExecutionMode>(() => {
    if (!detail) {
      return "external";
    }
    return resolveExecutionMode(detail.challenge.challenge_id, detail.enrollment.program_type);
  }, [detail]);

  const todayProgress = useMemo(() => {
    if (!detail) {
      return null;
    }
    return detail.progress_days.find((day) => day.date === todayString()) ?? null;
  }, [detail]);

  const todayCompleted = useMemo(() => {
    if (!todayProgress) {
      return false;
    }
    return todayProgress.completed_flag || todayProgress.day_status === "done" || todayProgress.day_status === "late";
  }, [todayProgress]);

  useEffect(() => {
    if (!detail) {
      return;
    }

    const today = todayString();
    const initialDate =
      detail.enrollment.scheduled_start_date <= today ? today : detail.enrollment.scheduled_start_date;
    setTargetDate(initialDate);
    setExecutionChecks(new Array(detail.template_steps.length).fill(false));
    setActivityNotes(new Array(Math.max(1, detail.template_steps.length)).fill(""));
    setExecutionText("");

    const timerDefault = defaultTimerSeconds(detail.challenge.challenge_id);
    setTimerSecondsTotal(timerDefault);
    setTimerSecondsRemaining(timerDefault);
    setTimerRunning(false);
    setTimerCompleted(false);

    if (todayProgress?.detail) {
      setPreMood(todayProgress.detail.pre_mood_1_5 ?? 3);
      setPreAnxiety(todayProgress.detail.pre_anxiety_1_5 ?? 3);
      setPostMood(todayProgress.detail.post_mood_1_5 ?? 3);
      setPostAnxiety(todayProgress.detail.post_anxiety_1_5 ?? 3);
      setHelpfulness(todayProgress.detail.helpfulness_0_10 ?? 7);
      setEffort(todayProgress.detail.effort_0_10 ?? 6);
      setReflectionNote(todayProgress.detail.reflection_note ?? "");
    } else {
      setPreMood(3);
      setPreAnxiety(3);
      setPostMood(3);
      setPostAnxiety(3);
      setHelpfulness(7);
      setEffort(6);
      setReflectionNote("");
    }
  }, [detail, todayProgress]);

  useEffect(() => {
    if (!timerRunning) {
      return;
    }

    const timer = window.setInterval(() => {
      setTimerSecondsRemaining((previous) => {
        if (previous <= 1) {
          window.clearInterval(timer);
          setTimerRunning(false);
          setTimerCompleted(true);
          return 0;
        }
        return previous - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [timerRunning]);

  const togglePause = async () => {
    if (!firebaseUser || !detail || working) {
      return;
    }

    try {
      setWorking(true);
      setErrorMessage(null);
      setNotice(null);
      const next = detail.enrollment.status === "paused" ? "active" : "paused";
      await updateChallengeEnrollment(firebaseUser, enrollmentId, next);
      await load();
      setNotice(next === "paused" ? "챌린지를 일시중지했습니다." : "챌린지를 재개했습니다.");
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setWorking(false);
    }
  };

  const onDrop = async () => {
    if (!firebaseUser || !detail || working) {
      return;
    }

    const confirmed = window.confirm("이 챌린지를 중단하시겠습니까?");
    if (!confirmed) {
      return;
    }

    try {
      setWorking(true);
      setErrorMessage(null);
      setNotice(null);
      await updateChallengeEnrollment(firebaseUser, enrollmentId, "dropped", {
        dropout_reason_code: "user_stopped",
      });
      router.replace("/challenge");
      return;
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setWorking(false);
    }
  };

  const onComplete = async () => {
    if (!firebaseUser || working) {
      return;
    }

    try {
      setWorking(true);
      setErrorMessage(null);
      setNotice(null);
      await completeChallengeEnrollment(firebaseUser, enrollmentId);
      router.replace(`/challenge/session/${enrollmentId}/complete`);
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setWorking(false);
    }
  };

  const onSkipToday = async () => {
    if (!firebaseUser || !detail || working || detail.enrollment.status !== "active") {
      return;
    }

    const skipDate = todayString();

    try {
      setWorking(true);
      setErrorMessage(null);
      setNotice(null);
      setTargetDate(skipDate);

      await executeChallengeDay(firebaseUser, enrollmentId, {
        date: skipDate,
        pre_mood_1_5: preMood,
        pre_anxiety_1_5: preAnxiety,
        day_status: "skipped",
        skipped_reason_code: "user_skipped",
      });

      await saveChallengeReflection(firebaseUser, enrollmentId, {
        date: skipDate,
        result_status: "skipped",
        post_mood_1_5: postMood,
        post_anxiety_1_5: postAnxiety,
        helpfulness_0_10: helpfulness,
        effort_0_10: effort,
        reflection_note: reflectionNote.trim() || "오늘 실행 건너뜀",
        skipped_reason_code: "user_skipped",
      });

      const updated = await getChallengeEnrollmentDetail(firebaseUser, enrollmentId);
      setDetail(updated);
      setNotice("오늘 챌린지를 건너뛰기로 저장했습니다.");
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setWorking(false);
    }
  };

  const onSaveDailyRun = async () => {
    if (!firebaseUser || !detail || savingDailyRun || detail.enrollment.status !== "active") {
      return;
    }

    if (executionMode === "external") {
      if (executionChecks.length > 0 && executionChecks.some((checked) => !checked)) {
        setErrorMessage("챌린지 실행 단계의 체크 항목을 모두 완료해 주세요.");
        return;
      }
    }
    if (executionMode === "timer" && !timerCompleted) {
      setErrorMessage("타이머를 완료한 뒤 저장해 주세요.");
      return;
    }
    if (executionMode === "text" && !executionText.trim()) {
      setErrorMessage("챌린지 실행 내용을 입력해 주세요.");
      return;
    }

    try {
      setSavingDailyRun(true);
      setErrorMessage(null);
      setNotice(null);

      await executeChallengeDay(firebaseUser, enrollmentId, {
        date: targetDate,
        pre_mood_1_5: preMood,
        pre_anxiety_1_5: preAnxiety,
        day_status: "pending",
      });

      const notes: string[] = [];
      if (executionMode === "external" && detail.template_steps.length > 0) {
        notes.push(`실행체크: ${detail.template_steps.join(", ")}`);
      } else if (executionMode === "timer") {
        notes.push(`타이머 완료: ${Math.round(timerSecondsTotal / 60)}분`);
      } else if (executionMode === "text" && executionText.trim()) {
        notes.push(`실행기록: ${executionText.trim()}`);
      }

      const detailNotes = activityNotes
        .map((value, index) => {
          const text = value.trim();
          if (!text) {
            return null;
          }
          const stepLabel = detail.template_steps[index] ?? `세부 ${index + 1}`;
          return `${stepLabel}: ${text}`;
        })
        .filter((value): value is string => value !== null);
      if (detailNotes.length > 0) {
        notes.push(...detailNotes);
      }

      if (reflectionNote.trim()) {
        notes.push(reflectionNote.trim());
      }

      await saveChallengeReflection(firebaseUser, enrollmentId, {
        date: targetDate,
        result_status: "done",
        post_mood_1_5: postMood,
        post_anxiety_1_5: postAnxiety,
        helpfulness_0_10: helpfulness,
        effort_0_10: effort,
        reflection_note: notes.join("\n"),
      });

      const updated = await getChallengeEnrollmentDetail(firebaseUser, enrollmentId);
      setDetail(updated);

      if (targetDate === todayString()) {
        setNotice(`오늘의 ${updated.challenge.name_ko} 완료`);
      } else {
        setNotice("챌린지 실행과 회고를 저장했습니다.");
      }

      if (updated.done_days >= updated.enrollment.target_days && updated.enrollment.status === "active") {
        setNotice("목표 일수를 모두 채웠습니다. 완료 처리 버튼으로 마무리할 수 있습니다.");
      }
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setSavingDailyRun(false);
    }
  };

  const goToExecuteBox = (date: string) => {
    setTargetDate(date);
    executeCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const timerMinutes = Math.max(1, Math.round(timerSecondsTotal / 60));
  const timerDisplayMin = String(Math.floor(timerSecondsRemaining / 60)).padStart(2, "0");
  const timerDisplaySec = String(timerSecondsRemaining % 60).padStart(2, "0");
  const activityDetailItems = detail && detail.template_steps.length > 0 ? detail.template_steps : ["활동 세부 내용"];

  return (
    <AuthRouteGuard policy="require-active">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">{detail?.challenge.name_ko ?? "챌린지"}</Badge>
          </div>
        }
      >
        <PageContainer size="lg">
          <SectionContainer
            title={detail?.challenge.name_ko ?? "챌린지"}
            action={
              <div className="ms-row">
                {detail ? (
                  <p className="ms-card__desc">
                    기간 {detail.enrollment.scheduled_start_date} ~ {detail.enrollment.scheduled_end_date}
                  </p>
                ) : null}
                <Button size="sm" variant="secondary" onClick={() => void load()}>
                  새로고침
                </Button>
              </div>
            }
          >
            {notice ? <Banner variant="success" title="안내" description={notice} /> : null}
            {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

            {loading ? (
              <Card>
                <LoadingSkeleton lines={8} />
              </Card>
            ) : !detail ? (
              <ErrorState
                title="진행 현황을 불러오지 못했습니다"
                description="잠시 후 다시 시도해주세요."
                retryAction={<Button onClick={() => void load()}>다시 시도</Button>}
              />
            ) : (
              <>
                <div className="ms-grid ms-grid--three">
                  <StatCard
                    label="진행률"
                    value={`${progressPct}%`}
                    helperText={`${detail.done_days}/${detail.enrollment.target_days}일 완료`}
                  />
                  <StatCard
                    label="남은 일수"
                    value={`${detail.remaining_days}일`}
                    helperText={`상태 ${detail.enrollment.status}`}
                  />
                  <Card title="세션 제어" description="진행 중인 챌린지 상태를 조정합니다.">
                    <div className="ms-row">
                      {detail.enrollment.status === "active" ? (
                        <>
                          <Button variant="ghost" onClick={() => void onSkipToday()} loading={working}>
                            오늘 건너뛰기
                          </Button>
                          <Button variant="secondary" onClick={() => void togglePause()} loading={working}>
                            일시중지
                          </Button>
                          <Button variant="danger" onClick={() => void onDrop()} disabled={working}>
                            중단
                          </Button>
                        </>
                      ) : detail.enrollment.status === "paused" ? (
                        <>
                          <Button onClick={() => void togglePause()} loading={working}>
                            재개
                          </Button>
                          <Button variant="danger" onClick={() => void onDrop()} disabled={working}>
                            중단
                          </Button>
                        </>
                      ) : (
                        <Button variant="danger" onClick={() => void onDrop()} disabled={working || detail.enrollment.status === "completed"}>
                          중단
                        </Button>
                      )}
                    </div>
                    {detail.enrollment.status === "active" && detail.done_days >= detail.enrollment.target_days ? (
                      <Button size="sm" variant="soft" onClick={() => void onComplete()} loading={working}>
                        완료 처리
                      </Button>
                    ) : null}
                  </Card>
                </div>

                <div ref={executeCardRef}>
                  {todayCompleted && detail.enrollment.status === "active" ? (
                    <Card title={`오늘의 ${detail.challenge.name_ko} 완료`} description="오늘 실행과 회고가 이미 저장되었습니다.">
                      <p className="ms-card__desc">내일 다시 실행하거나 다른 날짜 회고를 수정할 수 있습니다.</p>
                    </Card>
                  ) : (
                    <Card title="오늘의 챌린지 수행">
                      <div className="ms-challenge-exec-flow">
                        <Card title="사전 체크">
                          <div className="ms-grid ms-grid--two">
                            <Input
                              label="날짜"
                              type="date"
                              value={targetDate}
                              min={detail.enrollment.scheduled_start_date}
                              max={detail.enrollment.scheduled_end_date}
                              onChange={(event) => setTargetDate(event.target.value)}
                            />
                            <Input
                              label="실행 전 기분(1~5)"
                              type="number"
                              min={1}
                              max={5}
                              value={preMood}
                              onChange={(event) => setPreMood(clampScore(Number(event.target.value) || 1, 1, 5))}
                            />
                            <Input
                              label="실행 전 불안(1~5)"
                              type="number"
                              min={1}
                              max={5}
                              value={preAnxiety}
                              onChange={(event) => setPreAnxiety(clampScore(Number(event.target.value) || 1, 1, 5))}
                            />
                          </div>
                        </Card>

                        <Card title="활동">
                          <div className="ms-stack">
                            {activityDetailItems.map((step, index) => (
                              <div key={`${step}-${index}`} className="ms-stack">
                                <p className="ms-card__desc">
                                  {index + 1}. {step}
                                </p>
                                <Input
                                  label={`세부 내용 ${index + 1}`}
                                  value={activityNotes[index] ?? ""}
                                  onChange={(event) =>
                                    setActivityNotes((previous) => {
                                      const next = [...previous];
                                      next[index] = event.target.value;
                                      return next;
                                    })
                                  }
                                  placeholder="실행한 내용을 간단히 입력해 주세요."
                                />
                              </div>
                            ))}
                          </div>
                          {executionMode === "external" ? (
                            <div className="ms-stack">
                              {(detail.template_steps.length > 0 ? detail.template_steps : ["실행 완료 확인"]).map((step, index) => (
                                <label key={`${step}-${index}`} className="ms-check-row" htmlFor={`challenge-step-${index}`}>
                                  <input
                                    id={`challenge-step-${index}`}
                                    type="checkbox"
                                    checked={executionChecks[index] ?? false}
                                    onChange={(event) =>
                                      setExecutionChecks((previous) => {
                                        const next = [...previous];
                                        next[index] = event.target.checked;
                                        return next;
                                      })
                                    }
                                  />
                                  {step}
                                </label>
                              ))}
                            </div>
                          ) : executionMode === "timer" ? (
                            <div className="ms-stack">
                              <Input
                                label="타이머(분)"
                                type="number"
                                min={1}
                                max={30}
                                value={timerMinutes}
                                onChange={(event) => {
                                  const minutes = clampScore(Number(event.target.value) || 1, 1, 30);
                                  const seconds = minutes * 60;
                                  setTimerSecondsTotal(seconds);
                                  setTimerSecondsRemaining(seconds);
                                  setTimerCompleted(false);
                                  setTimerRunning(false);
                                }}
                              />
                              <p className="ms-card__title">
                                {timerDisplayMin}:{timerDisplaySec}
                              </p>
                              <div className="ms-row">
                                {!timerRunning ? (
                                  <Button size="sm" onClick={() => setTimerRunning(true)} disabled={timerSecondsRemaining <= 0}>
                                    타이머 시작
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="secondary" onClick={() => setTimerRunning(false)}>
                                    일시정지
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setTimerRunning(false);
                                    setTimerSecondsRemaining(timerSecondsTotal);
                                    setTimerCompleted(false);
                                  }}
                                >
                                  초기화
                                </Button>
                                {timerCompleted ? <Badge variant="success">타이머 완료</Badge> : null}
                              </div>
                            </div>
                          ) : (
                            <Textarea
                              label="실행 내용 작성"
                              value={executionText}
                              onChange={(event) => setExecutionText(event.target.value)}
                              placeholder="챌린지 실행 내용을 기록해 주세요."
                            />
                          )}
                        </Card>

                        <Card title="회고">
                          <div className="ms-grid ms-grid--two">
                            <Input
                              label="실행 후 기분(1~5)"
                              type="number"
                              min={1}
                              max={5}
                              value={postMood}
                              onChange={(event) => setPostMood(clampScore(Number(event.target.value) || 1, 1, 5))}
                            />
                            <Input
                              label="실행 후 불안(1~5)"
                              type="number"
                              min={1}
                              max={5}
                              value={postAnxiety}
                              onChange={(event) => setPostAnxiety(clampScore(Number(event.target.value) || 1, 1, 5))}
                            />
                            <Input
                              label="도움 정도(0~10)"
                              type="number"
                              min={0}
                              max={10}
                              value={helpfulness}
                              onChange={(event) => setHelpfulness(clampScore(Number(event.target.value) || 0, 0, 10))}
                            />
                            <Input
                              label="노력 정도(0~10)"
                              type="number"
                              min={0}
                              max={10}
                              value={effort}
                              onChange={(event) => setEffort(clampScore(Number(event.target.value) || 0, 0, 10))}
                            />
                          </div>
                          <Textarea
                            label="회고 메모(선택)"
                            value={reflectionNote}
                            onChange={(event) => setReflectionNote(event.target.value)}
                            placeholder="오늘 실행에서 느낀 점을 간단히 기록해보세요."
                          />
                        </Card>

                        <div className="ms-row">
                          <Button onClick={() => void onSaveDailyRun()} loading={savingDailyRun} disabled={detail.enrollment.status !== "active"}>
                            오늘 수행 저장
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )}
                </div>

                <Card title="일별 진행 타임라인" description="pending / done / skipped / late / missed 상태를 표시합니다.">
                  {detail.progress_days.length === 0 ? (
                    <EmptyState title="진행 데이터가 없습니다" description="실행을 시작하면 날짜별 로그가 표시됩니다." />
                  ) : (
                    <div className="ms-grid ms-grid--two">
                      {detail.progress_days.map((day) => (
                        <Card
                          key={day.date}
                          title={`${day.day_number}일차 · ${day.date}`}
                          description={day.detail?.reflection_note || "회고 메모 없음"}
                          action={<Tag variant={day.completed_flag ? "success" : "neutral"}>{day.day_status}</Tag>}
                        >
                          <div className="ms-stack">
                            <p className="ms-card__desc">
                              도움 {day.detail?.helpfulness_0_10 ?? "-"} / 노력 {day.detail?.effort_0_10 ?? "-"}
                            </p>
                            <p className="ms-card__desc">
                              전후 기분 {day.detail?.pre_mood_1_5 ?? "-"} → {day.detail?.post_mood_1_5 ?? "-"}
                            </p>
                            <p className="ms-card__desc">
                              전후 불안 {day.detail?.pre_anxiety_1_5 ?? "-"} → {day.detail?.post_anxiety_1_5 ?? "-"}
                            </p>
                          </div>
                          {detail.enrollment.status === "active" ? (
                            <div className="ms-row">
                              <Button size="sm" variant="secondary" onClick={() => goToExecuteBox(day.date)}>
                                이 날짜 수정
                              </Button>
                            </div>
                          ) : null}
                        </Card>
                      ))}
                    </div>
                  )}
                </Card>
              </>
            )}
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
