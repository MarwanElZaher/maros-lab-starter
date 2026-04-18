import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Capture 10% of transactions for performance monitoring in production
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  // Enable session replay for error context (1% in prod, 100% in dev)
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: process.env.NODE_ENV === "production" ? 0.01 : 1.0,
  integrations: [
    Sentry.replayIntegration(),
  ],
  enabled: process.env.NODE_ENV !== "test",
});
