import { createHttpGateway } from "./gateway/http-gateway.mjs";
import { createSovereignPlatform } from "./platform/sovereign-platform.mjs";
import { createNeonPersistence } from "./platform/neon-persistence.mjs";
import { createNeonSessionAuthenticator, proxyNeonAuth } from "./auth/neon-session-auth.mjs";
import { R2FileService } from "./files/r2-file-service.mjs";
import { SovereignError } from "./platform/errors.mjs";

export default {
  async fetch(request, env = {}) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/auth" || url.pathname.startsWith("/api/auth/")) {
        return await proxyNeonAuth(request, { baseUrl: env.NEON_AUTH_BASE_URL });
      }

      const persistence = env.DATABASE_URL ? createNeonPersistence(env.DATABASE_URL) : null;
      const authenticate = createNeonSessionAuthenticator({ baseUrl: env.NEON_AUTH_BASE_URL });
      const files = new R2FileService({ bucket: env.SOVEREIGN_FILES });
      const gateway = createHttpGateway({
        platform: createSovereignPlatform(),
        authenticate,
        files,
        health: async () => productionHealth({ env, persistence }),
        prepareRequest: async ({ auth }) => {
          if (!persistence) throw new SovereignError("database_not_configured", "DATABASE_URL is required for the production Sovereign runtime.", { status: 503 });
          const binding = await persistence.resolveAuthBinding(auth.authSubject);
          if (!binding) {
            return {
              platform: createSovereignPlatform(),
              auth: { ...auth, onboarding: true },
              version: null,
              persistence
            };
          }
          const loaded = await persistence.loadTenant(binding.tenant_id);
          return {
            platform: createSovereignPlatform({ store: loaded.store }),
            auth: {
              ...auth,
              tenantId: binding.tenant_id,
              principalId: binding.principal_id,
              onboarding: false
            },
            version: loaded.version,
            persistence
          };
        },
        finalizeRequest: async ({ request, platform, auth, requestContext }) => {
          if (!requestContext?.persistence) return;
          if (auth.bootstrap) {
            await requestContext.persistence.bootstrapTenant({
              authSubjectReference: auth.authSubject,
              tenant: auth.bootstrap.tenant,
              principal: auth.bootstrap.principal,
              workspace: auth.bootstrap.workspace,
              store: platform.store
            });
            return;
          }
          if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
          if (!auth.tenantId || requestContext.version === null || requestContext.version === undefined) return;
          await requestContext.persistence.saveTenant({
            tenantId: auth.tenantId,
            store: platform.store,
            expectedVersion: requestContext.version
          });
        }
      });
      return gateway.fetch(request);
    } catch (error) {
      return runtimeError(error);
    }
  }
};

async function productionHealth({ env, persistence }) {
  const configured = {
    database: Boolean(env.DATABASE_URL),
    authentication: Boolean(env.NEON_AUTH_BASE_URL),
    storage: Boolean(env.SOVEREIGN_FILES)
  };
  let databaseReachable = false;
  if (persistence) {
    try { databaseReachable = await persistence.health(); } catch { databaseReachable = false; }
  }
  const ok = configured.database && configured.authentication && configured.storage && databaseReachable;
  return {
    status: ok ? "ok" : "degraded",
    runtime: "cloudflare_worker",
    authentication: configured.authentication ? "neon_auth_session" : "not_configured",
    persistence: configured.database ? (databaseReachable ? "neon_runtime_bridge" : "unreachable") : "not_configured",
    storage: configured.storage ? "r2" : "not_configured",
    canonical_storage_model: "runtime_bridge_pending_normalized_repository_cutover"
  };
}

function runtimeError(error) {
  if (error instanceof SovereignError) {
    return Response.json({ code: error.code, message: error.message, details: error.details }, { status: error.status });
  }
  return Response.json({ code: "internal_error", message: "Unexpected Sovereign runtime error." }, { status: 500 });
}
