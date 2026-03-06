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
  StatCard,
  Textarea,
} from "../../../src/components/ui";
import { useAuthContext } from "../../../src/features/auth";
import {
  AdminApiError,
  createModelChange,
  createModelRetrainingJob,
  decideOwnerApproval,
  listModelChanges,
  listModelRetrainingJobs,
  listOwnerApprovals,
  submitOwnerApproval,
  transitionModelChange,
  transitionModelRetrainingJob,
  useAdminConsoleContext,
  type ModelChangeRecord,
  type ModelChangeStatus,
  type ModelRetrainingJobRecord,
  type ModelRetrainingRunMode,
  type OwnerApprovalRecord,
} from "../../../src/features/admin-console";

type MetricValues = Record<string, string>;

type RetrainingOptionKey =
  | "include_synthetic_data"
  | "require_min_account_age_days_28"
  | "require_second_assessment_completion"
  | "use_pre_assessment_window_28d"
  | "keep_user_after_eligibility";

const FEATURE_SET_OPTIONS = [
  { key: "checkin_mood_1_5", label: "체크인 기분 점수" },
  { key: "checkin_anxiety_1_5", label: "체크인 불안 점수" },
  { key: "checkin_energy_1_5", label: "체크인 에너지 점수" },
  { key: "sleep_total_midpoint_hours", label: "수면시간 지표" },
  { key: "sleep_latency_midpoint_minutes", label: "잠들기 지연 지표" },
  { key: "daylight_bucket_signal", label: "햇빛 노출 지표" },
  { key: "challenge_completed_days_7d", label: "챌린지 수행일(7일)" },
  { key: "challenge_active_count", label: "활성 챌린지 수" },
  { key: "cbt_sessions_7d", label: "CBT 세션 수(7일)" },
  { key: "assessment_sparse_anchor", label: "설문 앵커 점수" },
] as const;

const RETRAINING_OPTIONS: Array<{
  key: RetrainingOptionKey;
  label: string;
  description: string;
}> = [
  {
    key: "include_synthetic_data",
    label: "합성 데이터 병합",
    description: "초기 데이터 부족 구간에서 안정성을 위해 synthetic 데이터를 함께 사용합니다.",
  },
  {
    key: "require_min_account_age_days_28",
    label: "가입 28일 이상 사용자만 포함",
    description: "가입 직후 변동이 큰 데이터를 제외해 재학습 입력 안정성을 높입니다.",
  },
  {
    key: "require_second_assessment_completion",
    label: "2회 이상 진단 완료 사용자만 포함",
    description: "초기 1회 진단 이후 변화가 관측된 사용자만 학습대상으로 포함합니다.",
  },
  {
    key: "use_pre_assessment_window_28d",
    label: "진단 전 28일 기록 윈도우 사용",
    description: "각 진단일 직전 28일 기록을 한 행(row)으로 구성해 지표를 예측합니다.",
  },
  {
    key: "keep_user_after_eligibility",
    label: "조건 충족 사용자는 이후 계속 포함",
    description: "한 번 조건을 만족한 사용자는 이후 재학습 대상 풀에 계속 유지합니다.",
  },
];

const DEFAULT_RETRAINING_OPTIONS: Record<RetrainingOptionKey, boolean> = {
  include_synthetic_data: true,
  require_min_account_age_days_28: true,
  require_second_assessment_completion: true,
  use_pre_assessment_window_28d: true,
  keep_user_after_eligibility: true,
};

const RETRAINING_MODE_OPTIONS = [
  { label: "사전점검(dry_run)", value: "dry_run" },
  { label: "실행(execute)", value: "execute" },
] as const;

const DEFAULT_FEATURE_SET = FEATURE_SET_OPTIONS.map((item) => item.key);
const DEFAULT_METRIC_ORDER = ["dep_mae", "anx_mae", "ins_mae", "coverage"];
const DEFAULT_METRIC_VALUES: MetricValues = {
  dep_mae: "0.52",
  anx_mae: "0.49",
  ins_mae: "0.57",
  coverage: "0.81",
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
  if (status === "approved" || status === "deployed") {
    return "success";
  }
  if (status === "rejected" || status === "rolled_back") {
    return "danger";
  }
  if (status === "evaluation_ready" || status === "training_running") {
    return "info";
  }
  return "neutral";
}

function retrainingStatusBadgeVariant(status: string): "neutral" | "warning" | "success" | "danger" | "info" {
  if (status === "pending_owner_approval") {
    return "warning";
  }
  if (status === "queued" || status === "running") {
    return "info";
  }
  if (status === "completed") {
    return "success";
  }
  if (status === "failed" || status === "cancelled") {
    return "danger";
  }
  return "neutral";
}

function normalizeMetrics(record: ModelChangeRecord | null): { metricKeys: string[]; metricValues: MetricValues } {
  if (!record) {
    return {
      metricKeys: DEFAULT_METRIC_ORDER,
      metricValues: { ...DEFAULT_METRIC_VALUES },
    };
  }

  const source = record.metrics_json;
  const nestedMetrics =
    source.metrics && typeof source.metrics === "object" && !Array.isArray(source.metrics)
      ? (source.metrics as Record<string, unknown>)
      : null;
  const flatMetrics = Object.fromEntries(
    Object.entries(source).filter(([key]) => key !== "feature_set" && key !== "metrics"),
  ) as Record<string, unknown>;

  const merged = nestedMetrics && Object.keys(nestedMetrics).length > 0 ? nestedMetrics : flatMetrics;
  const metricKeys = Array.from(new Set([...DEFAULT_METRIC_ORDER, ...Object.keys(merged)])).filter(Boolean);
  const metricValues: MetricValues = {};

  for (const key of metricKeys) {
    const value = merged[key];
    if (typeof value === "number" || typeof value === "string") {
      metricValues[key] = String(value);
    } else {
      metricValues[key] = DEFAULT_METRIC_VALUES[key] ?? "";
    }
  }

  return { metricKeys, metricValues };
}

function normalizeFeatureSet(record: ModelChangeRecord | null): string[] {
  if (!record) {
    return [...DEFAULT_FEATURE_SET];
  }

  const fromPayload =
    Array.isArray(record.metrics_json.feature_set) &&
    record.metrics_json.feature_set.every((value) => typeof value === "string")
      ? (record.metrics_json.feature_set as string[])
      : [];
  if (fromPayload.length > 0) {
    return fromPayload;
  }
  return [...DEFAULT_FEATURE_SET];
}

function parseMetricValue(raw: string): number | string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return 0;
  }
  const parsed = Number(trimmed);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return trimmed;
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => typeof item === "object" && item !== null && !Array.isArray(item)) as Array<
    Record<string, unknown>
  >;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  return value.slice(0, 16).replace("T", " ");
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftIsoDate(baseIsoDate: string, days: number): string {
  const [year, month, day] = baseIsoDate.split("-").map((value) => Number(value));
  const base = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  const shifted = new Date(base.getTime() + days * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

function inclusiveDateDiffDays(startDate: string, endDate: string): number | null {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  return Math.floor((end - start) / 86_400_000) + 1;
}

export default function AdminModelOpsPage() {
  const { firebaseUser } = useAuthContext();
  const { me } = useAdminConsoleContext();

  const [modelName, setModelName] = useState("mindsight-nowcast");
  const [experimentName, setExperimentName] = useState("exp-");
  const [changeSummary, setChangeSummary] = useState("feature set 조정");
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([...DEFAULT_FEATURE_SET]);
  const [metricKeys, setMetricKeys] = useState<string[]>([...DEFAULT_METRIC_ORDER]);
  const [metricValues, setMetricValues] = useState<MetricValues>({ ...DEFAULT_METRIC_VALUES });

  const [records, setRecords] = useState<ModelChangeRecord[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<OwnerApprovalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [selectedModelChangeId, setSelectedModelChangeId] = useState<string>("");
  const [retrainingMode, setRetrainingMode] = useState<ModelRetrainingRunMode>("dry_run");
  const [retrainingRangeEndDate, setRetrainingRangeEndDate] = useState(todayIsoDate());
  const [retrainingRangeStartDate, setRetrainingRangeStartDate] = useState(() => shiftIsoDate(todayIsoDate(), -83));
  const [retrainingNote, setRetrainingNote] = useState("");
  const [retrainingOptions, setRetrainingOptions] = useState<Record<RetrainingOptionKey, boolean>>({
    ...DEFAULT_RETRAINING_OPTIONS,
  });
  const [autoCompletingJobId, setAutoCompletingJobId] = useState<string | null>(null);

  const [retrainingLoading, setRetrainingLoading] = useState(false);
  const [retrainingJobs, setRetrainingJobs] = useState<ModelRetrainingJobRecord[]>([]);

  const isOwner = me?.actor.base_role === "owner";
  const canEditModel =
    me?.permissions.includes("model_ops:edit") || me?.permissions.includes("model_ops:edit_request");

  const loadModelOps = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const [models, pending] = await Promise.all([
        listModelChanges(firebaseUser, { limit: 100 }),
        listOwnerApprovals(firebaseUser, {
          status: "pending_owner_approval",
          limit: 100,
        }),
      ]);
      setRecords(models);
      setPendingApprovals(pending.filter((item) => item.object_type === "model_change"));
    } catch (error) {
      setErrorMessage(parseError(error));
      setRecords([]);
      setPendingApprovals([]);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  const loadRetrainingJobsForModel = useCallback(
    async (modelChangeId: string) => {
      if (!firebaseUser || !modelChangeId) {
        setRetrainingJobs([]);
        return;
      }

      try {
        setRetrainingLoading(true);
        const jobs = await listModelRetrainingJobs(firebaseUser, modelChangeId, { limit: 50 });
        setRetrainingJobs(jobs);
      } catch (error) {
        setErrorMessage(parseError(error));
        setRetrainingJobs([]);
      } finally {
        setRetrainingLoading(false);
      }
    },
    [firebaseUser],
  );

  useEffect(() => {
    void loadModelOps();
  }, [loadModelOps]);

  useEffect(() => {
    const latest = records[0] ?? null;
    const normalized = normalizeMetrics(latest);
    const nextFeatures = normalizeFeatureSet(latest);

    setMetricKeys(normalized.metricKeys);
    setMetricValues(normalized.metricValues);
    setSelectedFeatures(nextFeatures);

    if (!selectedModelChangeId && latest) {
      setSelectedModelChangeId(latest.model_change_id);
      return;
    }

    if (selectedModelChangeId && !records.some((record) => record.model_change_id === selectedModelChangeId)) {
      setSelectedModelChangeId(latest?.model_change_id ?? "");
    }
  }, [records, selectedModelChangeId]);

  useEffect(() => {
    void loadRetrainingJobsForModel(selectedModelChangeId);
  }, [loadRetrainingJobsForModel, selectedModelChangeId]);

  const pendingByObjectId = useMemo(() => {
    const map = new Map<string, OwnerApprovalRecord>();
    pendingApprovals.forEach((item) => {
      map.set(item.object_id, item);
    });
    return map;
  }, [pendingApprovals]);

  const summary = useMemo(() => {
    return {
      total: records.length,
      pendingOwner: records.filter((record) => record.status === "pending_owner_approval").length,
      deployed: records.filter((record) => record.status === "deployed").length,
      training: records.filter((record) => record.status === "training_running").length,
    };
  }, [records]);

  const latestRecord = records[0] ?? null;

  const selectedModelRecord = useMemo(
    () => records.find((record) => record.model_change_id === selectedModelChangeId) ?? null,
    [records, selectedModelChangeId],
  );

  const selectedModelFeatureSet = useMemo(() => normalizeFeatureSet(selectedModelRecord), [selectedModelRecord]);

  const toggleFeature = (featureKey: string) => {
    setSelectedFeatures((previous) => {
      if (previous.includes(featureKey)) {
        return previous.filter((item) => item !== featureKey);
      }
      return [...previous, featureKey];
    });
  };

  const toggleRetrainingOption = (key: RetrainingOptionKey) => {
    setRetrainingOptions((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  };

  const buildMetricPayload = (source: MetricValues, keys: string[]): Record<string, number | string> => {
    const payload: Record<string, number | string> = {};
    keys.forEach((key) => {
      payload[key] = parseMetricValue(source[key] ?? "");
    });
    return payload;
  };

  const handleCreate = async () => {
    if (!firebaseUser || !canEditModel) {
      return;
    }

    try {
      setWorkingId("create");
      setActionMessage(null);
      const metrics = buildMetricPayload(metricValues, metricKeys);

      await createModelChange(firebaseUser, {
        model_name: modelName,
        experiment_name: experimentName,
        change_summary: changeSummary,
        metrics_json: {
          feature_set: selectedFeatures,
          metrics,
          previous_reference: latestRecord?.model_change_id ?? null,
        },
      });
      setActionMessage("모델 변경안이 생성되었습니다.");
      await loadModelOps();
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setWorkingId(null);
    }
  };

  const handleTransition = async (modelChangeId: string, nextStatus: ModelChangeStatus) => {
    if (!firebaseUser) {
      return;
    }

    try {
      setWorkingId(modelChangeId);
      setActionMessage(null);
      await transitionModelChange(firebaseUser, modelChangeId, nextStatus);
      setActionMessage(`상태가 ${nextStatus} 로 변경되었습니다.`);
      await loadModelOps();
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setWorkingId(null);
    }
  };

  const handleSubmitForOwner = async (modelChangeId: string) => {
    if (!firebaseUser) {
      return;
    }

    try {
      setWorkingId(modelChangeId);
      setActionMessage(null);
      await submitOwnerApproval(firebaseUser, {
        object_type: "model_change",
        object_id: modelChangeId,
      });
      setActionMessage("Owner 승인 요청이 등록되었습니다.");
      await loadModelOps();
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
      await loadModelOps();
      await loadRetrainingJobsForModel(selectedModelChangeId);
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setWorkingId(null);
    }
  };

  const handleCreateRetrainingJob = async () => {
    if (!firebaseUser || !canEditModel || !selectedModelChangeId) {
      return;
    }

    const parsedWindowDays = inclusiveDateDiffDays(retrainingRangeStartDate, retrainingRangeEndDate);
    if (!parsedWindowDays) {
      setErrorMessage("재학습 기간을 다시 확인해 주세요. (시작일이 종료일보다 늦을 수 없습니다.)");
      return;
    }
    if (parsedWindowDays < 28 || parsedWindowDays > 365) {
      setErrorMessage("재학습 기간은 28~365일 범위로 설정해 주세요.");
      return;
    }

    try {
      setWorkingId("retraining-create");
      setActionMessage(null);
      await createModelRetrainingJob(firebaseUser, selectedModelChangeId, {
        mode: retrainingMode,
        training_window_days: parsedWindowDays,
        data_range_start_date: retrainingRangeStartDate,
        data_range_end_date: retrainingRangeEndDate,
        include_synthetic_data: retrainingOptions.include_synthetic_data,
        require_min_account_age_days_28: retrainingOptions.require_min_account_age_days_28,
        require_second_assessment_completion: retrainingOptions.require_second_assessment_completion,
        use_pre_assessment_window_28d: retrainingOptions.use_pre_assessment_window_28d,
        keep_user_after_eligibility: retrainingOptions.keep_user_after_eligibility,
        selected_feature_keys: selectedModelFeatureSet,
        note: retrainingNote.trim() || undefined,
      });
      setActionMessage("재학습 요청이 생성되었습니다.");
      await loadRetrainingJobsForModel(selectedModelChangeId);
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setWorkingId(null);
    }
  };

  const handleStartRetrainingJob = async (jobId: string) => {
    if (!firebaseUser) {
      return;
    }

    try {
      setWorkingId(jobId);
      setActionMessage(null);
      await transitionModelRetrainingJob(firebaseUser, jobId, {
        next_status: "running",
      });
      setAutoCompletingJobId(jobId);
      await transitionModelRetrainingJob(firebaseUser, jobId, {
        next_status: "completed",
        result_summary: {
          evaluator_note: "실행 완료 후 자동 저장되었습니다.",
          completion_source: "auto_after_run",
        },
      });
      setActionMessage("재학습 실행이 완료되어 결과 요약/추천이 자동 저장되었습니다.");
      await loadRetrainingJobsForModel(selectedModelChangeId);
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setAutoCompletingJobId(null);
      setWorkingId(null);
    }
  };

  const handleFailRetrainingJob = async (jobId: string) => {
    if (!firebaseUser) {
      return;
    }

    try {
      setWorkingId(jobId);
      setActionMessage(null);
      await transitionModelRetrainingJob(firebaseUser, jobId, {
        next_status: "failed",
        failure_reason: "manual_failed",
      });
      setActionMessage("재학습 Job을 실패로 종료했습니다.");
      await loadRetrainingJobsForModel(selectedModelChangeId);
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <SectionContainer
      title="모델 운영"
      description="feature set과 평가지표를 이전 버전 기준으로 수정하고 Owner 승인형 플로우로 배포합니다."
    >
      {actionMessage ? <Banner variant="success" title="완료" description={actionMessage} /> : null}
      {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

      {!loading && !errorMessage ? (
        <div className="ms-grid ms-grid--three">
          <StatCard label="변경안 전체" value={String(summary.total)} helperText="모델 변경 레코드" />
          <StatCard label="Owner 승인 대기" value={String(summary.pendingOwner)} helperText="오너 검토 요청 건수" />
          <StatCard label="학습 중" value={String(summary.training)} helperText="학습 파이프 진행 중" />
          <StatCard label="운영 반영" value={String(summary.deployed)} helperText="배포 완료 버전 수" />
        </div>
      ) : null}

      <Card title="실험 등록" description="이전 버전의 feature/지표를 기본값으로 불러와 수정합니다.">
        <div className="ms-grid ms-grid--two">
          <Input label="모델명(model_name)" value={modelName} onChange={(event) => setModelName(event.target.value)} />
          <Input
            label="실험명(experiment_name)"
            value={experimentName}
            onChange={(event) => setExperimentName(event.target.value)}
          />
        </div>

        <Textarea
          label="변경 요약(change_summary)"
          value={changeSummary}
          onChange={(event) => setChangeSummary(event.target.value)}
        />

        <Card
          title="Feature set 조정"
          description={
            latestRecord
              ? `기준 버전: ${latestRecord.experiment_name}`
              : "기준 버전이 없어 기본 feature set으로 시작합니다."
          }
        >
          <div className="ms-grid ms-grid--two">
            {FEATURE_SET_OPTIONS.map((option) => (
              <label key={option.key} className="ms-check-row" htmlFor={`feature-${option.key}`}>
                <input
                  id={`feature-${option.key}`}
                  type="checkbox"
                  checked={selectedFeatures.includes(option.key)}
                  onChange={() => toggleFeature(option.key)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </Card>

        <Card
          title="기준 평가지표(이전 버전)"
          description="현재 운영 버전의 기준 지표입니다. 새 실험의 비교 기준으로 사용되며 필요 시만 수정하세요."
        >
          <div className="ms-stack">
            {metricKeys.map((metricKey) => (
              <div key={metricKey} className="ms-row">
                <Badge variant="neutral">{metricKey}</Badge>
                <Input
                  label={`${metricKey} value`}
                  value={metricValues[metricKey] ?? ""}
                  onChange={(event) =>
                    setMetricValues((previous) => ({
                      ...previous,
                      [metricKey]: event.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <p className="ms-card__desc">
            재학습 완료 후 신규 지표는 학습 결과에서 자동 반영됩니다. 운영자는 입력값을 직접 맞추지 않아도 됩니다.
          </p>
        </Card>

        <div className="ms-row">
          <Button onClick={() => void handleCreate()} loading={workingId === "create"} disabled={!canEditModel}>
            실험 등록
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void loadModelOps()} loading={loading}>
            새로고침
          </Button>
        </div>
      </Card>

      <Card
        title="재학습 요청"
        description="재학습 대상을 스크리닝할 진단 완료일 기간을 먼저 지정합니다. (가입 28일 이상 + 2회 진단 완료)"
      >
        {records.length === 0 ? (
          <EmptyState title="먼저 모델 변경안을 생성해 주세요" description="재학습 요청은 모델 변경안 기준으로 생성됩니다." />
        ) : (
          <>
            <div className="ms-grid ms-grid--two">
              <Select
                label="대상 모델 변경안"
                value={selectedModelChangeId}
                onChange={(event) => setSelectedModelChangeId(event.target.value)}
                options={records.map((record) => ({
                  value: record.model_change_id,
                  label: `${record.experiment_name} (${record.status})`,
                }))}
              />
              <Select
                label="실행 모드"
                value={retrainingMode}
                onChange={(event) => setRetrainingMode(event.target.value as ModelRetrainingRunMode)}
                options={[...RETRAINING_MODE_OPTIONS]}
              />
              <Input
                label="데이터 수집 시작일"
                type="date"
                value={retrainingRangeStartDate}
                onChange={(event) => setRetrainingRangeStartDate(event.target.value)}
              />
              <Input
                label="데이터 수집 종료일"
                type="date"
                value={retrainingRangeEndDate}
                onChange={(event) => setRetrainingRangeEndDate(event.target.value)}
              />
            </div>

            <p className="ms-card__desc">
              설정 기간 내 진단 완료 데이터를 스크리닝하고, 각 진단일 직전 28일 기록을 학습 행으로 구성합니다.
              데이터 스냅샷 ID는 요청 생성 시 자동 부여됩니다.
            </p>

            <Card title="재학습 옵션" description="체크박스별 설명을 확인하고 필요 시 조정하세요.">
              <div className="ms-stack">
                {RETRAINING_OPTIONS.map((option) => (
                  <label key={option.key} className="ms-check-row" htmlFor={`retrain-opt-${option.key}`}>
                    <input
                      id={`retrain-opt-${option.key}`}
                      type="checkbox"
                      checked={retrainingOptions[option.key]}
                      onChange={() => toggleRetrainingOption(option.key)}
                    />
                    <span>
                      {option.label}
                      <br />
                      <span className="ms-card__desc">{option.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </Card>

            <Textarea
              label="요청 메모(선택)"
              value={retrainingNote}
              onChange={(event) => setRetrainingNote(event.target.value)}
            />

            <div className="ms-row">
              <Button
                onClick={() => void handleCreateRetrainingJob()}
                loading={workingId === "retraining-create"}
                disabled={!canEditModel || !selectedModelChangeId}
              >
                재학습 요청 생성
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void loadRetrainingJobsForModel(selectedModelChangeId)}
                loading={retrainingLoading}
                disabled={!selectedModelChangeId}
              >
                요청 목록 새로고침
              </Button>
            </div>
          </>
        )}
      </Card>

      <Card
        title="재학습 완료 처리"
        description="실행 시작 후 결과는 자동 생성되어 저장됩니다. 완료 입력은 수동 작성하지 않아도 됩니다."
      >
        <p className="ms-card__desc">
          저장 항목: 성능 비교, 운영자 요약, 추천 프로그램/개선안, 데이터 적격성 요약, 아티팩트 URI
        </p>
      </Card>

      {!canEditModel ? (
        <Banner
          variant="warning"
          title="권한 제한"
          description="Support는 analyst_ml_extension 승인 후 모델 편집/요청이 가능합니다."
        />
      ) : null}

      {loading ? (
        <Card>
          <LoadingSkeleton lines={8} />
        </Card>
      ) : errorMessage ? (
        <ErrorState
          title="모델 변경 목록을 불러오지 못했습니다"
          description="잠시 후 다시 시도해 주세요."
          retryAction={<Button onClick={() => void loadModelOps()}>다시 시도</Button>}
        />
      ) : records.length === 0 ? (
        <EmptyState title="모델 변경 이력이 없습니다" description="실험을 등록해 시작하세요." />
      ) : (
        <div className="ms-admin-list">
          {records.map((record) => {
            const pendingApproval = pendingByObjectId.get(record.model_change_id);
            const featureSet =
              Array.isArray(record.metrics_json.feature_set) &&
              record.metrics_json.feature_set.every((value) => typeof value === "string")
                ? (record.metrics_json.feature_set as string[])
                : [];

            return (
              <article key={record.model_change_id} className="ms-admin-list__item">
                <div>
                  <p className="ms-admin-list__title">{record.experiment_name}</p>
                  <p className="ms-card__desc">
                    {record.model_name} · {record.change_summary}
                  </p>
                  <p className="ms-card__desc">상태 변경 {formatDateTime(record.requested_at)}</p>
                  <p className="ms-card__desc">feature set {featureSet.length}개 선택</p>
                  {record.decision_note ? <p className="ms-card__desc">결정 메모: {record.decision_note}</p> : null}
                </div>
                <div className="ms-row">
                  <Badge variant={statusBadgeVariant(record.status)}>{record.status}</Badge>

                  {canEditModel && record.status === "draft_experiment" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void handleTransition(record.model_change_id, "training_running")}
                      loading={workingId === record.model_change_id}
                    >
                      학습 시작
                    </Button>
                  ) : null}

                  {canEditModel && record.status === "training_running" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void handleTransition(record.model_change_id, "evaluation_ready")}
                      loading={workingId === record.model_change_id}
                    >
                      평가 완료
                    </Button>
                  ) : null}

                  {canEditModel && record.status === "evaluation_ready" ? (
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={() => void handleSubmitForOwner(record.model_change_id)}
                      loading={workingId === record.model_change_id}
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
                      onClick={() => void handleTransition(record.model_change_id, "deployed")}
                      loading={workingId === record.model_change_id}
                    >
                      배포
                    </Button>
                  ) : null}

                  {isOwner && record.status === "deployed" ? (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void handleTransition(record.model_change_id, "rolled_back")}
                      loading={workingId === record.model_change_id}
                    >
                      롤백
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Card
        title="재학습 실험 예정 목록"
        description={selectedModelRecord ? `${selectedModelRecord.experiment_name} 기준` : "모델 변경안을 선택하면 표시됩니다."}
      >
        {retrainingLoading ? (
          <LoadingSkeleton lines={6} />
        ) : !selectedModelChangeId ? (
          <EmptyState title="대상 모델 변경안을 선택해 주세요" description="재학습 Job 이력이 여기에 표시됩니다." />
        ) : retrainingJobs.length === 0 ? (
          <EmptyState title="재학습 Job 이력이 없습니다" description="재학습 요청을 생성해 진행해 보세요." />
        ) : (
          <div className="ms-admin-list">
            {retrainingJobs.map((job) => {
              const summary = toObject(job.result_summary);
              const dataEligibility = toObject(summary?.data_eligibility);
              const scoreComparison = toObject(summary?.score_comparison);
              const comparisonItems = Array.isArray(scoreComparison?.items)
                ? (scoreComparison?.items as Array<Record<string, unknown>>)
                : [];
              const operatorSummary = typeof summary?.operator_summary === "string" ? summary.operator_summary : null;
              const operatorRecommendationSummary =
                typeof summary?.operator_recommendation_summary === "string"
                  ? summary.operator_recommendation_summary
                  : null;
              const retrainingOptions = toObject(summary?.retraining_options);
              const programRecommendations = toObjectArray(summary?.program_recommendations);
              const improvementRecommendations = toObjectArray(summary?.improvement_recommendations);
              const eligibleUserCount = toNumber(dataEligibility?.eligible_user_count);
              const eligibleRowCount = toNumber(dataEligibility?.eligible_row_count);
              const rowsWithCheckin = toNumber(dataEligibility?.rows_with_checkin_28d);
              const selectionStartDate =
                typeof retrainingOptions?.data_range_start_date === "string" ? retrainingOptions.data_range_start_date : null;
              const selectionEndDate =
                typeof retrainingOptions?.data_range_end_date === "string" ? retrainingOptions.data_range_end_date : null;
              const snapshotId =
                typeof retrainingOptions?.dataset_snapshot_id === "string"
                  ? retrainingOptions.dataset_snapshot_id
                  : job.dataset_snapshot_id;

              return (
                <article key={job.job_id} className="ms-admin-list__item">
                  <div className="ms-stack">
                    <p className="ms-admin-list__title">{job.job_id}</p>
                    <p className="ms-card__desc">
                      요청 {formatDateTime(job.requested_at)} · 모드 {job.mode} · 기간 {job.training_window_days}일
                    </p>
                    {selectionStartDate && selectionEndDate ? (
                      <p className="ms-card__desc">수집 기간: {selectionStartDate} ~ {selectionEndDate}</p>
                    ) : null}
                    {snapshotId ? <p className="ms-card__desc">스냅샷 ID: {snapshotId}</p> : null}
                    {operatorSummary ? <p className="ms-card__desc">결과 요약: {operatorSummary}</p> : null}
                    {operatorRecommendationSummary ? (
                      <p className="ms-card__desc">추천 요약: {operatorRecommendationSummary}</p>
                    ) : null}
                    {dataEligibility ? (
                      <p className="ms-card__desc">
                        학습 대상 사용자 {eligibleUserCount ?? 0}명 · 학습 행 {eligibleRowCount ?? 0}개 · 28일 체크인 포함 {rowsWithCheckin ?? 0}개
                      </p>
                    ) : null}
                    {programRecommendations.length > 0 ? (
                      <div className="ms-stack">
                        <p className="ms-card__desc">신규 챌린지 개설 추천</p>
                        {programRecommendations.slice(0, 5).map((item, index) => {
                          const title =
                            typeof item.proposed_program_title === "string"
                              ? item.proposed_program_title
                              : `추천 프로그램 ${index + 1}`;
                          const evidence = typeof item.evidence === "string" ? item.evidence : null;
                          const estimatedDrop = toNumber(item.estimated_target_drop);
                          const supportHigh = toNumber(item.support_rows_high);
                          const supportZero = toNumber(item.support_rows_zero);
                          return (
                            <p key={`${job.job_id}-program-${index}`} className="ms-card__desc">
                              {title}
                              {estimatedDrop !== null ? ` · 예상 지표 감소 ${estimatedDrop.toFixed(2)}` : ""}
                              {supportHigh !== null && supportZero !== null
                                ? ` · 비교행(수행/미수행) ${supportHigh}/${supportZero}`
                                : ""}
                              {evidence ? ` · ${evidence}` : ""}
                            </p>
                          );
                        })}
                      </div>
                    ) : null}
                    {improvementRecommendations.length > 0 ? (
                      <div className="ms-stack">
                        <p className="ms-card__desc">운영 개선 추천</p>
                        {improvementRecommendations.slice(0, 5).map((item, index) => {
                          const title =
                            typeof item.title === "string" ? item.title : `운영 개선 추천 ${index + 1}`;
                          const action = typeof item.suggested_action === "string" ? item.suggested_action : null;
                          const evidence = typeof item.evidence === "string" ? item.evidence : null;
                          return (
                            <p key={`${job.job_id}-improvement-${index}`} className="ms-card__desc">
                              {title}
                              {action ? ` · 실행안: ${action}` : ""}
                              {evidence ? ` · ${evidence}` : ""}
                            </p>
                          );
                        })}
                      </div>
                    ) : null}
                    {job.failure_reason ? <p className="ms-card__desc">실패 사유: {job.failure_reason}</p> : null}
                    {comparisonItems.length > 0 ? (
                      <div className="ms-stack">
                        {comparisonItems.slice(0, 6).map((item) => {
                          const label = typeof item.label === "string" ? item.label : String(item.key ?? "metric");
                          const before = toNumber(item.before);
                          const after = toNumber(item.after);
                          const status = typeof item.status === "string" ? item.status : "-";
                          return (
                            <p key={String(item.key ?? label)} className="ms-card__desc">
                              {label}: {before ?? "-"} → {after ?? "-"} ({status})
                            </p>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  <div className="ms-row">
                    <Badge variant={retrainingStatusBadgeVariant(job.status)}>{job.status}</Badge>
                    {canEditModel && job.status === "queued" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleStartRetrainingJob(job.job_id)}
                        loading={workingId === job.job_id || autoCompletingJobId === job.job_id}
                      >
                        실행 시작(자동 저장)
                      </Button>
                    ) : null}
                    {canEditModel && job.status === "running" ? (
                      <>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => void handleFailRetrainingJob(job.job_id)}
                          loading={workingId === job.job_id}
                        >
                          실패 처리
                        </Button>
                      </>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </SectionContainer>
  );
}
