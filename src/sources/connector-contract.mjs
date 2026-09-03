import { SovereignError, requireCondition } from "../platform/errors.mjs";

export const SOURCE_CATEGORIES = Object.freeze([
  "external_authoritative", "sovereign_managed", "live_system", "imported_snapshot", "reference_only"
]);

export const SOURCE_CONNECTION_STATES = Object.freeze([
  "not_connected", "authorization_required", "connected", "disconnected", "failed"
]);

export const SOURCE_PROCESSING_STATES = Object.freeze([
  "connected", "inventoried", "indexed", "analyzed", "studied", "canonicalized", "partial", "failed"
]);

export const SOURCE_CURRENTNESS = Object.freeze(["current", "stale", "failed", "partial", "unknown"]);

// These declarations describe a connector's public contract. They do not make
// a provider connected or grant OAuth access. The first real adapters can be
// added without changing source, provenance, or initialization semantics.
export const FIRST_CONNECTOR_DEFINITIONS = Object.freeze([
  {
    connector_key: "google_drive", display_name: "Google Drive", category: "external_authoritative",
    auth_kind: "oauth2", supports: ["inventory", "incremental_sweep", "metadata", "file_reference"],
    requested_scopes: ["drive.metadata.readonly", "drive.readonly"]
  },
  {
    connector_key: "github", display_name: "GitHub", category: "external_authoritative",
    auth_kind: "oauth2", supports: ["inventory", "incremental_sweep", "metadata", "repository_reference"],
    requested_scopes: ["repo:read"]
  },
  {
    connector_key: "direct_upload", display_name: "Direct upload", category: "sovereign_managed",
    auth_kind: "none", supports: ["upload", "inventory", "metadata", "file_reference"], requested_scopes: []
  }
]);

export function validateConnectorDefinition(definition) {
  requireCondition(definition?.connector_key && definition.display_name && definition.auth_kind, "invalid_connector_definition", "Connector key, display name, and auth kind are required.");
  requireCondition(SOURCE_CATEGORIES.includes(definition.category), "invalid_connector_category", "Connector category is invalid.");
  requireCondition(Array.isArray(definition.supports) && Array.isArray(definition.requested_scopes), "invalid_connector_definition", "Connector capabilities and requested scopes are required.");
}

export function requireKnownSourceState(value, accepted, label) {
  if (!accepted.includes(value)) throw new SovereignError("invalid_source_state", `${label} is invalid.`);
}
