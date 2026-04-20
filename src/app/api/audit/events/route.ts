import { NextRequest, NextResponse } from "next/server";
import { withRole, RequestUser } from "@/lib/auth";
import { db } from "@/lib/db";

async function handleGet(req: NextRequest, user: RequestUser): Promise<NextResponse> {
  void user;
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = 50;

  const [events, total] = await Promise.all([
    db.auditEvent.findMany({
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.auditEvent.count(),
  ]);

  return NextResponse.json({ events, total, page, pageSize });
}

export const GET = withRole("sales_director", handleGet);
