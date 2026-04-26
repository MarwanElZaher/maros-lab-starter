import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  testMatch: ["<rootDir>/tests/unit/**/*.test.{ts,tsx}"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // Allow tests to resolve packages that live only in the rfp-analyzer service
  modulePaths: ["<rootDir>/services/rfp-analyzer/node_modules"],
  // jose ships as ESM; langfuse-* use dynamic import() which needs babel transform
  transformIgnorePatterns: ["/node_modules/(?!(jose|langfuse|langfuse-langchain|langfuse-core)/)"],
};

export default createJestConfig(config);
