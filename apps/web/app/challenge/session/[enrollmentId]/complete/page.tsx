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
  LoadingSkeleton,
  PageContainer,
  SectionContainer,
  StatCard,
} from "../../../../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../../../../src/features/auth";
import {
  completeChallengeEnrollment,
  CoreApiError,
  getChallengeEnrollmentDetail,
  type ChallengeEnrollmentDetail,
} from "../../../../../src/features/core-inputs";

function parseError(error: unknown): string {
  if (error instanceof CoreApiError) {
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

export default function ChallengeCompletePage() {
  const { firebaseUser } = useAuthContext();
  const router = useRouter();
  const params = useParams<{ enrollmentId: string }>();
  const enrollmentId = Array.isArray(params.enrollmentId) ? params.enrollmentId[0] : params.enrollmentId;

  const [detail, setDetail] = useState<ChallengeEnrollmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const onComplete = async () => {
    if (!firebaseUser || !detail || working) {
      return;
    }

    try {
      setWorking(true);
      setErrorMessage(null);
      await completeChallengeEnrollment(firebaseUser, enrollmentId);
      await load();
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
            <Badge variant="brand">완료</Badge>
          </div>
        }
      >
        <PageContainer size="md">
          <SectionContainer title="챌린지 완료" description="프로그램 수행 결과를 확인하고 완료 처리합니다.">
            {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

            {loading ? (
              <Card>
                <LoadingSkeleton lines={6} />
              </Card>
            ) : !detail ? (
              <ErrorState
                title="완료 정보를 불러오지 못했습니다"
                description="잠시 후 다시 시도해주세요."
                retryAction={<Button onClick={() => void load()}>다시 시도</Button>}
              />
            ) : (
              <>
                <Card title={detail.challenge.name_ko} description="챌린지 완료 요약">
                  <div className="ms-grid ms-grid--three">
                    <StatCard label="완료 일수" value={`${detail.done_days}일`} helperText={`목표 ${detail.enrollment.target_days}일`} />
                    <StatCard label="진행률" value={`${Math.round(detail.progress_ratio * 100)}%`} helperText={`상태 ${detail.enrollment.status}`} />
                    <StatCard label="남은 일수" value={`${detail.remaining_days}일`} helperText="미완료 날짜" />
                  </div>
                </Card>

                {detail.enrollment.status !== "completed" ? (
                  <Banner
                    variant="info"
                    title="완료 처리 전"
                    description="완료 처리하면 세션 상태가 completed로 전환되고 진행 탭에서 완료 탭으로 이동합니다."
                  />
                ) : (
                  <Banner variant="success" title="완료 처리됨" description="챌린지가 완료 상태로 저장되었습니다." />
                )}

                <div className="ms-row">
                  {detail.enrollment.status !== "completed" ? (
                    <Button onClick={() => void onComplete()} loading={working}>완료 처리</Button>
                  ) : null}
                  <Button variant="secondary" onClick={() => router.push(`/challenge/session/${enrollmentId}/progress`)}>
                    진행 현황 보기
                  </Button>
                  <Button variant="ghost" onClick={() => router.push("/challenge")}>카탈로그로 이동</Button>
                </div>
              </>
            )}
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
