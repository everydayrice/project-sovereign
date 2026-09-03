import { newId } from "../platform/ids.mjs";
import { SovereignError } from "../platform/errors.mjs";

export class ContinuityService {
  constructor({ store, clock }) {
    this.store = store;
    this.clock = clock;
  }

  createTaskCapsule({ tenantId, ownerPrincipalId, title, objective, nextAction }) {
    const timestamp = this.now();
    return this.store.put("taskCapsules", {
      task_capsule_id: newId("tsk"), tenant_id: tenantId, owner_principal_id: ownerPrincipalId,
      title, objective, state: "active", next_action: nextAction ?? null, blockers: [], intelligence_references: [],
      revision: 1, created_at: timestamp, updated_at: timestamp
    });
  }

  requireTask(tenantId, taskCapsuleId) {
    return this.store.requireTenant("taskCapsules", taskCapsuleId, tenantId);
  }

  createCheckpoint({ tenantId, trafficSession, kind = "progress", summary, nextAction, blockers = [], artifactReferences = [] }) {
    const timestamp = this.now();
    const checkpoint = this.store.put("trafficCheckpoints", {
      traffic_checkpoint_id: newId("tcp"), tenant_id: tenantId,
      traffic_session_id: trafficSession.traffic_session_id, task_capsule_id: trafficSession.task_capsule_id ?? null,
      kind, summary, next_action: nextAction ?? null, blockers, artifact_references: artifactReferences,
      created_by: { principal_id: trafficSession.principal_id, actor_instance_id: trafficSession.actor_instance_id, traffic_session_id: trafficSession.traffic_session_id },
      revision: 1, created_at: timestamp, updated_at: timestamp
    });
    if (trafficSession.task_capsule_id) {
      this.store.update("taskCapsules", trafficSession.task_capsule_id, (task) => ({
        ...task, next_action: nextAction ?? task.next_action, blockers, revision: task.revision + 1, updated_at: timestamp
      }));
    }
    return checkpoint;
  }

  recentCheckpoints(tenantId, taskCapsuleId, limit = 5) {
    if (!taskCapsuleId) return [];
    this.requireTask(tenantId, taskCapsuleId);
    return this.store.list("trafficCheckpoints", (checkpoint) => checkpoint.tenant_id === tenantId && checkpoint.task_capsule_id === taskCapsuleId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  }

  createHandoff({ tenantId, fromTrafficSession, toActorInstanceId, taskCapsuleId, summary, nextAction }) {
    if (!taskCapsuleId) throw new SovereignError("handoff_task_required", "A handoff requires a Task Capsule.");
    this.requireTask(tenantId, taskCapsuleId);
    const timestamp = this.now();
    return this.store.put("handoffs", {
      handoff_id: newId("hnd"), tenant_id: tenantId,
      from_traffic_session_id: fromTrafficSession.traffic_session_id, to_actor_instance_id: toActorInstanceId ?? null,
      task_capsule_id: taskCapsuleId, summary, next_action: nextAction ?? null, state: "offered",
      created_at: timestamp, accepted_at: null, completed_at: null
    });
  }

  acceptHandoff({ tenantId, handoffId, actorInstanceId }) {
    const handoff = this.store.requireTenant("handoffs", handoffId, tenantId);
    if (handoff.state !== "offered") throw new SovereignError("handoff_unavailable", "Handoff is not available.", { status: 409 });
    if (handoff.to_actor_instance_id && handoff.to_actor_instance_id !== actorInstanceId) {
      throw new SovereignError("handoff_not_assigned", "Handoff is assigned to another Actor Instance.", { status: 403 });
    }
    return this.store.update("handoffs", handoffId, (current) => ({
      ...current, to_actor_instance_id: actorInstanceId, state: "accepted", accepted_at: this.now()
    }));
  }

  now() { return this.clock().toISOString(); }
}
