import { stableHash } from "../platform/ids.mjs";
import { TrafficService } from "./traffic-service.mjs";

export class V1TrafficService extends TrafficService {
  constructor({ intelligence, sources, extensions, ...options }) {
    super(options);
    this.intelligence = intelligence;
    this.sources = sources;
    this.extensions = extensions;
  }

  orientation({ tenantId, principalId, trafficSessionId, requestedResources = [], permissions = [] }) {
    this.sweepExpired(tenantId);
    const session = this.requireSession(tenantId, principalId, trafficSessionId);
    const task = session.task_capsule_id ? this.continuity.requireTask(tenantId, session.task_capsule_id) : null;
    const resume = task ? this.continuity.resumePacket({
      tenantId,
      taskCapsuleId: task.task_capsule_id,
      currentTraffic: this.currentTraffic({ tenantId })
    }) : null;

    const allTraffic = this.currentTraffic({ tenantId });
    const traffic = requestedResources.length
      ? requestedResources.flatMap((resource) => this.currentTraffic({ tenantId, resource })).filter(uniqueClaim)
      : allTraffic;
    const sourceMap = this.sourceMap(tenantId);
    const records = this.intelligence?.listRecords?.({ tenantId, includeHistorical: false }) ?? [];
    const canonicalStatus = this.intelligence?.canonicalStatus?.({ tenantId }) ?? { current_canonical_revision: 0 };
    const installedExtensions = this.installedExtensions(tenantId);
    const entities = recordPointers(records, "entity");
    const projects = recordPointers(records, "project");
    const domains = recordPointers(records, "domain");
    const warnings = buildWarnings({ traffic: allTraffic, sources: sourceMap, task, resume });
    const actor = this.store.get("actorInstances", session.actor_instance_id);
    const tenant = this.store.requireTenant("tenants", tenantId, tenantId);

    const packet = {
      orientation_packet_id: `orp_${stableHash({ tenantId, trafficSessionId, generatedAt: this.now() })}`,
      tenant: {
        tenant_id: tenantId,
        display_name: tenant.display_name,
        command_display_name: tenant.command_display_name
      },
      principal_id: principalId,
      traffic_session_id: session.traffic_session_id,
      actor: actor ? this.command.actorDescriptor(actor) : null,
      task: task ? taskPointer(task) : null,
      generated_at: this.now(),
      context_appetite: session.context_appetite,
      projects,
      entities,
      domains,
      authority_map: sourceMap.map((source) => ({
        source_id: source.source_id,
        display_name: source.display_name,
        authority_state: source.authority_state,
        data_classification: source.data_classification,
        currentness: source.currentness
      })),
      source_map: sourceMap,
      privacy_boundaries: privacyBoundaries(sourceMap),
      continuity: resume ? {
        task_capsule_id: task.task_capsule_id,
        next_action: resume.next_action,
        blockers: resume.blockers,
        latest_checkpoint: resume.latest_checkpoint ? checkpointPointer(resume.latest_checkpoint) : null,
        pending_handoff: resume.pending_handoff ? handoffPointer(resume.pending_handoff) : null,
        resumable: resume.resumable
      } : null,
      continuity_pointers: task ? [task.task_capsule_id] : [],
      intelligence: {
        current_canonical_revision: Number(canonicalStatus.current_canonical_revision ?? 0),
        active_record_count: Number(canonicalStatus.active_record_count ?? records.length),
        unresolved_candidate_count: Number(canonicalStatus.pending_candidate_count ?? this.store.list("candidateIntelligence", (candidate) => candidate.tenant_id === tenantId && ["proposed", "under_review"].includes(candidate.state)).length),
        pointers: uniqueStrings([...(task?.intelligence_references ?? []), ...records.slice(0, 20).map((record) => record.canonical_record_id)])
      },
      traffic,
      traffic_revision: stableHash(traffic.map(trafficFingerprint)),
      warnings,
      permissions: [...permissions],
      extensions: installedExtensions,
      available_routes: availableRoutes(permissions, installedExtensions),
      retrieval_modes: ["lean", "standard", "broad", "deep", "custom"],
      retrieval_is_actor_directed: true,
      orientation_trace: [
        "command.tenant",
        "command.principal",
        "control.traffic",
        "intelligence.canonical",
        "intelligence.sources",
        ...(task ? ["continuity.task", "continuity.checkpoints"] : []),
        ...(installedExtensions.length ? ["extensions.installed"] : [])
      ]
    };
    packet.revision_hash = stableHash(stablePacket(packet));
    return packet;
  }

  trafficBoard({ tenantId }) {
    const base = super.trafficBoard({ tenantId });
    const checkpoints = this.store.list("trafficCheckpoints", (checkpoint) => checkpoint.tenant_id === tenantId);
    const checkpointBySession = new Map();
    for (const checkpoint of checkpoints.sort((left, right) => right.created_at.localeCompare(left.created_at))) {
      if (!checkpointBySession.has(checkpoint.traffic_session_id)) checkpointBySession.set(checkpoint.traffic_session_id, checkpoint);
    }
    const sessions = base.sessions.map((session) => {
      const actor = this.store.get("actorInstances", session.actor_instance_id);
      return {
        ...session,
        actor: actor ? this.command.actorDescriptor(actor) : null,
        latest_checkpoint: checkpointBySession.get(session.traffic_session_id) ?? null,
        heartbeat_age_seconds: Math.max(0, Math.floor((this.clock().getTime() - new Date(session.last_heartbeat_at).getTime()) / 1000)),
        lease_remaining_seconds: Math.max(0, Math.floor((new Date(session.lease_expires_at).getTime() - this.clock().getTime()) / 1000))
      };
    });
    return {
      ...base,
      sessions,
      warning_count: base.claims.filter((claim) => ["caution", "exclusive"].includes(claim.coordination_level)).length,
      stale_session_count: this.store.list("trafficSessions", (session) => session.tenant_id === tenantId && session.state === "stale").length,
      traffic_revision: stableHash({ sessions: sessions.map(sessionFingerprint), claims: base.claims.map(trafficFingerprint) })
    };
  }

  sourceMap(tenantId) {
    const sources = this.sources?.listSources?.(tenantId) ?? this.store.list("sources", (source) => source.tenant_id === tenantId);
    return sources.map((source) => ({
      source_id: source.source_id,
      display_name: source.display_name,
      source_category: source.source_category,
      authority_state: source.authority_state,
      connection_state: source.connection_state,
      processing_state: source.processing_state,
      currentness: source.currentness,
      health_state: source.health_state,
      data_classification: source.data_classification,
      item_count: source.item_count,
      analyzed_item_count: source.analyzed_item_count,
      last_verified_at: source.last_verified_at,
      failure_reason: source.failure_reason ?? null
    }));
  }

  installedExtensions(tenantId) {
    const installations = this.store.list("extensionInstallations", (installation) => installation.tenant_id === tenantId && installation.state === "active");
    return installations.map((installation) => {
      const extension = this.store.get("extensions", installation.extension_id);
      const grant = this.store.list("extensionGrants", (candidate) => candidate.tenant_id === tenantId && candidate.extension_installation_id === installation.extension_installation_id && candidate.state === "active")[0];
      return {
        extension_id: installation.extension_id,
        extension_installation_id: installation.extension_installation_id,
        name: extension?.manifest?.name ?? extension?.manifest?.id ?? installation.extension_id,
        version: extension?.manifest?.version ?? null,
        launch_url: extension?.manifest?.ui?.launch_url ?? extension?.manifest?.launch_url ?? null,
        granted_scopes: grant?.granted_scopes ?? []
      };
    });
  }
}

function recordPointers(records, type) {
  return records.filter((record) => record.record_type === type).slice(0, 20).map((record) => ({
    canonical_record_id: record.canonical_record_id,
    label: record.payload?.name ?? record.payload?.title ?? record.payload?.statement ?? record.payload?.label ?? record.canonical_record_id,
    confidence: record.confidence,
    authority_level: record.authority_level,
    canonical_revision: record.current_canonical_revision
  }));
}

function taskPointer(task) {
  return {
    task_capsule_id: task.task_capsule_id,
    title: task.title,
    objective: task.objective,
    state: task.state,
    next_action: task.next_action,
    blockers: task.blockers ?? []
  };
}

function checkpointPointer(checkpoint) {
  return {
    traffic_checkpoint_id: checkpoint.traffic_checkpoint_id,
    kind: checkpoint.kind,
    summary: checkpoint.summary,
    next_action: checkpoint.next_action,
    created_at: checkpoint.created_at
  };
}

function handoffPointer(handoff) {
  return {
    handoff_id: handoff.handoff_id,
    state: handoff.state,
    summary: handoff.summary,
    next_action: handoff.next_action,
    to_actor_instance_id: handoff.to_actor_instance_id
  };
}

function privacyBoundaries(sources) {
  return uniqueStrings(sources.map((source) => source.data_classification).filter(Boolean)).map((classification) => ({
    data_classification: classification,
    enforcement: "command_policy"
  }));
}

function buildWarnings({ traffic, sources, task, resume }) {
  const warnings = [];
  for (const claim of traffic) {
    if (["caution", "exclusive"].includes(claim.coordination_level)) {
      warnings.push({ kind: "traffic", severity: claim.coordination_level === "exclusive" ? "high" : "medium", message: `${claim.objective ?? "Another actor"} has ${claim.coordination_level} overlap on ${claim.resource_id}.`, resource_claim_id: claim.resource_claim_id });
    }
  }
  for (const source of sources) {
    if (["failed", "stale", "partial"].includes(source.currentness) || source.health_state === "failed") {
      warnings.push({ kind: "source", severity: source.health_state === "failed" ? "high" : "medium", message: `${source.display_name} is ${source.health_state}/${source.currentness}.`, source_id: source.source_id });
    }
  }
  if (task?.state === "blocked" || resume?.blockers?.length) {
    warnings.push({ kind: "continuity", severity: "medium", message: `Task has ${resume?.blockers?.length ?? task.blockers?.length ?? 0} recorded blocker(s).`, task_capsule_id: task.task_capsule_id });
  }
  return warnings;
}

function availableRoutes(permissions, extensions) {
  const permissionSet = new Set(permissions);
  const routes = ["orientation.refresh"];
  if (permissionSet.has("intelligence:read") || permissionSet.has("control_plane.use")) routes.push("intelligence.search", "intelligence.get", "source.resolve");
  if (permissionSet.has("continuity:read") || permissionSet.has("control_plane.use")) routes.push("continuity.resume");
  if (permissionSet.has("traffic:write") || permissionSet.has("control_plane.use")) routes.push("traffic.claim", "traffic.heartbeat", "traffic.checkpoint", "traffic.release", "traffic.checkout");
  if (permissionSet.has("intelligence:propose")) routes.push("intelligence.canonical.propose");
  for (const extension of extensions) if (extension.launch_url) routes.push(`extension:${extension.extension_id}`);
  return uniqueStrings(routes);
}

function stablePacket(packet) {
  const { orientation_packet_id: _id, generated_at: _generated, ...stable } = packet;
  return stable;
}

function trafficFingerprint(claim) {
  return {
    resource_claim_id: claim.resource_claim_id,
    resource_id: claim.resource_id,
    traffic_session_id: claim.traffic_session_id,
    intent: claim.intent,
    scope: claim.scope,
    state: claim.state,
    coordination_level: claim.coordination_level,
    lease_expires_at: claim.lease_expires_at
  };
}

function sessionFingerprint(session) {
  return {
    traffic_session_id: session.traffic_session_id,
    actor_instance_id: session.actor_instance_id,
    task_capsule_id: session.task_capsule_id,
    objective: session.objective,
    state: session.state,
    last_heartbeat_at: session.last_heartbeat_at,
    lease_expires_at: session.lease_expires_at
  };
}

function uniqueClaim(claim, index, claims) {
  return claims.findIndex((candidate) => candidate.resource_claim_id === claim.resource_claim_id) === index;
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}
