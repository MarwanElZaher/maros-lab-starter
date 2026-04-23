import { db } from "./db";

export type AuditAction =
  | "rfp.upload"
  | "rfp.view"
  | "rfp.export"
  | "rfp.override"
  | "kb.create"
  | "kb.update"
  | "kb.archive"
  | "kb.delete"
  | "kb.parse"
  | "audit.export";

export interface AuditEventInput {
  action: AuditAction;
  userEmail: string;
  rfpId?: string;
  metadata?: Record<string, unknown>;
}

export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  await db.auditEvent.create({
    data: {
      action: input.action,
      userEmail: input.userEmail,
      rfpId: input.rfpId ?? null,
      metadata: input.metadata ? (input.metadata as Parameters<typeof db.auditEvent.create>[0]["data"]["metadata"]) : undefined,
    },
  });
}
