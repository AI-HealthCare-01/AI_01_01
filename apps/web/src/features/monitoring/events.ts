"use client";

import * as Sentry from "@sentry/nextjs";
import { sendGAEvent } from "@next/third-parties/google";

type AnalyticsPrimitive = string | number | boolean | null | undefined;

type AnalyticsParams = Record<string, AnalyticsPrimitive>;

export const ANALYTICS_EVENTS = {
  signupCompleted: "sign_up_completed",
  loginCompleted: "login_completed",
  onboardingProfileCompleted: "onboarding_profile_completed",
  baselineAssessmentCompleted: "baseline_assessment_completed",
  checkinSubmitted: "checkin_submitted",
  supportTicketCreated: "support_ticket_created",
  boardPostCreated: "board_post_created",
} as const;

export function trackEvent(name: string, params: AnalyticsParams = {}): void {
  const filteredParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined),
  );

  sendGAEvent("event", name, filteredParams);
  Sentry.addBreadcrumb({
    category: "analytics",
    level: "info",
    message: name,
    data: filteredParams,
  });
}
