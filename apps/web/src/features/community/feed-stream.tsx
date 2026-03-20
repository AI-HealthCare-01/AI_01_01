"use client";

import type { User } from "firebase/auth";
import { useEffect, useState } from "react";

import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  LoadingSkeleton,
} from "../../components/ui";
import {
  CommunityApiError,
  createBoardComment,
  listBoardComments,
  listBoardFeed,
  reportBoardPost,
  toggleBoardBookmark,
  toggleBoardLike,
} from "./api-client";
import type { BoardCommentItem, BoardFeedItem } from "./types";

export interface HighlightedCommentItem {
  comment_id: string;
  body: string;
  created_at: string;
}

interface FeedStreamProps {
  firebaseUser: User | null;
  items: BoardFeedItem[];
  loading: boolean;
  onReload: () => Promise<void>;
  emptyTitle: string;
  emptyDescription: string;
  highlightedCommentsByPostId?: Record<string, HighlightedCommentItem[]>;
}

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

function getDisplayTitle(item: BoardFeedItem): string {
  return item.post.title?.trim() ?? "";
}

export async function resolveBoardItemsByPublicIds(
  firebaseUser: User,
  feedPublicIds: string[],
): Promise<Record<string, BoardFeedItem>> {
  const uniqueIds = [...new Set(feedPublicIds.map((value) => value.trim()).filter(Boolean))];
  const results = await Promise.all(
    uniqueIds.map(async (feedPublicId) => {
      try {
        const response = await listBoardFeed(firebaseUser, { q: feedPublicId, limit: 20 });
        const exact = response.items.find((item) => item.post.feed_public_id === feedPublicId) ?? null;
        return [feedPublicId, exact] as const;
      } catch {
        return [feedPublicId, null] as const;
      }
    }),
  );

  const map: Record<string, BoardFeedItem> = {};
  for (const [feedPublicId, item] of results) {
    if (item) {
      map[feedPublicId] = item;
    }
  }
  return map;
}

export function FeedStream({
  firebaseUser,
  items,
  loading,
  onReload,
  emptyTitle,
  emptyDescription,
  highlightedCommentsByPostId,
}: FeedStreamProps) {
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [expandedCommentMap, setExpandedCommentMap] = useState<Record<string, boolean>>({});
  const [commentsByPost, setCommentsByPost] = useState<Record<string, BoardCommentItem[]>>({});
  const [commentsLoadingMap, setCommentsLoadingMap] = useState<Record<string, boolean>>({});
  const [commentDraftMap, setCommentDraftMap] = useState<Record<string, string>>({});
  const [commentSubmittingMap, setCommentSubmittingMap] = useState<Record<string, boolean>>({});

  const loadComments = async (postId: string) => {
    if (!firebaseUser) {
      return;
    }

    setCommentsLoadingMap((previous) => ({ ...previous, [postId]: true }));
    try {
      const comments = await listBoardComments(firebaseUser, postId, { limit: 30 });
      setCommentsByPost((previous) => ({ ...previous, [postId]: comments }));
    } catch (error) {
      setActionMessage(parseError(error));
    } finally {
      setCommentsLoadingMap((previous) => ({ ...previous, [postId]: false }));
    }
  };

  const handleLike = async (postId: string) => {
    if (!firebaseUser) {
      return;
    }

    try {
      setActionMessage(null);
      await toggleBoardLike(firebaseUser, postId);
      await onReload();
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
      await onReload();
    } catch (error) {
      setActionMessage(parseError(error));
    }
  };

  const handleReport = async (postId: string) => {
    if (!firebaseUser) {
      return;
    }

    try {
      setActionMessage(null);
      await reportBoardPost(firebaseUser, postId, {
        reason_code: "abuse",
        detail_text: "사용자 신고",
      });
      setActionMessage("신고가 접수되었습니다.");
      await onReload();
    } catch (error) {
      setActionMessage(parseError(error));
    }
  };

  const handleToggleComments = async (postId: string) => {
    const isOpen = Boolean(expandedCommentMap[postId]);
    setExpandedCommentMap((previous) => ({ ...previous, [postId]: !isOpen }));

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
  }, [expandedCommentMap, firebaseUser]);

  const handleSubmitComment = async (postId: string) => {
    if (!firebaseUser) {
      return;
    }

    const bodyText = (commentDraftMap[postId] ?? "").trim();
    if (!bodyText) {
      return;
    }

    setCommentSubmittingMap((previous) => ({ ...previous, [postId]: true }));
    try {
      await createBoardComment(firebaseUser, postId, { body_text: bodyText, is_anonymous: false });
      setCommentDraftMap((previous) => ({ ...previous, [postId]: "" }));
      await Promise.all([loadComments(postId), onReload()]);
    } catch (error) {
      setActionMessage(parseError(error));
    } finally {
      setCommentSubmittingMap((previous) => ({ ...previous, [postId]: false }));
    }
  };

  return (
    <div className="ms-stack">
      {actionMessage ? <Banner variant="info" title="안내" description={actionMessage} /> : null}

      {loading ? (
        <Card>
          <LoadingSkeleton lines={8} />
        </Card>
      ) : items.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="ms-board-list">
          {items.map((item) => {
            const postId = item.post.post_id;
            const hasTitle = Boolean(item.post.title && item.post.title.trim());
            const titleText = getDisplayTitle(item);
            const isCommentOpen = Boolean(expandedCommentMap[postId]);
            const comments = commentsByPost[postId] ?? [];
            const isCommentsLoading = Boolean(commentsLoadingMap[postId]);
            const commentDraft = commentDraftMap[postId] ?? "";
            const commentSubmitting = Boolean(commentSubmittingMap[postId]);
            const highlightedComments = highlightedCommentsByPostId?.[postId] ?? [];
            const edited = isPostEdited(item);
            const displayDateTime = formatDateTime(resolvePostTimestamp(item));

            return (
              <article key={postId} className="ms-board-post-card">
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

                {hasTitle && titleText ? <h3 className="ms-board-post-title">{titleText}</h3> : null}
                <p className={hasTitle ? "ms-board-post-body" : "ms-board-post-body ms-board-post-body--only"}>
                  {item.post.body_preview}
                </p>

                {highlightedComments.length > 0 ? (
                  <div className="ms-board-user-comment-block">
                    <p className="ms-board-user-comment-block__title">내 댓글</p>
                    <div className="ms-stack">
                      {highlightedComments.map((comment) => (
                        <div key={comment.comment_id} className="ms-board-user-comment-item">
                          <p className="ms-board-user-comment-item__body">{comment.body}</p>
                          <p className="ms-board-user-comment-item__meta">{formatDateTime(comment.created_at)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="ms-board-post-actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    className={item.engagement.viewer_liked ? "ms-board-action-btn ms-board-action-btn--active" : "ms-board-action-btn"}
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
          })}
        </div>
      )}
    </div>
  );
}
