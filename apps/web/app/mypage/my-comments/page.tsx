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
  listMyPageComments,
  type BoardFeedItem,
  type MyPageCommentSummary,
} from "../../../src/features/community";
import {
  FeedStream,
  resolveBoardItemsByPublicIds,
  type HighlightedCommentItem,
} from "../../../src/features/community/feed-stream";
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

function toHighlightedComment(comment: MyPageCommentSummary): HighlightedCommentItem {
  return {
    comment_id: comment.comment_id,
    body: comment.body_preview,
    created_at: comment.created_at,
  };
}

export default function MyCommentsPage() {
  const { firebaseUser } = useAuthContext();

  const [sourceComments, setSourceComments] = useState<MyPageCommentSummary[]>([]);
  const [items, setItems] = useState<BoardFeedItem[]>([]);
  const [highlightedCommentsByPostId, setHighlightedCommentsByPostId] = useState<
    Record<string, HighlightedCommentItem[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const missingPostCount = useMemo(() => {
    const uniquePostIds = new Set(sourceComments.map((item) => item.post_id));
    return Math.max(0, uniquePostIds.size - items.length);
  }, [items.length, sourceComments]);

  const load = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);

      const comments = await listMyPageComments(firebaseUser, 80);
      setSourceComments(comments);

      if (comments.length === 0) {
        setItems([]);
        setHighlightedCommentsByPostId({});
        return;
      }

      const highlightedMap = comments.reduce<Record<string, HighlightedCommentItem[]>>((acc, comment) => {
        const current = acc[comment.post_id] ?? [];
        current.push(toHighlightedComment(comment));
        acc[comment.post_id] = current;
        return acc;
      }, {});
      setHighlightedCommentsByPostId(highlightedMap);

      const uniqueFeedPublicIdsInOrder: string[] = [];
      const seen = new Set<string>();
      for (const comment of comments) {
        if (!seen.has(comment.feed_public_id)) {
          seen.add(comment.feed_public_id);
          uniqueFeedPublicIdsInOrder.push(comment.feed_public_id);
        }
      }

      const mapByFeedPublicId = await resolveBoardItemsByPublicIds(firebaseUser, uniqueFeedPublicIdsInOrder);
      const resolved = uniqueFeedPublicIdsInOrder
        .map((feedPublicId) => mapByFeedPublicId[feedPublicId])
        .filter((item): item is BoardFeedItem => Boolean(item));

      setItems(resolved);
    } catch (error) {
      setErrorMessage(parseError(error));
      setSourceComments([]);
      setItems([]);
      setHighlightedCommentsByPostId({});
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
            <Badge variant="brand">내 댓글</Badge>
          </div>
        }
      >
        <PageContainer size="lg">
          <SectionContainer title="마이페이지" description="왼쪽 탭을 선택하면 해당 항목 내용을 오른쪽에서 확인할 수 있습니다.">
            <MyPageTabShell>
              {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

              {!loading && !errorMessage ? (
                <div className="ms-grid ms-grid--two">
                  <StatCard label="작성 댓글 수" value={String(sourceComments.length)} helperText="내가 작성한 댓글" />
                </div>
              ) : null}

              {!loading && !errorMessage && sourceComments.length > 0 && missingPostCount === sourceComments.length ? (
                <EmptyState
                  title="댓글이 연결된 피드가 없습니다"
                  description="숨김/삭제 상태인 게시글은 이 화면에서 제외될 수 있습니다."
                />
              ) : (
                <FeedStream
                  firebaseUser={firebaseUser}
                  items={items}
                  loading={loading}
                  onReload={load}
                  emptyTitle="작성한 댓글이 없습니다"
                  emptyDescription="커뮤니티에서 댓글을 작성하면 이곳에 표시됩니다."
                  highlightedCommentsByPostId={highlightedCommentsByPostId}
                />
              )}
            </MyPageTabShell>
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
