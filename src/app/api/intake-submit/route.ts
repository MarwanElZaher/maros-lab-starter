import { NextRequest, NextResponse } from "next/server";

const REQUIRED_FIELDS = ["clientName", "contactEmail", "userStory"] as const;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const missing = REQUIRED_FIELDS.filter(
    (field) => !body[field] || String(body[field]).trim() === ""
  );

  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Missing required fields", fields: missing },
      { status: 400 }
    );
  }

  const n8nUrl = process.env.N8N_INTAKE_WEBHOOK_URL;
  if (!n8nUrl) {
    return NextResponse.json(
      { error: "Intake webhook not configured" },
      { status: 503 }
    );
  }

  const upstream = await fetch(n8nUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    const html = await upstream.text();
    return new NextResponse(html, {
      status: upstream.status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}
