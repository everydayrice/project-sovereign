import { SovereignError } from "../platform/errors.mjs";

export function proposeCandidateForCanon({ platform, tenantId, principalId, candidateId }) {
  const candidate = platform.store.requireTenant("candidateIntelligence", candidateId, tenantId);
  if (candidate.state !== "proposed") {
    throw new SovereignError("candidate_not_proposed", "Only a proposed Candidate Intelligence record can enter canonical review.", { status: 409 });
  }

  const proposal = platform.intelligence.proposeChangeSet({
    tenantId,
    principalId,
    title: `Canonize ${candidate.record_type} candidate`,
    reason: `Promote reviewed Candidate Intelligence ${candidateId}.`,
    operations: [{
      type: "add",
      record: {
        recordType: candidate.record_type,
        payload: candidate.payload,
        scope: candidate.scope ?? {},
        authorityLevel: "provisional",
        provenance: candidate.provenance ?? [],
        sourceIds: candidate.source_ids ?? [],
        confidence: candidate.confidence ?? "medium",
        dataClassification: "internal"
      }
    }],
    requiresApproval: true,
    initiator: "candidate_review",
    scope: candidate.scope ?? {},
    confidence: candidate.confidence ?? "medium",
    sourceIds: candidate.source_ids ?? [],
    provenance: [...(candidate.provenance ?? []), { candidate_intelligence_id: candidateId }]
  });

  const updatedCandidate = platform.store.update("candidateIntelligence", candidateId, (current) => ({
    ...current,
    state: "under_review",
    canonical_change_set_id: proposal.change_set.canonical_change_set_id,
    updated_at: new Date().toISOString()
  }));

  return { candidate: updatedCandidate, ...proposal };
}

export function approveCandidateChangeSet({ platform, tenantId, principalId, changeSetId }) {
  const changeSet = platform.store.requireTenant("canonicalChangeSets", changeSetId, tenantId);
  const candidateId = candidateIdFromChangeSet(changeSet);
  if (!candidateId) {
    throw new SovereignError("candidate_provenance_missing", "This Canonical Change Set is not linked to Candidate Intelligence.", { status: 409 });
  }
  const candidate = platform.store.requireTenant("candidateIntelligence", candidateId, tenantId);
  if (candidate.state !== "under_review") {
    throw new SovereignError("candidate_not_under_review", "Candidate Intelligence is not awaiting canonical approval.", { status: 409 });
  }

  const applied = platform.intelligence.approveChangeSet({ tenantId, principalId, changeSetId });
  const updatedCandidate = platform.store.update("candidateIntelligence", candidateId, (current) => ({
    ...current,
    state: "accepted",
    accepted_change_set_id: changeSetId,
    accepted_canonical_revision: applied.canonical_revision,
    updated_at: new Date().toISOString()
  }));

  return { candidate: updatedCandidate, ...applied };
}

export function rejectCandidate({ platform, tenantId, candidateId, reason = "Rejected during Candidate Intelligence review." }) {
  const candidate = platform.store.requireTenant("candidateIntelligence", candidateId, tenantId);
  if (candidate.state !== "proposed") {
    throw new SovereignError("candidate_not_proposed", "Only a proposed Candidate Intelligence record can be rejected directly.", { status: 409 });
  }
  return platform.store.update("candidateIntelligence", candidateId, (current) => ({
    ...current,
    state: "rejected",
    rejection_reason: reason,
    updated_at: new Date().toISOString()
  }));
}

function candidateIdFromChangeSet(changeSet) {
  const provenance = Array.isArray(changeSet.provenance) ? changeSet.provenance : [];
  return provenance.find((item) => item && typeof item === "object" && item.candidate_intelligence_id)?.candidate_intelligence_id ?? null;
}
