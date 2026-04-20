import { NextRequest, NextResponse } from "next/server";
import { db } from "./db";

export type UserRole = "presales_engineer" | "sales_director";

export interface RequestUser {
  email: string;
  role: UserRole;
}

// Role hierarchy: sales_director > presales_engineer
const ROLE_RANK: Record<UserRole, number> = {
  presales_engineer: 1,
  sales_director: 2,
};

/**
 * Reads x-user-email (set by middleware after CF Access JWT validation)
 * and looks up the role from the database.
 * Returns null if the email header is missing or the user is not in app_users.
 */
export async function getRequestUser(req: NextRequest): Promise<RequestUser | null> {
  const email = req.headers.get("x-user-email");
  if (!email) return null;

  const user = await db.appUser.findUnique({ where: { email } });
  if (!user) return null;

  return { email: user.email, role: user.role as UserRole };
}

/**
 * HOF: wraps a route handler and enforces that the caller has at least
 * the required role. Returns 401 if no user, 403 if insufficient role.
 */
export function withRole(
  minimumRole: UserRole,
  handler: (req: NextRequest, user: RequestUser) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const user = await getRequestUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (ROLE_RANK[user.role] < ROLE_RANK[minimumRole]) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return handler(req, user);
  };
}
