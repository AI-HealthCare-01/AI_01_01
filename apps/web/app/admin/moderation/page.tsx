"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  SectionContainer,
  StatCard,
} from "../../../src/components/ui";
import { useAuthContext } from "../../../src/features/auth";
import {
  CommunityApiError,
  listModerationQueues,
  type ModerationQueuesResponse,
} from "../../../src/features/community";

function parseError(error: unknown): string {
  if (error instanceof CommunityApiError) {
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

function queueBadgeVariant(queueType: string): "warning" | "danger" | "info" {
  if (queueType === "safety") {
    return "danger";
  }
  if (queueType === "hate") {
    return "warning";
  }
  return "info";
}

export default function AdminModerationPage() {
  const { firebaseUser } = useAuthContext();

  const [data, setData] = useState<ModerationQueuesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const response = await listModerationQueues(firebaseUser, 30);
      setData(response);
    } catch (error) {
      setErrorMessage(parseError(error));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const groups = data?.groups ?? [];
    const totalQueued = groups.reduce((acc, group) => acc + group.queued_count, 0);
    const safetyQueued =
      groups.find((group) => group.queue_type === "safety")?.queued_count ?? 0;
    const hateQueued = groups.find((group) => group.queue_type === "hate")?.queued_count ?? 0;
    const reportQueued =
      groups.find((group) => group.queue_type === "report")?.queued_count ?? 0;
    return { totalQueued, safetyQueued, hateQueued, reportQueued };
  }, [data]);

  return (
    <SectionContainer
      title="커뮤니티 모더레이션"
      description="신고/유해언어/안전 큐를 분리해 운영합니다."
      action={
        <Button size="sm" variant="secondary" onClick={() => void load()} loading={loading}>
          새로고침
        </Button>
      }
    >
      {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

      {!loading && !errorMessage && data ? (
        <div className="ms-grid ms-grid--three">
          <StatCard label="전체 대기" value={String(summary.totalQueued)} helperText="모든 큐 합계" />
          <StatCard label="안전 큐" value={String(summary.safetyQueued)} helperText="고위험 신호" />
          <StatCard label="유해언어 큐" value={String(summary.hateQueued)} helperText="유해 표현 검토" />
          <StatCard label="신고 큐" value={String(summary.reportQueued)} helperText="사용자 신고 항목" />
        </div>
      ) : null}

      {loading ? (
        <Card>
          <LoadingSkeleton lines={8} />
        </Card>
      ) : errorMessage ? (
        <ErrorState
          title="모더레이션 큐를 불러오지 못했습니다"
          description="잠시 후 다시 시도해 주세요."
          retryAction={<Button onClick={() => void load()}>다시 시도</Button>}
        />
      ) : !data || data.groups.length === 0 ? (
        <EmptyState title="표시할 큐가 없습니다" description="대기 중인 신고가 없습니다." />
      ) : (
        <div className="ms-grid ms-grid--three">
          {data.groups.map((group) => (
            <Card
              key={group.queue_type}
              title={`${group.queue_type} 큐`}
              description={`대기 ${group.queued_count}건`}
              action={<Badge variant={queueBadgeVariant(group.queue_type)}>{group.queue_type}</Badge>}
            >
              {group.items.length === 0 ? (
                <p className="ms-card__desc">현재 대기 항목이 없습니다.</p>
              ) : (
                <div className="ms-admin-list">
                  {group.items.slice(0, 5).map((item) => (
                    <article key={item.queue_item_id} className="ms-admin-list__item">
                      <div>
                        <p className="ms-admin-list__title">{item.target_type}</p>
                        <p className="ms-card__desc">
                          {item.target_id} · {item.reason_code ?? "no_reason"}
                        </p>
                        <p className="ms-card__desc">{item.created_at.slice(0, 16).replace("T", " ")}</p>
                      </div>
                      <Badge variant="info">{item.status}</Badge>
                    </article>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </SectionContainer>
  );
}
