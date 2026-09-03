const READ_ONLY = new Set(["observe", "read", "plan"]);
const CRITICAL = new Set(["deploy", "migrate", "admin", "destructive"]);

export const DEFAULT_TRAFFIC_POLICY = Object.freeze({
  leaseTtlSeconds: 300,
  staleTrafficDisposition: "caution",
  requireApprovalFor: ["deploy", "migrate", "admin", "destructive"]
});

export function evaluateClaim({ requested, existingClaims, policy = DEFAULT_TRAFFIC_POLICY }) {
  const conflicts = existingClaims.map((existing) => evaluatePair(requested, existing, policy)).filter(Boolean);
  const disposition = conflicts.some((conflict) => conflict.disposition === "denied") ? "denied"
    : conflicts.some((conflict) => conflict.disposition === "approval_required") ? "approval_required"
      : conflicts.some((conflict) => conflict.disposition === "caution") ? "caution" : "safe";
  return {
    disposition,
    coordination_level: disposition === "approval_required" || requested.intent === "deploy" || requested.intent === "migrate" || requested.intent === "admin" || requested.intent === "destructive"
      ? "exclusive" : disposition === "caution" ? "caution" : "shared",
    conflicts
  };
}

function evaluatePair(requested, existing, policy) {
  if (requested.resource_id !== existing.resource_id) return null;
  if (!scopesMayOverlap(requested.scope, existing.scope)) return null;

  if (existing.state === "stale") {
    return conflict(existing, "caution", "stale_traffic", "An expired claim remains visible; confirm the target before acting.");
  }

  const requestedCritical = CRITICAL.has(requested.intent) || policy.requireApprovalFor.includes(requested.intent);
  const existingCritical = CRITICAL.has(existing.intent) || policy.requireApprovalFor.includes(existing.intent);
  if (requestedCritical || existingCritical) {
    return conflict(existing, "approval_required", "critical_target", "A critical operation targets the same managed resource scope.");
  }

  if (READ_ONLY.has(requested.intent) && READ_ONLY.has(existing.intent)) return null;

  const branchRelation = branchRelationship(requested.scope, existing.scope);
  if (branchRelation === "different") {
    if (hasOverlappingPaths(requested.scope.paths, existing.scope.paths)) {
      return conflict(existing, "caution", "likely_merge_overlap", "Separate branches include overlapping paths and may conflict during integration.");
    }
    return null;
  }

  // A declared plan is traffic awareness, not an implicit hard lock. It still
  // warns a second actor targeting the same unsplit scope, but it cannot stop
  // that actor from beginning work before the original plan is activated.
  if (existing.state === "planned") {
    return conflict(existing, "caution", "planned_overlap", "Another actor plans work on the same target; coordinate before both become active.");
  }

  if (READ_ONLY.has(requested.intent) || READ_ONLY.has(existing.intent)) {
    if (requested.scope.requires_freshness || existing.scope.requires_freshness) {
      return conflict(existing, "caution", "freshness_risk", "A read/plan target may be changing and freshness was requested.");
    }
    return null;
  }

  return conflict(existing, "approval_required", "same_target_write", "Concurrent write-capable work targets the same branch, worktree, or unsplit resource scope.");
}

function conflict(existing, disposition, reason, message) {
  return {
    disposition, reason, message, resource_claim_id: existing.resource_claim_id,
    traffic_session_id: existing.traffic_session_id, actor_instance_id: existing.actor_instance_id,
    intent: existing.intent, state: existing.state, scope: existing.scope
  };
}

function scopesMayOverlap(left = {}, right = {}) {
  for (const key of ["environment", "database", "schema", "object_reference"]) {
    if (left[key] && right[key] && left[key] !== right[key]) return false;
  }
  return true;
}

function branchRelationship(left = {}, right = {}) {
  if (left.worktree && right.worktree && left.worktree === right.worktree) return "same";
  if (left.branch && right.branch) return left.branch === right.branch ? "same" : "different";
  return "unknown";
}

function hasOverlappingPaths(leftPaths, rightPaths) {
  if (!leftPaths?.length || !rightPaths?.length) return false;
  return leftPaths.some((left) => rightPaths.some((right) => pathOverlaps(left, right)));
}

function pathOverlaps(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}
