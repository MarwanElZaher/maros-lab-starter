/**
 * Unit tests for KB upload metadata validation (MAR-76).
 * Verifies that product, version, date, outcome (past_bids), and customer (past_bids)
 * are required at the API layer.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db", () => ({
  db: {
    appUser: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/audit", () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/ragflow-metadata", () => ({
  setRagflowDocumentMetadata: jest.fn().mockResolvedValue(undefined),
}));

// Stub fetch globally — happy-path RAGflow upload response
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { db } from "@/lib/db";
// POST is imported lazily after env setup

const mockFindUnique = db.appUser.findUnique as jest.Mock;

function makeUploadRequest(fields: Record<string, string>, envOverrides: Record<string, string> = {}): NextRequest {
  const form = new FormData();
  const blob = new Blob(["dummy content"], { type: "application/pdf" });
  form.append("file", new File([blob], "test.pdf", { type: "application/pdf" }));
  for (const [k, v] of Object.entries(fields)) {
    form.append(k, v);
  }

  return new NextRequest("http://localhost/api/kb", {
    method: "POST",
    headers: { "x-user-email": "admin@acme.com" },
    body: form,
  });
}

describe("KB upload API — metadata validation (MAR-76)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindUnique.mockResolvedValue({ email: "admin@acme.com", role: "sales_director" });

    process.env.RAGFLOW_BASE_URL = "http://ragflow.test";
    process.env.RAGFLOW_API_KEY = "test-key";
    process.env.RAGFLOW_DATASET_PRODUCTS = "ds-products-id";
    process.env.RAGFLOW_DATASET_PRICING = "ds-pricing-id";
    process.env.RAGFLOW_DATASET_PAST_BIDS = "ds-past-bids-id";
    process.env.RAGFLOW_DATASET_LICENSING = "ds-licensing-id";
    process.env.RAGFLOW_DATASET_USER_GUIDES = "ds-user-guides-id";

    // Default: RAGflow upload succeeds
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0, data: [{ id: "doc-123" }] }),
      text: async () => "",
    });
  });

  async function postKb(fields: Record<string, string>) {
    // Dynamic import to pick up env changes
    const { POST } = await import("@/app/api/kb/route");
    const req = makeUploadRequest(fields);
    return POST(req);
  }

  it("rejects upload missing product", async () => {
    const res = await postKb({ dataset: "products", version: "1.0", date: "2026-01-01" });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/product/i);
  });

  it("rejects upload missing version", async () => {
    const res = await postKb({ dataset: "products", product: "acme-core", date: "2026-01-01" });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/version/i);
  });

  it("rejects upload missing date", async () => {
    const res = await postKb({ dataset: "products", product: "acme-core", version: "1.0" });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/date/i);
  });

  it("rejects past_bids upload missing outcome", async () => {
    const res = await postKb({ dataset: "past_bids", product: "acme-core", version: "1.0", date: "2026-01-01", customer: "Globex" });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/outcome/i);
  });

  it("rejects past_bids upload missing customer", async () => {
    const res = await postKb({ dataset: "past_bids", product: "acme-core", version: "1.0", date: "2026-01-01", outcome: "won" });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/customer/i);
  });

  it("accepts valid products upload with product+version+date", async () => {
    const res = await postKb({ dataset: "products", product: "acme-core", version: "2.0", date: "2026-05-01" });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; docId: string };
    expect(body.ok).toBe(true);
  });

  it("accepts valid past_bids upload with all 5 fields", async () => {
    const res = await postKb({
      dataset: "past_bids",
      product: "acme-cloud",
      version: "3.1",
      date: "2026-04-15",
      outcome: "won",
      customer: "Globex Corp",
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; docId: string };
    expect(body.ok).toBe(true);
  });
});
