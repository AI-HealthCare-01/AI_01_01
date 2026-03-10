"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

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
  Tag,
} from "../../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../../src/features/auth";
import {
  CoreApiError,
  getChallengeCatalogDetail,
  type ChallengeCatalogDetail,
} from "../../../src/features/core-inputs";

const DOMAIN_LABEL: Record<string, string> = {
  sleep: "잠 편안하게",
  activation: "활기차게",
  regulation: "마음 편안하게",
  social: "함께하기",
  wellbeing: "나를 돌보기",
};
const SOCIAL_MAP_CHALLENGE_ID = "CH_SOC_001";
const SUNLIGHT_CHALLENGE_ID = "CH_ACT_002";
const CONFIDENCE_CHALLENGE_ID = "CH_WELL_001";

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

export default function ChallengeDetailPage() {
  const router = useRouter();
  const params = useParams<{ challengeId: string }>();
  const challengeId = Array.isArray(params.challengeId) ? params.challengeId[0] : params.challengeId;
  const { firebaseUser } = useAuthContext();

  const [detail, setDetail] = useState<ChallengeCatalogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!firebaseUser || !challengeId) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const response = await getChallengeCatalogDetail(firebaseUser, challengeId);
      setDetail(response);
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

  useEffect(() => {
    if (!detail?.active_enrollment) {
      return;
    }
    router.replace(`/challenge/session/${detail.active_enrollment.enrollment_id}/progress`);
  }, [detail, router]);

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
            description="프로그램 안내를 확인하고 시작 설정으로 이동하세요."
            action={
              <div className="ms-row">
                {detail ? <Tag variant="info">{DOMAIN_LABEL[detail.challenge.domain] ?? detail.challenge.domain}</Tag> : null}
                <Link href="/challenge" className="ms-inline-link">
                  카탈로그로 돌아가기
                </Link>
              </div>
            }
          >
            {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

            {loading ? (
              <Card>
                <LoadingSkeleton lines={6} />
              </Card>
            ) : errorMessage ? (
              <ErrorState
                title="챌린지 정보를 불러오지 못했습니다"
                description="잠시 후 다시 시도해 주세요."
                retryAction={<Button onClick={() => void load()}>다시 시도</Button>}
              />
            ) : !detail ? (
              <EmptyState title="챌린지를 찾을 수 없습니다" description="카탈로그에서 다시 선택해주세요." />
            ) : (
              <>
                <Card title="프로그램 안내" description={detail.challenge.summary_ko}>
                  <div className="ms-row">
                    <Tag variant="brand">목표 기간 {detail.challenge.default_target_days}일</Tag>
                    <Tag variant="neutral">{detail.challenge.program_type}</Tag>
                    <Tag variant="brand">{detail.session_status}</Tag>
                  </div>

                  {detail.recommendation?.reason_copy_ko ? (
                    <Banner variant="info" title="추천 이유" description={detail.recommendation.reason_copy_ko} />
                  ) : null}

                  {detail.challenge.challenge_id === SOCIAL_MAP_CHALLENGE_ID ? (
                    <Card title="활동 소개">
                      <div className="ms-social-intro__hero">
                        <span className="ms-social-intro__icon" aria-hidden="true">
                          🗺️
                        </span>
                        <p className="ms-social-intro__title">내 주변 관계를 한눈에 정리해보세요</p>
                      </div>
                      <p className="ms-card__desc">
                        가까운 사람부터 먼 지인까지, 내 삶에 영향을 주는 관계를 시각적으로 배치하고 핵심 지지자를
                        찾아보는 활동입니다. 관계 지도를 그리며 지금 내게 필요한 연결이 무엇인지 발견할 수 있어요.
                      </p>
                      <div className="ms-social-intro__meta">
                        <p className="ms-social-intro__meta-row">⏱ 예상 시간: 15~20분</p>
                        <p className="ms-social-intro__meta-row">📅 권장 기간: 2~4일</p>
                        <p className="ms-social-intro__meta-row">🧠 효과: 관계 명료화 · 지지 자원 파악</p>
                      </div>
                    </Card>
                  ) : detail.challenge.challenge_id === SUNLIGHT_CHALLENGE_ID ? (
                    <Card title="활동 소개">
                      <div className="ms-social-intro__hero">
                        <span className="ms-social-intro__icon" aria-hidden="true">
                          ☀️
                        </span>
                        <p className="ms-social-intro__title">하루 10분, 햇빛을 느껴보세요</p>
                      </div>
                      <p className="ms-card__desc">
                        자연광은 기분과 에너지에 직접적인 영향을 줍니다. 날씨가 흐려도 괜찮아요. 창가 햇빛만으로도 충분한 효과를 얻을 수 있어요.
                      </p>
                      <div className="ms-social-intro__meta">
                        <p className="ms-social-intro__meta-row">⏱ 10분</p>
                        <p className="ms-social-intro__meta-row">📅 2~3일</p>
                        <p className="ms-social-intro__meta-row">☀️ 기분 전환</p>
                      </div>
                    </Card>
                  ) : detail.challenge.challenge_id === CONFIDENCE_CHALLENGE_ID ? (
                    <Card title="활동 소개">
                      <div className="ms-social-intro__hero">
                        <span className="ms-social-intro__icon" aria-hidden="true">
                          ✨
                        </span>
                        <p className="ms-social-intro__title">나도 몰랐던 내 강점을 발견해보세요</p>
                      </div>
                      <p className="ms-card__desc">
                        자신감은 거창한 성공이 아니라 일상의 작은 순간에서 나와요. 몇 가지 질문에 답하다 보면 나만의 강점이 보이기 시작할 거예요.
                      </p>
                      <div className="ms-social-intro__meta">
                        <p className="ms-social-intro__meta-row">⏱ 10분</p>
                        <p className="ms-social-intro__meta-row">📅 2일</p>
                        <p className="ms-social-intro__meta-row">💡 강점 발견</p>
                      </div>
                      <div className="ms-social-intro__meta" style={{ marginTop: 8 }}>
                        <p className="ms-social-intro__meta-row">Day 1 — 강점 탐색 (S1 + S2)</p>
                        <p className="ms-social-intro__meta-row">Day 2 — 강점 정리 (S3 + S4)</p>
                      </div>
                    </Card>
                  ) : (
                    <Card title="실행 단계" description="시작 설정 후 아래 순서로 진행됩니다.">
                      <div className="ms-stack">
                        {detail.template_steps.length > 0 ? (
                          detail.template_steps.map((step, index) => (
                            <p key={`${step}-${index}`} className="ms-card__desc">
                              {index + 1}. {step}
                            </p>
                          ))
                        ) : (
                          <p className="ms-card__desc">기본 실행 단계를 불러오는 중입니다.</p>
                        )}
                      </div>
                    </Card>
                  )}

                  <div className="ms-row">
                    {detail.active_enrollment ? (
                      <Button onClick={() => router.push(`/challenge/session/${detail.active_enrollment?.enrollment_id}/progress`)}>
                        진행 현황 보기
                      </Button>
                    ) : (
                      <Button onClick={() => router.push(`/challenge/${detail.challenge.challenge_id}/enroll`)}>
                        시작 설정
                      </Button>
                    )}
                    <Button variant="secondary" onClick={() => router.push("/challenge")}>다른 챌린지 보기</Button>
                  </div>
                </Card>
              </>
            )}
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
