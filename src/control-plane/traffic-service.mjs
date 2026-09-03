import { newId, stableHash } from "../platform/ids.mjs";
import { SovereignError, requireCondition } from "../platform/errors.mjs";
import { DEFAULT_TRAFFIC_POLICY, evaluateClaim } from "./collision-policy.mjs";

const LIVE_SESSION_STATES = new Set(["planned", "active", "waiting", "blocked"]);
const OPEN_CLAIM_STATES = new Set(["planned", "active"]);

export class TrafficService {
  constructor({ store, clock, command, continuity, policy = DEFAULT_TRAFFIC_POLICY }) {
    this.store = store;
    this.clock = clock;
    this.command = command;
    this.continuity = continuity;
    this.policy = { ...DEFAULT_TRAFFIC_POLICY, ...policy };
  }

  checkIn({ tenantId, principalId, actor, objective, taskCapsuleId, parentTrafficSessionId, requestedResources = [], contextAppetite = "standard", permissions = [] }) {
    this.command.requireActiveTenant(tenantId);
    this.command.requirePrincipal(tenantId, principalId);
    requireCondition(objective?.trim(), "objective_required", "Traffic Session objective is required.");
    requireCondition(["lean", "standard", "broad", "deep", "custom"].includes(contextAppetite), "invalid_context_appetite", "Context appetite must be actor-selected and valid.");
    this.sweepExpired(tenantId);
    const actorInstance = this.command.resolveActor({ tenantId, principalId, actor });
    if (taskCapsuleId) this.continuity.requireTask(tenantId, taskCapsuleId);
    if (parentTrafficSessionId) this.requireSession(tenantId, principalId, parentTrafficSessionId);
    const timestamp = this.now();
    const session = this.store.put("trafficSessions", {
      traffic_session_id: newId("trs"), tenant_id: tenantId, principal_id: principalId,
      actor_instance_id: actorInstance.actor_instance_id, task_capsule_id: taskCapsuleId ?? null,
      parent_traffic_session_id: parentTrafficSessionId ?? null, objective: objective.trim(), state: "active",
      context_appetite: contextAppetite, checked_in_at: timestamp, last_heartbeat_at: timestamp,
      lease_expires_at: this.leaseExpiry(), checked_out_at: null, next_action: null, outcome: null,
      revision: 1, created_at: timestamp, updated_at: timestamp
    });
    const orientation = this.orientation({ tenantId, principalId, trafficSessionId: session.traffic_session_id, requestedResources, permissions });
    this.audit({ tenantId, principalId, actorInstanceId: actorInstance.actor_instance_id, trafficSessionId: session.traffic_session_id, eventType: "control_plane.checked_in", subjectType: "traffic_session", subjectId: session.traffic_session_id });
    return { traffic_session: session, actor_instance: this.command.actorDescriptor(actorInstance), orientation };
  }

  orientation({ tenantId, principalId, trafficSessionId, requestedResources = [], permissions = [] }) {
    const session = this.requireSession(tenantId, principalId, trafficSessionId);
    const traffic = requestedResources.flatMap((resource) => this.currentTraffic({ tenantId, resource })).filter(uniqueClaim);
    const continuityPointers = session.task_capsule_id ? [session.task_capsule_id] : [];
    const task = session.task_capsule_id ? this.continuity.requireTask(tenantId, session.task_capsule_id) : null;
    const packet = {
      orientation_packet_id: newId("orp"), tenant_id: tenantId, traffic_session_id: session.traffic_session_id,
      generated_at: this.now(), context_appetite: session.context_appetite,
      entities: [], domains: [], authority_map: [], continuity_pointers: continuityPointers,
      intelligence_pointers: task?.intelligence_references ?? [], recent_checkpoints: session.task_capsule_id ? this.continuity.recentCheckpoints(tenantId, session.task_capsule_id) : [],
      traffic, permissions, available_routes: [
        "intelligence.search", "intelligence.get", "continuity.resume", "source.resolve", "live.verify",
        "traffic.claim", "traffic.heartbeat", "traffic.checkpoint", "traffic.release", "traffic.checkout"
      ],
      retrieval_is_actor_directed: true
    };
    packet.revision_hash = stableHash({ ...packet, orientation_packet_id: undefined, generated_at: undefined });
    return packet;
  }

  declareClaim({ tenantId, principalId, trafficSessionId, resource, intent, scope = {} }) {
    const session = this.requireLiveSession(tenantId, principalId, trafficSessionId);
    const managedResource = this.resolveResource(tenantId, resource);
    const requested = {
      resource_claim_id: newId("rcl"), tenant_id: tenantId, traffic_session_id: trafficSessionId,
      actor_instance_id: session.actor_instance_id, resource_id: managedResource.resource_id, intent, scope,
      state: "planned", lease_expires_at: this.leaseExpiry()
    };
    const evaluation = this.evaluate(tenantId, requested);
    const timestamp = this.now();
    const claim = this.store.put("resourceClaims", {
      ...requested, coordination_level: evaluation.coordination_level, activated_at: null, released_at: null,
      related_artifact_references: [], revision: 1, created_at: timestamp, updated_at: timestamp
    });
    this.audit({ tenantId, principalId, actorInstanceId: session.actor_instance_id, trafficSessionId, eventType: "control_plane.claim_declared", subjectType: "resource_claim", subjectId: claim.resource_claim_id, metadata: { intent, disposition: evaluation.disposition } });
    return { claim, evaluation };
  }

  activateClaim({ tenantId, principalId, resourceClaimId, approval = false }) {
    const claim = this.store.requireTenant("resourceClaims", resourceClaimId, tenantId);
    const session = this.requireLiveSession(tenantId, principalId, claim.traffic_session_id);
    if (claim.state === "released" || claim.state === "stale") throw new SovereignError("claim_unavailable", "Released or stale claims cannot activate.", { status: 409 });
    const evaluation = this.evaluate(tenantId, { ...claim, state: "active" });
    if (evaluation.disposition === "denied" || (evaluation.disposition === "approval_required" && !approval)) {
      this.audit({ tenantId, principalId, actorInstanceId: session.actor_instance_id, trafficSessionId: session.traffic_session_id, eventType: "control_plane.claim_activation_denied", subjectType: "resource_claim", subjectId: claim.resource_claim_id, outcome: "denied", metadata: evaluation });
      throw new SovereignError(evaluation.disposition, "Resource Claim requires coordination before activation.", { status: 409, details: evaluation });
    }
    const timestamp = this.now();
    const activeClaim = this.store.update("resourceClaims", resourceClaimId, (current) => ({
      ...current, state: "active", activated_at: current.activated_at ?? timestamp, lease_expires_at: this.leaseExpiry(),
      coordination_level: evaluation.coordination_level, revision: current.revision + 1, updated_at: timestamp
    }));
    this.heartbeat({ tenantId, principalId, trafficSessionId: session.traffic_session_id, silent: true });
    this.audit({ tenantId, principalId, actorInstanceId: session.actor_instance_id, trafficSessionId: session.traffic_session_id, eventType: "control_plane.claim_activated", subjectType: "resource_claim", subjectId: resourceClaimId, metadata: { disposition: evaluation.disposition } });
    return { claim: activeClaim, evaluation };
  }

  heartbeat({ tenantId, principalId, trafficSessionId, silent = false }) {
    const session = this.requireLiveSession(tenantId, principalId, trafficSessionId);
    const timestamp = this.now();
    const updatedSession = this.store.update("trafficSessions", trafficSessionId, (current) => ({
      ...current, last_heartbeat_at: timestamp, lease_expires_at: this.leaseExpiry(), revision: current.revision + 1, updated_at: timestamp
    }));
    for (const claim of this.store.list("resourceClaims", (candidate) => candidate.traffic_session_id === trafficSessionId && OPEN_CLAIM_STATES.has(candidate.state))) {
      this.store.update("resourceClaims", claim.resource_claim_id, (current) => ({ ...current, lease_expires_at: this.leaseExpiry(), revision: current.revision + 1, updated_at: timestamp }));
    }
    if (!silent) this.audit({ tenantId, principalId, actorInstanceId: session.actor_instance_id, trafficSessionId, eventType: "control_plane.heartbeat", subjectType: "traffic_session", subjectId: trafficSessionId });
    return updatedSession;
  }

  checkpoint({ tenantId, principalId, trafficSessionId, kind = "progress", summary, nextAction, blockers = [], artifactReferences = [], sessionState }) {
    const session = this.requireLiveSession(tenantId, principalId, trafficSessionId);
    if (sessionState) {
      requireCondition(["active", "waiting", "blocked"].includes(sessionState), "invalid_checkpoint_state", "Checkpoint state must remain a live Traffic Session state.");
      this.store.update("trafficSessions", trafficSessionId, (current) => ({ ...current, state: sessionState, next_action: nextAction ?? current.next_action, revision: current.revision + 1, updated_at: this.now() }));
    }
    this.heartbeat({ tenantId, principalId, trafficSessionId, silent: true });
    const checkpoint = this.continuity.createCheckpoint({ tenantId, trafficSession: this.store.get("trafficSessions", trafficSessionId), kind, summary, nextAction, blockers, artifactReferences });
    this.audit({ tenantId, principalId, actorInstanceId: session.actor_instance_id, trafficSessionId, eventType: "continuity.checkpoint_created", subjectType: "traffic_checkpoint", subjectId: checkpoint.traffic_checkpoint_id });
    return checkpoint;
  }

  handoff({ tenantId, principalId, trafficSessionId, toActorInstanceId, taskCapsuleId, summary, nextAction }) {
    const session = this.requireLiveSession(tenantId, principalId, trafficSessionId);
    const handoff = this.continuity.createHandoff({ tenantId, fromTrafficSession: session, toActorInstanceId, taskCapsuleId: taskCapsuleId ?? session.task_capsule_id, summary, nextAction });
    this.checkpoint({ tenantId, principalId, trafficSessionId, kind: "handoff", summary, nextAction });
    return handoff;
  }

  releaseClaim({ tenantId, principalId, resourceClaimId }) {
    const claim = this.store.requireTenant("resourceClaims", resourceClaimId, tenantId);
    const session = this.requireSession(tenantId, principalId, claim.traffic_session_id);
    if (claim.state === "released") return claim;
    const timestamp = this.now();
    const released = this.store.update("resourceClaims", resourceClaimId, (current) => ({
      ...current, state: "released", released_at: timestamp, revision: current.revision + 1, updated_at: timestamp
    }));
    this.audit({ tenantId, principalId, actorInstanceId: session.actor_instance_id, trafficSessionId: session.traffic_session_id, eventType: "control_plane.claim_released", subjectType: "resource_claim", subjectId: resourceClaimId });
    return released;
  }

  checkout({ tenantId, principalId, trafficSessionId, state = "completed", outcome = {}, nextAction, blockers = [], artifactReferences = [] }) {
    const session = this.requireLiveSession(tenantId, principalId, trafficSessionId);
    requireCondition(["completed", "cancelled", "waiting", "blocked"].includes(state), "invalid_checkout_state", "Invalid checkout Traffic Session state.");
    for (const claim of this.store.list("resourceClaims", (candidate) => candidate.traffic_session_id === trafficSessionId && OPEN_CLAIM_STATES.has(candidate.state))) {
      this.releaseClaim({ tenantId, principalId, resourceClaimId: claim.resource_claim_id });
    }
    const timestamp = this.now();
    const checkedOut = this.store.update("trafficSessions", trafficSessionId, (current) => ({
      ...current, state, checked_out_at: timestamp, next_action: nextAction ?? current.next_action,
      outcome: { ...outcome, artifact_references: artifactReferences, blockers }, revision: current.revision + 1, updated_at: timestamp
    }));
    this.continuity.createCheckpoint({ tenantId, trafficSession: checkedOut, kind: "checkout", summary: `Traffic Session checked out as ${state}.`, nextAction, blockers, artifactReferences });
    this.audit({ tenantId, principalId, actorInstanceId: session.actor_instance_id, trafficSessionId, eventType: "control_plane.checked_out", subjectType: "traffic_session", subjectId: trafficSessionId, metadata: { state, artifactReferences } });
    return checkedOut;
  }

  currentTraffic({ tenantId, resource, includePlanned = true }) {
    this.sweepExpired(tenantId);
    const resolvedResource = typeof resource === "string" ? undefined : this.findResource(tenantId, resource);
    if (resource && typeof resource !== "string" && !resolvedResource) return [];
    const resourceId = typeof resource === "string" ? resource : resolvedResource?.resource_id;
    const claims = this.store.list("resourceClaims", (claim) => claim.tenant_id === tenantId && (includePlanned ? OPEN_CLAIM_STATES.has(claim.state) : claim.state === "active") && (!resourceId || claim.resource_id === resourceId));
    return claims.map((claim) => this.decorateClaim(claim));
  }

  trafficBoard({ tenantId }) {
    this.sweepExpired(tenantId);
    const claims = this.store.list("resourceClaims", (claim) => claim.tenant_id === tenantId && claim.state !== "released").map((claim) => this.decorateClaim(claim));
    const sessions = this.store.list("trafficSessions", (session) => session.tenant_id === tenantId && LIVE_SESSION_STATES.has(session.state));
    return { generated_at: this.now(), active_session_count: sessions.length, claims, sessions };
  }

  sweepExpired(tenantId) {
    const now = this.clock().getTime();
    const expired = this.store.list("trafficSessions", (session) => session.tenant_id === tenantId && LIVE_SESSION_STATES.has(session.state) && new Date(session.lease_expires_at).getTime() <= now);
    for (const session of expired) {
      const timestamp = this.now();
      this.store.update("trafficSessions", session.traffic_session_id, (current) => ({ ...current, state: "stale", revision: current.revision + 1, updated_at: timestamp }));
      for (const claim of this.store.list("resourceClaims", (candidate) => candidate.traffic_session_id === session.traffic_session_id && OPEN_CLAIM_STATES.has(candidate.state))) {
        this.store.update("resourceClaims", claim.resource_claim_id, (current) => ({ ...current, state: "stale", revision: current.revision + 1, updated_at: timestamp }));
      }
      this.audit({ tenantId, principalId: session.principal_id, actorInstanceId: session.actor_instance_id, trafficSessionId: session.traffic_session_id, eventType: "control_plane.session_stale", subjectType: "traffic_session", subjectId: session.traffic_session_id, metadata: { reason: "lease_expired" } });
    }
    return expired.length;
  }

  evaluate(tenantId, requested) {
    const current = this.store.list("resourceClaims", (claim) => claim.tenant_id === tenantId && claim.resource_id === requested.resource_id && claim.resource_claim_id !== requested.resource_claim_id && (OPEN_CLAIM_STATES.has(claim.state) || claim.state === "stale"))
      .map((claim) => this.decorateClaim(claim));
    return evaluateClaim({ requested, existingClaims: current, policy: this.policy });
  }

  resolveResource(tenantId, resource) {
    requireCondition(resource?.type && resource?.authority && resource?.locator, "resource_required", "Resource type, authority, and locator are required.");
    const existing = this.findResource(tenantId, resource);
    if (existing) return existing;
    const timestamp = this.now();
    return this.store.put("resources", {
      resource_id: newId("res"), tenant_id: tenantId, resource_type: resource.type, authority: resource.authority,
      canonical_locator: resource.locator, display_name: resource.displayName ?? null, metadata: resource.metadata ?? {},
      revision: 1, created_at: timestamp, updated_at: timestamp
    });
  }

  findResource(tenantId, resource) {
    if (!resource?.type || !resource?.authority || !resource?.locator) return undefined;
    return this.store.list("resources", (candidate) => candidate.tenant_id === tenantId && candidate.resource_type === resource.type && candidate.authority === resource.authority && candidate.canonical_locator === resource.locator)[0];
  }

  requireSession(tenantId, principalId, trafficSessionId) {
    const session = this.store.requireTenant("trafficSessions", trafficSessionId, tenantId);
    if (session.principal_id !== principalId) throw new SovereignError("session_principal_mismatch", "Traffic Session belongs to another principal.", { status: 403 });
    return session;
  }

  requireLiveSession(tenantId, principalId, trafficSessionId) {
    this.sweepExpired(tenantId);
    const session = this.requireSession(tenantId, principalId, trafficSessionId);
    if (!LIVE_SESSION_STATES.has(session.state)) throw new SovereignError("session_not_live", "Traffic Session is not live.", { status: 409 });
    return session;
  }

  decorateClaim(claim) {
    const session = this.store.get("trafficSessions", claim.traffic_session_id);
    return { ...claim, actor_instance_id: session?.actor_instance_id, traffic_session_state: session?.state, objective: session?.objective };
  }

  audit({ tenantId, principalId, actorInstanceId, trafficSessionId, eventType, subjectType, subjectId, outcome = "success", metadata = {} }) {
    const event = { audit_event_id: newId("aud"), tenant_id: tenantId, occurred_at: this.now(), event_type: eventType, subject_type: subjectType, subject_id: subjectId, principal_id: principalId, actor_instance_id: actorInstanceId ?? null, traffic_session_id: trafficSessionId ?? null, outcome, metadata };
    return this.store.put("auditEvents", event);
  }

  leaseExpiry() { return new Date(this.clock().getTime() + this.policy.leaseTtlSeconds * 1000).toISOString(); }
  now() { return this.clock().toISOString(); }
}

function uniqueClaim(claim, index, claims) {
  return claims.findIndex((candidate) => candidate.resource_claim_id === claim.resource_claim_id) === index;
}
