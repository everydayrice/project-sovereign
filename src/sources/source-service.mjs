import { newId } from "../platform/ids.mjs";
import { SovereignError, requireCondition } from "../platform/errors.mjs";
import {
  FIRST_CONNECTOR_DEFINITIONS, SOURCE_CATEGORIES, SOURCE_CONNECTION_STATES,
  SOURCE_CURRENTNESS, SOURCE_PROCESSING_STATES, requireKnownSourceState,
  validateConnectorDefinition
} from "./connector-contract.mjs";

export class SourceService {
  constructor({ store, clock }) {
    this.store = store;
    this.clock = clock;
    this.installBuiltInDefinitions();
  }

  installBuiltInDefinitions() {
    for (const definition of FIRST_CONNECTOR_DEFINITIONS) {
      if (!this.store.list("connectorDefinitions", (item) => item.connector_key === definition.connector_key).length) {
        this.store.put("connectorDefinitions", { connector_definition_id: newId("scd"), ...definition, state: "available", created_at: this.now(), updated_at: this.now() });
      }
    }
  }

  listConnectorDefinitions() {
    return this.store.list("connectorDefinitions").sort((left, right) => left.display_name.localeCompare(right.display_name));
  }

  createSource({ tenantId, principalId, connectorKey, category, displayName, locator, authorityState = "supporting", freshnessClass = "unknown", dataClassification = "internal", connectionState, processingState = "connected", currentness = "unknown", metadata = {} }) {
    const connector = connectorKey ? this.requireConnector(connectorKey) : null;
    const effectiveCategory = category ?? connector?.category;
    requireCondition(SOURCE_CATEGORIES.includes(effectiveCategory), "invalid_source_category", "Source category is invalid.");
    const effectiveConnectionState = connectionState ?? (connector?.auth_kind === "oauth2" ? "authorization_required" : "connected");
    requireKnownSourceState(effectiveConnectionState, SOURCE_CONNECTION_STATES, "Source connection state");
    requireKnownSourceState(processingState, SOURCE_PROCESSING_STATES, "Source processing state");
    requireKnownSourceState(currentness, SOURCE_CURRENTNESS, "Source currentness");
    requireCondition(displayName?.trim() && locator?.trim(), "source_identity_required", "Source display name and locator are required.");
    const existing = this.store.list("sources", (source) => source.tenant_id === tenantId && source.canonical_locator === locator)[0];
    if (existing) throw new SovereignError("source_exists", "A source with this locator already exists.", { status: 409 });
    const timestamp = this.now();
    return this.store.put("sources", {
      source_id: newId("src"), tenant_id: tenantId, created_by_principal_id: principalId,
      connector_key: connectorKey ?? null, source_category: effectiveCategory, display_name: displayName.trim(),
      source_type: connectorKey ?? effectiveCategory, canonical_locator: locator.trim(), authority_state: authorityState,
      freshness_class: freshnessClass, data_classification: dataClassification, connection_state: effectiveConnectionState,
      processing_state: processingState, currentness, health_state: sourceHealth(effectiveConnectionState, processingState, currentness),
      item_count: 0, inventoried_item_count: 0, indexed_item_count: 0, analyzed_item_count: 0, studied_item_count: 0,
      canonicalized_item_count: 0, failed_item_count: 0, excluded_item_count: 0, metadata, last_verified_at: null,
      last_sweep_at: null, failure_reason: null, revision: 1, created_at: timestamp, updated_at: timestamp
    });
  }

  createManagedUpload({ tenantId, principalId, fileName, mimeType = "application/octet-stream", sizeBytes, contentHash, classification = "internal", locator }) {
    requireCondition(fileName?.trim(), "file_name_required", "File name is required.");
    requireCondition(Number.isInteger(sizeBytes) && sizeBytes >= 0, "file_size_invalid", "File size must be a non-negative integer.");
    const source = this.createSource({
      tenantId, principalId, connectorKey: "direct_upload", category: "sovereign_managed", displayName: fileName,
      locator: locator ?? `sovereign://uploads/${newId("obj")}/${encodeURIComponent(fileName)}`,
      dataClassification: classification, connectionState: "connected", processingState: "connected", currentness: "current",
      metadata: { mime_type: mimeType, size_bytes: sizeBytes, content_hash: contentHash ?? null, storage_state: "awaiting_object_store" }
    });
    return this.recordInventory({ tenantId, sourceId: source.source_id, items: [{ name: fileName, locator: source.canonical_locator, mimeType, sizeBytes, contentHash, storageState: "awaiting_object_store" }] }).source;
  }

  recordInventory({ tenantId, sourceId, items = [], excludedCount = 0 }) {
    const source = this.store.requireTenant("sources", sourceId, tenantId);
    if (source.connection_state !== "connected") throw new SovereignError("source_unavailable", "Cannot inventory a source until its connection is active.", { status: 409 });
    const timestamp = this.now();
    const savedItems = items.map((item) => this.store.put("sourceItems", {
      source_item_id: newId("sri"), tenant_id: tenantId, source_id: sourceId, display_name: item.name ?? item.locator,
      canonical_locator: item.locator, mime_type: item.mimeType ?? null, size_bytes: item.sizeBytes ?? null,
      content_hash: item.contentHash ?? null, item_state: "inventoried", storage_state: item.storageState ?? "external_reference",
      privacy_state: item.privacyState ?? "included", metadata: item.metadata ?? {}, discovered_at: timestamp,
      updated_at: timestamp
    }));
    const updated = this.store.update("sources", sourceId, (current) => ({
      ...current, connection_state: "connected", processing_state: "inventoried", currentness: current.currentness === "failed" ? "partial" : current.currentness,
      health_state: sourceHealth("connected", "inventoried", current.currentness === "failed" ? "partial" : current.currentness),
      item_count: current.item_count + savedItems.length + excludedCount, inventoried_item_count: current.inventoried_item_count + savedItems.length,
      excluded_item_count: current.excluded_item_count + excludedCount, last_verified_at: timestamp, failure_reason: null,
      revision: current.revision + 1, updated_at: timestamp
    }));
    return { source: updated, items: savedItems };
  }

  getSourceItem(tenantId, sourceItemId) {
    return this.store.requireTenant("sourceItems", sourceItemId, tenantId);
  }

  attachStoredObject({ tenantId, sourceId, sourceItemId, objectKey, objectVersion = null }) {
    const item = this.store.requireTenant("sourceItems", sourceItemId, tenantId);
    if (item.source_id !== sourceId) throw new SovereignError("source_item_mismatch", "Source item does not belong to this source.", { status: 409 });
    this.store.requireTenant("sources", sourceId, tenantId);
    const timestamp = this.now();
    const saved = this.store.update("sourceItems", sourceItemId, (current) => ({
      ...current,
      storage_state: "stored",
      r2_object_key: objectKey,
      object_version: objectVersion,
      updated_at: timestamp
    }));
    this.store.update("sources", sourceId, (current) => ({
      ...current,
      metadata: { ...current.metadata, storage_state: "stored" },
      revision: current.revision + 1,
      updated_at: timestamp
    }));
    return saved;
  }

  updateProcessing({ tenantId, sourceId, processingState, currentness, delta = {} }) {
    requireKnownSourceState(processingState, SOURCE_PROCESSING_STATES, "Source processing state");
    requireKnownSourceState(currentness, SOURCE_CURRENTNESS, "Source currentness");
    const source = this.store.requireTenant("sources", sourceId, tenantId);
    const timestamp = this.now();
    return this.store.update("sources", sourceId, (current) => ({
      ...current, processing_state: processingState, currentness, health_state: sourceHealth(current.connection_state, processingState, currentness),
      indexed_item_count: delta.indexedItemCount ?? current.indexed_item_count,
      analyzed_item_count: delta.analyzedItemCount ?? current.analyzed_item_count,
      studied_item_count: delta.studiedItemCount ?? current.studied_item_count,
      canonicalized_item_count: delta.canonicalizedItemCount ?? current.canonicalized_item_count,
      failed_item_count: delta.failedItemCount ?? current.failed_item_count,
      last_verified_at: timestamp, revision: current.revision + 1, updated_at: timestamp
    }));
  }

  markFailed({ tenantId, sourceId, reason, stale = true }) {
    const timestamp = this.now();
    return this.store.update("sources", sourceId, (current) => ({
      ...current, connection_state: "failed", processing_state: "failed", currentness: stale ? "stale" : "failed",
      health_state: "failed", failure_reason: reason, failed_item_count: current.failed_item_count + 1,
      revision: current.revision + 1, updated_at: timestamp
    }));
  }

  listSources(tenantId) {
    return this.store.list("sources", (source) => source.tenant_id === tenantId).sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  }

  sourceHealth(tenantId) {
    const sources = this.listSources(tenantId);
    return {
      total: sources.length,
      connected: sources.filter((source) => source.connection_state === "connected").length,
      inventoried: sources.filter((source) => ["inventoried", "indexed", "analyzed", "studied", "canonicalized", "partial"].includes(source.processing_state)).length,
      analyzed: sources.filter((source) => ["analyzed", "studied", "canonicalized"].includes(source.processing_state)).length,
      current: sources.filter((source) => source.currentness === "current").length,
      stale: sources.filter((source) => source.currentness === "stale").length,
      failed: sources.filter((source) => source.health_state === "failed").length,
      partial: sources.filter((source) => source.currentness === "partial" || source.processing_state === "partial").length,
      sources
    };
  }

  requireConnector(connectorKey) {
    const connector = this.store.list("connectorDefinitions", (definition) => definition.connector_key === connectorKey && definition.state === "available")[0];
    if (!connector) throw new SovereignError("connector_unavailable", "Source connector is not available.", { status: 404 });
    validateConnectorDefinition(connector);
    return connector;
  }

  now() { return this.clock().toISOString(); }
}

function sourceHealth(connectionState, processingState, currentness) {
  if (connectionState === "failed" || processingState === "failed" || currentness === "failed") return "failed";
  if (connectionState === "authorization_required" || connectionState === "disconnected") return "attention_required";
  if (currentness === "stale" || currentness === "partial" || processingState === "partial") return "partial";
  if (["studied", "canonicalized"].includes(processingState) && currentness === "current") return "healthy";
  return "initializing";
}
