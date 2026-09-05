import { createSovereignPlatform } from "../platform/sovereign-platform.mjs";
import { SovereignError } from "../platform/errors.mjs";

export const MCP_PROTOCOL_VERSION = "2026-07-28";

const TOOL_DEFINITIONS = Object.freeze([
  tool("check_in", "Check an actor into Sovereign Control Plane and receive orientation.", {
    type: "object", required: ["objective"], properties: {
      objective: { type: "string" }, task_capsule_id: { type: "string" }, parent_traffic_session_id: { type: "string" },
      context_appetite: { enum: ["lean","standard","broad","deep","custom"] },
      actor: { type: "object" }, requested_resources: { type: "array", items: { type: "object" } }
    }
  }, ["traffic:write", "orientation:read"]),
  tool("orient", "Refresh orientation for an existing Sovereign Traffic Session.", {
    type: "object", required: ["traffic_session_id"], properties: {
      traffic_session_id: { type: "string" }, requested_resources: { type: "array", items: { type: "object" } }
    }
  }, ["orientation:read"]),
  tool("search", "Search authorized Sovereign source material and Canonical Intelligence.", {
    type: "object", required: ["query"], properties: { query: { type: "string" }, source_id: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } }
  }, ["intelligence:read"]),
  tool("ask", "Ask Sovereign a question using authorized source and canonical evidence.", {
    type: "object", required: ["query"], properties: { query: { type: "string" }, source_id: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } }
  }, ["intelligence:read"]),
  tool("intelligence_get", "Get current Canonical Intelligence status, understanding, or a specific record.", {
    type: "object", properties: { record_id: { type: "string" }, mode: { enum: ["status","understanding","records"] }, history: { type: "boolean" } }
  }, ["intelligence:read"]),
  tool("continuity_get", "List durable Continuity tasks, sessions, memories, or ideas.", {
    type: "object", properties: { kind: { enum: ["tasks","sessions","memories","ideas"] }, task_capsule_id: { type: "string" } }
  }, ["continuity:read"]),
  tool("resume", "Build a durable resume packet for a Task Capsule without transcript copying.", {
    type: "object", required: ["task_capsule_id"], properties: { task_capsule_id: { type: "string" } }
  }, ["continuity:read", "traffic:read"]),
  tool("task_checkpoint", "Checkpoint material progress for an active Sovereign Traffic Session.", {
    type: "object", required: ["traffic_session_id","summary"], properties: {
      traffic_session_id: { type: "string" }, summary: { type: "string" }, kind: { type: "string" }, next_action: { type: "string" },
      blockers: { type: "array", items: { type: "string" } }, artifact_references: { type: "array" }, session_state: { enum: ["active","waiting","blocked"] }
    }
  }, ["continuity:write", "traffic:write"]),
  tool("traffic_current", "Inspect current Sovereign traffic and resource claims.", {
    type: "object", properties: { resource_id: { type: "string" }, board: { type: "boolean" } }
  }, ["traffic:read"]),
  tool("resource_claim", "Declare or activate a scoped Resource Claim.", {
    type: "object", required: ["traffic_session_id"], properties: {
      traffic_session_id: { type: "string" }, resource_claim_id: { type: "string" }, resource: { type: "object" }, intent: { type: "string" },
      scope: { type: "object" }, activate: { type: "boolean" }, approval: { type: "boolean" }
    }
  }, ["traffic:write"]),
  tool("resource_release", "Release an open Sovereign Resource Claim.", {
    type: "object", required: ["resource_claim_id"], properties: { resource_claim_id: { type: "string" } }
  }, ["traffic:write"]),
  tool("check_out", "Check out a Traffic Session and release its open claims.", {
    type: "object", required: ["traffic_session_id"], properties: {
      traffic_session_id: { type: "string" }, state: { enum: ["completed","cancelled","waiting","blocked"] },
      next_action: { type: "string" }, blockers: { type: "array", items: { type: "string" } }, artifact_references: { type: "array" }, outcome: { type: "object" }
    }
  }, ["traffic:write", "continuity:write"]),
  tool("canonical_propose", "Propose a governed Canonical Intelligence Change Set; this never bypasses Command approval policy.", {
    type: "object", required: ["title","reason","operations"], properties: {
      title: { type: "string" }, reason: { type: "string" }, operations: { type: "array", items: { type: "object" } },
      requires_approval: { type: "boolean" }, source_ids: { type: "array", items: { type: "string" } }, provenance: { type: "array" }, confidence: { enum: ["low","medium","high"] }
    }
  }, ["intelligence:propose"])
]);

export function createMcpServer({ persistence, retrieval, authenticateService, allowedOrigins = [] }) {
  return {
    async fetch(request) {
      try {
        assertTransport(request, allowedOrigins);
        const body = await request.json().catch(() => null);
        if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") return mcpError(body?.id ?? null, -32600, "Invalid JSON-RPC request.");

        const auth = await authenticateService(request);
        if (body.method === "server/discover") return mcpResult(body.id, discovery(auth));
        if (body.method === "tools/list") return mcpResult(body.id, { tools: visibleTools(auth.permissions) });
        if (body.method === "resources/list") return mcpResult(body.id, { resources: resourceDefinitions(auth.permissions) });
        if (body.method === "resources/read") return await readResource({ id: body.id, params: body.params ?? {}, auth, persistence, retrieval });
        if (body.method === "tools/call") return await callTool({ id: body.id, params: body.params ?? {}, auth, persistence, retrieval });
        return mcpError(body.id, -32601, "Method not found.");
      } catch (error) {
        if (error instanceof SovereignError) return mcpError(null, sovereignRpcCode(error.status), error.message, { code: error.code, details: error.details });
        return mcpError(null, -32603, "Unexpected Sovereign MCP error.");
      }
    }
  };
}

async function callTool({ id, params, auth, persistence, retrieval }) {
  const name = params.name;
  const args = params.arguments ?? {};
  const definition = TOOL_DEFINITIONS.find((candidate) => candidate.name === name);
  if (!definition) return mcpError(id, -32602, `Unknown Sovereign tool: ${name}.`);
  requireScopes(auth, definition.requiredScopes);

  const loaded = await persistence.loadTenant(auth.tenantId);
  const platform = createSovereignPlatform({ store: loaded.store });
  const base = { tenantId: auth.tenantId, principalId: auth.principalId };
  let payload;
  let mutates = false;

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
      const existing = platform.continuity.listSessions(auth.tenantId, { taskCapsuleId: args.task_capsule_id, states: ["active","waiting","blocked"] })
        .find((session) => session.actor_instance_id === payload.actor_instance.actor_instance_id);
      if (!existing) platform.continuity.createSessionCapsule({ tenantId: auth.tenantId, actorInstanceId: payload.actor_instance.actor_instance_id, taskCapsuleId: args.task_capsule_id });
    }
    mutates = true;
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
  } else if (name === "task_checkpoint") {
    payload = platform.traffic.checkpoint({ ...base, trafficSessionId: args.traffic_session_id, kind: args.kind ?? "progress", summary: args.summary, nextAction: args.next_action, blockers: args.blockers ?? [], artifactReferences: args.artifact_references ?? [], sessionState: args.session_state });
    mutates = true;
  } else if (name === "traffic_current") {
    payload = args.board === false ? { traffic: platform.traffic.currentTraffic({ tenantId: auth.tenantId, resource: args.resource_id }) } : platform.traffic.trafficBoard({ tenantId: auth.tenantId });
  } else if (name === "resource_claim") {
    if (args.resource_claim_id && args.activate) payload = platform.traffic.activateClaim({ ...base, resourceClaimId: args.resource_claim_id, approval: args.approval === true });
    else payload = platform.traffic.declareClaim({ ...base, trafficSessionId: args.traffic_session_id, resource: args.resource, intent: args.intent, scope: args.scope ?? {} });
    mutates = true;
  } else if (name === "resource_release") {
    payload = platform.traffic.releaseClaim({ ...base, resourceClaimId: args.resource_claim_id });
    mutates = true;
  } else if (name === "check_out") {
    payload = platform.traffic.checkout({ ...base, trafficSessionId: args.traffic_session_id, state: args.state ?? "completed", outcome: args.outcome ?? {}, nextAction: args.next_action, blockers: args.blockers ?? [], artifactReferences: args.artifact_references ?? [] });
    mutates = true;
  } else if (name === "canonical_propose") {
    payload = platform.intelligence.proposeChangeSet({ ...base, title: args.title, reason: args.reason, operations: args.operations, requiresApproval: args.requires_approval !== false, initiator: "mcp", sourceIds: args.source_ids ?? [], provenance: args.provenance ?? [], confidence: args.confidence ?? "medium" });
    mutates = true;
  }

  if (mutates) await persistence.saveTenant({ tenantId: auth.tenantId, store: platform.store, expectedVersion: loaded.version });
  return mcpResult(id, toolResult(payload));
}

async function readResource({ id, params, auth, persistence, retrieval }) {
  const uri = String(params.uri ?? "");
  const loaded = await persistence.loadTenant(auth.tenantId);
  const platform = createSovereignPlatform({ store: loaded.store });

  if (uri === "sovereign://traffic/current") {
    requireScopes(auth, ["traffic:read"]);
    return mcpResult(id, resourceResult(uri, platform.traffic.trafficBoard({ tenantId: auth.tenantId })));
  }
  if (uri === "sovereign://continuity/tasks") {
    requireScopes(auth, ["continuity:read"]);
    return mcpResult(id, resourceResult(uri, { tasks: platform.continuity.listTasks(auth.tenantId) }));
  }
  if (uri === "sovereign://intelligence/status") {
    requireScopes(auth, ["intelligence:read"]);
    return mcpResult(id, resourceResult(uri, platform.intelligence.canonicalStatus({ tenantId: auth.tenantId })));
  }
  if (uri.startsWith("sovereign://search/")) {
    requireScopes(auth, ["intelligence:read"]);
    const query = decodeURIComponent(uri.slice("sovereign://search/".length));
    return mcpResult(id, resourceResult(uri, await retrieval.search({ tenantId: auth.tenantId, query })));
  }
  return mcpError(id, -32002, "Sovereign resource was not found.");
}

function discovery(auth) {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    serverInfo: { name: "project-sovereign", version: "1.0.0-alpha" },
    capabilities: { tools: { listChanged: false }, resources: { listChanged: false }, prompts: {} },
    sovereign: { statelessTransport: true, tenantScoped: true, serviceCredentialId: auth.serviceCredentialId }
  };
}

function visibleTools(scopes) {
  return TOOL_DEFINITIONS.filter((definition) => definition.requiredScopes.every((scope) => scopes.includes(scope)))
    .map(({ requiredScopes, ...definition }) => definition);
}

function resourceDefinitions(scopes) {
  const resources = [];
  if (scopes.includes("traffic:read")) resources.push({ uri: "sovereign://traffic/current", name: "Current Sovereign traffic", mimeType: "application/json" });
  if (scopes.includes("continuity:read")) resources.push({ uri: "sovereign://continuity/tasks", name: "Continuity tasks", mimeType: "application/json" });
  if (scopes.includes("intelligence:read")) resources.push({ uri: "sovereign://intelligence/status", name: "Canonical Intelligence status", mimeType: "application/json" });
  return resources;
}

function normalizedActor(actor = {}, auth) {
  return {
    provider: actor.provider ?? { key: "mcp", displayName: "Model Context Protocol" },
    surface: actor.surface ?? { key: "mcp-client", displayName: "MCP Client", type: "mcp" },
    externalSessionId: actor.external_session_id ?? actor.externalSessionId,
    agentProfileId: actor.agent_profile_id ?? actor.agentProfileId,
    modelMetadata: { ...(actor.model_metadata ?? actor.modelMetadata ?? {}), service_credential_id: auth.serviceCredentialId }
  };
}

function assertTransport(request, allowedOrigins) {
  if (request.method !== "POST") throw new SovereignError("mcp_method_not_allowed", "Sovereign MCP accepts POST requests.", { status: 405 });
  const version = request.headers.get("MCP-Protocol-Version");
  if (version !== MCP_PROTOCOL_VERSION) throw new SovereignError("mcp_protocol_version_unsupported", `MCP-Protocol-Version ${MCP_PROTOCOL_VERSION} is required.`, { status: 400 });
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) throw new SovereignError("mcp_content_type_invalid", "MCP requests must use application/json.", { status: 415 });
  const origin = request.headers.get("origin");
  if (origin) {
    const requestOrigin = new URL(request.url).origin;
    const allowed = new Set([requestOrigin, ...allowedOrigins]);
    if (!allowed.has(origin)) throw new SovereignError("mcp_origin_denied", "MCP Origin is not allowed.", { status: 403 });
  }
}

function requireScopes(auth, scopes) {
  const missing = scopes.filter((scope) => !auth.permissions.includes(scope));
  if (missing.length) throw new SovereignError("service_scope_denied", "Service identity lacks required Sovereign scope.", { status: 403, details: { missing_scopes: missing } });
}

function tool(name, description, inputSchema, requiredScopes) {
  return { name, description, inputSchema, annotations: { readOnlyHint: !requiredScopes.some((scope) => scope.endsWith(":write") || scope.endsWith(":propose")) }, requiredScopes };
}

function toolResult(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError: false };
}

function resourceResult(uri, payload) {
  return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(payload, null, 2) }] };
}

function mcpResult(id, result) {
  return jsonRpc({ jsonrpc: "2.0", id, result });
}

function mcpError(id, code, message, data) {
  return jsonRpc({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } });
}

function jsonRpc(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "MCP-Protocol-Version": MCP_PROTOCOL_VERSION, "cache-control": "no-store" }
  });
}

function sovereignRpcCode(status) {
  if (status === 401) return -32001;
  if (status === 403) return -32003;
  if (status === 404) return -32002;
  if (status === 409) return -32009;
  return -32602;
}
