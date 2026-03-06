import type { AccountStatus, OnboardingStatus } from "./types";

const COOKIE_KEY_ACCOUNT = "ms_account_status";
const COOKIE_KEY_ONBOARDING = "ms_onboarding_status";
const COOKIE_AGE_SECONDS = 60 * 60 * 2;

export function setSessionCookies(
  accountStatus: AccountStatus,
  onboardingStatus: OnboardingStatus
): void {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${COOKIE_KEY_ACCOUNT}=${accountStatus}; path=/; max-age=${COOKIE_AGE_SECONDS}; samesite=lax`;
  document.cookie = `${COOKIE_KEY_ONBOARDING}=${onboardingStatus}; path=/; max-age=${COOKIE_AGE_SECONDS}; samesite=lax`;
}

export function clearSessionCookies(): void {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${COOKIE_KEY_ACCOUNT}=; path=/; max-age=0; samesite=lax`;
  document.cookie = `${COOKIE_KEY_ONBOARDING}=; path=/; max-age=0; samesite=lax`;
}
