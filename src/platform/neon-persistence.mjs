import { neon } from "@neondatabase/serverless";
import { createNormalizedNeonPersistence } from "./neon-normalized-persistence.mjs";

// Compatibility entry retained so existing Worker/service wiring does not need
// a second persistence name. V1 normalized Neon tables are authoritative;
// runtime.tenant_state_snapshots remains a versioned rollback/parity mirror.
export function createNeonPersistence(databaseUrl, options) {
  const persistence = createNormalizedNeonPersistence(databaseUrl, options);
  const sql = options?.httpSql ?? neon(databaseUrl);
  return {
    ...persistence,
    async bootstrapTenant(args) {
      const { tenant, principal, store } = args;
      if (!store.list("canonicalStates", (state) => state.tenant_id === tenant.tenant_id).length) {
        const timestamp = new Date().toISOString();
        store.put("canonicalStates", {
          canonical_state_id: `cst_bootstrap_${tenant.tenant_id}`,
          tenant_id: tenant.tenant_id,
          current_revision: 0,
          last_change_set_id: null,
          created_at: timestamp,
          updated_at: timestamp
        });
      }
      const result = await persistence.bootstrapTenant(args);
      await sql.query(
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
      return result;
    }
  };
}
