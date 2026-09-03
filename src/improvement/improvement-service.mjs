import { newId } from "../platform/ids.mjs";

export class ImprovementService {
  constructor({ store, clock }) {
    this.store = store;
    this.clock = clock;
  }

  reportCorrection({ tenantId, principalId, scope = {}, summary, expectedBehavior, actualBehavior, evidence = [], canonicalRevision }) {
    const timestamp = this.now();
    const failure = this.store.put("failureEvents", {
      failure_event_id: newId("flr"), tenant_id: tenantId, scope, kind: "user_correction", severity: "medium",
      summary, expected_behavior: expectedBehavior ?? null, actual_behavior: actualBehavior ?? null, evidence,
      canonical_revision: canonicalRevision ?? null, status: "open", reported_by_principal_id: principalId,
      created_at: timestamp, updated_at: timestamp
    });
    const improvement = this.store.put("improvementCandidates", {
      improvement_candidate_id: newId("imp"), tenant_id: tenantId, failure_event_id: failure.failure_event_id,
      scope, summary: `Review correction: ${summary}`, state: "proposed", target: "intelligence_or_workflow",
      proposed_by_principal_id: principalId, created_at: timestamp, updated_at: timestamp
    });
    return { failure_event: failure, improvement_candidate: improvement };
  }

  health(tenantId) {
    const failures = this.store.list("failureEvents", (item) => item.tenant_id === tenantId);
    const improvements = this.store.list("improvementCandidates", (item) => item.tenant_id === tenantId);
    return {
      open_failures: failures.filter((item) => item.status === "open").length,
      corrections: failures.filter((item) => item.kind === "user_correction").length,
      improvement_debt: improvements.filter((item) => ["proposed", "testing"].includes(item.state)).length,
      recent_failures: failures.sort((left, right) => right.created_at.localeCompare(left.created_at)).slice(0, 10),
      improvement_candidates: improvements.sort((left, right) => right.created_at.localeCompare(left.created_at)).slice(0, 10)
    };
  }

  now() { return this.clock().toISOString(); }
}
