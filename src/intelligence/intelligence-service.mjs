import { newId, stableHash } from "../platform/ids.mjs";
import { SovereignError, requireCondition } from "../platform/errors.mjs";

const RECORD_TYPES = new Set(["fact", "decision", "policy", "entity", "project", "domain", "architecture", "constraint", "relationship", "summary"]);
const RECORD_STATES = new Set(["active", "superseded", "tombstoned", "retracted"]);
const CHANGE_SET_STATES = new Set(["pending_approval", "ready", "applied", "rejected", "superseded"]);

export class IntelligenceService {
  constructor({ store, clock }) {
    this.store = store;
    this.clock = clock;
  }

  createCandidate({ tenantId, principalId, recordType, payload, scope = {}, sourceIds = [], provenance = [], confidence = "medium", reason = "Candidate intelligence proposed." }) {
    this.validateRecordShape({ recordType, payload });
    this.assertSourcesOwned(tenantId, sourceIds);
    const timestamp = this.now();
    return this.store.put("candidateIntelligence", {
      candidate_intelligence_id: newId("cin"), tenant_id: tenantId, record_type: recordType, payload,
      scope, source_ids: sourceIds, provenance, confidence, reason, state: "proposed",
      proposed_by_principal_id: principalId, created_at: timestamp, updated_at: timestamp
    });
  }

  proposeChangeSet({ tenantId, principalId, title, reason, operations, requiresApproval = true, initiator = "user", scope = {}, confidence = "medium", sourceIds = [], provenance = [] }) {
    requireCondition(title?.trim() && reason?.trim(), "change_set_identity_required", "Canonical Change Set title and reason are required.");
    requireCondition(Array.isArray(operations) && operations.length > 0, "change_set_operations_required", "At least one canonical operation is required.");
    this.assertSourcesOwned(tenantId, sourceIds);
    const state = this.currentState(tenantId);
    const normalizedOperations = operations.map((operation, index) => this.normalizeOperation({ tenantId, operation, index }));
    const timestamp = this.now();
    const changeSet = this.store.put("canonicalChangeSets", {
      canonical_change_set_id: newId("ccs"), tenant_id: tenantId, title: title.trim(), reason: reason.trim(),
      state: requiresApproval ? "pending_approval" : "ready", requires_approval: requiresApproval, initiator,
      scope, confidence, source_ids: sourceIds, provenance, base_canonical_revision: state.current_revision,
      resulting_canonical_revision: null, affected_record_ids: normalizedOperations.flatMap((operation) => operation.affected_record_ids),
      proposed_by_principal_id: principalId, approved_by_principal_id: null, rejected_by_principal_id: null,
      applied_at: null, rejected_at: null, revert_of_change_set_id: null, created_at: timestamp, updated_at: timestamp
    });
    for (const operation of normalizedOperations) {
      this.store.put("canonicalChangeOperations", {
        canonical_change_operation_id: newId("cco"), canonical_change_set_id: changeSet.canonical_change_set_id,
        tenant_id: tenantId, ordinal: operation.ordinal, operation_type: operation.operation_type,
        target_record_id: operation.target_record_id ?? null, created_record_id: operation.created_record_id ?? null,
        patch: operation.patch ?? null, replacement: operation.replacement ?? null, reason: operation.reason ?? null,
        before_snapshot: null, after_snapshot: null, affected_record_ids: operation.affected_record_ids,
        created_at: timestamp, updated_at: timestamp
      });
    }
    return this.getChangeSet(tenantId, changeSet.canonical_change_set_id);
  }

  approveChangeSet({ tenantId, principalId, changeSetId }) {
    const changeSet = this.requireChangeSet(tenantId, changeSetId);
    if (!["pending_approval", "ready"].includes(changeSet.state)) throw new SovereignError("change_set_not_pending", "Canonical Change Set is not available for approval.", { status: 409 });
    return this.applyChangeSet({ tenantId, principalId, changeSetId });
  }

  rejectChangeSet({ tenantId, principalId, changeSetId, reason }) {
    const changeSet = this.requireChangeSet(tenantId, changeSetId);
    if (!["pending_approval", "ready"].includes(changeSet.state)) throw new SovereignError("change_set_not_pending", "Canonical Change Set is not available for rejection.", { status: 409 });
    return this.store.update("canonicalChangeSets", changeSetId, (current) => ({
      ...current, state: "rejected", rejected_by_principal_id: principalId, rejection_reason: reason ?? null,
      rejected_at: this.now(), updated_at: this.now()
    }));
  }

  applyChangeSet({ tenantId, principalId, changeSetId }) {
    const changeSet = this.requireChangeSet(tenantId, changeSetId);
    if (!["pending_approval", "ready"].includes(changeSet.state)) throw new SovereignError("change_set_unavailable", "Canonical Change Set cannot be applied.", { status: 409 });
    const currentState = this.currentState(tenantId);
    if (changeSet.base_canonical_revision !== currentState.current_revision) {
      throw new SovereignError("canonical_revision_changed", "Canonical state changed since this proposal; reconcile it before applying.", { status: 409, details: { base_revision: changeSet.base_canonical_revision, current_revision: currentState.current_revision } });
    }
    const nextRevision = currentState.current_revision + 1;
    const operations = this.changeOperations(tenantId, changeSetId);
    // All validation occurs before any mutation, making this atomic in the
    // in-memory adapter. The Neon repository performs this in one transaction.
    for (const operation of operations) this.validateApplicableOperation(tenantId, operation);
    for (const operation of operations) this.applyOperation({ tenantId, principalId, operation, canonicalRevision: nextRevision, changeSetId });
    const timestamp = this.now();
    const applied = this.store.update("canonicalChangeSets", changeSetId, (current) => ({
      ...current, state: "applied", approved_by_principal_id: principalId, resulting_canonical_revision: nextRevision,
      applied_at: timestamp, updated_at: timestamp
    }));
    this.store.update("canonicalStates", currentState.canonical_state_id, (current) => ({
      ...current, current_revision: nextRevision, last_change_set_id: changeSetId, updated_at: timestamp
    }));
    const checkpoint = this.createCheckpoint({ tenantId, principalId, title: `Canonical Checkpoint #${nextRevision}`, reason: changeSet.reason, changeSetIds: [changeSetId], scope: changeSet.scope, automatic: true });
    return { ...this.getChangeSet(tenantId, applied.canonical_change_set_id), canonical_checkpoint: checkpoint, canonical_revision: nextRevision };
  }

  createCheckpoint({ tenantId, principalId, title, reason, changeSetIds = [], scope = {}, automatic = false }) {
    const state = this.currentState(tenantId);
    const timestamp = this.now();
    const changes = changeSetIds.map((id) => this.requireChangeSet(tenantId, id));
    const counts = summarizeChanges(changes);
    return this.store.put("canonicalCheckpoints", {
      canonical_checkpoint_id: newId("ccp"), tenant_id: tenantId, canonical_revision: state.current_revision,
      title, reason, scope, change_set_ids: changeSetIds, change_summary: counts, automatic,
      created_by_principal_id: principalId, created_at: timestamp, revision_hash: stableHash({ tenantId, canonicalRevision: state.current_revision, changeSetIds, counts })
    });
  }

  revertChangeSet({ tenantId, principalId, changeSetId, title, reason, requiresApproval = true }) {
    const original = this.requireChangeSet(tenantId, changeSetId);
    if (original.state !== "applied") throw new SovereignError("change_set_not_applied", "Only an applied Canonical Change Set can be reverted.", { status: 409 });
    const laterConflicts = this.store.list("canonicalChangeSets", (candidate) =>
      candidate.tenant_id === tenantId && candidate.state === "applied" &&
      candidate.resulting_canonical_revision > original.resulting_canonical_revision &&
      candidate.affected_record_ids.some((recordId) => original.affected_record_ids.includes(recordId))
    );
    if (laterConflicts.length) {
      throw new SovereignError("revert_requires_reconciliation", "A later Canonical Change Set changed the same record. Review or create a reconciled revert instead.", {
        status: 409,
        details: { conflicting_change_set_ids: laterConflicts.map((candidate) => candidate.canonical_change_set_id) }
      });
    }
    const operations = this.changeOperations(tenantId, changeSetId).slice().reverse();
    const reverse = operations.flatMap((operation) => this.reverseOperation(operation));
    const proposal = this.proposeChangeSet({
      tenantId, principalId, title: title ?? `Revert ${original.title}`, reason: reason ?? `Revert canonical change set ${changeSetId}.`,
      operations: reverse, requiresApproval, initiator: "revert", scope: original.scope,
      confidence: "high", sourceIds: original.source_ids, provenance: [{ reverts_change_set_id: changeSetId }]
    });
    return this.store.update("canonicalChangeSets", proposal.change_set.canonical_change_set_id, (current) => ({ ...current, revert_of_change_set_id: changeSetId }));
  }

  canonicalStatus({ tenantId, scope }) {
    const state = this.currentState(tenantId);
    const records = this.listRecords({ tenantId, scope, includeHistorical: false });
    const changes = this.store.list("canonicalChangeSets", (item) => item.tenant_id === tenantId && scopeMatches(item.scope, scope)).sort((left, right) => right.created_at.localeCompare(left.created_at));
    const checkpoints = this.store.list("canonicalCheckpoints", (item) => item.tenant_id === tenantId && scopeMatches(item.scope, scope)).sort((left, right) => right.created_at.localeCompare(left.created_at));
    return {
      current_canonical_revision: state.current_revision, last_change_set_id: state.last_change_set_id,
      latest_checkpoint: checkpoints[0] ?? null, recent_change_sets: changes.slice(0, 10).map((change) => this.getChangeSet(tenantId, change.canonical_change_set_id).change_set),
      pending_change_sets: changes.filter((change) => ["pending_approval", "ready"].includes(change.state)).map((change) => this.getChangeSet(tenantId, change.canonical_change_set_id).change_set),
      active_record_count: records.filter((record) => record.lifecycle_state === "active").length,
      superseded_record_count: this.listRecords({ tenantId, scope, includeHistorical: true }).filter((record) => record.lifecycle_state === "superseded").length,
      tombstoned_record_count: this.listRecords({ tenantId, scope, includeHistorical: true }).filter((record) => record.lifecycle_state === "tombstoned").length
    };
  }

  listRecords({ tenantId, scope, includeHistorical = false }) {
    return this.store.list("canonicalRecords", (record) => record.tenant_id === tenantId && scopeMatches(record.scope, scope) && (includeHistorical || record.lifecycle_state === "active"))
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  }

  getRecord({ tenantId, recordId }) {
    const record = this.store.requireTenant("canonicalRecords", recordId, tenantId);
    const revisions = this.store.list("canonicalRecordRevisions", (revision) => revision.tenant_id === tenantId && revision.canonical_record_id === recordId).sort((left, right) => right.record_revision - left.record_revision);
    return { record, revisions };
  }

  getChangeSet(tenantId, changeSetId) {
    const changeSet = this.requireChangeSet(tenantId, changeSetId);
    return { change_set: changeSet, operations: this.changeOperations(tenantId, changeSetId) };
  }

  understanding({ tenantId, scope }) {
    const records = this.listRecords({ tenantId, scope });
    return {
      scope: scope ?? {}, canonical_revision: this.currentState(tenantId).current_revision,
      summary: records.map((record) => ({ record_id: record.canonical_record_id, type: record.record_type, payload: record.payload, authority_level: record.authority_level, confidence: record.confidence, provenance: record.provenance })),
      uncertainties: records.filter((record) => record.authority_level === "provisional" || record.confidence === "low").map((record) => record.canonical_record_id),
      source_basis: [...new Set(records.flatMap((record) => record.source_ids))]
    };
  }

  currentState(tenantId) {
    const state = this.store.list("canonicalStates", (item) => item.tenant_id === tenantId)[0];
    if (state) return state;
    const timestamp = this.now();
    return this.store.put("canonicalStates", { canonical_state_id: newId("cst"), tenant_id: tenantId, current_revision: 0, last_change_set_id: null, created_at: timestamp, updated_at: timestamp });
  }

  normalizeOperation({ tenantId, operation, index }) {
    operation = normalizeOperationInput(operation);
    requireCondition(operation?.type, "operation_type_required", "Canonical operation type is required.");
    const ordinal = index + 1;
    if (operation.type === "add") {
      this.validateRecordShape(operation.record);
      const recordId = operation.recordId ?? newId("cir");
      return { ordinal, operation_type: "add", created_record_id: recordId, replacement: operation.record, affected_record_ids: [recordId] };
    }
    if (operation.type === "update") {
      this.requireRecord(tenantId, operation.recordId);
      requireCondition(operation.patch && typeof operation.patch === "object", "operation_patch_required", "Canonical update needs a patch.");
      return { ordinal, operation_type: "update", target_record_id: operation.recordId, patch: operation.patch, affected_record_ids: [operation.recordId] };
    }
    if (operation.type === "supersede") {
      this.requireRecord(tenantId, operation.recordId);
      this.validateRecordShape(operation.replacement);
      const replacementRecordId = operation.replacementRecordId ?? newId("cir");
      return { ordinal, operation_type: "supersede", target_record_id: operation.recordId, created_record_id: replacementRecordId, replacement: operation.replacement, affected_record_ids: [operation.recordId, replacementRecordId] };
    }
    if (operation.type === "tombstone") {
      this.requireRecord(tenantId, operation.recordId);
      return { ordinal, operation_type: "tombstone", target_record_id: operation.recordId, reason: operation.reason ?? null, affected_record_ids: [operation.recordId] };
    }
    if (operation.type === "restore") {
      this.requireRecord(tenantId, operation.recordId);
      requireCondition(operation.snapshot, "restore_snapshot_required", "Canonical restore requires a historical snapshot.");
      return { ordinal, operation_type: "restore", target_record_id: operation.recordId, replacement: operation.snapshot, affected_record_ids: [operation.recordId] };
    }
    throw new SovereignError("invalid_canonical_operation", "Canonical operation type is invalid.");
  }

  validateApplicableOperation(tenantId, operation) {
    if (operation.operation_type !== "add" && !this.requireRecord(tenantId, operation.target_record_id)) throw new SovereignError("record_not_found", "Canonical record was not found.", { status: 404 });
  }

  applyOperation({ tenantId, principalId, operation, canonicalRevision, changeSetId }) {
    const timestamp = this.now();
    const before = operation.target_record_id ? this.recordSnapshot(this.requireRecord(tenantId, operation.target_record_id)) : null;
    let after;
    if (operation.operation_type === "add") {
      after = this.createRecord({ tenantId, principalId, recordId: operation.created_record_id, record: operation.replacement, canonicalRevision, changeSetId, timestamp });
    } else if (operation.operation_type === "update") {
      const record = this.requireRecord(tenantId, operation.target_record_id);
      after = this.reviseRecord({ record, principalId, patch: operation.patch, canonicalRevision, changeSetId, timestamp });
    } else if (operation.operation_type === "supersede") {
      const record = this.requireRecord(tenantId, operation.target_record_id);
      this.reviseRecord({ record, principalId, patch: { lifecycle_state: "superseded" }, canonicalRevision, changeSetId, timestamp });
      const replacement = this.createRecord({ tenantId, principalId, recordId: operation.created_record_id, record: { ...operation.replacement, supersedes_record_id: record.canonical_record_id }, canonicalRevision, changeSetId, timestamp });
      after = { original: this.recordSnapshot(this.requireRecord(tenantId, record.canonical_record_id)), replacement: this.recordSnapshot(replacement) };
    } else if (operation.operation_type === "tombstone") {
      const record = this.requireRecord(tenantId, operation.target_record_id);
      after = this.reviseRecord({ record, principalId, patch: { lifecycle_state: "tombstoned", tombstone_reason: operation.reason ?? null }, canonicalRevision, changeSetId, timestamp });
    } else if (operation.operation_type === "restore") {
      const record = this.requireRecord(tenantId, operation.target_record_id);
      after = this.reviseRecord({ record, principalId, patch: operation.replacement, canonicalRevision, changeSetId, timestamp });
    }
    this.store.update("canonicalChangeOperations", operation.canonical_change_operation_id, (current) => ({
      ...current, before_snapshot: before, after_snapshot: operation.operation_type === "supersede" ? after : this.recordSnapshot(after), updated_at: timestamp
    }));
  }

  createRecord({ tenantId, principalId, recordId, record, canonicalRevision, changeSetId, timestamp }) {
    const next = {
      canonical_record_id: recordId, tenant_id: tenantId, record_type: record.recordType,
      scope: record.scope ?? {}, payload: record.payload, authority_level: record.authorityLevel ?? "provisional",
      provenance: record.provenance ?? [], source_ids: record.sourceIds ?? [], confidence: record.confidence ?? "medium",
      data_classification: record.dataClassification ?? "internal", lifecycle_state: record.lifecycleState ?? "active",
      supersedes_record_id: record.supersedes_record_id ?? null, current_record_revision: 1,
      current_canonical_revision: canonicalRevision, created_by_principal_id: principalId, updated_by_principal_id: principalId,
      created_at: timestamp, updated_at: timestamp, last_change_set_id: changeSetId
    };
    const saved = this.store.put("canonicalRecords", next);
    this.appendRecordRevision({ record: saved, before: null, principalId, canonicalRevision, changeSetId, timestamp });
    return saved;
  }

  reviseRecord({ record, principalId, patch, canonicalRevision, changeSetId, timestamp }) {
    const before = this.recordSnapshot(record);
    const next = this.store.update("canonicalRecords", record.canonical_record_id, (current) => ({
      ...current, ...normalizePatch(patch), current_record_revision: current.current_record_revision + 1,
      current_canonical_revision: canonicalRevision, updated_by_principal_id: principalId, updated_at: timestamp, last_change_set_id: changeSetId
    }));
    this.appendRecordRevision({ record: next, before, principalId, canonicalRevision, changeSetId, timestamp });
    return next;
  }

  appendRecordRevision({ record, before, principalId, canonicalRevision, changeSetId, timestamp }) {
    return this.store.put("canonicalRecordRevisions", {
      canonical_record_revision_id: newId("crr"), tenant_id: record.tenant_id, canonical_record_id: record.canonical_record_id,
      record_revision: record.current_record_revision, canonical_revision: canonicalRevision, change_set_id: changeSetId,
      before_snapshot: before, after_snapshot: this.recordSnapshot(record), created_by_principal_id: principalId, created_at: timestamp
    });
  }

  reverseOperation(operation) {
    if (operation.operation_type === "add") return [{ type: "tombstone", recordId: operation.created_record_id, reason: "Revert canonical addition." }];
    if (operation.operation_type === "update" || operation.operation_type === "tombstone" || operation.operation_type === "restore") {
      return [{ type: "restore", recordId: operation.target_record_id, snapshot: operation.before_snapshot }];
    }
    if (operation.operation_type === "supersede") {
      return [
        { type: "tombstone", recordId: operation.created_record_id, reason: "Revert canonical supersession." },
        { type: "restore", recordId: operation.target_record_id, snapshot: operation.before_snapshot }
      ];
    }
    throw new SovereignError("revert_unsupported", "Canonical operation cannot be reverted automatically.");
  }

  recordSnapshot(record) {
    if (!record) return null;
    return structuredClone({
      canonical_record_id: record.canonical_record_id, record_type: record.record_type, scope: record.scope,
      payload: record.payload, authority_level: record.authority_level, provenance: record.provenance,
      source_ids: record.source_ids, confidence: record.confidence, data_classification: record.data_classification,
      lifecycle_state: record.lifecycle_state, supersedes_record_id: record.supersedes_record_id, tombstone_reason: record.tombstone_reason ?? null
    });
  }

  requireRecord(tenantId, recordId) { return this.store.requireTenant("canonicalRecords", recordId, tenantId); }
  requireChangeSet(tenantId, changeSetId) { return this.store.requireTenant("canonicalChangeSets", changeSetId, tenantId); }
  changeOperations(tenantId, changeSetId) { return this.store.list("canonicalChangeOperations", (item) => item.tenant_id === tenantId && item.canonical_change_set_id === changeSetId).sort((left, right) => left.ordinal - right.ordinal); }

  validateRecordShape(record) {
    record = normalizeRecordInput(record);
    requireCondition(record && RECORD_TYPES.has(record.recordType), "invalid_record_type", "Canonical record type is invalid.");
    requireCondition(Object.hasOwn(record, "payload"), "record_payload_required", "Canonical record payload is required.");
  }

  assertSourcesOwned(tenantId, sourceIds) {
    for (const sourceId of sourceIds) this.store.requireTenant("sources", sourceId, tenantId);
  }

  now() { return this.clock().toISOString(); }
}

function normalizeOperationInput(operation = {}) {
  return {
    ...operation,
    recordId: operation.recordId ?? operation.record_id,
    replacementRecordId: operation.replacementRecordId ?? operation.replacement_record_id,
    record: normalizeRecordInput(operation.record),
    replacement: normalizeRecordInput(operation.replacement),
    snapshot: operation.snapshot
  };
}

function normalizeRecordInput(record) {
  if (!record || typeof record !== "object") return record;
  return {
    ...record,
    recordType: record.recordType ?? record.record_type,
    authorityLevel: record.authorityLevel ?? record.authority_level,
    sourceIds: record.sourceIds ?? record.source_ids,
    dataClassification: record.dataClassification ?? record.data_classification,
    lifecycleState: record.lifecycleState ?? record.lifecycle_state,
    supersedesRecordId: record.supersedesRecordId ?? record.supersedes_record_id
  };
}

function normalizePatch(patch) {
  const mapping = {
    recordType: "record_type", authorityLevel: "authority_level", sourceIds: "source_ids",
    dataClassification: "data_classification", lifecycleState: "lifecycle_state", supersedesRecordId: "supersedes_record_id"
  };
  const normalized = {};
  for (const [key, value] of Object.entries(patch)) normalized[mapping[key] ?? key] = value;
  if (normalized.lifecycle_state && !RECORD_STATES.has(normalized.lifecycle_state)) throw new SovereignError("invalid_record_state", "Canonical record lifecycle state is invalid.");
  return normalized;
}

function scopeMatches(itemScope = {}, requestedScope) {
  if (!requestedScope || !Object.keys(requestedScope).length) return true;
  return Object.entries(requestedScope).every(([key, value]) => itemScope?.[key] === value);
}

function summarizeChanges(changeSets) {
  const operations = changeSets.flatMap((changeSet) => changeSet.affected_record_ids ?? []);
  return { change_set_count: changeSets.length, affected_record_count: new Set(operations).size };
}
