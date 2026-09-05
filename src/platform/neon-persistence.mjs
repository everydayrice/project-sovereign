// Compatibility import retained so existing Worker/service wiring does not need
// a second persistence name. V1 normalized Neon tables are authoritative;
// runtime.tenant_state_snapshots remains a versioned rollback/parity mirror.
export { createNormalizedNeonPersistence as createNeonPersistence } from "./neon-normalized-persistence.mjs";
