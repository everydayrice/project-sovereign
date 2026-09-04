import assert from "node:assert/strict";
import test from "node:test";
import { createSovereignPlatform } from "../src/platform/sovereign-platform.mjs";
import { approveCandidateChangeSet, proposeCandidateForCanon, rejectCandidate } from "../src/intelligence/candidate-review.mjs";

test("Candidate Intelligence requires proposal then explicit approval before becoming canonical", () => {
  const platform = createSovereignPlatform();
  const tenant = platform.command.createTenant({ slug: "canon-review", displayName: "Canon Review" });
  const principal = platform.command.createPrincipal({ tenantId: tenant.tenant_id, displayName: "Owner" });

  const candidate = platform.intelligence.createCandidate({
    tenantId: tenant.tenant_id,
    principalId: principal.principal_id,
    recordType: "fact",
    payload: { statement: "ORBIT TEST has status: ACTIVE." },
    confidence: "high"
  });

  const proposal = proposeCandidateForCanon({
    platform,
    tenantId: tenant.tenant_id,
    principalId: principal.principal_id,
    candidateId: candidate.candidate_intelligence_id
  });

  assert.equal(proposal.candidate.state, "under_review");
  assert.equal(proposal.change_set.state, "pending_approval");
  assert.equal(platform.intelligence.canonicalStatus({ tenantId: tenant.tenant_id }).current_canonical_revision, 0);
  assert.equal(platform.intelligence.listRecords({ tenantId: tenant.tenant_id }).length, 0);

  const applied = approveCandidateChangeSet({
    platform,
    tenantId: tenant.tenant_id,
    principalId: principal.principal_id,
    changeSetId: proposal.change_set.canonical_change_set_id
  });

  assert.equal(applied.candidate.state, "accepted");
  assert.equal(applied.candidate.accepted_canonical_revision, 1);
  assert.equal(applied.change_set.state, "applied");
  assert.equal(applied.canonical_revision, 1);
  assert.equal(platform.intelligence.canonicalStatus({ tenantId: tenant.tenant_id }).current_canonical_revision, 1);
  const records = platform.intelligence.listRecords({ tenantId: tenant.tenant_id });
  assert.equal(records.length, 1);
  assert.equal(records[0].payload.statement, "ORBIT TEST has status: ACTIVE.");
});

test("Candidate Intelligence can be explicitly rejected without changing canon", () => {
  const platform = createSovereignPlatform();
  const tenant = platform.command.createTenant({ slug: "candidate-reject", displayName: "Candidate Reject" });
  const principal = platform.command.createPrincipal({ tenantId: tenant.tenant_id, displayName: "Owner" });
  const candidate = platform.intelligence.createCandidate({
    tenantId: tenant.tenant_id,
    principalId: principal.principal_id,
    recordType: "constraint",
    payload: { statement: "Synthetic constraint." }
  });

  const rejected = rejectCandidate({
    platform,
    tenantId: tenant.tenant_id,
    candidateId: candidate.candidate_intelligence_id,
    reason: "Not canonical test data."
  });

  assert.equal(rejected.state, "rejected");
  assert.equal(rejected.rejection_reason, "Not canonical test data.");
  assert.equal(platform.intelligence.canonicalStatus({ tenantId: tenant.tenant_id }).current_canonical_revision, 0);
  assert.equal(platform.intelligence.listRecords({ tenantId: tenant.tenant_id }).length, 0);
});
