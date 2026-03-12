import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true
};

const hasSentryReleaseConfig = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
);

const sentryBuildOptions = {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  release: {
    name: process.env.SENTRY_RELEASE
  },
  telemetry: false,
  silent: true
};

export default hasSentryReleaseConfig ? withSentryConfig(nextConfig, sentryBuildOptions) : nextConfig;
