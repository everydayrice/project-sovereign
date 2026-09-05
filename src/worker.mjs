import { createHttpGateway } from "./gateway/http-gateway.mjs";
import { createSovereignPlatform } from "./platform/sovereign-platform.mjs";
import { createNeonPersistence } from "./platform/neon-persistence.mjs";
import { createNeonSessionAuthenticator, proxyNeonAuth } from "./auth/neon-session-auth.mjs";
import { R2FileService } from "./files/r2-file-service.mjs";
import { authPageHtml, onboardingPageHtml } from "./console/auth-pages.mjs";
import { sourceUploadPageHtml } from "./console/source-upload-page.mjs";
import { SovereignError } from "./platform/errors.mjs";

const MAX_BROWSER_UPLOAD_BYTES = 25 * 1024 * 1024;

export default {
  async fetch(request, env = {}) {
    try {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/login") return html(authPageHtml({ mode: "login" }));
      if (request.method === "GET" && url.pathname === "/signup") return html(authPageHtml({ mode: "signup" }));
      if (url.pathname === "/api/auth" || url.pathname.startsWith("/api/auth/")) {
        return await proxyNeonAuth(request, { baseUrl: env.NEON_AUTH_BASE_URL });
      }

      const persistence = env.DATABASE_URL ? createNeonPersistence(env.DATABASE_URL) : null;
      const authenticate = createNeonSessionAuthenticator({ baseUrl: env.NEON_AUTH_BASE_URL });
      const files = new R2FileService({ bucket: env.SOVEREIGN_FILES });

      if (request.method === "GET" && url.pathname === "/onboarding") {
        if (!persistence) throw new SovereignError("database_not_configured", "DATABASE_URL is required for the production Sovereign runtime.", { status: 503 });
        const auth = await authenticate(request);
        const binding = await persistence.resolveAuthBinding(auth.authSubject);
        if (binding) return Response.redirect(new URL("/console", url).toString(), 302);
        return html(onboardingPageHtml({ user: auth.user }));
      }

      if (request.method === "GET" && url.pathname === "/console/sources/upload") {
        await requireBoundUser({ request, authenticate, persistence });
        files.assertConfigured();
        return html(sourceUploadPageHtml());
      }

      if (request.method === "POST" && url.pathname === "/v1/sources/upload-file") {
        return await handleBrowserUpload({ request, authenticate, persistence, files });
      }

      const gateway = createHttpGateway({
        platform: createSovereignPlatform(),
        authenticate,
        files,
        health: async () => productionHealth({ env, persistence }),
        prepareRequest: async ({ auth }) => {
          if (!persistence) throw new SovereignError("database_not_configured", "DATABASE_URL is required for the production Sovereign runtime.", { status: 503 });
          const binding = await persistence.resolveAuthBinding(auth.authSubject);
          if (!binding) {
            return { platform: createSovereignPlatform(), auth: { ...auth, onboarding: true }, version: null, persistence };
          }
          const loaded = await persistence.loadTenant(binding.tenant_id);
          return {
            platform: createSovereignPlatform({ store: loaded.store }),
            auth: { ...auth, tenantId: binding.tenant_id, principalId: binding.principal_id, onboarding: false },
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
          await requestContext.persistence.saveTenant({ tenantId: auth.tenantId, store: platform.store, expectedVersion: requestContext.version });
        }
      });
      const response = await gateway.fetch(request);
      if (request.method === "GET" && url.pathname === "/console/sources" && response.ok) return injectSourceUploadAction(response);
      return response;
    } catch (error) {
      return runtimeError(error);
    }
  }
};

async function requireBoundUser({ request, authenticate, persistence }) {
  if (!persistence) throw new SovereignError("database_not_configured", "DATABASE_URL is required for the production Sovereign runtime.", { status: 503 });
  const auth = await authenticate(request);
  const binding = await persistence.resolveAuthBinding(auth.authSubject);
  if (!binding) throw new SovereignError("onboarding_required", "Create your Sovereign tenant before uploading sources.", { status: 409 });
  return { auth, binding };
}

async function handleBrowserUpload({ request, authenticate, persistence, files }) {
  files.assertConfigured();
  const { binding } = await requireBoundUser({ request, authenticate, persistence });
  const loaded = await persistence.loadTenant(binding.tenant_id);
  const platform = createSovereignPlatform({ store: loaded.store });
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file.stream !== "function" || typeof file.name !== "string") {
    throw new SovereignError("file_required", "Choose a file to upload.", { status: 400 });
  }
  if (file.size > MAX_BROWSER_UPLOAD_BYTES) {
    throw new SovereignError("file_too_large", "Browser uploads are currently limited to 25 MB per file.", { status: 413 });
  }
  const classification = String(form.get("data_classification") || "internal");
  const source = platform.sources.createManagedUpload({
    tenantId: binding.tenant_id,
    principalId: binding.principal_id,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    classification
  });
  const sourceItem = platform.store.list("sourceItems", (item) => item.tenant_id === binding.tenant_id && item.source_id === source.source_id)[0];
  if (!sourceItem) throw new SovereignError("source_item_not_created", "Sovereign could not register the uploaded file.", { status: 500 });
  const object = await files.put({
    tenantId: binding.tenant_id,
    sourceId: source.source_id,
    sourceItemId: sourceItem.source_item_id,
    body: file.stream(),
    contentType: file.type || "application/octet-stream",
    contentLength: file.size
  });
  const savedItem = platform.sources.attachStoredObject({
    tenantId: binding.tenant_id,
    sourceId: source.source_id,
    sourceItemId: sourceItem.source_item_id,
    objectKey: object.object_key,
    objectVersion: object.version
  });
  await persistence.saveTenant({ tenantId: binding.tenant_id, store: platform.store, expectedVersion: loaded.version });
  return Response.json({ source, source_item: savedItem, object }, { status: 201 });
}

async function injectSourceUploadAction(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;
  const text = await response.text();
  const action = '<a href="/console/sources/upload" style="display:inline-flex;align-items:center;justify-content:center;margin-left:14px;border-radius:8px;background:#111419;color:#fff;padding:9px 13px;font:600 13px/1 system-ui;text-decoration:none">Upload file</a>';
  const updated = text.replace("</header>", `${action}</header>`);
  return new Response(updated, { status: response.status, statusText: response.statusText, headers: response.headers });
}

async function productionHealth({ env, persistence }) {
  const configured = { database: Boolean(env.DATABASE_URL), authentication: Boolean(env.NEON_AUTH_BASE_URL), storage: Boolean(env.SOVEREIGN_FILES) };
  let databaseReachable = false;
  let normalized = { search_schema: false, runtime_bridge_available: false, tenant_count: 0 };
  if (persistence) {
    try {
      databaseReachable = await persistence.health();
      if (databaseReachable && persistence.normalizedHealth) normalized = await persistence.normalizedHealth();
    } catch { databaseReachable = false; }
  }
  const schemaReady = normalized.search_schema === true;
  const ok = configured.database && configured.authentication && configured.storage && databaseReachable && schemaReady;
  return {
    status: ok ? "ok" : "degraded",
    runtime: "cloudflare_worker",
    authentication: configured.authentication ? "neon_auth_session" : "not_configured",
    persistence: configured.database ? (databaseReachable ? (schemaReady ? "normalized_neon" : "schema_migration_required") : "unreachable") : "not_configured",
    storage: configured.storage ? "r2" : "not_configured",
    search: schemaReady ? "postgres_full_text" : "not_configured",
    canonical_storage_model: "normalized_neon_with_snapshot_rollback_mirror",
    rollback_mirror: normalized.runtime_bridge_available ? "available" : "missing"
  };
}

function html(content) {
  return new Response(content, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function runtimeError(error) {
  if (error instanceof SovereignError) return Response.json({ code: error.code, message: error.message, details: error.details }, { status: error.status });
  return Response.json({ code: "internal_error", message: "Unexpected Sovereign runtime error." }, { status: 500 });
}
