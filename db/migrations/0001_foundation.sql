-- Project Sovereign V0.2 foundation. Run only against the dedicated PROJECT
-- SOVEREIGN Neon project after Neon Auth and deployment bindings are verified.
-- IDs are opaque application-issued strings so providers and tenant semantics
-- are never encoded into database identifiers.

BEGIN;

CREATE SCHEMA IF NOT EXISTS command;
CREATE SCHEMA IF NOT EXISTS intelligence;
CREATE SCHEMA IF NOT EXISTS continuity;
CREATE SCHEMA IF NOT EXISTS control;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS runtime;

CREATE OR REPLACE FUNCTION command.current_tenant_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.sovereign_tenant_id', true), '');
$$;

CREATE TABLE command.tenants (
  tenant_id text PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  display_name text NOT NULL,
  command_display_name text NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'suspended', 'archived')),
  branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE command.principals (
  principal_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  kind text NOT NULL CHECK (kind IN ('human', 'service', 'extension')),
  display_name text NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'suspended', 'revoked')),
  auth_subject_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, auth_subject_reference)
);

CREATE TABLE command.roles (
  role_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  name text NOT NULL,
  permission_set jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE command.principal_role_bindings (
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  principal_id text NOT NULL REFERENCES command.principals(principal_id),
  role_id text NOT NULL REFERENCES command.roles(role_id),
  granted_by_principal_id text REFERENCES command.principals(principal_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, principal_id, role_id)
);

CREATE TABLE command.policies (
  policy_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  policy_type text NOT NULL CHECK (policy_type IN ('authorization', 'traffic', 'privacy', 'retention', 'approval', 'resource', 'extension')),
  state text NOT NULL CHECK (state IN ('draft', 'active', 'superseded', 'retired')),
  rules jsonb NOT NULL,
  effective_at timestamptz NOT NULL,
  supersedes_policy_id text REFERENCES command.policies(policy_id),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX command_policies_active_idx ON command.policies (tenant_id, policy_type, effective_at DESC) WHERE state = 'active';

CREATE TABLE command.providers (
  provider_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  provider_key text NOT NULL,
  display_name text NOT NULL,
  account_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider_key, account_reference)
);

CREATE TABLE command.surfaces (
  surface_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  provider_id text NOT NULL REFERENCES command.providers(provider_id),
  surface_key text NOT NULL,
  display_name text NOT NULL,
  surface_type text NOT NULL CHECK (surface_type IN ('chat', 'workspace', 'coding', 'api', 'mcp', 'cli', 'human', 'extension', 'other')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider_id, surface_key)
);

CREATE TABLE command.integrations (
  integration_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  integration_type text NOT NULL,
  display_name text NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'disabled', 'revoked', 'error')),
  secret_reference text,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE intelligence.sources (
  source_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  source_type text NOT NULL,
  canonical_locator text NOT NULL,
  authority_state text NOT NULL CHECK (authority_state IN ('authoritative', 'supporting', 'historical', 'untrusted', 'retired')),
  freshness_class text NOT NULL CHECK (freshness_class IN ('live', 'volatile', 'periodic', 'static', 'unknown')),
  data_classification text NOT NULL CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted')),
  retention_policy_id text,
  last_verified_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, canonical_locator)
);

CREATE TABLE command.source_authority_configurations (
  source_authority_configuration_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  source_id text NOT NULL REFERENCES intelligence.sources(source_id),
  topic text NOT NULL,
  access_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  live_verification_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_id, topic)
);

CREATE TABLE intelligence.records (
  intelligence_record_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  record_type text NOT NULL CHECK (record_type IN ('fact', 'decision', 'policy', 'entity', 'project', 'domain', 'architecture', 'constraint', 'relationship', 'summary')),
  state text NOT NULL CHECK (state IN ('active', 'superseded', 'archived', 'retracted')),
  authority_level text NOT NULL CHECK (authority_level IN ('verified', 'approved', 'provisional')),
  current_revision integer NOT NULL DEFAULT 1,
  supersedes_record_id text REFERENCES intelligence.records(intelligence_record_id),
  approved_by_principal_id text NOT NULL REFERENCES command.principals(principal_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intelligence_records_lookup_idx ON intelligence.records (tenant_id, record_type, state, updated_at DESC);

CREATE TABLE intelligence.record_revisions (
  intelligence_record_id text NOT NULL REFERENCES intelligence.records(intelligence_record_id),
  revision integer NOT NULL CHECK (revision > 0),
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  content jsonb NOT NULL,
  created_by_principal_id text NOT NULL REFERENCES command.principals(principal_id),
  created_by_actor_instance_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (intelligence_record_id, revision)
);

CREATE TABLE intelligence.provenance (
  provenance_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  source_id text NOT NULL REFERENCES intelligence.sources(source_id),
  source_locator text NOT NULL,
  content_fingerprint text,
  retrieved_at timestamptz NOT NULL,
  source_observed_at timestamptz,
  fragment_reference text,
  asserted_by_principal_id text NOT NULL REFERENCES command.principals(principal_id),
  asserted_by_actor_instance_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE intelligence.record_provenance (
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  intelligence_record_id text NOT NULL REFERENCES intelligence.records(intelligence_record_id),
  record_revision integer NOT NULL,
  provenance_id text NOT NULL REFERENCES intelligence.provenance(provenance_id),
  PRIMARY KEY (tenant_id, intelligence_record_id, record_revision, provenance_id)
);

CREATE TABLE intelligence.relationships (
  relationship_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  from_record_id text NOT NULL REFERENCES intelligence.records(intelligence_record_id),
  to_record_id text NOT NULL REFERENCES intelligence.records(intelligence_record_id),
  relationship_type text NOT NULL,
  provenance_id text REFERENCES intelligence.provenance(provenance_id),
  state text NOT NULL CHECK (state IN ('active', 'superseded', 'retracted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, from_record_id, to_record_id, relationship_type)
);

CREATE TABLE continuity.task_capsules (
  task_capsule_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  title text NOT NULL,
  objective text NOT NULL,
  state text NOT NULL CHECK (state IN ('planned', 'active', 'waiting', 'blocked', 'completed', 'cancelled')),
  owner_principal_id text NOT NULL REFERENCES command.principals(principal_id),
  next_action text,
  blockers jsonb NOT NULL DEFAULT '[]'::jsonb,
  intelligence_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE continuity.session_capsules (
  session_capsule_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  actor_instance_id text NOT NULL,
  task_capsule_id text REFERENCES continuity.task_capsules(task_capsule_id),
  state text NOT NULL CHECK (state IN ('active', 'waiting', 'blocked', 'closed', 'stale')),
  working_assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  unresolved_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  resume_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE continuity.candidate_memories (
  candidate_memory_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  kind text NOT NULL CHECK (kind IN ('fact', 'decision', 'constraint', 'relationship', 'summary', 'other')),
  content jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('proposed', 'under_review', 'accepted', 'rejected', 'superseded')),
  provenance_ids jsonb NOT NULL,
  proposed_by_principal_id text NOT NULL REFERENCES command.principals(principal_id),
  proposed_by_actor_instance_id text,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE control.actor_instances (
  actor_instance_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  principal_id text NOT NULL REFERENCES command.principals(principal_id),
  provider_id text NOT NULL REFERENCES command.providers(provider_id),
  surface_id text NOT NULL REFERENCES command.surfaces(surface_id),
  external_session_id text,
  agent_profile_id text,
  model_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL CHECK (state IN ('active', 'inactive', 'revoked')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX control_actor_external_identity_idx ON control.actor_instances (tenant_id, surface_id, external_session_id) WHERE external_session_id IS NOT NULL;

CREATE TABLE control.traffic_sessions (
  traffic_session_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  actor_instance_id text NOT NULL REFERENCES control.actor_instances(actor_instance_id),
  principal_id text NOT NULL REFERENCES command.principals(principal_id),
  task_capsule_id text REFERENCES continuity.task_capsules(task_capsule_id),
  parent_traffic_session_id text REFERENCES control.traffic_sessions(traffic_session_id),
  objective text NOT NULL,
  state text NOT NULL CHECK (state IN ('planned', 'active', 'waiting', 'blocked', 'completed', 'cancelled', 'stale')),
  context_appetite text NOT NULL CHECK (context_appetite IN ('lean', 'standard', 'broad', 'deep', 'custom')),
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz NOT NULL,
  checked_out_at timestamptz,
  next_action text,
  outcome jsonb,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX control_traffic_sessions_active_idx ON control.traffic_sessions (tenant_id, lease_expires_at) WHERE state IN ('planned', 'active', 'waiting', 'blocked');

CREATE TABLE control.resources (
  resource_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  resource_type text NOT NULL,
  authority text NOT NULL,
  canonical_locator text NOT NULL,
  display_name text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, resource_type, authority, canonical_locator)
);

CREATE TABLE control.resource_claims (
  resource_claim_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  traffic_session_id text NOT NULL REFERENCES control.traffic_sessions(traffic_session_id),
  resource_id text NOT NULL REFERENCES control.resources(resource_id),
  intent text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  coordination_level text NOT NULL CHECK (coordination_level IN ('shared', 'caution', 'exclusive')),
  state text NOT NULL CHECK (state IN ('planned', 'active', 'released', 'stale')),
  lease_expires_at timestamptz NOT NULL,
  activated_at timestamptz,
  released_at timestamptz,
  related_artifact_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX control_active_claims_resource_idx ON control.resource_claims (tenant_id, resource_id, lease_expires_at) WHERE state IN ('planned', 'active');

CREATE TABLE continuity.traffic_checkpoints (
  traffic_checkpoint_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  traffic_session_id text NOT NULL REFERENCES control.traffic_sessions(traffic_session_id),
  task_capsule_id text REFERENCES continuity.task_capsules(task_capsule_id),
  kind text NOT NULL CHECK (kind IN ('progress', 'resource_transition', 'blocked', 'waiting', 'handoff', 'verification', 'checkout')),
  summary text NOT NULL,
  next_action text,
  blockers jsonb NOT NULL DEFAULT '[]'::jsonb,
  artifact_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_principal_id text NOT NULL REFERENCES command.principals(principal_id),
  created_by_actor_instance_id text NOT NULL REFERENCES control.actor_instances(actor_instance_id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX continuity_checkpoints_task_idx ON continuity.traffic_checkpoints (tenant_id, task_capsule_id, created_at DESC);

CREATE TABLE continuity.handoffs (
  handoff_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  from_traffic_session_id text NOT NULL REFERENCES control.traffic_sessions(traffic_session_id),
  to_actor_instance_id text REFERENCES control.actor_instances(actor_instance_id),
  task_capsule_id text NOT NULL REFERENCES continuity.task_capsules(task_capsule_id),
  summary text NOT NULL,
  next_action text,
  state text NOT NULL CHECK (state IN ('offered', 'accepted', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE extensions.extensions (
  extension_id text PRIMARY KEY,
  publisher text NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'deprecated', 'revoked')),
  manifest jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE extensions.installations (
  extension_installation_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  extension_id text NOT NULL REFERENCES extensions.extensions(extension_id),
  state text NOT NULL CHECK (state IN ('active', 'revoked', 'uninstalled')),
  installed_by_principal_id text NOT NULL REFERENCES command.principals(principal_id),
  installed_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (tenant_id, extension_id)
);

CREATE TABLE extensions.grants (
  extension_grant_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  extension_installation_id text NOT NULL REFERENCES extensions.installations(extension_installation_id),
  state text NOT NULL CHECK (state IN ('active', 'reduced', 'revoked', 'uninstalled')),
  granted_scopes jsonb NOT NULL,
  granted_by_principal_id text NOT NULL REFERENCES command.principals(principal_id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE audit.events (
  audit_event_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  principal_id text NOT NULL REFERENCES command.principals(principal_id),
  actor_instance_id text,
  traffic_session_id text,
  outcome text NOT NULL CHECK (outcome IN ('success', 'denied', 'error')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_events_tenant_time_idx ON audit.events (tenant_id, occurred_at DESC);

CREATE TABLE runtime.orientation_cache (
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  cache_key text NOT NULL,
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, cache_key)
);

-- Tenant RLS is defense in depth. The persistent repository must execute
-- `SET LOCAL app.sovereign_tenant_id = '<verified tenant id>'` in every
-- transaction. Application authorization remains mandatory.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'command.tenants', 'command.principals', 'command.roles', 'command.principal_role_bindings',
    'command.policies', 'command.providers', 'command.surfaces', 'command.integrations',
    'command.source_authority_configurations', 'intelligence.sources', 'intelligence.records',
    'intelligence.record_revisions', 'intelligence.provenance', 'intelligence.record_provenance',
    'intelligence.relationships', 'continuity.task_capsules', 'continuity.session_capsules',
    'continuity.candidate_memories', 'control.actor_instances', 'control.traffic_sessions',
    'control.resources', 'control.resource_claims', 'continuity.traffic_checkpoints',
    'continuity.handoffs', 'extensions.installations', 'extensions.grants', 'audit.events', 'runtime.orientation_cache'
  ] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (tenant_id = command.current_tenant_id()) WITH CHECK (tenant_id = command.current_tenant_id())', table_name);
  END LOOP;
END $$;

COMMIT;
