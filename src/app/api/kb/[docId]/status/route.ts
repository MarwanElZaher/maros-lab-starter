import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/auth";

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

function mapStatus(run: string): "parsing" | "ready" | "failed" | "pending" {
  if (run === "RUNNING") return "parsing";
  if (run === "DONE") return "ready";
  if (run === "FAIL") return "failed";
  return "pending";
}

interface RagflowDoc {
  id: string;
  name: string;
  run: string;
  progress?: number;
}

interface RagflowListResponse {
  code: number;
  data?: { docs: RagflowDoc[] };
}

async function handleGetStatus(
  req: NextRequest,
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

  const res = await fetch(
    `${ragflowBase()}/api/v1/datasets/${dsId}/documents?id=${encodeURIComponent(params.docId)}`,
    { headers: { Authorization: `Bearer ${ragflowKey()}` } },
  );
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `RAGflow error: ${text}` }, { status: 502 });
  }
  const body = await res.json() as RagflowListResponse;
  const doc = body.data?.docs?.find((d) => d.id === params.docId);
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  return NextResponse.json({ id: doc.id, status: mapStatus(doc.run), progress: doc.progress ?? 0 });
}

export function GET(
  req: NextRequest,
  { params }: { params: { docId: string } },
) {
  return withRole("sales_director", (r) => handleGetStatus(r, params))(req);
}
