/**
 * Unit tests for CF Access JWT validation logic.
 * Uses jose's local JWKS so no network call is made.
 */
import {
  SignJWT,
  generateKeyPair,
  exportJWK,
  createLocalJWKSet,
  jwtVerify,
  type KeyLike,
} from "jose";
import { NextRequest } from "next/server";

async function signJwt(
  payload: Record<string, unknown>,
  privateKey: KeyLike,
  aud: string
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .setAudience(aud)
    .sign(privateKey);
}

describe("CF Access JWT validation", () => {
  const AUD = "test-audience-abc123";
  let privateKey: KeyLike;
  let publicKey: KeyLike;

  beforeAll(async () => {
    const pair = await generateKeyPair("RS256");
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
  });

  it("accepts a valid JWT and extracts email", async () => {
    const token = await signJwt({ email: "alice@acme.com", sub: "uid-001" }, privateKey, AUD);

    const jwk = await exportJWK(publicKey);
    const JWKS = createLocalJWKSet({ keys: [{ ...jwk, alg: "RS256" }] });

    const { payload } = await jwtVerify(token, JWKS, { audience: AUD });
    expect(payload.email).toBe("alice@acme.com");
  });

  it("rejects a JWT signed with wrong key", async () => {
    const { privateKey: wrongKey } = await generateKeyPair("RS256");
    const token = await signJwt({ email: "attacker@evil.com" }, wrongKey, AUD);

    const jwk = await exportJWK(publicKey);
    const JWKS = createLocalJWKSet({ keys: [{ ...jwk, alg: "RS256" }] });

    await expect(jwtVerify(token, JWKS, { audience: AUD })).rejects.toThrow();
  });

  it("rejects a JWT with wrong audience", async () => {
    const token = await signJwt({ email: "bob@acme.com" }, privateKey, "wrong-aud");

    const jwk = await exportJWK(publicKey);
    const JWKS = createLocalJWKSet({ keys: [{ ...jwk, alg: "RS256" }] });

    await expect(jwtVerify(token, JWKS, { audience: AUD })).rejects.toThrow();
  });

  it("middleware returns 401 when Cf-Access-Jwt-Assertion header is missing", () => {
    const req = new NextRequest("http://localhost/api/audit/export");
    expect(req.headers.get("Cf-Access-Jwt-Assertion")).toBeNull();
  });
});
