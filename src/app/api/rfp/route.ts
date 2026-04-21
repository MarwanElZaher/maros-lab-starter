import { NextRequest } from "next/server";
import { withRole, RequestUser } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { uploadBuffer } from "@/lib/minio";
import { db } from "@/lib/db";

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function handleUpload(req: NextRequest, user: RequestUser) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return new Response(JSON.stringify({ error: "No file provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (file.size > 50 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: "File too large (max 50 MB)" }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    });
  }

  const filename = file.name;

  await logAuditEvent({ action: "rfp.upload", userEmail: user.email, metadata: { filename } });

  const pdfBuffer = Buffer.from(await file.arrayBuffer());

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      };

      send("progress", { step: "uploading", message: "Uploading document…", pct: 10 });

      const webhookUrl = process.env.N8N_RFP_WEBHOOK_URL;
      if (!webhookUrl) {
        send("error", { message: "Analysis service not configured" });
        controller.close();
        return;
      }

      try {
        send("progress", { step: "extracting", message: "Extracting requirements…", pct: 30 });

        const body = new FormData();
        body.append("file", file, filename);
        body.append("userEmail", user.email);

        const n8nResponse = await fetch(webhookUrl, { method: "POST", body });

        send("progress", { step: "analyzing", message: "Running bid analysis…", pct: 60 });

        if (!n8nResponse.ok) {
          const text = await n8nResponse.text();
          send("error", { message: `Analysis failed: ${text}` });
          controller.close();
          return;
        }

        send("progress", { step: "scoring", message: "Scoring bid confidence…", pct: 85 });

        const result = await n8nResponse.json();

        const rfpId: string = result.rfpId ?? crypto.randomUUID();
        const bucket = process.env.MINIO_BUCKET_RFP ?? "rfp-pdfs";
        const pdfObjectPath = `rfp-${rfpId}.pdf`;

        try {
          await uploadBuffer(bucket, pdfObjectPath, pdfBuffer, "application/pdf");

          await db.rfpAnalysis.create({
            data: {
              rfpId,
              submitterEmail: user.email,
              clientName: result.clientName ?? null,
              pdfObjectPath,
              recommendation: result.recommendation ?? result,
              decision: result.decision ?? "unknown",
              confidence: typeof result.confidence === "number" ? result.confidence : 0,
              redFlagCount: typeof result.redFlagCount === "number" ? result.redFlagCount : 0,
            },
          });
        } catch (persistErr) {
          // Persistence failure does not block the user from seeing results
          console.error("Failed to persist RFP analysis", persistErr);
        }

        send("progress", { step: "done", message: "Analysis complete", pct: 100 });
        send("result", { report: result, rfpId });
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : "Analysis failed" });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export const POST = withRole("presales_engineer", handleUpload);
