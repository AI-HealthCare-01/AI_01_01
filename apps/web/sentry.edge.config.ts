import * as Sentry from "@sentry/nextjs";

import { buildSentryOptions } from "./src/features/monitoring/sentry-shared";

Sentry.init(buildSentryOptions("edge"));
