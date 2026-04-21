import { NextRequest, NextResponse } from "next/server";
import { withRole, RequestUser } from "@/lib/auth";
import { db } from "@/lib/db";

async function handleList(req: NextRequest, user: RequestUser): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const decision = searchParams.get("decision");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const submitter = searchParams.get("submitter");

  const where: Record<string, unknown> = {};

  if (user.role === "presales_engineer") {
    where.submitterEmail = user.email;
  } else if (submitter) {
    where.submitterEmail = submitter;
  }

  if (decision) where.decision = decision;

  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to + "T23:59:59Z") } : {}),
    };
  }

  const analyses = await db.rfpAnalysis.findMany({
    where,
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

  return NextResponse.json({ analyses });
}

export const GET = withRole("presales_engineer", handleList);
