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
} from "../../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../../src/features/auth";
import { CoreApiError, deleteJournalEntry, getJournalEntry, type JournalEntry } from "../../../src/features/core-inputs";

function parseError(error: unknown): string {
  if (error instanceof CoreApiError) {
    if (error.message === "journal_not_found") {
      return "존재하지 않거나 삭제된 한줄일기입니다.";
    }
    if (error.message === "email_verification_required") {
      return "이메일 확인 후 이용할 수 있습니다.";
    }
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

export default function JournalDetailPage() {
  const params = useParams<{ entryId: string }>();
  const entryId = Array.isArray(params.entryId) ? params.entryId[0] : params.entryId;

  const router = useRouter();
  const { firebaseUser } = useAuthContext();

  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!firebaseUser || !entryId) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const detail = await getJournalEntry(firebaseUser, entryId);
      setEntry(detail);
    } catch (error) {
      setErrorMessage(parseError(error));
      setEntry(null);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, entryId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onDelete = async () => {
    if (!firebaseUser || !entry || deleting) {
      return;
    }

    const confirmed = window.confirm("이 한줄일기를 삭제하시겠습니까? 삭제 후 목록에서 사라집니다.");
    if (!confirmed) {
      return;
    }

    try {
      setDeleting(true);
      setErrorMessage(null);
      await deleteJournalEntry(firebaseUser, entry.journal_id);
      router.replace("/journal");
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AuthRouteGuard policy="require-active">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">한줄일기</Badge>
          </div>
        }
      >
        <PageContainer size="md">
          <SectionContainer title="한줄일기 상세" description="작성한 한줄일기의 전체 내용을 확인할 수 있습니다.">
            {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

            {loading ? (
              <Card>
                <LoadingSkeleton lines={6} />
              </Card>
            ) : errorMessage && !entry ? (
              <ErrorState
                title="한줄일기를 불러오지 못했습니다"
                description="삭제되었거나 접근할 수 없습니다."
                retryAction={<Button onClick={load}>다시 시도</Button>}
              />
            ) : !entry ? (
              <EmptyState title="한줄일기가 없습니다" description="목록에서 다른 기록을 선택해주세요." />
            ) : (
              <Card
                title={entry.category_tags.length > 0 ? entry.category_tags.map((tag) => `#${tag}`).join(" ") : "카테고리 없음"}
                description={`작성일 ${entry.entry_date}`}
              >
                <div className="ms-row">
                  <Badge variant="neutral">수정 {entry.updated_at.slice(0, 10)}</Badge>
                  {entry.category_tags.length === 0 ? <Badge variant="neutral">태그 없음</Badge> : null}
                  {entry.category_tags.map((tag) => (
                    <Badge
                      key={`${entry.journal_id}-${tag}`}
                      variant={entry.searchable_category_tags.includes(tag) ? "brand" : "neutral"}
                    >
                      {tag}
                      {entry.searchable_category_tags.includes(tag) ? "" : " (비활성)"}
                    </Badge>
                  ))}
                </div>
                <div className="ms-journal-detail-body">{entry.body}</div>
                <div className="ms-row">
                  <Link href={`/journal/${entry.journal_id}/edit`} className="ms-inline-link">
                    수정
                  </Link>
                  <Button variant="danger" onClick={onDelete} loading={deleting}>
                    삭제
                  </Button>
                  <Button variant="secondary" onClick={() => router.push("/journal")}>
                    목록
                  </Button>
                </div>
              </Card>
            )}
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
