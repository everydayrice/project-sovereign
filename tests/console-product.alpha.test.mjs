import assert from "node:assert/strict";
import test from "node:test";
import { createTestAuthenticator } from "../src/auth/authenticators.mjs";
import { createHttpGateway } from "../src/gateway/http-gateway.mjs";
import { createSovereignPlatform } from "../src/platform/sovereign-platform.mjs";

function fixture() {
  const platform = createSovereignPlatform();
  const tenant = platform.command.createTenant({ slug: "console-alpha", displayName: "Console Alpha", commandDisplayName: "Console Command" });
  const principal = platform.command.createPrincipal({ tenantId: tenant.tenant_id, displayName: "Owner" });
  const gateway = createHttpGateway({ platform, authenticate: createTestAuthenticator() });
  const headers = { authorization: `Test tenant=${tenant.tenant_id}; principal=${principal.principal_id}`, "content-type": "application/json" };
  return { platform, tenant, principal, gateway, headers };
}

async function request(gateway, path, { method = "GET", headers = {}, body } = {}) {
  return gateway.fetch(new Request(`https://sovereign.test${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }));
}

test("The public product shell is honest about unconfigured auth and the Console exposes the core modules", async () => {
  const ctx = fixture();
  const landing = await request(ctx.gateway, "/");
  assert.equal(landing.status, 200);
  assert.match(await landing.text(), /Persistent intelligence/);
  const signup = await request(ctx.gateway, "/signup");
  assert.match(await signup.text(), /Authentication is deliberately unavailable until Neon Auth is configured/);

  const consoleResponse = await request(ctx.gateway, "/console", { headers: ctx.headers });
  assert.equal(consoleResponse.status, 200);
  const consoleHtml = await consoleResponse.text();
  for (const label of ["Home", "Command", "Intelligence", "Control Plane", "Continuity", "Sources / Storage", "Integrations", "Extensions", "Audit / Health"]) assert.match(consoleHtml, new RegExp(label.replace("/", "\\/")));
  assert.match(consoleHtml, /Connect or upload a source to begin/);
  for (const [path, expected] of [["/console/command", "Workspace setup"], ["/console/integrations", "Available source connectors"], ["/console/extensions", "Extensions never grant themselves authority"], ["/console/sources", "Source registry"], ["/console/audit", "Recovery & trust"]]) {
    const view = await request(ctx.gateway, path, { headers: ctx.headers });
    assert.match(await view.text(), new RegExp(expected));
  }
});

test("The Gateway drives source, initialization, canonical review, and Console status through one verified tenant context", async () => {
  const ctx = fixture();
  const workspaceResponse = await request(ctx.gateway, "/v1/command/workspaces", { method: "POST", headers: ctx.headers, body: { slug: "product", display_name: "Product" } });
  assert.equal(workspaceResponse.status, 201);
  assert.equal((await workspaceResponse.json()).workspace.tenant_id, ctx.tenant.tenant_id);
  const uploadResponse = await request(ctx.gateway, "/v1/sources/uploads", {
    method: "POST", headers: ctx.headers, body: { file_name: "context.txt", mime_type: "text/plain", size_bytes: 12 }
  });
  assert.equal(uploadResponse.status, 201);
  const upload = await uploadResponse.json();
  assert.equal(upload.source.metadata.storage_state, "awaiting_object_store");

  const runResponse = await request(ctx.gateway, "/v1/initialization/runs", { method: "POST", headers: ctx.headers, body: { source_ids: [upload.source.source_id], scope: { project: "Sovereign" } } });
  const run = (await runResponse.json()).initialization_run;
  assert.equal(run.source_results.length, 1);
  const resultResponse = await request(ctx.gateway, `/v1/initialization/runs/${run.initialization_run_id}/sources/${upload.source.source_id}`, {
    method: "POST", headers: ctx.headers, body: { state: "complete", item_count: 1, inventoried_item_count: 1, analyzed_item_count: 1, candidate_count: 1 }
  });
  assert.equal(resultResponse.status, 200);
  const completeResponse = await request(ctx.gateway, `/v1/initialization/runs/${run.initialization_run_id}/complete`, { method: "POST", headers: ctx.headers });
  assert.equal((await completeResponse.json()).initialization_run.state, "completed");

  const changeResponse = await request(ctx.gateway, "/v1/intelligence/canonical/change-sets", {
    method: "POST", headers: ctx.headers, body: {
      title: "Save architecture", reason: "Owner review", operations: [{ type: "add", record: { record_type: "architecture", payload: { product: "Sovereign" }, scope: { project: "Sovereign" } } }]
    }
  });
  const pending = await changeResponse.json();
  assert.equal(pending.change_set.state, "pending_approval");
  const approval = await request(ctx.gateway, `/v1/intelligence/canonical/change-sets/${pending.change_set.canonical_change_set_id}/approve`, { method: "POST", headers: ctx.headers });
  assert.equal(approval.status, 200);
  const status = await request(ctx.gateway, "/v1/intelligence/canonical/status", { headers: ctx.headers });
  assert.equal((await status.json()).current_canonical_revision, 1);

  const intelligenceConsole = await request(ctx.gateway, "/console/intelligence", { headers: ctx.headers });
  assert.match(await intelligenceConsole.text(), /Canonical Intelligence/);
});

test("A test transport credential cannot invent a principal or cross a tenant boundary", async () => {
  const ctx = fixture();
  const missing = await request(ctx.gateway, "/v1/console/snapshot", { headers: { authorization: `Test tenant=${ctx.tenant.tenant_id}; principal=prn_missing` } });
  assert.equal(missing.status, 404);
  const other = ctx.platform.command.createTenant({ slug: "console-other", displayName: "Other", commandDisplayName: "Command" });
  const crossTenant = await request(ctx.gateway, "/v1/console/snapshot", { headers: { authorization: `Test tenant=${other.tenant_id}; principal=${ctx.principal.principal_id}` } });
  assert.equal(crossTenant.status, 404);
});
