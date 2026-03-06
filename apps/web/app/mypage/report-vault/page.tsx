"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  AppShell,
  Badge,
  Banner,
  Card,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageContainer,
  SectionContainer,
} from "../../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../../src/features/auth";
import {
  CommunityApiError,
  listMyPageReportVault,
  type MyPageReportVaultItem,
} from "../../../src/features/community";
import { MyPageTabShell } from "../../../src/features/mypage/tab-shell";

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

export default function ReportVaultPage() {
  const { firebaseUser } = useAuthContext();

  const [items, setItems] = useState<MyPageReportVaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const rows = await listMyPageReportVault(firebaseUser, 50);
      setItems(rows);
    } catch (error) {
      setErrorMessage(parseError(error));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AuthRouteGuard policy="require-active">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">리포트 보관함</Badge>
          </div>
        }
      >
        <PageContainer size="lg">
          <SectionContainer title="마이페이지" description="왼쪽 탭을 선택하면 해당 항목 내용을 오른쪽에서 확인할 수 있습니다.">
            <MyPageTabShell>
              {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

              {loading ? (
                <Card>
                  <LoadingSkeleton lines={6} />
                </Card>
              ) : errorMessage ? (
                <ErrorState title="보관함을 불러오지 못했습니다" description="잠시 후 다시 시도해 주세요." />
              ) : items.length === 0 ? (
                <EmptyState
                  title="보관된 리포트가 없습니다"
                  description="저장된 리포트가 여기에 표시됩니다."
                />
              ) : (
                <div className="ms-stack">
                  {items.map((item) => (
                    <Link
                      key={item.report_id}
                      href={`/report/summary?start_date=${item.period_start}&end_date=${item.period_end}&include_sensitive=true`}
                      className="ms-link-reset"
                    >
                      <Card
                        title={item.file_name}
                        description={`${item.period_start} ~ ${item.period_end}`}
                        action={<Badge variant="neutral">{item.format.toUpperCase()}</Badge>}
                      >
                        <p className="ms-card__desc">생성일: {item.created_at.slice(0, 10)}</p>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </MyPageTabShell>
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
