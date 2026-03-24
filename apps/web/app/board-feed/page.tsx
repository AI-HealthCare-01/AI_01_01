"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Modal,
  PageContainer,
  SectionContainer,
  Select,
  Textarea,
} from "../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../src/features/auth";
import {
  CommunityApiError,
  createBoardComment,
  deleteBoardPost,
  listBoardBookmarks,
  listBoardComments,
  listBoardFeed,
  listBoardNotices,
  reportBoardPost,
  toggleBoardBookmark,
  toggleBoardLike,
  updateBoardPost,
  type BoardCommentItem,
  type BoardFeedItem,
  type BoardListResponse,
} from "../../src/features/community";

type FeedTab = "feed" | "notice" | "bookmark" | "popular";

const PAGE_LIMIT = 10;
const REPORT_REASON_OPTIONS = [
  { value: "abuse", label: "괴롭힘/모욕" },
  { value: "hate", label: "혐오/차별 표현" },
  { value: "threat", label: "위협/협박" },
  { value: "sexual_harassment", label: "성적 괴롭힘" },
  { value: "privacy", label: "개인정보 노출" },
  { value: "spam", label: "도배/광고" },
  { value: "self_harm_signal", label: "자해 위험 신호" },
  { value: "violence_signal", label: "폭력 위험 신호" },
  { value: "other", label: "기타" },
] as const;

const TAB_LABEL: Record<FeedTab, string> = {
  feed: "피드",
  notice: "공지",
  bookmark: "북마크",
  popular: "인기글",
};

const TAB_ORDER: FeedTab[] = ["feed", "notice", "bookmark", "popular"];

const initialItemsByTab: Record<FeedTab, BoardFeedItem[]> = {
  feed: [],
  notice: [],
  bookmark: [],
  popular: [],
};

const initialCursorByTab: Record<FeedTab, string | null> = {
  feed: null,
  notice: null,
  bookmark: null,
  popular: null,
};

function parseError(error: unknown): string {
  if (error instanceof CommunityApiError) {
    if (error.message.includes("already_reported")) {
      return "이미 신고한 게시글입니다.";
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

function formatDateTime(value: string): string {
  return value.slice(0, 16).replace("T", " ");
}

function resolvePostTimestamp(item: BoardFeedItem): string {
  return item.post.updated_at ?? item.post.created_at;
}

function isPostEdited(item: BoardFeedItem): boolean {
  if (!item.post.updated_at) {
    return false;
  }
  return item.post.updated_at !== item.post.created_at;
}

function trimmed(text: string): string {
  return text.trim();
}

function getDisplayTitle(item: BoardFeedItem): string {
  const title = item.post.title ? trimmed(item.post.title) : "";
  if (title) {
    return title;
  }
  return "";
}

function scorePopular(item: BoardFeedItem): number {
  const createdMs = Date.parse(item.post.created_at);
  const hoursAgo = Number.isFinite(createdMs) ? Math.max(0, (Date.now() - createdMs) / 3_600_000) : 72;
  const recencyBoost = Math.max(0, 48 - hoursAgo) * 0.08;

  return (
    item.engagement.like_count * 2.1 +
    item.engagement.comment_count * 2.8 +
    item.engagement.bookmark_count * 2.2 +
    recencyBoost
  );
}

function sortPopular(items: BoardFeedItem[]): BoardFeedItem[] {
  return [...items].sort((a, b) => {
    const scoreDiff = scorePopular(b) - scorePopular(a);
    if (Math.abs(scoreDiff) > 0.0001) {
      return scoreDiff;
    }
    return Date.parse(b.post.created_at) - Date.parse(a.post.created_at);
  });
}

function mergeUnique(base: BoardFeedItem[], next: BoardFeedItem[], tab: FeedTab): BoardFeedItem[] {
  const map = new Map<string, BoardFeedItem>();
  for (const item of [...base, ...next]) {
    map.set(item.post.post_id, item);
  }

  const merged = [...map.values()];
  if (tab === "popular") {
    return sortPopular(merged);
  }
  return merged;
}

function BoardFeedContent() {
  const { firebaseUser, session } = useAuthContext();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<FeedTab>("feed");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [itemsByTab, setItemsByTab] = useState<Record<FeedTab, BoardFeedItem[]>>(initialItemsByTab);
  const [cursorByTab, setCursorByTab] = useState<Record<FeedTab, string | null>>(initialCursorByTab);
  const [pinnedNotice, setPinnedNotice] = useState<BoardFeedItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [expandedCommentMap, setExpandedCommentMap] = useState<Record<string, boolean>>({});
  const [commentsByPost, setCommentsByPost] = useState<Record<string, BoardCommentItem[]>>({});
  const [commentsLoadingMap, setCommentsLoadingMap] = useState<Record<string, boolean>>({});
  const [commentDraftMap, setCommentDraftMap] = useState<Record<string, string>>({});
  const [commentSubmittingMap, setCommentSubmittingMap] = useState<Record<string, boolean>>({});
  const commentSubmitLocksRef = useRef<Record<string, boolean>>({});
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editTitleMap, setEditTitleMap] = useState<Record<string, string>>({});
  const [editBodyMap, setEditBodyMap] = useState<Record<string, string>>({});
  const [editSubmittingMap, setEditSubmittingMap] = useState<Record<string, boolean>>({});
  const [deleteSubmittingMap, setDeleteSubmittingMap] = useState<Record<string, boolean>>({});
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportTargetPostId, setReportTargetPostId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<string>("abuse");
  const [reportDetail, setReportDetail] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [noticeModalOpen, setNoticeModalOpen] = useState(false);
  const [noticeModalMessage, setNoticeModalMessage] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  const activeItems = itemsByTab[tab];
  const nextCursor = cursorByTab[tab];
  const selectedItem = useMemo(() => {
    if (activeItems.length === 0) {
      return null;
    }
    return activeItems.find((item) => item.post.post_id === selectedPostId) ?? activeItems[0];
  }, [activeItems, selectedPostId]);

  const openNoticeModal = (message: string) => {
    setNoticeModalMessage(message);
    setNoticeModalOpen(true);
  };

  const closeNoticeModal = () => {
    setNoticeModalOpen(false);
    setNoticeModalMessage(null);
    setActionMessage(null);
  };

  useEffect(() => {
    if (!actionMessage) {
      return;
    }
    openNoticeModal(actionMessage);
  }, [actionMessage]);

  useEffect(() => {
    if (activeItems.length === 0) {
      setSelectedPostId(null);
      return;
    }
    if (!selectedPostId || !activeItems.some((item) => item.post.post_id === selectedPostId)) {
      setSelectedPostId(activeItems[0].post.post_id);
    }
  }, [activeItems, selectedPostId]);

  const fetchTab = useCallback(
    async (targetTab: FeedTab, options?: { cursor?: string | null; append?: boolean; query?: string }) => {
      if (!firebaseUser) {
        return;
      }

      const cursor = options?.cursor ?? null;
      const append = options?.append ?? false;
      const q = options?.query ?? submittedQuery;

      let result: BoardListResponse;

      if (targetTab === "feed") {
        result = await listBoardFeed(firebaseUser, { limit: PAGE_LIMIT, cursor, q });
      } else if (targetTab === "notice") {
        result = await listBoardNotices(firebaseUser, { limit: PAGE_LIMIT, cursor });
      } else if (targetTab === "bookmark") {
        result = await listBoardBookmarks(firebaseUser, { limit: PAGE_LIMIT, cursor });
      } else {
        result = await listBoardFeed(firebaseUser, { limit: PAGE_LIMIT, cursor, q });
      }

      const nextItems = targetTab === "popular" ? sortPopular(result.items) : result.items;

      setItemsByTab((previous) => {
        const base = append ? previous[targetTab] : [];
        return {
          ...previous,
          [targetTab]: mergeUnique(base, nextItems, targetTab),
        };
      });
      setCursorByTab((previous) => ({
        ...previous,
        [targetTab]: result.next_cursor,
      }));

      if (targetTab === "feed" && !append) {
        setPinnedNotice(result.pinned_notice);
      }
    },
    [firebaseUser, submittedQuery]
  );

  const loadTab = useCallback(
    async (targetTab: FeedTab, q: string) => {
      if (!firebaseUser) {
        return;
      }

      try {
        setLoading(true);
        setErrorMessage(null);
        await fetchTab(targetTab, { cursor: null, append: false, query: q });
      } catch (error) {
        setErrorMessage(parseError(error));
      } finally {
        setLoading(false);
      }
    },
    [fetchTab, firebaseUser]
  );

  const loadComments = useCallback(
    async (postId: string) => {
      if (!firebaseUser) {
        return;
      }

      setCommentsLoadingMap((previous) => ({ ...previous, [postId]: true }));
      try {
        const comments = await listBoardComments(firebaseUser, postId, { limit: 30 });
        setCommentsByPost((previous) => ({
          ...previous,
          [postId]: comments,
        }));
      } catch (error) {
        setActionMessage(parseError(error));
      } finally {
        setCommentsLoadingMap((previous) => ({ ...previous, [postId]: false }));
      }
    },
    [firebaseUser]
  );

  useEffect(() => {
    void loadTab(tab, submittedQuery);
  }, [loadTab, tab, submittedQuery]);

  useEffect(() => {
    const initialQuery = searchParams.get("q");
    if (initialQuery) {
      setQuery(initialQuery);
      setSubmittedQuery(initialQuery);
    }

    const requestedTab = searchParams.get("tab");
    if (requestedTab === "feed" || requestedTab === "notice" || requestedTab === "bookmark" || requestedTab === "popular") {
      setTab(requestedTab);
    }

    if (searchParams.get("posted") === "1") {
      setActionMessage("게시글이 등록되었습니다.");
    }
  }, [searchParams]);

  const handleSearchSubmit = () => {
    setSubmittedQuery(query.trim());
  };

  const handleLoadMore = async () => {
    if (!firebaseUser || !nextCursor) {
      return;
    }

    try {
      setLoadingMore(true);
      setErrorMessage(null);
      await fetchTab(tab, { cursor: nextCursor, append: true });
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleLike = async (postId: string) => {
    if (!firebaseUser) {
      return;
    }

    try {
      setActionMessage(null);
      await toggleBoardLike(firebaseUser, postId);
      await loadTab(tab, submittedQuery);
    } catch (error) {
      setActionMessage(parseError(error));
    }
  };

  const handleBookmark = async (postId: string) => {
    if (!firebaseUser) {
      return;
    }

    try {
      setActionMessage(null);
      await toggleBoardBookmark(firebaseUser, postId);
      await loadTab(tab, submittedQuery);
    } catch (error) {
      setActionMessage(parseError(error));
    }
  };

  const openReportModal = (postId: string) => {
    setReportTargetPostId(postId);
    setReportReason("abuse");
    setReportDetail("");
    setReportModalOpen(true);
  };

  const closeReportModal = (force = false) => {
    if (reportSubmitting && !force) {
      return;
    }
    setReportModalOpen(false);
    setReportTargetPostId(null);
    setReportReason("abuse");
    setReportDetail("");
  };

  const handleReportSubmit = async () => {
    if (!firebaseUser || !reportTargetPostId || reportSubmitting) {
      return;
    }

    try {
      setReportSubmitting(true);
      setActionMessage(null);
      await reportBoardPost(firebaseUser, reportTargetPostId, {
        reason_code: reportReason,
        detail_text: reportDetail.trim() || undefined,
      });
      setActionMessage("신고가 접수되었습니다. 관리자 모더레이션 큐에서 검토됩니다.");
      closeReportModal(true);
      await loadTab(tab, submittedQuery);
    } catch (error) {
      setActionMessage(parseError(error));
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleReport = async (postId: string) => {
    if (!firebaseUser) {
      return;
    }
    openReportModal(postId);
  };

  const handleToggleComments = async (postId: string) => {
    const isOpen = Boolean(expandedCommentMap[postId]);
    setExpandedCommentMap((previous) => ({
      ...previous,
      [postId]: !isOpen,
    }));

    if (isOpen) {
      return;
    }

    await loadComments(postId);
  };

  useEffect(() => {
    if (!firebaseUser) {
      return;
    }

    const openPostIds = Object.entries(expandedCommentMap)
      .filter(([, isOpen]) => isOpen)
      .map(([postId]) => postId);

    if (openPostIds.length === 0) {
      return;
    }

    const timer = window.setInterval(() => {
      void Promise.all(openPostIds.map((postId) => loadComments(postId)));
    }, 10000);

    return () => {
      window.clearInterval(timer);
    };
  }, [expandedCommentMap, firebaseUser, loadComments]);

  const handleSubmitComment = async (postId: string) => {
    if (!firebaseUser) {
      return;
    }
    if (commentSubmitLocksRef.current[postId]) {
      return;
    }

    const draft = commentDraftMap[postId] ?? "";
    const bodyText = draft.trim();
    if (!bodyText) {
      return;
    }

    commentSubmitLocksRef.current[postId] = true;
    setCommentSubmittingMap((previous) => ({ ...previous, [postId]: true }));
    try {
      await createBoardComment(firebaseUser, postId, { body_text: bodyText, is_anonymous: false });
      setCommentDraftMap((previous) => ({ ...previous, [postId]: "" }));
      await Promise.all([loadComments(postId), loadTab(tab, submittedQuery)]);
    } catch (error) {
      setActionMessage(parseError(error));
    } finally {
      commentSubmitLocksRef.current[postId] = false;
      setCommentSubmittingMap((previous) => ({ ...previous, [postId]: false }));
    }
  };

  const beginEdit = (item: BoardFeedItem) => {
    const postId = item.post.post_id;
    setEditingPostId(postId);
    setEditTitleMap((previous) => ({
      ...previous,
      [postId]: item.post.title ?? "",
    }));
    setEditBodyMap((previous) => ({
      ...previous,
      [postId]: item.post.body_text || item.post.body_preview || "",
    }));
  };

  const cancelEdit = () => {
    setEditingPostId(null);
  };

  const submitEdit = async (postId: string) => {
    if (!firebaseUser) {
      return;
    }
    const nextBody = (editBodyMap[postId] ?? "").trim();
    const nextTitleRaw = (editTitleMap[postId] ?? "").trim();
    if (!nextBody) {
      setActionMessage("본문을 입력해주세요.");
      return;
    }

    try {
      setEditSubmittingMap((previous) => ({ ...previous, [postId]: true }));
      setActionMessage(null);
      await updateBoardPost(firebaseUser, postId, {
        title: nextTitleRaw || null,
        body_text: nextBody,
      });
      setEditingPostId(null);
      setActionMessage("게시글을 수정했습니다.");
      await loadTab(tab, submittedQuery);
    } catch (error) {
      setActionMessage(parseError(error));
    } finally {
      setEditSubmittingMap((previous) => ({ ...previous, [postId]: false }));
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!firebaseUser) {
      return;
    }

    const confirmed = window.confirm("삭제하시겠습니까?");
    if (!confirmed) {
      return;
    }

    try {
      setDeleteSubmittingMap((previous) => ({ ...previous, [postId]: true }));
      setActionMessage(null);
      await deleteBoardPost(firebaseUser, postId);
      if (editingPostId === postId) {
        setEditingPostId(null);
      }
      setActionMessage("게시글을 삭제했습니다.");
      await loadTab(tab, submittedQuery);
    } catch (error) {
      setActionMessage(parseError(error));
    } finally {
      setDeleteSubmittingMap((previous) => ({ ...previous, [postId]: false }));
    }
  };

  return (
    <AuthRouteGuard policy="require-active">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">커뮤니티</Badge>
          </div>
        }
      >
        <PageContainer size="lg">
          <SectionContainer title="커뮤니티" description="피드, 공지, 북마크, 인기글을 한 화면에서 확인할 수 있습니다.">
            <div className="ms-board-layout">
              <aside className="ms-board-sidebar">
                <div className="ms-board-tab-list" role="tablist" aria-label="커뮤니티 탭">
                  {TAB_ORDER.map((item) => (
                    <button
                      key={item}
                      type="button"
                      role="tab"
                      aria-selected={tab === item}
                      className={tab === item ? "ms-board-tab-btn ms-board-tab-btn--active" : "ms-board-tab-btn"}
                      onClick={() => setTab(item)}
                    >
                      {TAB_LABEL[item]}
                    </button>
                  ))}
                </div>

                <div className="ms-board-search-box">
                  <div className="ms-board-search-inline">
                    <label className="ms-visually-hidden" htmlFor="board-search-input">
                      검색
                    </label>
                    <input
                      id="board-search-input"
                      className="ms-board-search-inline__input"
                      placeholder="게시글 번호, 제목, 본문"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleSearchSubmit();
                        }
                      }}
                    />
                    <Button size="sm" variant="secondary" className="ms-board-search-inline__btn" onClick={handleSearchSubmit}>
                      검색
                    </Button>
                  </div>
                  <Link href="/board-feed/new" className="ms-board-write-link">
                    <Button size="sm">글쓰기</Button>
                  </Link>
                </div>
              </aside>

              <div className="ms-board-main">
                <div className="ms-board-ops-inline" role="status" aria-live="polite">
                  운영 안내: 신고 접수 건은 관리자 모더레이션 큐로 전달되어 검토됩니다.
                </div>
                {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

                {loading ? (
                  <div className="ms-board-loading-card">
                    <LoadingSkeleton lines={10} />
                  </div>
                ) : errorMessage ? (
                  <ErrorState
                    title="피드를 불러오지 못했습니다"
                    description="잠시 후 다시 시도해 주세요."
                    retryAction={<Button onClick={() => void loadTab(tab, submittedQuery)}>다시 시도</Button>}
                  />
                ) : (
                  <div className="ms-board-list">
                    {tab === "feed" && pinnedNotice ? (
                      <article className="ms-board-notice-card">
                        <div className="ms-board-notice-card__head">
                          <Badge variant="info">공지</Badge>
                          <span className="ms-board-post-id">#{pinnedNotice.post.feed_public_id}</span>
                        </div>
                        {getDisplayTitle(pinnedNotice) ? <h3 className="ms-board-post-title">{getDisplayTitle(pinnedNotice)}</h3> : null}
                        <p className="ms-board-post-body">{pinnedNotice.post.body_preview}</p>
                      </article>
                    ) : null}

                    {activeItems.length === 0 ? (
                      <EmptyState
                        title={submittedQuery ? "검색 결과가 없습니다" : "표시할 게시글이 없습니다"}
                        description={submittedQuery ? "검색어를 바꿔 다시 시도해보세요." : "첫 게시글을 작성해보세요."}
                      />
                    ) : (
                      <div className="ms-board-cafe-layout">
                        <div className="ms-board-cafe-list" role="list" aria-label="게시글 목록">
                          {activeItems.map((item) => {
                            const postId = item.post.post_id;
                            const hasTitle = Boolean(item.post.title && trimmed(item.post.title));
                            const titleText = getDisplayTitle(item);
                            const rowTitle = hasTitle && titleText ? titleText : item.post.body_preview;
                            const isSelected = selectedItem?.post.post_id === postId;
                            return (
                              <button
                                key={postId}
                                type="button"
                                role="listitem"
                                className={isSelected ? "ms-board-cafe-row ms-board-cafe-row--active" : "ms-board-cafe-row"}
                                onClick={() => setSelectedPostId(postId)}
                              >
                                <div className="ms-board-cafe-row__main">
                                  <p className="ms-board-cafe-row__title">{rowTitle}</p>
                                  <p className="ms-board-cafe-row__meta">
                                    {item.author.display_name} · {formatDateTime(resolvePostTimestamp(item))}
                                  </p>
                                </div>
                                <div className="ms-board-cafe-row__stats">
                                  <span>♥ {item.engagement.like_count}</span>
                                  <span>댓글 {item.engagement.comment_count}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {selectedItem ? (() => {
                          const item = selectedItem;
                          const postId = item.post.post_id;
                          const isCommentOpen = Boolean(expandedCommentMap[postId]);
                          const comments = commentsByPost[postId] ?? [];
                          const isCommentsLoading = Boolean(commentsLoadingMap[postId]);
                          const commentDraft = commentDraftMap[postId] ?? "";
                          const commentSubmitting = Boolean(commentSubmittingMap[postId]);
                          const hasTitle = Boolean(item.post.title && trimmed(item.post.title));
                          const titleText = getDisplayTitle(item);
                          const edited = isPostEdited(item);
                          const displayDateTime = formatDateTime(resolvePostTimestamp(item));
                          const isAuthor = session?.account.user_id === item.author.author_user_id;
                          const isEditing = editingPostId === postId;
                          const editTitle = editTitleMap[postId] ?? "";
                          const editBody = editBodyMap[postId] ?? "";
                          const editSubmitting = Boolean(editSubmittingMap[postId]);
                          const deleting = Boolean(deleteSubmittingMap[postId]);

                          return (
                            <article className="ms-board-post-card">
                              <div className="ms-board-post-meta">
                                <div className="ms-board-post-meta__left">
                                  <span>{item.author.display_name}</span>
                                  <span aria-hidden>·</span>
                                  <span>{displayDateTime}</span>
                                  {edited ? (
                                    <>
                                      <span aria-hidden>·</span>
                                      <Badge variant="neutral">수정됨</Badge>
                                    </>
                                  ) : null}
                                </div>
                                <span className="ms-board-post-id">#{item.post.feed_public_id}</span>
                              </div>

                              {isEditing ? (
                                <div className="ms-board-edit-form">
                                  <input
                                    className="ms-board-edit-form__title"
                                    placeholder="제목(선택)"
                                    value={editTitle}
                                    maxLength={60}
                                    onChange={(event) =>
                                      setEditTitleMap((previous) => ({
                                        ...previous,
                                        [postId]: event.target.value,
                                      }))
                                    }
                                  />
                                  <textarea
                                    className="ms-board-edit-form__body"
                                    placeholder="내용을 입력하세요"
                                    value={editBody}
                                    maxLength={1500}
                                    onChange={(event) =>
                                      setEditBodyMap((previous) => ({
                                        ...previous,
                                        [postId]: event.target.value,
                                      }))
                                    }
                                  />
                                  <div className="ms-row">
                                    <Button size="sm" onClick={() => void submitEdit(postId)} loading={editSubmitting}>
                                      저장
                                    </Button>
                                    <Button size="sm" variant="secondary" onClick={cancelEdit} disabled={editSubmitting}>
                                      취소
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {hasTitle && titleText ? <h3 className="ms-board-post-title">{titleText}</h3> : null}
                                  <p className={hasTitle ? "ms-board-post-body" : "ms-board-post-body ms-board-post-body--only"}>
                                    {item.post.body_text || item.post.body_preview}
                                  </p>
                                  {item.post.image_urls.length > 0 ? (
                                    <div className="ms-board-post-images" aria-label="첨부 이미지">
                                      {item.post.image_urls.map((imageUrl, imageIndex) => (
                                        <img
                                          key={`${postId}-image-${imageIndex}`}
                                          className="ms-board-post-image"
                                          src={imageUrl}
                                          alt={`게시글 첨부 이미지 ${imageIndex + 1}`}
                                          loading="lazy"
                                          onClick={() => setImagePreviewUrl(imageUrl)}
                                        />
                                      ))}
                                    </div>
                                  ) : null}
                                </>
                              )}

                              <div className="ms-board-post-actions">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className={
                                    item.engagement.viewer_liked
                                      ? "ms-board-action-btn ms-board-action-btn--active"
                                      : "ms-board-action-btn"
                                  }
                                  onClick={() => void handleLike(postId)}
                                >
                                  좋아요 {item.engagement.like_count}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className={isCommentOpen ? "ms-board-action-btn ms-board-action-btn--active" : "ms-board-action-btn"}
                                  onClick={() => void handleToggleComments(postId)}
                                >
                                  댓글 {item.engagement.comment_count}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className={
                                    item.engagement.viewer_bookmarked
                                      ? "ms-board-action-btn ms-board-action-btn--active"
                                      : "ms-board-action-btn"
                                  }
                                  onClick={() => void handleBookmark(postId)}
                                >
                                  북마크 {item.engagement.bookmark_count}
                                </Button>
                                <Button size="sm" variant="ghost" className="ms-board-action-btn" onClick={() => void handleReport(postId)}>
                                  신고 {item.engagement.report_count}
                                </Button>
                                {isAuthor ? (
                                  <>
                                    <Button size="sm" variant="ghost" className="ms-board-action-btn" onClick={() => beginEdit(item)}>
                                      수정
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="ms-board-action-btn"
                                      onClick={() => void handleDeletePost(postId)}
                                      loading={deleting}
                                      disabled={deleting || editSubmitting}
                                    >
                                      삭제
                                    </Button>
                                  </>
                                ) : null}
                              </div>

                              {isCommentOpen ? (
                                <div className="ms-board-comments-panel">
                                  <div className="ms-board-comments-list">
                                    {isCommentsLoading ? (
                                      <LoadingSkeleton lines={3} />
                                    ) : comments.length === 0 ? (
                                      <p className="ms-board-comments-empty">아직 댓글이 없습니다.</p>
                                    ) : (
                                      comments.map((comment) => (
                                        <div key={comment.comment_id} className="ms-board-comment-item">
                                          <div className="ms-board-comment-item__meta">
                                            <span>{comment.author_display_name}</span>
                                            <span aria-hidden>·</span>
                                            <span>{formatDateTime(comment.created_at)}</span>
                                          </div>
                                          <p className="ms-board-comment-item__body">{comment.body_text}</p>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                  <div className="ms-board-comment-editor">
                                    <input
                                      className="ms-board-comment-editor__input"
                                      placeholder="댓글을 입력하세요"
                                      maxLength={500}
                                      disabled={commentSubmitting}
                                      value={commentDraft}
                                      onChange={(event) =>
                                        setCommentDraftMap((previous) => ({
                                          ...previous,
                                          [postId]: event.target.value,
                                        }))
                                      }
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          event.preventDefault();
                                          void handleSubmitComment(postId);
                                        }
                                      }}
                                    />
                                    <div className="ms-board-comment-editor__actions">
                                      <Button
                                        size="sm"
                                        className="ms-board-comment-editor__submit"
                                        loading={commentSubmitting}
                                        disabled={commentSubmitting || !commentDraft.trim()}
                                        onClick={() => void handleSubmitComment(postId)}
                                      >
                                        댓글 등록
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </article>
                          );
                        })() : null}
                      </div>
                    )}

                    {nextCursor ? (
                      <Button className="ms-board-load-more" variant="secondary" onClick={handleLoadMore} loading={loadingMore}>
                        + 10개 더보기
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </SectionContainer>
        </PageContainer>
      </AppShell>
      <Modal
        open={noticeModalOpen}
        title="안내"
        description={noticeModalMessage ?? ""}
        onClose={closeNoticeModal}
        footer={
          <Button type="button" onClick={closeNoticeModal}>
            확인
          </Button>
        }
      >
        <p className="ms-card__desc">확인을 누르면 닫힙니다.</p>
      </Modal>
      <Modal
        open={reportModalOpen}
        title="게시글 신고"
        description="신고 사유를 선택하면 관리자 모더레이션 큐로 접수됩니다."
        onClose={closeReportModal}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => closeReportModal()} disabled={reportSubmitting}>
              취소
            </Button>
            <Button type="button" variant="danger" onClick={() => void handleReportSubmit()} loading={reportSubmitting}>
              신고 접수
            </Button>
          </>
        }
      >
        <div className="ms-stack">
          <Select
            label="신고 사유"
            value={reportReason}
            onChange={(event) => setReportReason(event.target.value)}
            options={REPORT_REASON_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
          />
          <Textarea
            label="상세 설명 (선택)"
            placeholder="필요한 경우 구체적인 상황을 적어주세요."
            maxLength={500}
            value={reportDetail}
            onChange={(event) => setReportDetail(event.target.value)}
            maxLengthHint={`${reportDetail.length}/500`}
          />
        </div>
      </Modal>
      <Modal
        open={Boolean(imagePreviewUrl)}
        title="이미지 미리보기"
        description="원본 비율로 표시됩니다."
        onClose={() => setImagePreviewUrl(null)}
        footer={
          <Button type="button" variant="secondary" onClick={() => setImagePreviewUrl(null)}>
            닫기
          </Button>
        }
      >
        {imagePreviewUrl ? (
          <img className="ms-board-image-preview" src={imagePreviewUrl} alt="첨부 이미지 원본 보기" />
        ) : null}
      </Modal>
    </AuthRouteGuard>
  );
}

export default function BoardFeedPage() {
  return (
    <Suspense fallback={<div className="ms-page-loading">불러오는 중...</div>}>
      <BoardFeedContent />
    </Suspense>
  );
}
