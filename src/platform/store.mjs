import { SovereignError } from "./errors.mjs";

const COLLECTIONS = [
  "tenants", "workspaces", "principals", "providers", "surfaces", "actorInstances",
  "trafficSessions", "resources", "resourceClaims", "trafficCheckpoints", "taskCapsules",
  "sessionCapsules", "candidateMemories", "ideas", "handoffs", "extensions", "extensionInstallations",
  "extensionGrants", "extensionEventSubscriptions", "extensionEventOutbox", "auditEvents", "sources", "sourceItems", "connectorDefinitions",
  "initializationRuns", "initializationSourceRuns", "canonicalStates", "canonicalRecords",
  "canonicalRecordRevisions", "canonicalChangeSets", "canonicalChangeOperations",
  "canonicalCheckpoints", "candidateIntelligence", "canonicalAccessEvents", "recoverySessions",
  "failureEvents", "improvementCandidates"
];

export class InMemorySovereignStore {
  constructor() {
    this._dirty = new Map(COLLECTIONS.map((collection) => [collection, new Set()]));
    this._importing = false;
    for (const collection of COLLECTIONS) this[collection] = new Map();
  }

  put(collection, value) {
    this.assertCollection(collection);
    const id = value[`${singular(collection)}_id`] ?? value.id;
    this[collection].set(id, structuredClone(value));
    this.markDirty(collection, id);
    return structuredClone(value);
  }

  get(collection, id) {
    this.assertCollection(collection);
    const value = this[collection].get(id);
    return value ? structuredClone(value) : undefined;
  }

  update(collection, id, update) {
    this.assertCollection(collection);
    const existing = this[collection].get(id);
    if (!existing) throw new SovereignError("not_found", `${singular(collection)} ${id} was not found.`, { status: 404 });
    const next = typeof update === "function" ? update(structuredClone(existing)) : { ...existing, ...update };
    this[collection].set(id, structuredClone(next));
    this.markDirty(collection, id);
    return structuredClone(next);
  }

  list(collection, predicate = () => true) {
    this.assertCollection(collection);
    return [...this[collection].values()].filter(predicate).map((item) => structuredClone(item));
  }

  requireTenant(collection, id, tenantId) {
    const item = this.get(collection, id);
    if (!item || item.tenant_id !== tenantId) {
      throw new SovereignError("not_found", `${singular(collection)} was not found.`, { status: 404 });
    }
    return item;
  }

  exportState({ exclude = ["connectorDefinitions"] } = {}) {
    const excluded = new Set(exclude);
    return Object.fromEntries(COLLECTIONS.filter((collection) => !excluded.has(collection)).map((collection) => [collection, this.list(collection)]));
  }

  exportChanges({ exclude = ["connectorDefinitions"] } = {}) {
    const excluded = new Set(exclude);
    const changes = {};
    for (const collection of COLLECTIONS) {
      if (excluded.has(collection)) continue;
      const ids = this._dirty.get(collection);
      if (!ids?.size) continue;
      changes[collection] = [...ids].map((id) => this.get(collection, id)).filter(Boolean);
    }
    return changes;
  }

  clearChanges() {
    for (const ids of this._dirty.values()) ids.clear();
    return this;
  }

  importState(state = {}, { clear = true, exclude = ["connectorDefinitions"] } = {}) {
    const excluded = new Set(exclude);
    this._importing = true;
    try {
      for (const collection of COLLECTIONS) {
        if (excluded.has(collection)) continue;
        if (clear) this[collection].clear();
        const values = state?.[collection];
        if (!Array.isArray(values)) continue;
        for (const value of values) this.put(collection, value);
      }
    } finally {
      this._importing = false;
      this.clearChanges();
    }
    return this;
  }

  assertCollection(collection) {
    if (!COLLECTIONS.includes(collection)) throw new SovereignError("unknown_collection", `Unknown Sovereign store collection: ${collection}.`, { status: 500 });
  }

  markDirty(collection, id) {
    if (this._importing || id === undefined || id === null) return;
    this._dirty.get(collection).add(id);
  }
}

export function sovereignStoreCollections() {
  return [...COLLECTIONS];
}

function singular(collection) {
  return ({
    principals: "principal", providers: "provider", surfaces: "surface", actorInstances: "actor_instance",
    trafficSessions: "traffic_session", resources: "resource", resourceClaims: "resource_claim",
    trafficCheckpoints: "traffic_checkpoint", taskCapsules: "task_capsule", sessionCapsules: "session_capsule",
    candidateMemories: "candidate_memory", ideas: "idea", extensions: "extension", extensionInstallations: "extension_installation",
    extensionGrants: "extension_grant", extensionEventSubscriptions: "extension_event_subscription",
    extensionEventOutbox: "extension_event", auditEvents: "audit_event", sources: "source", tenants: "tenant", workspaces: "workspace",
    handoffs: "handoff", sourceItems: "source_item", connectorDefinitions: "connector_definition",
    initializationRuns: "initialization_run", initializationSourceRuns: "initialization_source_run",
    canonicalStates: "canonical_state", canonicalRecords: "canonical_record",
    canonicalRecordRevisions: "canonical_record_revision", canonicalChangeSets: "canonical_change_set",
    canonicalChangeOperations: "canonical_change_operation", canonicalCheckpoints: "canonical_checkpoint",
    candidateIntelligence: "candidate_intelligence", canonicalAccessEvents: "canonical_access_event",
    recoverySessions: "recovery_session", failureEvents: "failure_event",
    improvementCandidates: "improvement_candidate"
  })[collection] ?? collection;
}
