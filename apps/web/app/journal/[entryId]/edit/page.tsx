"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Chip,
  CenteredFormContainer,
  ErrorState,
  LoadingSkeleton,
  SectionContainer,
  Textarea,
} from "../../../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../../../src/features/auth";
import {
  CoreApiError,
  getJournalEntry,
  listJournalCategoryOptions,
  updateJournalEntry,
  type JournalEntry,
} from "../../../../src/features/core-inputs";

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

export default function JournalEditPage() {
  const params = useParams<{ entryId: string }>();
  const entryId = Array.isArray(params.entryId) ? params.entryId[0] : params.entryId;

  const router = useRouter();
  const { firebaseUser } = useAuthContext();

  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [body, setBody] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [inactiveUsedTags, setInactiveUsedTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const bodyLengthHint = useMemo(() => `${body.length} / 5000`, [body.length]);

  const load = useCallback(async () => {
    if (!firebaseUser || !entryId) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const [detail, options] = await Promise.all([
        getJournalEntry(firebaseUser, entryId),
        listJournalCategoryOptions(firebaseUser),
      ]);
      setEntry(detail);
      setBody(detail.body);
      setActiveTags(options.active_tags);
      setInactiveUsedTags(options.inactive_used_tags);
      setSelectedTags(detail.category_tags);
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

  const onSave = async () => {
    if (!firebaseUser || !entryId || !body.trim() || saving) {
      return;
    }

    try {
      setSaving(true);
      setErrorMessage(null);
      await updateJournalEntry(firebaseUser, entryId, {
        category_tags: selectedTags,
        body: body.trim(),
      });
      router.replace(`/journal/${entryId}`);
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setSaving(false);
    }
  };

  const toggleActiveTag = (tag: string) => {
    setSelectedTags((previous) =>
      previous.includes(tag) ? previous.filter((value) => value !== tag) : [...previous, tag],
    );
  };

  const inactiveSelectedTags = useMemo(
    () => selectedTags.filter((tag) => !activeTags.includes(tag)),
    [activeTags, selectedTags],
  );

  return (
    <AuthRouteGuard policy="require-active">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">한줄일기 수정</Badge>
          </div>
        }
      >
        <CenteredFormContainer>
          <SectionContainer title="한줄일기 수정" description="카테고리 태그와 본문을 수정 후 저장합니다.">
            {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

            {loading ? (
              <LoadingSkeleton lines={5} />
            ) : !entry ? (
              <ErrorState
                title="수정 대상을 찾을 수 없습니다"
                description="삭제되었거나 접근 권한이 없습니다."
                retryAction={<Button onClick={load}>다시 시도</Button>}
              />
            ) : (
              <div className="ms-stack">
                <div className="ms-field">
                  <span className="ms-field__label">카테고리 태그 (복수 선택)</span>
                  <div className="ms-row">
                    {activeTags.map((tag) => (
                      <Chip key={tag} selected={selectedTags.includes(tag)} onClick={() => toggleActiveTag(tag)}>
                        {tag}
                      </Chip>
                    ))}
                    {activeTags.length === 0 ? <Badge variant="neutral">활성 태그 없음</Badge> : null}
                  </div>
                  {inactiveUsedTags.length > 0 ? (
                    <p className="ms-field__helper">
                      비활성 태그는 기존 기록에는 유지되지만 검색 대상에서 제외됩니다.
                    </p>
                  ) : null}
                </div>

                {inactiveSelectedTags.length > 0 ? (
                  <div className="ms-field">
                    <span className="ms-field__label">현재 기록의 비활성 태그</span>
                    <div className="ms-row">
                      {inactiveSelectedTags.map((tag) => (
                        <Button
                          key={tag}
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => setSelectedTags((previous) => previous.filter((value) => value !== tag))}
                        >
                          {tag} 삭제
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <Textarea
                  label="본문(필수)"
                  placeholder="오늘의 감정과 상황을 자유롭게 기록하세요"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={5000}
                  maxLengthHint={bodyLengthHint}
                  required
                />
                <Button fullWidth onClick={onSave} loading={saving} disabled={!body.trim()}>
                  수정 저장
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => router.push(`/journal/${entry.journal_id}`)}
                  disabled={saving}
                >
                  상세로 돌아가기
                </Button>
              </div>
            )}
          </SectionContainer>
        </CenteredFormContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
