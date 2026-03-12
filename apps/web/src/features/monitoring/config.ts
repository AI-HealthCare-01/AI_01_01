const googleAnalyticsId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";
const browserSentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ?? "";
const serverSentryDsn =
  process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || "";

function parseSampleRate(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, parsed));
}

export function getGoogleAnalyticsId(): string {
  return googleAnalyticsId;
}

export function getSentryDsn(runtime: "client" | "server" | "edge"): string {
  return runtime === "client" ? browserSentryDsn : serverSentryDsn;
}

export function getSentryTracesSampleRate(runtime: "client" | "server" | "edge"): number {
  if (runtime === "client") {
    return parseSampleRate(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE, 0.1);
  }

  return parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1);
}
