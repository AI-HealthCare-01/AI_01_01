import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Next.js loads this file during instrumentation even though NodeNext wants an extension here.
    // @ts-expect-error Next.js instrumentation resolves the TypeScript module directly.
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    // @ts-expect-error Next.js instrumentation resolves the TypeScript module directly.
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
