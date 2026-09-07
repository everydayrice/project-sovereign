import { newId } from "../platform/ids.mjs";
import { SovereignError, requireCondition } from "../platform/errors.mjs";

const TASK_STATES = new Set(["planned", "active", "waiting", "blocked", "completed", "cancelled"]);
const SESSION_STATES = new Set(["active", "waiting", "blocked", "closed", "stale"]);
const MEMORY_STATES = new Set(["proposed", "accepted", "rejected", "superseded"]);
const IDEA_STATES = new Set(["captured", "developing", "parked", "promoted", "archived"]);

export class ContinuityService {
  constructor({ store, clock }) {
    this.store = store;
    this.clock = clock;
  }

  createTaskCapsule({ tenantId, ownerPrincipalId, title, objective, nextAction, state = "active", blockers = [], intelligenceReferences = [] }) {
    requireCondition(title?.trim() && objective?.trim(), "task_identity_required", "Task title and objective are required.");
    requireCondition(TASK_STATES.has(state), "task_state_invalid", "Task state is invalid.");
    const timestamp = this.now();
    return this.store.put("taskCapsules", {
      task_capsule_id: newId("tsk"), tenant_id: tenantId, owner_principal_id: ownerPrincipalId,
      title: title.trim(), objective: objective.trim(), state, next_action: nextAction ?? null,
      blockers: normalizeStrings(blockers), intelligence_references: normalizeReferences(intelligenceReferences),
      revision: 1, created_at: timestamp, updated_at: timestamp
    });
  }

  updateTaskCapsule({ tenantId, taskCapsuleId, title, objective, state, nextAction, blockers, intelligenceReferences }) {
    const task = this.requireTask(tenantId, taskCapsuleId);
    if (state !== undefined) requireCondition(TASK_STATES.has(state), "task_state_invalid", "Task state is invalid.");
    const timestamp = this.now();
    return this.store.update("taskCapsules", task.task_capsule_id, (current) => ({
      ...current,
      ...(title !== undefined ? { title: String(title).trim() } : {}),
      ...(objective !== undefined ? { objective: String(objective).trim() } : {}),
      ...(state !== undefined ? { state } : {}),
      ...(nextAction !== undefined ? { next_action: nextAction || null } : {}),
      ...(blockers !== undefined ? { blockers: normalizeStrings(blockers) } : {}),
      ...(intelligenceReferences !== undefined ? { intelligence_references: normalizeReferences(intelligenceReferences) } : {}),
      revision: current.revision + 1,
      updated_at: timestamp
    }));
  }

  listTasks(tenantId, { states } = {}) {
    const allowedStates = states?.length ? new Set(states) : null;
    return this.store.list("taskCapsules", (task) => task.tenant_id === tenantId && (!allowedStates || allowedStates.has(task.state)))
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  }

  requireTask(tenantId, taskCapsuleId) {
    return this.store.requireTenant("taskCapsules", taskCapsuleId, tenantId);
  }

  createSessionCapsule({ tenantId, actorInstanceId, taskCapsuleId, state = "active", workingAssumptions = [], unresolvedQuestions = [], resumeState = {} }) {
    requireCondition(actorInstanceId, "session_actor_required", "Session Capsule requires an Actor Instance.");
    requireCondition(SESSION_STATES.has(state), "session_state_invalid", "Session state is invalid.");
    this.store.requireTenant("actorInstances", actorInstanceId, tenantId);
    if (taskCapsuleId) this.requireTask(tenantId, taskCapsuleId);
    const timestamp = this.now();
    return this.store.put("sessionCapsules", {
      session_capsule_id: newId("ses"), tenant_id: tenantId, actor_instance_id: actorInstanceId,
      task_capsule_id: taskCapsuleId ?? null, state,
      working_assumptions: normalizeStrings(workingAssumptions), unresolved_questions: normalizeStrings(unresolvedQuestions),
      resume_state: normalizeObject(resumeState), revision: 1, created_at: timestamp, updated_at: timestamp
    });
  }

  updateSessionCapsule({ tenantId, sessionCapsuleId, state, workingAssumptions, unresolvedQuestions, resumeState }) {
    const session = this.store.requireTenant("sessionCapsules", sessionCapsuleId, tenantId);
    if (state !== undefined) requireCondition(SESSION_STATES.has(state), "session_state_invalid", "Session state is invalid.");
    return this.store.update("sessionCapsules", session.session_capsule_id, (current) => ({
      ...current,
      ...(state !== undefined ? { state } : {}),
      ...(workingAssumptions !== undefined ? { working_assumptions: normalizeStrings(workingAssumptions) } : {}),
      ...(unresolvedQuestions !== undefined ? { unresolved_questions: normalizeStrings(unresolvedQuestions) } : {}),
      ...(resumeState !== undefined ? { resume_state: normalizeObject(resumeState) } : {}),
      revision: current.revision + 1,
      updated_at: this.now()
    }));
  }

  listSessions(tenantId, { taskCapsuleId, states } = {}) {
    const allowedStates = states?.length ? new Set(states) : null;
    return this.store.list("sessionCapsules", (session) =>
      session.tenant_id === tenantId &&
      (!taskCapsuleId || session.task_capsule_id === taskCapsuleId) &&
      (!allowedStates || allowedStates.has(session.state))
    ).sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  }

  createCandidateMemory({ tenantId, principalId, actorInstanceId, kind, content, provenanceIds = [], state = "proposed" }) {
    requireCondition(kind?.trim(), "candidate_memory_kind_required", "Candidate memory kind is required.");
    requireCondition(MEMORY_STATES.has(state), "candidate_memory_state_invalid", "Candidate memory state is invalid.");
    const timestamp = this.now();
    return this.store.put("candidateMemories", {
      candidate_memory_id: newId("mem"), tenant_id: tenantId, kind: kind.trim(), content: normalizeObject(content), state,
      provenance_ids: normalizeReferences(provenanceIds), proposed_by_principal_id: principalId,
      proposed_by_actor_instance_id: actorInstanceId ?? null, revision: 1, created_at: timestamp, updated_at: timestamp
    });
  }

  listCandidateMemories(tenantId, { states } = {}) {
    const allowed = states?.length ? new Set(states) : null;
    return this.store.list("candidateMemories", (memory) => memory.tenant_id === tenantId && (!allowed || allowed.has(memory.state)))
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  }

  createIdea({ tenantId, ownerPrincipalId, title, description, state = "captured", tags = [], sourceReferences = [], intelligenceReferences = [], taskCapsuleId }) {
    requireCondition(title?.trim(), "idea_title_required", "Idea title is required.");
    requireCondition(IDEA_STATES.has(state), "idea_state_invalid", "Idea state is invalid.");
    if (taskCapsuleId) this.requireTask(tenantId, taskCapsuleId);
    const timestamp = this.now();
    return this.store.put("ideas", {
      idea_id: newId("idea"), tenant_id: tenantId, owner_principal_id: ownerPrincipalId,
      title: title.trim(), description: description?.trim() || null, state,
      tags: normalizeStrings(tags), source_references: normalizeReferences(sourceReferences),
      intelligence_references: normalizeReferences(intelligenceReferences), task_capsule_id: taskCapsuleId ?? null,
      revision: 1, created_at: timestamp, updated_at: timestamp
    });
  }

  updateIdea({ tenantId, ideaId, title, description, state, tags, sourceReferences, intelligenceReferences, taskCapsuleId }) {
    const idea = this.store.requireTenant("ideas", ideaId, tenantId);
    if (state !== undefined) requireCondition(IDEA_STATES.has(state), "idea_state_invalid", "Idea state is invalid.");
    if (taskCapsuleId) this.requireTask(tenantId, taskCapsuleId);
    return this.store.update("ideas", idea.idea_id, (current) => ({
      ...current,
      ...(title !== undefined ? { title: String(title).trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
      ...(state !== undefined ? { state } : {}),
      ...(tags !== undefined ? { tags: normalizeStrings(tags) } : {}),
      ...(sourceReferences !== undefined ? { source_references: normalizeReferences(sourceReferences) } : {}),
      ...(intelligenceReferences !== undefined ? { intelligence_references: normalizeReferences(intelligenceReferences) } : {}),
      ...(taskCapsuleId !== undefined ? { task_capsule_id: taskCapsuleId || null } : {}),
      revision: current.revision + 1,
      updated_at: this.now()
    }));
  }

  listIdeas(tenantId, { states } = {}) {
    const allowed = states?.length ? new Set(states) : null;
    return this.store.list("ideas", (idea) => idea.tenant_id === tenantId && (!allowed || allowed.has(idea.state)))
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  }

  createCheckpoint({ tenantId, trafficSession, kind = "progress", summary, nextAction, blockers = [], artifactReferences = [] }) {
    requireCondition(summary?.trim(), "checkpoint_summary_required", "Checkpoint summary is required.");
    const timestamp = this.now();
    const checkpoint = this.store.put("trafficCheckpoints", {
      traffic_checkpoint_id: newId("tcp"), tenant_id: tenantId,
      traffic_session_id: trafficSession.traffic_session_id, task_capsule_id: trafficSession.task_capsule_id ?? null,
      kind, summary: summary.trim(), next_action: nextAction ?? null, blockers: normalizeStrings(blockers), artifact_references: normalizeReferences(artifactReferences),
      created_by: { principal_id: trafficSession.principal_id, actor_instance_id: trafficSession.actor_instance_id, traffic_session_id: trafficSession.traffic_session_id },
      revision: 1, created_at: timestamp, updated_at: timestamp
    });
    if (trafficSession.task_capsule_id) {
      this.store.update("taskCapsules", trafficSession.task_capsule_id, (task) => ({
        ...task, next_action: nextAction ?? task.next_action, blockers: normalizeStrings(blockers), revision: task.revision + 1, updated_at: timestamp
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
    requireCondition(summary?.trim(), "handoff_summary_required", "Handoff summary is required.");
    this.requireTask(tenantId, taskCapsuleId);
    const timestamp = this.now();
    return this.store.put("handoffs", {
      handoff_id: newId("hnd"), tenant_id: tenantId,
      from_traffic_session_id: fromTrafficSession.traffic_session_id, to_actor_instance_id: toActorInstanceId ?? null,
      task_capsule_id: taskCapsuleId, summary: summary.trim(), next_action: nextAction ?? null, state: "offered",
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

  completeHandoff({ tenantId, handoffId }) {
    const handoff = this.store.requireTenant("handoffs", handoffId, tenantId);
    if (handoff.state !== "accepted") throw new SovereignError("handoff_not_accepted", "Handoff must be accepted before completion.", { status: 409 });
    return this.store.update("handoffs", handoffId, (current) => ({ ...current, state: "completed", completed_at: this.now() }));
  }

  resumePacket({ tenantId, taskCapsuleId, currentTraffic = [], checkpointLimit = 5 }) {
    const task = this.requireTask(tenantId, taskCapsuleId);
    const checkpoints = this.recentCheckpoints(tenantId, taskCapsuleId, checkpointLimit);
    const sessions = this.listSessions(tenantId, { taskCapsuleId });
    const handoffs = this.store.list("handoffs", (handoff) => handoff.tenant_id === tenantId && handoff.task_capsule_id === taskCapsuleId)
      .sort((left, right) => right.created_at.localeCompare(left.created_at));
    const memories = this.listCandidateMemories(tenantId, { states: ["accepted", "proposed"] });
    return {
      task,
      latest_checkpoint: checkpoints[0] ?? null,
      recent_checkpoints: checkpoints,
      latest_session: sessions[0] ?? null,
      recent_sessions: sessions.slice(0, 5),
      pending_handoff: handoffs.find((handoff) => ["offered", "accepted"].includes(handoff.state)) ?? null,
      recent_handoffs: handoffs.slice(0, 5),
      candidate_memories: memories.slice(0, 10),
      intelligence_references: task.intelligence_references ?? [],
      current_traffic: currentTraffic,
      next_action: task.next_action ?? checkpoints[0]?.next_action ?? null,
      blockers: task.blockers ?? [],
      resumable: !["completed", "cancelled"].includes(task.state)
    };
  }

  now() { return this.clock().toISOString(); }
}

function normalizeStrings(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value).trim()).filter(Boolean);
}

function normalizeReferences(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => typeof value === "string" ? value : structuredClone(value));
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return structuredClone(value);
}
