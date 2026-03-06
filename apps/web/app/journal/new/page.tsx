"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  Chip,
  LoadingSkeleton,
  PageContainer,
  SectionContainer,
  Textarea,
} from "../../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../../src/features/auth";
import {
  CoreApiError,
  createJournalEntry,
  listJournalCategoryOptions,
} from "../../../src/features/core-inputs";

function parseError(error: unknown): string {
  if (error instanceof CoreApiError) {
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

export default function JournalCreatePage() {
  const router = useRouter();
  const { firebaseUser } = useAuthContext();

  const [body, setBody] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const bodyLengthHint = useMemo(() => `${body.length} / 5000`, [body.length]);

  const loadOptions = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }
    try {
      setLoadingOptions(true);
      const options = await listJournalCategoryOptions(firebaseUser);
      setActiveTags(options.active_tags);
      setSelectedTags((previous) => previous.filter((tag) => options.active_tags.includes(tag)));
    } catch (error) {
      setErrorMessage(parseError(error));
      setActiveTags([]);
      setSelectedTags([]);
    } finally {
      setLoadingOptions(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const toggleTag = (tag: string) => {
    setSelectedTags((previous) =>
      previous.includes(tag) ? previous.filter((item) => item !== tag) : [...previous, tag],
    );
  };

  const onSave = async () => {
    if (!firebaseUser || !body.trim() || saving) {
      return;
    }

    try {
      setSaving(true);
      setErrorMessage(null);

      const created = await createJournalEntry(firebaseUser, {
        category_tags: selectedTags,
        body: body.trim(),
      });

      router.replace(`/journal/${created.journal_id}`);
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthRouteGuard policy="require-active">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">한줄일기 작성</Badge>
          </div>
        }
      >
        <PageContainer size="md">
          <SectionContainer title="한줄일기 작성" description="카테고리 태그를 선택하고 한 줄의 마음 기록을 남겨보세요.">
            {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

            <Card>
              <div className="ms-stack">
                {loadingOptions ? (
                  <LoadingSkeleton lines={2} />
                ) : (
                  <div className="ms-field">
                    <span className="ms-field__label">카테고리 태그 (복수 선택)</span>
                    <div className="ms-row">
                      {activeTags.map((tag) => (
                        <Chip key={tag} selected={selectedTags.includes(tag)} onClick={() => toggleTag(tag)}>
                          {tag}
                        </Chip>
                      ))}
                      {activeTags.length === 0 ? <Badge variant="neutral">활성 태그 없음</Badge> : null}
                    </div>
                  </div>
                )}
                <Textarea
                  label="본문 (필수)"
                  placeholder="오늘의 감정과 상황을 자유롭게 기록하세요"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={5000}
                  maxLengthHint={bodyLengthHint}
                  required
                />
                <Button fullWidth onClick={onSave} loading={saving} disabled={!body.trim()}>
                  저장
                </Button>
                <Button variant="secondary" fullWidth onClick={() => router.push("/journal")} disabled={saving}>
                  목록으로
                </Button>
              </div>
            </Card>
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
