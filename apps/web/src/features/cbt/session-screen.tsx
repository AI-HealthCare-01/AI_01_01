"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  Input,
  PageContainer,
  SectionContainer,
  Textarea,
} from "../../components/ui";
import { AuthRouteGuard, useAuthContext } from "../auth";
import {
  CoreApiError,
  getCbtConversationBootstrap,
  createCbtConversationTurn,
  createCbtSession,
  listCbtSessions,
  listPendingCbtReflections,
  saveCbtSessionReflection,
  type CbtConversationMessage,
  type CbtQuickReplyItem,
  type CbtSessionResponse,
  type CbtSessionStage,
  type CbtConversationTurnResponse,
} from "../core-inputs";

type CbtTab = "chat" | "reflection" | "history";
type YearMonth = { year: number; month: number };

const CBT_STEPS = [
  { key: "situation", label: "상황" },
  { key: "emotion", label: "감정" },
  { key: "thought", label: "생각" },
  { key: "evidence", label: "근거" },
  { key: "alternative_plan", label: "새 생각" },
  { key: "summary", label: "약속·요약" },
] as const;

const CBT_STAGE_INDEX: Record<string, number> = {
  situation: 0,
  emotion: 1,
  thought: 2,
  evidence: 3,
  alternative_plan: 4,
  summary: 5,
  reframe: 4,
  action: 4,
};

const TODO_NONE_LABEL = "정하지 않음";
const CBT_HISTORY_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const CBT_TURN_PAYLOAD_LIMIT = 120;
const CBT_SAVE_PAYLOAD_LIMIT = 180;

const RISK_LEVEL_META: Record<
  0 | 1 | 2 | 3,
  {
    badgeVariant: "success" | "info" | "warning" | "danger";
    title: string;
    description: string;
  }
> = {
  0: {
    badgeVariant: "success",
    title: "일반 지원",
    description: "현재는 일반 대화 흐름으로 진행 가능합니다.",
  },
  1: {
    badgeVariant: "info",
    title: "주의 모니터링",
    description: "조금 더 천천히 상태를 확인하며 진행합니다.",
  },
  2: {
    badgeVariant: "warning",
    title: "안전 우선",
    description: "일반 권장보다 안전 안내를 우선으로 제시합니다.",
  },
  3: {
    badgeVariant: "danger",
    title: "위기 대응 우선",
    description: "즉시 도움 연결을 포함한 안전 흐름을 우선합니다.",
  },
};

function parseError(error: unknown): string {
  if (error instanceof CoreApiError) {
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

function isoNow(): string {
  return new Date().toISOString();
}

function formatLocalDate(dateValue: string): string {
  return dateValue.replaceAll("-", ".");
}

function getKstYearMonth(value = new Date()): YearMonth {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(value);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: getPart("year"),
    month: getPart("month"),
  };
}

function shiftMonth(cursor: YearMonth, offset: number): YearMonth {
  const next = new Date(Date.UTC(cursor.year, cursor.month - 1 + offset, 1));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
  };
}

function buildCalendarCells(cursor: YearMonth): Array<{ date: string | null; dayLabel: string }> {
  const firstDay = new Date(Date.UTC(cursor.year, cursor.month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();
  const cells: Array<{ date: string | null; dayLabel: string }> = [];

  for (let index = 0; index < firstDay; index += 1) {
    cells.push({ date: null, dayLabel: "" });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${cursor.year}-${String(cursor.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ date, dayLabel: String(day) });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ date: null, dayLabel: "" });
  }

  return cells;
}

function splitIntoChunks(source: string, chunkSize: number): string[] {
  if (source.length <= chunkSize) {
    return [source];
  }
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    chunks.push(source.slice(cursor, cursor + chunkSize));
    cursor += chunkSize;
  }
  return chunks;
}

function createLocalMessageId(prefix: "usr" | "asst"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function trimConversationMessages(messages: CbtConversationMessage[], limit: number): CbtConversationMessage[] {
  if (messages.length <= limit) {
    return messages;
  }
  return messages.slice(-limit);
}

function normalizeScore(value: number | null | undefined, minimum: number, maximum: number): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function formatScore(value: number | null, unit = ""): string {
  if (value === null) {
    return "-";
  }
  return `${value}${unit}`;
}

function getStateSummaryLines(session: CbtSessionResponse): {
  thought: string;
  belief: string | null;
  balanced: string;
  evidence: string;
} {
  const thought = session.summary.thought_summary || session.summary.core_belief_summary || "기록 없음";
  const rawBelief = session.summary.core_belief_summary || null;
  const belief =
    rawBelief && rawBelief.trim() && rawBelief.trim() !== thought.trim() ? rawBelief : null;
  const balanced = session.summary.balanced_statement_summary || "기록 없음";
  const evidence = session.summary.evidence_summary || "기록 없음";
  return { thought, belief, balanced, evidence };
}

export default function CbtSessionScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firebaseUser, session: authSession } = useAuthContext();
  const threadRef = useRef<HTMLDivElement | null>(null);
  const isMountedRef = useRef(true);
  const seenAssistantMessageIdsRef = useRef<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState<CbtTab>("chat");
  const [messages, setMessages] = useState<CbtConversationMessage[]>([]);
  const [draftState, setDraftState] = useState<Record<string, unknown>>({});
  const [plannerAction, setPlannerAction] = useState<string | null>(null);
  const [currentStage, setCurrentStage] = useState<CbtSessionStage>("situation");
  const [currentSubphase, setCurrentSubphase] = useState<string>("topic");
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState<number>(0);
  const [quickReplies, setQuickReplies] = useState<CbtQuickReplyItem[]>([]);
  const [actionLinks, setActionLinks] = useState<Array<{ label: string; route: string }>>([]);
  const [requiresTodayRecord, setRequiresTodayRecord] = useState(false);
  const [todayRecordRoute, setTodayRecordRoute] = useState<string | null>(null);
  const [riskLevel, setRiskLevel] = useState(0);
  const [safetyMessage, setSafetyMessage] = useState<string | null>(null);

  const [messageInput, setMessageInput] = useState("");
  const [emotionPre, setEmotionPre] = useState<number | null>(null);
  const [emotionPost, setEmotionPost] = useState<number | null>(null);
  const [beliefPre, setBeliefPre] = useState<number | null>(null);
  const [beliefPost, setBeliefPost] = useState<number | null>(null);
  const [homeworkCommitment, setHomeworkCommitment] = useState<number | null>(null);
  const [helpfulness, setHelpfulness] = useState<number | null>(null);

  const [sending, setSending] = useState(false);
  const [assistantTyping, setAssistantTyping] = useState(false);
  const [assistantDraftText, setAssistantDraftText] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [savedSession, setSavedSession] = useState<CbtSessionResponse | null>(null);
  const [conversationClosed, setConversationClosed] = useState(false);
  const [savedSessions, setSavedSessions] = useState<CbtSessionResponse[]>([]);
  const [pendingReflections, setPendingReflections] = useState<CbtSessionResponse[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);

  const [selectedReflectionSessionId, setSelectedReflectionSessionId] = useState<string | null>(null);
  const [reflectionPerformed, setReflectionPerformed] = useState<"" | "yes" | "no">("");
  const [reflectionNote, setReflectionNote] = useState("");
  const [savingReflection, setSavingReflection] = useState(false);
  const [historyMonth, setHistoryMonth] = useState<YearMonth>(getKstYearMonth());
  const [historySearchQueryInput, setHistorySearchQueryInput] = useState("");
  const [historySearchDateInput, setHistorySearchDateInput] = useState("");
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [historySearchDate, setHistorySearchDate] = useState("");
  const [historySelectedSessionId, setHistorySelectedSessionId] = useState<string | null>(null);

  const userMessageCount = useMemo(
    () => messages.filter((item) => item.role === "user").length,
    [messages],
  );
  const snapshot = (draftState.profile_snapshot ?? {}) as Record<string, unknown>;
  const coachName =
    (typeof snapshot.coach_nickname === "string" && snapshot.coach_nickname.trim()) ||
    authSession?.account.coach_name ||
    "마음코치";
  const userNickname =
    (typeof snapshot.user_nickname === "string" && snapshot.user_nickname.trim()) ||
    authSession?.account.nickname?.trim() ||
    firebaseUser?.displayName?.trim() ||
    "나";

  const activeStepIndex = useMemo(() => {
    if (savedSession || conversationClosed) {
      return CBT_STEPS.length - 1;
    }
    const serverIndex = Number.isFinite(currentPhaseIndex) ? currentPhaseIndex : CBT_STAGE_INDEX[currentStage] ?? 0;
    return Math.max(0, Math.min(CBT_STEPS.length - 1, serverIndex));
  }, [conversationClosed, currentPhaseIndex, currentStage, savedSession]);

  const safeRiskLevel = Math.max(0, Math.min(3, riskLevel)) as 0 | 1 | 2 | 3;
  const riskMeta = RISK_LEVEL_META[safeRiskLevel];
  const draftCommitmentText = useMemo(() => {
    const raw = draftState.commitment_text;
    if (typeof raw !== "string") {
      return "";
    }
    return raw.replace(/^[^:]{1,20}:\s*/, "").trim();
  }, [draftState.commitment_text]);
  const draftCommitmentType = useMemo(() => {
    const raw = draftState.commitment_type;
    return typeof raw === "string" ? raw : "";
  }, [draftState.commitment_type]);
  const draftTodoRoute = useMemo(() => {
    if (!draftCommitmentText) {
      return null;
    }
    return /(산책|호흡|수면|감각|운동|햇빛|루틴|패턴)/.test(draftCommitmentText) ? "/challenge" : null;
  }, [draftCommitmentText]);

  const selectedReflection = useMemo(
    () =>
      pendingReflections.find((item) => item.session_id === selectedReflectionSessionId) ??
      pendingReflections[0] ??
      null,
    [pendingReflections, selectedReflectionSessionId],
  );

  const historyCalendarCells = useMemo(() => buildCalendarCells(historyMonth), [historyMonth]);

  const historySessionDateSet = useMemo(() => {
    const dateSet = new Set<string>();
    for (const session of savedSessions) {
      dateSet.add(session.date);
    }
    return dateSet;
  }, [savedSessions]);

  const historyFilteredSessions = useMemo(() => {
    const query = historySearchQuery.trim().toLowerCase();
    return savedSessions.filter((session) => {
      if (historySearchDate && session.date !== historySearchDate) {
        return false;
      }
      if (!query) {
        return true;
      }
      const aggregateText = [
        session.summary.thought_summary,
        session.summary.core_belief_summary,
        session.summary.evidence_summary,
        session.summary.balanced_statement_summary,
        session.summary.selected_action_title,
        session.summary.selected_action_description,
        session.summary.reflection_note,
      ]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join(" ")
        .toLowerCase();

      return aggregateText.includes(query) || session.date.includes(query);
    });
  }, [historySearchDate, historySearchQuery, savedSessions]);

  const historyRecentSessions = useMemo(
    () => historyFilteredSessions.slice(0, 5),
    [historyFilteredSessions],
  );

  const historySelectedSession = useMemo(() => {
    if (historyRecentSessions.length === 0) {
      return null;
    }
    if (!historySelectedSessionId) {
      return historyRecentSessions[0];
    }
    return historyRecentSessions.find((item) => item.session_id === historySelectedSessionId) ?? historyRecentSessions[0];
  }, [historyRecentSessions, historySelectedSessionId]);

  const renderSessionRecord = (session: CbtSessionResponse, options?: { index?: number }) => {
    const summaryLines = getStateSummaryLines(session);
    const reflectionStatusLabel =
      session.summary.reflection_status === "completed"
        ? "완료"
        : session.summary.reflection_status === "pending"
          ? "진행 중"
          : "해당 없음";

    return (
      <article key={session.session_id} className="ms-cbt-saved-item">
        <div className="ms-cbt-saved-item__head">
          <p className="ms-cbt-saved-item__title">
            {typeof options?.index === "number" ? `${options.index + 1}. ` : ""}
            {formatLocalDate(session.date)} 세션
          </p>
          <Badge variant="neutral">레벨 {session.risk_level}</Badge>
        </div>

        <div className="ms-cbt-summary-list">
          <p className="ms-cbt-saved-item__meta">마음 불편함 변화: {session.summary.emotion_shift ?? "-"}</p>
          <p className="ms-cbt-saved-item__meta">생각 확신 변화: {session.summary.belief_shift ?? "-"}</p>
          <p className="ms-cbt-saved-item__meta">생각 패턴 점검 수: {session.summary.distortion_total_count}</p>
          <p className="ms-cbt-saved-item__meta">도움점수: {session.summary.helpfulness_0_10 ?? "-"}</p>
        </div>

        <p className="ms-cbt-saved-item__meta">핵심 생각: {summaryLines.thought}</p>
        {summaryLines.belief ? <p className="ms-cbt-saved-item__meta">핵심 신념: {summaryLines.belief}</p> : null}
        <p className="ms-cbt-saved-item__meta">근거 요약: {summaryLines.evidence}</p>
        <p className="ms-cbt-saved-item__meta">교정 문장: {summaryLines.balanced}</p>

        {session.summary.selected_action_kind === "none" ? (
          <p className="ms-cbt-saved-item__meta">TO DO: {TODO_NONE_LABEL}</p>
        ) : (
          <p className="ms-cbt-saved-item__meta">
            TO DO: {session.summary.selected_action_title}
            {session.summary.selected_action_description ? ` · ${session.summary.selected_action_description}` : ""}
          </p>
        )}

        <p className="ms-cbt-saved-item__meta">회고 상태: {reflectionStatusLabel}</p>
        {session.summary.selected_action_kind !== "none" && session.summary.reflection_status === "completed" ? (
          <p className="ms-cbt-saved-item__meta">회고 내용: {session.summary.reflection_note ?? "기록 없음"}</p>
        ) : null}

        {session.summary.selected_action_kind !== "none" && session.summary.reflection_status === "pending" ? (
          <div className="ms-row">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setActiveTab("reflection");
                setSelectedReflectionSessionId(session.session_id);
              }}
            >
              회고하기
            </Button>
          </div>
        ) : null}

      </article>
    );
  };

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab === "chat" || requestedTab === "reflection" || requestedTab === "history") {
      setActiveTab(requestedTab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!selectedReflection && pendingReflections.length > 0) {
      setSelectedReflectionSessionId(pendingReflections[0].session_id);
      return;
    }
    if (selectedReflectionSessionId && !pendingReflections.some((item) => item.session_id === selectedReflectionSessionId)) {
      setSelectedReflectionSessionId(pendingReflections[0]?.session_id ?? null);
    }
  }, [pendingReflections, selectedReflection, selectedReflectionSessionId]);

  useEffect(() => {
    if (!selectedReflection) {
      setReflectionPerformed("");
      setReflectionNote("");
      return;
    }
    if (selectedReflection.summary.reflection_performed_flag === true) {
      setReflectionPerformed("yes");
    } else if (selectedReflection.summary.reflection_performed_flag === false) {
      setReflectionPerformed("no");
    } else {
      setReflectionPerformed("");
    }
    setReflectionNote(selectedReflection.summary.reflection_note ?? "");
  }, [selectedReflection]);

  useEffect(() => {
    if (historyRecentSessions.length === 0) {
      setHistorySelectedSessionId(null);
      return;
    }
    if (!historySelectedSessionId || !historyRecentSessions.some((item) => item.session_id === historySelectedSessionId)) {
      setHistorySelectedSessionId(historyRecentSessions[0].session_id);
    }
  }, [historyRecentSessions, historySelectedSessionId]);

  const streamAssistantResponse = async (fullText: string) => {
    const normalized = fullText.trim();
    if (!normalized) {
      if (isMountedRef.current) {
        setAssistantDraftText("");
      }
      return;
    }

    const chunkSize = Math.max(3, Math.ceil(normalized.length / 34));
    const chunks = splitIntoChunks(normalized, chunkSize);
    let visible = "";

    for (const chunk of chunks) {
      if (!isMountedRef.current) {
        return;
      }
      visible += chunk;
      setAssistantDraftText(visible);
      await new Promise((resolve) => {
        window.setTimeout(resolve, 34);
      });
    }
  };

  const loadCollections = async () => {
    if (!firebaseUser) {
      return;
    }
    try {
      setLoadingCollections(true);
      const [sessions, pending] = await Promise.all([
        listCbtSessions(firebaseUser, { limit: 30 }),
        listPendingCbtReflections(firebaseUser, { limit: 100 }),
      ]);
      setSavedSessions(sessions);
      setPendingReflections(pending);
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setLoadingCollections(false);
    }
  };

  useEffect(() => {
    if (!firebaseUser) {
      return;
    }
    void loadCollections();
    void (async () => {
      try {
        const bootstrap = await getCbtConversationBootstrap(firebaseUser);
        if (!isMountedRef.current) {
          return;
        }
        setDraftState(bootstrap.structured_state_draft);
        setCurrentStage(bootstrap.current_stage);
        setCurrentSubphase(bootstrap.subphase_key);
        setCurrentPhaseIndex(bootstrap.phase_index);
        setQuickReplies(bootstrap.quick_replies);
        setActionLinks(bootstrap.action_links);
        setPlannerAction("review_evidence");
        setRiskLevel(0);
        setSafetyMessage(null);
        setEmotionPre(null);
        setEmotionPost(null);
        setBeliefPre(null);
        setBeliefPost(null);
        setHomeworkCommitment(null);
        setHelpfulness(null);
        setRequiresTodayRecord(bootstrap.requires_today_record);
        setTodayRecordRoute(bootstrap.today_record_route);
        seenAssistantMessageIdsRef.current.clear();
        for (const item of bootstrap.assistant_messages) {
          if (item.message_id && item.message_id.trim()) {
            seenAssistantMessageIdsRef.current.add(item.message_id.trim());
          }
        }
        setMessages(
          bootstrap.assistant_messages.map((item) => ({
            ...item,
            sender_name: item.sender_name || coachName,
            message_id: item.message_id || createLocalMessageId("asst"),
          })),
        );
        setConversationClosed(false);
        setSavedSession(null);
        setNoticeMessage(null);
      } catch (error) {
        if (isMountedRef.current) {
          setErrorMessage(parseError(error));
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser]);

  const applyTurnState = (
    turn: Pick<
      CbtConversationTurnResponse,
      | "structured_state_draft"
      | "planner_action"
      | "risk_level"
      | "safety_message"
      | "emotion_intensity_pre_0_100"
      | "emotion_intensity_post_0_100"
      | "belief_pre_0_100"
      | "belief_post_0_100"
      | "homework_commitment_0_10"
      | "session_helpfulness_0_10"
      | "current_stage"
      | "phase_key"
      | "subphase_key"
      | "phase_index"
      | "quick_replies"
      | "action_links"
      | "conversation_closed"
      | "requires_today_record"
      | "today_record_route"
    >,
  ) => {
    setDraftState(turn.structured_state_draft);
    setPlannerAction(turn.planner_action);
    setRiskLevel(turn.risk_level);
    setSafetyMessage(turn.safety_message);
    setCurrentStage(turn.phase_key || turn.current_stage);
    setCurrentSubphase(turn.subphase_key || "main");
    setCurrentPhaseIndex(turn.phase_index);
    setQuickReplies(turn.quick_replies);
    setActionLinks(turn.action_links);
    setConversationClosed(turn.conversation_closed);
    setRequiresTodayRecord(turn.requires_today_record);
    setTodayRecordRoute(turn.today_record_route);
    setEmotionPre((previous) => previous ?? normalizeScore(turn.emotion_intensity_pre_0_100, 0, 100));
    setEmotionPost((previous) => normalizeScore(turn.emotion_intensity_post_0_100, 0, 100) ?? previous);
    setBeliefPre((previous) => previous ?? normalizeScore(turn.belief_pre_0_100, 0, 100));
    setBeliefPost((previous) => normalizeScore(turn.belief_post_0_100, 0, 100) ?? previous);
    setHomeworkCommitment((previous) => normalizeScore(turn.homework_commitment_0_10, 0, 10) ?? previous);
    setHelpfulness((previous) => normalizeScore(turn.session_helpfulness_0_10, 0, 10) ?? previous);
  };

  const appendAssistantMessages = async (assistantMessages: CbtConversationMessage[]) => {
    for (const message of assistantMessages) {
      const resolvedId = message.message_id?.trim() || createLocalMessageId("asst");
      if (seenAssistantMessageIdsRef.current.has(resolvedId)) {
        continue;
      }
      const content = message.content.trim();
      if (!content) {
        continue;
      }
      await streamAssistantResponse(content);
      if (!isMountedRef.current) {
        return;
      }
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content,
          sender_name: message.sender_name || coachName,
          message_id: resolvedId,
        },
      ]);
      seenAssistantMessageIdsRef.current.add(resolvedId);
      setAssistantDraftText("");
      await new Promise((resolve) => {
        window.setTimeout(resolve, 42);
      });
    }
  };

  const sendMessage = async (payload: { content?: string; actionId?: string; actionLabel?: string }) => {
    const content = (payload.content ?? "").trim();
    const actionId = payload.actionId?.trim() || undefined;
    const actionLabel = payload.actionLabel?.trim() || undefined;
    if (!firebaseUser || (!content && !actionId) || sending || conversationClosed) {
      return;
    }

    const userContent = content || actionLabel || "";
    const userMessage: CbtConversationMessage = {
      role: "user",
      content: userContent,
      sender_name: userNickname,
      message_id: createLocalMessageId("usr"),
    };
    const nextMessages = [...messages, userMessage];
    const turnMessages = trimConversationMessages(nextMessages, CBT_TURN_PAYLOAD_LIMIT);
    setMessages(nextMessages);
    setMessageInput("");
    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      setSending(true);
      setAssistantTyping(true);
      setAssistantDraftText("");
      const turn = await createCbtConversationTurn(firebaseUser, {
        messages: turnMessages,
        state: draftState,
        current_stage: currentStage,
        user_input: content || undefined,
        quick_reply_action_id: actionId,
      });
      await appendAssistantMessages(turn.assistant_messages);
      applyTurnState(turn);
    } catch (error) {
      setErrorMessage(parseError(error));
      setMessages((previous) => previous.slice(0, -1));
      if (content) {
        setMessageInput(content);
      }
    } finally {
      setAssistantDraftText("");
      setAssistantTyping(false);
      setSending(false);
    }
  };

  const handleQuickReplyClick = (item: CbtQuickReplyItem) => {
    if (conversationClosed || sending) {
      return;
    }
    if (item.type === "prefill") {
      const filled = item.fill_text ?? item.label;
      setMessageInput(filled);
      window.requestAnimationFrame(() => {
        const textarea = document.getElementById("cbt-message-input") as HTMLTextAreaElement | null;
        if (!textarea) {
          return;
        }
        textarea.focus();
        const length = textarea.value.length;
        textarea.setSelectionRange(length, length);
      });
      return;
    }
    if (item.type === "action" && item.action_id) {
      void sendMessage({ actionId: item.action_id, actionLabel: item.label, content: "" });
    }
  };

  const resolveSelectedActionPayload = () => {
    const commitmentTextRaw = draftState.commitment_text;
    const commitmentTypeRaw = draftState.commitment_type;
    const commitmentText =
      typeof commitmentTextRaw === "string"
        ? commitmentTextRaw.replace(/^[^:]{1,20}:\s*/, "").trim()
        : "";
    const commitmentType = typeof commitmentTypeRaw === "string" ? commitmentTypeRaw : "";

    if (commitmentText.length < 2) {
      return {
        selected_action_kind: "none" as const,
        selected_action_title: TODO_NONE_LABEL,
        selected_action_description: null,
        selected_action_route: null,
      };
    }

    const challengeLike = /(산책|호흡|수면|감각|운동|햇빛|루틴|패턴)/.test(commitmentText);
    const kind =
      draftCommitmentType === "thought_practice"
        ? "external"
        : challengeLike
          ? "challenge"
          : "external";
    const description =
      commitmentType === "thought_practice" ? "생각 연습 TO DO" : "행동 TO DO";
    return {
      selected_action_kind: kind as "challenge" | "external",
      selected_action_title: commitmentText,
      selected_action_description: description,
      selected_action_route: challengeLike ? "/challenge" : null,
    };
  };

  const saveSession = async () => {
    if (!firebaseUser || userMessageCount < 1 || saving) {
      return;
    }

    try {
      setSaving(true);
      setErrorMessage(null);
      setNoticeMessage(null);

      const selectedAction = resolveSelectedActionPayload();
      const saveMessages = trimConversationMessages(messages, CBT_SAVE_PAYLOAD_LIMIT);
      const response = await createCbtSession(firebaseUser, {
        date: isoNow().slice(0, 10),
        conversation: saveMessages,
        state: draftState,
        duration_sec: Math.min(3600, Math.max(420, messages.length * 110)),
        emotion_intensity_pre_0_100: emotionPre ?? undefined,
        emotion_intensity_post_0_100: emotionPost ?? undefined,
        belief_pre_0_100: beliefPre ?? undefined,
        belief_post_0_100: beliefPost ?? undefined,
        homework_commitment_0_10: homeworkCommitment ?? undefined,
        homework_completed_prev_flag: false,
        session_helpfulness_0_10: helpfulness ?? undefined,
        planner_action: (plannerAction ?? undefined) as
          | "review_evidence"
          | "behavior_experiment"
          | "grounding"
          | "activity_scheduling"
          | "sleep_anchor"
          | "support_contact"
          | undefined,
        ...selectedAction,
      });

      setSavedSession(response);
      setRiskLevel(response.risk_level);
      setSafetyMessage(response.safety_message);
      setConversationClosed(true);
      await loadCollections();
      setNoticeMessage("세션을 저장했고 대화를 마무리했습니다.");
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setSaving(false);
    }
  };

  const saveReflection = async () => {
    if (!firebaseUser || !selectedReflection || savingReflection) {
      return;
    }
    if (!reflectionPerformed) {
      setErrorMessage("수행 여부를 먼저 선택해주세요.");
      return;
    }
    if (reflectionNote.trim().length < 2) {
      setErrorMessage(reflectionPerformed === "no" ? "수행하지 않은 이유를 2자 이상 입력해주세요." : "행동 후 생각을 2자 이상 입력해주세요.");
      return;
    }

    try {
      setSavingReflection(true);
      setErrorMessage(null);
      setNoticeMessage(null);
      const updated = await saveCbtSessionReflection(firebaseUser, selectedReflection.session_id, {
        performed: reflectionPerformed === "yes",
        reflection_note: reflectionNote.trim(),
      });
      setSavedSession((previous) => (previous?.session_id === updated.session_id ? updated : previous));
      await loadCollections();
      setNoticeMessage("회고하기를 저장했습니다.");
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setSavingReflection(false);
    }
  };

  const applyHistorySearch = () => {
    setHistorySearchQuery(historySearchQueryInput.trim());
    setHistorySearchDate(historySearchDateInput);
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || sending || conversationClosed) {
      return;
    }
    if (event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    if (messageInput.trim().length < 1) {
      return;
    }
    void sendMessage({ content: messageInput });
  };

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) {
      return;
    }
    thread.scrollTop = thread.scrollHeight;
  }, [assistantDraftText, assistantTyping, messages]);

  return (
    <AuthRouteGuard policy="require-active">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">CBT</Badge>
          </div>
        }
      >
        <PageContainer size="lg">
          <SectionContainer title="CBT 대화" description="상황 정리부터 다음 행동 계획까지 차례대로 진행합니다.">
            {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}
            {noticeMessage ? <Banner variant="success" title="저장 완료" description={noticeMessage} /> : null}
            {riskLevel >= 2 ? (
              <Banner
                variant="warning"
                title="안전 안내"
                description={safetyMessage ?? "위험 신호가 감지되어 안전 안내를 우선합니다."}
              />
            ) : null}

            <div className="ms-cbt-tab-strip" role="tablist" aria-label="CBT 기능 탭">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "chat"}
                className={`ms-cbt-tab-strip__tab${activeTab === "chat" ? " ms-cbt-tab-strip__tab--active" : ""}`}
                onClick={() => setActiveTab("chat")}
              >
                대화하기
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "reflection"}
                className={`ms-cbt-tab-strip__tab${activeTab === "reflection" ? " ms-cbt-tab-strip__tab--active" : ""}`}
                onClick={() => setActiveTab("reflection")}
              >
                회고하기
                {pendingReflections.length > 0 ? (
                  <span className="ms-cbt-tab-strip__badge" aria-label={`남은 회고 ${pendingReflections.length}개`}>
                    {pendingReflections.length}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "history"}
                className={`ms-cbt-tab-strip__tab${activeTab === "history" ? " ms-cbt-tab-strip__tab--active" : ""}`}
                onClick={() => setActiveTab("history")}
              >
                돌아보기
              </button>
            </div>

            {activeTab === "chat" ? (
              <>
                <div className="ms-cbt-workspace">
                  <aside className="ms-cbt-left-panel">
                    <div className="ms-cbt-left-panel__section ms-cbt-left-panel__section--steps">
                      <h3 className="ms-cbt-panel-title">진행 단계</h3>
                      <div className="ms-cbt-stepper" aria-label="CBT 진행 단계">
                        {CBT_STEPS.map((step, index) => {
                          const status =
                            index < activeStepIndex ? "complete" : index === activeStepIndex ? "active" : "pending";
                          return (
                            <div
                              key={step.key}
                              className={`ms-cbt-step ms-cbt-step--${status}`}
                              aria-current={index === activeStepIndex ? "step" : undefined}
                            >
                              <span className="ms-cbt-step__dot">{index + 1}</span>
                              <span className="ms-cbt-step__label">{step.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </aside>

                  <section className="ms-cbt-center-panel">
                    <div ref={threadRef} className="ms-cbt-thread" role="log" aria-live="polite" aria-label="CBT 대화 내용">
                      {messages.map((item, index) => (
                        <article
                          key={item.message_id || `${item.role}-${index}`}
                          className={`ms-cbt-message ms-cbt-message--${item.role}`}
                        >
                          <p className="ms-cbt-message__role">
                            {item.sender_name?.trim() || (item.role === "user" ? userNickname : coachName)}
                          </p>
                          <p className="ms-cbt-message__text">{item.content}</p>
                        </article>
                      ))}
                      {assistantTyping ? (
                        <div className="ms-cbt-message-row ms-cbt-message-row--assistant-pending">
                          <article className="ms-cbt-message ms-cbt-message--assistant ms-cbt-message--pending">
                            <p className="ms-cbt-message__role">{coachName}</p>
                            <p className="ms-cbt-message__text" aria-live="polite">
                              {assistantDraftText}
                            </p>
                          </article>
                          <span className="ms-cbt-spinner" aria-hidden="true" />
                        </div>
                      ) : null}
                    </div>

                    <div className="ms-cbt-composer">
                      {quickReplies.length > 0 ? (
                        <div className="ms-cbt-quick-replies" role="group" aria-label={`추천 답변 (${currentSubphase})`}>
                          {quickReplies.map((item, index) => (
                            <button
                              key={`${item.label}-${index}`}
                              type="button"
                              className={`ms-cbt-quick-replies__item${
                                item.type === "action" ? " ms-cbt-quick-replies__item--action" : ""
                              }`}
                              disabled={conversationClosed || sending}
                              onClick={() => handleQuickReplyClick(item)}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {actionLinks.length > 0 ? (
                        <div className="ms-cbt-action-links" role="group" aria-label="관련 화면 이동">
                          {actionLinks.map((link, index) => (
                            <Button
                              key={`${link.route}-${index}`}
                              size="sm"
                              variant="secondary"
                              onClick={() => router.push(link.route)}
                            >
                              {link.label}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                      {requiresTodayRecord && todayRecordRoute ? (
                        <div className="ms-cbt-today-record-banner">
                          <Banner
                            variant="info"
                            title="오늘 상태 기록이 아직 없어요"
                            description="원하면 먼저 오늘 기록을 남긴 뒤 다시 이어갈 수 있어요."
                          />
                          <Button size="sm" variant="secondary" onClick={() => router.push(todayRecordRoute)}>
                            오늘 기록으로 이동
                          </Button>
                        </div>
                      ) : null}
                      <Textarea
                        id="cbt-message-input"
                        label="메시지 입력"
                        placeholder={
                          conversationClosed
                            ? "세션 저장이 완료되어 대화가 마무리되었습니다."
                            : "예: 회의 전에 가슴이 답답해지고 실패할 것 같은 생각이 반복돼요."
                        }
                        value={messageInput}
                        onChange={(event) => setMessageInput(event.target.value)}
                        onKeyDown={handleInputKeyDown}
                        rows={4}
                        disabled={conversationClosed}
                      />
                      <div className="ms-cbt-composer__footer">
                        <p className="ms-cbt-composer__hint">
                          {conversationClosed ? "세션이 저장되어 입력이 종료되었습니다." : "Enter 전송 · Shift+Enter 줄바꿈"}
                        </p>
                        <Button
                          className="ms-cbt-send-button"
                          onClick={() => void sendMessage({ content: messageInput })}
                          loading={sending}
                          disabled={conversationClosed || messageInput.trim().length < 1}
                        >
                          보내기 (Enter)
                        </Button>
                      </div>
                    </div>
                  </section>

                  <aside className="ms-cbt-right-panel">
                    <div className="ms-cbt-right-panel__stack">
                      <Card className="ms-cbt-side-card" title="세션 체크포인트">
                        <div className="ms-cbt-checkpoints">
                          <p className="ms-cbt-checkpoint-live-note">대화 내용을 실시간 분석해 자동으로 업데이트됩니다.</p>
                          <div className="ms-cbt-checkpoint-group">
                            <p className="ms-cbt-checkpoint-group__label">마음 불편함 정도</p>
                            <div className="ms-cbt-checkpoint-pill-grid">
                              <div className="ms-cbt-checkpoint-pill">
                                <span className="ms-cbt-checkpoint-pill__label">세션 전</span>
                                <strong className="ms-cbt-checkpoint-pill__value">{formatScore(emotionPre)}</strong>
                              </div>
                              <div className="ms-cbt-checkpoint-pill">
                                <span className="ms-cbt-checkpoint-pill__label">현재</span>
                                <strong className="ms-cbt-checkpoint-pill__value">{formatScore(emotionPost)}</strong>
                              </div>
                            </div>
                            <p className="ms-cbt-checkpoint-note">0은 편안함, 100은 매우 힘든 상태</p>
                          </div>

                          <div className="ms-cbt-checkpoint-group">
                            <p className="ms-cbt-checkpoint-group__label">생각 확신 정도</p>
                            <div className="ms-cbt-checkpoint-pill-grid">
                              <div className="ms-cbt-checkpoint-pill">
                                <span className="ms-cbt-checkpoint-pill__label">세션 전</span>
                                <strong className="ms-cbt-checkpoint-pill__value">{formatScore(beliefPre)}</strong>
                              </div>
                              <div className="ms-cbt-checkpoint-pill">
                                <span className="ms-cbt-checkpoint-pill__label">현재</span>
                                <strong className="ms-cbt-checkpoint-pill__value">{formatScore(beliefPost)}</strong>
                              </div>
                            </div>
                            <p className="ms-cbt-checkpoint-note">처음 떠오른 문장이 사실처럼 느껴진 정도</p>
                          </div>

                          <div className="ms-cbt-checkpoint-metric-grid">
                            <div className="ms-cbt-checkpoint-metric">
                              <p className="ms-cbt-checkpoint-metric__label">다음 행동 실천 가능성</p>
                              <div className="ms-cbt-checkpoint-metric__row">
                                <div className="ms-cbt-checkpoint-value-box">
                                  <strong className="ms-cbt-checkpoint-pill__value">{formatScore(homeworkCommitment)}</strong>
                                </div>
                                <p className="ms-cbt-checkpoint-note">(0~10)</p>
                              </div>
                            </div>
                            <div className="ms-cbt-checkpoint-metric">
                              <p className="ms-cbt-checkpoint-metric__label">오늘 대화 도움 정도</p>
                              <div className="ms-cbt-checkpoint-metric__row">
                                <div className="ms-cbt-checkpoint-value-box">
                                  <strong className="ms-cbt-checkpoint-pill__value">{formatScore(helpfulness)}</strong>
                                </div>
                                <p className="ms-cbt-checkpoint-note">(0~10)</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Card>

                      <Card className="ms-cbt-side-card" title="현재 위험 레벨">
                        <div className="ms-cbt-risk-card">
                          <Badge variant={riskMeta.badgeVariant}>레벨 {safeRiskLevel}</Badge>
                          <p className="ms-cbt-risk-card__title">{riskMeta.title}</p>
                          <p className="ms-cbt-risk-card__desc">{riskMeta.description}</p>
                        </div>
                      </Card>

                      <Card className="ms-cbt-side-card" title="TO DO">
                        {draftCommitmentText ? (
                          <div className="ms-cbt-action-box">
                            <p className="ms-cbt-action-type">{draftCommitmentText}</p>
                            <p className="ms-cbt-action-desc">
                              {draftCommitmentType === "thought_practice" ? "생각 연습 TO DO" : "행동 TO DO"}
                            </p>
                            {draftTodoRoute ? (
                              <div className="ms-row">
                                <Button size="sm" variant="secondary" onClick={() => router.push(draftTodoRoute)}>
                                  오늘의 추천 챌린지 보기
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <p className="ms-cbt-action-empty">대화에서 약속이 확정되면 TO DO가 자동으로 생성됩니다.</p>
                        )}
                      </Card>
                    </div>

                    <Button fullWidth onClick={saveSession} loading={saving} disabled={userMessageCount < 1 || conversationClosed}>
                      {conversationClosed ? "세션 저장 완료" : "세션 저장하기"}
                    </Button>
                  </aside>
                </div>

                {savedSession ? (
                  <Card className="ms-cbt-postsave-card" title="세션 내용 요약" description="세션 저장 후 생성된 요약과 TO DO입니다.">
                    <div className="ms-cbt-saved-list">
                      {renderSessionRecord(savedSession)}
                    </div>
                  </Card>
                ) : null}
              </>
            ) : null}

            {activeTab === "reflection" ? (
              <div className={`ms-cbt-reflection-layout${!loadingCollections && pendingReflections.length === 0 ? " ms-cbt-reflection-layout--empty" : ""}`}>
                <Card className="ms-cbt-reflection-card" title="TO DO LIST" description="수행 여부와 행동 후 생각을 기록하면 완료됩니다.">
                  <div className="ms-cbt-reflection-card__body">
                    {loadingCollections ? (
                      <p className="ms-card__desc">불러오는 중...</p>
                    ) : pendingReflections.length === 0 ? (
                      <EmptyState
                        title="행동 약속을 다 지키셨어요!"
                        description={"오늘의 실천을 끝까지 이어온 점이 정말 좋습니다.\n다음 대화에서도 같은 흐름으로 천천히 이어가보세요."}
                      />
                    ) : (
                      <div className="ms-cbt-reflection-list">
                        {pendingReflections.map((item) => (
                          <button
                            key={item.session_id}
                            type="button"
                            className={`ms-cbt-reflection-list__item${
                              selectedReflection?.session_id === item.session_id ? " ms-cbt-reflection-list__item--active" : ""
                            }`}
                            onClick={() => setSelectedReflectionSessionId(item.session_id)}
                          >
                            <span className="ms-cbt-reflection-list__title">{item.summary.selected_action_title}</span>
                            <span className="ms-cbt-reflection-list__meta">{formatLocalDate(item.date)} 세션</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>

                <Card className="ms-cbt-reflection-card" title="회고하기" description="선택한 행동의 수행 여부와 행동 후 생각을 저장합니다.">
                  <div className="ms-cbt-reflection-card__body">
                    {!selectedReflection ? (
                      <EmptyState
                        title="남은 회고가 없습니다"
                        description="새로운 세션에서 행동을 정하면 이곳에서 회고를 이어갈 수 있습니다."
                      />
                    ) : (
                      <div className="ms-stack">
                        <div className="ms-stack">
                          <p className="ms-card__desc">
                            핵심 생각: {getStateSummaryLines(selectedReflection).thought}
                          </p>
                          {getStateSummaryLines(selectedReflection).belief ? (
                            <p className="ms-card__desc">
                              핵심 신념: {getStateSummaryLines(selectedReflection).belief}
                            </p>
                          ) : null}
                          <p className="ms-card__desc">
                            교정 문장: {getStateSummaryLines(selectedReflection).balanced}
                          </p>
                          <p className="ms-card__desc">
                            근거 요약: {getStateSummaryLines(selectedReflection).evidence}
                          </p>
                        </div>

                        <Card
                          title={selectedReflection.summary.selected_action_title}
                          description={selectedReflection.summary.selected_action_description ?? "실천하기로 정한 행동"}
                        />

                        <div className="ms-cbt-action-decision">
                          <button
                            type="button"
                            className={`ms-cbt-action-decision__button${reflectionPerformed === "yes" ? " ms-cbt-action-decision__button--active" : ""}`}
                            onClick={() => setReflectionPerformed("yes")}
                          >
                            수행했어요
                          </button>
                          <button
                            type="button"
                            className={`ms-cbt-action-decision__button${reflectionPerformed === "no" ? " ms-cbt-action-decision__button--active" : ""}`}
                            onClick={() => setReflectionPerformed("no")}
                          >
                            수행하지 않았어요
                          </button>
                        </div>

                        <Textarea
                          label={reflectionPerformed === "no" ? "수행하지 않은 이유" : "행동 후 생각"}
                          rows={5}
                          value={reflectionNote}
                          onChange={(event) => setReflectionNote(event.target.value)}
                          placeholder={
                            reflectionPerformed === "no"
                              ? "이번에는 왜 실행하기 어려웠는지 적어주세요."
                              : "행동 후 어떤 생각/느낌 변화가 있었는지 적어주세요."
                          }
                        />
                        <div className="ms-row">
                          <Button onClick={() => void saveReflection()} loading={savingReflection}>
                            저장
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            ) : null}

            {activeTab === "history" ? (
              <Card className="ms-cbt-postsave-card" title="돌아보기" description="세션 진행일을 달력으로 확인하고, 날짜/내용으로 검색할 수 있습니다.">
                {savedSessions.length === 0 ? (
                  <EmptyState title="저장된 세션이 없습니다" description="대화를 저장하면 이곳에 순서대로 표시됩니다." />
                ) : (
                  <div className="ms-cbt-history-layout">
                    <div className="ms-cbt-history-left">
                      <div className="ms-journal-calendar-box">
                        <div className="ms-journal-calendar-box__nav">
                          <Button size="sm" variant="secondary" onClick={() => setHistoryMonth((previous) => shiftMonth(previous, -1))}>
                            이전
                          </Button>
                          <p className="ms-journal-calendar-box__month">
                            {historyMonth.year}년 {historyMonth.month}월
                          </p>
                          <Button size="sm" variant="secondary" onClick={() => setHistoryMonth((previous) => shiftMonth(previous, 1))}>
                            다음
                          </Button>
                        </div>
                        <div className="ms-home-calendar-weekdays">
                          {CBT_HISTORY_WEEKDAYS.map((weekday) => (
                            <span key={weekday}>{weekday}</span>
                          ))}
                        </div>
                        <div className="ms-home-calendar-grid">
                          {historyCalendarCells.map((cell, index) => {
                            if (!cell.date) {
                              return <div key={`cbt-history-empty-${index}`} className="ms-home-calendar-cell ms-home-calendar-cell--empty" aria-hidden="true" />;
                            }
                            const selectedDate = cell.date;
                            const hasSession = historySessionDateSet.has(selectedDate);
                            const isSelected = historySearchDateInput === selectedDate;
                            return (
                              <button
                                key={selectedDate}
                                type="button"
                                className={`ms-home-calendar-cell${hasSession ? " ms-home-calendar-cell--active" : ""}${isSelected ? " ms-home-calendar-cell--selected" : ""}`}
                                onClick={() => {
                                  setHistorySearchDateInput(selectedDate);
                                  setHistorySearchDate(selectedDate);
                                }}
                                aria-label={`${selectedDate} ${hasSession ? "세션 있음" : "세션 없음"}`}
                              >
                                {cell.dayLabel}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="ms-cbt-history-search-row">
                        <Input
                          label="일자 검색"
                          type="date"
                          value={historySearchDateInput}
                          onChange={(event) => setHistorySearchDateInput(event.target.value)}
                        />
                        <Input
                          label="내용 검색"
                          placeholder="핵심 생각, 교정 문장, TO DO, 회고 내용"
                          value={historySearchQueryInput}
                          onChange={(event) => setHistorySearchQueryInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              applyHistorySearch();
                            }
                          }}
                        />
                        <Button variant="secondary" onClick={applyHistorySearch}>
                          검색
                        </Button>
                      </div>

                      <div className="ms-cbt-history-collapse">
                        <div className="ms-cbt-history-collapse__head">
                          <p className="ms-card__desc">세션 선택 (최대 5개)</p>
                        </div>
                        {historyRecentSessions.length === 0 ? (
                          <EmptyState title="검색된 세션이 없습니다" description="검색어 또는 일자를 바꿔 다시 시도해보세요." />
                        ) : (
                          <div className="ms-cbt-history-picker-list">
                            {historyRecentSessions.map((item, index) => {
                              const isSelected = historySelectedSession?.session_id === item.session_id;
                              return (
                                <button
                                  key={item.session_id}
                                  type="button"
                                  className={`ms-cbt-history-picker-item${isSelected ? " ms-cbt-history-picker-item--active" : ""}`}
                                  onClick={() => setHistorySelectedSessionId(item.session_id)}
                                >
                                  <span className="ms-cbt-history-picker-item__title">
                                    {index + 1}. {formatLocalDate(item.date)} 세션
                                  </span>
                                  <span className="ms-cbt-history-picker-item__meta">
                                    {item.summary.core_belief_summary || item.summary.thought_summary || "핵심 요약 없음"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="ms-cbt-history-right">
                      {!historySelectedSession ? (
                        <EmptyState title="선택된 세션이 없습니다" description="왼쪽에서 날짜나 검색 결과를 선택해주세요." />
                      ) : (
                        renderSessionRecord(historySelectedSession)
                      )}
                    </div>
                  </div>
                )}
              </Card>
            ) : null}
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
