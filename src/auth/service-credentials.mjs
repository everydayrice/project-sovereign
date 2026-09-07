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

  async function assertManagePermission(tenantId, principalId) {
    const rows = await sql.query(
      `SELECT r.permission_set
         FROM command.principal_role_bindings b
         JOIN command.roles r ON r.role_id=b.role_id AND r.tenant_id=b.tenant_id
         JOIN command.principals p ON p.principal_id=b.principal_id AND p.tenant_id=b.tenant_id
        WHERE b.tenant_id=$1 AND b.principal_id=$2 AND p.state='active'`,
      [tenantId, principalId]
    );
    const permissions = rows.flatMap((row) => Array.isArray(row.permission_set) ? row.permission_set : []);
    if (!permissions.includes("*") && !permissions.includes("command.service_credentials.manage")) {
      throw new SovereignError("command_permission_denied", "Only an authorized COMMAND principal can manage service credentials.", { status: 403 });
    }
    return permissions;
  }

  return {
    assertManagePermission,

    async create({ tenantId, createdByPrincipalId, displayName, scopes = [], expiresAt = null, extensionId = null }) {
      await assertManagePermission(tenantId, createdByPrincipalId);
      requireCondition(displayName?.trim(), "service_identity_name_required", "Service identity display name is required.");
      const normalizedScopes = normalizeScopes(scopes);
      let installationId = null;
      let extensionGrantId = null;
      if (extensionId) {
        const rows = await sql.query(`SELECT i.extension_installation_id,g.extension_grant_id,g.granted_scopes FROM extensions.installations i
          JOIN extensions.grants g ON g.tenant_id=i.tenant_id AND g.extension_installation_id=i.extension_installation_id
          WHERE i.tenant_id=$1 AND i.extension_id=$2 AND i.state='active' AND g.state='active'`, [tenantId, extensionId]);
        const grant = rows.find(row => normalizedScopes.every(scope => row.granted_scopes.includes(scope)));
        if (!grant) throw new SovereignError("extension_scope_denied", "Credential scopes must be within the active extension grant.", { status: 403 });
        installationId = grant.extension_installation_id;
        extensionGrantId = grant.extension_grant_id;
      }
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
           VALUES ($1,$2,$6,$3,'active',NULL,$4::jsonb,1,$5,$5)`,
          [principalId, tenantId, displayName.trim(), JSON.stringify({ service_credential_id: credentialId, ...(extensionId ? { extension_id: extensionId, extension_installation_id: installationId, extension_grant_id: extensionGrantId } : {}) }), timestamp, extensionId ? "extension" : "service"]
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
                p.display_name AS principal_display_name,p.state AS principal_state,p.kind AS principal_kind,p.metadata AS principal_metadata
           FROM command.service_credentials c
           JOIN command.principals p ON p.principal_id=c.principal_id AND p.tenant_id=c.tenant_id
          WHERE c.token_hash=$1
          LIMIT 1`,
        [tokenHash]
      );
      const credential = rows[0];
      if (!credential || credential.state !== "active" || credential.principal_state !== "active") return null;
      if (credential.principal_kind === "extension") {
        const rows = await sql.query(`SELECT 1 FROM extensions.installations i JOIN extensions.grants g
          ON g.tenant_id=i.tenant_id AND g.extension_installation_id=i.extension_installation_id
          WHERE i.tenant_id=$1 AND i.extension_installation_id=$2 AND i.extension_id=$3
            AND i.state='active' AND g.state='active' AND g.granted_scopes @> $4::jsonb AND g.extension_grant_id=$5`,
          [credential.tenant_id, credential.principal_metadata?.extension_installation_id, credential.principal_metadata?.extension_id, JSON.stringify(credential.scopes), credential.principal_metadata?.extension_grant_id]);
        if (!rows.length) return null;
      }
      if (credential.expires_at && new Date(credential.expires_at).getTime() <= Date.now()) return null;
      void sql.query("UPDATE command.service_credentials SET last_used_at=now(),updated_at=now() WHERE service_credential_id=$1", [credential.service_credential_id]).catch(() => {});
      return {
        extensionId: credential.principal_metadata?.extension_id ?? null,
        serviceCredentialId: credential.service_credential_id,
        tenantId: credential.tenant_id,
        principalId: credential.principal_id,
        displayName: credential.display_name,
        scopes: Array.isArray(credential.scopes) ? credential.scopes : []
      };
    },

    async list({ tenantId, requesterPrincipalId }) {
      await assertManagePermission(tenantId, requesterPrincipalId);
      return sql.query(
        `SELECT service_credential_id,tenant_id,principal_id,display_name,token_prefix,scopes,state,expires_at,last_used_at,created_at,updated_at,revoked_at
           FROM command.service_credentials
          WHERE tenant_id=$1
          ORDER BY created_at DESC`,
        [tenantId]
      );
    },

    async revoke({ tenantId, credentialId, revokedByPrincipalId }) {
      await assertManagePermission(tenantId, revokedByPrincipalId);
      const client = makeClient();
      await client.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          `UPDATE command.service_credentials
              SET state='revoked',revoked_by_principal_id=$3,revoked_at=now(),updated_at=now()
            WHERE tenant_id=$1 AND service_credential_id=$2 AND state='active'
          RETURNING service_credential_id,tenant_id,principal_id,display_name,token_prefix,scopes,state,expires_at,last_used_at,created_at,updated_at,revoked_at`,
          [tenantId, credentialId, revokedByPrincipalId]
        );
        const rows = result.rows ?? result;
        if (!rows.length) throw new SovereignError("service_credential_not_found", "Active service credential was not found.", { status: 404 });
        await client.query("UPDATE command.principals SET state='revoked',updated_at=now(),revision=revision+1 WHERE tenant_id=$1 AND principal_id=$2", [tenantId, rows[0].principal_id]);
        await client.query("COMMIT");
        return rows[0];
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally {
        await client.end();
      }
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
      extensionId: resolved.extensionId ?? null,
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
