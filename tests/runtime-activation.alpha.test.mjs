import assert from "node:assert/strict";
import test from "node:test";
import { InMemorySovereignStore } from "../src/platform/store.mjs";
import { createSovereignPlatform } from "../src/platform/sovereign-platform.mjs";
import { createHttpGateway } from "../src/gateway/http-gateway.mjs";
import { createTestAuthenticator } from "../src/auth/authenticators.mjs";
import { createNeonSessionAuthenticator, proxyNeonAuth } from "../src/auth/neon-session-auth.mjs";
import { R2FileService, objectKey } from "../src/files/r2-file-service.mjs";

test("tenant state serializes and hydrates without losing durable module state", () => {
  const first = createSovereignPlatform();
  const tenant = first.command.createTenant({ slug: "runtime-test", displayName: "Runtime Test" });
  const principal = first.command.createPrincipal({ tenantId: tenant.tenant_id, displayName: "Owner", authSubjectReference: "usr_runtime" });
  first.command.createWorkspace({ tenantId: tenant.tenant_id, principalId: principal.principal_id, slug: "main", displayName: "Main" });
  first.continuity.createTaskCapsule({ tenantId: tenant.tenant_id, principalId: principal.principal_id, ownerPrincipalId: principal.principal_id, title: "Persist me", objective: "Survive isolate restart" });

  const serialized = first.store.exportState();
  assert.equal(serialized.connectorDefinitions, undefined);

  const restoredStore = new InMemorySovereignStore().importState(serialized);
  const restored = createSovereignPlatform({ store: restoredStore });
  assert.equal(restored.command.requirePrincipal(tenant.tenant_id, principal.principal_id).display_name, "Owner");
  assert.equal(restored.store.list("taskCapsules").length, 1);
  assert.ok(restored.sources.listConnectorDefinitions().length > 0);
});

test("Neon session authentication derives the auth subject from a verified session response", async () => {
  let requestedUrl;
  let requestedCookie;
  const authenticate = createNeonSessionAuthenticator({
    baseUrl: "https://auth.example.test/neondb/auth",
    fetchImpl: async (url, init) => {
      requestedUrl = url;
      requestedCookie = init.headers.cookie;
      return Response.json({ session: { id: "ses_1" }, user: { id: "usr_1", name: "RICE" } });
    }
  });
  const result = await authenticate(new Request("https://sovereign.test/v1/console/snapshot", { headers: { cookie: "session=abc" } }));
  assert.equal(requestedUrl, "https://auth.example.test/neondb/auth/get-session");
  assert.equal(requestedCookie, "session=abc");
  assert.equal(result.authSubject, "usr_1");
  assert.equal(result.user.name, "RICE");
});

test("Neon Auth proxy rewrites upstream cookies onto the Sovereign origin", async () => {
  const response = await proxyNeonAuth(new Request("https://sovereign.test/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "person@example.test", password: "secret" })
  }), {
    baseUrl: "https://auth.example.test/neondb/auth",
    fetchImpl: async () => new Response("{}", {
      status: 200,
      headers: { "set-cookie": "neon.session=abc; Domain=auth.example.test; Path=/neondb/auth; HttpOnly; Secure; SameSite=Lax" }
    })
  });
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie.includes("neon.session=abc"));
  assert.ok(!/Domain=/i.test(cookie));
  assert.match(cookie, /Path=\//i);
});

test("an authenticated but unbound user can bootstrap a tenant and principal", async () => {
  let finalized;
  const gateway = createHttpGateway({
    platform: createSovereignPlatform(),
    authenticate: async () => ({ authSubject: "usr_bootstrap", user: { id: "usr_bootstrap", name: "RICE" }, permissions: ["control_plane.use"] }),
    prepareRequest: async ({ auth }) => ({ platform: createSovereignPlatform(), auth: { ...auth, onboarding: true } }),
    finalizeRequest: async (context) => { finalized = context; }
  });

  const response = await gateway.fetch(new Request("https://sovereign.test/v1/bootstrap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug: "rice", display_name: "RICE", command_display_name: "RICE COMMAND" })
  }));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.tenant.slug, "rice");
  assert.equal(body.tenant.command_display_name, "RICE COMMAND");
  assert.equal(body.principal.auth_subject_reference, "usr_bootstrap");
  assert.equal(finalized.auth.bootstrap.tenant.tenant_id, body.tenant.tenant_id);
  assert.equal(finalized.auth.bootstrap.workspace.slug, "main");
});

test("R2 file service uses tenant-scoped deterministic object keys", async () => {
  let saved;
  const bucket = {
    async put(key, body, options) {
      saved = { key, body, options };
      return { version: "v1", etag: "etag-1", size: 5 };
    }
  };
  const files = new R2FileService({ bucket });
  const result = await files.put({ tenantId: "ten_1", sourceId: "src_1", sourceItemId: "sri_1", body: "hello", contentType: "text/plain", contentLength: 5 });
  assert.equal(saved.key, objectKey({ tenantId: "ten_1", sourceId: "src_1", sourceItemId: "sri_1" }));
  assert.equal(saved.options.customMetadata.tenant_id, "ten_1");
  assert.equal(result.version, "v1");
});

test("Gateway writes uploaded source content through R2 and records the object locator", async () => {
  const platform = createSovereignPlatform();
  const tenant = platform.command.createTenant({ slug: "r2-gateway", displayName: "R2 Gateway" });
  const principal = platform.command.createPrincipal({ tenantId: tenant.tenant_id, displayName: "Owner" });
  const source = platform.sources.createManagedUpload({ tenantId: tenant.tenant_id, principalId: principal.principal_id, fileName: "brief.txt", mimeType: "text/plain", sizeBytes: 5 });
  const item = platform.store.list("sourceItems", (candidate) => candidate.source_id === source.source_id)[0];
  const files = {
    async put(input) {
      assert.equal(input.sourceItemId, item.source_item_id);
      return { object_key: "tenants/t/sources/s/items/i", version: "v1", size: 5 };
    }
  };
  const gateway = createHttpGateway({ platform, authenticate: createTestAuthenticator(), files });
  const response = await gateway.fetch(new Request(`https://sovereign.test/v1/sources/${source.source_id}/items/${item.source_item_id}/content`, {
    method: "PUT",
    headers: {
      authorization: `Test tenant=${tenant.tenant_id}; principal=${principal.principal_id}`,
      "content-type": "text/plain",
      "content-length": "5"
    },
    body: "hello"
  }));
  assert.equal(response.status, 201);
  const stored = platform.sources.getSourceItem(tenant.tenant_id, item.source_item_id);
  assert.equal(stored.storage_state, "stored");
  assert.equal(stored.r2_object_key, "tenants/t/sources/s/items/i");
});
