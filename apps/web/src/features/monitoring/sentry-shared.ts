import * as Sentry from "@sentry/nextjs";
import type { Breadcrumb, Event } from "@sentry/nextjs";

import { getSentryDsn, getSentryTracesSampleRate } from "./config";

const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|password|passwd|secret|token|session|credential|email|phone|journal|content|prompt|reply|ticket|comment|post|body/i;

function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

function sanitizeValue(value: unknown, keyHint = ""): unknown {
  if (value == null) {
    return value;
  }

  if (typeof value === "string") {
    return SENSITIVE_KEY_PATTERN.test(keyHint) ? "[REDACTED]" : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, keyHint));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : sanitizeValue(nestedValue, key),
      ]),
    );
  }

  return value;
}

function sanitizeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category?.startsWith("console")) {
    return null;
  }

  return {
    ...breadcrumb,
    data: sanitizeValue(breadcrumb.data) as Breadcrumb["data"],
  };
}

function sanitizeEvent(event: Event): Event {
  return {
    ...event,
    breadcrumbs: event.breadcrumbs?.map(sanitizeBreadcrumb).filter(Boolean) as Breadcrumb[] | undefined,
    extra: sanitizeValue(event.extra) as Event["extra"],
    contexts: sanitizeValue(event.contexts) as Event["contexts"],
    request: event.request
      ? {
          ...event.request,
          url: sanitizeUrl(event.request.url),
          data: undefined,
          cookies: undefined,
          headers: undefined,
        }
      : undefined,
    server_name: undefined,
    user: event.user
      ? {
          ...event.user,
          email: undefined,
          ip_address: undefined,
          username: undefined,
          name: undefined,
        }
      : undefined,
  };
}

export function buildSentryOptions(runtime: "client" | "server" | "edge") {
  const dsn = getSentryDsn(runtime);

  return {
    dsn: dsn || undefined,
    enabled: Boolean(dsn),
    environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
    sendDefaultPii: false,
    maxBreadcrumbs: 20,
    normalizeDepth: 3,
    tracesSampleRate: getSentryTracesSampleRate(runtime),
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeBreadcrumb: sanitizeBreadcrumb,
    beforeSend: sanitizeEvent,
    initialScope: {
      tags: {
        runtime,
      },
    },
  } as Parameters<typeof Sentry.init>[0];
}
