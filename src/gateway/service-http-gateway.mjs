import { SovereignError } from "../platform/errors.mjs";
import { executeAgentOperation } from "./agent-operations.mjs";

export function createServiceHttpGateway({ persistence, retrieval, authenticateService, ideaStore }) {
  return {
    async fetch(request) {
      try {
        const url = new URL(request.url);
        const auth = await authenticateService(request);
        const route = routeFor(request.method, url.pathname);
        if (!route) throw new SovereignError("service_route_not_found", "Sovereign service endpoint was not found.", { status: 404 });
        const args = route.readArgs ? await route.readArgs(request, url, route.params) : {};
        const result = await executeAgentOperation({ name: route.operation, args, auth, persistence, retrieval, ideaStore });
        return Response.json(result, { status: route.status ?? 200 });
      } catch (error) {
        if (error instanceof SovereignError) {
          return Response.json({ code: error.code, message: error.message, details: error.details }, { status: error.status });
        }
        return Response.json({ code: "internal_error", message: "Unexpected Sovereign service Gateway error." }, { status: 500 });
      }
    }
  };
}

function routeFor(method, pathname) {
  const path = pathname.replace(/^\/api\/v1/, "") || "/";
  if (method === "POST" && path === "/check-in") return route("check_in", bodyArgs, 201);
  if (method === "POST" && path === "/orient") return route("orient", bodyArgs);
  if (method === "GET" && path === "/search") return route("search", searchArgs);
  if (method === "POST" && path === "/ask") return route("ask", bodyArgs);
  if (method === "GET" && path === "/intelligence") return route("intelligence_get", intelligenceArgs);
  if (method === "GET" && path === "/continuity") return route("continuity_get", continuityArgs);
  if (method === "POST" && path === "/continuity/resume") return route("resume", bodyArgs);
  if (method === "POST" && path === "/continuity/tasks") return route("task_create", bodyArgs, 201);
  const taskMatch = /^\/continuity\/tasks\/([^/]+)$/.exec(path);
  if (method === "PATCH" && taskMatch) return route("task_update", async (request) => ({ ...(await jsonBody(request)), task_capsule_id: decodeURIComponent(taskMatch[1]) }));
  if (method === "POST" && path === "/continuity/ideas") return route("idea_create", bodyArgs, 201);
  const ideaMatch = /^\/continuity\/ideas\/([^/]+)$/.exec(path);
  if (method === "PATCH" && ideaMatch) return route("idea_update", async (request) => ({ ...(await jsonBody(request)), idea_id: decodeURIComponent(ideaMatch[1]) }));
  if (method === "POST" && path === "/continuity/checkpoint") return route("task_checkpoint", bodyArgs, 201);
  if (method === "GET" && path === "/traffic") return route("traffic_current", trafficArgs);
  if (method === "POST" && path === "/traffic/claims") return route("resource_claim", bodyArgs, 201);
  const activateMatch = /^\/traffic\/claims\/([^/]+)\/activate$/.exec(path);
  if (method === "POST" && activateMatch) return route("resource_claim", async (request) => ({ ...(await optionalJsonBody(request)), resource_claim_id: decodeURIComponent(activateMatch[1]), activate: true }));
  const releaseMatch = /^\/traffic\/claims\/([^/]+)\/release$/.exec(path);
  if (method === "POST" && releaseMatch) return route("resource_release", async () => ({ resource_claim_id: decodeURIComponent(releaseMatch[1]) }));
  if (method === "POST" && path === "/traffic/heartbeat") return route("heartbeat", bodyArgs);
  if (method === "POST" && path === "/check-out") return route("check_out", bodyArgs);
  if (method === "POST" && path === "/intelligence/canonical/proposals") return route("canonical_propose", bodyArgs, 201);
  return null;
}

function route(operation, readArgs, status) { return { operation, readArgs, status }; }
async function bodyArgs(request) { return jsonBody(request); }
async function searchArgs(_request, url) { return { query: url.searchParams.get("q") ?? "", source_id: url.searchParams.get("source_id") || undefined, limit: Number(url.searchParams.get("limit") || 12) }; }
async function intelligenceArgs(_request, url) { return { record_id: url.searchParams.get("record_id") || undefined, mode: url.searchParams.get("mode") || "status", history: url.searchParams.get("history") === "true" }; }
async function continuityArgs(_request, url) { return { kind: url.searchParams.get("kind") || "tasks", task_capsule_id: url.searchParams.get("task_capsule_id") || undefined, states: url.searchParams.getAll("state") }; }
async function trafficArgs(_request, url) { return { resource_id: url.searchParams.get("resource_id") || undefined, board: url.searchParams.get("board") !== "false" }; }

async function jsonBody(request) {
  try { return await request.json(); }
  catch { throw new SovereignError("invalid_json", "Request body must be valid JSON.", { status: 400 }); }
}

async function optionalJsonBody(request) {
  const text = await request.text();
  if (!text.trim()) return {};
  try { return JSON.parse(text); }
  catch { throw new SovereignError("invalid_json", "Request body must be valid JSON.", { status: 400 }); }
}
