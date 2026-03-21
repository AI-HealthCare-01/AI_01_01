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
  type ModerationQueueItem,
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

type AggregatedModerationItem = {
  aggregate_key: string;
  primary_item: ModerationQueueItem;
  related_items: ModerationQueueItem[];
  queue_types: string[];
};

function queuePriority(queueType: string): number {
  if (queueType === "safety") {
    return 3;
  }
  if (queueType === "hate") {
    return 2;
  }
  return 1;
}

function buildAggregateKey(item: ModerationQueueItem): string {
  return `${item.target_type}:${item.target_id}`;
}

function aggregateModerationItems(data: ModerationQueuesResponse | null): AggregatedModerationItem[] {
  const items = (data?.groups ?? []).flatMap((group) => group.items);
  const grouped = new Map<string, ModerationQueueItem[]>();

  for (const item of items) {
    const key = buildAggregateKey(item);
    const existing = grouped.get(key);
    if (existing) {
      existing.push(item);
      continue;
    }
    grouped.set(key, [item]);
  }

  return Array.from(grouped.entries())
    .map(([aggregateKey, relatedItems]) => {
      const sortedRelated = [...relatedItems].sort((left, right) => {
        const priorityDiff = queuePriority(right.queue_type) - queuePriority(left.queue_type);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }
        return right.created_at.localeCompare(left.created_at);
      });
      const queueTypes = Array.from(new Set(sortedRelated.map((item) => item.queue_type))).sort(
        (left, right) => queuePriority(right) - queuePriority(left),
      );
      return {
        aggregate_key: aggregateKey,
        primary_item: sortedRelated[0],
        related_items: sortedRelated,
        queue_types: queueTypes,
      };
    })
    .sort((left, right) => {
      const priorityDiff =
        queuePriority(right.primary_item.queue_type) - queuePriority(left.primary_item.queue_type);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return right.primary_item.created_at.localeCompare(left.primary_item.created_at);
    });
}

export default function AdminModerationPage() {
  const { firebaseUser } = useAuthContext();

  const [data, setData] = useState<ModerationQueuesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedAggregateKey, setSelectedAggregateKey] = useState<string | null>(null);
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

  const aggregatedItems = useMemo(() => aggregateModerationItems(data), [data]);
  const selectedAggregate = useMemo(
    () => aggregatedItems.find((item) => item.aggregate_key === selectedAggregateKey) ?? null,
    [aggregatedItems, selectedAggregateKey],
  );

  useEffect(() => {
    if (!firebaseUser || !selectedAggregate) {
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
        const response = await getModerationQueueDetail(firebaseUser, selectedAggregate.primary_item.queue_item_id);
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
  }, [firebaseUser, selectedAggregate]);

  const summary = useMemo(() => {
    const groups = data?.groups ?? [];
    const totalQueued = groups.reduce((acc, group) => acc + group.queued_count, 0);
    const safetyQueued =
      groups.find((group) => group.queue_type === "safety")?.queued_count ?? 0;
    const hateQueued = groups.find((group) => group.queue_type === "hate")?.queued_count ?? 0;
    const reportQueued =
      groups.find((group) => group.queue_type === "report")?.queued_count ?? 0;
    return {
      totalQueued,
      uniqueQueued: aggregatedItems.length,
      safetyQueued,
      hateQueued,
      reportQueued,
    };
  }, [aggregatedItems.length, data]);

  const onCloseDetail = useCallback(() => {
    if (actionLoading) {
      return;
    }
    setSelectedAggregateKey(null);
    setDetail(null);
    setDetailErrorMessage(null);
  }, [actionLoading]);

  const onApplyAction = useCallback(
    async (actionCode: ModerationActionCode) => {
      if (!firebaseUser || !selectedAggregate) {
        return;
      }
      try {
        setActionLoading(actionCode);
        for (const item of selectedAggregate.related_items) {
          await applyModerationQueueAction(firebaseUser, item.queue_item_id, actionCode);
        }
        await load();
        setSelectedAggregateKey(null);
        setDetail(null);
      } catch (error) {
        setDetailErrorMessage(parseError(error));
      } finally {
        setActionLoading(null);
      }
    },
    [firebaseUser, load, selectedAggregate]
  );

  return (
    <SectionContainer
      title="커뮤니티 모더레이션"
      description="분리된 큐를 유지하되, 같은 게시물·댓글은 통합 검토 카드로 묶어 보여줍니다."
      action={
        <Button size="sm" variant="secondary" onClick={() => void load()} loading={loading}>
          새로고침
        </Button>
      }
    >
      {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

      {!loading && !errorMessage && data ? (
        <div className="ms-grid ms-grid--three">
          <StatCard label="검토 대상" value={String(summary.uniqueQueued)} helperText="중복 제거 기준" />
          <StatCard label="큐 항목 합계" value={String(summary.totalQueued)} helperText="모든 큐 합계" />
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
      ) : !data || aggregatedItems.length === 0 ? (
        <EmptyState title="표시할 큐가 없습니다" description="대기 중인 신고가 없습니다." />
      ) : (
        <Card
          title="통합 검토 큐"
          description={`중복을 합쳐 ${aggregatedItems.length}건을 표시합니다.`}
          action={<Badge variant="info">통합</Badge>}
        >
          <div className="ms-admin-list">
            {aggregatedItems.map((aggregate) => {
              const item = aggregate.primary_item;
              return (
                <article
                  key={aggregate.aggregate_key}
                  className="ms-admin-list__item"
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedAggregateKey(aggregate.aggregate_key)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedAggregateKey(aggregate.aggregate_key);
                    }
                  }}
                >
                  <div>
                    <p className="ms-admin-list__title">{targetTypeLabel(item.target_type)}</p>
                    <p className="ms-card__desc" style={{ fontWeight: 700 }}>
                      {item.target_title ?? "(제목 없음)"}
                    </p>
                    <p className="ms-card__desc">{item.target_preview ?? "본문 미리보기가 없습니다."}</p>
                    <p className="ms-card__desc">{moderationTargetLabel(item)}</p>
                    <div
                      className="ms-row"
                      style={{ gap: 8, flexWrap: "wrap", marginTop: 8, marginBottom: 8 }}
                    >
                      {aggregate.queue_types.map((queueType) => (
                        <Badge key={queueType} variant={queueBadgeVariant(queueType)}>
                          {queueTypeLabel(queueType)}
                        </Badge>
                      ))}
                      {aggregate.related_items.map((related) => (
                        <Badge key={related.queue_item_id} variant="neutral">
                          {moderationReasonLabel(related)}
                        </Badge>
                      ))}
                    </div>
                    <p className="ms-card__desc">
                      감지 {aggregate.related_items.length}건 · {item.created_at.slice(0, 16).replace("T", " ")}
                    </p>
                  </div>
                  <Badge variant={queueBadgeVariant(item.queue_type)}>{queueTypeLabel(item.queue_type)} 우선</Badge>
                </article>
              );
            })}
          </div>
        </Card>
      )}
      <Modal
        open={Boolean(selectedAggregateKey)}
        title="모더레이션 상세"
        description="묶인 사유를 함께 확인하고 관련 큐 항목을 한 번에 조치할 수 있습니다."
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
        {!detailLoading && !detailErrorMessage && selectedAggregate ? (
          <div className="ms-stack-sm" style={{ marginBottom: 16 }}>
            <p className="ms-card__desc">묶인 큐 항목 {selectedAggregate.related_items.length}건</p>
            <div className="ms-row" style={{ gap: 8, flexWrap: "wrap" }}>
              {selectedAggregate.related_items.map((item) => (
                <Badge key={item.queue_item_id} variant={queueBadgeVariant(item.queue_type)}>
                  {queueTypeLabel(item.queue_type)} · {moderationReasonLabel(item)}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
        {!detailLoading && !detailErrorMessage && detail?.post ? (
          <div className="ms-stack">
            <div className="ms-grid ms-grid--two">
              <StatCard
                label="검토 유형"
                value={selectedAggregate ? selectedAggregate.queue_types.map(queueTypeLabel).join(", ") : queueTypeLabel(detail.item.queue_type)}
              />
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
              <StatCard
                label="검토 유형"
                value={selectedAggregate ? selectedAggregate.queue_types.map(queueTypeLabel).join(", ") : queueTypeLabel(detail.item.queue_type)}
              />
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
