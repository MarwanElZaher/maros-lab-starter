import { NextRequest, NextResponse } from "next/server";
import { withRole, RequestUser } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

const ragflowBase = () => process.env.RAGFLOW_BASE_URL ?? "";
const ragflowKey = () => process.env.RAGFLOW_API_KEY ?? "";

async function ragflow(path: string, method: string, body?: unknown) {
  const res = await fetch(`${ragflowBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${ragflowKey()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RAGflow ${method} ${path} failed: ${text}`);
  }
  return res.json();
}

async function handlePost(req: NextRequest, user: RequestUser): Promise<NextResponse> {
  const { action, entity, data } = await req.json() as {
    action: "add_product" | "update_pricing" | "archive_bid";
    entity: string;
    data?: Record<string, unknown>;
  };

  if (!action || !entity) {
    return NextResponse.json({ error: "action and entity are required" }, { status: 400 });
  }

  let result: unknown;
  if (action === "add_product") {
    result = await ragflow("/api/v1/document", "POST", { name: entity, ...data });
  } else if (action === "update_pricing") {
    result = await ragflow(`/api/v1/document/${entity}`, "PATCH", data);
  } else if (action === "archive_bid") {
    result = await ragflow(`/api/v1/document/${entity}`, "DELETE");
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  await logAuditEvent({ action: "kb.update", userEmail: user.email, metadata: { action, entity } });
  return NextResponse.json({ ok: true, data: result });
}

export const POST = withRole("sales_director", handlePost);
