import { Client, neon } from "@neondatabase/serverless";
import { InMemorySovereignStore } from "./store.mjs";
import { SovereignError } from "./errors.mjs";

const LOAD_STATE_SQL = `
SELECT
  (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb) FROM command.tenants t WHERE t.tenant_id=$1) AS "tenants",
  (SELECT COALESCE(jsonb_agg(to_jsonb(w) ORDER BY w.created_at), '[]'::jsonb) FROM command.workspaces w WHERE w.tenant_id=$1) AS "workspaces",
  (SELECT COALESCE(jsonb_agg(to_jsonb(p) || jsonb_build_object('role_ids', COALESCE((SELECT jsonb_agg(b.role_id ORDER BY b.role_id) FROM command.principal_role_bindings b WHERE b.tenant_id=p.tenant_id AND b.principal_id=p.principal_id), '[]'::jsonb)) ORDER BY p.created_at), '[]'::jsonb) FROM command.principals p WHERE p.tenant_id=$1) AS "principals",
  (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.created_at), '[]'::jsonb) FROM command.providers p WHERE p.tenant_id=$1) AS "providers",
  (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.created_at), '[]'::jsonb) FROM command.surfaces s WHERE s.tenant_id=$1) AS "surfaces",
  (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at), '[]'::jsonb) FROM control.actor_instances a WHERE a.tenant_id=$1) AS "actorInstances",
  (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb) FROM control.traffic_sessions t WHERE t.tenant_id=$1) AS "trafficSessions",
  (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at), '[]'::jsonb) FROM control.resources r WHERE r.tenant_id=$1) AS "resources",
  (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at), '[]'::jsonb) FROM control.resource_claims c WHERE c.tenant_id=$1) AS "resourceClaims",
  (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at), '[]'::jsonb) FROM continuity.traffic_checkpoints c WHERE c.tenant_id=$1) AS "trafficCheckpoints",
  (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb) FROM continuity.task_capsules t WHERE t.tenant_id=$1) AS "taskCapsules",
  (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.created_at), '[]'::jsonb) FROM continuity.session_capsules s WHERE s.tenant_id=$1) AS "sessionCapsules",
  (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at), '[]'::jsonb) FROM continuity.candidate_memories c WHERE c.tenant_id=$1) AS "candidateMemories",
  (SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.created_at), '[]'::jsonb) FROM continuity.handoffs h WHERE h.tenant_id=$1) AS "handoffs",
  (SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.created_at), '[]'::jsonb) FROM extensions.extensions e WHERE e.state <> 'retired') AS "extensions",
  (SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.installed_at), '[]'::jsonb) FROM extensions.installations i WHERE i.tenant_id=$1) AS "extensionInstallations",
  (SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY g.granted_at), '[]'::jsonb) FROM extensions.grants g WHERE g.tenant_id=$1) AS "extensionGrants",
  (SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.created_at), '[]'::jsonb) FROM extensions.event_subscriptions e WHERE e.tenant_id=$1) AS "extensionEventSubscriptions",
  (SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.created_at), '[]'::jsonb) FROM extensions.event_outbox e WHERE e.tenant_id=$1) AS "extensionEventOutbox",
  (SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.occurred_at), '[]'::jsonb) FROM audit.events e WHERE e.tenant_id=$1) AS "auditEvents",
  (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.created_at), '[]'::jsonb) FROM intelligence.sources s WHERE s.tenant_id=$1) AS "sources",
  (SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.discovered_at), '[]'::jsonb) FROM intelligence.source_items i WHERE i.tenant_id=$1) AS "sourceItems",
  (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at), '[]'::jsonb) FROM intelligence.initialization_runs r WHERE r.tenant_id=$1) AS "initializationRuns",
  (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.updated_at), '[]'::jsonb) FROM intelligence.initialization_source_runs r WHERE r.tenant_id=$1) AS "initializationSourceRuns",
  (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.created_at), '[]'::jsonb) FROM intelligence.canonical_states s WHERE s.tenant_id=$1) AS "canonicalStates",
  (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at), '[]'::jsonb) FROM intelligence.records r WHERE r.tenant_id=$1) AS "canonicalRecords",
  (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at), '[]'::jsonb) FROM intelligence.record_revisions r WHERE r.tenant_id=$1) AS "canonicalRecordRevisions",
  (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at), '[]'::jsonb) FROM intelligence.canonical_change_sets c WHERE c.tenant_id=$1) AS "canonicalChangeSets",
  (SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY o.created_at), '[]'::jsonb) FROM intelligence.canonical_change_operations o WHERE o.tenant_id=$1) AS "canonicalChangeOperations",
  (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at), '[]'::jsonb) FROM intelligence.canonical_checkpoints c WHERE c.tenant_id=$1) AS "canonicalCheckpoints",
  (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at), '[]'::jsonb) FROM intelligence.candidate_intelligence c WHERE c.tenant_id=$1) AS "candidateIntelligence",
  (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.occurred_at), '[]'::jsonb) FROM intelligence.canonical_access_events a WHERE a.tenant_id=$1) AS "canonicalAccessEvents",
  (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at), '[]'::jsonb) FROM audit.recovery_sessions r WHERE r.tenant_id=$1) AS "recoverySessions",
  (SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.created_at), '[]'::jsonb) FROM audit.failure_events f WHERE f.tenant_id=$1) AS "failureEvents",
  (SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.created_at), '[]'::jsonb) FROM audit.improvement_candidates i WHERE i.tenant_id=$1) AS "improvementCandidates",
  (SELECT version FROM runtime.tenant_state_snapshots WHERE tenant_id=$1) AS "runtimeVersion";
`;

const TABLES = {
  tenants: map("command.tenants", ["tenant_id"], ["tenant_id","slug","display_name","command_display_name","state","branding","revision","created_at","updated_at"], ["branding"]),
  principals: map("command.principals", ["principal_id"], ["principal_id","tenant_id","kind","display_name","state","auth_subject_reference","metadata","revision","created_at","updated_at"], ["metadata"]),
  workspaces: map("command.workspaces", ["workspace_id"], ["workspace_id","tenant_id","parent_workspace_id","slug","display_name","state","settings","created_by_principal_id","revision","created_at","updated_at"], ["settings"]),
  providers: map("command.providers", ["provider_id"], ["provider_id","tenant_id","provider_key","display_name","account_reference","metadata","created_at","updated_at"], ["metadata"]),
  surfaces: map("command.surfaces", ["surface_id"], ["surface_id","tenant_id","provider_id","surface_key","display_name","surface_type","metadata","created_at","updated_at"], ["metadata"]),
  actorInstances: map("control.actor_instances", ["actor_instance_id"], ["actor_instance_id","tenant_id","principal_id","provider_id","surface_id","external_session_id","agent_profile_id","model_metadata","state","last_seen_at","revision","created_at","updated_at"], ["model_metadata"]),
  trafficSessions: map("control.traffic_sessions", ["traffic_session_id"], ["traffic_session_id","tenant_id","actor_instance_id","principal_id","task_capsule_id","parent_traffic_session_id","objective","state","context_appetite","checked_in_at","last_heartbeat_at","lease_expires_at","checked_out_at","next_action","outcome","revision","created_at","updated_at"], ["outcome"]),
  resources: map("control.resources", ["resource_id"], ["resource_id","tenant_id","resource_type","authority","canonical_locator","display_name","metadata","revision","created_at","updated_at"], ["metadata"]),
  resourceClaims: map("control.resource_claims", ["resource_claim_id"], ["resource_claim_id","tenant_id","traffic_session_id","resource_id","intent","scope","coordination_level","state","lease_expires_at","activated_at","released_at","related_artifact_references","revision","created_at","updated_at"], ["scope","related_artifact_references"]),
  trafficCheckpoints: custom("continuity.traffic_checkpoints", ["traffic_checkpoint_id"], (item) => ({
    traffic_checkpoint_id: item.traffic_checkpoint_id, tenant_id: item.tenant_id, traffic_session_id: item.traffic_session_id,
    task_capsule_id: item.task_capsule_id ?? null, kind: item.kind, summary: item.summary, next_action: item.next_action ?? null,
    blockers: item.blockers ?? [], artifact_references: item.artifact_references ?? [],
    created_by_principal_id: item.created_by?.principal_id ?? item.created_by_principal_id,
    created_by_actor_instance_id: item.created_by?.actor_instance_id ?? item.created_by_actor_instance_id,
    created_at: item.created_at
  }), ["blockers","artifact_references"]),
  taskCapsules: map("continuity.task_capsules", ["task_capsule_id"], ["task_capsule_id","tenant_id","title","objective","state","owner_principal_id","next_action","blockers","intelligence_references","revision","created_at","updated_at"], ["blockers","intelligence_references"]),
  sessionCapsules: map("continuity.session_capsules", ["session_capsule_id"], ["session_capsule_id","tenant_id","actor_instance_id","task_capsule_id","state","working_assumptions","unresolved_questions","resume_state","revision","created_at","updated_at"], ["working_assumptions","unresolved_questions","resume_state"]),
  candidateMemories: map("continuity.candidate_memories", ["candidate_memory_id"], ["candidate_memory_id","tenant_id","kind","content","state","provenance_ids","proposed_by_principal_id","proposed_by_actor_instance_id","revision","created_at","updated_at"], ["content","provenance_ids"]),
  handoffs: map("continuity.handoffs", ["handoff_id"], ["handoff_id","tenant_id","from_traffic_session_id","to_actor_instance_id","task_capsule_id","summary","next_action","state","created_at","accepted_at","completed_at"]),
  extensions: map("extensions.extensions", ["extension_id"], ["extension_id","publisher","state","manifest","created_at","updated_at"], ["manifest"], { tenantScoped: false }),
  extensionInstallations: map("extensions.installations", ["extension_installation_id"], ["extension_installation_id","tenant_id","extension_id","state","installed_by_principal_id","installed_at","revoked_at"]),
  extensionGrants: custom("extensions.grants", ["extension_grant_id"], (item) => ({
    extension_grant_id: item.extension_grant_id, tenant_id: item.tenant_id,
    extension_installation_id: item.extension_installation_id, state: item.state,
    granted_scopes: item.granted_scopes ?? [], granted_by_principal_id: item.granted_by?.principal_id ?? item.granted_by_principal_id,
    granted_at: item.granted_at, revoked_at: item.revoked_at ?? null
  }), ["granted_scopes"]),
  auditEvents: map("audit.events", ["audit_event_id"], ["audit_event_id","tenant_id","occurred_at","event_type","subject_type","subject_id","principal_id","actor_instance_id","traffic_session_id","outcome","metadata"], ["metadata"]),
  sources: map("intelligence.sources", ["source_id"], ["source_id","tenant_id","source_type","canonical_locator","authority_state","freshness_class","data_classification","retention_policy_id","last_verified_at","metadata","revision","created_at","updated_at","connector_key","source_category","display_name","connection_state","processing_state","currentness","health_state","item_count","inventoried_item_count","indexed_item_count","analyzed_item_count","studied_item_count","canonicalized_item_count","failed_item_count","excluded_item_count","last_sweep_at","failure_reason","created_by_principal_id"], ["metadata"]),
  sourceItems: map("intelligence.source_items", ["source_item_id"], ["source_item_id","tenant_id","source_id","display_name","canonical_locator","mime_type","size_bytes","content_hash","item_state","storage_state","r2_object_key","object_version","privacy_state","metadata","discovered_at","updated_at"], ["metadata"]),
  initializationRuns: map("intelligence.initialization_runs", ["initialization_run_id"], ["initialization_run_id","tenant_id","scope","mode","state","requested_by_principal_id","source_ids","candidate_intelligence_ids","canonical_change_set_id","coverage","started_at","completed_at","created_at","updated_at"], ["scope","source_ids","candidate_intelligence_ids","coverage"]),
  initializationSourceRuns: map("intelligence.initialization_source_runs", ["initialization_source_run_id"], ["initialization_source_run_id","initialization_run_id","tenant_id","source_id","state","item_count","inventoried_item_count","analyzed_item_count","candidate_count","excluded_count","failure_reason","updated_at"]),
  canonicalStates: map("intelligence.canonical_states", ["canonical_state_id"], ["canonical_state_id","tenant_id","current_revision","last_change_set_id","created_at","updated_at"]),
  canonicalRecords: custom("intelligence.records", ["intelligence_record_id"], (item) => ({
    intelligence_record_id: item.canonical_record_id, tenant_id: item.tenant_id, record_type: item.record_type,
    state: item.lifecycle_state, authority_level: item.authority_level, current_revision: item.current_record_revision,
    supersedes_record_id: item.supersedes_record_id ?? null,
    approved_by_principal_id: item.created_by_principal_id ?? item.updated_by_principal_id,
    created_by_principal_id: item.created_by_principal_id ?? item.updated_by_principal_id,
    updated_by_principal_id: item.updated_by_principal_id ?? item.created_by_principal_id,
    created_at: item.created_at, updated_at: item.updated_at, scope: item.scope ?? {}, source_ids: item.source_ids ?? [],
    provenance: item.provenance ?? [], confidence: item.confidence ?? "medium", data_classification: item.data_classification ?? "internal",
    current_canonical_revision: item.current_canonical_revision ?? 0, last_change_set_id: item.last_change_set_id ?? null,
    tombstone_reason: item.tombstone_reason ?? null
  }), ["scope","source_ids","provenance"]),
  canonicalRecordRevisions: custom("intelligence.record_revisions", ["intelligence_record_id","revision"], (item) => ({
    intelligence_record_id: item.canonical_record_id, revision: item.record_revision, tenant_id: item.tenant_id,
    content: item.after_snapshot ?? {}, created_by_principal_id: item.created_by_principal_id,
    created_by_actor_instance_id: item.created_by_actor_instance_id ?? null, created_at: item.created_at,
    canonical_record_revision_id: item.canonical_record_revision_id, canonical_revision: item.canonical_revision,
    change_set_id: item.change_set_id, before_snapshot: item.before_snapshot ?? null, after_snapshot: item.after_snapshot ?? null
  }), ["content","before_snapshot","after_snapshot"]),
  canonicalChangeSets: map("intelligence.canonical_change_sets", ["canonical_change_set_id"], ["canonical_change_set_id","tenant_id","title","reason","state","requires_approval","initiator","scope","confidence","source_ids","provenance","base_canonical_revision","resulting_canonical_revision","affected_record_ids","proposed_by_principal_id","approved_by_principal_id","rejected_by_principal_id","rejection_reason","revert_of_change_set_id","applied_at","rejected_at","created_at","updated_at"], ["scope","source_ids","provenance","affected_record_ids"]),
  canonicalChangeOperations: map("intelligence.canonical_change_operations", ["canonical_change_operation_id"], ["canonical_change_operation_id","canonical_change_set_id","tenant_id","ordinal","operation_type","target_record_id","created_record_id","patch","replacement","reason","before_snapshot","after_snapshot","affected_record_ids","created_at","updated_at"], ["patch","replacement","before_snapshot","after_snapshot","affected_record_ids"]),
  canonicalCheckpoints: map("intelligence.canonical_checkpoints", ["canonical_checkpoint_id"], ["canonical_checkpoint_id","tenant_id","canonical_revision","title","reason","scope","change_set_ids","change_summary","automatic","created_by_principal_id","revision_hash","created_at"], ["scope","change_set_ids","change_summary"]),
  candidateIntelligence: map("intelligence.candidate_intelligence", ["candidate_intelligence_id"], ["candidate_intelligence_id","tenant_id","record_type","payload","scope","source_ids","provenance","confidence","reason","state","proposed_by_principal_id","created_at","updated_at"], ["payload","scope","source_ids","provenance"]),
  canonicalAccessEvents: map("intelligence.canonical_access_events", ["canonical_access_event_id"], ["canonical_access_event_id","tenant_id","record_id","canonical_revision","principal_id","actor_instance_id","purpose","occurred_at","metadata"], ["metadata"]),
  extensionEventSubscriptions: map("extensions.event_subscriptions", ["extension_event_subscription_id"], ["extension_event_subscription_id","tenant_id","extension_installation_id","event_type","delivery_url","state","created_by_principal_id","created_at","updated_at"]),
  extensionEventOutbox: map("extensions.event_outbox", ["extension_event_id"], ["extension_event_id","tenant_id","extension_installation_id","event_type","subject_type","subject_id","payload","state","attempt_count","available_at","last_attempt_at","delivered_at","failure_reason","created_at","updated_at"], ["payload"]),
  recoverySessions: map("audit.recovery_sessions", ["recovery_session_id"], ["recovery_session_id","tenant_id","scope","reason","state","canonical_snapshot_revision","canonical_snapshot_checkpoint_id","risky_canonical_automation_paused","findings","completion_summary","started_by_principal_id","completed_by_principal_id","started_at","completed_at","created_at","updated_at"], ["scope","findings"]),
  failureEvents: map("audit.failure_events", ["failure_event_id"], ["failure_event_id","tenant_id","scope","kind","severity","summary","expected_behavior","actual_behavior","evidence","canonical_revision","status","reported_by_principal_id","created_at","updated_at"], ["scope","evidence"]),
  improvementCandidates: map("audit.improvement_candidates", ["improvement_candidate_id"], ["improvement_candidate_id","tenant_id","failure_event_id","scope","summary","target","state","proposed_by_principal_id","created_at","updated_at"], ["scope"])
};

export function createNormalizedNeonPersistence(databaseUrl, { httpSql, clientFactory } = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required to create Neon persistence.");
  const sql = httpSql ?? neon(databaseUrl);
  const makeClient = clientFactory ?? (() => new Client(databaseUrl));

  return {
    async resolveAuthBinding(authSubjectReference) {
      const rows = await sql.query(
        "SELECT tenant_id, principal_id FROM runtime.auth_bindings WHERE auth_subject_reference=$1 LIMIT 1",
        [authSubjectReference]
      );
      return rows[0] ?? null;
    },

    async principalPermissions({ tenantId, principalId }) {
      const rows = await sql.query(`SELECT r.permission_set FROM command.principal_role_bindings b
        JOIN command.roles r ON r.tenant_id=b.tenant_id AND r.role_id=b.role_id
        JOIN command.principals p ON p.tenant_id=b.tenant_id AND p.principal_id=b.principal_id
        WHERE b.tenant_id=$1 AND b.principal_id=$2 AND p.state='active'`, [tenantId, principalId]);
      return [...new Set(rows.flatMap((row) => Array.isArray(row.permission_set) ? row.permission_set : []))];
    },

    async loadTenant(tenantId) {
      const rows = await sql.query(loadSqlWithParity(), [tenantId]);
      const row = rows[0];
      if (!row || row.runtimeVersion === null || row.runtimeVersion === undefined) {
        throw new SovereignError("tenant_state_not_found", "Durable Sovereign tenant state was not found.", { status: 503 });
      }
      const state = hydrateState(row);
      assertSnapshotCovered(state, row.snapshotParity);
      return {
        store: new InMemorySovereignStore().importState(state),
        version: Number(row.runtimeVersion),
        storage_model: "normalized_neon"
      };
    },

    async saveTenant({ tenantId, store, expectedVersion, sourceChunkReplacements = [] }) {
      const client = makeClient();
      await client.connect();
      try {
        await client.query("BEGIN");
        const locked = await client.query(
          "SELECT version FROM runtime.tenant_state_snapshots WHERE tenant_id=$1 FOR UPDATE",
          [tenantId]
        );
        const currentVersion = Number(locked.rows?.[0]?.version ?? locked[0]?.version);
        if (!Number.isFinite(currentVersion)) throw new SovereignError("tenant_state_not_found", "Durable Sovereign tenant state was not found.", { status: 503 });
        if (currentVersion !== Number(expectedVersion)) {
          throw new SovereignError("tenant_state_conflict", "Tenant state changed concurrently; reload before retrying the mutation.", {
            status: 409,
            details: { expected_version: Number(expectedVersion), current_version: currentVersion }
          });
        }

        const changes = store.exportChanges();
        await persistChanges(client, tenantId, changes, store);
        for (const replacement of sourceChunkReplacements) await replaceChunks(client, { ...replacement, tenantId });
        if (!Object.keys(changes).length && !sourceChunkReplacements.length) {
          await client.query("COMMIT");
          return { tenant_id: tenantId, version: currentVersion, changed_collections: [] };
        }

        const state = store.exportState();
        const nextVersion = currentVersion + 1;
        await client.query(
          "UPDATE runtime.tenant_state_snapshots SET state=$2::jsonb, version=$3, state_hash=md5($2::text), updated_at=now() WHERE tenant_id=$1",
          [tenantId, JSON.stringify(state), nextVersion]
        );
        await client.query("COMMIT");
        store.clearChanges();
        return { tenant_id: tenantId, version: nextVersion, changed_collections: Object.keys(changes) };
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally {
        await client.end();
      }
    },

    async bootstrapTenant({ authSubjectReference, tenant, principal, workspace, store }) {
      const client = makeClient();
      await client.connect();
      try {
        await client.query("BEGIN");
        await persistChanges(client, tenant.tenant_id, store.exportChanges(), store);
        const binding = await client.query(
          `INSERT INTO runtime.auth_bindings (auth_subject_reference, tenant_id, principal_id)
           VALUES ($1,$2,$3)
           ON CONFLICT (auth_subject_reference) DO UPDATE SET auth_subject_reference=EXCLUDED.auth_subject_reference
           WHERE runtime.auth_bindings.tenant_id=EXCLUDED.tenant_id
           RETURNING tenant_id`,
          [authSubjectReference, tenant.tenant_id, principal.principal_id]
        );
        if (binding.rowCount === 0) throw new SovereignError("auth_already_bound", "This identity already has a tenant. Reload to continue.", { status: 409 });
      await client.query(
        `WITH owner_role AS (
           INSERT INTO command.roles (role_id,tenant_id,name,permission_set,created_at,updated_at)
           VALUES ('rol_owner_' || md5($1),$1,'Owner','["*"]'::jsonb,now(),now())
           ON CONFLICT (tenant_id,name) DO UPDATE SET permission_set=EXCLUDED.permission_set,updated_at=now()
           RETURNING role_id
         )
         INSERT INTO command.principal_role_bindings (tenant_id,principal_id,role_id,granted_by_principal_id,created_at)
         SELECT $1,$2,role_id,$2,now() FROM owner_role
         ON CONFLICT (tenant_id,principal_id,role_id) DO NOTHING`,
        [tenant.tenant_id, principal.principal_id]
      );
        const state = store.exportState();
        await client.query(
          `INSERT INTO runtime.tenant_state_snapshots (tenant_id,state,version,state_hash)
           VALUES ($1,$2::jsonb,1,md5($2::text))
           ON CONFLICT (tenant_id) DO NOTHING`,
          [tenant.tenant_id, JSON.stringify(state)]
        );
        await client.query("COMMIT");
        store.clearChanges();
        return { tenant, principal, workspace, version: 1, storage_model: "normalized_neon" };
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally {
        await client.end();
      }
    },

    async replaceSourceChunks({ tenantId, sourceId, sourceItemId, chunks }) {
      const client = makeClient();
      await client.connect();
      try {
        await client.query("BEGIN");
        await replaceChunks(client, { tenantId, sourceId, sourceItemId, chunks });
        await client.query("COMMIT");
        return { source_id: sourceId, source_item_id: sourceItemId, chunk_count: chunks.length };
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally {
        await client.end();
      }
    },

    async searchTenant({ tenantId, query, sourceId, limit = 12 }) {
      const normalizedQuery = String(query ?? "").trim();
      if (!normalizedQuery) return [];
      const effectiveLimit = Math.max(1, Math.min(Number(limit) || 12, 50));
      const rows = await sql.query(
        `WITH q AS (SELECT websearch_to_tsquery('simple',$2) AS value),
         source_hits AS (
           SELECT 'source'::text AS result_kind, sc.source_chunk_id AS result_id, sc.source_id,
                  sc.source_item_id, s.display_name AS source_name, sc.heading,
                  sc.chunk_text AS excerpt, NULL::text AS record_type,
                  ts_rank_cd(sc.search_vector,q.value) AS rank, sc.metadata,
                  sc.ordinal
             FROM intelligence.source_chunks sc
             JOIN intelligence.sources s ON s.source_id=sc.source_id AND s.tenant_id=sc.tenant_id
             JOIN intelligence.source_items si ON si.source_item_id=sc.source_item_id AND si.tenant_id=sc.tenant_id AND si.source_id=sc.source_id
             CROSS JOIN q
            WHERE sc.tenant_id=$1 AND si.privacy_state='included' AND COALESCE(s.metadata->>'archived','false') <> 'true' AND COALESCE(s.metadata->>'removed','false') <> 'true'
              AND ($3::text IS NULL OR sc.source_id=$3)
              AND sc.search_vector @@ q.value
         ),
         canonical_hits AS (
           SELECT 'canonical'::text AS result_kind, r.intelligence_record_id AS result_id,
                  NULL::text AS source_id, NULL::text AS source_item_id,
                  'Canonical Intelligence'::text AS source_name, NULL::text AS heading,
                  COALESCE(rr.after_snapshot->'payload',rr.content->'payload',rr.content)::text AS excerpt,
                  r.record_type,
                  ts_rank_cd(to_tsvector('simple',COALESCE(rr.after_snapshot,rr.content)::text),q.value) AS rank,
                  jsonb_build_object('canonical_revision',r.current_canonical_revision,'authority_level',r.authority_level,'confidence',r.confidence) AS metadata,
                  0 AS ordinal
             FROM intelligence.records r
             JOIN intelligence.record_revisions rr ON rr.intelligence_record_id=r.intelligence_record_id AND rr.revision=r.current_revision
             CROSS JOIN q
            WHERE r.tenant_id=$1 AND r.state='active'
              AND ($3::text IS NULL OR r.source_ids ? $3)
              AND rr.tenant_id=r.tenant_id
              AND to_tsvector('simple',COALESCE(rr.after_snapshot,rr.content)::text) @@ q.value
         )
         SELECT * FROM (SELECT * FROM source_hits UNION ALL SELECT * FROM canonical_hits) hits
         ORDER BY rank DESC, result_kind, ordinal
         LIMIT $4`,
        [tenantId, normalizedQuery, sourceId ?? null, effectiveLimit]
      );
      if (rows.length) return rows.map(normalizeSearchResult);

      const fallback = await sql.query(
        `SELECT 'source'::text AS result_kind, sc.source_chunk_id AS result_id, sc.source_id,
                sc.source_item_id, s.display_name AS source_name, sc.heading, sc.chunk_text AS excerpt,
                NULL::text AS record_type, 0::real AS rank, sc.metadata, sc.ordinal
           FROM intelligence.source_chunks sc
           JOIN intelligence.sources s ON s.source_id=sc.source_id AND s.tenant_id=sc.tenant_id
             JOIN intelligence.source_items si ON si.source_item_id=sc.source_item_id AND si.tenant_id=sc.tenant_id AND si.source_id=sc.source_id
          WHERE sc.tenant_id=$1 AND si.privacy_state='included' AND COALESCE(s.metadata->>'archived','false') <> 'true' AND COALESCE(s.metadata->>'removed','false') <> 'true' AND ($3::text IS NULL OR sc.source_id=$3)
            AND (sc.chunk_text ILIKE '%' || $2 || '%' OR COALESCE(sc.heading,'') ILIKE '%' || $2 || '%' OR s.display_name ILIKE '%' || $2 || '%')
          ORDER BY sc.updated_at DESC, sc.ordinal
          LIMIT $4`,
        [tenantId, normalizedQuery, sourceId ?? null, effectiveLimit]
      );
      return fallback.map(normalizeSearchResult);
    },

    async health() {
      const rows = await sql.query("SELECT 1 AS ok");
      return rows[0]?.ok === 1;
    },

    async normalizedHealth() {
      const rows = await sql.query(
        `SELECT
          to_regclass('intelligence.source_chunks') IS NOT NULL AS search_schema,
          EXISTS (SELECT 1 FROM runtime.tenant_state_snapshots) AS runtime_bridge_available,
          (SELECT count(*)::int FROM command.tenants) AS tenant_count`
      );
      return rows[0] ?? { search_schema: false, runtime_bridge_available: false, tenant_count: 0 };
    }
  };
}

// During the temporary bridge period, compare only IDs and freshness markers.
// Domain content always loads from normalized tables. A write by the old
// deployed Worker after migration must fail closed, never silently disappear.
function loadSqlWithParity() {
  const summaries = Object.keys(TABLES).map(collection => {
    const key = domainKey(collection);
    return `'${collection}', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',e->'${key}','updated_at',e->'updated_at','revision',${'revision' in TABLES[collection].transform({}) ? "e->'revision'" : 'NULL'})), '[]'::jsonb) FROM jsonb_array_elements(COALESCE(s.state->'${collection}','[]'::jsonb)) e)`;
  });
  const parity = `(SELECT jsonb_build_object(${summaries.join(",")}) FROM runtime.tenant_state_snapshots s WHERE s.tenant_id=$1)`;
  return LOAD_STATE_SQL.replace('AS "runtimeVersion";', `AS "runtimeVersion", ${parity} AS "snapshotParity";`);
}

function domainKey(collection) {
  return ({ canonicalRecords: "canonical_record_id", canonicalRecordRevisions: "canonical_record_revision_id" })[collection] ?? TABLES[collection].keys[0];
}

function assertSnapshotCovered(state, parity = {}) {
  for (const [collection, expected] of Object.entries(parity ?? {})) {
    const actual = new Map((state[collection] ?? []).map(item => [item[domainKey(collection)],item]));
    for (const marker of expected) {
      const item = actual.get(marker.id);
      if (!item || (marker.updated_at && new Date(marker.updated_at).getTime() > new Date(item.updated_at ?? 0).getTime()) || Number(marker.revision ?? 0) > Number(item.revision ?? 0)) {
        throw new SovereignError("normalized_cutover_incomplete", "The rollback mirror contains newer state. Reconcile the migration before continuing.", { status: 503, details: { collection } });
      }
    }
  }
}

async function persistChanges(client, tenantId, changes, store) {
  // Tasks must precede sessions/checkpoints; Change Sets must precede runs
  // that reference them. Use the same order for bootstrap and mutations.
  const first = ["tenants", "principals", "workspaces", "providers", "surfaces", "actorInstances", "taskCapsules", "canonicalChangeSets"];
  for (const collection of [...first, ...Object.keys(TABLES).filter(name => !first.includes(name))]) {
    const items = changes[collection];
    if (!items?.length) continue;
    const config = TABLES[collection];
    for (const item of items) {
      if (config.tenantScoped !== false && item.tenant_id !== tenantId) {
        throw new SovereignError("tenant_persistence_mismatch", `Refusing to persist ${collection} outside the authenticated tenant.`, { status: 403 });
      }
      const row = config.transform(item);
      validateReferences(row, config, tenantId, store);
      const columns = Object.keys(row).filter((column) => row[column] !== undefined);
      const values = columns.map((column) => serialize(row[column], config.jsonColumns.has(column)));
      const placeholders = columns.map((_, index) => `$${index + 1}`);
      const conflict = config.keys.join(",");
      const updates = columns.filter((column) => !config.keys.includes(column)).map((column) => `${column}=EXCLUDED.${column}`);
      const tenantGuard = config.tenantScoped ? ` WHERE ${config.table}.tenant_id=EXCLUDED.tenant_id` : "";
      const text = `INSERT INTO ${config.table} (${columns.join(",")}) VALUES (${placeholders.join(",")}) ON CONFLICT (${conflict}) DO UPDATE SET ${updates.join(",")}${tenantGuard} RETURNING 1`;
      const saved = await client.query(text, values);
      if (saved.rowCount === 0) throw new SovereignError("tenant_persistence_mismatch", `Refusing to overwrite ${collection} owned by another tenant.`, { status: 403 });
    }
  }
}

function validateReferences(row, config, tenantId, store) {
  const references = {
    provider_id: "providers", surface_id: "surfaces", resource_id: "resources",
    task_capsule_id: "taskCapsules", workspace_id: "workspaces", parent_workspace_id: "workspaces",
    traffic_session_id: "trafficSessions", parent_traffic_session_id: "trafficSessions", from_traffic_session_id: "trafficSessions",
    source_id: "sources", source_item_id: "sourceItems", initialization_run_id: "initializationRuns",
    canonical_change_set_id: "canonicalChangeSets", change_set_id: "canonicalChangeSets", revert_of_change_set_id: "canonicalChangeSets",
    intelligence_record_id: "canonicalRecords", target_record_id: "canonicalRecords", record_id: "canonicalRecords", supersedes_record_id: "canonicalRecords",
    canonical_snapshot_checkpoint_id: "canonicalCheckpoints", failure_event_id: "failureEvents",
    extension_installation_id: "extensionInstallations"
  };
  for (const [column, value] of Object.entries(row)) {
    if (value == null || config.keys.includes(column)) continue;
    const collection = /(?:^|_)principal_id$/.test(column) ? "principals"
      : /(?:^|_)actor_instance_id$/.test(column) ? "actorInstances" : references[column];
    if (collection) store.requireTenant(collection, value, tenantId);
  }
  for (const sourceId of row.source_ids ?? []) store.requireTenant("sources", sourceId, tenantId);
}

function hydrateState(row) {
  const state = {
    tenants: array(row.tenants), workspaces: array(row.workspaces), principals: array(row.principals),
    providers: array(row.providers), surfaces: array(row.surfaces), actorInstances: array(row.actorInstances),
    trafficSessions: array(row.trafficSessions), resources: array(row.resources), resourceClaims: array(row.resourceClaims),
    trafficCheckpoints: array(row.trafficCheckpoints), taskCapsules: array(row.taskCapsules), sessionCapsules: array(row.sessionCapsules),
    candidateMemories: array(row.candidateMemories), handoffs: array(row.handoffs), extensions: array(row.extensions),
    extensionEventSubscriptions: array(row.extensionEventSubscriptions), extensionEventOutbox: array(row.extensionEventOutbox),
    extensionInstallations: array(row.extensionInstallations), extensionGrants: array(row.extensionGrants), auditEvents: array(row.auditEvents),
    sources: array(row.sources), sourceItems: array(row.sourceItems), initializationRuns: array(row.initializationRuns),
    initializationSourceRuns: array(row.initializationSourceRuns), canonicalStates: array(row.canonicalStates),
    canonicalRecords: array(row.canonicalRecords), canonicalRecordRevisions: array(row.canonicalRecordRevisions),
    canonicalChangeSets: array(row.canonicalChangeSets), canonicalChangeOperations: array(row.canonicalChangeOperations),
    canonicalCheckpoints: array(row.canonicalCheckpoints), candidateIntelligence: array(row.candidateIntelligence),
    canonicalAccessEvents: array(row.canonicalAccessEvents), recoverySessions: array(row.recoverySessions),
    failureEvents: array(row.failureEvents), improvementCandidates: array(row.improvementCandidates)
  };

  const sessionById = new Map(state.trafficSessions.map((session) => [session.traffic_session_id, session]));
  state.resourceClaims = state.resourceClaims.map((claim) => ({
    ...claim,
    actor_instance_id: sessionById.get(claim.traffic_session_id)?.actor_instance_id ?? null
  }));

  state.trafficCheckpoints = state.trafficCheckpoints.map((checkpoint) => ({
    ...checkpoint,
    created_by: {
      principal_id: checkpoint.created_by_principal_id,
      actor_instance_id: checkpoint.created_by_actor_instance_id,
      traffic_session_id: checkpoint.traffic_session_id
    },
    revision: checkpoint.revision ?? 1,
    updated_at: checkpoint.updated_at ?? checkpoint.created_at
  }));

  const installationById = new Map(state.extensionInstallations.map((installation) => [installation.extension_installation_id, installation]));
  state.extensionGrants = state.extensionGrants.map((grant) => ({
    ...grant,
    extension_id: installationById.get(grant.extension_installation_id)?.extension_id ?? null,
    granted_by: { principal_id: grant.granted_by_principal_id },
    revision: grant.revision ?? 1,
    created_at: grant.created_at ?? grant.granted_at,
    updated_at: grant.updated_at ?? grant.revoked_at ?? grant.granted_at
  }));

  const revisionsByRecord = new Map();
  for (const revision of state.canonicalRecordRevisions) {
    revisionsByRecord.set(`${revision.intelligence_record_id}:${revision.revision}`, revision);
  }
  state.canonicalRecords = state.canonicalRecords.map((record) => {
    const revision = revisionsByRecord.get(`${record.intelligence_record_id}:${record.current_revision}`);
    const snapshot = revision?.after_snapshot ?? revision?.content ?? {};
    return {
      canonical_record_id: record.intelligence_record_id,
      tenant_id: record.tenant_id,
      record_type: record.record_type,
      scope: record.scope ?? {},
      payload: snapshot?.payload ?? revision?.content?.payload ?? revision?.content ?? {},
      authority_level: record.authority_level,
      provenance: record.provenance ?? [],
      source_ids: record.source_ids ?? [],
      confidence: record.confidence ?? "medium",
      data_classification: record.data_classification ?? "internal",
      lifecycle_state: record.state,
      supersedes_record_id: record.supersedes_record_id ?? null,
      current_record_revision: Number(record.current_revision),
      current_canonical_revision: Number(record.current_canonical_revision ?? 0),
      created_by_principal_id: record.created_by_principal_id ?? record.approved_by_principal_id,
      updated_by_principal_id: record.updated_by_principal_id ?? record.approved_by_principal_id,
      created_at: record.created_at,
      updated_at: record.updated_at,
      last_change_set_id: record.last_change_set_id ?? null,
      tombstone_reason: record.tombstone_reason ?? null
    };
  });

  state.canonicalRecordRevisions = state.canonicalRecordRevisions.map((revision) => ({
    canonical_record_revision_id: revision.canonical_record_revision_id ?? `crr_${hashKey(`${revision.intelligence_record_id}:${revision.revision}`)}`,
    tenant_id: revision.tenant_id,
    canonical_record_id: revision.intelligence_record_id,
    record_revision: Number(revision.revision),
    canonical_revision: Number(revision.canonical_revision ?? 0),
    change_set_id: revision.change_set_id ?? null,
    before_snapshot: revision.before_snapshot ?? null,
    after_snapshot: revision.after_snapshot ?? revision.content ?? null,
    created_by_principal_id: revision.created_by_principal_id,
    created_by_actor_instance_id: revision.created_by_actor_instance_id ?? null,
    created_at: revision.created_at
  }));

  return state;
}

function map(table, keys, columns, jsonColumns = [], options = {}) {
  return custom(table, keys, (item) => Object.fromEntries(columns.map((column) => [column, item[column]])), jsonColumns, options);
}

function custom(table, keys, transform, jsonColumns = [], options = {}) {
  return { table, keys, transform, jsonColumns: new Set(jsonColumns), tenantScoped: options.tenantScoped !== false };
}

function serialize(value, json) {
  if (value === undefined) return null;
  if (json) return JSON.stringify(value ?? null);
  return value;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSearchResult(row) {
  return {
    kind: row.result_kind,
    id: row.result_id,
    source_id: row.source_id ?? null,
    source_item_id: row.source_item_id ?? null,
    source_name: row.source_name,
    heading: row.heading ?? null,
    excerpt: row.excerpt,
    record_type: row.record_type ?? null,
    rank: Number(row.rank ?? 0),
    metadata: row.metadata ?? {},
    ordinal: Number(row.ordinal ?? 0)
  };
}

function hashKey(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function replaceChunks(client, { tenantId, sourceId, sourceItemId, chunks }) {
  const owned = await client.query(
    "SELECT 1 FROM intelligence.source_items WHERE tenant_id=$1 AND source_id=$2 AND source_item_id=$3",
    [tenantId, sourceId, sourceItemId]
  );
  if (!(owned.rows?.length ?? owned.length)) throw new SovereignError("source_item_not_found", "Source item was not found.", { status: 404 });
  await client.query("DELETE FROM intelligence.source_chunks WHERE tenant_id=$1 AND source_item_id=$2", [tenantId, sourceItemId]);
  for (const chunk of chunks) {
    await client.query(
      `INSERT INTO intelligence.source_chunks
       (source_chunk_id,tenant_id,source_id,source_item_id,ordinal,heading,chunk_text,content_hash,parser_key,parser_version,metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
      [chunk.source_chunk_id, tenantId, sourceId, sourceItemId, chunk.ordinal, chunk.heading ?? null,
        chunk.chunk_text, chunk.content_hash ?? null, chunk.parser_key, chunk.parser_version,
        JSON.stringify(chunk.metadata ?? {})]
    );
  }
}
