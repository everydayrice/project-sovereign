import { newId, stableHash } from "../platform/ids.mjs";
import { SovereignError, requireCondition } from "../platform/errors.mjs";

export class ExtensionHost {
  constructor({ store, clock }) {
    this.store = store;
    this.clock = clock;
  }

  install({ tenantId, principalId, manifest, grantedScopes = [] }) {
    validateManifest(manifest);
    const requestedScopes = manifest.sovereign.requested_scopes;
    requireCondition(grantedScopes.every((scope) => requestedScopes.includes(scope)), "extension_scope_not_requested", "Extension grants must be a subset of requested scopes.", { status: 403 });
    for (const eventType of manifest.sovereign.events ?? []) {
      requireCondition(["task.created", "task.updated", "continuity.checkpoint"].includes(eventType), "extension_event_invalid", "Unsupported extension event.");
      requireCondition(grantedScopes.includes("continuity:read"), "extension_event_scope_required", "Continuity events require continuity:read.", { status: 403 });
    }
    const timestamp = this.now();
    let extension = this.store.list("extensions", (candidate) => candidate.manifest.id === manifest.id && candidate.manifest.version === manifest.version)[0];
    if (!extension) {
      extension = this.store.put("extensions", { extension_id: newId("ext"), publisher: manifest.publisher, state: "active", manifest, created_at: timestamp, updated_at: timestamp });
    }
    const existing = this.store.list("extensionInstallations", (installation) => installation.tenant_id === tenantId && installation.extension_id === extension.extension_id)[0];
    if (extension && stableHash(extension.manifest) !== stableHash(manifest)) throw new SovereignError("extension_manifest_changed", "A published version cannot change its manifest.", { status: 409 });
    if (existing?.state === "active") throw new SovereignError("extension_already_installed", "Extension is already installed.", { status: 409 });
    const installation = this.store.put("extensionInstallations", {
      extension_installation_id: existing?.extension_installation_id ?? newId("exi"), tenant_id: tenantId, extension_id: extension.extension_id,
      state: "active", installed_by_principal_id: principalId, installed_at: timestamp, revoked_at: null
    });
    const grant = this.store.put("extensionGrants", {
      extension_grant_id: newId("exg"), tenant_id: tenantId, extension_installation_id: installation.extension_installation_id,
      extension_id: extension.extension_id, state: "active", granted_scopes: [...new Set(grantedScopes)],
      granted_by: { principal_id: principalId }, granted_at: timestamp, revoked_at: null, revision: 1, created_at: timestamp, updated_at: timestamp
    });
    for (const eventType of manifest.sovereign.events ?? []) {
      const previous = this.store.list("extensionEventSubscriptions", item => item.extension_installation_id === installation.extension_installation_id && item.event_type === eventType)[0];
      this.store.put("extensionEventSubscriptions", { extension_event_subscription_id: previous?.extension_event_subscription_id ?? newId("exs"), tenant_id: tenantId, extension_installation_id: installation.extension_installation_id, event_type: eventType, delivery_url: null, state: "active", created_by_principal_id: principalId, created_at: timestamp, updated_at: timestamp });
    }
    this.audit({ tenantId, principalId, installationId: installation.extension_installation_id, action: "installed" });
    return { extension, installation, grant };
  }

  assertScope({ tenantId, extensionId, scope }) {
    const installation = this.store.list("extensionInstallations", (candidate) => candidate.tenant_id === tenantId && candidate.extension_id === extensionId)[0];
    if (!installation || installation.state !== "active") throw new SovereignError("extension_access_revoked", "Extension is not actively installed for this tenant.", { status: 403 });
    const grant = this.store.list("extensionGrants", (candidate) => candidate.tenant_id === tenantId && candidate.extension_installation_id === installation.extension_installation_id && candidate.state === "active")[0];
    if (!grant || !grant.granted_scopes.includes(scope)) throw new SovereignError("extension_scope_denied", "Extension does not have this scope.", { status: 403 });
    return grant;
  }

  revoke({ tenantId, extensionId, principalId }) {
    const installation = this.store.list("extensionInstallations", (candidate) => candidate.tenant_id === tenantId && candidate.extension_id === extensionId)[0];
    if (!installation) throw new SovereignError("extension_not_installed", "Extension is not installed.", { status: 404 });
    const timestamp = this.now();
    const updatedInstallation = this.store.update("extensionInstallations", installation.extension_installation_id, (current) => ({ ...current, state: "revoked", revoked_at: timestamp }));
    for (const grant of this.store.list("extensionGrants", (candidate) => candidate.extension_installation_id === installation.extension_installation_id && candidate.state === "active")) {
      this.store.update("extensionGrants", grant.extension_grant_id, (current) => ({ ...current, state: "revoked", revoked_at: timestamp, revision: current.revision + 1, updated_at: timestamp }));
    }
    for (const subscription of this.store.list("extensionEventSubscriptions", item => item.tenant_id === tenantId && item.extension_installation_id === installation.extension_installation_id)) this.store.update("extensionEventSubscriptions", subscription.extension_event_subscription_id, { state: "revoked", updated_at: timestamp });
    if (principalId) this.audit({ tenantId, principalId, installationId: installation.extension_installation_id, action: "revoked" });
    return updatedInstallation;
  }

  list(tenantId) {
    return this.store.list("extensionInstallations", item => item.tenant_id === tenantId).map(installation => ({ ...installation,
      manifest: this.store.get("extensions", installation.extension_id)?.manifest,
      grants: this.store.list("extensionGrants", item => item.tenant_id === tenantId && item.extension_installation_id === installation.extension_installation_id)
    }));
  }

  setEnabled({ tenantId, principalId, extensionId, enabled }) {
    const installation = this.store.list("extensionInstallations", item => item.tenant_id === tenantId && item.extension_id === extensionId && item.state === "active")[0];
    if (!installation) throw new SovereignError("extension_access_revoked", "Reinstall a revoked or uninstalled extension before enabling.", { status: 409 });
    for (const grant of this.store.list("extensionGrants", item => item.extension_installation_id === installation.extension_installation_id && ["active", "reduced"].includes(item.state))) this.store.update("extensionGrants", grant.extension_grant_id, { state: enabled ? "active" : "reduced", updated_at: this.now() });
    this.audit({ tenantId, principalId, installationId: installation.extension_installation_id, action: enabled ? "enabled" : "disabled" });
    return { ...installation, enabled };
  }

  uninstall(args) {
    const installation = this.revoke(args);
    this.audit({ tenantId: args.tenantId, principalId: args.principalId, installationId: installation.extension_installation_id, action: "uninstalled" });
    return this.store.update("extensionInstallations", installation.extension_installation_id, { state: "uninstalled" });
  }

  publish({ tenantId, eventType, subjectType, subjectId }) {
    const timestamp = this.now();
    for (const subscription of this.store.list("extensionEventSubscriptions", item => item.tenant_id === tenantId && item.state === "active" && item.event_type === eventType)) {
      const installation = this.store.requireTenant("extensionInstallations", subscription.extension_installation_id, tenantId);
      try { this.assertScope({ tenantId, extensionId: installation.extension_id, scope: "continuity:read" }); } catch { continue; }
      this.store.put("extensionEventOutbox", { extension_event_id: newId("evt"), tenant_id: tenantId, extension_installation_id: installation.extension_installation_id, event_type: eventType, subject_type: subjectType, subject_id: subjectId, payload: { subject_id: subjectId }, state: "pending", attempt_count: 0, available_at: timestamp, created_at: timestamp, updated_at: timestamp });
    }
  }

  events({ tenantId, extensionId }) {
    const grant = this.assertScope({ tenantId, extensionId, scope: "continuity:read" });
    return this.store.list("extensionEventOutbox", item => item.tenant_id === tenantId && item.extension_installation_id === grant.extension_installation_id && item.state === "pending").sort((a,b) => a.created_at.localeCompare(b.created_at)).slice(0,100);
  }

  acknowledge({ tenantId, extensionId, eventId }) {
    const grant = this.assertScope({ tenantId, extensionId, scope: "continuity:read" });
    const event = this.store.requireTenant("extensionEventOutbox", eventId, tenantId);
    requireCondition(event.extension_installation_id === grant.extension_installation_id, "extension_event_denied", "Event belongs to another installation.", { status: 403 });
    return this.store.update("extensionEventOutbox", eventId, { state: "delivered", delivered_at: this.now(), last_attempt_at: this.now(), attempt_count: event.attempt_count + 1, updated_at: this.now() });
  }

  audit({ tenantId, principalId, installationId, action }) {
    this.store.put("auditEvents", { audit_event_id: newId("aud"), tenant_id: tenantId, principal_id: principalId, event_type: "extension."+action, subject_type: "extension_installation", subject_id: installationId, outcome: "success", metadata: {}, occurred_at: this.now() });
  }

  now() { return this.clock().toISOString(); }
}

function validateManifest(manifest) {
  requireCondition(manifest?.manifest_version === 1, "invalid_extension_manifest", "Extension manifest version 1 is required.");
  requireCondition(/^[a-z][a-z0-9_.-]{2,127}$/.test(manifest.id) && manifest.name && manifest.publisher && /^\d+\.\d+\.\d+(?:[-+].+)?$/.test(manifest.version), "invalid_extension_manifest", "Extension identity fields are required.");
  requireCondition([">=0.2.0", "^0.2.0", "sovereign.v1"].includes(manifest.sovereign?.compatibility), "invalid_extension_manifest", "Supported compatibility values are >=0.2.0, ^0.2.0, and sovereign.v1.");
  if (manifest.ui?.launch_url) { let url; try { url = new URL(manifest.ui.launch_url); } catch {} requireCondition(url?.protocol === "https:" && !url.username && !url.password, "invalid_extension_manifest", "Extension launch URL must use HTTPS without credentials."); }
  requireCondition(Array.isArray(manifest.sovereign?.requested_scopes) && manifest.sovereign.requested_scopes.every(scope => typeof scope === "string" && /^[a-z][a-z0-9_.:-]{2,127}$/.test(scope)), "invalid_extension_manifest", "Extension requested scopes are required.");
  requireCondition(manifest.privacy?.retention_behavior && manifest.privacy?.uninstall_behavior, "invalid_extension_manifest", "Extension privacy and uninstall behavior are required.");
}
