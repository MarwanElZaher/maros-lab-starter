import { NextRequest, NextResponse } from "next/server";
import { withRole, RequestUser } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { db } from "@/lib/db";

const VALID_DECISIONS = ["go_full", "go_scoped", "no_go_confirmed"] as const;
type OverrideDecision = (typeof VALID_DECISIONS)[number];

interface OverrideBody {
  override_decision: OverrideDecision;
  override_scope?: string;
  override_rationale: string;
  cited_analysis_ids?: string[];
}

async function handleOverride(
  req: NextRequest,
  user: RequestUser,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: OverrideBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { override_decision, override_scope, override_rationale, cited_analysis_ids } = body;

  // 422 validation
  if (!override_decision || !VALID_DECISIONS.includes(override_decision)) {
    return NextResponse.json(
      { error: "override_decision must be one of: go_full, go_scoped, no_go_confirmed" },
      { status: 422 }
    );
  }
  if (!override_rationale || override_rationale.trim() === "") {
    return NextResponse.json(
      { error: "override_rationale is required" },
      { status: 422 }
    );
  }
  if (override_decision === "go_scoped" && (!override_scope || override_scope.trim() === "")) {
    return NextResponse.json(
      { error: "override_scope is required when override_decision is go_scoped" },
      { status: 422 }
    );
  }

  const analysis = await db.rfpAnalysis.findFirst({
    where: { OR: [{ id }, { rfpId: id }] },
  });
  if (!analysis) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  // 409 if already overridden
  if (analysis.overrideDecision !== "none") {
    return NextResponse.json(
      { error: "Analysis already has an override" },
      { status: 409 }
    );
  }

  const now = new Date();
  const updated = await db.rfpAnalysis.update({
    where: { id: analysis.id },
    data: {
      overrideDecision: override_decision,
      overrideScope: override_scope ?? null,
      overrideRationale: override_rationale,
      overrideByUserEmail: user.email,
      overrideAt: now,
      citedAnalysisIds: cited_analysis_ids ?? [],
    },
  });

  // Synchronous audit event before responding
  await logAuditEvent({
    action: "rfp.override",
    userEmail: user.email,
    rfpId: id,
    metadata: {
      override_decision,
      override_scope: override_scope ?? null,
      override_rationale,
      cited_analysis_ids: cited_analysis_ids ?? [],
    },
  });

  // Trigger background RAGflow writeback (fire-and-forget; S3 implements the handler)
  const writebackUrl = process.env.N8N_RAGFLOW_WRITEBACK_URL;
  if (writebackUrl) {
    fetch(writebackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysisId: updated.id, rfpId: id, trigger: "override" }),
    }).catch(() => {
      // S3 writeback; failures are non-fatal and retried by the job runner
    });
  }

  return NextResponse.json({ analysis: updated });
}

export const POST = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) =>
  withRole("sales_director", (r, user) => handleOverride(r, user, ctx))(req);
