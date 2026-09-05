import { createNormalizedNeonPersistence } from "./neon-normalized-persistence.mjs";

// Compatibility entry retained so existing Worker/service wiring does not need
// a second persistence name. V1 normalized Neon tables are authoritative;
// runtime.tenant_state_snapshots remains a versioned rollback/parity mirror.
export function createNeonPersistence(databaseUrl, options) {
  const persistence = createNormalizedNeonPersistence(databaseUrl, options);
  return {
    ...persistence,
    async bootstrapTenant(args) {
      const { tenant, store } = args;
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
      return persistence.bootstrapTenant(args);
    }
  };
}
