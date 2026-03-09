import type { User } from "firebase/auth";

import { isAuthEmulatorEnabled } from "../auth/firebase";
import { fetchWithApiFallback } from "../shared/api-base";
import type {
  ActivityDashboardResponse,
  ActivityLogDay,
  AssessmentSession,
  CbtConversationBootstrapResponse,
  CbtRiskSignal,
  CbtConversationMessage,
  CbtSessionStage,
  CbtConversationTurnResponse,
  CbtSessionCreateRequest,
  CbtSessionTodoUpsertRequest,
  CbtSessionResponse,
  ChallengeCatalogItem,
  ChallengeCatalogDetail,
  ChallengeDayLog,
  ChallengeEnrollment,
  ChallengeEnrollmentDetail,
  ChallengeRecommendationBundle,
  ChallengeDayStatus,
  CheckinFeatureBundle,
  CheckinPayload,
  CheckinRecord,
  ReportSummaryResponse,
  SymptomDashboardResponse,
  JournalEntry,
  JournalListItem,
  JournalCategoryOptions
} from "./types";

export class CoreApiError extends Error {
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
    throw new CoreApiError(0, "네트워크 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.");
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
    throw new CoreApiError(response.status, detail);
  }

  return body as T;
}

async function requestBlob(
  path: string,
  firebaseUser: User,
  init?: RequestInit,
  options?: { forceRefreshToken?: boolean }
): Promise<{ blob: Blob; filename: string; contentType: string }> {
  const headers = new Headers(init?.headers ?? {});

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
    throw new CoreApiError(0, "네트워크 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.");
  }

  if (!response.ok) {
    const text = await response.text();
    let detail = "api_error";
    if (text) {
      try {
        const body = JSON.parse(text) as { detail?: unknown };
        if (body.detail) {
          detail = String(body.detail);
        }
      } catch {
        detail = text;
      }
    }
    throw new CoreApiError(response.status, detail);
  }

  const blob = await response.blob();
  const contentType = response.headers.get("Content-Type") ?? "application/octet-stream";
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filenameMatch = disposition.match(/filename=\"?([^\";]+)\"?/i);
  const filename = filenameMatch?.[1] ?? "report-export";

  return { blob, filename, contentType };
}

export async function getCheckinToday(firebaseUser: User, date: string): Promise<CheckinRecord> {
  const query = new URLSearchParams({ date }).toString();
  return requestJson<CheckinRecord>(`/checkin/today?${query}`, firebaseUser, undefined, {
    forceRefreshToken: true,
  });
}

export async function saveCheckinToday(
  firebaseUser: User,
  payload: CheckinPayload,
  edit: boolean
): Promise<CheckinRecord> {
  const path = edit ? "/checkin/today/edit" : "/checkin/today";
  return requestJson<CheckinRecord>(path, firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getCheckinFeaturesToday(
  firebaseUser: User,
  date: string
): Promise<CheckinFeatureBundle> {
  const query = new URLSearchParams({ date }).toString();
  return requestJson<CheckinFeatureBundle>(`/checkin/features/today?${query}`, firebaseUser);
}

export async function listCheckinFeatures(
  firebaseUser: User,
  options: { start_date: string; end_date: string }
): Promise<CheckinFeatureBundle[]> {
  const query = new URLSearchParams({
    start_date: options.start_date,
    end_date: options.end_date,
  }).toString();
  return requestJson<CheckinFeatureBundle[]>(`/checkin/features?${query}`, firebaseUser);
}

export async function startAssessment(
  firebaseUser: User,
  source: "onboarding" | "28day_reminder" | "manual_start" | "clinician_request" | "other"
): Promise<AssessmentSession> {
  return requestJson<AssessmentSession>("/v1/assessments/start", firebaseUser, {
    method: "POST",
    body: JSON.stringify({ source }),
  });
}

export async function saveAssessmentAnswer(
  firebaseUser: User,
  assessmentId: string,
  instrument: "phq9" | "gad7" | "isi",
  itemCode: string,
  score: number
): Promise<{ assessment_id: string; instrument: string; item_code: string; next_item_code: string | null }> {
  return requestJson(`/v1/assessments/${assessmentId}/answer`, firebaseUser, {
    method: "POST",
    body: JSON.stringify({ instrument, item_code: itemCode, response_score: score }),
  });
}

export async function completeAssessment(
  firebaseUser: User,
  assessmentId: string
): Promise<AssessmentSession> {
  return requestJson<AssessmentSession>(`/v1/assessments/${assessmentId}/complete`, firebaseUser, {
    method: "POST",
  });
}

export async function listAssessmentHistory(firebaseUser: User): Promise<AssessmentSession[]> {
  return requestJson<AssessmentSession[]>("/v1/assessments/history?limit=20", firebaseUser);
}

export async function getChallengeCatalog(firebaseUser: User): Promise<ChallengeCatalogItem[]> {
  const response = await requestJson<{ items: ChallengeCatalogItem[] }>("/challenge/catalog", firebaseUser);
  return response.items;
}

export async function getChallengeCatalogDetail(
  firebaseUser: User,
  challengeId: string
): Promise<ChallengeCatalogDetail> {
  return requestJson<ChallengeCatalogDetail>(`/challenge/catalog/${challengeId}`, firebaseUser);
}

export async function getChallengeRecommendations(
  firebaseUser: User
): Promise<ChallengeRecommendationBundle> {
  return requestJson<ChallengeRecommendationBundle>("/challenge/recommendations/today", firebaseUser);
}

export async function listChallengeEnrollments(
  firebaseUser: User,
  sessionStatus: "active" | "paused" | "completed" | "dropped" | "all" = "all"
): Promise<ChallengeEnrollment[]> {
  const query = sessionStatus === "all" ? "" : `?session_status=${sessionStatus}`;
  return requestJson<ChallengeEnrollment[]>(`/challenge/enrollments${query}`, firebaseUser);
}

export async function getChallengeEnrollmentDetail(
  firebaseUser: User,
  enrollmentId: string
): Promise<ChallengeEnrollmentDetail> {
  return requestJson<ChallengeEnrollmentDetail>(`/challenge/enrollments/${enrollmentId}`, firebaseUser);
}

export async function logChallengeExposure(
  firebaseUser: User,
  payload: {
    challenge_id: string;
    exposure_type: "shown" | "browse";
    response_type?: "accepted" | "declined" | "ignored";
    reason_text?: string;
  }
): Promise<{ result: string }> {
  return requestJson<{ result: string }>("/challenge/exposures", firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createChallengeEnrollment(
  firebaseUser: User,
  payload: {
    challenge_id: string;
    start_date?: string;
    target_days?: number;
    reminder_time_local?: string;
    motivation_note?: string;
  }
): Promise<ChallengeEnrollment> {
  return requestJson<ChallengeEnrollment>("/challenge/enrollments", firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateChallengeEnrollment(
  firebaseUser: User,
  enrollmentId: string,
  status: "active" | "paused" | "completed" | "dropped",
  options?: { dropout_reason_code?: string }
): Promise<ChallengeEnrollment> {
  return requestJson<ChallengeEnrollment>(`/challenge/enrollments/${enrollmentId}`, firebaseUser, {
    method: "PATCH",
    body: JSON.stringify({ status, dropout_reason_code: options?.dropout_reason_code }),
  });
}

export async function executeChallengeDay(
  firebaseUser: User,
  enrollmentId: string,
  payload: {
    date: string;
    pre_mood_1_5?: number;
    pre_anxiety_1_5?: number;
    day_status?: Extract<ChallengeDayStatus, "pending" | "done" | "skipped" | "late">;
    skipped_reason_code?: string;
  }
): Promise<ChallengeDayLog> {
  return requestJson<ChallengeDayLog>(`/challenge/enrollments/${enrollmentId}/execute-day`, firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function saveChallengeReflection(
  firebaseUser: User,
  enrollmentId: string,
  payload: {
    date: string;
    result_status?: Extract<ChallengeDayStatus, "done" | "skipped" | "late">;
    post_mood_1_5?: number;
    post_anxiety_1_5?: number;
    helpfulness_0_10?: number;
    effort_0_10?: number;
    reflection_note?: string;
    skipped_reason_code?: string;
  }
): Promise<ChallengeDayLog> {
  return requestJson<ChallengeDayLog>(`/challenge/enrollments/${enrollmentId}/reflection`, firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function completeChallengeEnrollment(
  firebaseUser: User,
  enrollmentId: string
): Promise<ChallengeEnrollment> {
  return requestJson<ChallengeEnrollment>(`/challenge/enrollments/${enrollmentId}/complete`, firebaseUser, {
    method: "POST",
  });
}

export async function saveChallengeDayLog(
  firebaseUser: User,
  payload: {
    enrollment_id: string;
    date: string;
    completed_flag: boolean;
    day_status?: ChallengeDayStatus;
    helpfulness_score_1_5?: number;
    pre_mood_1_5?: number;
    pre_anxiety_1_5?: number;
    post_mood_1_5?: number;
    post_anxiety_1_5?: number;
    helpfulness_0_10?: number;
    effort_0_10?: number;
    reflection_note?: string;
    skipped_reason_code?: string;
  }
): Promise<{ result: string }> {
  return requestJson<{ result: string }>("/challenge/day-log", firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listJournalEntries(
  firebaseUser: User,
  query?: { q?: string; start_date?: string; end_date?: string; category_tags?: string[] }
): Promise<JournalListItem[]> {
  const params = new URLSearchParams();
  if (query?.q) {
    params.set("q", query.q);
  }
  if (query?.start_date) {
    params.set("start_date", query.start_date);
  }
  if (query?.end_date) {
    params.set("end_date", query.end_date);
  }
  if (query?.category_tags?.length) {
    query.category_tags.forEach((tag) => {
      if (tag.trim()) {
        params.append("category_tags", tag);
      }
    });
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestJson<JournalListItem[]>(`/v1/journal${suffix}`, firebaseUser);
}

export async function createJournalEntry(
  firebaseUser: User,
  payload: { entry_date?: string; title?: string | null; category_tags?: string[]; body: string }
): Promise<JournalEntry> {
  return requestJson<JournalEntry>("/v1/journal", firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getJournalEntry(firebaseUser: User, journalId: string): Promise<JournalEntry> {
  return requestJson<JournalEntry>(`/v1/journal/${journalId}`, firebaseUser);
}

export async function updateJournalEntry(
  firebaseUser: User,
  journalId: string,
  payload: { entry_date?: string; title?: string | null; category_tags?: string[]; body?: string }
): Promise<JournalEntry> {
  return requestJson<JournalEntry>(`/v1/journal/${journalId}`, firebaseUser, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function listJournalCategoryOptions(firebaseUser: User): Promise<JournalCategoryOptions> {
  return requestJson<JournalCategoryOptions>("/v1/journal/categories", firebaseUser);
}

export async function deleteJournalEntry(firebaseUser: User, journalId: string): Promise<{ result: string }> {
  return requestJson<{ result: string }>(`/v1/journal/${journalId}`, firebaseUser, {
    method: "DELETE",
  });
}

export async function getActivityLog(
  firebaseUser: User,
  query: {
    start_date?: string;
    end_date?: string;
    filter?: "all" | "checkin" | "challenge" | "cbt" | "journal" | "assessment";
    view?: "list" | "calendar";
  }
): Promise<ActivityLogDay[]> {
  const params = new URLSearchParams();
  if (query.start_date) {
    params.set("start_date", query.start_date);
  }
  if (query.end_date) {
    params.set("end_date", query.end_date);
  }
  if (query.filter) {
    params.set("filter", query.filter);
  }
  if (query.view) {
    params.set("view", query.view);
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestJson<ActivityLogDay[]>(`/v1/mypage/activity-log${suffix}`, firebaseUser);
}

export async function createCbtSession(
  firebaseUser: User,
  payload: CbtSessionCreateRequest
): Promise<CbtSessionResponse> {
  return requestJson<CbtSessionResponse>("/v1/cbt/sessions", firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createCbtConversationTurn(
  firebaseUser: User,
  payload: {
    messages: CbtConversationMessage[];
    state?: Record<string, unknown>;
    current_stage?: CbtSessionStage;
    user_input?: string;
    quick_reply_action_id?: string;
    selected_quick_reply?: string;
  }
): Promise<CbtConversationTurnResponse> {
  return requestJson<CbtConversationTurnResponse>("/v1/cbt/conversation/turn", firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getCbtConversationBootstrap(
  firebaseUser: User
): Promise<CbtConversationBootstrapResponse> {
  return requestJson<CbtConversationBootstrapResponse>("/v1/cbt/conversation/bootstrap", firebaseUser);
}

export async function getCbtSessionSummary(
  firebaseUser: User,
  sessionId: string
): Promise<CbtSessionResponse> {
  return requestJson<CbtSessionResponse>(`/v1/cbt/sessions/${sessionId}/summary`, firebaseUser);
}

export async function listCbtSessions(
  firebaseUser: User,
  query?: { limit?: number }
): Promise<CbtSessionResponse[]> {
  const params = new URLSearchParams();
  if (query?.limit) {
    params.set("limit", String(query.limit));
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestJson<CbtSessionResponse[]>(`/v1/cbt/sessions${suffix}`, firebaseUser);
}

export async function listPendingCbtReflections(
  firebaseUser: User,
  query?: { limit?: number }
): Promise<CbtSessionResponse[]> {
  const params = new URLSearchParams();
  if (query?.limit) {
    params.set("limit", String(query.limit));
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestJson<CbtSessionResponse[]>(`/v1/cbt/reflections/pending${suffix}`, firebaseUser);
}

export async function saveCbtSessionReflection(
  firebaseUser: User,
  sessionId: string,
  payload: {
    performed: boolean;
    reflection_note: string;
  }
): Promise<CbtSessionResponse> {
  return requestJson<CbtSessionResponse>(`/v1/cbt/sessions/${sessionId}/reflection`, firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function saveCbtSessionTodo(
  firebaseUser: User,
  sessionId: string,
  payload: CbtSessionTodoUpsertRequest
): Promise<CbtSessionResponse> {
  return requestJson<CbtSessionResponse>(`/v1/cbt/sessions/${sessionId}/todo`, firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function saveCbtRiskSignal(
  firebaseUser: User,
  payload: {
    date?: string;
    functional_impairment_flag: boolean;
    self_harm_flag: boolean;
    suicide_risk_level: number;
    violence_risk_flag: boolean;
    risk_source?: "cbt_session" | "manual_review" | "system_rule";
  }
): Promise<CbtRiskSignal> {
  return requestJson<CbtRiskSignal>("/v1/cbt/risk-signal", firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getSymptomDashboard(
  firebaseUser: User,
  mode: "7d" | "4w_weekly_avg"
): Promise<SymptomDashboardResponse> {
  const query = new URLSearchParams({ mode }).toString();
  return requestJson<SymptomDashboardResponse>(`/v1/dashboard/symptom?${query}`, firebaseUser);
}

export async function getDashboardActivity(firebaseUser: User): Promise<ActivityDashboardResponse> {
  return requestJson<ActivityDashboardResponse>("/v1/dashboard/activity", firebaseUser);
}

export async function getReportSummary(
  firebaseUser: User,
  query: { start_date: string; end_date: string; include_sensitive?: boolean }
): Promise<ReportSummaryResponse> {
  const params = new URLSearchParams({
    start_date: query.start_date,
    end_date: query.end_date,
  });
  if (query.include_sensitive !== undefined) {
    params.set("include_sensitive", String(query.include_sensitive));
  }
  return requestJson<ReportSummaryResponse>(`/v1/report/summary?${params.toString()}`, firebaseUser);
}

export async function exportReportSummary(
  firebaseUser: User,
  payload: {
    start_date: string;
    end_date: string;
    format: "pdf" | "png";
    include_sensitive: boolean;
    save_to_vault?: boolean;
  }
): Promise<{ blob: Blob; filename: string; contentType: string }> {
  return requestBlob("/v1/report/summary/export", firebaseUser, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function saveReportSummary(
  firebaseUser: User,
  payload: {
    start_date: string;
    end_date: string;
    include_sensitive: boolean;
  }
): Promise<{
  report_id: string;
  period_start: string;
  period_end: string;
  format: string;
  file_name: string;
  content_type: string;
  created_at: string;
}> {
  return requestJson<{
    report_id: string;
    period_start: string;
    period_end: string;
    format: string;
    file_name: string;
    content_type: string;
    created_at: string;
  }>("/v1/report/summary/save", firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
