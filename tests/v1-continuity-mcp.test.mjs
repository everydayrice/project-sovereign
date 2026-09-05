import assert from "node:assert/strict";
import test from "node:test";
import { createSovereignPlatform } from "../src/platform/sovereign-platform.mjs";
import { InMemorySovereignStore } from "../src/platform/store.mjs";
import { createMcpServer, MCP_PROTOCOL_VERSION } from "../src/gateway/mcp-server.mjs";
import { createServiceAuthenticator } from "../src/auth/service-credentials.mjs";

function fixture() {
  const platform = createSovereignPlatform({ clock: () => new Date("2026-09-05T12:00:00.000Z") });
  const tenant = platform.command.createTenant({ slug: "v1-test", displayName: "V1 Test", commandDisplayName: "COMMAND" });
  const principal = platform.command.createPrincipal({ tenantId: tenant.tenant_id, displayName: "Owner" });
  return { platform, tenant, principal };
}

function actor(externalSessionId = "actor-a") {
  return {
    provider: { key: "openai", displayName: "OpenAI" },
    surface: { key: "mcp", displayName: "MCP", type: "mcp" },
    externalSessionId
  };
}

test("Continuity resume packet survives a different Actor Instance", () => {
  const ctx = fixture();
  const task = ctx.platform.continuity.createTaskCapsule({
    tenantId: ctx.tenant.tenant_id, ownerPrincipalId: ctx.principal.principal_id,
    title: "Finish Sovereign V1", objective: "Complete the V1 platform", nextAction: "Implement MCP"
  });
  const first = ctx.platform.traffic.checkIn({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, actor: actor("chat-a"), objective: "Implement MCP", taskCapsuleId: task.task_capsule_id });
  ctx.platform.continuity.createSessionCapsule({ tenantId: ctx.tenant.tenant_id, actorInstanceId: first.actor_instance.actor_instance_id, taskCapsuleId: task.task_capsule_id, workingAssumptions: ["HTTP and MCP share operations"] });
  ctx.platform.traffic.checkpoint({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, trafficSessionId: first.traffic_session.traffic_session_id, summary: "Shared agent operations implemented.", nextAction: "Connect a second runtime", blockers: [] });
  const second = ctx.platform.traffic.checkIn({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, actor: actor("chat-b"), objective: "Resume V1 work", taskCapsuleId: task.task_capsule_id });
  assert.notEqual(second.actor_instance.actor_instance_id, first.actor_instance.actor_instance_id);
  const packet = ctx.platform.continuity.resumePacket({ tenantId: ctx.tenant.tenant_id, taskCapsuleId: task.task_capsule_id, currentTraffic: ctx.platform.traffic.currentTraffic({ tenantId: ctx.tenant.tenant_id }) });
  assert.equal(packet.latest_checkpoint.summary, "Shared agent operations implemented.");
  assert.equal(packet.next_action, "Connect a second runtime");
  assert.equal(packet.recent_sessions.length >= 1, true);
  assert.equal(packet.resumable, true);
});

test("service authenticator rejects missing scopes even for a valid token", async () => {
  const authenticate = createServiceAuthenticator({ credentialStore: {
    async resolveToken(token) {
      return token === "svk_valid" ? { serviceCredentialId: "svc_1", tenantId: "ten_1", principalId: "prn_1", displayName: "Reader", scopes: ["intelligence:read"] } : null;
    }
  } });
  const request = new Request("https://example.test/api/v1/search", { headers: { authorization: "Bearer svk_valid" } });
  const auth = await authenticate(request, ["intelligence:read"]);
  assert.equal(auth.tenantId, "ten_1");
  await assert.rejects(() => authenticate(request, ["traffic:write"]), (error) => error.code === "service_scope_denied" && error.status === 403);
});

test("MCP is stateless, versioned and lists only scope-authorized tools", async () => {
  const ctx = fixture();
  const initialState = ctx.platform.store.exportState();
  const persistence = fakePersistence(initialState);
  const server = createMcpServer({
    persistence,
    retrieval: { async search() { return { query: "x", result_count: 0, results: [] }; }, async ask() { return { query: "x", answer: "No evidence.", confidence: "unknown", evidence: [], result_count: 0 }; } },
    authenticateService: async () => ({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, serviceCredentialId: "svc_1", permissions: ["intelligence:read"], service: true })
  });
  const response = await server.fetch(mcpRequest("tools/list", {}, 1));
  const payload = await response.json();
  assert.equal(response.headers.get("MCP-Protocol-Version"), MCP_PROTOCOL_VERSION);
  assert.equal(payload.result.tools.some((tool) => tool.name === "search"), true);
  assert.equal(payload.result.tools.some((tool) => tool.name === "resource_claim"), false);
  assert.equal(response.headers.has("Mcp-Session-Id"), false);
});

test("MCP check-in and checkpoint mutate the same Sovereign store semantics", async () => {
  const ctx = fixture();
  const task = ctx.platform.continuity.createTaskCapsule({ tenantId: ctx.tenant.tenant_id, ownerPrincipalId: ctx.principal.principal_id, title: "Portable task", objective: "Prove MCP continuity" });
  const persistence = fakePersistence(ctx.platform.store.exportState());
  const permissions = ["orientation:read", "traffic:write", "traffic:read", "continuity:write", "continuity:read"];
  const server = createMcpServer({
    persistence,
    retrieval: { async search() { return { results: [] }; }, async ask() { return { answer: "" }; } },
    authenticateService: async () => ({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, serviceCredentialId: "svc_agent", permissions, service: true })
  });

  const checked = await (await server.fetch(mcpRequest("tools/call", { name: "check_in", arguments: { objective: "Work through MCP", task_capsule_id: task.task_capsule_id, actor: { external_session_id: "mcp-run-a" } } }, 1))).json();
  const trafficSessionId = checked.result.structuredContent.traffic_session.traffic_session_id;
  assert.ok(trafficSessionId);
  assert.equal(persistence.saves.length, 1);

  const checkpointed = await (await server.fetch(mcpRequest("tools/call", { name: "task_checkpoint", arguments: { traffic_session_id: trafficSessionId, summary: "MCP checkpoint", next_action: "Resume elsewhere" } }, 2))).json();
  assert.equal(checkpointed.result.structuredContent.summary, "MCP checkpoint");
  assert.equal(persistence.saves.length, 2);
  const resumedStore = new InMemorySovereignStore().importState(persistence.state);
  const checkpoints = resumedStore.list("trafficCheckpoints", (item) => item.tenant_id === ctx.tenant.tenant_id);
  assert.equal(checkpoints.at(-1).summary, "MCP checkpoint");
});

test("MCP rejects an untrusted browser Origin", async () => {
  const server = createMcpServer({ persistence: fakePersistence(fixture().platform.store.exportState()), retrieval: {}, authenticateService: async () => ({}) });
  const request = mcpRequest("tools/list", {}, 1, { origin: "https://evil.example" });
  const payload = await (await server.fetch(request)).json();
  assert.equal(payload.error.data.code, "mcp_origin_denied");
});

function mcpRequest(method, params, id, extraHeaders = {}) {
  return new Request("https://project-sovereign.example/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", "MCP-Protocol-Version": MCP_PROTOCOL_VERSION, authorization: "Bearer svk_test", ...extraHeaders },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
  });
}

function fakePersistence(initialState) {
  return {
    state: structuredClone(initialState), version: 1, saves: [],
    async loadTenant() { return { store: new InMemorySovereignStore().importState(this.state), version: this.version }; },
    async saveTenant({ store, expectedVersion }) {
      assert.equal(expectedVersion, this.version);
      this.state = store.exportState();
      this.version += 1;
      const receipt = { version: this.version };
      this.saves.push(receipt);
      return receipt;
    }
  };
}
