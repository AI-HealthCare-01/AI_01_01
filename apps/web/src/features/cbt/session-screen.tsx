"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";

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
  Select,
  Textarea,
} from "../../components/ui";
import { AuthRouteGuard, useAuthContext } from "../auth";
import {
  CoreApiError,
  createCbtConversationTurn,
  createCbtSession,
  listCbtSessions,
  listPendingCbtReflections,
  saveCbtSessionReflection,
  saveCbtSessionTodo,
  type CbtConversationMessage,
  type CbtSessionResponse,
  type CbtSessionStage,
} from "../core-inputs";

type CbtTab = "chat" | "reflection" | "history";
type ActionDecision = "accept" | "decline";
type YearMonth = { year: number; month: number };

const CBT_STEPS = [
  { key: "situation", label: "상황 정리" },
  { key: "thought", label: "생각 · 감정 파악" },
  { key: "evidence", label: "근거 재검토" },
  { key: "reframe", label: "균형 문장 만들기" },
  { key: "action", label: "다음 행동 계획" },
] as const;

const TODO_NONE_LABEL = "정하지 않음";
const CBT_HISTORY_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

const ACTION_SUPPORT_HINTS: string[] = [
  "예: 10분 산책, 물 한 잔 마시기, 창가에서 3분 호흡처럼 아주 작은 행동부터 정해보세요.",
  "예: '오늘 20:30에 방에서 5분 스트레칭'처럼 시간·장소를 붙이면 실행이 쉬워집니다.",
  "완벽하게 하려 하지 말고 '오늘 1번만 해보기' 목표로 시작해도 충분합니다.",
];

const ACTION_DIFFICULTY_KEYWORDS = [
  "모르겠",
  "어려",
  "막막",
  "부담",
  "자신 없",
  "못하",
  "힘들",
  "안될",
] as const;

const PLANNER_ACTION_LABEL: Record<string, string> = {
  review_evidence: "생각 근거 정리",
  behavior_experiment: "작은 행동 실험",
  grounding: "감각 안정",
  activity_scheduling: "활동 스케줄링",
  sleep_anchor: "수면 루틴",
  support_contact: "지지 자원 연결",
};

interface CbtRecommendation {
  kind: "external" | "challenge";
  title: string;
  description: string;
  route: string | null;
}

const ACTION_RECOMMENDATIONS: Record<string, CbtRecommendation> = {
  review_evidence: {
    kind: "external",
    title: "생각 근거 정리",
    description: "오늘 있었던 장면에서 그 생각이 맞다고 느끼는 이유와 다르게 볼 이유를 1개씩 적어보세요.",
    route: null,
  },
  behavior_experiment: {
    kind: "external",
    title: "작은 행동 실험",
    description: "부담이 낮은 행동을 1회 시도하고 실제 결과를 짧게 메모해보세요.",
    route: null,
  },
  grounding: {
    kind: "challenge",
    title: "감각 안정 챌린지",
    description: "호흡/감각 안정 루틴을 통해 긴장을 낮추는 챌린지를 추천합니다.",
    route: "/challenge",
  },
  activity_scheduling: {
    kind: "challenge",
    title: "산책 10분 챌린지",
    description: "짧은 활동 스케줄링으로 리듬을 회복하는 챌린지를 추천합니다.",
    route: "/challenge",
  },
  sleep_anchor: {
    kind: "challenge",
    title: "수면 패턴 챌린지",
    description: "취침/기상 고정 루틴을 만드는 수면 챌린지를 추천합니다.",
    route: "/challenge",
  },
  support_contact: {
    kind: "external",
    title: "지지자 연결",
    description: "믿을 수 있는 지지자에게 현재 상태를 짧게 공유해보세요.",
    route: null,
  },
};

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

function listCount(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  return Array.isArray(value) ? value.length : 0;
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function containsAnyKeyword(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
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

function buildStageHintPair(
  stage: CbtSessionStage,
  draftState: Record<string, unknown>,
): [string, string] {
  const thoughtCount = listCount(draftState, "automatic_thoughts");
  const emotionCount = listCount(draftState, "emotions");
  const beliefCount =
    listCount(draftState, "intermediate_belief_hypotheses") +
    listCount(draftState, "core_belief_hypotheses");
  const evidenceForCount = listCount(draftState, "evidence_for");
  const evidenceAgainstCount = listCount(draftState, "evidence_against");
  const hasBalanced = hasText(draftState.balanced_statement);
  const behaviorCount = listCount(draftState, "behaviors");

  if (stage === "situation") {
    return [
      "오늘 가장 힘들었던 장면을 [언제·어디서·무슨 일] 순서로 짧게 적어보세요.",
      "완벽하게 설명하지 않아도 됩니다. 한 장면만 구체적으로 적으면 충분해요.",
    ];
  }
  if (stage === "thought") {
    if (thoughtCount <= 0) {
      return [
        "그 장면에서 머릿속에 가장 먼저 스친 생각을 한 문장으로 적어보세요.",
        "사실 설명보다, 그때 내 안에서 바로 떠오른 생각을 적는 게 핵심이에요.",
      ];
    }
    if (emotionCount <= 0) {
      return [
        "그 생각이 들었을 때 올라온 감정 1~2개와 강도(0~100)를 같이 적어보세요.",
        "예: 불안 75, 답답함 60처럼 숫자를 붙이면 변화 확인이 쉬워집니다.",
      ];
    }
    if (beliefCount <= 0) {
      return [
        "왜 그런 생각이 강해졌는지, 내 기준이나 기대와 연결해 한 문장으로 적어보세요.",
        "일시적 생각에서 한 단계 깊은 믿음으로 내려가면 정리가 더 선명해집니다.",
      ];
    }
    return [
      "지금 정리된 믿음이 현재 내 마음과 맞는지, 다르게 느껴지는 부분이 있는지 적어보세요.",
      "맞지 않는 부분이 있다면 어떤 점이 다른지 짚어주면 더 정확히 다듬을 수 있어요.",
    ];
  }
  if (stage === "evidence") {
    if (evidenceForCount <= 0) {
      return [
        "그 생각이 타당하다고 느껴지는 이유를 먼저 1~2개 적어보세요.",
        "지금은 '왜 맞다고 느끼는지'에만 집중해서 정리해도 괜찮아요.",
      ];
    }
    if (evidenceAgainstCount <= 0) {
      return [
        "하지만 이 생각이 틀렸다고 가정하면, 어떤 근거가 떠오르는지 적어보세요.",
        "처음에는 어색해도 괜찮아요. 작아도 반대 근거를 하나 찾아보는 게 중요해요.",
      ];
    }
    return [
      "양쪽 근거를 함께 놓고 보면, 어느 쪽에 치우치지 않는 해석을 만들 수 있습니다.",
      "이제 그 해석을 바탕으로 나에게 도움이 되는 생각을 한 문장으로 이어가보세요.",
    ];
  }
  if (stage === "reframe") {
    if (!hasBalanced) {
      return [
        "핵심 믿음 + 맞다고 느낀 이유 + 다르게 볼 이유를 반영해 교정 문장을 적어보세요.",
        "핵심 믿음을 반복하기보다, 지금의 근거를 담아 현실적으로 말하는 문장이 좋아요.",
      ];
    }
    return [
      "작성한 교정 문장이 지나치게 단정적이면 '항상/절대' 표현을 줄여 다듬어보세요.",
      "읽었을 때 숨이 조금 편해지는지 확인하면서 문장을 조정해보세요.",
    ];
  }
  if (behaviorCount <= 0) {
    return [
      "오늘 바로 해볼 수 있는 작은 행동 1개를 시간과 장소까지 붙여 적어보세요.",
      "행동은 작을수록 좋습니다. 부담이 낮아야 실제 실행으로 이어집니다.",
    ];
  }
  return [
    "지금 정한 행동을 오늘 실제로 해볼지 결정해보세요.",
    "결정을 마치면 오늘 대화를 짧게 정리하고 마무리할 수 있어요.",
  ];
}

export default function CbtSessionScreen() {
  const searchParams = useSearchParams();
  const { firebaseUser, session: authSession } = useAuthContext();
  const threadRef = useRef<HTMLDivElement | null>(null);
  const isMountedRef = useRef(true);

  const [activeTab, setActiveTab] = useState<CbtTab>("chat");
  const [messages, setMessages] = useState<CbtConversationMessage[]>([
    {
      role: "assistant",
      content:
        "안녕하세요. 상황 정리부터 시작해볼게요. 오늘 가장 부담됐던 장면을 짧게 말해주셔도 괜찮아요.",
    },
  ]);
  const [draftState, setDraftState] = useState<Record<string, unknown>>({});
  const [plannerAction, setPlannerAction] = useState<string | null>(null);
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
  const [savingTodo, setSavingTodo] = useState(false);
  const [manualTodoTitle, setManualTodoTitle] = useState("");
  const [manualTodoDescription, setManualTodoDescription] = useState("");
  const [manualTodoKind, setManualTodoKind] = useState<"external" | "challenge">("external");

  const [actionDecision, setActionDecision] = useState<ActionDecision>("accept");
  const [selectedRecommendationKey, setSelectedRecommendationKey] = useState<string>("");
  const [customActionTitle, setCustomActionTitle] = useState("");
  const [customActionDescription, setCustomActionDescription] = useState("");
  const [actionSelectionTouched, setActionSelectionTouched] = useState(false);

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
  const coachName = authSession?.account.coach_name || "마음코치";
  const userNickname =
    authSession?.account.nickname?.trim() ||
    firebaseUser?.displayName?.trim() ||
    "사용자";

  const userConversationText = useMemo(
    () =>
      messages
        .filter((item) => item.role === "user")
        .map((item) => item.content.toLowerCase())
        .join(" "),
    [messages],
  );
  const latestUserMessage = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "user") {
        return message.content.toLowerCase();
      }
    }
    return "";
  }, [messages]);

  const stepCompletion = useMemo(() => {
    const situationDone = hasText(draftState.situation) || userMessageCount >= 1;
    const thoughtDone =
      listCount(draftState, "automatic_thoughts") > 0 &&
      listCount(draftState, "emotions") > 0 &&
      (listCount(draftState, "intermediate_belief_hypotheses") > 0 ||
        listCount(draftState, "core_belief_hypotheses") > 0);
    const evidenceDone = listCount(draftState, "evidence_for") > 0 && listCount(draftState, "evidence_against") > 0;
    const reframeDone =
      hasText(draftState.balanced_statement) ||
      listCount(draftState, "distortion_candidates") > 0 ||
      listCount(draftState, "intermediate_belief_hypotheses") > 0 ||
      listCount(draftState, "core_belief_hypotheses") > 0;
    const actionDone = listCount(draftState, "behaviors") > 0;

    const sequentialThoughtDone = situationDone && thoughtDone;
    const sequentialEvidenceDone = sequentialThoughtDone && evidenceDone;
    const sequentialReframeDone = sequentialEvidenceDone && reframeDone;
    const sequentialActionDone = sequentialReframeDone && actionDone;

    return [
      situationDone,
      sequentialThoughtDone,
      sequentialEvidenceDone,
      sequentialReframeDone,
      sequentialActionDone,
    ];
  }, [draftState, userMessageCount]);

  const activeStepIndex = useMemo(() => {
    if (savedSession) {
      return CBT_STEPS.length - 1;
    }
    const firstPending = stepCompletion.findIndex((done) => !done);
    if (firstPending === -1) {
      return CBT_STEPS.length - 1;
    }
    return firstPending;
  }, [savedSession, stepCompletion]);

  const activeStage = CBT_STEPS[activeStepIndex]?.key ?? "situation";
  const allStepsComplete = stepCompletion.every(Boolean);
  const actionDiscussionReady =
    listCount(draftState, "behaviors") > 0 ||
    containsAnyKeyword(userConversationText, ["실천", "계획", "해볼", "하겠습니다", "시도", "언제"]);
  const recommendationReady = Boolean(plannerAction) && allStepsComplete && actionDiscussionReady;
  const recommendation = plannerAction && recommendationReady ? ACTION_RECOMMENDATIONS[plannerAction] ?? null : null;
  const safeRiskLevel = Math.max(0, Math.min(3, riskLevel)) as 0 | 1 | 2 | 3;
  const riskMeta = RISK_LEVEL_META[safeRiskLevel];

  const hintStage = activeStage as CbtSessionStage;
  const actionNeedsSupport =
    hintStage === "action" &&
    containsAnyKeyword(latestUserMessage, ACTION_DIFFICULTY_KEYWORDS);
  const actionSupportHintLimit = useMemo(() => {
    if (!actionNeedsSupport) {
      return 0;
    }
    const matchedCount = ACTION_DIFFICULTY_KEYWORDS.filter((keyword) => latestUserMessage.includes(keyword)).length;
    return matchedCount >= 2 ? 3 : 2;
  }, [actionNeedsSupport, latestUserMessage]);
  const stageHints = useMemo(
    () => {
      const baseHints = buildStageHintPair(hintStage, draftState);
      if (hintStage !== "action" || !actionNeedsSupport) {
        return baseHints.slice(0, 2);
      }
      const actionSupportHints = ACTION_SUPPORT_HINTS.slice(0, Math.max(2, actionSupportHintLimit));
      return [...baseHints, ...actionSupportHints].slice(0, 5);
    },
    [actionNeedsSupport, actionSupportHintLimit, draftState, hintStage],
  );

  const recommendationSelectOptions = useMemo(() => {
    const options = Object.entries(ACTION_RECOMMENDATIONS).map(([key, item]) => ({
      label: item.title,
      value: key,
    }));
    options.push({ label: "직접 입력", value: "custom" });
    return options;
  }, []);

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

  const renderSessionRecord = (
    session: CbtSessionResponse,
    options?: {
      index?: number;
      showTodoEditorWhenNone?: boolean;
    },
  ) => {
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

        {options?.showTodoEditorWhenNone && session.summary.selected_action_kind === "none" ? (
          <Card
            title="TO DO 직접 추가"
            description="이번 세션에 연결할 TO DO를 추가하면 회고하기 목록에 자동 반영됩니다."
          >
            <div className="ms-stack">
              <Input
                label="TO DO 제목"
                placeholder="예: 오늘 저녁 8시에 10분 산책하기"
                value={manualTodoTitle}
                onChange={(event) => setManualTodoTitle(event.target.value)}
              />
              <Select
                label="유형"
                value={manualTodoKind}
                onChange={(event) => setManualTodoKind(event.target.value as "external" | "challenge")}
                options={[
                  { label: "일반 행동", value: "external" },
                  { label: "챌린지 연결", value: "challenge" },
                ]}
              />
              <Textarea
                label="설명(선택)"
                rows={3}
                placeholder="행동 목표나 실행 포인트를 적어주세요."
                value={manualTodoDescription}
                onChange={(event) => setManualTodoDescription(event.target.value)}
              />
              <div className="ms-row">
                <Button onClick={() => void saveTodoForSession()} loading={savingTodo}>
                  TO DO 추가
                </Button>
              </div>
            </div>
          </Card>
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
    if (!recommendationReady || !plannerAction || actionSelectionTouched) {
      return;
    }
    setSelectedRecommendationKey(plannerAction);
    setActionDecision("accept");
  }, [actionSelectionTouched, plannerAction, recommendationReady]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser]);

  const sendMessage = async (raw: string, stage: CbtSessionStage) => {
    const trimmed = raw.trim();
    if (!firebaseUser || !trimmed || sending || conversationClosed) {
      return;
    }

    const nextMessages = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(nextMessages);
    setMessageInput("");
    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      setSending(true);
      setAssistantTyping(true);
      setAssistantDraftText("");
      const turn = await createCbtConversationTurn(firebaseUser, {
        messages: nextMessages,
        state: draftState,
        current_stage: stage,
      });
      await streamAssistantResponse(turn.assistant_message);
      setMessages((previous) => [...previous, { role: "assistant", content: turn.assistant_message }]);
      setAssistantDraftText("");
      setDraftState(turn.structured_state_draft);
      setPlannerAction(turn.planner_action);
      setRiskLevel(turn.risk_level);
      setSafetyMessage(turn.safety_message);
      setEmotionPre((previous) => previous ?? normalizeScore(turn.emotion_intensity_pre_0_100, 0, 100));
      setEmotionPost((previous) => normalizeScore(turn.emotion_intensity_post_0_100, 0, 100) ?? previous);
      setBeliefPre((previous) => previous ?? normalizeScore(turn.belief_pre_0_100, 0, 100));
      setBeliefPost((previous) => normalizeScore(turn.belief_post_0_100, 0, 100) ?? previous);
      setHomeworkCommitment((previous) => normalizeScore(turn.homework_commitment_0_10, 0, 10) ?? previous);
      setHelpfulness((previous) => normalizeScore(turn.session_helpfulness_0_10, 0, 10) ?? previous);
    } catch (error) {
      setErrorMessage(parseError(error));
      setMessages((previous) => previous.slice(0, -1));
      setMessageInput(trimmed);
    } finally {
      setAssistantDraftText("");
      setAssistantTyping(false);
      setSending(false);
    }
  };

  const resolveSelectedActionPayload = () => {
    if (!recommendationReady || actionDecision === "decline") {
      return {
        selected_action_kind: "none" as const,
        selected_action_title: TODO_NONE_LABEL,
        selected_action_description: null,
        selected_action_route: null,
      };
    }

    if (selectedRecommendationKey === "custom") {
      const title = customActionTitle.trim();
      if (title.length < 2) {
        throw new Error("custom_action_title_required");
      }
      return {
        selected_action_kind: "external" as const,
        selected_action_title: title,
        selected_action_description: customActionDescription.trim() || null,
        selected_action_route: null,
      };
    }

    const fallbackKey = plannerAction ?? "review_evidence";
    const key = selectedRecommendationKey || fallbackKey;
    const selected = ACTION_RECOMMENDATIONS[key] ?? ACTION_RECOMMENDATIONS.review_evidence;
    return {
      selected_action_kind: selected.kind,
      selected_action_title: selected.title,
      selected_action_description: selected.description,
      selected_action_route: selected.route,
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
      const response = await createCbtSession(firebaseUser, {
        date: isoNow().slice(0, 10),
        conversation: messages,
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
      if (response.summary.selected_action_kind === "none") {
        setManualTodoTitle("");
        setManualTodoDescription("");
        setManualTodoKind("external");
      }
      await loadCollections();
      setNoticeMessage("세션을 저장했고 대화를 마무리했습니다.");
    } catch (error) {
      if (error instanceof Error && error.message === "custom_action_title_required") {
        setErrorMessage("직접 입력을 선택한 경우 행동 제목을 2자 이상 입력해주세요.");
      } else {
        setErrorMessage(parseError(error));
      }
    } finally {
      setSaving(false);
    }
  };

  const saveTodoForSession = async () => {
    if (!firebaseUser || !savedSession || savingTodo) {
      return;
    }
    const title = manualTodoTitle.trim();
    if (title.length < 2) {
      setErrorMessage("TO DO 제목을 2자 이상 입력해주세요.");
      return;
    }
    try {
      setSavingTodo(true);
      setErrorMessage(null);
      setNoticeMessage(null);
      const updated = await saveCbtSessionTodo(firebaseUser, savedSession.session_id, {
        title,
        description: manualTodoDescription.trim() || null,
        kind: manualTodoKind,
        route: manualTodoKind === "challenge" ? "/challenge" : null,
      });
      setSavedSession(updated);
      setSelectedReflectionSessionId(updated.session_id);
      await loadCollections();
      setNoticeMessage("TO DO를 추가했습니다. 회고하기 탭에서 이어서 기록할 수 있습니다.");
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setSavingTodo(false);
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
    if (messageInput.trim().length < 2) {
      return;
    }
    void sendMessage(messageInput, activeStage as CbtSessionStage);
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

                    <div className="ms-cbt-left-panel__section ms-cbt-left-panel__section--hints">
                      <h3 className="ms-cbt-panel-title">힌트</h3>
                      <div className="ms-cbt-hint-list">
                        {stageHints.map((hint) => (
                          <button
                            key={hint}
                            type="button"
                            className="ms-cbt-hint"
                            disabled={conversationClosed}
                            onClick={() => setMessageInput(hint)}
                          >
                            {hint}
                          </button>
                        ))}
                      </div>
                    </div>
                  </aside>

                  <section className="ms-cbt-center-panel">
                    <div ref={threadRef} className="ms-cbt-thread" role="log" aria-live="polite" aria-label="CBT 대화 내용">
                      {messages.map((item, index) => (
                        <article
                          key={`${item.role}-${index}`}
                          className={`ms-cbt-message ms-cbt-message--${item.role}`}
                        >
                          <p className="ms-cbt-message__role">{item.role === "user" ? userNickname : coachName}</p>
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
                      <Textarea
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
                          onClick={() => void sendMessage(messageInput, activeStage as CbtSessionStage)}
                          loading={sending}
                          disabled={conversationClosed || messageInput.trim().length < 2}
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
                        {recommendationReady ? (
                          <div className="ms-cbt-action-box">
                            <Select
                              label="행동 선택"
                              value={selectedRecommendationKey || plannerAction || "review_evidence"}
                              onChange={(event) => {
                                setActionSelectionTouched(true);
                                setSelectedRecommendationKey(event.target.value);
                              }}
                              options={recommendationSelectOptions}
                            />
                            <div className="ms-cbt-action-decision">
                              <button
                                type="button"
                                className={`ms-cbt-action-decision__button${actionDecision === "accept" ? " ms-cbt-action-decision__button--active" : ""}`}
                                onClick={() => setActionDecision("accept")}
                              >
                                행동 하겠습니다
                              </button>
                              <button
                                type="button"
                                className={`ms-cbt-action-decision__button${actionDecision === "decline" ? " ms-cbt-action-decision__button--active" : ""}`}
                                onClick={() => setActionDecision("decline")}
                              >
                                이번에는 정하지 않기
                              </button>
                            </div>

                            {actionDecision === "accept" ? (
                              selectedRecommendationKey === "custom" ? (
                                <div className="ms-stack">
                                  <Input
                                    label="직접 정한 행동"
                                    placeholder="예: 저녁 8시에 10분 산책"
                                    value={customActionTitle}
                                    onChange={(event) => setCustomActionTitle(event.target.value)}
                                  />
                                  <Textarea
                                    label="설명(선택)"
                                    rows={3}
                                    placeholder="행동 내용을 간단히 적어주세요."
                                    value={customActionDescription}
                                    onChange={(event) => setCustomActionDescription(event.target.value)}
                                  />
                                </div>
                              ) : (
                                <div className="ms-stack">
                                  <p className="ms-cbt-action-type">
                                    {ACTION_RECOMMENDATIONS[selectedRecommendationKey || plannerAction || "review_evidence"]?.title ??
                                      recommendation?.title}
                                  </p>
                                  <p className="ms-cbt-action-desc">
                                    {ACTION_RECOMMENDATIONS[selectedRecommendationKey || plannerAction || "review_evidence"]?.description ??
                                      recommendation?.description}
                                  </p>
                                </div>
                              )
                            ) : (
                              <p className="ms-cbt-action-empty">세션 저장 시 &quot;TO DO: 정하지 않음&quot;으로 기록됩니다.</p>
                            )}
                          </div>
                        ) : (
                          <p className="ms-cbt-action-empty">마무리 단계에서 함께 정한 다음 행동이 여기에 표시됩니다.</p>
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
                      {renderSessionRecord(savedSession, { showTodoEditorWhenNone: true })}
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
