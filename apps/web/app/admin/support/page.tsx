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
  Select,
  StatCard,
} from "../../../src/components/ui";
import { useAuthContext } from "../../../src/features/auth";
import {
  AdminApiError,
  listAdminSupportQueue,
  type AdminSupportQueueResponse,
} from "../../../src/features/admin-console";

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

export default function AdminSupportQueuePage() {
  const { firebaseUser } = useAuthContext();

  const [statusFilter, setStatusFilter] = useState("new");
  const [queue, setQueue] = useState<AdminSupportQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const response = await listAdminSupportQueue(firebaseUser, {
        status: statusFilter || undefined,
        limit: 50,
      });
      setQueue(response);
    } catch (error) {
      setErrorMessage(parseError(error));
      setQueue(null);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const items = queue?.items ?? [];
    return {
      total: items.length,
      reopened: items.filter((item) => item.status === "reopened").length,
      waiting: items.filter((item) => item.status === "waiting_admin" || item.status === "new").length,
      sensitive: items.filter((item) => item.sensitive_queue_flag).length,
    };
  }, [queue]);

  return (
    <SectionContainer
      title="문의/피드백 큐"
      description="new/waiting_admin/reopened 중심으로 우선순위를 확인하고 처리합니다."
      action={
        <div className="ms-row">
          <Select
            label="상태"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            options={[
              { label: "new", value: "new" },
              { label: "waiting_admin", value: "waiting_admin" },
              { label: "reopened", value: "reopened" },
              { label: "in_progress", value: "in_progress" },
            ]}
          />
          <Button size="sm" variant="secondary" onClick={() => void load()} loading={loading}>
            새로고침
          </Button>
        </div>
      }
    >
      {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

      {!loading && !errorMessage && queue ? (
        <div className="ms-grid ms-grid--three">
          <StatCard label="현재 큐" value={String(stats.total)} helperText="필터 기준 항목 수" />
          <StatCard label="답변 대기" value={String(stats.waiting)} helperText="신규 + 관리자 응답 대기" />
          <StatCard label="재오픈" value={String(stats.reopened)} helperText="사용자 재문의" />
          <StatCard label="민감 플래그" value={String(stats.sensitive)} helperText="민감 대응 필요 항목" />
        </div>
      ) : null}

      {loading ? (
        <Card>
          <LoadingSkeleton lines={8} />
        </Card>
      ) : errorMessage ? (
        <ErrorState
          title="문의 큐를 불러오지 못했습니다"
          description="잠시 후 다시 시도해 주세요."
          retryAction={<Button onClick={() => void load()}>다시 시도</Button>}
        />
      ) : !queue || queue.items.length === 0 ? (
        <EmptyState title="대기 중인 문의가 없습니다" description="현재 상태 필터 기준으로 항목이 없습니다." />
      ) : (
        <div className="ms-admin-list">
          {queue.items.map((item) => (
            <article key={item.ticket_id} className="ms-admin-list__item">
              <div>
                <p className="ms-admin-list__title">{item.title}</p>
                <p className="ms-card__desc">
                  {item.ticket_type} · {item.user_nickname}
                </p>
                <p className="ms-card__desc">업데이트 {item.updated_at.slice(0, 16).replace("T", " ")}</p>
              </div>
              <div className="ms-row">
                {item.sensitive_queue_flag ? <Badge variant="warning">민감</Badge> : null}
                <Badge variant="info">{item.priority}</Badge>
                <Badge variant="brand">{item.status}</Badge>
              </div>
            </article>
          ))}
        </div>
      )}
    </SectionContainer>
  );
}
