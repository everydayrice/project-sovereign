import { newId } from "../platform/ids.mjs";
import { SovereignError } from "../platform/errors.mjs";

export class RecoveryService {
  constructor({ store, clock, intelligence, sources, initialization, improvement }) {
    this.store = store;
    this.clock = clock;
    this.intelligence = intelligence;
    this.sources = sources;
    this.initialization = initialization;
    this.improvement = improvement;
  }

  start({ tenantId, principalId, scope = {}, reason = "Trust recovery requested." }) {
    const timestamp = this.now();
    const canonical = this.intelligence.canonicalStatus({ tenantId, scope });
    const recovery = this.store.put("recoverySessions", {
      recovery_session_id: newId("rcv"), tenant_id: tenantId, scope, reason, state: "active",
      canonical_snapshot_revision: canonical.current_canonical_revision,
      canonical_snapshot_checkpoint_id: canonical.latest_checkpoint?.canonical_checkpoint_id ?? null,
      risky_canonical_automation_paused: true, started_by_principal_id: principalId,
      findings: this.healthReport({ tenantId, scope }), started_at: timestamp, completed_at: null, created_at: timestamp, updated_at: timestamp
    });
    this.improvement.reportCorrection({ tenantId, principalId, scope, summary: `Trust recovery started: ${reason}`, actualBehavior: "User confidence dropped.", canonicalRevision: canonical.current_canonical_revision });
    return recovery;
  }

  healthReport({ tenantId, scope = {} }) {
    const canonical = this.intelligence.canonicalStatus({ tenantId, scope });
    const sources = this.sources.sourceHealth(tenantId);
    const initialization = this.initialization.listRuns(tenantId).filter((run) => scopeMatches(run.scope, scope));
    const records = this.intelligence.listRecords({ tenantId, scope });
    const candidates = this.store.list("candidateIntelligence", (item) => item.tenant_id === tenantId && scopeMatches(item.scope, scope) && item.state === "proposed");
    const tasks = this.store.list("taskCapsules", (item) => item.tenant_id === tenantId && ["planned", "active", "waiting", "blocked"].includes(item.state));
    const conflicts = records.flatMap((left, index) => records.slice(index + 1)
      .filter((right) => left.record_type === right.record_type && JSON.stringify(left.scope) === JSON.stringify(right.scope) &&
        left.payload?.subject && left.payload.subject === right.payload?.subject && JSON.stringify(left.payload) !== JSON.stringify(right.payload))
      .map((right) => ({ record_ids: [left.canonical_record_id, right.canonical_record_id], state: "possible_conflict", reason: "Same subject has differing canonical payloads; human review required." })));
    return {
      scope, canonical,
      captured_at: this.now(),
      understanding: this.intelligence.understanding({ tenantId, scope }),
      canonical_records: records,
      unresolved_candidates: candidates,
      possible_conflicts: conflicts,
      continuity: { scope: "tenant", active_tasks: tasks },
      uncertainty: records.filter((record) => record.confidence === "low" || record.authority_level === "provisional").map((record) => record.canonical_record_id),
      missing: [...(!records.length ? ["No active canonical records in this scope."] : []), ...(!sources.total ? ["No connected source evidence."] : [])],
      source_authority: sources.sources.map((source) => ({ source_id: source.source_id, authority_state: source.authority_state, data_classification: source.data_classification })),
      source_health: {
        total: sources.total, current: sources.current, stale: sources.stale, failed: sources.failed, partial: sources.partial,
        failed_sources: sources.sources.filter((source) => source.health_state === "failed"),
        partial_sources: sources.sources.filter((source) => source.health_state === "partial" || source.processing_state === "partial"),
        stale_sources: sources.sources.filter((source) => source.currentness === "stale")
      },
      initialization: initialization.slice(0, 10).map((run) => ({ initialization_run_id: run.initialization_run_id, mode: run.mode, state: run.state, coverage: run.coverage })),
      improvement: this.improvement.health(tenantId),
      repair_options: ["review_pending_canonical_changes", "revert_canonical_change_set", "reinitialize_scope", "restudy_scope", "reconnect_source", "rebuild_derivative_indexes"]
    };
  }

  complete({ tenantId, principalId, recoverySessionId, summary = "Recovery reviewed; no destructive changes were made." }) {
    const session = this.store.requireTenant("recoverySessions", recoverySessionId, tenantId);
    if (session.state !== "active") throw new SovereignError("recovery_not_active", "Recovery session is not active.", { status: 409 });
    const timestamp = this.now();
    return this.store.update("recoverySessions", recoverySessionId, (current) => ({
      ...current, state: "completed", risky_canonical_automation_paused: false, findings: { ...current.findings, completion_review: this.healthReport({ tenantId, scope: current.scope }) },
      completion_summary: summary, completed_by_principal_id: principalId, completed_at: timestamp, updated_at: timestamp
    }));
  }

  list(tenantId) { return this.store.list("recoverySessions", (item) => item.tenant_id === tenantId).sort((left, right) => right.created_at.localeCompare(left.created_at)); }
  now() { return this.clock().toISOString(); }
}

function scopeMatches(itemScope = {}, requestedScope = {}) {
  return Object.entries(requestedScope).every(([key, value]) => itemScope?.[key] === value);
}
