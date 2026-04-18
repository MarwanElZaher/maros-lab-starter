// Shared TypeScript types for this engagement.
// Keep domain types here; API response shapes go in src/lib/api.ts (when needed).

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
