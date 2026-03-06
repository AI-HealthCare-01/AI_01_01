"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Badge,
  Banner,
  Button,
  Card,
  ChartBars,
  ChartCard,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  SectionContainer,
  StatCard,
} from "../../src/components/ui";
import { useAuthContext } from "../../src/features/auth";
import {
  AdminApiError,
  getAdminOverview,
  listOwnerApprovals,
  useAdminConsoleContext,
  type AdminOverviewResponse,
  type OwnerApprovalRecord,
} from "../../src/features/admin-console";

function parseError(error: unknown): string {
  if (error instanceof AdminApiError) {
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

export default function AdminOverviewPage() {
  const { firebaseUser } = useAuthContext();
  const { me } = useAdminConsoleContext();
  const canViewApprovals =
    me?.actor.base_role === "owner" || me?.actor.base_role === "admin";

  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<OwnerApprovalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const [overviewResponse, pendingResponse] = await Promise.all([
        getAdminOverview(firebaseUser),
        canViewApprovals
          ? listOwnerApprovals(firebaseUser, {
              status: "pending_owner_approval",
              limit: 20,
            })
          : Promise.resolve([]),
      ]);
      setOverview(overviewResponse);
      setPendingApprovals(pendingResponse);
    } catch (error) {
      setErrorMessage(parseError(error));
      setOverview(null);
      setPendingApprovals([]);
    } finally {
      setLoading(false);
    }
  }, [canViewApprovals, firebaseUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const queueBars = useMemo(() => {
    if (!overview) {
      return [];
    }
    return overview.queues.map((queue) => queue.count);
  }, [overview]);

  const queueAxisLabels = useMemo(() => {
    if (!overview) {
      return [];
    }

    return overview.queues.map((queue) => {
      if (queue.queue_code === "support_queue") {
        return "문의";
      }
      if (queue.queue_code === "moderation_queue") {
        return "모더";
      }
      if (queue.queue_code === "safety_queue") {
        return "안전";
      }
      if (queue.queue_code === "ops_queue") {
        return "정책";
      }
      return "모델";
    });
  }, [overview]);

  return (
    <SectionContainer
      title="운영 개요"
      description="큐별 건수 요약과 Owner 승인 대기 상태를 확인합니다."
      action={
        <div className="ms-row">
          <Badge variant="brand">{me?.actor.base_role ?? "-"}</Badge>
          <Button size="sm" variant="secondary" onClick={() => void load()} loading={loading}>
            새로고침
          </Button>
        </div>
      }
    >
      {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

      {loading ? (
        <Card>
          <LoadingSkeleton lines={8} />
        </Card>
      ) : errorMessage ? (
        <ErrorState
          title="운영 데이터를 불러오지 못했습니다"
          description="잠시 후 다시 시도해 주세요."
          retryAction={<Button onClick={() => void load()}>다시 시도</Button>}
        />
      ) : !overview ? (
        <EmptyState title="표시할 운영 데이터가 없습니다" description="잠시 후 다시 시도해 주세요." />
      ) : (
        <>
          <div className="ms-grid ms-grid--three">
            <StatCard label="전체 사용자" value={`${overview.kpis.total_users}`} helperText="등록 계정 수" />
            <StatCard
              label="활성 사용자"
              value={`DAU ${overview.kpis.dau}`}
              helperText={`WAU ${overview.kpis.wau} · MAU ${overview.kpis.mau}`}
            />
            <StatCard
              label="Owner 승인 대기"
              value={`${pendingApprovals.length}`}
              helperText="정책/모델 승인 요청"
            />
          </div>

          <div className="ms-grid ms-grid--three">
            <StatCard label="최근 7일 가입" value={`${overview.kpis.signup_count_7d}`} helperText="신규 가입" />
            <StatCard label="최근 7일 체크인" value={`${overview.kpis.checkin_count_7d}`} helperText="활동 지표" />
            <StatCard label="최근 7일 CBT" value={`${overview.kpis.cbt_sessions_7d}`} helperText="세션 실행 수" />
          </div>

          <div className="ms-grid ms-grid--three">
            <StatCard
              label="문의 큐"
              value={`${overview.kpis.support_unanswered_count}`}
              helperText={`재오픈 ${overview.kpis.support_reopened_count}`}
            />
            <StatCard
              label="모더레이션 큐"
              value={`${overview.kpis.moderation_pending_count}`}
              helperText="신고/유해언어"
            />
            <StatCard
              label="안전 큐"
              value={`${overview.kpis.safety_pending_count}`}
              helperText="고위험 신호"
            />
          </div>

          <ChartCard
            title="큐 분포"
            subtitle="문의 · 모더레이션 · 안전 · 정책 · 모델"
            summary="관리자 알림은 큐별 분리 원칙을 따릅니다."
          >
            <ChartBars
              bars={queueBars}
              axisLabels={queueAxisLabels}
              color="var(--color-chart-axis)"
              ariaLabel="관리자 큐 분포"
            />
          </ChartCard>

          <Card title="승인 대기 목록" description="Owner 승인 후에만 정책 반영/모델 배포가 가능합니다.">
            {pendingApprovals.length === 0 ? (
              <p className="ms-card__desc">승인 대기 항목이 없습니다.</p>
            ) : (
              <div className="ms-admin-list">
                {pendingApprovals.slice(0, 8).map((item) => (
                  <article key={item.approval_id} className="ms-admin-list__item">
                    <div>
                      <p className="ms-admin-list__title">{item.object_type}</p>
                      <p className="ms-card__desc">
                        요청자 {item.requested_by_admin_user_id} · {item.requested_at.slice(0, 16).replace("T", " ")}
                      </p>
                    </div>
                    <Badge variant="warning">{item.status}</Badge>
                  </article>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </SectionContainer>
  );
}
