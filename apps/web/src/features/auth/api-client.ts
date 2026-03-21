import type { User } from "firebase/auth";

import { isAuthEmulatorEnabled } from "./firebase";
import { fetchWithApiFallback } from "../shared/api-base";
import type {
  BaselineAssessmentRequest,
  OnboardingProfileRequest,
  SessionContract,
  SignupBootstrapRequest
} from "./types";

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function requestJson<T>(
  path: string,
  init?: RequestInit,
  options?: { firebaseUser?: User | null; forceRefreshToken?: boolean }
): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  headers.set("Content-Type", "application/json");

  const user = options?.firebaseUser;
  if (user) {
    const idToken = await user.getIdToken(options?.forceRefreshToken ?? false);
    headers.set("Authorization", `Bearer ${idToken}`);

    if (isAuthEmulatorEnabled()) {
      headers.set("X-Firebase-Uid", user.uid);
      if (user.email) {
        headers.set("X-Firebase-Email", user.email);
      }
      headers.set("X-Firebase-Email-Verified", String(user.emailVerified));
    }
  }

  let response: Response;
  try {
    response = await fetchWithApiFallback(path, {
      ...init,
      headers,
    });
  } catch {
    throw new ApiError(0, "네트워크 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.");
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
    let detail = "api_error";
    if (body && typeof body === "object" && "detail" in body) {
      const rawDetail = (body as { detail: unknown }).detail;
      if (typeof rawDetail === "string") {
        detail = rawDetail;
      } else {
        try {
          detail = JSON.stringify(rawDetail);
        } catch {
          detail = "api_error";
        }
      }
    }
    throw new ApiError(response.status, detail);
  }

  return body as T;
}

export async function signupBootstrap(request: SignupBootstrapRequest): Promise<SessionContract> {
  return requestJson<SessionContract>("/v1/auth/signup", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export async function checkNicknameAvailability(nickname: string): Promise<boolean> {
  const response = await requestJson<{ is_available: boolean }>("/v1/auth/nickname/availability", {
    method: "POST",
    body: JSON.stringify({ nickname })
  });
  return Boolean(response.is_available);
}

export async function bootstrapSession(firebaseUser: User): Promise<SessionContract> {
  return requestJson<SessionContract>(
    "/v1/auth/session/bootstrap",
    {
      method: "POST",
      body: JSON.stringify({ firebase_uid: firebaseUser.uid })
    },
    { firebaseUser, forceRefreshToken: true }
  );
}

export async function checkChangeEmailAvailability(
  firebaseUser: User,
  newEmail: string
): Promise<boolean> {
  const response = await requestJson<{ is_available: boolean }>(
    "/v1/auth/change-email/availability",
    {
      method: "POST",
      body: JSON.stringify({ new_email: newEmail })
    },
    { firebaseUser }
  );
  return Boolean(response.is_available);
}

export async function saveOnboardingProfile(
  firebaseUser: User,
  payload: OnboardingProfileRequest
): Promise<SessionContract> {
  return requestJson<SessionContract>(
    "/v1/onboarding/profile",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    { firebaseUser }
  );
}

export async function completeBaselineAssessment(
  firebaseUser: User,
  payload: BaselineAssessmentRequest
): Promise<SessionContract> {
  return requestJson<SessionContract>(
    "/v1/onboarding/baseline-assessment/complete",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    { firebaseUser }
  );
}

export async function deleteAccountSession(firebaseUser: User): Promise<{ result: string }> {
  return requestJson<{ result: string }>(
    "/v1/auth/account/delete",
    {
      method: "POST"
    },
    { firebaseUser }
  );
}

export { ApiError };
