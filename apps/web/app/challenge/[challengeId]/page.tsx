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
