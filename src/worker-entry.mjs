import baseWorker from "./worker.mjs";
import { createSovereignPlatform } from "./platform/sovereign-platform.mjs";
import { createNeonPersistence } from "./platform/neon-persistence.mjs";
import { createNeonSessionAuthenticator } from "./auth/neon-session-auth.mjs";
import { createServiceAuthenticator, createServiceCredentialStore, SERVICE_SCOPES } from "./auth/service-credentials.mjs";
import { R2FileService } from "./files/r2-file-service.mjs";
import { SovereignError } from "./platform/errors.mjs";
import { ingestTextSource, supportsAutomaticTextIngestion } from "./analysis/source-ingestion.mjs";
import { sourceInitializePageHtml } from "./console/source-initialize-page.mjs";
import { serviceCredentialsPageHtml } from "./console/service-credentials-page.mjs";
import { RetrievalService } from "./intelligence/retrieval-service.mjs";
import { createIdeaStore } from "./continuity/idea-store.mjs";
import { createMcpServer } from "./gateway/mcp-server.mjs";
import { createServiceHttpGateway } from "./gateway/service-http-gateway.mjs";
import { approveCandidateChangeSet, proposeCandidateForCanon, rejectCandidate } from "./intelligence/candidate-review.mjs";

export default {
  async fetch(request, env = {}) {
    try {
      const url = new URL(request.url);
      const persistence = env.DATABASE_URL ? createNeonPersistence(env.DATABASE_URL) : null;
      const authenticate = createNeonSessionAuthenticator({ baseUrl: env.NEON_AUTH_BASE_URL });
      const files = new R2FileService({ bucket: env.SOVEREIGN_FILES });
      const retrieval = persistence ? new RetrievalService({ persistence }) : null;
      const credentialStore = env.DATABASE_URL ? createServiceCredentialStore(env.DATABASE_URL) : null;
      const authenticateService = credentialStore ? createServiceAuthenticator({ credentialStore }) : null;
      const ideaStore = env.DATABASE_URL ? createIdeaStore(env.DATABASE_URL) : null;

      if (url.pathname === "/mcp") {
        requireMachineRuntime({ persistence, retrieval, authenticateService });
        return createMcpServer({
          persistence,
          retrieval,
          authenticateService,
          allowedOrigins: parseOrigins(env.MCP_ALLOWED_ORIGINS)
        }).fetch(request);
      }

      if (url.pathname === "/api/v1" || url.pathname.startsWith("/api/v1/")) {
        requireMachineRuntime({ persistence, retrieval, authenticateService });
        return createServiceHttpGateway({ persistence, retrieval, authenticateService, ideaStore }).fetch(request);
      }

      if (request.method === "GET" && url.pathname === "/console/command/service-credentials") {
        if (!credentialStore) throw new SovereignError("service_credentials_not_configured", "Service credential storage is not configured.", { status: 503 });
        const { binding, platform } = await loadBoundPlatform({ request, authenticate, persistence });
        const credentials = await credentialStore.list({ tenantId: binding.tenant_id, requesterPrincipalId: binding.principal_id });
        const tenant = platform.store.requireTenant("tenants", binding.tenant_id, binding.tenant_id);
        return html(serviceCredentialsPageHtml({ commandName: tenant.command_display_name, credentials, scopes: SERVICE_SCOPES }));
      }

      if (request.method === "GET" && url.pathname === "/v1/command/service-credentials") {
        if (!credentialStore) throw new SovereignError("service_credentials_not_configured", "Service credential storage is not configured.", { status: 503 });
        const { binding } = await loadBoundPlatform({ request, authenticate, persistence });
        const credentials = await credentialStore.list({ tenantId: binding.tenant_id, requesterPrincipalId: binding.principal_id });
        return Response.json({ credentials });
      }

      if (request.method === "POST" && url.pathname === "/v1/command/service-credentials") {
        if (!credentialStore) throw new SovereignError("service_credentials_not_configured", "Service credential storage is not configured.", { status: 503 });
        const { binding } = await loadBoundPlatform({ request, authenticate, persistence });
        const body = await jsonBody(request);
        const created = await credentialStore.create({
          tenantId: binding.tenant_id,
          createdByPrincipalId: binding.principal_id,
          displayName: body.display_name,
          scopes: body.scopes ?? [],
          expiresAt: body.expires_at ?? null
        });
        return Response.json(created, { status: 201, headers: { "cache-control": "no-store" } });
      }

      const revokeCredential = /^\/v1\/command\/service-credentials\/([^/]+)\/revoke$/.exec(url.pathname);
      if (request.method === "POST" && revokeCredential) {
        if (!credentialStore) throw new SovereignError("service_credentials_not_configured", "Service credential storage is not configured.", { status: 503 });
        const { binding } = await loadBoundPlatform({ request, authenticate, persistence });
        const credential = await credentialStore.revoke({ tenantId: binding.tenant_id, credentialId: decodeURIComponent(revokeCredential[1]), revokedByPrincipalId: binding.principal_id });
        return Response.json({ credential });
      }

      // Normal source ingestion is intentionally one user action.
      if (request.method === "POST" && url.pathname === "/v1/sources/upload-file") {
        return await handleUploadWithAutomaticProcessing({ request, env, authenticate, persistence, files });
      }

      if (request.method === "GET" && url.pathname === "/v1/search") {
        const { binding } = await loadBoundPlatform({ request, authenticate, persistence });
        if (!retrieval) throw new SovereignError("search_not_configured", "Sovereign search is not configured.", { status: 503 });
        const result = await retrieval.search({ tenantId: binding.tenant_id, query: url.searchParams.get("q") ?? "", sourceId: url.searchParams.get("source_id") || undefined, limit: Number(url.searchParams.get("limit") || 12) });
        return Response.json(result);
      }

      if (request.method === "POST" && url.pathname === "/v1/ask") {
        const { binding } = await loadBoundPlatform({ request, authenticate, persistence });
        if (!retrieval) throw new SovereignError("search_not_configured", "Sovereign retrieval is not configured.", { status: 503 });
        const body = await jsonBody(request);
        const result = await retrieval.ask({ tenantId: binding.tenant_id, query: body.query, sourceId: body.source_id, limit: body.limit ?? 8 });
        return Response.json(result);
      }

      // Explicit initialization remains an advanced/recovery operation only.
      if (request.method === "GET" && url.pathname === "/console/sources/initialize") {
        const { binding, platform } = await loadBoundPlatform({ request, authenticate, persistence });
        files.assertConfigured();
        return html(sourceInitializePageHtml({ sources: platform.sources.listSources(binding.tenant_id) }));
      }

      const initializeMatch = /^\/v1\/sources\/([^/]+)\/initialize-text$/.exec(url.pathname);
      if (request.method === "POST" && initializeMatch) {
        const result = await processStoredSource({ request, sourceId: decodeURIComponent(initializeMatch[1]), authenticate, persistence, files });
        return Response.json(result, { status: 201 });
      }

      // Canonical review APIs remain available for deliberate/advanced use.
      const candidateProposeMatch = /^\/v1\/intelligence\/candidates\/([^/]+)\/propose-canonical$/.exec(url.pathname);
      if (request.method === "POST" && candidateProposeMatch) return handleCandidateProposal({ request, candidateId: decodeURIComponent(candidateProposeMatch[1]), authenticate, persistence });
      const candidateRejectMatch = /^\/v1\/intelligence\/candidates\/([^/]+)\/reject$/.exec(url.pathname);
      if (request.method === "POST" && candidateRejectMatch) return handleCandidateRejection({ request, candidateId: decodeURIComponent(candidateRejectMatch[1]), authenticate, persistence });
      const candidateApprovalMatch = /^\/v1\/intelligence\/canonical\/change-sets\/([^/]+)\/approve-candidate$/.exec(url.pathname);
      if (request.method === "POST" && candidateApprovalMatch) return handleCandidateApproval({ request, changeSetId: decodeURIComponent(candidateApprovalMatch[1]), authenticate, persistence });

      const response = await baseWorker.fetch(request, env);
      if (request.method === "GET" && url.pathname === "/console/intelligence" && response.ok) return injectAskSovereign(response);
      if (request.method === "GET" && url.pathname === "/console/command" && response.ok) return injectCommandMachineAccess(response);
      return response;
    } catch (error) {
      return runtimeError(error);
    }
  }
};

async function handleUploadWithAutomaticProcessing({ request, env, authenticate, persistence, files }) {
  const uploadResponse = await baseWorker.fetch(request, env);
  if (!uploadResponse.ok) return uploadResponse;
  const upload = await uploadResponse.json();
  const sourceId = upload?.source?.source_id;
  let processing = { state: "stored", automatic: true, searchable: false, canonicalized: false };
  if (sourceId) processing = await processStoredSource({ request, sourceId, authenticate, persistence, files, tolerateUnsupported: true });
  return Response.json({ ...upload, processing }, { status: uploadResponse.status });
}

async function processStoredSource({ request, sourceId, authenticate, persistence, files, tolerateUnsupported = false }) {
  files.assertConfigured();
  const { binding, loaded, platform } = await loadBoundPlatform({ request, authenticate, persistence });
  const tenantId = binding.tenant_id;
  const principalId = binding.principal_id;
  const source = platform.store.requireTenant("sources", sourceId, tenantId);
  const sourceItems = platform.store.list("sourceItems", (item) => item.tenant_id === tenantId && item.source_id === sourceId);
  if (sourceItems.length !== 1) throw new SovereignError("source_item_required", "Automatic direct-upload processing currently expects one stored file per source.", { status: 409 });
  const item = sourceItems[0];
  if (item.storage_state !== "stored") throw new SovereignError("source_object_not_stored", "Source content must be stored in R2 before processing.", { status: 409 });

  if (!supportsAutomaticTextIngestion({ fileName: item.display_name, mimeType: item.mime_type })) {
    if (tolerateUnsupported) return { state: "stored", automatic: true, searchable: false, analyzed: false, canonicalized: false, processing_note: "stored_unparsed_format" };
    throw new SovereignError("unsupported_initialization_format", "This source format is stored safely but does not yet have an automatic V1 parser.", { status: 415 });
  }

  const object = await files.get({ tenantId, sourceId, sourceItemId: item.source_item_id });
  if (!object) throw new SovereignError("stored_object_not_found", "Stored source object was not found.", { status: 404 });
  const text = typeof object.text === "function" ? await object.text() : await new Response(object.body).text();
  const ingestion = ingestTextSource({ text, sourceId, sourceItemId: item.source_item_id, fileName: item.display_name, mimeType: item.mime_type });
  await persistence.replaceSourceChunks({ tenantId, sourceId, sourceItemId: item.source_item_id, chunks: ingestion.chunks });

  const run = platform.initialization.start({ tenantId, principalId, sourceIds: [sourceId], mode: "initialize" });
  const savedCandidates = [];
  for (const candidate of ingestion.candidates) {
    const duplicate = platform.store.list("candidateIntelligence", (existing) => existing.tenant_id === tenantId && existing.payload?.statement === candidate.payload?.statement && existing.provenance?.some((entry) => entry.source_item_id === item.source_item_id))[0];
    const saved = duplicate ?? platform.intelligence.createCandidate({ tenantId, principalId, ...candidate });
    platform.initialization.attachCandidate({ tenantId, runId: run.initialization_run_id, candidateId: saved.candidate_intelligence_id });
    savedCandidates.push(saved);
  }

  const timestamp = new Date().toISOString();
  platform.store.update("sourceItems", item.source_item_id, (current) => ({
    ...current, item_state: "analyzed",
    metadata: { ...current.metadata, parser_key: ingestion.parser, parser_version: ingestion.parser_version, chunk_count: ingestion.chunks.length, normalized_text_length: ingestion.normalized_text_length, last_processed_at: timestamp },
    updated_at: timestamp
  }));
  platform.initialization.recordSourceResult({ tenantId, runId: run.initialization_run_id, sourceId, state: "complete", itemCount: source.item_count, inventoriedItemCount: source.inventoried_item_count, analyzedItemCount: source.inventoried_item_count, candidateCount: savedCandidates.length, excludedCount: source.excluded_item_count, currentness: "current" });
  const completed = platform.initialization.complete({ tenantId, runId: run.initialization_run_id });
  const save = await persistence.saveTenant({ tenantId, store: platform.store, expectedVersion: loaded.version });
  return { state: "ready", automatic: true, searchable: ingestion.chunks.length > 0, analyzed: true, parser: ingestion.parser, chunk_count: ingestion.chunks.length, candidate_count: savedCandidates.length, canonicalized: false, initialization_run_id: completed.initialization_run_id, tenant_state_version: save.version };
}

async function handleCandidateProposal({ request, candidateId, authenticate, persistence }) {
  const { binding, loaded, platform } = await loadBoundPlatform({ request, authenticate, persistence });
  const result = proposeCandidateForCanon({ platform, tenantId: binding.tenant_id, principalId: binding.principal_id, candidateId });
  await persistence.saveTenant({ tenantId: binding.tenant_id, store: platform.store, expectedVersion: loaded.version });
  return Response.json(result, { status: 201 });
}

async function handleCandidateRejection({ request, candidateId, authenticate, persistence }) {
  const { binding, loaded, platform } = await loadBoundPlatform({ request, authenticate, persistence });
  let reason = "Rejected during Candidate Intelligence review.";
  try { const body = await request.json(); if (typeof body?.reason === "string" && body.reason.trim()) reason = body.reason.trim(); } catch {}
  const candidate = rejectCandidate({ platform, tenantId: binding.tenant_id, candidateId, reason });
  await persistence.saveTenant({ tenantId: binding.tenant_id, store: platform.store, expectedVersion: loaded.version });
  return Response.json({ candidate });
}

async function handleCandidateApproval({ request, changeSetId, authenticate, persistence }) {
  const { binding, loaded, platform } = await loadBoundPlatform({ request, authenticate, persistence });
  const result = approveCandidateChangeSet({ platform, tenantId: binding.tenant_id, principalId: binding.principal_id, changeSetId });
  await persistence.saveTenant({ tenantId: binding.tenant_id, store: platform.store, expectedVersion: loaded.version });
  return Response.json(result);
}

async function loadBoundPlatform({ request, authenticate, persistence }) {
  if (!persistence) throw new SovereignError("database_not_configured", "DATABASE_URL is required for the production Sovereign runtime.", { status: 503 });
  const auth = await authenticate(request);
  const binding = await persistence.resolveAuthBinding(auth.authSubject);
  if (!binding) throw new SovereignError("onboarding_required", "Create your Sovereign tenant before using protected Sovereign capabilities.", { status: 409 });
  const loaded = await persistence.loadTenant(binding.tenant_id);
  return { auth, binding, loaded, platform: createSovereignPlatform({ store: loaded.store }) };
}

async function injectAskSovereign(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;
  const text = await response.text();
  const panel = `<section class="panel" id="ask-sovereign-panel" style="margin-bottom:18px"><div class="panel-header"><h2>Ask Sovereign</h2><span>Sources + Canonical Intelligence</span></div><form id="ask-sovereign-form" style="display:flex;gap:8px;flex-wrap:wrap"><input id="ask-sovereign-query" name="query" placeholder="Ask what Sovereign knows…" autocomplete="off" required style="flex:1;min-width:220px;border:1px solid #d7dbe2;border-radius:9px;padding:11px 12px;font:inherit"><button type="submit" style="border:0;border-radius:9px;background:#111419;color:#fff;padding:11px 15px;font:600 13px/1 system-ui;cursor:pointer">Ask</button></form><div id="ask-sovereign-answer" style="margin-top:16px"></div></section><script>(()=>{const form=document.getElementById('ask-sovereign-form');const input=document.getElementById('ask-sovereign-query');const out=document.getElementById('ask-sovereign-answer');if(!form)return;form.addEventListener('submit',async(e)=>{e.preventDefault();out.textContent='Searching Sovereign…';try{const response=await fetch('/v1/ask',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({query:input.value})});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.message||'Ask failed.');out.replaceChildren();const answer=document.createElement('p');answer.style.margin='0 0 12px';answer.style.fontSize='16px';answer.textContent=payload.answer;out.appendChild(answer);const meta=document.createElement('p');meta.style.cssText='margin:0 0 10px;color:#68707d;font-size:12px';meta.textContent='Confidence: '+payload.confidence+' · '+payload.result_count+' supporting result'+(payload.result_count===1?'':'s');out.appendChild(meta);for(const evidence of (payload.evidence||[])){const item=document.createElement('div');item.style.cssText='border-top:1px solid #e5e7eb;padding:9px 0';const source=document.createElement('strong');source.style.display='block';source.textContent=evidence.source_name||evidence.kind;const excerpt=document.createElement('span');excerpt.style.cssText='display:block;color:#68707d;font-size:13px';excerpt.textContent=(evidence.heading?evidence.heading+' — ':'')+evidence.excerpt;item.append(source,excerpt);out.appendChild(item)}}catch(error){out.textContent=error.message||'Ask failed.'}})})();</script>`;
  return new Response(text.replace("</header>", `</header>${panel}`), { status: response.status, statusText: response.statusText, headers: response.headers });
}

async function injectCommandMachineAccess(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;
  const text = await response.text();
  const panel = '<section class="panel"><div class="panel-header"><h2>Machine access</h2><a href="/console/command/service-credentials">Manage credentials</a></div><p class="empty">Create scoped, revocable credentials for HTTP, MCP, CLI, and approved agent runtimes. Browser sessions are not reused as machine identities.</p></section>';
  return new Response(text.replace("</main></div>", `${panel}</main></div>`), { status: response.status, statusText: response.statusText, headers: response.headers });
}

function requireMachineRuntime({ persistence, retrieval, authenticateService }) {
  if (!persistence || !retrieval || !authenticateService) throw new SovereignError("machine_gateway_not_configured", "Sovereign machine Gateway is not configured.", { status: 503 });
}

async function jsonBody(request) {
  try { return await request.json(); }
  catch { throw new SovereignError("invalid_json", "Request body must be valid JSON.", { status: 400 }); }
}

function parseOrigins(value) { return String(value ?? "").split(",").map((origin) => origin.trim()).filter(Boolean); }
function html(content) { return new Response(content, { headers: { "content-type": "text/html; charset=utf-8" } }); }

function runtimeError(error) {
  if (error instanceof SovereignError) return Response.json({ code: error.code, message: error.message, details: error.details }, { status: error.status });
  return Response.json({ code: "internal_error", message: "Unexpected Sovereign runtime error." }, { status: 500 });
}
