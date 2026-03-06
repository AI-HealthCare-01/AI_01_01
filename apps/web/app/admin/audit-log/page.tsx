"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingSkeleton,
  SectionContainer,
  StatCard,
} from "../../../src/components/ui";
import { useAuthContext } from "../../../src/features/auth";
import {
  AdminApiError,
  listAuditLogs,
  type AuditLogListResponse,
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

export default function AdminAuditLogPage() {
  const { firebaseUser } = useAuthContext();

  const [limit, setLimit] = useState("100");
  const [logs, setLogs] = useState<AuditLogListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const response = await listAuditLogs(firebaseUser, {
        limit: Number(limit) || 100,
      });
      setLogs(response);
    } catch (error) {
      setErrorMessage(parseError(error));
      setLogs(null);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const items = logs?.items ?? [];
    return {
      total: items.length,
      piiViewed: items.filter((item) => item.action_type.includes("pii")).length,
      restrictionActions: items.filter((item) => item.action_type.includes("restriction")).length,
      approvalActions: items.filter((item) => item.action_type.includes("approval")).length,
    };
  }, [logs]);

  return (
    <SectionContainer
      title="감사 로그"
      description="민감 액션(PII 열람, 차단, 승인/배포, 권한 변경) 이력을 추적합니다."
      action={
        <div className="ms-row">
          <Input
            label="조회 개수(limit)"
            type="number"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
          />
          <Button size="sm" variant="secondary" onClick={() => void load()} loading={loading}>
            새로고침
          </Button>
        </div>
      }
    >
      {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

      {!loading && !errorMessage && logs ? (
        <div className="ms-grid ms-grid--three">
          <StatCard label="조회 건수" value={String(summary.total)} helperText="현재 limit 기준" />
          <StatCard label="PII 열람" value={String(summary.piiViewed)} helperText="개인정보 조회 관련" />
          <StatCard label="제재/차단" value={String(summary.restrictionActions)} helperText="제재 조치 기록" />
          <StatCard label="승인 액션" value={String(summary.approvalActions)} helperText="승인/반려 기록" />
        </div>
      ) : null}

      {loading ? (
        <Card>
          <LoadingSkeleton lines={10} />
        </Card>
      ) : errorMessage ? (
        <ErrorState
          title="감사 로그를 불러오지 못했습니다"
          description="잠시 후 다시 시도해 주세요."
          retryAction={<Button onClick={() => void load()}>다시 시도</Button>}
        />
      ) : !logs || logs.items.length === 0 ? (
        <EmptyState title="감사 로그가 없습니다" description="기록된 민감 액션이 없습니다." />
      ) : (
        <div className="ms-admin-list">
          {logs.items.map((item) => (
            <article key={item.audit_id} className="ms-admin-list__item">
              <div>
                <p className="ms-admin-list__title">{item.action_type}</p>
                <p className="ms-card__desc">
                  actor {item.actor_admin_user_id} ({item.actor_role})
                </p>
                <p className="ms-card__desc">
                  target {item.target_type}:{item.target_id}
                </p>
                <p className="ms-card__desc">{item.created_at.slice(0, 16).replace("T", " ")}</p>
              </div>
              <Badge variant="info">감사</Badge>
            </article>
          ))}
        </div>
      )}
    </SectionContainer>
  );
}
