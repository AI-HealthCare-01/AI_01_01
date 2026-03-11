"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  ErrorState,
  Input,
  LoadingSkeleton,
  PageContainer,
  SectionContainer,
  Textarea,
} from "../../../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../../../src/features/auth";
import {
  createChallengeEnrollment,
  CoreApiError,
  getChallengeCatalogDetail,
  logChallengeExposure,
  type ChallengeCatalogDetail,
} from "../../../../src/features/core-inputs";

function parseError(error: unknown): string {
  if (error instanceof CoreApiError) {
    if (error.message === "active_sustained_limit_reached") {
      return "지속형 챌린지는 동시에 최대 3개까지 활성화할 수 있습니다.";
    }
    if (error.message === "active_domain_duplicate") {
      return "같은 도메인의 지속형 챌린지는 동시에 2개 이상 활성화할 수 없습니다.";
    }
    if (error.message === "Failed to fetch") {
      return "서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.";
    }
    return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "알 수 없는 오류가 발생했습니다.";
}

function todayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const SOCIAL_MAP_CHALLENGE_ID = "CH_SOC_001";
const SUNLIGHT_CHALLENGE_ID = "CH_ACT_002";
const CONFIDENCE_CHALLENGE_ID = "CH_WELL_001";

function socialMapDurationHint(days: number): string {
  if (days === 2) {
    return "핵심 관계 중심으로 빠르게 정리해요";
  }
  if (days === 3) {
    return "여유 있게 관계를 탐색할 수 있어요";
  }
  return "깊이 있는 관계 기록까지 완성해보세요";
}

function sunlightDurationHint(days: number): string {
  return days === 2 ? "집중적으로 햇빛 효과를 경험해보세요" : "하루씩 천천히 햇빛 습관을 만들어요";
}

export default function ChallengeEnrollSetupPage() {
  const { firebaseUser } = useAuthContext();
  const router = useRouter();
  const params = useParams<{ challengeId: string }>();
  const challengeId = Array.isArray(params.challengeId) ? params.challengeId[0] : params.challengeId;

  const [detail, setDetail] = useState<ChallengeCatalogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [startDate, setStartDate] = useState(todayString());
  const [targetDays, setTargetDays] = useState(7);
  const [reminderTime, setReminderTime] = useState("08:00");
  const [motivation, setMotivation] = useState("");

  const load = useCallback(async () => {
    if (!firebaseUser || !challengeId) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const data = await getChallengeCatalogDetail(firebaseUser, challengeId);
      setDetail(data);
      setTargetDays(data.challenge.default_target_days);
    } catch (error) {
      setErrorMessage(parseError(error));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [challengeId, firebaseUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const onStart = async () => {
    if (!firebaseUser || !detail || saving) {
      return;
    }

    try {
      setSaving(true);
      setErrorMessage(null);

      const enrollment = await createChallengeEnrollment(firebaseUser, {
        challenge_id: detail.challenge.challenge_id,
        start_date: startDate,
        target_days:
          detail.challenge.challenge_id === SOCIAL_MAP_CHALLENGE_ID
            ? Math.max(2, Math.min(4, targetDays))
            : detail.challenge.challenge_id === SUNLIGHT_CHALLENGE_ID
              ? Math.max(2, Math.min(3, targetDays))
              : detail.challenge.challenge_id === CONFIDENCE_CHALLENGE_ID
                ? 2
            : targetDays,
        reminder_time_local: reminderTime,
        motivation_note: motivation.trim() || undefined,
      });

      await logChallengeExposure(firebaseUser, {
        challenge_id: detail.challenge.challenge_id,
        exposure_type: "browse",
        response_type: "accepted",
      }).catch(() => undefined);

      router.replace(`/challenge/session/${enrollment.enrollment_id}/progress`);
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthRouteGuard policy="require-active">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">시작 설정</Badge>
          </div>
        }
      >
        <PageContainer size="md">
          <SectionContainer title="챌린지 시작 설정" description="목표 기간과 시작일을 정한 뒤 프로그램을 시작합니다.">
            {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

            {loading ? (
              <Card>
                <LoadingSkeleton lines={8} />
              </Card>
            ) : !detail ? (
              <ErrorState
                title="챌린지 정보를 불러오지 못했습니다"
                description="잠시 후 다시 시도해주세요."
                retryAction={<Button onClick={() => void load()}>다시 시도</Button>}
              />
            ) : (
              <>
                <Card title={detail.challenge.name_ko} description={detail.challenge.summary_ko}>
                  <div className="ms-row">
                    <Badge variant="info">{detail.challenge.domain}</Badge>
                    <Badge variant="neutral">{detail.challenge.program_type}</Badge>
                    <Badge variant="neutral">기본 {detail.challenge.default_target_days}일</Badge>
                  </div>

                  {detail.active_enrollment ? (
                    <Banner
                      variant="info"
                      title="이미 진행 중인 세션이 있습니다"
                      description="진행 현황 화면으로 이동해 이어서 수행하거나 상태를 변경할 수 있습니다."
                    />
                  ) : null}
                </Card>

                <Card title="프로그램 설정">
                  {detail.challenge.challenge_id === SOCIAL_MAP_CHALLENGE_ID ? (
                    <div className="ms-social-setup">
                      <p className="ms-card__desc">활동을 며칠 동안 진행할까요?</p>
                      <div className="ms-social-setup__days">
                        {[2, 3, 4].map((day) => (
                          <button
                            key={day}
                            type="button"
                            className={`ms-social-setup__day-btn ${targetDays === day ? "active" : ""}`}
                            onClick={() => setTargetDays(day)}
                          >
                            {day}일
                          </button>
                        ))}
                      </div>
                      <p className="ms-social-setup__hint">{socialMapDurationHint(targetDays)}</p>
                    </div>
                  ) : detail.challenge.challenge_id === SUNLIGHT_CHALLENGE_ID ? (
                    <div className="ms-social-setup">
                      <p className="ms-card__desc">활동을 며칠 동안 진행할까요?</p>
                      <div className="ms-social-setup__days">
                        {[2, 3].map((day) => (
                          <button
                            key={day}
                            type="button"
                            className={`ms-social-setup__day-btn ${targetDays === day ? "active" : ""}`}
                            onClick={() => setTargetDays(day)}
                          >
                            {day}일
                          </button>
                        ))}
                      </div>
                      <p className="ms-social-setup__hint">{sunlightDurationHint(targetDays)}</p>
                    </div>
                  ) : detail.challenge.challenge_id === CONFIDENCE_CHALLENGE_ID ? (
                    <div className="ms-social-setup">
                      <p className="ms-card__desc">2일 고정 프로그램</p>
                      <p className="ms-social-setup__hint">Day1: 성취 탐색 (사전 체크 + 성취 입력 + 태그)</p>
                      <p className="ms-social-setup__hint">Day2: 강점 정리 (핵심 선택 + 문장 + 계획 + 사후 체크)</p>
                    </div>
                  ) : (
                    <div className="ms-grid ms-grid--two">
                      <Input label="시작일" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                      <Input
                        label="목표 일수"
                        type="number"
                        min={1}
                        max={28}
                        value={targetDays}
                        onChange={(event) => setTargetDays(Math.max(1, Math.min(28, Number(event.target.value) || 1)))}
                      />
                      <Input
                        label="리마인드 시간"
                        type="time"
                        value={reminderTime}
                        onChange={(event) => setReminderTime(event.target.value)}
                      />
                      <Textarea
                        label="시작 이유(선택)"
                        value={motivation}
                        onChange={(event) => setMotivation(event.target.value)}
                        placeholder="이번 챌린지를 시작하려는 이유를 간단히 적어보세요."
                      />
                    </div>
                  )}
                </Card>

                {detail.challenge.challenge_id === SOCIAL_MAP_CHALLENGE_ID ? null : (
                  <Card title="실행 단계">
                    <div className="ms-stack">
                      {detail.template_steps.map((step, index) => (
                        <p key={`${step}-${index}`} className="ms-card__desc">
                          {index + 1}. {step}
                        </p>
                      ))}
                    </div>
                  </Card>
                )}

                <div className="ms-row">
                  {detail.active_enrollment ? (
                    <Button onClick={() => router.push(`/challenge/session/${detail.active_enrollment?.enrollment_id}/progress`)}>
                      진행 현황으로 이동
                    </Button>
                  ) : (
                    <Button onClick={() => void onStart()} loading={saving}>
                      프로그램 시작
                    </Button>
                  )}
                  <Button variant="secondary" onClick={() => router.push(`/challenge/${detail.challenge.challenge_id}`)}>
                    상세로 돌아가기
                  </Button>
                </div>
              </>
            )}
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
