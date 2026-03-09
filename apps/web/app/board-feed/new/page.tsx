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
  Select,
  Textarea,
} from "../../../src/components/ui";
import { AdminApiError, getAdminMe } from "../../../src/features/admin-console";
import { AuthRouteGuard, useAuthContext } from "../../../src/features/auth";
import { CommunityApiError, createBoardPost } from "../../../src/features/community";
import { useEffect } from "react";

function parseError(error: unknown): string {
  if (error instanceof CommunityApiError) {
    if (error.message === "notice_admin_required") {
      return "공지 작성은 관리자(support/admin/owner) 권한에서만 가능합니다.";
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

function parseCommaList(value: string, limit: number): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

export default function BoardFeedWritePage() {
  const router = useRouter();
  const { firebaseUser } = useAuthContext();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [imageInput, setImageInput] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [canChooseNoticeType, setCanChooseNoticeType] = useState(false);
  const [postType, setPostType] = useState<"normal" | "notice">("normal");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!firebaseUser) {
        if (!cancelled) {
          setCanChooseNoticeType(false);
          setPostType("normal");
        }
        return;
      }

      try {
        const me = await getAdminMe(firebaseUser);
        const canWriteNotice = ["support", "admin", "owner"].includes(me.actor.base_role);
        if (cancelled) {
          return;
        }
        setCanChooseNoticeType(canWriteNotice);
        if (!canWriteNotice) {
          setPostType("normal");
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof AdminApiError && [401, 403, 404].includes(error.status)) {
          setCanChooseNoticeType(false);
          setPostType("normal");
          return;
        }
        setCanChooseNoticeType(false);
        setPostType("normal");
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);

  const handleSubmit = async () => {
    if (!firebaseUser) {
      return;
    }

    if (!body.trim()) {
      setErrorMessage("본문을 입력해주세요.");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);

      const created = await createBoardPost(firebaseUser, {
        title: title.trim() || null,
        body_text: body.trim(),
        is_anonymous: anonymous,
        is_notice: canChooseNoticeType && postType === "notice",
        tag_ids: parseCommaList(tagInput, 5),
        image_urls: parseCommaList(imageInput, 4),
      });

      const query = new URLSearchParams({
        posted: "1",
        q: created.post.feed_public_id,
      });
      router.push(`/board-feed?${query.toString()}`);
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
            <Badge variant="brand">Board Feed</Badge>
          </div>
        }
      >
        <PageContainer size="md">
          <SectionContainer
            title="게시글 작성"
            description="제목(선택), 본문(필수), 태그/이미지(선택), 익명 설정 후 등록합니다."
            action={
              <Link href="/board-feed" className="ms-inline-link">
                피드로 돌아가기
              </Link>
            }
          >
            {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

            <Card>
              {canChooseNoticeType ? (
                <Select
                  label="게시 유형"
                  value={postType}
                  onChange={(event) => setPostType(event.target.value as "normal" | "notice")}
                  options={[
                    { label: "일반 글", value: "normal" },
                    { label: "공지", value: "notice" },
                  ]}
                  helperText="관리자(support/admin/owner) 권한으로 공지 등록이 가능합니다."
                />
              ) : null}

              <Input
                label="제목(선택)"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={60}
                helperText={`${title.length}/60`}
              />

              <Textarea
                label="본문"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={1500}
                maxLengthHint={`${body.length}/1500`}
                required
              />

              <Input
                label="태그(선택)"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                placeholder="예: 수면, 체크인"
                helperText="쉼표(,)로 구분해 최대 5개까지 입력"
              />

              <Input
                label="이미지 URL(선택)"
                value={imageInput}
                onChange={(event) => setImageInput(event.target.value)}
                placeholder="https://..."
                helperText="쉼표(,)로 구분해 최대 4개까지 입력"
              />

              <div className="ms-row">
                <Button
                  variant={anonymous ? "secondary" : "ghost"}
                  onClick={() => setAnonymous((previous) => !previous)}
                >
                  익명 작성 {anonymous ? "ON" : "OFF"}
                </Button>
                <Button onClick={handleSubmit} loading={submitting}>
                  등록
                </Button>
              </div>
            </Card>
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
