"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AppShell,
  Badge,
  Banner,
  EmptyState,
  PageContainer,
  SectionContainer,
  StatCard,
} from "../../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../../src/features/auth";
import {
  CommunityApiError,
  listMyPagePosts,
  type BoardFeedItem,
  type MyPagePostSummary,
} from "../../../src/features/community";
import { FeedStream, resolveBoardItemsByPublicIds } from "../../../src/features/community/feed-stream";
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

export default function MyPostsPage() {
  const { firebaseUser } = useAuthContext();

  const [sourceItems, setSourceItems] = useState<MyPagePostSummary[]>([]);
  const [items, setItems] = useState<BoardFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const missingCount = useMemo(() => Math.max(0, sourceItems.length - items.length), [items.length, sourceItems.length]);

  const load = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);

      const summaries = await listMyPagePosts(firebaseUser, 60);
      setSourceItems(summaries);

      if (summaries.length === 0) {
        setItems([]);
        return;
      }

      const mapByFeedPublicId = await resolveBoardItemsByPublicIds(
        firebaseUser,
        summaries.map((item) => item.feed_public_id),
      );

      const resolved = summaries
        .map((item) => mapByFeedPublicId[item.feed_public_id])
        .filter((item): item is BoardFeedItem => Boolean(item));

      setItems(resolved);
    } catch (error) {
      setErrorMessage(parseError(error));
      setSourceItems([]);
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
            <Badge variant="brand">내 글</Badge>
          </div>
        }
      >
        <PageContainer size="lg">
          <SectionContainer title="마이페이지" description="왼쪽 탭을 선택하면 해당 항목 내용을 오른쪽에서 확인할 수 있습니다.">
            <MyPageTabShell>
              {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

              {!loading && !errorMessage ? (
                <div className="ms-grid ms-grid--two">
                  <StatCard label="작성 글 수" value={String(sourceItems.length)} helperText="내가 작성한 피드" />
                </div>
              ) : null}

              {!loading && !errorMessage && sourceItems.length > 0 && missingCount === sourceItems.length ? (
                <EmptyState
                  title="노출 가능한 작성 글이 없습니다"
                  description="숨김/삭제 상태인 게시글은 이 화면에서 제외될 수 있습니다."
                />
              ) : (
                <FeedStream
                  firebaseUser={firebaseUser}
                  items={items}
                  loading={loading}
                  onReload={load}
                  emptyTitle="작성한 피드가 없습니다"
                  emptyDescription="커뮤니티에서 글을 작성하면 이곳에 표시됩니다."
                />
              )}
            </MyPageTabShell>
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
