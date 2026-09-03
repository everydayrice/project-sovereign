import { SovereignError } from "./errors.mjs";

export class InMemorySovereignStore {
  constructor() {
    this.tenants = new Map();
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
    extensionGrants: "extension_grant", auditEvents: "audit_event", sources: "source", tenants: "tenant",
    handoffs: "handoff"
  })[collection] ?? collection;
}
