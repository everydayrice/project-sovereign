import baseWorker from "./worker.mjs";
import { createSovereignPlatform } from "./platform/sovereign-platform.mjs";
import { createNeonPersistence } from "./platform/neon-persistence.mjs";
import { createNeonSessionAuthenticator } from "./auth/neon-session-auth.mjs";
import { R2FileService } from "./files/r2-file-service.mjs";
import { SovereignError } from "./platform/errors.mjs";
import { analyzeStructuredText } from "./analysis/structured-text-analyzer.mjs";
import { sourceInitializePageHtml } from "./console/source-initialize-page.mjs";
import { approveCandidateChangeSet, proposeCandidateForCanon, rejectCandidate } from "./intelligence/candidate-review.mjs";

export default {
  async fetch(request, env = {}) {
    try {
      const url = new URL(request.url);
      const persistence = env.DATABASE_URL ? createNeonPersistence(env.DATABASE_URL) : null;
      const authenticate = createNeonSessionAuthenticator({ baseUrl: env.NEON_AUTH_BASE_URL });
      const files = new R2FileService({ bucket: env.SOVEREIGN_FILES });

      // Normal file ingestion is one action: upload, store, then automatically
      // process supported content. Users do not need to initialize or review
      // every extracted statement just to make a file available to Sovereign.
      if (request.method === "POST" && url.pathname === "/v1/sources/upload-file") {
        return await handleUploadWithAutomaticProcessing({ request, env, authenticate, persistence, files });
      }

      // Keep the explicit initialize endpoint available as an advanced/recovery
      // operation, but it is intentionally not linked from the normal Sources UI.
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

      // Canonical review APIs remain available for deliberate/advanced use, but
      // Candidate Intelligence is no longer presented as a mandatory upload step.
      const candidateProposeMatch = /^\/v1\/intelligence\/candidates\/([^/]+)\/propose-canonical$/.exec(url.pathname);
      if (request.method === "POST" && candidateProposeMatch) {
        return await handleCandidateProposal({
          request,
          candidateId: decodeURIComponent(candidateProposeMatch[1]),
          authenticate,
          persistence
        });
      }

      const candidateRejectMatch = /^\/v1\/intelligence\/candidates\/([^/]+)\/reject$/.exec(url.pathname);
      if (request.method === "POST" && candidateRejectMatch) {
        return await handleCandidateRejection({
          request,
          candidateId: decodeURIComponent(candidateRejectMatch[1]),
          authenticate,
          persistence
        });
      }

      const candidateApprovalMatch = /^\/v1\/intelligence\/canonical\/change-sets\/([^/]+)\/approve-candidate$/.exec(url.pathname);
      if (request.method === "POST" && candidateApprovalMatch) {
        return await handleCandidateApproval({
          request,
          changeSetId: decodeURIComponent(candidateApprovalMatch[1]),
          authenticate,
          persistence
        });
      }

      return baseWorker.fetch(request, env);
    } catch (error) {
      return runtimeError(error);
    }
  }
};

async function handleUploadWithAutomaticProcessing({ request, env, authenticate, persistence, files }) {
  // The base Worker owns multipart parsing, source registration, R2 storage and
  // the first durable save. We build automatic processing on top of that receipt.
  const uploadResponse = await baseWorker.fetch(request, env);
  if (!uploadResponse.ok) return uploadResponse;

  const upload = await uploadResponse.json();
  const sourceId = upload?.source?.source_id;
  let processing = {
    state: "stored",
    automatic: true,
    analyzed: false,
    canonicalized: false
  };

  if (sourceId) {
    processing = await tryAutomaticProcessing({
      request,
      sourceId,
      authenticate,
      persistence,
      files
    });
  }

  return Response.json({ ...upload, processing }, { status: uploadResponse.status });
}

async function tryAutomaticProcessing({ request, sourceId, authenticate, persistence, files }) {
  try {
    const response = await initializeTextSource({ request, sourceId, authenticate, persistence, files });
    const payload = await response.json();
    return {
      state: "analyzed",
      automatic: true,
      analyzed: true,
      candidate_count: payload.candidate_intelligence?.length ?? 0,
      canonicalized: false
    };
  } catch (error) {
    // A file upload still succeeds if the current alpha analyzer does not support
    // that format or cannot extract structured signals. The source remains stored
    // and inventoried instead of forcing the user into a manual review workflow.
    if (error instanceof SovereignError && ["unsupported_initialization_format", "no_candidate_intelligence"].includes(error.code)) {
      return {
        state: "stored",
        automatic: true,
        analyzed: false,
        canonicalized: false,
        processing_note: error.code
      };
    }
    throw error;
  }
}

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

async function handleCandidateProposal({ request, candidateId, authenticate, persistence }) {
  const { binding, loaded, platform } = await loadBoundPlatform({ request, authenticate, persistence });
  const result = proposeCandidateForCanon({
    platform,
    tenantId: binding.tenant_id,
    principalId: binding.principal_id,
    candidateId
  });
  await persistence.saveTenant({ tenantId: binding.tenant_id, store: platform.store, expectedVersion: loaded.version });
  return Response.json(result, { status: 201 });
}

async function handleCandidateRejection({ request, candidateId, authenticate, persistence }) {
  const { binding, loaded, platform } = await loadBoundPlatform({ request, authenticate, persistence });
  let reason = "Rejected during Candidate Intelligence review.";
  try {
    const body = await request.json();
    if (typeof body?.reason === "string" && body.reason.trim()) reason = body.reason.trim();
  } catch {}
  const candidate = rejectCandidate({ platform, tenantId: binding.tenant_id, candidateId, reason });
  await persistence.saveTenant({ tenantId: binding.tenant_id, store: platform.store, expectedVersion: loaded.version });
  return Response.json({ candidate });
}

async function handleCandidateApproval({ request, changeSetId, authenticate, persistence }) {
  const { binding, loaded, platform } = await loadBoundPlatform({ request, authenticate, persistence });
  const result = approveCandidateChangeSet({
    platform,
    tenantId: binding.tenant_id,
    principalId: binding.principal_id,
    changeSetId
  });
  await persistence.saveTenant({ tenantId: binding.tenant_id, store: platform.store, expectedVersion: loaded.version });
  return Response.json(result);
}

async function loadBoundPlatform({ request, authenticate, persistence }) {
  if (!persistence) throw new SovereignError("database_not_configured", "DATABASE_URL is required for the production Sovereign runtime.", { status: 503 });
  const auth = await authenticate(request);
  const binding = await persistence.resolveAuthBinding(auth.authSubject);
  if (!binding) throw new SovereignError("onboarding_required", "Create your Sovereign tenant before using managed sources.", { status: 409 });
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

function html(content) {
  return new Response(content, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function runtimeError(error) {
  if (error instanceof SovereignError) {
    return Response.json({ code: error.code, message: error.message, details: error.details }, { status: error.status });
  }
  return Response.json({ code: "internal_error", message: "Unexpected Sovereign runtime error." }, { status: 500 });
}
