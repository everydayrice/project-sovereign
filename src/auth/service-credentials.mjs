import { Client, neon } from "@neondatabase/serverless";
import { SovereignError, requireCondition } from "../platform/errors.mjs";
import { newId } from "../platform/ids.mjs";

export const SERVICE_SCOPES = Object.freeze([
  "command:read",
  "orientation:read",
  "intelligence:read",
  "intelligence:propose",
  "sources:read",
  "continuity:read",
  "continuity:write",
  "traffic:read",
  "traffic:write",
  "extensions:use"
]);

export function createServiceCredentialStore(databaseUrl, { httpSql, clientFactory } = {}) {
  if (!databaseUrl) throw new SovereignError("database_not_configured", "DATABASE_URL is required for service credentials.", { status: 503 });
  const sql = httpSql ?? neon(databaseUrl);
  const makeClient = clientFactory ?? (() => new Client(databaseUrl));

  return {
    async create({ tenantId, createdByPrincipalId, displayName, scopes = [], expiresAt = null }) {
      requireCondition(displayName?.trim(), "service_identity_name_required", "Service identity display name is required.");
      const normalizedScopes = normalizeScopes(scopes);
      const token = createToken();
      const tokenHash = await sha256Hex(token);
      const tokenPrefix = token.slice(0, 18);
      const principalId = newId("prn");
      const credentialId = newId("svc");
      const timestamp = new Date().toISOString();
      const client = makeClient();
      await client.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO command.principals
           (principal_id,tenant_id,kind,display_name,state,auth_subject_reference,metadata,revision,created_at,updated_at)
           VALUES ($1,$2,'service',$3,'active',NULL,$4::jsonb,1,$5,$5)`,
          [principalId, tenantId, displayName.trim(), JSON.stringify({ service_credential_id: credentialId }), timestamp]
        );
        await client.query(
          `INSERT INTO command.service_credentials
           (service_credential_id,tenant_id,principal_id,display_name,token_prefix,token_hash,scopes,state,expires_at,created_by_principal_id,created_at,updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'active',$8,$9,$10,$10)`,
          [credentialId, tenantId, principalId, displayName.trim(), tokenPrefix, tokenHash,
            JSON.stringify(normalizedScopes), expiresAt, createdByPrincipalId, timestamp]
        );
        await client.query("COMMIT");
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally {
        await client.end();
      }
      return {
        credential: {
          service_credential_id: credentialId,
          tenant_id: tenantId,
          principal_id: principalId,
          display_name: displayName.trim(),
          token_prefix: tokenPrefix,
          scopes: normalizedScopes,
          state: "active",
          expires_at: expiresAt,
          created_at: timestamp
        },
        token
      };
    },

    async resolveToken(token) {
      if (!token?.startsWith("svk_")) return null;
      const tokenHash = await sha256Hex(token);
      const rows = await sql.query(
        `SELECT c.service_credential_id,c.tenant_id,c.principal_id,c.display_name,c.scopes,c.state,c.expires_at,
                p.display_name AS principal_display_name,p.state AS principal_state
           FROM command.service_credentials c
           JOIN command.principals p ON p.principal_id=c.principal_id AND p.tenant_id=c.tenant_id
          WHERE c.token_hash=$1
          LIMIT 1`,
        [tokenHash]
      );
      const credential = rows[0];
      if (!credential || credential.state !== "active" || credential.principal_state !== "active") return null;
      if (credential.expires_at && new Date(credential.expires_at).getTime() <= Date.now()) return null;
      void sql.query("UPDATE command.service_credentials SET last_used_at=now(),updated_at=now() WHERE service_credential_id=$1", [credential.service_credential_id]).catch(() => {});
      return {
        serviceCredentialId: credential.service_credential_id,
        tenantId: credential.tenant_id,
        principalId: credential.principal_id,
        displayName: credential.display_name,
        scopes: Array.isArray(credential.scopes) ? credential.scopes : []
      };
    },

    async list({ tenantId }) {
      const rows = await sql.query(
        `SELECT service_credential_id,tenant_id,principal_id,display_name,token_prefix,scopes,state,expires_at,last_used_at,created_at,updated_at,revoked_at
           FROM command.service_credentials
          WHERE tenant_id=$1
          ORDER BY created_at DESC`,
        [tenantId]
      );
      return rows;
    },

    async revoke({ tenantId, credentialId, revokedByPrincipalId }) {
      const rows = await sql.query(
        `UPDATE command.service_credentials
            SET state='revoked',revoked_by_principal_id=$3,revoked_at=now(),updated_at=now()
          WHERE tenant_id=$1 AND service_credential_id=$2 AND state='active'
        RETURNING service_credential_id,tenant_id,principal_id,display_name,token_prefix,scopes,state,expires_at,last_used_at,created_at,updated_at,revoked_at`,
        [tenantId, credentialId, revokedByPrincipalId]
      );
      if (!rows.length) throw new SovereignError("service_credential_not_found", "Active service credential was not found.", { status: 404 });
      await sql.query("UPDATE command.principals SET state='revoked',updated_at=now(),revision=revision+1 WHERE tenant_id=$1 AND principal_id=$2", [tenantId, rows[0].principal_id]);
      return rows[0];
    }
  };
}

export function createServiceAuthenticator({ credentialStore }) {
  return async function authenticateService(request, requiredScopes = []) {
    const header = request.headers.get("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) throw new SovereignError("service_auth_required", "Bearer service credential is required.", { status: 401 });
    const resolved = await credentialStore.resolveToken(match[1].trim());
    if (!resolved) throw new SovereignError("service_credential_invalid", "Service credential is invalid, expired, or revoked.", { status: 401 });
    const missing = requiredScopes.filter((scope) => !resolved.scopes.includes(scope));
    if (missing.length) throw new SovereignError("service_scope_denied", "Service identity does not have the required Sovereign scope.", { status: 403, details: { missing_scopes: missing } });
    return {
      tenantId: resolved.tenantId,
      principalId: resolved.principalId,
      serviceCredentialId: resolved.serviceCredentialId,
      permissions: resolved.scopes,
      service: true,
      displayName: resolved.displayName
    };
  };
}

export function hasServiceScope(auth, scope) {
  return Boolean(auth?.permissions?.includes(scope));
}

function normalizeScopes(scopes) {
  requireCondition(Array.isArray(scopes), "service_scopes_invalid", "Service credential scopes must be an array.");
  const normalized = [...new Set(scopes.map((scope) => String(scope).trim()).filter(Boolean))];
  const invalid = normalized.filter((scope) => !SERVICE_SCOPES.includes(scope));
  requireCondition(!invalid.length, "service_scope_unknown", "One or more requested service scopes are unknown.", { details: { invalid_scopes: invalid } });
  return normalized;
}

function createToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const secret = base64Url(bytes);
  const prefix = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  return `svk_${prefix}_${secret}`;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}
