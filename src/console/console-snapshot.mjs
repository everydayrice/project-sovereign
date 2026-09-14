import { projectRecords, requireProject } from '../continuity/project-links.mjs';
export function buildConsoleSnapshot({ platform, tenantId, projectId }) {
  const projects=projectRecords(platform.store,tenantId);
  const selectedProject=projectId?requireProject(platform.store,tenantId,projectId):null;
  const selectedTasks=platform.continuity.listTasks(tenantId,{projectId});
  const taskIds=new Set(selectedTasks.map(t=>t.task_capsule_id));
  const tenant = platform.store.requireTenant("tenants", tenantId, tenantId);
  const intelligence = platform.intelligence.canonicalStatus({ tenantId });
  const sources = platform.sources.sourceHealth(tenantId);
  const initializationRuns = platform.initialization.listRuns(tenantId);
  const traffic = platform.traffic.trafficBoard({ tenantId });
  const workspaces = platform.command.listWorkspaces(tenantId);
  const connectors = platform.sources.listConnectorDefinitions();
  const extensions = platform.extensions.list(tenantId);
  const continuity = {
    tasks: selectedTasks,
    active_tasks: platform.store.list("taskCapsules", (task) => task.tenant_id === tenantId && taskIds.has(task.task_capsule_id) && ["planned", "active", "waiting", "blocked"].includes(task.state)),
    recent_checkpoints: platform.store.list("trafficCheckpoints", (checkpoint) => checkpoint.tenant_id === tenantId && (!projectId || taskIds.has(checkpoint.task_capsule_id))).sort((left, right) => right.created_at.localeCompare(left.created_at)).slice(0, 8)
  };
  const audit = platform.store.list("auditEvents", (event) => event.tenant_id === tenantId).sort((left, right) => right.occurred_at.localeCompare(left.occurred_at)).slice(0, 10);
  return {
    projects, selected_project_id:projectId??null,
    tenant: { tenant_id: tenant.tenant_id, display_name: tenant.display_name, command_display_name: tenant.command_display_name },
    home: {
      readiness: readiness({ intelligence, sources, initializationRuns }),
      active_recovery_count: platform.recovery.list(tenantId).filter((session) => session.state === "active").length,
      improvement: platform.improvement.health(tenantId)
    },
    source_items: platform.store.list("sourceItems", item => item.tenant_id === tenantId),
    canonical_records: platform.intelligence.listRecords({tenantId,includeHistorical:true}).filter(record=>!selectedProject || record.canonical_record_id===projectId || (selectedProject.scope?.project && record.scope?.project===selectedProject.scope.project)).map(record=>platform.intelligence.getRecord({tenantId,recordId:record.canonical_record_id})),
    canonical_changes: platform.store.list("canonicalChangeSets", item=>item.tenant_id===tenantId).map(item=>platform.intelligence.getChangeSet(tenantId,item.canonical_change_set_id)),
    candidates: platform.store.list("candidateIntelligence", item=>item.tenant_id===tenantId),
    canon_check: platform.intelligence.canonCheck({tenantId}),
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
