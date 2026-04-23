import { db } from "@/lib/db";

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 60_000;

function ragflowBase() {
  return process.env.RAGFLOW_BASE_URL ?? "";
}

function ragflowKey() {
  return process.env.RAGFLOW_API_KEY ?? "";
}

function pastBidsDatasetId() {
  return process.env.RAGFLOW_DATASET_PAST_BIDS ?? "aca85a8a3bfb11f18e37b14efee78710";
}

interface RedFlag {
  severity: string;
  description: string;
}

interface Recommendation {
  decision?: string;
  confidence?: number;
  justifications?: string[];
  redFlags?: RedFlag[];
}

function deriveDecisionFinal(
  analyzerDecision: string,
  overrideDecision: string,
  outcome?: string | null
): string {
  if (outcome && outcome !== "pending") return outcome;
  if (overrideDecision !== "none") return overrideDecision;
  return analyzerDecision;
}

function renderMarkdown(analysis: {
  id: string;
  rfpId: string;
  clientName: string | null;
  createdAt: Date;
  decision: string;
  confidence: number;
  recommendation: unknown;
  overrideDecision: string;
  overrideScope: string | null;
  overrideRationale: string | null;
  overrideByUserEmail: string | null;
  overrideAt: Date | null;
  citedAnalysisIds: string[];
}): string {
  const rec = (analysis.recommendation ?? {}) as Recommendation;
  const client = analysis.clientName ?? "Unknown Client";
  const decisionFinal = deriveDecisionFinal(
    analysis.decision,
    analysis.overrideDecision
  );

  const blockersLines =
    rec.redFlags && rec.redFlags.length > 0
      ? rec.redFlags.map((f) => `  - [${f.severity}] ${f.description}`).join("\n")
      : "  - None identified";

  const precedents =
    analysis.citedAnalysisIds.length > 0
      ? analysis.citedAnalysisIds.join(", ")
      : "None";

  return [
    `# ${client} — ${analysis.rfpId} — ${decisionFinal}`,
    "",
    `**Analysis ID:** ${analysis.id}`,
    `**RFP Date:** ${analysis.createdAt.toISOString().slice(0, 10)}`,
    "",
    "## Analyzer Verdict",
    `- Decision: ${analysis.decision} (confidence ${analysis.confidence}%)`,
    "- Key blockers:",
    blockersLines,
    "",
    "## Human Override",
    `- Final decision: ${analysis.overrideDecision}`,
    "- Scope (if scoped):",
    analysis.overrideScope ?? "N/A",
    `- Rationale: ${analysis.overrideRationale ?? "N/A"}`,
    `- Override by: ${analysis.overrideByUserEmail ?? "N/A"} at ${analysis.overrideAt?.toISOString() ?? "N/A"}`,
    `- Cited precedents: ${precedents}`,
    "",
    "## Outcome (post-bid)",
    "- Result: pending",
    "- Rationale: N/A",
    "- Recorded at: N/A",
  ].join("\n");
}

async function deleteRagflowDoc(docId: string): Promise<void> {
  const dsId = pastBidsDatasetId();
  await fetch(`${ragflowBase()}/api/v1/datasets/${dsId}/documents`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${ragflowKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids: [docId] }),
  });
}

async function uploadRagflowDoc(analysisId: string, markdown: string): Promise<string> {
  const dsId = pastBidsDatasetId();
  const blob = new Blob([markdown], { type: "text/markdown" });
  const form = new FormData();
  form.append("file", blob, `${analysisId}.md`);

  const res = await fetch(`${ragflowBase()}/api/v1/datasets/${dsId}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ragflowKey()}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RAGflow upload failed: ${text}`);
  }
  const body = (await res.json()) as { code: number; data?: { id: string }[] };
  const docId = body.data?.[0]?.id;
  if (!docId) throw new Error("RAGflow upload returned no document ID");
  return docId;
}

async function triggerRagflowParse(docId: string): Promise<void> {
  const dsId = pastBidsDatasetId();
  const res = await fetch(`${ragflowBase()}/api/v1/datasets/${dsId}/documents/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ragflowKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ document_ids: [docId] }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RAGflow parse trigger failed: ${text}`);
  }
}

async function pollUntilDone(docId: string): Promise<void> {
  const dsId = pastBidsDatasetId();
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(
      `${ragflowBase()}/api/v1/datasets/${dsId}/documents?id=${encodeURIComponent(docId)}`,
      { headers: { Authorization: `Bearer ${ragflowKey()}` } }
    );
    if (!res.ok) continue;

    const body = (await res.json()) as {
      code: number;
      data?: { docs: { id: string; run: string }[] };
    };
    const doc = body.data?.docs?.find((d) => d.id === docId);
    if (!doc) continue;
    if (doc.run === "DONE") return;
    if (doc.run === "FAIL") throw new Error("RAGflow parsing failed");
  }
  throw new Error("RAGflow parse timed out (60s)");
}

/**
 * Unified writeback: upload a markdown summary of the analysis to the past-bids
 * RAGflow dataset, poll until parsed, and persist the doc ID on the DB row.
 * Idempotent — deletes any existing doc for the same analysis before re-uploading.
 */
export async function writebackToRagflow(analysisId: string): Promise<void> {
  const analysis = await db.rfpAnalysis.findUnique({ where: { id: analysisId } });
  if (!analysis) throw new Error(`Analysis ${analysisId} not found`);

  // Idempotent re-sync: remove stale doc first
  if (analysis.ragflowDocId) {
    await deleteRagflowDoc(analysis.ragflowDocId).catch(() => {});
  }

  const markdown = renderMarkdown(analysis);
  const docId = await uploadRagflowDoc(analysisId, markdown);
  await triggerRagflowParse(docId);
  await pollUntilDone(docId);

  await db.rfpAnalysis.update({
    where: { id: analysisId },
    data: { persistedToRagflow: true, ragflowDocId: docId },
  });
}
