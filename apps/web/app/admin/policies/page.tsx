"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingSkeleton,
  SectionContainer,
  Select,
} from "../../../src/components/ui";
import { useAuthContext } from "../../../src/features/auth";
import {
  AdminApiError,
  applyPolicyChange,
  createPolicyDraft,
  decideOwnerApproval,
  listOwnerApprovals,
  listPolicyChanges,
  submitOwnerApproval,
  useAdminConsoleContext,
  type OwnerApprovalRecord,
  type PolicyChangeRecord,
  type PolicyDomain,
} from "../../../src/features/admin-console";

type ChallengePolicyForm = {
  max_active_sustained: number;
  allow_same_domain_duplicate: boolean;
  default_target_days: number;
  require_daily_reflection: boolean;
  reminder_default_time: string;
};

type BoardPolicyForm = {
  harmful_language_auto_hide: boolean;
  report_auto_queue_threshold: number;
  safety_keyword_alert_enabled: boolean;
  post_edit_window_minutes: number;
};

type CbtPolicyForm = {
  max_sessions_per_day: number;
  safety_escalation_threshold: number;
  suggest_grounding_first: boolean;
};

type SurveyPolicyForm = {
  default_cycle_days: number;
  reminder_day_offsets: string;
  reminder_push_enabled: boolean;
  reminder_email_enabled: boolean;
};

type JournalPolicyForm = {
  active_category_tags: string[];
};

const defaultJournalCategoryTags = [
  "감사한 일",
  "아쉬운 일",
  "속상한 일",
  "화나는 일",
  "기쁜 일",
  "후회되는 일",
] as const;

const domainOptions: Array<{ label: string; value: PolicyDomain }> = [
  { label: "챌린지 정책", value: "challenge_policy" },
  { label: "CBT 정책", value: "cbt_policy" },
  { label: "검사 알림 정책", value: "survey_notification_policy" },
  { label: "커뮤니티 정책", value: "board_policy" },
  { label: "한줄일기 정책", value: "journal_policy" },
];

const defaultChallengePolicy: ChallengePolicyForm = {
  max_active_sustained: 3,
  allow_same_domain_duplicate: false,
  default_target_days: 7,
  require_daily_reflection: true,
  reminder_default_time: "08:00",
};

const defaultBoardPolicy: BoardPolicyForm = {
  harmful_language_auto_hide: true,
  report_auto_queue_threshold: 3,
  safety_keyword_alert_enabled: true,
  post_edit_window_minutes: 30,
};

const defaultCbtPolicy: CbtPolicyForm = {
  max_sessions_per_day: 3,
  safety_escalation_threshold: 2,
  suggest_grounding_first: true,
};

const defaultSurveyPolicy: SurveyPolicyForm = {
  default_cycle_days: 28,
  reminder_day_offsets: "0,2,5",
  reminder_push_enabled: true,
  reminder_email_enabled: false,
};

const defaultJournalPolicy: JournalPolicyForm = {
  active_category_tags: [...defaultJournalCategoryTags],
};

function parseError(error: unknown): string {
  if (error instanceof AdminApiError) {
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

function statusBadgeVariant(status: string): "neutral" | "warning" | "success" | "danger" | "info" {
  if (status === "pending_owner_approval") {
    return "warning";
  }
  if (status === "approved" || status === "applied") {
    return "success";
  }
  if (status === "rejected") {
    return "danger";
  }
  if (status === "draft") {
    return "info";
  }
  return "neutral";
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeJournalTags(values: string[]): string[] {
  const next: string[] = [];
  const seen = new Set<string>();
  values.forEach((raw) => {
    const value = raw.trim().slice(0, 24);
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    next.push(value);
  });
  return next.slice(0, 12);
}

function domainLabel(domain: PolicyDomain): string {
  const found = domainOptions.find((option) => option.value === domain);
  return found?.label ?? domain;
}

export default function AdminPoliciesPage() {
  const { firebaseUser } = useAuthContext();
  const { me } = useAdminConsoleContext();

  const [title, setTitle] = useState("");
  const [domain, setDomain] = useState<PolicyDomain>("challenge_policy");

  const [challengePolicy, setChallengePolicy] = useState<ChallengePolicyForm>(defaultChallengePolicy);
  const [boardPolicy, setBoardPolicy] = useState<BoardPolicyForm>(defaultBoardPolicy);
  const [cbtPolicy, setCbtPolicy] = useState<CbtPolicyForm>(defaultCbtPolicy);
  const [surveyPolicy, setSurveyPolicy] = useState<SurveyPolicyForm>(defaultSurveyPolicy);
  const [journalPolicy, setJournalPolicy] = useState<JournalPolicyForm>(defaultJournalPolicy);
  const [newJournalTag, setNewJournalTag] = useState("");

  const [records, setRecords] = useState<PolicyChangeRecord[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<OwnerApprovalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const isOwner = me?.actor.base_role === "owner";

  const load = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const [policies, pending] = await Promise.all([
        listPolicyChanges(firebaseUser, { limit: 100 }),
        listOwnerApprovals(firebaseUser, {
          status: "pending_owner_approval",
          limit: 100,
        }),
      ]);
      setRecords(policies);
      setPendingApprovals(pending.filter((item) => item.object_type === "policy_change"));
    } catch (error) {
      setErrorMessage(parseError(error));
      setRecords([]);
      setPendingApprovals([]);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const latestByDomain = useMemo(() => {
    const map = new Map<PolicyDomain, PolicyChangeRecord>();
    for (const record of records) {
      if (!map.has(record.policy_domain)) {
        map.set(record.policy_domain, record);
      }
    }
    return map;
  }, [records]);

  useEffect(() => {
    const challengeDraft = latestByDomain.get("challenge_policy")?.draft_json;
    if (challengeDraft) {
      setChallengePolicy({
        max_active_sustained: clampInt(
          asNumber(challengeDraft.max_active_sustained, defaultChallengePolicy.max_active_sustained),
          1,
          5,
        ),
        allow_same_domain_duplicate: asBoolean(
          challengeDraft.allow_same_domain_duplicate,
          defaultChallengePolicy.allow_same_domain_duplicate,
        ),
        default_target_days: clampInt(
          asNumber(challengeDraft.default_target_days, defaultChallengePolicy.default_target_days),
          1,
          28,
        ),
        require_daily_reflection: asBoolean(
          challengeDraft.require_daily_reflection,
          defaultChallengePolicy.require_daily_reflection,
        ),
        reminder_default_time: asString(
          challengeDraft.reminder_default_time,
          defaultChallengePolicy.reminder_default_time,
        ),
      });
    }

    const boardDraft = latestByDomain.get("board_policy")?.draft_json;
    if (boardDraft) {
      setBoardPolicy({
        harmful_language_auto_hide: asBoolean(
          boardDraft.harmful_language_auto_hide,
          defaultBoardPolicy.harmful_language_auto_hide,
        ),
        report_auto_queue_threshold: clampInt(
          asNumber(boardDraft.report_auto_queue_threshold, defaultBoardPolicy.report_auto_queue_threshold),
          1,
          10,
        ),
        safety_keyword_alert_enabled: asBoolean(
          boardDraft.safety_keyword_alert_enabled,
          defaultBoardPolicy.safety_keyword_alert_enabled,
        ),
        post_edit_window_minutes: clampInt(
          asNumber(boardDraft.post_edit_window_minutes, defaultBoardPolicy.post_edit_window_minutes),
          0,
          180,
        ),
      });
    }

    const cbtDraft = latestByDomain.get("cbt_policy")?.draft_json;
    if (cbtDraft) {
      setCbtPolicy({
        max_sessions_per_day: clampInt(
          asNumber(cbtDraft.max_sessions_per_day, defaultCbtPolicy.max_sessions_per_day),
          1,
          10,
        ),
        safety_escalation_threshold: clampInt(
          asNumber(cbtDraft.safety_escalation_threshold, defaultCbtPolicy.safety_escalation_threshold),
          1,
          3,
        ),
        suggest_grounding_first: asBoolean(
          cbtDraft.suggest_grounding_first,
          defaultCbtPolicy.suggest_grounding_first,
        ),
      });
    }

    const surveyDraft = latestByDomain.get("survey_notification_policy")?.draft_json;
    if (surveyDraft) {
      const offsets =
        Array.isArray(surveyDraft.reminder_day_offsets) &&
        surveyDraft.reminder_day_offsets.every((value) => typeof value === "number")
          ? (surveyDraft.reminder_day_offsets as number[]).join(",")
          : defaultSurveyPolicy.reminder_day_offsets;
      setSurveyPolicy({
        default_cycle_days: clampInt(
          asNumber(surveyDraft.default_cycle_days, defaultSurveyPolicy.default_cycle_days),
          7,
          90,
        ),
        reminder_day_offsets: offsets,
        reminder_push_enabled: asBoolean(
          surveyDraft.reminder_push_enabled,
          defaultSurveyPolicy.reminder_push_enabled,
        ),
        reminder_email_enabled: asBoolean(
          surveyDraft.reminder_email_enabled,
          defaultSurveyPolicy.reminder_email_enabled,
        ),
      });
    }

    const journalDraft = latestByDomain.get("journal_policy")?.draft_json;
    if (journalDraft) {
      const nextTags = Array.isArray(journalDraft.active_category_tags)
        ? normalizeJournalTags(journalDraft.active_category_tags.map((value) => String(value)))
        : [...defaultJournalCategoryTags];
      setJournalPolicy({
        active_category_tags: nextTags.length > 0 ? nextTags : [...defaultJournalCategoryTags],
      });
    }
  }, [latestByDomain]);

  const pendingByObjectId = useMemo(() => {
    const map = new Map<string, OwnerApprovalRecord>();
    pendingApprovals.forEach((item) => {
      map.set(item.object_id, item);
    });
    return map;
  }, [pendingApprovals]);

  const draftJson = useMemo((): Record<string, unknown> => {
    if (domain === "challenge_policy") {
      return {
        ...challengePolicy,
      };
    }
    if (domain === "board_policy") {
      return {
        ...boardPolicy,
      };
    }
    if (domain === "cbt_policy") {
      return {
        ...cbtPolicy,
      };
    }
    if (domain === "journal_policy") {
      return {
        active_category_tags: journalPolicy.active_category_tags,
      };
    }

    const reminderOffsets = surveyPolicy.reminder_day_offsets
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.max(0, Math.min(30, Math.round(value))));

    return {
      default_cycle_days: surveyPolicy.default_cycle_days,
      reminder_day_offsets: reminderOffsets,
      reminder_push_enabled: surveyPolicy.reminder_push_enabled,
      reminder_email_enabled: surveyPolicy.reminder_email_enabled,
    };
  }, [boardPolicy, cbtPolicy, challengePolicy, domain, journalPolicy.active_category_tags, surveyPolicy]);

  const handleCreateDraft = async () => {
    if (!firebaseUser || !title.trim()) {
      return;
    }

    try {
      setWorkingId("create");
      setActionMessage(null);
      await createPolicyDraft(firebaseUser, {
        policy_domain: domain,
        title: title.trim(),
        draft_json: draftJson,
      });
      setActionMessage("정책 draft가 생성되었습니다.");
      setTitle("");
      await load();
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setWorkingId(null);
    }
  };

  const handleSubmitForOwner = async (policyChangeId: string) => {
    if (!firebaseUser) {
      return;
    }

    try {
      setWorkingId(policyChangeId);
      setActionMessage(null);
      await submitOwnerApproval(firebaseUser, {
        object_type: "policy_change",
        object_id: policyChangeId,
      });
      setActionMessage("Owner 승인 요청이 등록되었습니다.");
      await load();
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setWorkingId(null);
    }
  };

  const handleApply = async (policyChangeId: string) => {
    if (!firebaseUser) {
      return;
    }

    try {
      setWorkingId(policyChangeId);
      setActionMessage(null);
      await applyPolicyChange(firebaseUser, policyChangeId);
      setActionMessage("승인된 정책이 적용되었습니다.");
      await load();
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setWorkingId(null);
    }
  };

  const handleDecision = async (approvalId: string, decision: "approved" | "rejected") => {
    if (!firebaseUser) {
      return;
    }

    try {
      setWorkingId(approvalId);
      setActionMessage(null);
      await decideOwnerApproval(firebaseUser, approvalId, {
        decision,
        decision_note: decision === "approved" ? "owner 승인" : "owner 반려",
      });
      setActionMessage(`요청이 ${decision === "approved" ? "승인" : "반려"}되었습니다.`);
      await load();
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <SectionContainer
      title="정책 관리"
      description="운영자가 체크/입력으로 정책 변경안을 만들고, Owner 승인 후 적용합니다."
    >
      {actionMessage ? <Banner variant="success" title="완료" description={actionMessage} /> : null}
      {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

      <Card title="정책 draft 생성" description="도메인별 입력 폼으로 수정안을 만들 수 있습니다.">
        <div className="ms-grid ms-grid--two">
          <Input
            label="제목"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="예: 커뮤니티 신고 정책 v2"
          />
          <Select
            label="정책 도메인"
            value={domain}
            onChange={(event) => setDomain(event.target.value as PolicyDomain)}
            options={domainOptions}
          />
        </div>

        {domain === "challenge_policy" ? (
          <Card title="챌린지 정책 입력">
            <div className="ms-grid ms-grid--two">
              <Input
                label="동시 활성 지속형 챌린지 수"
                type="number"
                min={1}
                max={5}
                value={challengePolicy.max_active_sustained}
                onChange={(event) =>
                  setChallengePolicy((previous) => ({
                    ...previous,
                    max_active_sustained: clampInt(Number(event.target.value) || 1, 1, 5),
                  }))
                }
              />
              <Input
                label="기본 목표 일수"
                type="number"
                min={1}
                max={28}
                value={challengePolicy.default_target_days}
                onChange={(event) =>
                  setChallengePolicy((previous) => ({
                    ...previous,
                    default_target_days: clampInt(Number(event.target.value) || 1, 1, 28),
                  }))
                }
              />
              <Input
                label="기본 리마인드 시간"
                type="time"
                value={challengePolicy.reminder_default_time}
                onChange={(event) =>
                  setChallengePolicy((previous) => ({ ...previous, reminder_default_time: event.target.value }))
                }
              />
            </div>
            <label className="ms-check-row" htmlFor="challenge-domain-duplicate">
              <input
                id="challenge-domain-duplicate"
                type="checkbox"
                checked={challengePolicy.allow_same_domain_duplicate}
                onChange={(event) =>
                  setChallengePolicy((previous) => ({
                    ...previous,
                    allow_same_domain_duplicate: event.target.checked,
                  }))
                }
              />
              같은 도메인 챌린지 중복 활성 허용
            </label>
            <label className="ms-check-row" htmlFor="challenge-daily-reflection">
              <input
                id="challenge-daily-reflection"
                type="checkbox"
                checked={challengePolicy.require_daily_reflection}
                onChange={(event) =>
                  setChallengePolicy((previous) => ({
                    ...previous,
                    require_daily_reflection: event.target.checked,
                  }))
                }
              />
              일별 회고 입력 필수
            </label>
          </Card>
        ) : null}

        {domain === "board_policy" ? (
          <Card title="커뮤니티 정책 입력">
            <div className="ms-grid ms-grid--two">
              <Input
                label="자동 큐 전송 신고 건수"
                type="number"
                min={1}
                max={10}
                value={boardPolicy.report_auto_queue_threshold}
                onChange={(event) =>
                  setBoardPolicy((previous) => ({
                    ...previous,
                    report_auto_queue_threshold: clampInt(Number(event.target.value) || 1, 1, 10),
                  }))
                }
              />
              <Input
                label="글 수정 허용 시간(분)"
                type="number"
                min={0}
                max={180}
                value={boardPolicy.post_edit_window_minutes}
                onChange={(event) =>
                  setBoardPolicy((previous) => ({
                    ...previous,
                    post_edit_window_minutes: clampInt(Number(event.target.value) || 0, 0, 180),
                  }))
                }
              />
            </div>
            <label className="ms-check-row" htmlFor="board-auto-hide">
              <input
                id="board-auto-hide"
                type="checkbox"
                checked={boardPolicy.harmful_language_auto_hide}
                onChange={(event) =>
                  setBoardPolicy((previous) => ({ ...previous, harmful_language_auto_hide: event.target.checked }))
                }
              />
              유해언어 감지 시 자동 숨김
            </label>
            <label className="ms-check-row" htmlFor="board-safety-alert">
              <input
                id="board-safety-alert"
                type="checkbox"
                checked={boardPolicy.safety_keyword_alert_enabled}
                onChange={(event) =>
                  setBoardPolicy((previous) => ({
                    ...previous,
                    safety_keyword_alert_enabled: event.target.checked,
                  }))
                }
              />
              안전 키워드 탐지 시 즉시 알림 큐 등록
            </label>
          </Card>
        ) : null}

        {domain === "cbt_policy" ? (
          <Card title="CBT 정책 입력">
            <div className="ms-grid ms-grid--two">
              <Input
                label="1일 최대 세션 수"
                type="number"
                min={1}
                max={10}
                value={cbtPolicy.max_sessions_per_day}
                onChange={(event) =>
                  setCbtPolicy((previous) => ({
                    ...previous,
                    max_sessions_per_day: clampInt(Number(event.target.value) || 1, 1, 10),
                  }))
                }
              />
              <Input
                label="안전 에스컬레이션 임계치"
                type="number"
                min={1}
                max={3}
                value={cbtPolicy.safety_escalation_threshold}
                onChange={(event) =>
                  setCbtPolicy((previous) => ({
                    ...previous,
                    safety_escalation_threshold: clampInt(Number(event.target.value) || 1, 1, 3),
                  }))
                }
              />
            </div>
            <label className="ms-check-row" htmlFor="cbt-grounding">
              <input
                id="cbt-grounding"
                type="checkbox"
                checked={cbtPolicy.suggest_grounding_first}
                onChange={(event) =>
                  setCbtPolicy((previous) => ({
                    ...previous,
                    suggest_grounding_first: event.target.checked,
                  }))
                }
              />
              고위험 신호 시 grounding 우선 제안
            </label>
          </Card>
        ) : null}

        {domain === "survey_notification_policy" ? (
          <Card title="검사 알림 정책 입력">
            <div className="ms-grid ms-grid--two">
              <Input
                label="기본 주기(일)"
                type="number"
                min={7}
                max={90}
                value={surveyPolicy.default_cycle_days}
                onChange={(event) =>
                  setSurveyPolicy((previous) => ({
                    ...previous,
                    default_cycle_days: clampInt(Number(event.target.value) || 7, 7, 90),
                  }))
                }
              />
              <Input
                label="리마인드 오프셋(일, 콤마 구분)"
                value={surveyPolicy.reminder_day_offsets}
                onChange={(event) =>
                  setSurveyPolicy((previous) => ({ ...previous, reminder_day_offsets: event.target.value }))
                }
                placeholder="예: 0,2,5"
              />
            </div>
            <label className="ms-check-row" htmlFor="survey-push">
              <input
                id="survey-push"
                type="checkbox"
                checked={surveyPolicy.reminder_push_enabled}
                onChange={(event) =>
                  setSurveyPolicy((previous) => ({ ...previous, reminder_push_enabled: event.target.checked }))
                }
              />
              앱 푸시 알림 사용
            </label>
            <label className="ms-check-row" htmlFor="survey-email">
              <input
                id="survey-email"
                type="checkbox"
                checked={surveyPolicy.reminder_email_enabled}
                onChange={(event) =>
                  setSurveyPolicy((previous) => ({ ...previous, reminder_email_enabled: event.target.checked }))
                }
              />
              이메일 알림 사용
            </label>
          </Card>
        ) : null}

        {domain === "journal_policy" ? (
          <Card title="한줄일기 카테고리 정책 입력">
            <p className="ms-card__desc">운영 중인 카테고리 태그를 추가/삭제합니다. 삭제된 태그는 기존 글에만 유지됩니다.</p>
            <div className="ms-row">
              {journalPolicy.active_category_tags.map((tag) => (
                <Button
                  key={tag}
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setJournalPolicy((previous) => ({
                      active_category_tags: previous.active_category_tags.filter((value) => value !== tag),
                    }))
                  }
                >
                  {tag} 삭제
                </Button>
              ))}
            </div>
            <div className="ms-grid ms-grid--two">
              <Input
                label="새 카테고리 태그"
                value={newJournalTag}
                onChange={(event) => setNewJournalTag(event.target.value)}
                placeholder="예: 불안한 일"
                maxLength={24}
              />
              <div className="ms-field">
                <span className="ms-field__label">태그 추가</span>
                <Button
                  type="button"
                  size="sm"
                  variant="soft"
                  onClick={() => {
                    const next = normalizeJournalTags([
                      ...journalPolicy.active_category_tags,
                      newJournalTag,
                    ]);
                    if (next.length === 0) {
                      return;
                    }
                    setJournalPolicy({ active_category_tags: next });
                    setNewJournalTag("");
                  }}
                  disabled={!newJournalTag.trim()}
                >
                  카테고리 추가
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        <Card title="생성될 정책 JSON 미리보기">
          <pre className="ms-code-block">{JSON.stringify(draftJson, null, 2)}</pre>
        </Card>

        <div className="ms-row">
          <Button onClick={() => void handleCreateDraft()} loading={workingId === "create"}>
            Draft 생성
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void load()} loading={loading}>
            새로고침
          </Button>
        </div>
      </Card>

      {loading ? (
        <Card>
          <LoadingSkeleton lines={8} />
        </Card>
      ) : errorMessage ? (
        <ErrorState
          title="정책 목록을 불러오지 못했습니다"
          description="잠시 후 다시 시도해 주세요."
          retryAction={<Button onClick={() => void load()}>다시 시도</Button>}
        />
      ) : records.length === 0 ? (
        <EmptyState title="정책 변경 이력이 없습니다" description="새 draft를 생성해 시작하세요." />
      ) : (
        <div className="ms-admin-list">
          {records.map((record) => {
            const pendingApproval = pendingByObjectId.get(record.policy_change_id);
            return (
              <article key={record.policy_change_id} className="ms-admin-list__item">
                <div>
                  <p className="ms-admin-list__title">{record.title}</p>
                  <p className="ms-card__desc">
                    {domainLabel(record.policy_domain)} · 요청자 {record.requested_by_admin_user_id}
                  </p>
                  <p className="ms-card__desc">최근 변경 {record.requested_at.slice(0, 16).replace("T", " ")}</p>
                  {record.decision_note ? <p className="ms-card__desc">결정 메모: {record.decision_note}</p> : null}
                </div>
                <div className="ms-row">
                  <Badge variant={statusBadgeVariant(record.status)}>{record.status}</Badge>
                  {(record.status === "draft" || record.status === "rejected") ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void handleSubmitForOwner(record.policy_change_id)}
                      loading={workingId === record.policy_change_id}
                    >
                      Owner 승인 요청
                    </Button>
                  ) : null}
                  {isOwner && pendingApproval ? (
                    <>
                      <Button
                        size="sm"
                        variant="soft"
                        onClick={() => void handleDecision(pendingApproval.approval_id, "approved")}
                        loading={workingId === pendingApproval.approval_id}
                      >
                        승인
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => void handleDecision(pendingApproval.approval_id, "rejected")}
                        loading={workingId === pendingApproval.approval_id}
                      >
                        반려
                      </Button>
                    </>
                  ) : null}
                  {isOwner && record.status === "approved" ? (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => void handleApply(record.policy_change_id)}
                      loading={workingId === record.policy_change_id}
                    >
                      적용
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </SectionContainer>
  );
}
