import assert from "node:assert/strict";
import test from "node:test";
import { createTestAuthenticator } from "../src/auth/authenticators.mjs";
import { createHttpGateway } from "../src/gateway/http-gateway.mjs";
import { createSovereignPlatform } from "../src/platform/sovereign-platform.mjs";
import worker from "../src/worker.mjs";

test("Gateway uses verified tenant/principal context and serves the basic traffic board", async () => {
  const platform = createSovereignPlatform();
  const tenant = platform.command.createTenant({ slug: "gateway-tenant", displayName: "Gateway Tenant", commandDisplayName: "Gateway Command" });
  const principal = platform.command.createPrincipal({ tenantId: tenant.tenant_id, displayName: "Owner" });
  const gateway = createHttpGateway({ platform, authenticate: createTestAuthenticator() });
  const headers = { authorization: `Test tenant=${tenant.tenant_id}; principal=${principal.principal_id}`, "content-type": "application/json" };
  const response = await gateway.fetch(new Request("https://sovereign.test/v1/control-plane/check-in", {
    method: "POST", headers,
    body: JSON.stringify({ objective: "Gateway test", context_appetite: "broad", actor: { provider: { key: "openai" }, surface: { key: "chatgpt", type: "chat" }, externalSessionId: "gateway-chat" } })
  }));
  assert.equal(response.status, 201);
  const session = await response.json();
  assert.equal(session.orientation.context_appetite, "broad");
  assert.equal(session.orientation.retrieval_is_actor_directed, true);

  const board = await gateway.fetch(new Request("https://sovereign.test/console/control-plane", { headers }));
  assert.equal(board.status, 200);
  assert.match(await board.text(), /Control Plane traffic board/);
});

test("the deployable Worker fails closed before Neon Auth is configured", async () => {
  const protectedResponse = await worker.fetch(new Request("https://sovereign.test/v1/control-plane/traffic"));
  assert.equal(protectedResponse.status, 503);
  const body = await protectedResponse.json();
  assert.equal(body.code, "auth_not_configured");
  assert.equal((await worker.fetch(new Request("https://sovereign.test/health"))).status, 200);
});
