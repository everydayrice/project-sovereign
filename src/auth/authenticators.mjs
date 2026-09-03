import { SovereignError } from "../platform/errors.mjs";

// Production requests must be verified by Neon Auth/JWKS before reaching a
// service. The Worker deliberately fails closed until that verifier is wired.
export async function failClosedAuthenticator() {
  throw new SovereignError("auth_not_configured", "Project Sovereign authentication is not configured; protected routes are unavailable.", { status: 503 });
}

// Test-only adapter. It exists to exercise Gateway authorization semantics
// without impersonating a production provider or accepting real credentials.
export function createTestAuthenticator() {
  return async (request) => {
    const value = request.headers.get("authorization");
    const match = /^Test tenant=([^;]+); principal=([^;]+)$/.exec(value ?? "");
    if (!match) throw new SovereignError("unauthorized", "Test identity is required.", { status: 401 });
    return { tenantId: match[1], principalId: match[2], permissions: ["control_plane.use"] };
  };
}
