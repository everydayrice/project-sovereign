import { newId } from "../platform/ids.mjs";
import { SovereignError, requireCondition } from "../platform/errors.mjs";

export class CommandService {
  constructor({ store, clock }) {
    this.store = store;
    this.clock = clock;
  }

  createTenant({ slug, displayName, commandDisplayName = "COMMAND" }) {
    requireCondition(/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug), "invalid_tenant_slug", "Tenant slug is invalid.");
    requireCondition(!this.store.list("tenants", (tenant) => tenant.slug === slug).length, "tenant_slug_taken", "Tenant slug already exists.", { status: 409 });
    const timestamp = this.now();
    return this.store.put("tenants", {
      tenant_id: newId("ten"), slug, display_name: displayName, command_display_name: commandDisplayName,
      state: "active", branding: {}, revision: 1, created_at: timestamp, updated_at: timestamp
    });
  }

  createPrincipal({ tenantId, kind = "human", displayName, authSubjectReference }) {
    this.requireActiveTenant(tenantId);
    const timestamp = this.now();
    return this.store.put("principals", {
      principal_id: newId("prn"), tenant_id: tenantId, kind, display_name: displayName, state: "active",
      auth_subject_reference: authSubjectReference, role_ids: [], revision: 1, created_at: timestamp, updated_at: timestamp
    });
  }

  createWorkspace({ tenantId, principalId, slug, displayName, parentWorkspaceId = null, settings = {} }) {
    this.requireActiveTenant(tenantId);
    if (principalId) this.requirePrincipal(tenantId, principalId);
    requireCondition(/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug), "invalid_workspace_slug", "Workspace slug is invalid.");
    requireCondition(displayName?.trim(), "workspace_name_required", "Workspace display name is required.");
    requireCondition(!this.store.list("workspaces", (workspace) => workspace.tenant_id === tenantId && workspace.slug === slug).length, "workspace_slug_taken", "Workspace slug already exists.", { status: 409 });
    if (parentWorkspaceId) this.store.requireTenant("workspaces", parentWorkspaceId, tenantId);
    const timestamp = this.now();
    return this.store.put("workspaces", {
      workspace_id: newId("wsp"), tenant_id: tenantId, parent_workspace_id: parentWorkspaceId, slug,
      display_name: displayName.trim(), state: "active", settings, created_by_principal_id: principalId ?? null,
      revision: 1, created_at: timestamp, updated_at: timestamp
    });
  }

  listWorkspaces(tenantId) {
    this.requireActiveTenant(tenantId);
    return this.store.list("workspaces", (workspace) => workspace.tenant_id === tenantId).sort((left, right) => left.display_name.localeCompare(right.display_name));
  }

  requirePrincipal(tenantId, principalId) {
    const principal = this.store.requireTenant("principals", principalId, tenantId);
    if (principal.state !== "active") throw new SovereignError("principal_inactive", "Principal is not active.", { status: 403 });
    return principal;
  }

  resolveActor({ tenantId, principalId, actor }) {
    this.requirePrincipal(tenantId, principalId);
    if (actor.actorInstanceId) {
      const existing = this.store.requireTenant("actorInstances", actor.actorInstanceId, tenantId);
      if (existing.principal_id !== principalId) throw new SovereignError("actor_principal_mismatch", "Actor Instance belongs to another principal.", { status: 403 });
      return this.touchActor(existing);
    }
    const provider = this.resolveProvider(tenantId, actor.provider);
    const surface = this.resolveSurface(tenantId, provider.provider_id, actor.surface);
    if (actor.externalSessionId) {
      const existing = this.store.list("actorInstances", (candidate) =>
        candidate.tenant_id === tenantId && candidate.surface_id === surface.surface_id && candidate.external_session_id === actor.externalSessionId
      )[0];
      if (existing) {
        if (existing.principal_id !== principalId) throw new SovereignError("external_session_owned", "External session is already mapped to another principal.", { status: 403 });
        return this.touchActor(existing);
      }
    }
    const timestamp = this.now();
    return this.store.put("actorInstances", {
      actor_instance_id: newId("act"), tenant_id: tenantId, principal_id: principalId,
      provider_id: provider.provider_id, surface_id: surface.surface_id,
      external_session_id: actor.externalSessionId, agent_profile_id: actor.agentProfileId,
      model_metadata: actor.modelMetadata ?? {}, state: "active", last_seen_at: timestamp,
      revision: 1, created_at: timestamp, updated_at: timestamp
    });
  }

  actorDescriptor(actor) {
    const provider = this.store.get("providers", actor.provider_id);
    const surface = this.store.get("surfaces", actor.surface_id);
    return {
      actor_instance_id: actor.actor_instance_id, principal_id: actor.principal_id,
      provider: { provider_id: provider.provider_id, provider_key: provider.provider_key, display_name: provider.display_name, account_reference: provider.account_reference },
      surface: { surface_id: surface.surface_id, provider_id: provider.provider_id, surface_key: surface.surface_key, display_name: surface.display_name, surface_type: surface.surface_type },
      external_session_id: actor.external_session_id, model_metadata: actor.model_metadata, agent_profile_id: actor.agent_profile_id
    };
  }

  requireActiveTenant(tenantId) {
    const tenant = this.store.get("tenants", tenantId);
    if (!tenant) throw new SovereignError("tenant_not_found", "Tenant was not found.", { status: 404 });
    if (tenant.state !== "active") throw new SovereignError("tenant_inactive", "Tenant is not active.", { status: 403 });
    return tenant;
  }

  resolveProvider(tenantId, providerInput = {}) {
    requireCondition(providerInput.key, "provider_required", "Actor provider key is required.");
    const accountReference = providerInput.accountReference ?? null;
    const match = this.store.list("providers", (provider) => provider.tenant_id === tenantId && provider.provider_key === providerInput.key && provider.account_reference === accountReference)[0];
    if (match) return match;
    const timestamp = this.now();
    return this.store.put("providers", {
      provider_id: newId("prv"), tenant_id: tenantId, provider_key: providerInput.key,
      display_name: providerInput.displayName ?? providerInput.key, account_reference: accountReference,
      metadata: providerInput.metadata ?? {}, created_at: timestamp, updated_at: timestamp
    });
  }

  resolveSurface(tenantId, providerId, surfaceInput = {}) {
    requireCondition(surfaceInput.key, "surface_required", "Actor surface key is required.");
    const match = this.store.list("surfaces", (surface) => surface.tenant_id === tenantId && surface.provider_id === providerId && surface.surface_key === surfaceInput.key)[0];
    if (match) return match;
    const timestamp = this.now();
    return this.store.put("surfaces", {
      surface_id: newId("srf"), tenant_id: tenantId, provider_id: providerId, surface_key: surfaceInput.key,
      display_name: surfaceInput.displayName ?? surfaceInput.key, surface_type: surfaceInput.type ?? "other",
      metadata: surfaceInput.metadata ?? {}, created_at: timestamp, updated_at: timestamp
    });
  }

  touchActor(actor) {
    const timestamp = this.now();
    return this.store.update("actorInstances", actor.actor_instance_id, (current) => ({
      ...current, state: "active", last_seen_at: timestamp, revision: current.revision + 1, updated_at: timestamp
    }));
  }

  now() { return this.clock().toISOString(); }
}
