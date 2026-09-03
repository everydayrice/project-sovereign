import { SovereignError } from "../platform/errors.mjs";
import { buildConsoleSnapshot } from "../console/console-snapshot.mjs";
import { consoleShellHtml, publicPageHtml } from "../console/console-shell.mjs";

export function createHttpGateway({ platform, authenticate }) {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") return json({ status: "ok", runtime: "in_memory_alpha", authentication: "not_configured", persistence: "not_configured" });
      if (request.method === "GET" && url.pathname === "/") return html(publicPageHtml());
      if (request.method === "GET" && ["/login", "/signup"].includes(url.pathname)) return html(publicPageHtml({ page: url.pathname.slice(1) }));
      try {
        const auth = await authenticate(request);
        const response = await route({ request, url, auth, platform });
        return response ?? json({ code: "not_found", message: "Route was not found." }, 404);
      } catch (error) {
        return errorResponse(error);
      }
    }
  };
}

async function route({ request, url, auth, platform }) {
  const { command, traffic, continuity, sources, intelligence, initialization, recovery, improvement } = platform;
  // Authentication resolves a verified subject. Command resolves that subject
  // into an active principal in this tenant before any module receives it.
  command.requirePrincipal(auth.tenantId, auth.principalId);
  const base = { tenantId: auth.tenantId, principalId: auth.principalId };
  const path = url.pathname;

  if (request.method === "GET" && path === "/v1/console/snapshot") return json(buildConsoleSnapshot({ platform, tenantId: auth.tenantId }));
  const consolePage = /^\/console(?:\/(home|command|intelligence|control-plane|continuity|sources|integrations|extensions|audit))?$/.exec(path);
  if (request.method === "GET" && consolePage) return html(consoleShellHtml(buildConsoleSnapshot({ platform, tenantId: auth.tenantId }), consolePage[1] ?? "home"));
  if (request.method === "GET" && path === "/v1/command/workspaces") return json({ workspaces: command.listWorkspaces(auth.tenantId) });
  if (request.method === "POST" && path === "/v1/command/workspaces") { const body = await bodyJson(request); return json({ workspace: command.createWorkspace({ ...base, slug: body.slug, displayName: body.display_name, parentWorkspaceId: body.parent_workspace_id, settings: body.settings ?? {} }) }, 201); }

  if (request.method === "GET" && path === "/v1/sources/connectors") return json({ connectors: sources.listConnectorDefinitions() });
  if (request.method === "GET" && path === "/v1/sources") return json(sources.sourceHealth(auth.tenantId));
  if (request.method === "POST" && path === "/v1/sources") {
    const body = await bodyJson(request);
    return json({ source: sources.createSource({ ...base, connectorKey: body.connector_key, category: body.source_category, displayName: body.display_name, locator: body.locator, authorityState: body.authority_state, freshnessClass: body.freshness_class, dataClassification: body.data_classification, connectionState: body.connection_state, processingState: body.processing_state, currentness: body.currentness, metadata: body.metadata }) }, 201);
  }
  if (request.method === "POST" && path === "/v1/sources/uploads") {
    const body = await bodyJson(request);
    return json({ source: sources.createManagedUpload({ ...base, fileName: body.file_name, mimeType: body.mime_type, sizeBytes: body.size_bytes, contentHash: body.content_hash, classification: body.data_classification, locator: body.locator }) }, 201);
  }
  const sourceInventory = /^\/v1\/sources\/([^/]+)\/inventory$/.exec(path);
  if (request.method === "POST" && sourceInventory) { const body = await bodyJson(request); return json(sources.recordInventory({ tenantId: auth.tenantId, sourceId: sourceInventory[1], items: body.items ?? [], excludedCount: body.excluded_count ?? 0 })); }
  const sourceFailure = /^\/v1\/sources\/([^/]+)\/failure$/.exec(path);
  if (request.method === "POST" && sourceFailure) { const body = await bodyJson(request); return json({ source: sources.markFailed({ tenantId: auth.tenantId, sourceId: sourceFailure[1], reason: body.reason ?? "Source failure reported.", stale: body.stale !== false }) }); }

  if (request.method === "POST" && path === "/v1/initialization/runs") { const body = await bodyJson(request); return json({ initialization_run: initialization.start({ ...base, scope: body.scope ?? {}, sourceIds: body.source_ids, mode: body.mode ?? "initialize" }) }, 201); }
  if (request.method === "GET" && path === "/v1/initialization/runs") return json({ initialization_runs: initialization.listRuns(auth.tenantId) });
  const initializationResult = /^\/v1\/initialization\/runs\/([^/]+)\/sources\/([^/]+)$/.exec(path);
  if (request.method === "POST" && initializationResult) { const body = await bodyJson(request); return json({ initialization_run: initialization.recordSourceResult({ tenantId: auth.tenantId, runId: initializationResult[1], sourceId: initializationResult[2], state: body.state, itemCount: body.item_count, inventoriedItemCount: body.inventoried_item_count, analyzedItemCount: body.analyzed_item_count, candidateCount: body.candidate_count, excludedCount: body.excluded_count, failureReason: body.failure_reason, currentness: body.currentness }) }); }
  const initializationComplete = /^\/v1\/initialization\/runs\/([^/]+)\/complete$/.exec(path);
  if (request.method === "POST" && initializationComplete) return json({ initialization_run: initialization.complete({ tenantId: auth.tenantId, runId: initializationComplete[1] }) });
  const initializationGet = /^\/v1\/initialization\/runs\/([^/]+)$/.exec(path);
  if (request.method === "GET" && initializationGet) return json({ initialization_run: initialization.getRun(auth.tenantId, initializationGet[1]) });

  if (request.method === "GET" && path === "/v1/intelligence/canonical/status") return json(intelligence.canonicalStatus({ tenantId: auth.tenantId, scope: scopeFromUrl(url) }));
  if (request.method === "GET" && path === "/v1/intelligence/canonical/records") return json({ records: intelligence.listRecords({ tenantId: auth.tenantId, scope: scopeFromUrl(url), includeHistorical: url.searchParams.get("history") === "true" }) });
  if (request.method === "GET" && path === "/v1/intelligence/understanding") return json(intelligence.understanding({ tenantId: auth.tenantId, scope: scopeFromUrl(url) }));
  if (request.method === "POST" && path === "/v1/intelligence/candidates") { const body = await bodyJson(request); return json({ candidate_intelligence: intelligence.createCandidate({ ...base, recordType: body.record_type, payload: body.payload, scope: body.scope, sourceIds: body.source_ids, provenance: body.provenance, confidence: body.confidence, reason: body.reason }) }, 201); }
  if (request.method === "POST" && path === "/v1/intelligence/canonical/change-sets") { const body = await bodyJson(request); return json(intelligence.proposeChangeSet({ ...base, title: body.title, reason: body.reason, operations: body.operations, requiresApproval: body.requires_approval !== false, initiator: body.initiator, scope: body.scope, confidence: body.confidence, sourceIds: body.source_ids, provenance: body.provenance }), 201); }
  const recordGet = /^\/v1\/intelligence\/canonical\/records\/([^/]+)$/.exec(path);
  if (request.method === "GET" && recordGet) return json(intelligence.getRecord({ tenantId: auth.tenantId, recordId: recordGet[1] }));
  const changeApprove = /^\/v1\/intelligence\/canonical\/change-sets\/([^/]+)\/approve$/.exec(path);
  if (request.method === "POST" && changeApprove) return json(intelligence.approveChangeSet({ ...base, changeSetId: changeApprove[1] }));
  const changeReject = /^\/v1\/intelligence\/canonical\/change-sets\/([^/]+)\/reject$/.exec(path);
  if (request.method === "POST" && changeReject) { const body = await bodyJson(request); return json({ change_set: intelligence.rejectChangeSet({ ...base, changeSetId: changeReject[1], reason: body.reason }) }); }
  const changeRevert = /^\/v1\/intelligence\/canonical\/change-sets\/([^/]+)\/revert$/.exec(path);
  if (request.method === "POST" && changeRevert) { const body = await bodyJson(request); return json({ change_set: intelligence.revertChangeSet({ ...base, changeSetId: changeRevert[1], title: body.title, reason: body.reason, requiresApproval: body.requires_approval !== false }) }); }

  if (request.method === "POST" && path === "/v1/recovery") { const body = await bodyJson(request); return json({ recovery_session: recovery.start({ ...base, scope: body.scope ?? {}, reason: body.reason }) }, 201); }
  if (request.method === "GET" && path === "/v1/recovery") return json({ recovery_sessions: recovery.list(auth.tenantId) });
  const recoveryComplete = /^\/v1\/recovery\/([^/]+)\/complete$/.exec(path);
  if (request.method === "POST" && recoveryComplete) { const body = await bodyJson(request); return json({ recovery_session: recovery.complete({ ...base, recoverySessionId: recoveryComplete[1], summary: body.summary }) }); }
  if (request.method === "POST" && path === "/v1/improvement/corrections") { const body = await bodyJson(request); return json(improvement.reportCorrection({ ...base, scope: body.scope, summary: body.summary, expectedBehavior: body.expected_behavior, actualBehavior: body.actual_behavior, evidence: body.evidence, canonicalRevision: body.canonical_revision })); }
  if (request.method === "GET" && path === "/v1/improvement/health") return json(improvement.health(auth.tenantId));

  if (request.method === "POST" && path === "/v1/continuity/tasks") { const body = await bodyJson(request); return json({ task_capsule: continuity.createTaskCapsule({ ...base, ownerPrincipalId: auth.principalId, title: body.title, objective: body.objective, nextAction: body.next_action }) }, 201); }
  if (request.method === "POST" && path === "/v1/control-plane/check-in") { const body = await bodyJson(request); const result = traffic.checkIn({ ...base, actor: body.actor, objective: body.objective, taskCapsuleId: body.task_capsule_id, parentTrafficSessionId: body.parent_traffic_session_id, requestedResources: body.requested_resources ?? [], contextAppetite: body.context_appetite ?? "standard", permissions: auth.permissions ?? [] }); if (body.accept_handoff_id) continuity.acceptHandoff({ tenantId: auth.tenantId, handoffId: body.accept_handoff_id, actorInstanceId: result.actor_instance.actor_instance_id }); return json(result, 201); }
  if (request.method === "GET" && path === "/v1/control-plane/traffic") { const resourceId = url.searchParams.get("resource_id"); return json({ traffic: traffic.currentTraffic({ tenantId: auth.tenantId, resource: resourceId || undefined }) }); }
  if (request.method === "GET" && path === "/v1/control-plane/traffic-board") return json(traffic.trafficBoard({ tenantId: auth.tenantId }));
  if (request.method === "POST" && path === "/v1/control-plane/traffic/claims") { const body = await bodyJson(request); return json(traffic.declareClaim({ ...base, trafficSessionId: body.traffic_session_id, resource: body.resource, intent: body.intent, scope: body.scope ?? {} }), 201); }

  const claimActivation = /^\/v1\/control-plane\/traffic\/claims\/([^/]+)\/activate$/.exec(path);
  if (request.method === "POST" && claimActivation) { const body = await bodyJson(request); return json(traffic.activateClaim({ ...base, resourceClaimId: claimActivation[1], approval: body.approval === true })); }
  const claimRelease = /^\/v1\/control-plane\/traffic\/claims\/([^/]+)\/release$/.exec(path);
  if (request.method === "POST" && claimRelease) return json({ claim: traffic.releaseClaim({ ...base, resourceClaimId: claimRelease[1] }) });
  const heartbeat = /^\/v1\/control-plane\/traffic\/sessions\/([^/]+)\/heartbeat$/.exec(path);
  if (request.method === "POST" && heartbeat) return json({ traffic_session: traffic.heartbeat({ ...base, trafficSessionId: heartbeat[1] }) });
  const checkpoints = /^\/v1\/control-plane\/traffic\/sessions\/([^/]+)\/checkpoints$/.exec(path);
  if (request.method === "POST" && checkpoints) { const body = await bodyJson(request); return json({ traffic_checkpoint: traffic.checkpoint({ ...base, trafficSessionId: checkpoints[1], kind: body.kind, summary: body.summary, nextAction: body.next_action, blockers: body.blockers ?? [], artifactReferences: body.artifact_references ?? [], sessionState: body.session_state }) }, 201); }
  const handoff = /^\/v1\/control-plane\/traffic\/sessions\/([^/]+)\/handoffs$/.exec(path);
  if (request.method === "POST" && handoff) { const body = await bodyJson(request); return json({ handoff: traffic.handoff({ ...base, trafficSessionId: handoff[1], toActorInstanceId: body.to_actor_instance_id, taskCapsuleId: body.task_capsule_id, summary: body.summary, nextAction: body.next_action }) }, 201); }
  const checkout = /^\/v1\/control-plane\/traffic\/sessions\/([^/]+)\/checkout$/.exec(path);
  if (request.method === "POST" && checkout) { const body = await bodyJson(request); return json({ traffic_session: traffic.checkout({ ...base, trafficSessionId: checkout[1], state: body.state ?? "completed", outcome: body.outcome ?? {}, nextAction: body.next_action, blockers: body.blockers ?? [], artifactReferences: body.artifact_references ?? [] }) }); }
  return undefined;
}

function scopeFromUrl(url) { return url.searchParams.get("scope_key") ? { key: url.searchParams.get("scope_key") } : {}; }
async function bodyJson(request) { try { return await request.json(); } catch { throw new SovereignError("invalid_json", "Request body must be valid JSON."); } }
function json(payload, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } }); }
function html(content) { return new Response(content, { headers: { "content-type": "text/html; charset=utf-8" } }); }
function errorResponse(error) { if (error instanceof SovereignError) return json({ code: error.code, message: error.message, details: error.details }, error.status); return json({ code: "internal_error", message: "Unexpected Sovereign Gateway error." }, 500); }
