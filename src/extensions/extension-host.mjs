import { newId } from "../platform/ids.mjs";
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
    const timestamp = this.now();
    let extension = this.store.list("extensions", (candidate) => candidate.manifest.id === manifest.id && candidate.manifest.version === manifest.version)[0];
    if (!extension) {
      extension = this.store.put("extensions", { extension_id: newId("ext"), publisher: manifest.publisher, state: "active", manifest, created_at: timestamp, updated_at: timestamp });
    }
    const existing = this.store.list("extensionInstallations", (installation) => installation.tenant_id === tenantId && installation.extension_id === extension.extension_id)[0];
    if (existing?.state === "active") throw new SovereignError("extension_already_installed", "Extension is already installed.", { status: 409 });
    const installation = this.store.put("extensionInstallations", {
      extension_installation_id: newId("exi"), tenant_id: tenantId, extension_id: extension.extension_id,
      state: "active", installed_by_principal_id: principalId, installed_at: timestamp, revoked_at: null
    });
    const grant = this.store.put("extensionGrants", {
      extension_grant_id: newId("exg"), tenant_id: tenantId, extension_installation_id: installation.extension_installation_id,
      extension_id: extension.extension_id, state: "active", granted_scopes: [...new Set(grantedScopes)],
      granted_by: { principal_id: principalId }, granted_at: timestamp, revoked_at: null, revision: 1, created_at: timestamp, updated_at: timestamp
    });
    return { extension, installation, grant };
  }

  assertScope({ tenantId, extensionId, scope }) {
    const installation = this.store.list("extensionInstallations", (candidate) => candidate.tenant_id === tenantId && candidate.extension_id === extensionId)[0];
    if (!installation || installation.state !== "active") throw new SovereignError("extension_access_revoked", "Extension is not actively installed for this tenant.", { status: 403 });
    const grant = this.store.list("extensionGrants", (candidate) => candidate.tenant_id === tenantId && candidate.extension_installation_id === installation.extension_installation_id && candidate.state === "active")[0];
    if (!grant || !grant.granted_scopes.includes(scope)) throw new SovereignError("extension_scope_denied", "Extension does not have this scope.", { status: 403 });
    return grant;
  }

  revoke({ tenantId, extensionId }) {
    const installation = this.store.list("extensionInstallations", (candidate) => candidate.tenant_id === tenantId && candidate.extension_id === extensionId)[0];
    if (!installation) throw new SovereignError("extension_not_installed", "Extension is not installed.", { status: 404 });
    const timestamp = this.now();
    const updatedInstallation = this.store.update("extensionInstallations", installation.extension_installation_id, (current) => ({ ...current, state: "revoked", revoked_at: timestamp }));
    for (const grant of this.store.list("extensionGrants", (candidate) => candidate.extension_installation_id === installation.extension_installation_id && candidate.state === "active")) {
      this.store.update("extensionGrants", grant.extension_grant_id, (current) => ({ ...current, state: "revoked", revoked_at: timestamp, revision: current.revision + 1, updated_at: timestamp }));
    }
    return updatedInstallation;
  }

  now() { return this.clock().toISOString(); }
}

function validateManifest(manifest) {
  requireCondition(manifest?.manifest_version === 1, "invalid_extension_manifest", "Extension manifest version 1 is required.");
  requireCondition(manifest.id && manifest.name && manifest.publisher && manifest.version, "invalid_extension_manifest", "Extension identity fields are required.");
  requireCondition(Array.isArray(manifest.sovereign?.requested_scopes), "invalid_extension_manifest", "Extension requested scopes are required.");
  requireCondition(manifest.privacy?.retention_behavior && manifest.privacy?.uninstall_behavior, "invalid_extension_manifest", "Extension privacy and uninstall behavior are required.");
}
