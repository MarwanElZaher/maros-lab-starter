import { NextRequest, NextResponse } from "next/server";
import { withRole, RequestUser } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

const ragflowBase = () => process.env.RAGFLOW_BASE_URL ?? "";
const ragflowKey = () => process.env.RAGFLOW_API_KEY ?? "";

type Dataset = "products" | "pricing" | "past_bids";

function datasetId(dataset: Dataset): string {
  const map: Record<Dataset, string | undefined> = {
    products: process.env.RAGFLOW_DATASET_PRODUCTS,
    pricing: process.env.RAGFLOW_DATASET_PRICING,
    past_bids: process.env.RAGFLOW_DATASET_PAST_BIDS,
  };
  return map[dataset] ?? "";
}

function isDataset(value: unknown): value is Dataset {
  return value === "products" || value === "pricing" || value === "past_bids";
}

async function handleParse(
  req: NextRequest,
  user: RequestUser,
  params: { docId: string },
): Promise<NextResponse> {
  const dataset = req.nextUrl.searchParams.get("dataset");
  if (!isDataset(dataset)) {
    return NextResponse.json({ error: "dataset must be products|pricing|past_bids" }, { status: 400 });
  }
  const dsId = datasetId(dataset);
  if (!dsId) {
    return NextResponse.json({ error: `Dataset ${dataset} not configured` }, { status: 503 });
  }

  const res = await fetch(`${ragflowBase()}/api/v1/datasets/${dsId}/documents/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ragflowKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ document_ids: [params.docId] }),
  });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `RAGflow error: ${text}` }, { status: 502 });
  }

  await logAuditEvent({ action: "kb.parse", userEmail: user.email, metadata: { dataset, docId: params.docId } });
  return NextResponse.json({ ok: true });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  const resolvedParams = await params;
  return withRole("sales_director", (r, u) => handleParse(r, u, resolvedParams))(req);
}
