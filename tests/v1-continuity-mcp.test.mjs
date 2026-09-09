import assert from "node:assert/strict";
import test from "node:test";
import { createSovereignPlatform } from "../src/platform/sovereign-platform.mjs";
import { InMemorySovereignStore } from "../src/platform/store.mjs";
import { createMcpServer, MCP_PROTOCOL_VERSION } from "../src/gateway/mcp-server.mjs";
import { createServiceAuthenticator } from "../src/auth/service-credentials.mjs";
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

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

test('official MCP SDK initializes and resumes a checkpoint through a fresh client', async () => {
  const ctx = fixture();
  const persistence = fakePersistence(ctx.platform.store.exportState());
  const server = createMcpServer({persistence, retrieval:{}, authenticateService:async()=>({
    tenantId:ctx.tenant.tenant_id,principalId:ctx.principal.principal_id,service:true,
    permissions:['orientation:read','traffic:read','traffic:write','continuity:read','continuity:write']
  })});
  const connect = async name => {
    const client = new Client({name,version:'1.0.0'});
    const transport = new StreamableHTTPClientTransport(new URL('https://sovereign.test/mcp'),{
      fetch:async(url,init)=>server.fetch(new Request(url,init))
    });
    await client.connect(transport);
    return client;
  };
  const first = await connect('independent-sdk-first');
  try {
    assert.ok((await first.listTools()).tools.some(t=>t.name==='task_checkpoint'));
    await first.ping();
    const task = (await first.callTool({name:'task_create',arguments:{title:'SDK handoff',objective:'Resume across clients'}})).structuredContent;
    const checked = (await first.callTool({name:'check_in',arguments:{objective:'SDK work',task_capsule_id:task.task_capsule_id}})).structuredContent;
    await first.callTool({name:'task_checkpoint',arguments:{traffic_session_id:checked.traffic_session.traffic_session_id,summary:'Saved by the first SDK client',next_action:'Continue from the second client'}});
    await first.close();
    const second = await connect('independent-sdk-second');
    try {
      const resumed = (await second.callTool({name:'resume',arguments:{task_capsule_id:task.task_capsule_id}})).structuredContent;
      assert.equal(resumed.latest_checkpoint.summary,'Saved by the first SDK client');
      assert.equal(resumed.next_action,'Continue from the second client');
    } finally { await second.close(); }
  } finally { await first.close(); }
});

test('MCP returns HTTP auth challenges, negotiated versions, and empty notification responses',async()=>{
  const auth=createServiceAuthenticator({credentialStore:{resolveToken:async()=>null}});
  const denied=createMcpServer({authenticateService:auth});
  const init={jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',clientInfo:{name:'test',version:'1'},capabilities:{}}};
  const request=()=>new Request('https://sovereign.test/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(init)});
  const response=await denied.fetch(request());
  assert.equal(response.status,401);
  assert.match(response.headers.get('www-authenticate'),/oauth-protected-resource/);
  const server=createMcpServer({authenticateService:async()=>({permissions:[]})});
  assert.equal((await (await server.fetch(request())).json()).result.protocolVersion,'2025-06-18');
  const notification=await server.fetch(mcpRequest('notifications/initialized',{},undefined));
  assert.equal(notification.status,202);
  assert.equal(await notification.text(),'');
  assert.equal((await server.fetch(new Request('https://sovereign.test/mcp'))).status,405);
  assert.equal((await server.fetch(mcpRequest('ping',{},1,{'MCP-Protocol-Version':'invalid'}))).status,400);
});

test('MCP reads durable Ideas through the same normalized store as HTTP', async () => {
  const ctx = fixture();
  const idea = { idea_id:'idea_shared',title:'Shared across transports',state:'captured' };
  const server = createMcpServer({
    persistence:fakePersistence(ctx.platform.store.exportState()),
    authenticateService:async()=>({tenantId:ctx.tenant.tenant_id,principalId:ctx.principal.principal_id,permissions:['continuity:read','continuity:write']}),
    ideaStore:{async list({tenantId}){assert.equal(tenantId,ctx.tenant.tenant_id);return [idea];},async create(){return idea;}}
  });
  const listed=await (await server.fetch(mcpRequest('tools/call',{name:'continuity_get',arguments:{kind:'ideas'}},1))).json();
  assert.deepEqual(listed.result.structuredContent.ideas,[idea]);
  const created=await (await server.fetch(mcpRequest('tools/call',{name:'idea_create',arguments:{title:idea.title}},2))).json();
  assert.equal(created.result.structuredContent.idea_id,idea.idea_id);
});
