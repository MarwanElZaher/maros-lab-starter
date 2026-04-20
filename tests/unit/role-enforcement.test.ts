/**
 * Integration tests for RBAC role enforcement (src/lib/auth.ts).
 * Mocks PrismaClient so no real DB is needed.
 */
import { NextRequest, NextResponse } from "next/server";

// Mock the db module before importing auth
jest.mock("@/lib/db", () => ({
  db: {
    appUser: {
      findUnique: jest.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { withRole, getRequestUser } from "@/lib/auth";

const mockFindUnique = db.appUser.findUnique as jest.Mock;

function makeReq(email?: string): NextRequest {
  const req = new NextRequest("http://localhost/api/audit/export");
  if (email) {
    // NextRequest headers are immutable — build via constructor
    return new NextRequest("http://localhost/api/audit/export", {
      headers: { "x-user-email": email },
    });
  }
  return req;
}

describe("getRequestUser", () => {
  afterEach(() => jest.clearAllMocks());

  it("returns null when x-user-email header is missing", async () => {
    const result = await getRequestUser(makeReq());
    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns null when user not found in DB", async () => {
    mockFindUnique.mockResolvedValue(null);
    const result = await getRequestUser(makeReq("unknown@acme.com"));
    expect(result).toBeNull();
  });

  it("returns user with role when found", async () => {
    mockFindUnique.mockResolvedValue({ email: "alice@acme.com", role: "presales_engineer" });
    const result = await getRequestUser(makeReq("alice@acme.com"));
    expect(result).toEqual({ email: "alice@acme.com", role: "presales_engineer" });
  });
});

describe("withRole", () => {
  afterEach(() => jest.clearAllMocks());

  const okHandler = jest.fn(async () => NextResponse.json({ ok: true }));

  it("returns 401 when no user header", async () => {
    const wrapped = withRole("presales_engineer", okHandler);
    const res = await wrapped(makeReq());
    expect(res.status).toBe(401);
    expect(okHandler).not.toHaveBeenCalled();
  });

  it("returns 403 when user role is below required", async () => {
    mockFindUnique.mockResolvedValue({ email: "eng@acme.com", role: "presales_engineer" });
    const wrapped = withRole("sales_director", okHandler);
    const res = await wrapped(makeReq("eng@acme.com"));
    expect(res.status).toBe(403);
    expect(okHandler).not.toHaveBeenCalled();
  });

  it("calls handler when user has exact required role", async () => {
    mockFindUnique.mockResolvedValue({ email: "dir@acme.com", role: "sales_director" });
    const wrapped = withRole("sales_director", okHandler);
    const res = await wrapped(makeReq("dir@acme.com"));
    expect(res.status).toBe(200);
    expect(okHandler).toHaveBeenCalledTimes(1);
  });

  it("sales_director can access presales_engineer routes", async () => {
    mockFindUnique.mockResolvedValue({ email: "dir@acme.com", role: "sales_director" });
    const wrapped = withRole("presales_engineer", okHandler);
    const res = await wrapped(makeReq("dir@acme.com"));
    expect(res.status).toBe(200);
  });

  it("presales_engineer can access presales_engineer routes", async () => {
    mockFindUnique.mockResolvedValue({ email: "eng@acme.com", role: "presales_engineer" });
    const wrapped = withRole("presales_engineer", okHandler);
    const res = await wrapped(makeReq("eng@acme.com"));
    expect(res.status).toBe(200);
  });
});
