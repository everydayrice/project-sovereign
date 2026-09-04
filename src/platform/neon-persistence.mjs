import { neon } from "@neondatabase/serverless";
import { InMemorySovereignStore } from "./store.mjs";
import { SovereignError } from "./errors.mjs";

export function createNeonPersistence(databaseUrl) {
  if (!databaseUrl) throw new SovereignError("database_not_configured", "DATABASE_URL is required for the production Sovereign runtime.", { status: 503 });
  const sql = neon(databaseUrl);

  return {
    async resolveAuthBinding(authSubjectReference) {
      const rows = await sql.query(
        `select auth_subject_reference, tenant_id, principal_id
           from runtime.auth_bindings
          where auth_subject_reference = $1`,
        [authSubjectReference]
      );
      return rows[0] ?? null;
    },

    async loadTenant(tenantId) {
      const rows = await sql.query(
        `select tenant_id, state, version
           from runtime.tenant_state_snapshots
          where tenant_id = $1`,
        [tenantId]
      );
      if (!rows.length) throw new SovereignError("tenant_state_missing", "Persistent tenant state was not found.", { status: 503 });
      const store = new InMemorySovereignStore();
      store.importState(rows[0].state ?? {});
      return { store, version: Number(rows[0].version ?? 0) };
    },

    async saveTenant({ tenantId, store, expectedVersion }) {
      const state = store.exportState();
      const rows = await sql.query(
        `update runtime.tenant_state_snapshots
            set state = $2::jsonb,
                version = version + 1,
                updated_at = now()
          where tenant_id = $1
            and version = $3
        returning version`,
        [tenantId, JSON.stringify(state), expectedVersion]
      );
      if (!rows.length) {
        throw new SovereignError("tenant_state_conflict", "Tenant state changed during this request. Retry against the latest state.", {
          status: 409,
          details: { tenant_id: tenantId, expected_version: expectedVersion }
        });
      }
      return { version: Number(rows[0].version) };
    },

    async bootstrapTenant({ authSubjectReference, tenant, principal, workspace, store }) {
      const state = store.exportState();
      const rows = await sql.query(
        `with inserted_tenant as (
           insert into command.tenants
             (tenant_id, slug, display_name, command_display_name, state, branding, revision, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::timestamptz, $9::timestamptz)
           returning tenant_id
         ), inserted_principal as (
           insert into command.principals
             (principal_id, tenant_id, kind, display_name, state, auth_subject_reference, metadata, revision, created_at, updated_at)
           values ($10, $1, $11, $12, $13, $14, $15::jsonb, $16, $17::timestamptz, $18::timestamptz)
           returning principal_id
         ), inserted_workspace as (
           insert into command.workspaces
             (workspace_id, tenant_id, parent_workspace_id, slug, display_name, state, settings, created_by_principal_id, revision, created_at, updated_at)
           values ($19, $1, $20, $21, $22, $23, $24::jsonb, $10, $25, $26::timestamptz, $27::timestamptz)
           returning workspace_id
         ), inserted_binding as (
           insert into runtime.auth_bindings
             (auth_subject_reference, tenant_id, principal_id)
           values ($14, $1, $10)
           returning auth_subject_reference
         )
         insert into runtime.tenant_state_snapshots (tenant_id, state, version)
         values ($1, $28::jsonb, 1)
         returning tenant_id, version`,
        [
          tenant.tenant_id, tenant.slug, tenant.display_name, tenant.command_display_name, tenant.state,
          JSON.stringify(tenant.branding ?? {}), tenant.revision, tenant.created_at, tenant.updated_at,
          principal.principal_id, principal.kind, principal.display_name, principal.state, authSubjectReference,
          JSON.stringify(principal.metadata ?? {}), principal.revision, principal.created_at, principal.updated_at,
          workspace.workspace_id, workspace.parent_workspace_id, workspace.slug, workspace.display_name, workspace.state,
          JSON.stringify(workspace.settings ?? {}), workspace.revision, workspace.created_at, workspace.updated_at,
          JSON.stringify(state)
        ]
      );
      return { tenant_id: rows[0].tenant_id, version: Number(rows[0].version) };
    },

    async health() {
      const rows = await sql.query("select 1 as ok");
      return rows[0]?.ok === 1;
    }
  };
}
