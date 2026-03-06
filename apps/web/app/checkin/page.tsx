"use client";

import { useEffect, useMemo, useState } from "react";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  Input,
  PageContainer,
  SectionContainer,
  Select,
  StatCard,
} from "../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../src/features/auth";
import {
  CoreApiError,
  getCheckinFeaturesToday,
  getCheckinToday,
  saveCheckinToday,
  type CheckinFeatureBundle,
  type CheckinPayload,
  type CheckinRecord,
} from "../../src/features/core-inputs";

const SLEEP_TOTAL_OPTIONS = [
  { label: "4시간 미만", value: "lt_4h" },
  { label: "4~5시간", value: "h4_5" },
  { label: "5~6시간", value: "h5_6" },
  { label: "6~7시간", value: "h6_7" },
  { label: "7~8시간", value: "h7_8" },
  { label: "8시간 이상", value: "ge_8h" },
] as const;

const SLEEP_LATENCY_OPTIONS = [
  { label: "15분 이하", value: "le_15m" },
  { label: "15~30분", value: "m15_30" },
  { label: "30~60분", value: "m30_60" },
  { label: "60분 이상", value: "ge_60m" },
] as const;

const DAYLIGHT_OPTIONS = [
  { label: "0분", value: "m0" },
  { label: "1~9분", value: "m1_9" },
  { label: "10~29분", value: "m10_29" },
  { label: "30분 이상", value: "ge_30" },
] as const;

const EXERCISE_OPTIONS = DAYLIGHT_OPTIONS;

const ALCOHOL_OPTIONS = [
  { label: "없음", value: "none" },
  { label: "1잔", value: "one" },
  { label: "2~3잔", value: "two_three" },
  { label: "4잔 이상", value: "ge_four" },
] as const;

const YES_NO_OPTIONS = [
  { label: "아니오", value: "no" },
  { label: "예", value: "yes" },
] as const;

const MOOD_OPTIONS = [
  { label: "1 · 매우 가라앉음", value: "1" },
  { label: "2 · 조금 가라앉음", value: "2" },
  { label: "3 · 보통", value: "3" },
  { label: "4 · 비교적 괜찮음", value: "4" },
  { label: "5 · 매우 좋음", value: "5" },
] as const;

const ANXIETY_OPTIONS = [
  { label: "1 · 매우 편안함", value: "1" },
  { label: "2 · 조금 편안함", value: "2" },
  { label: "3 · 보통", value: "3" },
  { label: "4 · 다소 불안함", value: "4" },
  { label: "5 · 매우 불안함", value: "5" },
] as const;

const ENERGY_OPTIONS = [
  { label: "1 · 매우 낮음", value: "1" },
  { label: "2 · 낮은 편", value: "2" },
  { label: "3 · 보통", value: "3" },
  { label: "4 · 높은 편", value: "4" },
  { label: "5 · 매우 높음", value: "5" },
] as const;

function localDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultPayload(): CheckinPayload {
  return {
    date: localDateString(),
    sleep_total_bucket: "h6_7",
    wake_time_local: "07:00",
    sleep_latency_bucket: "m15_30",
    mood_1_5: 3,
    anxiety_1_5: 3,
    energy_1_5: 3,
    daylight_bucket: "m10_29",
    exercise_bucket: "m1_9",
    alcohol_bucket: "none",
    caffeine_after_2pm_flag: false,
    timezone: "Asia/Seoul",
    completion_mode: "full",
  };
}

function parseError(error: unknown): string {
  if (error instanceof CoreApiError) {
    if (error.message === "checkin_already_exists") {
      return "오늘 체크인이 이미 저장되어 수정 모드로 전환합니다.";
    }
    if (error.message === "email_verification_required") {
      return "이메일 확인 후 이용할 수 있습니다.";
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

export default function CheckinPage() {
  const { firebaseUser } = useAuthContext();

  const [record, setRecord] = useState<CheckinRecord | null>(null);
  const [featureBundle, setFeatureBundle] = useState<CheckinFeatureBundle | null>(null);
  const [payload, setPayload] = useState<CheckinPayload>(defaultPayload());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit = useMemo(() => payload.wake_time_local.length === 5, [payload.wake_time_local]);

  useEffect(() => {
    const run = async () => {
      if (!firebaseUser) {
        return;
      }

      try {
        setLoading(true);
        const today = localDateString();
        const [checkinRecord, features] = await Promise.all([
          getCheckinToday(firebaseUser, today),
          getCheckinFeaturesToday(firebaseUser, today),
        ]);

        setRecord(checkinRecord);
        setFeatureBundle(features);
        if (checkinRecord.payload) {
          setPayload(checkinRecord.payload);
        }
      } catch (error) {
        setErrorMessage(parseError(error));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [firebaseUser]);

  const updatePayload = <K extends keyof CheckinPayload>(key: K, value: CheckinPayload[K]) => {
    setPayload((previous) => ({ ...previous, [key]: value }));
  };

  const onSave = async () => {
    if (!firebaseUser || !canSubmit) {
      return;
    }

    try {
      setSaving(true);
      setErrorMessage(null);
      setNotice(null);

      const nextRecord = await saveCheckinToday(firebaseUser, payload, record?.status === "submitted");
      const nextFeatures = await getCheckinFeaturesToday(firebaseUser, payload.date);
      setRecord(nextRecord);
      setFeatureBundle(nextFeatures);
      setNotice(record?.status === "submitted" ? "오늘 체크인을 수정했습니다." : "오늘 체크인을 저장했습니다.");
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthRouteGuard policy="require-active">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">Check-in</Badge>
          </div>
        }
      >
        <PageContainer size="lg">
          <SectionContainer
            title="오늘 체크인"
            description="오늘의 수면·기분·생활 습관을 간단히 기록해 상태 변화를 확인합니다."
          >
            {notice ? <Banner variant="success" title="저장 완료" description={notice} /> : null}
            {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

            <div className="ms-grid ms-grid--three">
              <StatCard
                label="오늘 상태"
                value={record?.status === "submitted" ? "작성 완료" : "미작성"}
                helperText={loading ? "확인 중" : record?.checked_at ? `작성 시각 ${record.checked_at.slice(11, 16)}` : "오늘 미작성"}
              />
              <StatCard
                label="7일 결측"
                value={String(featureBundle?.missing_checkin_days_7d ?? 7)}
                helperText="낮을수록 추세 신뢰도 상승"
              />
              <StatCard
                label="28일 결측"
                value={String(featureBundle?.missing_checkin_days_28d ?? 28)}
                helperText="최근 28일 미기록 일수"
              />
            </div>

            <Card title="수면/기분/행동 입력" description="문항형 입력으로 빠르게 기록할 수 있습니다.">
              <div className="ms-grid ms-grid--two">
                <Select
                  label="총 수면시간"
                  value={payload.sleep_total_bucket}
                  onChange={(event) => updatePayload("sleep_total_bucket", event.target.value as CheckinPayload["sleep_total_bucket"])}
                  options={[...SLEEP_TOTAL_OPTIONS]}
                />
                <Input
                  label="기상시간"
                  type="time"
                  value={payload.wake_time_local}
                  onChange={(event) => updatePayload("wake_time_local", event.target.value)}
                />
                <Select
                  label="잠들기까지 걸린 시간"
                  value={payload.sleep_latency_bucket}
                  onChange={(event) => updatePayload("sleep_latency_bucket", event.target.value as CheckinPayload["sleep_latency_bucket"])}
                  options={[...SLEEP_LATENCY_OPTIONS]}
                />
                <Select
                  label="기분(1~5)"
                  value={String(payload.mood_1_5)}
                  onChange={(event) => updatePayload("mood_1_5", Number(event.target.value))}
                  options={[...MOOD_OPTIONS]}
                />
                <Select
                  label="불안/스트레스(1~5)"
                  value={String(payload.anxiety_1_5)}
                  onChange={(event) => updatePayload("anxiety_1_5", Number(event.target.value))}
                  options={[...ANXIETY_OPTIONS]}
                />
                <Select
                  label="에너지(1~5)"
                  value={String(payload.energy_1_5)}
                  onChange={(event) => updatePayload("energy_1_5", Number(event.target.value))}
                  options={[...ENERGY_OPTIONS]}
                />
                <Select
                  label="햇빛 노출"
                  value={payload.daylight_bucket}
                  onChange={(event) => updatePayload("daylight_bucket", event.target.value as CheckinPayload["daylight_bucket"])}
                  options={[...DAYLIGHT_OPTIONS]}
                />
                <Select
                  label="운동"
                  value={payload.exercise_bucket}
                  onChange={(event) => updatePayload("exercise_bucket", event.target.value as CheckinPayload["exercise_bucket"])}
                  options={[...EXERCISE_OPTIONS]}
                />
                <Select
                  label="음주"
                  value={payload.alcohol_bucket}
                  onChange={(event) => updatePayload("alcohol_bucket", event.target.value as CheckinPayload["alcohol_bucket"])}
                  options={[...ALCOHOL_OPTIONS]}
                />
                <Select
                  label="오후 2시 이후 카페인"
                  value={payload.caffeine_after_2pm_flag ? "yes" : "no"}
                  onChange={(event) => updatePayload("caffeine_after_2pm_flag", event.target.value === "yes")}
                  options={[...YES_NO_OPTIONS]}
                />
              </div>

              <div className="ms-row">
                <Button onClick={onSave} loading={saving} disabled={!canSubmit}>
                  {record?.status === "submitted" ? "오늘 체크인 수정" : "오늘 체크인 저장"}
                </Button>
              </div>
            </Card>
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
