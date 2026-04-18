import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Suppress Sentry CLI logs during build
  silent: !process.env.CI,
  // Upload source maps only in CI to avoid leaking them locally
  sourcemaps: {
    disable: !process.env.CI,
  },
  // Automatically tree-shake Sentry logger statements
  disableLogger: true,
});
