"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Modal,
  SectionContainer,
  StatCard,
} from "../../../src/components/ui";
import { useAuthContext } from "../../../src/features/auth";
import {
  applyModerationQueueAction,
  CommunityApiError,
  getModerationQueueDetail,
  listModerationQueues,
  type ModerationActionCode,
  type ModerationQueueDetailResponse,
  type ModerationQueuesResponse,
} from "../../../src/features/community";

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

function queueBadgeVariant(queueType: string): "warning" | "danger" | "info" {
  if (queueType === "safety") {
    return "danger";
  }
  if (queueType === "hate") {
    return "warning";
  }
  return "info";
}

function queueTypeLabel(queueType: string): string {
  if (queueType === "safety") {
    return "안전";
  }
  if (queueType === "hate") {
    return "유해언어";
  }
  if (queueType === "report") {
    return "신고";
  }
  return queueType;
}

function targetTypeLabel(targetType: string): string {
  if (targetType === "post") {
    return "게시글";
  }
  if (targetType === "comment") {
    return "댓글";
  }
  return targetType;
}

function moderationReasonLabel(item: {
  queue_type: string;
  reason_code: string | null;
  source_type: string;
}): string {
  if (item.reason_code === "hate") {
    return "혐오/욕설 신고";
  }
  if (item.reason_code === "abuse") {
    return "폭언/괴롭힘 신고";
  }
  if (item.reason_code === "sexual_harassment") {
    return "성희롱 신고";
  }
  if (item.reason_code === "self_harm_signal") {
    return "자해 위험 신고";
  }
  if (item.reason_code === "violence_signal") {
    return "폭력 위험 신고";
  }
  if (item.reason_code === "threat") {
    return "위협 신고";
  }
  if (item.source_type === "model_text_scan" || item.source_type === "rule_model_text_scan") {
    return item.queue_type === "safety" ? "위기 신호 자동 감지" : "유해 표현 자동 감지";
  }
  if (item.source_type === "rule_text_scan") {
    return item.queue_type === "safety" ? "안전 키워드 감지" : "금칙어 감지";
  }
  if (item.source_type === "report") {
    return "사용자 신고";
  }
  return "자동 감지";
}

function moderationTargetLabel(item: { target_type: string; target_public_id: string | null }): string {
  if (item.target_type === "post") {
    return item.target_public_id ? `피드 ${item.target_public_id}` : "게시글";
  }
  if (item.target_type === "comment") {
    return item.target_public_id ? `댓글 · 피드 ${item.target_public_id}` : "댓글";
  }
  return item.target_type;
}

export default function AdminModerationPage() {
  const { firebaseUser } = useAuthContext();

  const [data, setData] = useState<ModerationQueuesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedQueueItemId, setSelectedQueueItemId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ModerationQueueDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErrorMessage, setDetailErrorMessage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<ModerationActionCode | null>(null);

  const load = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const response = await listModerationQueues(firebaseUser, 30);
      setData(response);
    } catch (error) {
      setErrorMessage(parseError(error));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!firebaseUser || !selectedQueueItemId) {
      setDetail(null);
      setDetailErrorMessage(null);
      setDetailLoading(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        setDetailLoading(true);
        setDetailErrorMessage(null);
        const response = await getModerationQueueDetail(firebaseUser, selectedQueueItemId);
        if (cancelled) {
          return;
        }
        setDetail(response);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setDetail(null);
        setDetailErrorMessage(parseError(error));
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser, selectedQueueItemId]);

  const summary = useMemo(() => {
    const groups = data?.groups ?? [];
    const totalQueued = groups.reduce((acc, group) => acc + group.queued_count, 0);
    const safetyQueued =
      groups.find((group) => group.queue_type === "safety")?.queued_count ?? 0;
    const hateQueued = groups.find((group) => group.queue_type === "hate")?.queued_count ?? 0;
    const reportQueued =
      groups.find((group) => group.queue_type === "report")?.queued_count ?? 0;
    return { totalQueued, safetyQueued, hateQueued, reportQueued };
  }, [data]);

  const onCloseDetail = useCallback(() => {
    if (actionLoading) {
      return;
    }
    setSelectedQueueItemId(null);
    setDetail(null);
    setDetailErrorMessage(null);
  }, [actionLoading]);

  const onApplyAction = useCallback(
    async (actionCode: ModerationActionCode) => {
      if (!firebaseUser || !detail) {
        return;
      }
      try {
        setActionLoading(actionCode);
        await applyModerationQueueAction(firebaseUser, detail.item.queue_item_id, actionCode);
        await load();
        setSelectedQueueItemId(null);
        setDetail(null);
      } catch (error) {
        setDetailErrorMessage(parseError(error));
      } finally {
        setActionLoading(null);
      }
    },
    [detail, firebaseUser, load]
  );

  return (
    <SectionContainer
      title="커뮤니티 모더레이션"
      description="신고/유해언어/안전 큐를 분리해 운영합니다."
      action={
        <Button size="sm" variant="secondary" onClick={() => void load()} loading={loading}>
          새로고침
        </Button>
      }
    >
      {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

      {!loading && !errorMessage && data ? (
        <div className="ms-grid ms-grid--three">
          <StatCard label="전체 대기" value={String(summary.totalQueued)} helperText="모든 큐 합계" />
          <StatCard label="안전 큐" value={String(summary.safetyQueued)} helperText="고위험 신호" />
          <StatCard label="유해언어 큐" value={String(summary.hateQueued)} helperText="유해 표현 검토" />
          <StatCard label="신고 큐" value={String(summary.reportQueued)} helperText="사용자 신고 항목" />
        </div>
      ) : null}

      {loading ? (
        <Card>
          <LoadingSkeleton lines={8} />
        </Card>
      ) : errorMessage ? (
        <ErrorState
          title="모더레이션 큐를 불러오지 못했습니다"
          description="잠시 후 다시 시도해 주세요."
          retryAction={<Button onClick={() => void load()}>다시 시도</Button>}
        />
      ) : !data || data.groups.length === 0 ? (
        <EmptyState title="표시할 큐가 없습니다" description="대기 중인 신고가 없습니다." />
      ) : (
        <div className="ms-grid ms-grid--three">
          {data.groups.map((group) => (
            <Card
              key={group.queue_type}
              title={`${queueTypeLabel(group.queue_type)} 큐`}
              description={`대기 ${group.queued_count}건`}
              action={<Badge variant={queueBadgeVariant(group.queue_type)}>{queueTypeLabel(group.queue_type)}</Badge>}
            >
              {group.items.length === 0 ? (
                <p className="ms-card__desc">현재 대기 항목이 없습니다.</p>
              ) : (
                <div className="ms-admin-list">
                  {group.items.slice(0, 5).map((item) => (
                    <article
                      key={item.queue_item_id}
                      className="ms-admin-list__item"
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedQueueItemId(item.queue_item_id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedQueueItemId(item.queue_item_id);
                        }
                      }}
                    >
                      <div>
                        <p className="ms-admin-list__title">{targetTypeLabel(item.target_type)}</p>
                        <p className="ms-card__desc" style={{ fontWeight: 700 }}>
                          {item.target_title ?? "(제목 없음)"}
                        </p>
                        <p className="ms-card__desc">
                          {item.target_preview ?? "본문 미리보기가 없습니다."}
                        </p>
                        <p className="ms-card__desc">
                          {moderationTargetLabel(item)} · {moderationReasonLabel(item)}
                        </p>
                        <p className="ms-card__desc">{item.created_at.slice(0, 16).replace("T", " ")}</p>
                      </div>
                      <Badge variant="info">{item.status}</Badge>
                    </article>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <Modal
        open={Boolean(selectedQueueItemId)}
        title="모더레이션 상세"
        description="대상 게시물/댓글 원문을 확인하고 즉시 조치할 수 있습니다."
        onClose={onCloseDetail}
        footer={
          detail ? (
            <>
              <Button
                variant="secondary"
                onClick={() => void onApplyAction("dismiss")}
                loading={actionLoading === "dismiss"}
              >
                큐 종료
              </Button>
              <Button
                variant="secondary"
                onClick={() => void onApplyAction("restore")}
                loading={actionLoading === "restore"}
              >
                복구
              </Button>
              <Button
                variant="danger"
                onClick={() => void onApplyAction("hide")}
                loading={actionLoading === "hide"}
              >
                숨김
              </Button>
              <Button
                variant="danger"
                onClick={() => void onApplyAction("delete")}
                loading={actionLoading === "delete"}
              >
                삭제
              </Button>
            </>
          ) : undefined
        }
      >
        {detailLoading ? <LoadingSkeleton lines={8} /> : null}
        {detailErrorMessage ? (
          <Banner variant="danger" title="상세 조회 실패" description={detailErrorMessage} />
        ) : null}
        {!detailLoading && !detailErrorMessage && detail?.post ? (
          <div className="ms-stack">
            <div className="ms-grid ms-grid--two">
              <StatCard label="큐 유형" value={queueTypeLabel(detail.item.queue_type)} />
              <StatCard label="작성자" value={detail.post.author.display_name} />
            </div>
            <Card
              title={detail.post.title ?? "(제목 없음)"}
              description={`${detail.post.feed_public_id} · ${detail.post.created_at.slice(0, 16).replace("T", " ")}`}
            >
              <p style={{ whiteSpace: "pre-wrap" }}>{detail.post.body_text}</p>
              <div className="ms-stack-sm" style={{ marginTop: 16 }}>
                <p className="ms-card__desc">현재 노출 상태: {detail.post.visibility_status}</p>
                <p className="ms-card__desc">모더레이션 상태: {detail.post.moderation_status}</p>
                <p className="ms-card__desc">탐지 소스: {detail.item.source_type}</p>
                <p className="ms-card__desc">사유: {detail.item.reason_code ?? "no_reason"}</p>
                <p className="ms-card__desc">
                  신뢰도: {detail.item.confidence !== null ? detail.item.confidence.toFixed(2) : "-"}
                </p>
              </div>
            </Card>
          </div>
        ) : null}
        {!detailLoading && !detailErrorMessage && detail?.comment ? (
          <div className="ms-stack">
            <div className="ms-grid ms-grid--two">
              <StatCard label="큐 유형" value={queueTypeLabel(detail.item.queue_type)} />
              <StatCard label="작성자" value={detail.comment.author.display_name} />
            </div>
            <Card
              title="댓글 원문"
              description={`${detail.comment.post_feed_public_id ?? detail.comment.post_id} · ${detail.comment.created_at.slice(0, 16).replace("T", " ")}`}
            >
              <p style={{ whiteSpace: "pre-wrap" }}>{detail.comment.body_text}</p>
              <div className="ms-stack-sm" style={{ marginTop: 16 }}>
                <p className="ms-card__desc">현재 노출 상태: {detail.comment.visibility_status}</p>
                <p className="ms-card__desc">탐지 소스: {detail.item.source_type}</p>
                <p className="ms-card__desc">사유: {detail.item.reason_code ?? "no_reason"}</p>
                <p className="ms-card__desc">
                  신뢰도: {detail.item.confidence !== null ? detail.item.confidence.toFixed(2) : "-"}
                </p>
              </div>
            </Card>
          </div>
        ) : null}
      </Modal>
    </SectionContainer>
  );
}
