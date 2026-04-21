import { NextRequest, NextResponse } from "next/server";
import { withRole, RequestUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function handleExport(_req: NextRequest, user: RequestUser): Promise<NextResponse> {
  const analyses = await db.rfpAnalysis.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      rfpId: true,
      submitterEmail: true,
      clientName: true,
      decision: true,
      confidence: true,
      redFlagCount: true,
      createdAt: true,
    },
  });

  await logAuditEvent({
    action: "rfp.export",
    userEmail: user.email,
    metadata: { count: analyses.length },
  });

  const header = "id,rfpId,submitterEmail,clientName,decision,confidence,redFlagCount,createdAt\n";
  const rows = analyses
    .map((a) =>
      [
        a.id,
        a.rfpId,
        a.submitterEmail,
        a.clientName ?? "",
        a.decision,
        String(a.confidence),
        String(a.redFlagCount),
        a.createdAt.toISOString(),
      ]
        .map((v) => escapeCsv(v))
        .join(",")
    )
    .join("\n");

  const filename = `rfp-analyses-${new Date().toISOString().split("T")[0]}.csv`;

  return new NextResponse(header + rows, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withRole("sales_director", handleExport);
