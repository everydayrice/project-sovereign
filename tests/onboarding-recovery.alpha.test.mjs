import assert from "node:assert/strict";
import test from "node:test";
import { createSovereignPlatform } from "../src/platform/sovereign-platform.mjs";

function fixture() {
  const platform = createSovereignPlatform();
  const tenant = platform.command.createTenant({ slug: "onboarding-alpha", displayName: "Onboarding Alpha", commandDisplayName: "Command" });
  const principal = platform.command.createPrincipal({ tenantId: tenant.tenant_id, displayName: "Owner" });
  return { platform, tenant, principal };
}

test("Source connection, inventory, and initialization report coverage honestly", () => {
  const ctx = fixture();
  const oauthSource = ctx.platform.sources.createSource({
    tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, connectorKey: "google_drive",
    displayName: "Company Drive", locator: "gdrive://company/root"
  });
  assert.equal(oauthSource.connection_state, "authorization_required");
  assert.equal(oauthSource.processing_state, "connected");
  assert.throws(() => ctx.platform.sources.recordInventory({ tenantId: ctx.tenant.tenant_id, sourceId: oauthSource.source_id, items: [] }), (error) => error.code === "source_unavailable");

  const plan = ctx.platform.sources.createManagedUpload({
    tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, fileName: "plan.pdf", mimeType: "application/pdf", sizeBytes: 104
  });
  const notes = ctx.platform.sources.createManagedUpload({
    tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, fileName: "notes.txt", mimeType: "text/plain", sizeBytes: 48
  });
  assert.equal(plan.metadata.storage_state, "awaiting_object_store");
  assert.equal(plan.processing_state, "inventoried");

  const initial = ctx.platform.initialization.start({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, sourceIds: [plan.source_id, notes.source_id], scope: { project: "Sovereign" } });
  ctx.platform.initialization.recordSourceResult({ tenantId: ctx.tenant.tenant_id, runId: initial.initialization_run_id, sourceId: plan.source_id, state: "complete", itemCount: 1, inventoriedItemCount: 1, analyzedItemCount: 1, candidateCount: 3 });
  ctx.platform.initialization.recordSourceResult({ tenantId: ctx.tenant.tenant_id, runId: initial.initialization_run_id, sourceId: notes.source_id, state: "partial", itemCount: 1, inventoriedItemCount: 1, analyzedItemCount: 0, candidateCount: 1, failureReason: "Encrypted attachment omitted." });
  const completed = ctx.platform.initialization.complete({ tenantId: ctx.tenant.tenant_id, runId: initial.initialization_run_id });
  assert.equal(completed.state, "partial");
  assert.deepEqual(completed.coverage, {
    sources_selected: 2, sources_completed: 1, sources_partial: 1, sources_failed: 0, sources_blocked: 0, sources_pending: 0,
    items_discovered: 2, items_inventoried: 2, items_analyzed: 1, candidates_extracted: 4, intentionally_excluded: 0
  });
  assert.equal(ctx.platform.sources.sourceHealth(ctx.tenant.tenant_id).partial, 1);

  const scopedRetry = ctx.platform.initialization.start({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, sourceIds: [notes.source_id], mode: "study", scope: { project: "Sovereign", source: "notes" } });
  assert.equal(scopedRetry.source_results.length, 1);
  assert.equal(scopedRetry.coverage.sources_selected, 1);

  const failure = ctx.platform.sources.markFailed({ tenantId: ctx.tenant.tenant_id, sourceId: plan.source_id, reason: "Object retrieval failed." });
  assert.equal(failure.currentness, "stale");
  const health = ctx.platform.sources.sourceHealth(ctx.tenant.tenant_id);
  assert.equal(health.failed, 1);
  assert.equal(health.stale, 1);
  assert.notEqual(health.sources.find((source) => source.source_id === plan.source_id).currentness, "current");
});

test("Trust recovery snapshots state, preserves history, and records a bounded improvement candidate", () => {
  const ctx = fixture();
  const proposed = ctx.platform.intelligence.proposeChangeSet({
    tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, title: "Initial understanding", reason: "Owner reviewed evidence.",
    operations: [{ type: "add", record: { recordType: "fact", payload: { company: "Example" }, scope: { organization: "Example" } } }]
  });
  ctx.platform.intelligence.approveChangeSet({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, changeSetId: proposed.change_set.canonical_change_set_id });
  const before = ctx.platform.intelligence.canonicalStatus({ tenantId: ctx.tenant.tenant_id });

  const recovery = ctx.platform.recovery.start({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, scope: { organization: "Example" }, reason: "I do not trust this summary." });
  assert.equal(recovery.state, "active");
  assert.equal(recovery.risky_canonical_automation_paused, true);
  assert.equal(recovery.canonical_snapshot_revision, before.current_canonical_revision);
  assert.equal(ctx.platform.intelligence.canonicalStatus({ tenantId: ctx.tenant.tenant_id }).current_canonical_revision, before.current_canonical_revision);
  assert.equal(ctx.platform.intelligence.listRecords({ tenantId: ctx.tenant.tenant_id }).length, 1);
  assert.ok(recovery.findings.repair_options.includes("revert_canonical_change_set"));
  assert.equal(ctx.platform.improvement.health(ctx.tenant.tenant_id).corrections, 1);

  const closed = ctx.platform.recovery.complete({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, recoverySessionId: recovery.recovery_session_id, summary: "Evidence reviewed; retain current record." });
  assert.equal(closed.state, "completed");
  assert.equal(closed.risky_canonical_automation_paused, false);
  assert.equal(ctx.platform.intelligence.canonicalStatus({ tenantId: ctx.tenant.tenant_id }).current_canonical_revision, before.current_canonical_revision);
});
