import { SovereignError } from "./errors.mjs";

export class InMemorySovereignStore {
  constructor() {
    this.tenants = new Map();
    this.workspaces = new Map();
    this.principals = new Map();
    this.providers = new Map();
    this.surfaces = new Map();
    this.actorInstances = new Map();
    this.trafficSessions = new Map();
    this.resources = new Map();
    this.resourceClaims = new Map();
    this.trafficCheckpoints = new Map();
    this.taskCapsules = new Map();
    this.sessionCapsules = new Map();
    this.candidateMemories = new Map();
    this.handoffs = new Map();
    this.extensions = new Map();
    this.extensionInstallations = new Map();
    this.extensionGrants = new Map();
    this.auditEvents = new Map();
    this.sources = new Map();
    this.sourceItems = new Map();
    this.connectorDefinitions = new Map();
    this.initializationRuns = new Map();
    this.initializationSourceRuns = new Map();
    this.canonicalStates = new Map();
    this.canonicalRecords = new Map();
    this.canonicalRecordRevisions = new Map();
    this.canonicalChangeSets = new Map();
    this.canonicalChangeOperations = new Map();
    this.canonicalCheckpoints = new Map();
    this.candidateIntelligence = new Map();
    this.canonicalAccessEvents = new Map();
    this.recoverySessions = new Map();
    this.failureEvents = new Map();
    this.improvementCandidates = new Map();
  }

  put(collection, value) {
    this[collection].set(value[`${singular(collection)}_id`] ?? value.id, structuredClone(value));
    return structuredClone(value);
  }

  get(collection, id) {
    const value = this[collection].get(id);
    return value ? structuredClone(value) : undefined;
  }

  update(collection, id, update) {
    const existing = this[collection].get(id);
    if (!existing) throw new SovereignError("not_found", `${singular(collection)} ${id} was not found.`, { status: 404 });
    const next = typeof update === "function" ? update(structuredClone(existing)) : { ...existing, ...update };
    this[collection].set(id, structuredClone(next));
    return structuredClone(next);
  }

  list(collection, predicate = () => true) {
    return [...this[collection].values()].filter(predicate).map((item) => structuredClone(item));
  }

  requireTenant(collection, id, tenantId) {
    const item = this.get(collection, id);
    if (!item || item.tenant_id !== tenantId) {
      throw new SovereignError("not_found", `${singular(collection)} was not found.`, { status: 404 });
    }
    return item;
  }
}

function singular(collection) {
  return ({
    principals: "principal", providers: "provider", surfaces: "surface", actorInstances: "actor_instance",
    trafficSessions: "traffic_session", resources: "resource", resourceClaims: "resource_claim",
    trafficCheckpoints: "traffic_checkpoint", taskCapsules: "task_capsule", sessionCapsules: "session_capsule",
    candidateMemories: "candidate_memory", extensions: "extension", extensionInstallations: "extension_installation",
    extensionGrants: "extension_grant", auditEvents: "audit_event", sources: "source", tenants: "tenant", workspaces: "workspace",
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
