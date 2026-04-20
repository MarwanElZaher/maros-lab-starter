import { NextRequest, NextResponse } from "next/server";
import { withRole, RequestUser } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

async function handlePost(req: NextRequest, user: RequestUser): Promise<NextResponse> {
  const { rfpId } = await req.json() as { rfpId?: string };
  await logAuditEvent({ action: "rfp.view", userEmail: user.email, rfpId });
  return NextResponse.json({ ok: true });
}

export const POST = withRole("presales_engineer", handlePost);
