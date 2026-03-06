import type { User } from "firebase/auth";

import { isAuthEmulatorEnabled } from "../auth/firebase";
import { fetchWithApiFallback } from "../shared/api-base";
import type {
  AdminMeResponse,
  AdminOverviewResponse,
  AdminRoleListResponse,
  AdminRoleRecord,
  AdminSupportQueueResponse,
  AdminUserBanContextResponse,
  AdminUserListResponse,
  AuditLogListResponse,
  ExtensionRecord,
  ModelChangeRecord,
  ModelChangeStatus,
  ModelRetrainingJobRecord,
  ModelRetrainingJobStatus,
  ModelRetrainingRunMode,
  OwnerApprovalObjectType,
  OwnerApprovalRecord,
  OwnerApprovalStatus,
  PolicyChangeRecord,
  PolicyDomain,
  RestrictionActionResponse,
  RestrictionReasonCode,
} from "./types";

export class AdminApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function requestJson<T>(
  path: string,
  firebaseUser: User,
  init?: RequestInit,
  options?: { forceRefreshToken?: boolean }
): Promise<T> {
  const headers = new Headers(init?.headers ?? {});

  headers.set("Content-Type", "application/json");
  const idToken = await firebaseUser.getIdToken(options?.forceRefreshToken ?? false);
  headers.set("Authorization", `Bearer ${idToken}`);

  if (isAuthEmulatorEnabled()) {
    headers.set("X-Firebase-Uid", firebaseUser.uid);
    if (firebaseUser.email) {
      headers.set("X-Firebase-Email", firebaseUser.email);
    }
    headers.set("X-Firebase-Email-Verified", String(firebaseUser.emailVerified));
  }

  let response: Response;
  try {
    response = await fetchWithApiFallback(path, {
      ...init,
      headers,
    });
  } catch {
    throw new AdminApiError(0, "네트워크 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.");
  }

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? String((body as Record<string, unknown>).detail)
        : "api_error";
    throw new AdminApiError(response.status, detail);
  }

  return body as T;
}

function toQuery(params: Record<string, string | number | undefined | null>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    query.set(key, String(value));
  }

  const suffix = query.toString();
  return suffix ? `?${suffix}` : "";
}

export async function getAdminMe(firebaseUser: User): Promise<AdminMeResponse> {
  return requestJson<AdminMeResponse>("/v1/admin/me", firebaseUser, undefined, {
    forceRefreshToken: true,
  });
}

export async function getAdminOverview(firebaseUser: User): Promise<AdminOverviewResponse> {
  return requestJson<AdminOverviewResponse>("/v1/admin/overview", firebaseUser);
}

export async function listAdminUsers(
  firebaseUser: User,
  query?: { q?: string; limit?: number }
): Promise<AdminUserListResponse> {
  return requestJson<AdminUserListResponse>(
    `/v1/admin/users${toQuery({ q: query?.q, limit: query?.limit })}`,
    firebaseUser
  );
}

export async function getAdminUserBanContext(
  firebaseUser: User,
  targetUserId: string
): Promise<AdminUserBanContextResponse> {
  return requestJson<AdminUserBanContextResponse>(
    `/v1/admin/users/${targetUserId}/ban-context`,
    firebaseUser
  );
}

export async function createRestrictionAction(
  firebaseUser: User,
  payload: {
    target_user_id: string;
    block_account: boolean;
    block_ip: boolean;
    target_ip?: string;
    reason_code: RestrictionReasonCode;
    reason_detail?: string;
    ends_at?: string;
  }
): Promise<RestrictionActionResponse> {
  return requestJson<RestrictionActionResponse>("/v1/admin/restrictions", firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listAdminSupportQueue(
  firebaseUser: User,
  query?: { status?: string; limit?: number }
): Promise<AdminSupportQueueResponse> {
  return requestJson<AdminSupportQueueResponse>(
    `/v1/admin/support/queue${toQuery({ status: query?.status, limit: query?.limit })}`,
    firebaseUser
  );
}

export async function createPolicyDraft(
  firebaseUser: User,
  payload: { policy_domain: PolicyDomain; title: string; draft_json: Record<string, unknown> }
): Promise<PolicyChangeRecord> {
  return requestJson<PolicyChangeRecord>("/v1/admin/policies", firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePolicyDraft(
  firebaseUser: User,
  policyChangeId: string,
  payload: { title?: string; draft_json?: Record<string, unknown> }
): Promise<PolicyChangeRecord> {
  return requestJson<PolicyChangeRecord>(`/v1/admin/policies/${policyChangeId}`, firebaseUser, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function listPolicyChanges(
  firebaseUser: User,
  query?: { limit?: number }
): Promise<PolicyChangeRecord[]> {
  return requestJson<PolicyChangeRecord[]>(
    `/v1/admin/policies${toQuery({ limit: query?.limit })}`,
    firebaseUser
  );
}

export async function submitOwnerApproval(
  firebaseUser: User,
  payload: { object_type: OwnerApprovalObjectType; object_id: string }
): Promise<OwnerApprovalRecord> {
  return requestJson<OwnerApprovalRecord>("/v1/admin/owner-approval", firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function applyPolicyChange(
  firebaseUser: User,
  policyChangeId: string
): Promise<PolicyChangeRecord> {
  return requestJson<PolicyChangeRecord>(
    `/v1/admin/policies/${policyChangeId}/apply`,
    firebaseUser,
    {
      method: "POST",
    }
  );
}

export async function createModelChange(
  firebaseUser: User,
  payload: {
    model_name: string;
    experiment_name: string;
    change_summary: string;
    metrics_json: Record<string, unknown>;
  }
): Promise<ModelChangeRecord> {
  return requestJson<ModelChangeRecord>("/v1/admin/model-ops", firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listModelChanges(
  firebaseUser: User,
  query?: { limit?: number }
): Promise<ModelChangeRecord[]> {
  return requestJson<ModelChangeRecord[]>(
    `/v1/admin/model-ops${toQuery({ limit: query?.limit })}`,
    firebaseUser
  );
}

export async function transitionModelChange(
  firebaseUser: User,
  modelChangeId: string,
  nextStatus: ModelChangeStatus
): Promise<ModelChangeRecord> {
  return requestJson<ModelChangeRecord>(
    `/v1/admin/model-ops/${modelChangeId}/transition`,
    firebaseUser,
    {
      method: "POST",
      body: JSON.stringify({ next_status: nextStatus }),
    }
  );
}

export async function createModelRetrainingJob(
  firebaseUser: User,
  modelChangeId: string,
  payload: {
    mode: ModelRetrainingRunMode;
    training_window_days: number;
    data_range_start_date?: string;
    data_range_end_date?: string;
    include_synthetic_data: boolean;
    require_min_account_age_days_28: boolean;
    require_second_assessment_completion: boolean;
    use_pre_assessment_window_28d: boolean;
    keep_user_after_eligibility: boolean;
    selected_feature_keys?: string[];
    dataset_snapshot_id?: string;
    note?: string;
  }
): Promise<ModelRetrainingJobRecord> {
  return requestJson<ModelRetrainingJobRecord>(
    `/v1/admin/model-ops/${modelChangeId}/retraining-jobs`,
    firebaseUser,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function listModelRetrainingJobs(
  firebaseUser: User,
  modelChangeId: string,
  query?: { limit?: number }
): Promise<ModelRetrainingJobRecord[]> {
  return requestJson<ModelRetrainingJobRecord[]>(
    `/v1/admin/model-ops/${modelChangeId}/retraining-jobs${toQuery({ limit: query?.limit })}`,
    firebaseUser
  );
}

export async function transitionModelRetrainingJob(
  firebaseUser: User,
  jobId: string,
  payload: {
    next_status: ModelRetrainingJobStatus;
    artifact_uri?: string;
    failure_reason?: string;
    result_summary?: Record<string, unknown>;
  }
): Promise<ModelRetrainingJobRecord> {
  return requestJson<ModelRetrainingJobRecord>(
    `/v1/admin/model-ops/retraining-jobs/${jobId}/transition`,
    firebaseUser,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function listOwnerApprovals(
  firebaseUser: User,
  query?: { status?: OwnerApprovalStatus; limit?: number }
): Promise<OwnerApprovalRecord[]> {
  return requestJson<OwnerApprovalRecord[]>(
    `/v1/admin/owner-approval${toQuery({ status: query?.status, limit: query?.limit })}`,
    firebaseUser
  );
}

export async function decideOwnerApproval(
  firebaseUser: User,
  approvalId: string,
  payload: { decision: "approved" | "rejected"; decision_note?: string }
): Promise<OwnerApprovalRecord> {
  return requestJson<OwnerApprovalRecord>(
    `/v1/admin/owner-approval/${approvalId}/decide`,
    firebaseUser,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function requestSupportExtension(
  firebaseUser: User,
  payload?: { extension_code?: "analyst_ml_extension"; note?: string }
): Promise<ExtensionRecord> {
  return requestJson<ExtensionRecord>("/v1/admin/extensions/request", firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export async function listSupportExtensions(
  firebaseUser: User,
  query?: { limit?: number }
): Promise<ExtensionRecord[]> {
  return requestJson<ExtensionRecord[]>(
    `/v1/admin/extensions${toQuery({ limit: query?.limit })}`,
    firebaseUser
  );
}

export async function decideSupportExtension(
  firebaseUser: User,
  extensionId: string,
  payload: { decision: "approved" | "rejected" | "revoked"; note?: string }
): Promise<ExtensionRecord> {
  return requestJson<ExtensionRecord>(`/v1/admin/extensions/${extensionId}/decide`, firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listAdminRoles(
  firebaseUser: User,
  query?: { limit?: number }
): Promise<AdminRoleListResponse> {
  return requestJson<AdminRoleListResponse>(
    `/v1/admin/roles${toQuery({ limit: query?.limit })}`,
    firebaseUser
  );
}

export async function setAdminRole(
  firebaseUser: User,
  targetUserId: string,
  payload: { base_role: "owner" | "admin" | "support" }
): Promise<AdminRoleRecord> {
  return requestJson<AdminRoleRecord>(`/v1/admin/roles/${targetUserId}`, firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listAuditLogs(
  firebaseUser: User,
  query?: { limit?: number }
): Promise<AuditLogListResponse> {
  return requestJson<AuditLogListResponse>(
    `/v1/admin/audit-log${toQuery({ limit: query?.limit })}`,
    firebaseUser
  );
}
