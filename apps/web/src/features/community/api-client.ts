import type { User } from "firebase/auth";

import { isAuthEmulatorEnabled } from "../auth/firebase";
import { fetchWithApiFallback } from "../shared/api-base";
import type {
  BoardCommentPayload,
  BoardCommentItem,
  BoardFeedItem,
  BoardListResponse,
  ModerationActionCode,
  ModerationQueueActionResponse,
  ModerationQueueDetailResponse,
  ModerationQueuesResponse,
  MyPageCommentSummary,
  MyPageConsentResponse,
  MyPageHomeResponse,
  MyPagePostSummary,
  MyPageProfileUpdateResponse,
  MyPageReportVaultItem,
  SupportNotificationPayload,
  SupportQueueSummaryResponse,
  SupportTicketDetailResponse,
  SupportTicketListItem,
  SupportTicketStatus,
} from "./types";

export class CommunityApiError extends Error {
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
    throw new CommunityApiError(0, "네트워크 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.");
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
    throw new CommunityApiError(response.status, detail);
  }

  return body as T;
}

function toQuery(params: Record<string, string | number | boolean | undefined | null>): string {
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

export async function listBoardFeed(
  firebaseUser: User,
  query?: { cursor?: string | null; limit?: number; q?: string; tag?: string }
): Promise<BoardListResponse> {
  return requestJson<BoardListResponse>(
    `/v1/board/feed${toQuery({
      cursor: query?.cursor,
      limit: query?.limit,
      q: query?.q,
      tag: query?.tag,
    })}`,
    firebaseUser,
    undefined,
    { forceRefreshToken: true }
  );
}

export async function listBoardNotices(
  firebaseUser: User,
  query?: { cursor?: string | null; limit?: number }
): Promise<BoardListResponse> {
  return requestJson<BoardListResponse>(
    `/v1/board/notices${toQuery({ cursor: query?.cursor, limit: query?.limit })}`,
    firebaseUser
  );
}

export async function listBoardBookmarks(
  firebaseUser: User,
  query?: { cursor?: string | null; limit?: number }
): Promise<BoardListResponse> {
  return requestJson<BoardListResponse>(
    `/v1/board/bookmarks${toQuery({ cursor: query?.cursor, limit: query?.limit })}`,
    firebaseUser
  );
}

export async function createBoardPost(
  firebaseUser: User,
  payload: {
    title?: string | null;
    body_text: string;
    is_anonymous?: boolean;
    is_notice?: boolean;
    is_pinned_notice?: boolean;
    tag_ids?: string[];
    image_urls?: string[];
  }
): Promise<BoardFeedItem> {
  return requestJson<BoardFeedItem>("/v1/board/post", firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateBoardPost(
  firebaseUser: User,
  postId: string,
  payload: {
    title?: string | null;
    body_text: string;
  }
): Promise<BoardFeedItem> {
  return requestJson<BoardFeedItem>(`/v1/board/post/${postId}`, firebaseUser, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteBoardPost(
  firebaseUser: User,
  postId: string
): Promise<{ result: string }> {
  return requestJson<{ result: string }>(`/v1/board/post/${postId}`, firebaseUser, {
    method: "DELETE",
  });
}

export async function toggleBoardLike(
  firebaseUser: User,
  postId: string
): Promise<{ result: string }> {
  return requestJson<{ result: string }>(`/v1/board/post/${postId}/like`, firebaseUser, {
    method: "POST",
  });
}

export async function toggleBoardBookmark(
  firebaseUser: User,
  postId: string
): Promise<{ result: string }> {
  return requestJson<{ result: string }>(`/v1/board/post/${postId}/bookmark`, firebaseUser, {
    method: "POST",
  });
}

export async function reportBoardPost(
  firebaseUser: User,
  postId: string,
  payload: { reason_code: string; detail_text?: string }
): Promise<{ result: string }> {
  return requestJson<{ result: string }>(`/v1/board/post/${postId}/report`, firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createBoardComment(
  firebaseUser: User,
  postId: string,
  payload: { body_text: string; is_anonymous?: boolean }
): Promise<BoardCommentPayload> {
  return requestJson<BoardCommentPayload>(`/v1/board/post/${postId}/comments`, firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listBoardComments(
  firebaseUser: User,
  postId: string,
  query?: { limit?: number }
): Promise<BoardCommentItem[]> {
  return requestJson<BoardCommentItem[]>(
    `/v1/board/post/${postId}/comments${toQuery({ limit: query?.limit })}`,
    firebaseUser
  );
}

export async function listModerationQueues(
  firebaseUser: User,
  limit = 20
): Promise<ModerationQueuesResponse> {
  return requestJson<ModerationQueuesResponse>(
    `/v1/admin/moderation/queues${toQuery({ limit })}`,
    firebaseUser
  );
}

export async function getModerationQueueDetail(
  firebaseUser: User,
  queueItemId: string
): Promise<ModerationQueueDetailResponse> {
  return requestJson<ModerationQueueDetailResponse>(
    `/v1/admin/moderation/queues/${queueItemId}`,
    firebaseUser
  );
}

export async function applyModerationQueueAction(
  firebaseUser: User,
  queueItemId: string,
  actionCode: ModerationActionCode
): Promise<ModerationQueueActionResponse> {
  return requestJson<ModerationQueueActionResponse>(
    `/v1/admin/moderation/queues/${queueItemId}/action`,
    firebaseUser,
    {
      method: "POST",
      body: JSON.stringify({ action_code: actionCode }),
    }
  );
}

export async function createSupportTicket(
  firebaseUser: User,
  payload: {
    ticket_type: "inquiry" | "feedback";
    title: string;
    category: string;
    related_feature?: string;
    body: string;
    reply_requested: boolean;
  }
): Promise<SupportTicketDetailResponse> {
  return requestJson<SupportTicketDetailResponse>("/v1/support/tickets", firebaseUser, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listSupportTickets(
  firebaseUser: User,
  query?: { status?: SupportTicketStatus; limit?: number }
): Promise<SupportTicketListItem[]> {
  return requestJson<SupportTicketListItem[]>(
    `/v1/support/tickets${toQuery({ status: query?.status, limit: query?.limit })}`,
    firebaseUser
  );
}

export async function getSupportTicketDetail(
  firebaseUser: User,
  ticketId: string
): Promise<SupportTicketDetailResponse> {
  return requestJson<SupportTicketDetailResponse>(`/v1/support/tickets/${ticketId}`, firebaseUser);
}

export async function addSupportFollowup(
  firebaseUser: User,
  ticketId: string,
  body: string
): Promise<SupportTicketDetailResponse> {
  return requestJson<SupportTicketDetailResponse>(`/v1/support/tickets/${ticketId}/followup`, firebaseUser, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export async function resolveSupportTicket(
  firebaseUser: User,
  ticketId: string
): Promise<{ result: string; status: SupportTicketStatus }> {
  return requestJson<{ result: string; status: SupportTicketStatus }>(
    `/v1/support/tickets/${ticketId}/resolve`,
    firebaseUser,
    {
      method: "POST",
    }
  );
}

export async function listSupportNotifications(
  firebaseUser: User,
  query?: { unread_only?: boolean; limit?: number }
): Promise<SupportNotificationPayload[]> {
  const response = await requestJson<{ items: SupportNotificationPayload[] }>(
    `/v1/support/notifications${toQuery({ unread_only: query?.unread_only, limit: query?.limit })}`,
    firebaseUser
  );
  return response.items;
}

export async function markSupportNotificationRead(
  firebaseUser: User,
  notificationId: string
): Promise<SupportNotificationPayload> {
  return requestJson<SupportNotificationPayload>(
    `/v1/support/notifications/${notificationId}/read`,
    firebaseUser,
    {
      method: "POST",
    }
  );
}

export async function addAdminReply(
  firebaseUser: User,
  ticketId: string,
  payload: { body: string; status?: SupportTicketStatus }
): Promise<SupportTicketDetailResponse> {
  return requestJson<SupportTicketDetailResponse>(
    `/v1/admin/support/tickets/${ticketId}/reply`,
    firebaseUser,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function getSupportQueueSummary(
  firebaseUser: User
): Promise<SupportQueueSummaryResponse> {
  return requestJson<SupportQueueSummaryResponse>("/v1/admin/support/queue-summary", firebaseUser);
}

export async function getMyPageHome(firebaseUser: User): Promise<MyPageHomeResponse> {
  return requestJson<MyPageHomeResponse>("/v1/mypage/home", firebaseUser);
}

export async function patchMyPageProfile(
  firebaseUser: User,
  payload: { nickname?: string; coach_name?: string; birth_year?: number; gender?: string }
): Promise<MyPageProfileUpdateResponse> {
  return requestJson<MyPageProfileUpdateResponse>("/v1/mypage/profile", firebaseUser, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function requestMyPagePasswordChange(
  firebaseUser: User,
  payload: { current_password: string; new_password: string; new_password_confirm: string }
): Promise<{ result: string; requires_firebase_action: boolean; message: string }> {
  return requestJson<{ result: string; requires_firebase_action: boolean; message: string }>(
    "/v1/mypage/security/password",
    firebaseUser,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function listMyPageBookmarks(
  firebaseUser: User,
  limit = 30
): Promise<MyPagePostSummary[]> {
  return requestJson<MyPagePostSummary[]>(`/v1/mypage/bookmarks${toQuery({ limit })}`, firebaseUser);
}

export async function listMyPagePosts(
  firebaseUser: User,
  limit = 30
): Promise<MyPagePostSummary[]> {
  return requestJson<MyPagePostSummary[]>(`/v1/mypage/my-posts${toQuery({ limit })}`, firebaseUser);
}

export async function listMyPageComments(
  firebaseUser: User,
  limit = 30
): Promise<MyPageCommentSummary[]> {
  return requestJson<MyPageCommentSummary[]>(
    `/v1/mypage/my-comments${toQuery({ limit })}`,
    firebaseUser
  );
}

export async function listMyPageSupportTickets(
  firebaseUser: User,
  query?: { status?: SupportTicketStatus; limit?: number }
): Promise<SupportTicketListItem[]> {
  return requestJson<SupportTicketListItem[]>(
    `/v1/mypage/support-tickets${toQuery({ status: query?.status, limit: query?.limit })}`,
    firebaseUser
  );
}

export async function listMyPageReportVault(
  firebaseUser: User,
  limit = 30
): Promise<MyPageReportVaultItem[]> {
  return requestJson<MyPageReportVaultItem[]>(
    `/v1/mypage/report-vault${toQuery({ limit })}`,
    firebaseUser
  );
}

export async function deleteMyPageReportVaultItem(
  firebaseUser: User,
  reportId: string
): Promise<{ result: string }> {
  return requestJson<{ result: string }>(`/v1/mypage/report-vault/${reportId}`, firebaseUser, {
    method: "DELETE",
  });
}

export async function getMyPageConsents(firebaseUser: User): Promise<MyPageConsentResponse> {
  return requestJson<MyPageConsentResponse>("/v1/mypage/consents", firebaseUser);
}

export async function patchMyPageConsents(
  firebaseUser: User,
  payload: {
    personalization_optional?: boolean;
    model_improvement_optional?: boolean;
    marketing_optional?: boolean;
  }
): Promise<MyPageConsentResponse> {
  return requestJson<MyPageConsentResponse>("/v1/mypage/consents", firebaseUser, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
