"use client";

import type { User } from "firebase/auth";
import { useCallback, useEffect, useState } from "react";

import {
  AppShell,
  Badge,
  Banner,
  PageContainer,
  SectionContainer,
  StatCard,
} from "../../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../../src/features/auth";
import {
  CommunityApiError,
  listBoardBookmarks,
  type BoardFeedItem,
} from "../../../src/features/community";
import { FeedStream } from "../../../src/features/community/feed-stream";
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

function mergeUnique(base: BoardFeedItem[], next: BoardFeedItem[]): BoardFeedItem[] {
  const map = new Map<string, BoardFeedItem>();
  for (const item of [...base, ...next]) {
    map.set(item.post.post_id, item);
  }
  return [...map.values()];
}

async function loadAllBookmarkedFeeds(firebaseUser: User) {
  let cursor: string | null = null;
  let collected: BoardFeedItem[] = [];

  for (let i = 0; i < 5; i += 1) {
    const response = await listBoardBookmarks(firebaseUser, { limit: 20, cursor });
    collected = mergeUnique(collected, response.items);
    if (!response.next_cursor) {
      break;
    }
    cursor = response.next_cursor;
  }

  return collected;
}

export default function MyPageBookmarksPage() {
  const { firebaseUser } = useAuthContext();

  const [items, setItems] = useState<BoardFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const rows = await loadAllBookmarkedFeeds(firebaseUser);
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
            <Badge variant="brand">북마크</Badge>
          </div>
        }
      >
        <PageContainer size="lg">
          <SectionContainer title="마이페이지" description="왼쪽 탭을 선택하면 해당 항목 내용을 오른쪽에서 확인할 수 있습니다.">
            <MyPageTabShell>
              {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

              {!loading && !errorMessage ? (
                <div className="ms-grid ms-grid--two">
                  <StatCard label="저장된 글 수" value={String(items.length)} helperText="내 북마크" />
                </div>
              ) : null}

              <FeedStream
                firebaseUser={firebaseUser}
                items={items}
                loading={loading}
                onReload={load}
                emptyTitle="북마크한 피드가 없습니다"
                emptyDescription="커뮤니티에서 북마크를 추가하면 이곳에 표시됩니다."
              />
            </MyPageTabShell>
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
