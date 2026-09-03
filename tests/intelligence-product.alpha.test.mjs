import assert from "node:assert/strict";
import test from "node:test";
import { createSovereignPlatform } from "../src/platform/sovereign-platform.mjs";

function fixture() {
  const platform = createSovereignPlatform();
  const tenant = platform.command.createTenant({ slug: "intelligence-alpha", displayName: "Intelligence Alpha", commandDisplayName: "Command" });
  const principal = platform.command.createPrincipal({ tenantId: tenant.tenant_id, displayName: "Owner" });
  return { platform, tenant, principal };
}

function proposal(ctx, operations, title = "Architecture update") {
  return ctx.platform.intelligence.proposeChangeSet({
    tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, title, reason: "Verified implementation evidence.", operations
  });
}

test("Canonical Intelligence keeps revisions, approvals, supersession, and reverts as non-destructive history", () => {
  const ctx = fixture();
  const proposed = proposal(ctx, [{ type: "add", record: { record_type: "architecture", payload: { runtime: "Worker" }, authority_level: "approved", scope: { project: "Sovereign" } } }], "Establish runtime");
  assert.equal(proposed.change_set.state, "pending_approval");
  assert.equal(ctx.platform.intelligence.listRecords({ tenantId: ctx.tenant.tenant_id }).length, 0);

  const applied = ctx.platform.intelligence.approveChangeSet({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, changeSetId: proposed.change_set.canonical_change_set_id });
  const recordId = applied.change_set.affected_record_ids[0];
  assert.equal(applied.canonical_revision, 1);
  assert.equal(applied.canonical_checkpoint.canonical_revision, 1);
  assert.equal(ctx.platform.intelligence.getRecord({ tenantId: ctx.tenant.tenant_id, recordId }).record.payload.runtime, "Worker");

  const update = proposal(ctx, [{ type: "update", record_id: recordId, patch: { payload: { runtime: "Worker + Neon" }, authority_level: "verified" } }], "Clarify runtime");
  ctx.platform.intelligence.approveChangeSet({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, changeSetId: update.change_set.canonical_change_set_id });
  let historical = ctx.platform.intelligence.getRecord({ tenantId: ctx.tenant.tenant_id, recordId });
  assert.equal(historical.revisions.length, 2);
  assert.equal(historical.revisions.at(-1).after_snapshot.payload.runtime, "Worker");
  assert.equal(historical.record.payload.runtime, "Worker + Neon");

  const reverted = ctx.platform.intelligence.revertChangeSet({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, changeSetId: update.change_set.canonical_change_set_id, title: "Revert wording" });
  assert.equal(reverted.state, "pending_approval");
  assert.equal(ctx.platform.intelligence.getChangeSet(ctx.tenant.tenant_id, update.change_set.canonical_change_set_id).change_set.state, "applied");
  ctx.platform.intelligence.approveChangeSet({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, changeSetId: reverted.canonical_change_set_id });
  historical = ctx.platform.intelligence.getRecord({ tenantId: ctx.tenant.tenant_id, recordId });
  assert.equal(historical.record.payload.runtime, "Worker");
  assert.ok(historical.revisions.length >= 3);

  const supersede = proposal(ctx, [{ type: "supersede", record_id: recordId, replacement: { record_type: "architecture", payload: { runtime: "Dedicated Worker + Neon" }, scope: { project: "Sovereign" } } }], "Supersede runtime wording");
  const superseded = ctx.platform.intelligence.approveChangeSet({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, changeSetId: supersede.change_set.canonical_change_set_id });
  const replacementId = superseded.change_set.affected_record_ids[1];
  assert.equal(ctx.platform.intelligence.getRecord({ tenantId: ctx.tenant.tenant_id, recordId }).record.lifecycle_state, "superseded");
  assert.equal(ctx.platform.intelligence.getRecord({ tenantId: ctx.tenant.tenant_id, recordId: replacementId }).record.lifecycle_state, "active");
  assert.equal(ctx.platform.intelligence.listRecords({ tenantId: ctx.tenant.tenant_id }).length, 1);
  assert.throws(() => ctx.platform.intelligence.revertChangeSet({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, changeSetId: update.change_set.canonical_change_set_id }), (error) => error.code === "revert_requires_reconciliation");
});

test("Pending Canonical Change Sets are isolated by tenant and can be rejected without mutating canonical state", () => {
  const ctx = fixture();
  const pending = proposal(ctx, [{ type: "add", record: { recordType: "fact", payload: { key: "private" } } }]);
  const otherTenant = ctx.platform.command.createTenant({ slug: "other-intelligence", displayName: "Other", commandDisplayName: "Command" });
  const otherPrincipal = ctx.platform.command.createPrincipal({ tenantId: otherTenant.tenant_id, displayName: "Other owner" });
  assert.throws(() => ctx.platform.intelligence.approveChangeSet({ tenantId: otherTenant.tenant_id, principalId: otherPrincipal.principal_id, changeSetId: pending.change_set.canonical_change_set_id }), (error) => error.code === "not_found");
  const rejected = ctx.platform.intelligence.rejectChangeSet({ tenantId: ctx.tenant.tenant_id, principalId: ctx.principal.principal_id, changeSetId: pending.change_set.canonical_change_set_id, reason: "Not ready" });
  assert.equal(rejected.state, "rejected");
  const status = ctx.platform.intelligence.canonicalStatus({ tenantId: ctx.tenant.tenant_id });
  assert.equal(status.current_canonical_revision, 0);
  assert.equal(status.pending_change_sets.length, 0);
  assert.equal(ctx.platform.intelligence.listRecords({ tenantId: ctx.tenant.tenant_id }).length, 0);
});
