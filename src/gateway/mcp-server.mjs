import { createSovereignPlatform } from "../platform/sovereign-platform.mjs";
import { SovereignError } from "../platform/errors.mjs";
import { AGENT_OPERATIONS, executeAgentOperation, requireAgentScopes } from "./agent-operations.mjs";

export const MCP_PROTOCOL_VERSION = "2026-07-28";

const TOOL_DEFINITIONS = Object.freeze([
  tool("check_in", "Check an actor into Sovereign Control Plane and receive orientation.", {
    type: "object", required: ["objective"], properties: {
      objective: { type: "string" }, task_capsule_id: { type: "string" }, parent_traffic_session_id: { type: "string" },
      context_appetite: { enum: ["lean","standard","broad","deep","custom"] }, actor: { type: "object" },
      requested_resources: { type: "array", items: { type: "object" } }
    }
  }),
  tool("orient", "Refresh orientation for an existing Sovereign Traffic Session.", {
    type: "object", required: ["traffic_session_id"], properties: { traffic_session_id: { type: "string" }, requested_resources: { type: "array", items: { type: "object" } } }
  }),
  tool("search", "Search authorized Sovereign source material and Canonical Intelligence.", {
    type: "object", required: ["query"], properties: { query: { type: "string" }, source_id: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } }
  }),
  tool("ask", "Ask Sovereign a question using authorized source and canonical evidence.", {
    type: "object", required: ["query"], properties: { query: { type: "string" }, source_id: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } }
  }),
  tool("intelligence_get", "Get current Canonical Intelligence status, understanding, records, or a specific record.", {
    type: "object", properties: { record_id: { type: "string" }, mode: { enum: ["status","understanding","records"] }, history: { type: "boolean" } }
  }),
  tool("continuity_get", "List durable Continuity tasks, sessions, candidate memories, or Ideas.", {
    type: "object", properties: { kind: { enum: ["tasks","sessions","memories","ideas"] }, task_capsule_id: { type: "string" } }
  }),
  tool("resume", "Build a durable resume packet for a Task Capsule without transcript copying.", {
    type: "object", required: ["task_capsule_id"], properties: { task_capsule_id: { type: "string" } }
  }),
  tool("task_create", "Create a durable non-canonical Task Capsule.", {
    type: "object", required: ["title","objective"], properties: {
      title: { type: "string" }, objective: { type: "string" }, next_action: { type: "string" }, state: { enum: ["planned","active","waiting","blocked","completed","cancelled"] },
      blockers: { type: "array", items: { type: "string" } }, intelligence_references: { type: "array" }
    }
  }),
  tool("task_update", "Update a durable Task Capsule.", {
    type: "object", required: ["task_capsule_id"], properties: {
      task_capsule_id: { type: "string" }, title: { type: "string" }, objective: { type: "string" }, next_action: { type: "string" },
      state: { enum: ["planned","active","waiting","blocked","completed","cancelled"] }, blockers: { type: "array", items: { type: "string" } }, intelligence_references: { type: "array" }
    }
  }),
  tool("task_checkpoint", "Checkpoint material progress for an active Sovereign Traffic Session.", {
    type: "object", required: ["traffic_session_id","summary"], properties: {
      traffic_session_id: { type: "string" }, summary: { type: "string" }, kind: { type: "string" }, next_action: { type: "string" },
      blockers: { type: "array", items: { type: "string" } }, artifact_references: { type: "array" }, session_state: { enum: ["active","waiting","blocked"] }
    }
  }),
  tool("traffic_current", "Inspect current Sovereign traffic and Resource Claims.", {
    type: "object", properties: { resource_id: { type: "string" }, board: { type: "boolean" } }
  }),
  tool("resource_claim", "Declare or activate a scoped Resource Claim.", {
    type: "object", properties: {
      traffic_session_id: { type: "string" }, resource_claim_id: { type: "string" }, resource: { type: "object" }, intent: { type: "string" },
      scope: { type: "object" }, activate: { type: "boolean" }, approval: { type: "boolean" }
    }
  }),
  tool("resource_release", "Release an open Sovereign Resource Claim.", {
    type: "object", required: ["resource_claim_id"], properties: { resource_claim_id: { type: "string" } }
  }),
  tool("heartbeat", "Renew a live Traffic Session and its open Resource Claim leases.", {
    type: "object", required: ["traffic_session_id"], properties: { traffic_session_id: { type: "string" } }
  }),
  tool("check_out", "Check out a Traffic Session and release its open claims.", {
    type: "object", required: ["traffic_session_id"], properties: {
      traffic_session_id: { type: "string" }, state: { enum: ["completed","cancelled","waiting","blocked"] },
      next_action: { type: "string" }, blockers: { type: "array", items: { type: "string" } }, artifact_references: { type: "array" }, outcome: { type: "object" }
    }
  }),
  tool("canonical_propose", "Propose a governed Canonical Intelligence Change Set without bypassing approval policy.", {
    type: "object", required: ["title","reason","operations"], properties: {
      title: { type: "string" }, reason: { type: "string" }, operations: { type: "array", items: { type: "object" } },
      requires_approval: { type: "boolean" }, source_ids: { type: "array", items: { type: "string" } }, provenance: { type: "array" }, confidence: { enum: ["low","medium","high"] }
    }
  })
]);

export function createMcpServer({ persistence, retrieval, authenticateService, allowedOrigins = [] }) {
  return {
    async fetch(request) {
      let requestId = null;
      try {
        assertTransport(request, allowedOrigins);
        const body = await request.json().catch(() => null);
        requestId = body?.id ?? null;
        if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") return mcpError(requestId, -32600, "Invalid JSON-RPC request.");

        const auth = await authenticateService(request);
        if (body.method === "server/discover") return mcpResult(body.id, discovery(auth));
        if (body.method === "tools/list") return mcpResult(body.id, { tools: visibleTools(auth.permissions) });
        if (body.method === "resources/list") return mcpResult(body.id, { resources: resourceDefinitions(auth.permissions) });
        if (body.method === "resources/read") return await readResource({ id: body.id, params: body.params ?? {}, auth, persistence, retrieval });
        if (body.method === "tools/call") return await callTool({ id: body.id, params: body.params ?? {}, auth, persistence, retrieval });
        return mcpError(body.id, -32601, "Method not found.");
      } catch (error) {
        if (error instanceof SovereignError) return mcpError(requestId, sovereignRpcCode(error.status), error.message, { code: error.code, details: error.details });
        return mcpError(requestId, -32603, "Unexpected Sovereign MCP error.");
      }
    }
  };
}

async function callTool({ id, params, auth, persistence, retrieval }) {
  const name = params.name;
  const definition = TOOL_DEFINITIONS.find((candidate) => candidate.name === name);
  if (!definition) return mcpError(id, -32602, `Unknown Sovereign tool: ${name}.`);
  const result = await executeAgentOperation({ name, args: params.arguments ?? {}, auth, persistence, retrieval });
  return mcpResult(id, toolResult(result.data, result.persistence));
}

async function readResource({ id, params, auth, persistence, retrieval }) {
  const uri = String(params.uri ?? "");
  const loaded = await persistence.loadTenant(auth.tenantId);
  const platform = createSovereignPlatform({ store: loaded.store });

  if (uri === "sovereign://traffic/current") {
    requireAgentScopes(auth, ["traffic:read"]);
    return mcpResult(id, resourceResult(uri, platform.traffic.trafficBoard({ tenantId: auth.tenantId })));
  }
  if (uri === "sovereign://continuity/tasks") {
    requireAgentScopes(auth, ["continuity:read"]);
    return mcpResult(id, resourceResult(uri, { tasks: platform.continuity.listTasks(auth.tenantId) }));
  }
  if (uri === "sovereign://intelligence/status") {
    requireAgentScopes(auth, ["intelligence:read"]);
    return mcpResult(id, resourceResult(uri, platform.intelligence.canonicalStatus({ tenantId: auth.tenantId })));
  }
  if (uri.startsWith("sovereign://search/")) {
    requireAgentScopes(auth, ["intelligence:read"]);
    const query = decodeURIComponent(uri.slice("sovereign://search/".length));
    return mcpResult(id, resourceResult(uri, await retrieval.search({ tenantId: auth.tenantId, query })));
  }
  return mcpError(id, -32002, "Sovereign resource was not found.");
}

function discovery(auth) {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    serverInfo: { name: "project-sovereign", version: "1.0.0-alpha" },
    capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
    sovereign: { statelessTransport: true, tenantScoped: true, serviceCredentialId: auth.serviceCredentialId }
  };
}

function visibleTools(scopes) {
  return TOOL_DEFINITIONS.filter((definition) => AGENT_OPERATIONS[definition.name].requiredScopes.every((scope) => scopes.includes(scope)))
    .map(({ name, description, inputSchema }) => ({ name, description, inputSchema, annotations: { readOnlyHint: !AGENT_OPERATIONS[name].mutates } }));
}

function resourceDefinitions(scopes) {
  const resources = [];
  if (scopes.includes("traffic:read")) resources.push({ uri: "sovereign://traffic/current", name: "Current Sovereign traffic", mimeType: "application/json" });
  if (scopes.includes("continuity:read")) resources.push({ uri: "sovereign://continuity/tasks", name: "Continuity tasks", mimeType: "application/json" });
  if (scopes.includes("intelligence:read")) resources.push({ uri: "sovereign://intelligence/status", name: "Canonical Intelligence status", mimeType: "application/json" });
  return resources;
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

function tool(name, description, inputSchema) { return { name, description, inputSchema }; }

function toolResult(payload, persistence) {
  const structuredContent = persistence ? { ...normalizePayload(payload), _persistence: persistence } : normalizePayload(payload);
  return { content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }], structuredContent, isError: false };
}

function normalizePayload(payload) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) return payload;
  return { value: payload };
}

function resourceResult(uri, payload) {
  return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(payload, null, 2) }] };
}

function mcpResult(id, result) { return jsonRpc({ jsonrpc: "2.0", id, result }); }
function mcpError(id, code, message, data) { return jsonRpc({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } }); }

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
