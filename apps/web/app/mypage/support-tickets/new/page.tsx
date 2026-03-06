"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  Input,
  PageContainer,
  SectionContainer,
  SegmentedControl,
  Select,
  Textarea,
} from "../../../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../../../src/features/auth";
import {
  CommunityApiError,
  createSupportTicket,
  type SupportTicketType,
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

const ticketTypeOptions = [
  { label: "문의", value: "inquiry" },
  { label: "피드백", value: "feedback" },
] as const;

const categoryOptions = [
  "account",
  "checkin",
  "challenge",
  "cbt",
  "dashboard",
  "board",
  "report",
  "bug",
  "suggestion",
  "other",
] as const;

export default function SupportTicketCreatePage() {
  const router = useRouter();
  const { firebaseUser } = useAuthContext();

  const [ticketType, setTicketType] = useState<SupportTicketType>("inquiry");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<(typeof categoryOptions)[number]>("account");
  const [relatedFeature, setRelatedFeature] = useState("");
  const [body, setBody] = useState("");
  const [replyRequested, setReplyRequested] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!firebaseUser) {
      return;
    }

    if (!title.trim() || !body.trim()) {
      setErrorMessage("제목과 내용을 입력해주세요.");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);

      const created = await createSupportTicket(firebaseUser, {
        ticket_type: ticketType,
        title: title.trim(),
        category,
        related_feature: relatedFeature.trim() || undefined,
        body: body.trim(),
        reply_requested: ticketType === "inquiry" ? true : replyRequested,
      });

      router.push(`/mypage/support-tickets/${created.ticket.ticket_id}`);
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthRouteGuard policy="require-active">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">문의 작성</Badge>
          </div>
        }
      >
        <PageContainer size="md">
          <SectionContainer
            title="문의 작성"
            description="문의/피드백 티켓을 생성하면 내역과 상세에서 진행 상태를 확인할 수 있습니다."
            action={
              <Link href="/mypage/support-tickets" className="ms-inline-link">
                내 문의내역
              </Link>
            }
          >
            {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

            <Card>
              <div className="ms-field">
                <span className="ms-field__label">유형</span>
                <SegmentedControl<SupportTicketType>
                  value={ticketType}
                  onChange={setTicketType}
                  options={[...ticketTypeOptions]}
                  ariaLabel="문의 유형"
                />
              </div>

              <Input
                label="제목"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={60}
                helperText={`${title.length}/60`}
                required
              />

              <Select
                label="카테고리"
                value={category}
                onChange={(event) => setCategory(event.target.value as (typeof categoryOptions)[number])}
                options={categoryOptions.map((item) => ({ label: item, value: item }))}
              />

              <Input
                label="관련 기능(선택)"
                value={relatedFeature}
                onChange={(event) => setRelatedFeature(event.target.value)}
                placeholder="예: board-feed"
              />

              <Textarea
                label="내용"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={2000}
                maxLengthHint={`${body.length}/2000`}
                required
              />

              {ticketType === "feedback" ? (
                <Button
                  variant={replyRequested ? "secondary" : "ghost"}
                  onClick={() => setReplyRequested((previous) => !previous)}
                >
                  답변 요청 {replyRequested ? "ON" : "OFF"}
                </Button>
              ) : null}

              <div className="ms-row">
                <Button onClick={handleSubmit} loading={submitting}>문의 등록</Button>
                <Button variant="secondary" onClick={() => router.push("/mypage/support-tickets")}>목록으로</Button>
              </div>
            </Card>
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
