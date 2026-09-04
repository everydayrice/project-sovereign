import baseWorker from "./worker.mjs";
import { createSovereignPlatform } from "./platform/sovereign-platform.mjs";
import { createNeonPersistence } from "./platform/neon-persistence.mjs";
import { createNeonSessionAuthenticator } from "./auth/neon-session-auth.mjs";
import { R2FileService } from "./files/r2-file-service.mjs";
import { SovereignError } from "./platform/errors.mjs";
import { analyzeStructuredText } from "./analysis/structured-text-analyzer.mjs";
import { sourceInitializePageHtml } from "./console/source-initialize-page.mjs";

export default {
  async fetch(request, env = {}) {
    try {
      const url = new URL(request.url);
      const persistence = env.DATABASE_URL ? createNeonPersistence(env.DATABASE_URL) : null;
      const authenticate = createNeonSessionAuthenticator({ baseUrl: env.NEON_AUTH_BASE_URL });
      const files = new R2FileService({ bucket: env.SOVEREIGN_FILES });

      if (request.method === "GET" && url.pathname === "/console/sources/initialize") {
        const { binding, platform } = await loadBoundPlatform({ request, authenticate, persistence });
        files.assertConfigured();
        return html(sourceInitializePageHtml({ sources: platform.sources.listSources(binding.tenant_id) }));
      }

      const initializeMatch = /^\/v1\/sources\/([^/]+)\/initialize-text$/.exec(url.pathname);
      if (request.method === "POST" && initializeMatch) {
        return await initializeTextSource({
          request,
          sourceId: decodeURIComponent(initializeMatch[1]),
          authenticate,
          persistence,
          files
        });
      }

      const response = await baseWorker.fetch(request, env);
      if (request.method === "GET" && url.pathname === "/console/sources" && response.ok) {
        return injectInitializeAction(response);
      }
      if (request.method === "GET" && url.pathname === "/console/intelligence" && response.ok) {
        return injectCandidateIntelligence({ request, response, authenticate, persistence });
      }
      return response;
    } catch (error) {
      return runtimeError(error);
    }
  }
};

async function initializeTextSource({ request, sourceId, authenticate, persistence, files }) {
  files.assertConfigured();
  const { binding, loaded, platform } = await loadBoundPlatform({ request, authenticate, persistence });
  const tenantId = binding.tenant_id;
  const principalId = binding.principal_id;
  const source = platform.store.requireTenant("sources", sourceId, tenantId);
  const sourceItems = platform.store.list("sourceItems", (item) => item.tenant_id === tenantId && item.source_id === sourceId);
  if (sourceItems.length !== 1) {
    throw new SovereignError("structured_source_item_required", "Structured-text initialization currently supports one stored file per source.", { status: 409 });
  }
  const item = sourceItems[0];
  if (item.storage_state !== "stored") {
    throw new SovereignError("source_object_not_stored", "Source content must be stored in R2 before initialization.", { status: 409 });
  }
  assertSupportedTextSource(item);

  const object = await files.get({ tenantId, sourceId, sourceItemId: item.source_item_id });
  if (!object) throw new SovereignError("stored_object_not_found", "Stored source object was not found.", { status: 404 });
  const text = typeof object.text === "function" ? await object.text() : await new Response(object.body).text();
  const analysis = analyzeStructuredText({ text, sourceId, sourceItemId: item.source_item_id });
  if (!analysis.candidates.length) {
    throw new SovereignError("no_candidate_intelligence", "No explicitly labeled facts, policies, decisions, or constraints were found in this structured-text source.", { status: 422 });
  }

  const run = platform.initialization.start({ tenantId, principalId, sourceIds: [sourceId], mode: "initialize" });
  const savedCandidates = [];
  for (const candidate of analysis.candidates) {
    const saved = platform.intelligence.createCandidate({ tenantId, principalId, ...candidate });
    platform.initialization.attachCandidate({ tenantId, runId: run.initialization_run_id, candidateId: saved.candidate_intelligence_id });
    savedCandidates.push(saved);
  }

  platform.initialization.recordSourceResult({
    tenantId,
    runId: run.initialization_run_id,
    sourceId,
    state: "complete",
    itemCount: source.item_count,
    inventoriedItemCount: source.inventoried_item_count,
    analyzedItemCount: source.inventoried_item_count,
    candidateCount: savedCandidates.length,
    excludedCount: source.excluded_item_count,
    currentness: "current"
  });
  const completed = platform.initialization.complete({ tenantId, runId: run.initialization_run_id });
  await persistence.saveTenant({ tenantId, store: platform.store, expectedVersion: loaded.version });

  return Response.json({
    initialization_run: completed,
    analyzer: analysis.analyzer,
    candidate_intelligence: savedCandidates,
    canonicalized: false
  }, { status: 201 });
}

async function loadBoundPlatform({ request, authenticate, persistence }) {
  if (!persistence) throw new SovereignError("database_not_configured", "DATABASE_URL is required for the production Sovereign runtime.", { status: 503 });
  const auth = await authenticate(request);
  const binding = await persistence.resolveAuthBinding(auth.authSubject);
  if (!binding) throw new SovereignError("onboarding_required", "Create your Sovereign tenant before initializing sources.", { status: 409 });
  const loaded = await persistence.loadTenant(binding.tenant_id);
  return { auth, binding, loaded, platform: createSovereignPlatform({ store: loaded.store }) };
}

function assertSupportedTextSource(item) {
  const name = String(item.display_name || "").toLowerCase();
  const mime = String(item.mime_type || "").toLowerCase();
  const supportedName = name.endsWith(".md") || name.endsWith(".markdown") || name.endsWith(".txt");
  const supportedMime = mime.startsWith("text/") || mime === "application/octet-stream";
  if (!supportedName && !supportedMime) {
    throw new SovereignError("unsupported_initialization_format", "This alpha analyzer currently supports Markdown and plain-text files only.", { status: 415 });
  }
}

async function injectInitializeAction(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;
  const text = await response.text();
  const action = '<a href="/console/sources/initialize" style="display:inline-flex;align-items:center;justify-content:center;margin-left:8px;border:1px solid #d7dbe2;border-radius:8px;background:#fff;color:#111419;padding:9px 13px;font:600 13px/1 system-ui;text-decoration:none">Initialize source</a>';
  const updated = text.replace("</header>", `${action}</header>`);
  return new Response(updated, { status: response.status, statusText: response.statusText, headers: response.headers });
}

async function injectCandidateIntelligence({ request, response, authenticate, persistence }) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;
  const { binding, platform } = await loadBoundPlatform({ request, authenticate, persistence });
  const candidates = platform.store.list("candidateIntelligence", (item) => item.tenant_id === binding.tenant_id)
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
  const items = candidates.length
    ? candidates.map((candidate) => `<li><strong>${escapeHtml(candidate.record_type)}</strong><span>${escapeHtml(candidate.payload?.statement ?? JSON.stringify(candidate.payload))}</span><small>${escapeHtml(candidate.state)} · non-canonical</small></li>`).join("")
    : '<li class="empty">No Candidate Intelligence yet.</li>';
  const panel = `<section class="panel"><div class="panel-header"><h2>Candidate Intelligence</h2><span>Extracted · review before canon</span></div><ul class="candidate-list" style="list-style:none;padding:0;margin:0;display:grid;gap:10px">${items}</ul></section>`;
  const text = await response.text();
  const updated = text.replace("</main></div>", `${panel}</main></div>`);
  return new Response(updated, { status: response.status, statusText: response.statusText, headers: response.headers });
}

function html(content) {
  return new Response(content, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function runtimeError(error) {
  if (error instanceof SovereignError) {
    return Response.json({ code: error.code, message: error.message, details: error.details }, { status: error.status });
  }
  return Response.json({ code: "internal_error", message: "Unexpected Sovereign runtime error." }, { status: 500 });
}
