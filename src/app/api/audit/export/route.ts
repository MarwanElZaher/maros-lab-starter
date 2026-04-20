import { NextRequest, NextResponse } from "next/server";
import { withRole, RequestUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";

function escapeCsvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function handleExport(req: NextRequest, user: RequestUser): Promise<NextResponse> {
  const events = await db.auditEvent.findMany({
    orderBy: { timestamp: "desc" },
  });

  await logAuditEvent({
    action: "audit.export",
    userEmail: user.email,
    metadata: { count: events.length },
  });

  const header = "id,userEmail,action,rfpId,timestamp,metadata\n";
  const rows = events
    .map((e) =>
      [
        e.id,
        e.userEmail,
        e.action,
        e.rfpId ?? "",
        e.timestamp.toISOString(),
        JSON.stringify(e.metadata ?? {}),
      ]
        .map((v) => escapeCsvField(String(v)))
        .join(",")
    )
    .join("\n");

  const filename = `audit-events-${new Date().toISOString().split("T")[0]}.csv`;

  return new NextResponse(header + rows, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withRole("sales_director", handleExport);
