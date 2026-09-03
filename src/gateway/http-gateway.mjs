import { SovereignError } from "../platform/errors.mjs";
import { trafficBoardHtml } from "../console/traffic-board.mjs";

export function createHttpGateway({ platform, authenticate }) {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") return json({ status: "ok", runtime: "in_memory_alpha", authentication: "not_configured" });
      try {
        const auth = await authenticate(request);
        const response = await route({ request, url, auth, platform });
        return response ?? json({ code: "not_found", message: "Route was not found." }, 404);
      } catch (error) {
        return errorResponse(error);
      }
    }
  };
}

async function route({ request, url, auth, platform }) {
  const { traffic, continuity } = platform;
  const base = { tenantId: auth.tenantId, principalId: auth.principalId };
  const path = url.pathname;

  if (request.method === "POST" && path === "/v1/continuity/tasks") {
    const body = await bodyJson(request);
    const task = continuity.createTaskCapsule({ ...base, ownerPrincipalId: auth.principalId, title: body.title, objective: body.objective, nextAction: body.next_action });
    return json({ task_capsule: task }, 201);
  }
  if (request.method === "POST" && path === "/v1/control-plane/check-in") {
    const body = await bodyJson(request);
    const result = traffic.checkIn({ ...base, actor: body.actor, objective: body.objective, taskCapsuleId: body.task_capsule_id, parentTrafficSessionId: body.parent_traffic_session_id, requestedResources: body.requested_resources ?? [], contextAppetite: body.context_appetite ?? "standard", permissions: auth.permissions ?? [] });
    if (body.accept_handoff_id) continuity.acceptHandoff({ tenantId: auth.tenantId, handoffId: body.accept_handoff_id, actorInstanceId: result.actor_instance.actor_instance_id });
    return json(result, 201);
  }
  if (request.method === "GET" && path === "/v1/control-plane/traffic") {
    const resourceId = url.searchParams.get("resource_id");
    const trafficItems = traffic.currentTraffic({ tenantId: auth.tenantId, resource: resourceId || undefined });
    return json({ traffic: trafficItems });
  }
  if (request.method === "GET" && path === "/v1/control-plane/traffic-board") {
    return json(traffic.trafficBoard({ tenantId: auth.tenantId }));
  }
  if (request.method === "GET" && path === "/console/control-plane") {
    return new Response(trafficBoardHtml(traffic.trafficBoard({ tenantId: auth.tenantId })), { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (request.method === "POST" && path === "/v1/control-plane/traffic/claims") {
    const body = await bodyJson(request);
    return json(traffic.declareClaim({ ...base, trafficSessionId: body.traffic_session_id, resource: body.resource, intent: body.intent, scope: body.scope ?? {} }), 201);
  }

  const claimActivation = /^\/v1\/control-plane\/traffic\/claims\/([^/]+)\/activate$/.exec(path);
  if (request.method === "POST" && claimActivation) {
    const body = await bodyJson(request);
    return json(traffic.activateClaim({ ...base, resourceClaimId: claimActivation[1], approval: body.approval === true }));
  }
  const claimRelease = /^\/v1\/control-plane\/traffic\/claims\/([^/]+)\/release$/.exec(path);
  if (request.method === "POST" && claimRelease) return json({ claim: traffic.releaseClaim({ ...base, resourceClaimId: claimRelease[1] }) });

  const heartbeat = /^\/v1\/control-plane\/traffic\/sessions\/([^/]+)\/heartbeat$/.exec(path);
  if (request.method === "POST" && heartbeat) return json({ traffic_session: traffic.heartbeat({ ...base, trafficSessionId: heartbeat[1] }) });

  const checkpoints = /^\/v1\/control-plane\/traffic\/sessions\/([^/]+)\/checkpoints$/.exec(path);
  if (request.method === "POST" && checkpoints) {
    const body = await bodyJson(request);
    return json({ traffic_checkpoint: traffic.checkpoint({ ...base, trafficSessionId: checkpoints[1], kind: body.kind, summary: body.summary, nextAction: body.next_action, blockers: body.blockers ?? [], artifactReferences: body.artifact_references ?? [], sessionState: body.session_state }) }, 201);
  }
  const handoff = /^\/v1\/control-plane\/traffic\/sessions\/([^/]+)\/handoffs$/.exec(path);
  if (request.method === "POST" && handoff) {
    const body = await bodyJson(request);
    return json({ handoff: traffic.handoff({ ...base, trafficSessionId: handoff[1], toActorInstanceId: body.to_actor_instance_id, taskCapsuleId: body.task_capsule_id, summary: body.summary, nextAction: body.next_action }) }, 201);
  }
  const checkout = /^\/v1\/control-plane\/traffic\/sessions\/([^/]+)\/checkout$/.exec(path);
  if (request.method === "POST" && checkout) {
    const body = await bodyJson(request);
    return json({ traffic_session: traffic.checkout({ ...base, trafficSessionId: checkout[1], state: body.state ?? "completed", outcome: body.outcome ?? {}, nextAction: body.next_action, blockers: body.blockers ?? [], artifactReferences: body.artifact_references ?? [] }) });
  }
  return undefined;
}

async function bodyJson(request) {
  try { return await request.json(); }
  catch { throw new SovereignError("invalid_json", "Request body must be valid JSON."); }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function errorResponse(error) {
  if (error instanceof SovereignError) return json({ code: error.code, message: error.message, details: error.details }, error.status);
  return json({ code: "internal_error", message: "Unexpected Sovereign Gateway error." }, 500);
}
