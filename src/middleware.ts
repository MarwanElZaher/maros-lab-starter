import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";

// Routes that require Cloudflare Access JWT auth
export const config = {
  matcher: ["/api/audit/:path*", "/api/rfp/:path*", "/api/kb/:path*", "/api/user/:path*"],
};

const CF_TEAM_DOMAIN = process.env.CF_ACCESS_TEAM_DOMAIN;
const CF_ACCESS_AUD = process.env.CF_ACCESS_AUD;

export async function middleware(req: NextRequest): Promise<NextResponse> {
  // Dev bypass: if CF not configured, forward a dev email so route handlers still work
  if (!CF_TEAM_DOMAIN || !CF_ACCESS_AUD) {
    if (process.env.NODE_ENV !== "production") {
      const res = NextResponse.next();
      res.headers.set("x-user-email", process.env.DEV_USER_EMAIL ?? "dev@marwanelzaher.info");
      return res;
    }
    return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
  }

  const token = req.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const JWKS = createRemoteJWKSet(
      new URL(`https://${CF_TEAM_DOMAIN}/cdn-cgi/access/certs`)
    );
    const { payload } = await jwtVerify(token, JWKS, {
      audience: CF_ACCESS_AUD,
    });

    const email = payload.email as string | undefined;
    if (!email) {
      return NextResponse.json({ error: "Invalid token: missing email claim" }, { status: 401 });
    }

    const res = NextResponse.next();
    res.headers.set("x-user-email", email);
    return res;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
