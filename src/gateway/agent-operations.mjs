import { createSovereignPlatform } from "../platform/sovereign-platform.mjs";
import { SovereignError } from "../platform/errors.mjs";

export const AGENT_OPERATIONS = Object.freeze({
  check_in: op(["traffic:write", "orientation:read"], true),
  orient: op(["orientation:read"], false),
  search: op(["intelligence:read"], false),
  ask: op(["intelligence:read"], false),
  intelligence_get: op(["intelligence:read"], false),
  continuity_get: op(["continuity:read"], false),
  resume: op(["continuity:read", "traffic:read"], false),
  task_create: op(["continuity:write"], true),
  task_update: op(["continuity:write"], true),
  task_checkpoint: op(["continuity:write", "traffic:write"], true),
  traffic_current: op(["traffic:read"], false),
  resource_claim: op(["traffic:write"], true),
  resource_release: op(["traffic:write"], true),
  heartbeat: op(["traffic:write"], true),
  check_out: op(["traffic:write", "continuity:write"], true),
  canonical_propose: op(["intelligence:propose"], true)
});

export async function executeAgentOperation({ name, args = {}, auth, persistence, retrieval }) {
  const definition = AGENT_OPERATIONS[name];
  if (!definition) throw new SovereignError("agent_operation_unknown", `Unknown Sovereign agent operation: ${name}.`, { status: 404 });
  requireScopes(auth, definition.requiredScopes);

  const loaded = await persistence.loadTenant(auth.tenantId);
  const platform = createSovereignPlatform({ store: loaded.store });
  const base = { tenantId: auth.tenantId, principalId: auth.principalId };
  let payload;

  if (name === "check_in") {
    payload = platform.traffic.checkIn({
      ...base,
      actor: normalizedActor(args.actor, auth),
      objective: args.objective,
      taskCapsuleId: args.task_capsule_id,
      parentTrafficSessionId: args.parent_traffic_session_id,
      requestedResources: args.requested_resources ?? [],
      contextAppetite: args.context_appetite ?? "standard",
      permissions: auth.permissions
    });
    if (args.task_capsule_id) {
      const active = platform.continuity.listSessions(auth.tenantId, { taskCapsuleId: args.task_capsule_id, states: ["active", "waiting", "blocked"] })
        .find((session) => session.actor_instance_id === payload.actor_instance.actor_instance_id);
      if (!active) platform.continuity.createSessionCapsule({ tenantId: auth.tenantId, actorInstanceId: payload.actor_instance.actor_instance_id, taskCapsuleId: args.task_capsule_id });
    }
  } else if (name === "orient") {
    payload = platform.traffic.orientation({ ...base, trafficSessionId: args.traffic_session_id, requestedResources: args.requested_resources ?? [], permissions: auth.permissions });
  } else if (name === "search") {
    payload = await retrieval.search({ tenantId: auth.tenantId, query: args.query, sourceId: args.source_id, limit: args.limit ?? 12 });
  } else if (name === "ask") {
    payload = await retrieval.ask({ tenantId: auth.tenantId, query: args.query, sourceId: args.source_id, limit: args.limit ?? 8 });
  } else if (name === "intelligence_get") {
    if (args.record_id) payload = platform.intelligence.getRecord({ tenantId: auth.tenantId, recordId: args.record_id });
    else if (args.mode === "understanding") payload = platform.intelligence.understanding({ tenantId: auth.tenantId });
    else if (args.mode === "records") payload = { records: platform.intelligence.listRecords({ tenantId: auth.tenantId, includeHistorical: args.history === true }) };
    else payload = platform.intelligence.canonicalStatus({ tenantId: auth.tenantId });
  } else if (name === "continuity_get") {
    if (args.kind === "sessions") payload = { sessions: platform.continuity.listSessions(auth.tenantId, { taskCapsuleId: args.task_capsule_id }) };
    else if (args.kind === "memories") payload = { candidate_memories: platform.continuity.listCandidateMemories(auth.tenantId) };
    else if (args.kind === "ideas") payload = { ideas: platform.continuity.listIdeas(auth.tenantId) };
    else payload = { tasks: platform.continuity.listTasks(auth.tenantId) };
  } else if (name === "resume") {
    payload = platform.continuity.resumePacket({ tenantId: auth.tenantId, taskCapsuleId: args.task_capsule_id, currentTraffic: platform.traffic.currentTraffic({ tenantId: auth.tenantId }) });
  } else if (name === "task_create") {
    payload = platform.continuity.createTaskCapsule({
      tenantId: auth.tenantId,
      ownerPrincipalId: args.owner_principal_id ?? auth.principalId,
      title: args.title,
      objective: args.objective,
      nextAction: args.next_action,
      state: args.state ?? "active",
      blockers: args.blockers ?? [],
      intelligenceReferences: args.intelligence_references ?? []
    });
  } else if (name === "task_update") {
    payload = platform.continuity.updateTaskCapsule({
      tenantId: auth.tenantId,
      taskCapsuleId: args.task_capsule_id,
      title: args.title,
      objective: args.objective,
      state: args.state,
      nextAction: args.next_action,
      blockers: args.blockers,
      intelligenceReferences: args.intelligence_references
    });
  } else if (name === "task_checkpoint") {
    payload = platform.traffic.checkpoint({ ...base, trafficSessionId: args.traffic_session_id, kind: args.kind ?? "progress", summary: args.summary, nextAction: args.next_action, blockers: args.blockers ?? [], artifactReferences: args.artifact_references ?? [], sessionState: args.session_state });
  } else if (name === "traffic_current") {
    payload = args.board === false ? { traffic: platform.traffic.currentTraffic({ tenantId: auth.tenantId, resource: args.resource_id }) } : platform.traffic.trafficBoard({ tenantId: auth.tenantId });
  } else if (name === "resource_claim") {
    if (args.resource_claim_id && args.activate) payload = platform.traffic.activateClaim({ ...base, resourceClaimId: args.resource_claim_id, approval: args.approval === true });
    else payload = platform.traffic.declareClaim({ ...base, trafficSessionId: args.traffic_session_id, resource: args.resource, intent: args.intent, scope: args.scope ?? {} });
  } else if (name === "resource_release") {
    payload = platform.traffic.releaseClaim({ ...base, resourceClaimId: args.resource_claim_id });
  } else if (name === "heartbeat") {
    payload = platform.traffic.heartbeat({ ...base, trafficSessionId: args.traffic_session_id });
  } else if (name === "check_out") {
    payload = platform.traffic.checkout({ ...base, trafficSessionId: args.traffic_session_id, state: args.state ?? "completed", outcome: args.outcome ?? {}, nextAction: args.next_action, blockers: args.blockers ?? [], artifactReferences: args.artifact_references ?? [] });
  } else if (name === "canonical_propose") {
    payload = platform.intelligence.proposeChangeSet({ ...base, title: args.title, reason: args.reason, operations: args.operations, requiresApproval: args.requires_approval !== false, initiator: args.initiator ?? "agent", sourceIds: args.source_ids ?? [], provenance: args.provenance ?? [], confidence: args.confidence ?? "medium" });
  }

  if (definition.mutates) {
    const receipt = await persistence.saveTenant({ tenantId: auth.tenantId, store: platform.store, expectedVersion: loaded.version });
    return { data: payload, persistence: receipt };
  }
  return { data: payload };
}

export function requireAgentScopes(auth, scopes) {
  requireScopes(auth, scopes);
}

function requireScopes(auth, scopes) {
  const permissions = auth?.permissions ?? [];
  const missing = scopes.filter((scope) => !permissions.includes(scope));
  if (missing.length) throw new SovereignError("service_scope_denied", "Service identity lacks required Sovereign scope.", { status: 403, details: { missing_scopes: missing } });
}

function normalizedActor(actor = {}, auth) {
  return {
    provider: actor.provider ?? { key: "mcp", displayName: "Model Context Protocol" },
    surface: actor.surface ?? { key: "mcp-client", displayName: "MCP Client", type: "mcp" },
    externalSessionId: actor.external_session_id ?? actor.externalSessionId,
    agentProfileId: actor.agent_profile_id ?? actor.agentProfileId,
    modelMetadata: { ...(actor.model_metadata ?? actor.modelMetadata ?? {}), service_credential_id: auth.serviceCredentialId ?? null }
  };
}

function op(requiredScopes, mutates) {
  return { requiredScopes, mutates };
}
