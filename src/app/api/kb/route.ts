import { NextRequest, NextResponse } from "next/server";
import { withRole, RequestUser } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

const ragflowBase = () => process.env.RAGFLOW_BASE_URL ?? "";
const ragflowKey = () => process.env.RAGFLOW_API_KEY ?? "";

type Dataset = "products" | "pricing" | "past_bids" | "licensing" | "user_guides";

function datasetId(dataset: Dataset): string {
  const map: Record<Dataset, string | undefined> = {
    products: process.env.RAGFLOW_DATASET_PRODUCTS,
    pricing: process.env.RAGFLOW_DATASET_PRICING,
    past_bids: process.env.RAGFLOW_DATASET_PAST_BIDS,
    licensing: process.env.RAGFLOW_DATASET_LICENSING,
    user_guides: process.env.RAGFLOW_DATASET_USER_GUIDES,
  };
  return map[dataset] ?? "";
}

function isDataset(value: unknown): value is Dataset {
  return (
    value === "products" ||
    value === "pricing" ||
    value === "past_bids" ||
    value === "licensing" ||
    value === "user_guides"
  );
}

interface RagflowDoc {
  id: string;
  name: string;
  run: string;
  progress?: number;
  create_time?: string;
}

interface RagflowListResponse {
  code: number;
  data?: { docs: RagflowDoc[] };
  message?: string;
}

function mapStatus(run: string): "parsing" | "ready" | "failed" | "pending" {
  if (run === "RUNNING") return "parsing";
  if (run === "DONE") return "ready";
  if (run === "FAIL") return "failed";
  return "pending";
}

async function handleGet(req: NextRequest): Promise<NextResponse> {
  const dataset = req.nextUrl.searchParams.get("dataset");
  if (!isDataset(dataset)) {
    return NextResponse.json({ error: "dataset must be products|pricing|past_bids|licensing|user_guides" }, { status: 400 });
  }
  const dsId = datasetId(dataset);
  if (!dsId) {
    return NextResponse.json({ error: `Dataset ${dataset} not configured` }, { status: 503 });
  }

  const res = await fetch(`${ragflowBase()}/api/v1/datasets/${dsId}/documents`, {
    headers: { Authorization: `Bearer ${ragflowKey()}` },
  });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `RAGflow error: ${text}` }, { status: 502 });
  }
  const body = await res.json() as RagflowListResponse;
  const docs = (body.data?.docs ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    status: mapStatus(d.run),
    created_at: d.create_time ?? null,
  }));
  return NextResponse.json({ docs });
}

async function handlePost(req: NextRequest, user: RequestUser): Promise<NextResponse> {
  const form = await req.formData();
  const file = form.get("file");
  const dataset = form.get("dataset");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!isDataset(dataset)) {
    return NextResponse.json({ error: "dataset must be products|pricing|past_bids|licensing|user_guides" }, { status: 400 });
  }
  const dsId = datasetId(dataset);
  if (!dsId) {
    return NextResponse.json({ error: `Dataset ${dataset} not configured` }, { status: 503 });
  }

  const upstream = new FormData();
  upstream.append("file", file, file.name);

  const res = await fetch(`${ragflowBase()}/api/v1/datasets/${dsId}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ragflowKey()}` },
    body: upstream,
  });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `RAGflow error: ${text}` }, { status: 502 });
  }
  const body = await res.json() as { code: number; data?: { id: string }[] };
  const docId = body.data?.[0]?.id ?? null;

  await logAuditEvent({ action: "kb.create", userEmail: user.email, metadata: { dataset, docId, fileName: file.name } });
  return NextResponse.json({ ok: true, docId });
}

export const GET = withRole("sales_director", (req) => handleGet(req));
export const POST = withRole("sales_director", handlePost);
