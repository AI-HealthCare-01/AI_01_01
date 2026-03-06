"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AppShell,
  Badge,
  Banner,
  Card,
  EmptyState,
  LoadingSkeleton,
  PageContainer,
  SectionContainer,
  StatCard,
} from "../../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../../src/features/auth";
import { MyPageTabShell } from "../../../src/features/mypage/tab-shell";
import {
  CommunityApiError,
  listSupportNotifications,
  listSupportTickets,
  type SupportNotificationPayload,
  type SupportTicketListItem,
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

function formatDateTime(value: string): string {
  return value.slice(0, 16).replace("T", " ");
}

function statusLabel(status: SupportTicketListItem["ticket"]["status"]): string {
  switch (status) {
    case "new":
      return "접수";
    case "waiting_admin":
      return "답변 대기";
    case "in_progress":
      return "처리 중";
    case "answered":
      return "답변 도착";
    case "waiting_user":
      return "사용자 확인";
    case "reopened":
      return "재문의";
    case "resolved":
      return "해결";
    case "closed":
      return "종료";
    default:
      return status;
  }
}

function isWaitingStatus(status: SupportTicketListItem["ticket"]["status"]): boolean {
  return ["new", "waiting_admin", "in_progress", "reopened"].includes(status);
}

function isHistoryStatus(status: SupportTicketListItem["ticket"]["status"]): boolean {
  return ["resolved", "closed"].includes(status);
}

export default function SupportTicketsPage() {
  const { firebaseUser } = useAuthContext();

  const [tickets, setTickets] = useState<SupportTicketListItem[]>([]);
  const [notifications, setNotifications] = useState<SupportNotificationPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const unreadByTicketId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of notifications) {
      if (!item.is_read) {
        map[item.ticket_id] = (map[item.ticket_id] ?? 0) + 1;
      }
    }
    return map;
  }, [notifications]);

  const waitingTickets = useMemo(
    () => tickets.filter((item) => isWaitingStatus(item.ticket.status)),
    [tickets],
  );

  const answeredUnreadTickets = useMemo(
    () =>
      tickets.filter(
        (item) => item.ticket.status === "answered" && (unreadByTicketId[item.ticket.ticket_id] ?? 0) > 0,
      ),
    [tickets, unreadByTicketId],
  );

  const historyTickets = useMemo(
    () =>
      tickets.filter(
        (item) =>
          isHistoryStatus(item.ticket.status) ||
          (item.ticket.status === "answered" && (unreadByTicketId[item.ticket.ticket_id] ?? 0) === 0),
      ),
    [tickets, unreadByTicketId],
  );

  const refresh = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const [ticketRows, notificationRows] = await Promise.all([
        listSupportTickets(firebaseUser, { limit: 80 }),
        listSupportNotifications(firebaseUser, { limit: 80 }),
      ]);
      setTickets(ticketRows);
      setNotifications(notificationRows);
    } catch (error) {
      setErrorMessage(parseError(error));
      setTickets([]);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AuthRouteGuard policy="require-active">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">내 문의</Badge>
          </div>
        }
      >
        <PageContainer size="lg">
          <SectionContainer title="마이페이지" description="왼쪽 탭을 선택하면 해당 항목 내용을 오른쪽에서 확인할 수 있습니다.">
            <MyPageTabShell>
              {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

              {loading ? (
                <Card>
                  <LoadingSkeleton lines={10} />
                </Card>
              ) : (
                <div className="ms-grid ms-grid--three">
                  <StatCard
                    label="답변 대기"
                    value={String(waitingTickets.length)}
                    helperText="문의 및 재문의 포함"
                  />
                  <StatCard
                    label="답변 도착"
                    value={String(answeredUnreadTickets.length)}
                    helperText="미열람 문의"
                  />
                  <Link href="/mypage/support-tickets/new" className="ms-support-compose-card">
                    <p className="ms-support-compose-card__title">문의 작성</p>
                    <p className="ms-support-compose-card__desc">새 문의/피드백을 등록합니다.</p>
                  </Link>
                </div>
              )}

              <Card title="답변 대기">
                {loading ? (
                  <LoadingSkeleton lines={4} />
                ) : waitingTickets.length === 0 ? (
                  <EmptyState title="답변 대기 문의가 없습니다" description="현재 대기 중인 문의가 없습니다." />
                ) : (
                  <div className="ms-stack">
                    {waitingTickets.map((item) => (
                      <Card
                        key={item.ticket.ticket_id}
                        title={item.ticket.title}
                        description={item.latest_message_preview || "메시지 없음"}
                        action={<Badge variant="info">{statusLabel(item.ticket.status)}</Badge>}
                      >
                        <div className="ms-row">
                          <p className="ms-card__desc">{formatDateTime(item.ticket.updated_at)}</p>
                          <Link href={`/mypage/support-tickets/${item.ticket.ticket_id}`} className="ms-inline-link">
                            문의/답변 보기
                          </Link>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="답변 도착">
                {loading ? (
                  <LoadingSkeleton lines={4} />
                ) : answeredUnreadTickets.length === 0 ? (
                  <EmptyState title="답변 도착 문의가 없습니다" description="미열람 답변이 없습니다." />
                ) : (
                  <div className="ms-stack">
                    {answeredUnreadTickets.map((item) => (
                      <Card
                        key={item.ticket.ticket_id}
                        title={item.ticket.title}
                        description={item.latest_message_preview || "메시지 없음"}
                        action={<Badge variant="warning">새 답변</Badge>}
                      >
                        <div className="ms-row">
                          <p className="ms-card__desc">{formatDateTime(item.ticket.updated_at)}</p>
                          <Link href={`/mypage/support-tickets/${item.ticket.ticket_id}`} className="ms-inline-link">
                            문의/답변 보기
                          </Link>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="문의내역 목록">
                {loading ? (
                  <LoadingSkeleton lines={4} />
                ) : historyTickets.length === 0 ? (
                  <EmptyState title="저장된 문의내역이 없습니다" description="열람 완료된 문의가 여기에 표시됩니다." />
                ) : (
                  <div className="ms-stack">
                    {historyTickets.map((item) => (
                      <Card
                        key={item.ticket.ticket_id}
                        title={item.ticket.title}
                        description={item.latest_message_preview || "메시지 없음"}
                        action={<Badge variant="neutral">{statusLabel(item.ticket.status)}</Badge>}
                      >
                        <div className="ms-row">
                          <p className="ms-card__desc">{formatDateTime(item.ticket.updated_at)}</p>
                          <Link href={`/mypage/support-tickets/${item.ticket.ticket_id}`} className="ms-inline-link">
                            문의/답변 보기
                          </Link>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </Card>
            </MyPageTabShell>
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
