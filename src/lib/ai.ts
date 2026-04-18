import Anthropic from "@anthropic-ai/sdk";

// Singleton client — reuse across requests in the same Lambda/Edge invocation
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Default model — override per-call when needed
export const DEFAULT_MODEL = "claude-sonnet-4-6";

/**
 * Wraps a system prompt with cache_control so long/static context is cached
 * by default on every call that uses this helper.
 *
 * Per ADR: prompt caching is non-negotiable for production.
 */
export function cachedSystem(text: string): Anthropic.MessageParam["content"] {
  return [
    {
      type: "text",
      text,
      // @ts-expect-error cache_control is valid in the API but not yet in all SDK type definitions
      cache_control: { type: "ephemeral" },
    },
  ];
}
