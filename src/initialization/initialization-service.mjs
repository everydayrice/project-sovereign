import { newId } from "../platform/ids.mjs";
import { SovereignError, requireCondition } from "../platform/errors.mjs";

export class InitializationService {
  constructor({ store, clock, sources, intelligence }) {
    this.store = store;
    this.clock = clock;
    this.sources = sources;
    this.intelligence = intelligence;
  }

  start({ tenantId, principalId, scope = {}, sourceIds, mode = "initialize" }) {
    requireCondition(["initialize", "study", "sweep"].includes(mode), "invalid_initialization_mode", "Initialization mode is invalid.");
    const selectedSources = sourceIds?.length ? sourceIds.map((id) => this.store.requireTenant("sources", id, tenantId)) : this.sources.listSources(tenantId);
    requireCondition(selectedSources.length > 0, "initialization_sources_required", "At least one source is required to initialize a scope.");
    const timestamp = this.now();
    const run = this.store.put("initializationRuns", {
      initialization_run_id: newId("ini"), tenant_id: tenantId, scope, mode, state: "running",
      requested_by_principal_id: principalId, source_ids: selectedSources.map((source) => source.source_id),
      candidate_intelligence_ids: [], canonical_change_set_id: null, coverage: emptyCoverage(selectedSources.length),
      started_at: timestamp, completed_at: null, created_at: timestamp, updated_at: timestamp
    });
    for (const source of selectedSources) {
      this.store.put("initializationSourceRuns", {
        initialization_source_run_id: newId("isr"), initialization_run_id: run.initialization_run_id,
        tenant_id: tenantId, source_id: source.source_id, state: source.connection_state === "connected" ? "pending" : "blocked",
        item_count: source.item_count, inventoried_item_count: source.inventoried_item_count,
        analyzed_item_count: source.analyzed_item_count, candidate_count: 0, excluded_count: source.excluded_item_count,
        failure_reason: source.connection_state === "connected" ? null : `Source is ${source.connection_state}.`, updated_at: timestamp
      });
    }
    return this.getRun(tenantId, run.initialization_run_id);
  }

  recordSourceResult({ tenantId, runId, sourceId, state, itemCount, inventoriedItemCount, analyzedItemCount, candidateCount = 0, excludedCount = 0, failureReason, currentness }) {
    requireCondition(["complete", "partial", "failed", "blocked"].includes(state), "invalid_initialization_source_state", "Initialization source result state is invalid.");
    const run = this.requireRun(tenantId, runId);
    if (run.state !== "running") throw new SovereignError("initialization_not_running", "Initialization run is no longer running.", { status: 409 });
    const result = this.store.list("initializationSourceRuns", (item) => item.tenant_id === tenantId && item.initialization_run_id === runId && item.source_id === sourceId)[0];
    if (!result) throw new SovereignError("initialization_source_not_found", "Source is not part of this initialization run.", { status: 404 });
    const next = this.store.update("initializationSourceRuns", result.initialization_source_run_id, (current) => ({
      ...current, state, item_count: itemCount ?? current.item_count, inventoried_item_count: inventoriedItemCount ?? current.inventoried_item_count,
      analyzed_item_count: analyzedItemCount ?? current.analyzed_item_count, candidate_count: candidateCount,
      excluded_count: excludedCount, failure_reason: failureReason ?? null, updated_at: this.now()
    }));
    if (state === "failed") this.sources.markFailed({ tenantId, sourceId, reason: failureReason ?? "Initialization failed.", stale: true });
    else this.sources.updateProcessing({ tenantId, sourceId, processingState: state === "complete" ? "analyzed" : "partial", currentness: currentness ?? (state === "complete" ? "current" : "partial"), delta: { analyzedItemCount: next.analyzed_item_count, failedItemCount: state === "failed" ? 1 : undefined } });
    this.refreshCoverage(tenantId, runId);
    return this.getRun(tenantId, runId);
  }

  attachCandidate({ tenantId, runId, candidateId }) {
    const run = this.requireRun(tenantId, runId);
    this.store.requireTenant("candidateIntelligence", candidateId, tenantId);
    return this.store.update("initializationRuns", runId, (current) => ({
      ...current, candidate_intelligence_ids: [...new Set([...current.candidate_intelligence_ids, candidateId])], updated_at: this.now()
    }));
  }

  proposeCanonicalization({ tenantId, principalId, runId, title, reason, operations, requiresApproval = true }) {
    const run = this.requireRun(tenantId, runId);
    const proposal = this.intelligence.proposeChangeSet({
      tenantId, principalId, title: title ?? `${capitalize(run.mode)} canonical proposal`,
      reason: reason ?? `Canonical proposal from ${run.mode} run ${runId}.`, operations, requiresApproval,
      initiator: run.mode, scope: run.scope, sourceIds: run.source_ids,
      provenance: [{ initialization_run_id: runId }]
    });
    return this.store.update("initializationRuns", runId, (current) => ({ ...current, canonical_change_set_id: proposal.change_set.canonical_change_set_id, updated_at: this.now() }));
  }

  complete({ tenantId, runId }) {
    const run = this.requireRun(tenantId, runId);
    if (run.state !== "running") throw new SovereignError("initialization_not_running", "Initialization run is no longer running.", { status: 409 });
    const coverage = this.refreshCoverage(tenantId, runId);
    const state = coverage.sources_failed > 0 || coverage.sources_partial > 0 || coverage.sources_blocked > 0 || coverage.sources_pending > 0 ? "partial" : "completed";
    return this.store.update("initializationRuns", runId, (current) => ({ ...current, state, coverage, completed_at: this.now(), updated_at: this.now() }));
  }

  getRun(tenantId, runId) {
    const run = this.requireRun(tenantId, runId);
    const source_results = this.store.list("initializationSourceRuns", (item) => item.tenant_id === tenantId && item.initialization_run_id === runId);
    return { ...run, source_results };
  }

  listRuns(tenantId) {
    return this.store.list("initializationRuns", (item) => item.tenant_id === tenantId).sort((left, right) => right.started_at.localeCompare(left.started_at));
  }

  refreshCoverage(tenantId, runId) {
    const results = this.store.list("initializationSourceRuns", (item) => item.tenant_id === tenantId && item.initialization_run_id === runId);
    const coverage = {
      sources_selected: results.length,
      sources_completed: results.filter((item) => item.state === "complete").length,
      sources_partial: results.filter((item) => item.state === "partial").length,
      sources_failed: results.filter((item) => item.state === "failed").length,
      sources_blocked: results.filter((item) => item.state === "blocked").length,
      sources_pending: results.filter((item) => item.state === "pending").length,
      items_discovered: sum(results, "item_count"), items_inventoried: sum(results, "inventoried_item_count"),
      items_analyzed: sum(results, "analyzed_item_count"), candidates_extracted: sum(results, "candidate_count"),
      intentionally_excluded: sum(results, "excluded_count")
    };
    this.store.update("initializationRuns", runId, (current) => ({ ...current, coverage, updated_at: this.now() }));
    return coverage;
  }

  requireRun(tenantId, runId) { return this.store.requireTenant("initializationRuns", runId, tenantId); }
  now() { return this.clock().toISOString(); }
}

function emptyCoverage(sourceCount) {
  return { sources_selected: sourceCount, sources_completed: 0, sources_partial: 0, sources_failed: 0, sources_blocked: 0, sources_pending: sourceCount, items_discovered: 0, items_inventoried: 0, items_analyzed: 0, candidates_extracted: 0, intentionally_excluded: 0 };
}

function sum(items, field) { return items.reduce((total, item) => total + (item[field] ?? 0), 0); }
function capitalize(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
