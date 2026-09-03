import assert from "node:assert/strict";
import test from "node:test";
import { createSovereignPlatform } from "../src/platform/sovereign-platform.mjs";

function fixture({ leaseTtlSeconds = 300 } = {}) {
  let now = new Date("2026-09-03T12:00:00.000Z");
  const platform = createSovereignPlatform({ clock: () => new Date(now), trafficPolicy: { leaseTtlSeconds } });
  const tenant = platform.command.createTenant({ slug: "alpha-tenant", displayName: "Alpha Tenant", commandDisplayName: "Alpha Command" });
  const principal = platform.command.createPrincipal({ tenantId: tenant.tenant_id, displayName: "Owner" });
  return {
    platform, tenant, principal,
    advance(seconds) { now = new Date(now.getTime() + seconds * 1000); }
  };
}

function checkIn(ctx, { conversation, surface = "chatgpt", surfaceType = "chat", objective = "Perform substantive work", taskCapsuleId, parentTrafficSessionId, contextAppetite = "standard" } = {}) {
  return ctx.platform.traffic.checkIn({
    tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id,
    actor: { provider: { key: "openai", displayName: "OpenAI", accountReference: "owner-account" }, surface: { key: surface, displayName: surface, type: surfaceType }, externalSessionId: conversation, modelMetadata: { model: "same-model" } },
    objective, taskCapsuleId, parentTrafficSessionId, contextAppetite
  });
}

const repo = { type: "repository", authority: "github", locator: "github://example/repo" };
const worker = { type: "worker", authority: "cloudflare", locator: "cloudflare://example/service" };
const database = { type: "database", authority: "neon", locator: "neon://example/project" };

function declareAndActivate(ctx, session, resource, intent, scope) {
  const declared = ctx.platform.traffic.declareClaim({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, trafficSessionId: session.traffic_session.traffic_session_id, resource, intent, scope });
  const activated = ctx.platform.traffic.activateClaim({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, resourceClaimId: declared.claim.resource_claim_id });
  return { declared, activated };
}

test("six simultaneous chats using the same provider/account/model are six Actor Instances", () => {
  const ctx = fixture();
  const sessions = Array.from({ length: 6 }, (_, index) => checkIn(ctx, { conversation: `chat-${index + 1}`, objective: `Task ${index + 1}` }));
  const actorIds = new Set(sessions.map((session) => session.actor_instance.actor_instance_id));
  assert.equal(actorIds.size, 6);
  assert.equal(new Set(sessions.map((session) => session.actor_instance.provider.provider_id)).size, 1);
  assert.equal(new Set(sessions.map((session) => session.actor_instance.model_metadata.model)).size, 1);
  assert.equal(ctx.platform.traffic.trafficBoard({ tenantId: ctx.tenant.tenant_id }).active_session_count, 6);
});

test("overlapping repository reads coexist without a lock", () => {
  const ctx = fixture();
  const left = checkIn(ctx, { conversation: "read-a" });
  const right = checkIn(ctx, { conversation: "read-b" });
  const first = declareAndActivate(ctx, left, repo, "read", { branch: "main", paths: ["src"] });
  const second = declareAndActivate(ctx, right, repo, "read", { branch: "main", paths: ["src"] });
  assert.equal(first.declared.evaluation.disposition, "safe");
  assert.equal(second.declared.evaluation.disposition, "safe");
  assert.equal(ctx.platform.traffic.currentTraffic({ tenantId: ctx.tenant.tenant_id, resource: repo }).length, 2);
});

test("separate branch writes to non-overlapping paths coexist", () => {
  const ctx = fixture();
  const left = checkIn(ctx, { conversation: "branch-a" });
  const right = checkIn(ctx, { conversation: "branch-b" });
  declareAndActivate(ctx, left, repo, "write", { branch: "feature/a", paths: ["src/a"] });
  const second = declareAndActivate(ctx, right, repo, "write", { branch: "feature/b", paths: ["src/b"] });
  assert.equal(second.declared.evaluation.disposition, "safe");
});

test("likely overlapping writes on separate branches surface a caution", () => {
  const ctx = fixture();
  const left = checkIn(ctx, { conversation: "overlap-a" });
  const right = checkIn(ctx, { conversation: "overlap-b" });
  declareAndActivate(ctx, left, repo, "write", { branch: "feature/auth-a", paths: ["src/auth"] });
  const second = declareAndActivate(ctx, right, repo, "write", { branch: "feature/auth-b", paths: ["src/auth/login"] });
  assert.equal(second.declared.evaluation.disposition, "caution");
  assert.equal(second.activated.claim.state, "active");
});

test("same-branch writes require approval/exclusivity", () => {
  const ctx = fixture();
  const left = checkIn(ctx, { conversation: "main-a" });
  const right = checkIn(ctx, { conversation: "main-b" });
  declareAndActivate(ctx, left, repo, "write", { branch: "main", paths: ["src/app"] });
  const declared = ctx.platform.traffic.declareClaim({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, trafficSessionId: right.traffic_session.traffic_session_id, resource: repo, intent: "write", scope: { branch: "main", paths: ["src/other"] } });
  assert.equal(declared.evaluation.disposition, "approval_required");
  assert.throws(() => ctx.platform.traffic.activateClaim({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, resourceClaimId: declared.claim.resource_claim_id }), (error) => error.code === "approval_required");
});

test("a planned claim is re-evaluated when it becomes active", () => {
  const ctx = fixture();
  const planner = checkIn(ctx, { conversation: "planner" });
  const implementer = checkIn(ctx, { conversation: "implementer" });
  const planned = ctx.platform.traffic.declareClaim({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, trafficSessionId: planner.traffic_session.traffic_session_id, resource: repo, intent: "write", scope: { branch: "main", paths: ["src/auth"] } });
  assert.equal(planned.evaluation.disposition, "safe");
  declareAndActivate(ctx, implementer, repo, "write", { branch: "main", paths: ["src/auth"] });
  assert.throws(() => ctx.platform.traffic.activateClaim({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, resourceClaimId: planned.claim.resource_claim_id }), (error) => error.code === "approval_required");
});

test("production deployment claims are exclusive at the same environment", () => {
  const ctx = fixture();
  const left = checkIn(ctx, { conversation: "deploy-a" });
  const right = checkIn(ctx, { conversation: "deploy-b" });
  declareAndActivate(ctx, left, worker, "deploy", { environment: "production" });
  const second = ctx.platform.traffic.declareClaim({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, trafficSessionId: right.traffic_session.traffic_session_id, resource: worker, intent: "deploy", scope: { environment: "production" } });
  assert.equal(second.evaluation.disposition, "approval_required");
  const independentEnvironment = declareAndActivate(ctx, right, worker, "deploy", { environment: "staging" });
  assert.equal(independentEnvironment.declared.evaluation.disposition, "safe");
});

test("database migrations are exclusive only for the same target schema", () => {
  const ctx = fixture();
  const left = checkIn(ctx, { conversation: "migration-a" });
  const right = checkIn(ctx, { conversation: "migration-b" });
  declareAndActivate(ctx, left, database, "migrate", { database: "app", schema: "public" });
  const sameSchema = ctx.platform.traffic.declareClaim({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, trafficSessionId: right.traffic_session.traffic_session_id, resource: database, intent: "migrate", scope: { database: "app", schema: "public" } });
  assert.equal(sameSchema.evaluation.disposition, "approval_required");
  const otherSchema = declareAndActivate(ctx, right, database, "migrate", { database: "app", schema: "analytics" });
  assert.equal(otherSchema.declared.evaluation.disposition, "safe");
});

test("crashed actors become stale instead of completed and do not lock forever", () => {
  const ctx = fixture({ leaseTtlSeconds: 10 });
  const disappeared = checkIn(ctx, { conversation: "disappeared" });
  const claim = declareAndActivate(ctx, disappeared, repo, "write", { branch: "main", paths: ["src"] }).activated.claim;
  ctx.advance(11);
  const board = ctx.platform.traffic.trafficBoard({ tenantId: ctx.tenant.tenant_id });
  assert.equal(ctx.platform.store.get("trafficSessions", disappeared.traffic_session.traffic_session_id).state, "stale");
  assert.equal(ctx.platform.store.get("resourceClaims", claim.resource_claim_id).state, "stale");
  assert.equal(board.claims[0].state, "stale");
  const successor = checkIn(ctx, { conversation: "successor" });
  const proposed = ctx.platform.traffic.declareClaim({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, trafficSessionId: successor.traffic_session.traffic_session_id, resource: repo, intent: "write", scope: { branch: "main", paths: ["src"] } });
  assert.equal(proposed.evaluation.disposition, "caution");
});

test("heartbeat renews a live session and its claims", () => {
  const ctx = fixture({ leaseTtlSeconds: 10 });
  const session = checkIn(ctx, { conversation: "heartbeat" });
  const claim = declareAndActivate(ctx, session, repo, "write", { branch: "feature/heartbeat", paths: ["src"] }).activated.claim;
  ctx.advance(9);
  const renewed = ctx.platform.traffic.heartbeat({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, trafficSessionId: session.traffic_session.traffic_session_id });
  ctx.advance(2);
  ctx.platform.traffic.trafficBoard({ tenantId: ctx.tenant.tenant_id });
  assert.equal(ctx.platform.store.get("trafficSessions", session.traffic_session.traffic_session_id).state, "active");
  assert.equal(ctx.platform.store.get("resourceClaims", claim.resource_claim_id).state, "active");
  assert.ok(new Date(renewed.lease_expires_at) > new Date("2026-09-03T12:00:10.000Z"));
});

test("checkout releases claims and preserves outcome artifacts without completing its Task Capsule", () => {
  const ctx = fixture();
  const task = ctx.platform.continuity.createTaskCapsule({ tenantId: ctx.tenant.tenant_id, ownerPrincipalId: ctx.principal.principal_id, title: "Implement alpha", objective: "Complete vertical slice" });
  const session = checkIn(ctx, { conversation: "checkout", taskCapsuleId: task.task_capsule_id });
  declareAndActivate(ctx, session, repo, "write", { branch: "feature/checkout", paths: ["src"] });
  const completed = ctx.platform.traffic.checkout({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, trafficSessionId: session.traffic_session.traffic_session_id, artifactReferences: ["commit:abc123"], nextAction: "Open review" });
  assert.equal(completed.state, "completed");
  assert.deepEqual(completed.outcome.artifact_references, ["commit:abc123"]);
  assert.equal(ctx.platform.traffic.currentTraffic({ tenantId: ctx.tenant.tenant_id, resource: repo }).length, 0);
  assert.equal(ctx.platform.continuity.requireTask(ctx.tenant.tenant_id, task.task_capsule_id).state, "active");
});

test("ChatGPT-like session hands off structured state to a distinct Codex-like session and back", () => {
  const ctx = fixture();
  const task = ctx.platform.continuity.createTaskCapsule({ tenantId: ctx.tenant.tenant_id, ownerPrincipalId: ctx.principal.principal_id, title: "Bridge task", objective: "Implement schema" });
  const chat = checkIn(ctx, { conversation: "chat-planner", taskCapsuleId: task.task_capsule_id, objective: "Design implementation" });
  ctx.platform.traffic.checkpoint({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, trafficSessionId: chat.traffic_session.traffic_session_id, summary: "Implementation direction approved.", nextAction: "Codex implements", artifactReferences: ["decision:alpha-direction"] });
  const handoff = ctx.platform.traffic.handoff({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, trafficSessionId: chat.traffic_session.traffic_session_id, taskCapsuleId: task.task_capsule_id, summary: "Implement the approved direction.", nextAction: "Run tests" });
  const codex = checkIn(ctx, { conversation: "codex-run-1", surface: "codex", surfaceType: "coding", taskCapsuleId: task.task_capsule_id, parentTrafficSessionId: chat.traffic_session.traffic_session_id, objective: "Implement schema" });
  ctx.platform.continuity.acceptHandoff({ tenantId: ctx.tenant.tenant_id, handoffId: handoff.handoff_id, actorInstanceId: codex.actor_instance.actor_instance_id });
  assert.notEqual(codex.actor_instance.actor_instance_id, chat.actor_instance.actor_instance_id);
  assert.equal(codex.orientation.continuity_pointers[0], task.task_capsule_id);
  assert.ok(codex.orientation.recent_checkpoints.some((checkpoint) => checkpoint.summary.includes("Implementation direction")));
  ctx.platform.traffic.checkpoint({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, trafficSessionId: codex.traffic_session.traffic_session_id, summary: "Implementation complete and verified.", artifactReferences: ["commit:codex123"] });
  ctx.platform.traffic.checkout({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, trafficSessionId: codex.traffic_session.traffic_session_id, artifactReferences: ["commit:codex123"] });
  const returnToChat = checkIn(ctx, { conversation: "chat-planner", taskCapsuleId: task.task_capsule_id, objective: "Review Codex result" });
  assert.ok(returnToChat.orientation.recent_checkpoints.some((checkpoint) => checkpoint.artifact_references.includes("commit:codex123")));
});

test("tenant boundaries prevent traffic visibility and session control across tenants", () => {
  const ctx = fixture();
  const active = checkIn(ctx, { conversation: "tenant-a" });
  declareAndActivate(ctx, active, repo, "write", { branch: "main", paths: ["src"] });
  const otherTenant = ctx.platform.command.createTenant({ slug: "other-tenant", displayName: "Other", commandDisplayName: "Other Command" });
  const otherPrincipal = ctx.platform.command.createPrincipal({ tenantId: otherTenant.tenant_id, displayName: "Other owner" });
  assert.equal(ctx.platform.traffic.currentTraffic({ tenantId: otherTenant.tenant_id, resource: repo }).length, 0);
  assert.throws(() => ctx.platform.traffic.heartbeat({ tenantId: otherTenant.tenant_id, principalId: otherPrincipal.principal_id, trafficSessionId: active.traffic_session.traffic_session_id }), (error) => error.code === "not_found");
});

test("extensions receive only granted scopes and lose access immediately on revocation", () => {
  const ctx = fixture();
  const installed = ctx.platform.extensions.install({
    tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id,
    manifest: { manifest_version: 1, id: "example.queue", name: "Queue", publisher: "Example", version: "0.1.0", sovereign: { compatibility: ">=0.2.0", requested_scopes: ["continuity.tasks.read", "control_plane.traffic.read"] }, privacy: { retention_behavior: "none", uninstall_behavior: "revoke" } },
    grantedScopes: ["continuity.tasks.read"]
  });
  assert.ok(ctx.platform.extensions.assertScope({ tenantId: ctx.tenant.tenant_id, extensionId: installed.extension.extension_id, scope: "continuity.tasks.read" }));
  assert.throws(() => ctx.platform.extensions.assertScope({ tenantId: ctx.tenant.tenant_id, extensionId: installed.extension.extension_id, scope: "control_plane.traffic.read" }), (error) => error.code === "extension_scope_denied");
  ctx.platform.extensions.revoke({ tenantId: ctx.tenant.tenant_id, extensionId: installed.extension.extension_id });
  assert.throws(() => ctx.platform.extensions.assertScope({ tenantId: ctx.tenant.tenant_id, extensionId: installed.extension.extension_id, scope: "continuity.tasks.read" }), (error) => error.code === "extension_access_revoked");
});

test("an actor selects deep context appetite; Control Plane returns routes and pointers, not hidden context rationing", () => {
  const ctx = fixture();
  const session = checkIn(ctx, { conversation: "deep-context", contextAppetite: "deep", objective: "Conduct deep review" });
  assert.equal(session.orientation.context_appetite, "deep");
  assert.equal(session.orientation.retrieval_is_actor_directed, true);
  assert.ok(session.orientation.available_routes.includes("intelligence.search"));
  assert.equal(Object.hasOwn(session.orientation, "canonical_records"), false);
});
