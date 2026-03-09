import type { SessionContract } from "./types";

const BLOCKED_STATUSES = new Set(["restricted", "suspended", "deleted"]);

export function isOnboardingComplete(session: SessionContract | null | undefined): boolean {
  if (!session) {
    return false;
  }

  const status = session.account.account_status;
  if (BLOCKED_STATUSES.has(status)) {
    return false;
  }

  if (status === "active") {
    return true;
  }

  return (
    session.account.email_verified &&
    session.onboarding.onboarding_status === "complete" &&
    session.onboarding.baseline_assessment_completed
  );
}

export function shouldGoOnboarding(session: SessionContract | null | undefined): boolean {
  if (!session) {
    return false;
  }

  const status = session.account.account_status;
  if (BLOCKED_STATUSES.has(status)) {
    return false;
  }

  if (!session.account.email_verified) {
    return false;
  }

  if (status === "active_onboarding_required") {
    return true;
  }

  return !isOnboardingComplete(session);
}

