import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const analysis = await db.rfpAnalysis.findFirst({
    where: { OR: [{ id }, { rfpId: id }] },
  });

  if (!analysis) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (user.role === "presales_engineer" && analysis.submitterEmail !== user.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(analysis);
}
