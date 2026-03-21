"use client";

import * as Sentry from "@sentry/nextjs";
import { type ReactNode, useEffect } from "react";

import { useAuthContext } from "../auth";

export function MonitoringProvider({ children }: { children: ReactNode }) {
  const { phase, session } = useAuthContext();

  useEffect(() => {
    if (phase !== "signed_in" || !session) {
      Sentry.setUser(null);
      Sentry.setTag("account_status", "signed_out");
      Sentry.setTag("email_verified", "false");
      Sentry.setTag("onboarding_status", "unknown");
      return;
    }

    Sentry.setUser({
      id: session.account.user_id,
    });
    Sentry.setTag("account_status", session.account.account_status);
    Sentry.setTag("email_verified", session.account.email_verified ? "true" : "false");
    Sentry.setTag("onboarding_status", session.onboarding.onboarding_status);
  }, [phase, session]);

  return <>{children}</>;
}
