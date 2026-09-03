export function buildConsoleSnapshot({ platform, tenantId }) {
  const tenant = platform.store.requireTenant("tenants", tenantId, tenantId);
  const intelligence = platform.intelligence.canonicalStatus({ tenantId });
  const sources = platform.sources.sourceHealth(tenantId);
  const initializationRuns = platform.initialization.listRuns(tenantId);
  const traffic = platform.traffic.trafficBoard({ tenantId });
  const workspaces = platform.command.listWorkspaces(tenantId);
  const connectors = platform.sources.listConnectorDefinitions();
  const extensions = platform.store.list("extensionInstallations", (installation) => installation.tenant_id === tenantId);
  const continuity = {
    active_tasks: platform.store.list("taskCapsules", (task) => task.tenant_id === tenantId && ["planned", "active", "waiting", "blocked"].includes(task.state)),
    recent_checkpoints: platform.store.list("trafficCheckpoints", (checkpoint) => checkpoint.tenant_id === tenantId).sort((left, right) => right.created_at.localeCompare(left.created_at)).slice(0, 8)
  };
  const audit = platform.store.list("auditEvents", (event) => event.tenant_id === tenantId).sort((left, right) => right.occurred_at.localeCompare(left.occurred_at)).slice(0, 10);
  return {
    tenant: { tenant_id: tenant.tenant_id, display_name: tenant.display_name, command_display_name: tenant.command_display_name },
    home: {
      readiness: readiness({ intelligence, sources, initializationRuns }),
      active_recovery_count: platform.recovery.list(tenantId).filter((session) => session.state === "active").length,
      improvement: platform.improvement.health(tenantId)
    },
    workspaces, connectors, extensions, intelligence, sources, initialization_runs: initializationRuns, traffic, continuity,
    recovery: platform.recovery.list(tenantId), audit
  };
}

function readiness({ intelligence, sources, initializationRuns }) {
  if (!sources.total) return { state: "needs_sources", label: "Connect or upload a source to begin", detail: "Sovereign has no source material to inventory yet." };
  if (!initializationRuns.length) return { state: "needs_initialization", label: "Sources are connected; initialization is next", detail: "Inventory is not the same as understanding." };
  if (sources.failed || sources.stale || sources.partial) return { state: "needs_attention", label: "Some source coverage needs attention", detail: "Sovereign will show exactly what is stale, failed, or incomplete." };
  if (intelligence.pending_change_sets.length) return { state: "review_canonical_changes", label: "Canonical changes are waiting for review", detail: "Nothing is silently treated as trusted truth." };
  return { state: "ready", label: "Core intelligence is ready for normal work", detail: "Continue with Study and Sweep to deepen coverage." };
}
