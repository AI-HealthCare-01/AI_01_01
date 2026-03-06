"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  LoadingSkeleton,
  PageContainer,
  SectionContainer,
  Textarea,
} from "../../../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../../../src/features/auth";
import {
  CommunityApiError,
  addSupportFollowup,
  getSupportTicketDetail,
  markSupportNotificationRead,
  resolveSupportTicket,
  type SupportTicketDetailResponse,
} from "../../../../src/features/community";

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

function statusLabel(status: string): string {
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
      return "재오픈";
    case "resolved":
      return "해결됨";
    case "closed":
      return "종료";
    default:
      return status;
  }
}

export default function SupportTicketDetailPage() {
  const { firebaseUser } = useAuthContext();
  const params = useParams<{ ticketId: string }>();
  const ticketId = Array.isArray(params.ticketId) ? params.ticketId[0] : params.ticketId;

  const [detail, setDetail] = useState<SupportTicketDetailResponse | null>(null);
  const [followupBody, setFollowupBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const unreadNotifications = useMemo(
    () => detail?.notifications.filter((item) => !item.is_read) ?? [],
    [detail]
  );

  const loadDetail = useCallback(async () => {
    if (!firebaseUser || !ticketId) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const response = await getSupportTicketDetail(firebaseUser, ticketId);
      setDetail(response);
    } catch (error) {
      setErrorMessage(parseError(error));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, ticketId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    const run = async () => {
      if (!firebaseUser || unreadNotifications.length === 0) {
        return;
      }

      try {
        await Promise.all(
          unreadNotifications.map((item) => markSupportNotificationRead(firebaseUser, item.notification_id)),
        );
        await loadDetail();
      } catch {
        // no-op
      }
    };

    void run();
  }, [firebaseUser, loadDetail, unreadNotifications]);

  const handleFollowup = async () => {
    if (!firebaseUser || !ticketId || !followupBody.trim()) {
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);
      setMessage(null);
      await addSupportFollowup(firebaseUser, ticketId, followupBody.trim());
      setFollowupBody("");
      setMessage("추가문의가 등록되어 관리자 답변 대기 상태로 전환되었습니다.");
      await loadDetail();
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async () => {
    if (!firebaseUser || !ticketId) {
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);
      setMessage(null);
      await resolveSupportTicket(firebaseUser, ticketId);
      setMessage("티켓을 해결됨으로 처리했습니다.");
      await loadDetail();
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkRead = async (notificationId: string) => {
    if (!firebaseUser) {
      return;
    }

    try {
      await markSupportNotificationRead(firebaseUser, notificationId);
      await loadDetail();
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  };

  return (
    <AuthRouteGuard policy="require-active">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">문의 상세</Badge>
          </div>
        }
      >
        <PageContainer size="lg">
          <SectionContainer
            title="문의 상세"
            description="티켓 진행 상태와 메시지 이력을 확인하고, 추가문의 또는 해결 처리를 할 수 있습니다."
            action={
              <div className="ms-row">
                <Link href="/mypage/support-tickets/new" className="ms-inline-link">
                  문의 작성
                </Link>
                <Link href="/mypage/support-tickets" className="ms-inline-link">
                  내역 보기
                </Link>
              </div>
            }
          >
            {message ? <Banner variant="success" title="완료" description={message} /> : null}
            {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

            {loading ? (
              <Card>
                <LoadingSkeleton lines={8} />
              </Card>
            ) : !detail ? (
              <EmptyState title="티켓을 찾을 수 없습니다" description="내역 화면에서 다시 선택해주세요." />
            ) : (
              <div className="ms-grid ms-grid--two">
                <Card title={detail.ticket.title} description={`티켓 번호: ${detail.ticket.ticket_id}`}>
                  <div className="ms-row">
                    <Badge variant="brand">{statusLabel(detail.ticket.status)}</Badge>
                    <Badge variant="neutral">{detail.ticket.ticket_type}</Badge>
                    <Badge variant={detail.ticket.sensitive_queue_flag ? "warning" : "neutral"}>
                      {detail.ticket.sensitive_queue_flag ? "민감" : "일반"}
                    </Badge>
                  </div>
                  <div className="ms-stack">
                    {detail.messages.map((item) => (
                      <Card
                        key={item.message_id}
                        title={item.author_type === "admin" ? "관리자" : "사용자"}
                        description={item.body}
                      >
                        <p className="ms-card__desc">{item.created_at.slice(0, 16).replace("T", " ")}</p>
                      </Card>
                    ))}
                  </div>

                  {detail.ticket.status !== "closed" && detail.ticket.status !== "resolved" ? (
                    <>
                      <Textarea
                        label="추가문의"
                        value={followupBody}
                        onChange={(event) => setFollowupBody(event.target.value)}
                        placeholder="답변이 더 필요하면 같은 티켓에서 이어서 문의하세요."
                      />
                      <div className="ms-row">
                        <Button variant="secondary" onClick={handleFollowup} loading={submitting}>
                          추가문의(재오픈)
                        </Button>
                        <Button variant="ghost" onClick={handleResolve} loading={submitting}>
                          해결됨 처리
                        </Button>
                      </div>
                    </>
                  ) : null}
                </Card>

                <Card
                  title="알림"
                  description={`읽지 않은 알림 ${unreadNotifications.length}건`}
                >
                  {detail.notifications.length === 0 ? (
                    <EmptyState title="알림이 없습니다" description="상태 변경 시 알림이 표시됩니다." />
                  ) : (
                    <div className="ms-stack">
                      {detail.notifications.map((item) => (
                        <Card
                          key={item.notification_id}
                          title={item.event_type}
                          description={item.created_at.slice(0, 16).replace("T", " ")}
                          action={
                            <Badge variant={item.is_read ? "neutral" : "warning"}>
                              {item.is_read ? "읽음" : "새 알림"}
                            </Badge>
                          }
                        >
                          {!item.is_read ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void handleMarkRead(item.notification_id)}
                            >
                              읽음 처리
                            </Button>
                          ) : null}
                        </Card>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            )}
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
