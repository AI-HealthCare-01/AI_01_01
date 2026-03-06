"use client";

import { useEffect, useMemo, useState } from "react";

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
  Textarea,
} from "../../../src/components/ui";
import { useAuthContext } from "../../../src/features/auth";
import {
  AdminApiError,
  createRestrictionAction,
  getAdminUserBanContext,
  useAdminConsoleContext,
  type AdminUserBanContextResponse,
  type RestrictionReasonCode,
} from "../../../src/features/admin-console";

const reasonOptions: Array<{ label: string; value: RestrictionReasonCode }> = [
  { label: "abuse", value: "abuse" },
  { label: "hate", value: "hate" },
  { label: "threat", value: "threat" },
  { label: "spam", value: "spam" },
  { label: "safety", value: "safety" },
  { label: "policy_violation", value: "policy_violation" },
  { label: "other", value: "other" },
];

function parseError(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.message === "owner_restriction_forbidden") {
      return "Owner 계정은 제재/차단 대상이 될 수 없습니다.";
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

export default function AdminRestrictionsPage() {
  const { firebaseUser } = useAuthContext();
  const { me } = useAdminConsoleContext();

  const [targetUserId, setTargetUserId] = useState("");
  const [context, setContext] = useState<AdminUserBanContextResponse | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [blockAccount, setBlockAccount] = useState(true);
  const [blockIp, setBlockIp] = useState(false);
  const [targetIp, setTargetIp] = useState("");
  const [reasonCode, setReasonCode] = useState<RestrictionReasonCode>("abuse");
  const [reasonDetail, setReasonDetail] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const canExecuteRestriction =
    me?.actor.base_role === "owner" || me?.actor.base_role === "admin";
  const isOwnerTarget = context?.target_admin_role === "owner";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const query = new URLSearchParams(window.location.search);
    const userId = query.get("user_id")?.trim();
    if (userId) {
      setTargetUserId(userId);
    }
  }, []);

  const recentIpOptions = useMemo(
    () => (context?.recent_ips ?? []).map((ip) => ({ label: ip, value: ip })),
    [context]
  );

  const loadBanContext = async () => {
    if (!firebaseUser || !targetUserId.trim() || !canExecuteRestriction) {
      return;
    }

    try {
      setLoadingContext(true);
      setErrorMessage(null);
      setActionMessage(null);
      const response = await getAdminUserBanContext(firebaseUser, targetUserId.trim());
      setContext(response);
      if (response.recent_ips.length > 0) {
        setTargetIp(response.recent_ips[0]);
      } else {
        setTargetIp("");
      }
    } catch (error) {
      setErrorMessage(parseError(error));
      setContext(null);
    } finally {
      setLoadingContext(false);
    }
  };

  const submitRestriction = async () => {
    if (!firebaseUser || !context || !canExecuteRestriction) {
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);
      setActionMessage(null);

      await createRestrictionAction(firebaseUser, {
        target_user_id: context.user_id,
        block_account: blockAccount,
        block_ip: blockIp,
        target_ip: blockIp ? targetIp || undefined : undefined,
        reason_code: reasonCode,
        reason_detail: reasonDetail || undefined,
        ends_at: endsAt ? new Date(endsAt).toISOString() : undefined,
      });

      setActionMessage("제재/차단 조치가 저장되었습니다.");
      setContext(null);
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (!canExecuteRestriction) {
    return (
      <SectionContainer title="제재/차단 관리" description="권한 제한 화면">
        <ErrorState
          title="접근 권한이 없습니다"
          description="Support는 제재/차단 화면에 접근할 수 없습니다. Admin 또는 Owner에게 요청하세요."
        />
      </SectionContainer>
    );
  }

  return (
    <SectionContainer
      title="제재/차단 관리"
      description="이 화면에서만 이메일/최근 IP를 제한적으로 노출하고 계정/IP 차단을 처리합니다."
      action={
        <Button size="sm" variant="secondary" onClick={() => void loadBanContext()} loading={loadingContext}>
          컨텍스트 불러오기
        </Button>
      }
    >
      {actionMessage ? <Banner variant="success" title="완료" description={actionMessage} /> : null}
      {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

      <Card title="대상 사용자 선택" description="user_id를 입력한 뒤 컨텍스트를 불러오세요.">
        <Input
          label="target_user_id"
          value={targetUserId}
          onChange={(event) => setTargetUserId(event.target.value)}
          placeholder="usr_xxx"
        />
      </Card>

      {loadingContext ? (
        <Card>
          <LoadingSkeleton lines={6} />
        </Card>
      ) : !context ? (
        <EmptyState
          title="차단 컨텍스트가 아직 없습니다"
          description="대상 사용자 user_id를 입력하고 컨텍스트를 불러오면 이메일/최근 IP가 표시됩니다."
        />
      ) : (
        <Card title="차단 컨텍스트" description="민감 정보는 이 화면에서만 제한적으로 노출됩니다.">
          <div className="ms-row">
            <Badge variant="brand">{context.user_id}</Badge>
            {context.target_admin_role ? <Badge variant="warning">역할 {context.target_admin_role}</Badge> : null}
            <Badge variant="warning">PII limited view</Badge>
          </div>
          <p className="ms-card__desc">email: {context.email}</p>
          <p className="ms-card__desc">recent_ip: {context.recent_ips.join(", ") || "-"}</p>

          {isOwnerTarget ? (
            <Banner
              variant="warning"
              title="Owner 보호"
              description="Owner 계정은 제재/차단 대상에서 제외됩니다. 다른 계정을 선택해주세요."
            />
          ) : null}

          <label className="ms-check-row" htmlFor="restrict-account">
            <input
              id="restrict-account"
              type="checkbox"
              checked={blockAccount}
              onChange={(event) => setBlockAccount(event.target.checked)}
            />
            계정 차단
          </label>
          <label className="ms-check-row" htmlFor="restrict-ip">
            <input
              id="restrict-ip"
              type="checkbox"
              checked={blockIp}
              onChange={(event) => setBlockIp(event.target.checked)}
            />
            IP 차단
          </label>

          {blockIp ? (
            recentIpOptions.length > 0 ? (
              <Select
                label="대상 IP"
                value={targetIp}
                onChange={(event) => setTargetIp(event.target.value)}
                options={recentIpOptions}
              />
            ) : (
              <Input
                label="대상 IP"
                placeholder="예: 203.0.113.11"
                value={targetIp}
                onChange={(event) => setTargetIp(event.target.value)}
              />
            )
          ) : null}

          <Select
            label="사유 코드"
            value={reasonCode}
            onChange={(event) => setReasonCode(event.target.value as RestrictionReasonCode)}
            options={reasonOptions}
          />
          <Textarea
            label="상세 사유"
            placeholder="운영 메모(선택)"
            value={reasonDetail}
            onChange={(event) => setReasonDetail(event.target.value)}
          />
          <Input
            label="종료 시각 (선택)"
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
          />

          <Button
            variant="danger"
            onClick={() => void submitRestriction()}
            loading={submitting}
            disabled={(!blockAccount && !blockIp) || isOwnerTarget}
          >
            조치 실행
          </Button>
        </Card>
      )}
    </SectionContainer>
  );
}
