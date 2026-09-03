-- Project Sovereign product-alpha state. Apply only after 0001_foundation.sql
-- against the dedicated PROJECT SOVEREIGN Neon project. This migration adds
-- lifecycle metadata and append-only canonical history; it does not replace
-- or erase existing canonical records.

BEGIN;

CREATE TABLE command.workspaces (
  workspace_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  parent_workspace_id text REFERENCES command.workspaces(workspace_id),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  display_name text NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'suspended', 'archived')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_principal_id text REFERENCES command.principals(principal_id),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

ALTER TABLE command.policies DROP CONSTRAINT IF EXISTS policies_policy_type_check;
ALTER TABLE command.policies ADD CONSTRAINT command_policies_policy_type_check CHECK (policy_type IN ('authorization', 'traffic', 'privacy', 'retention', 'approval', 'resource', 'extension', 'authority', 'canonical_promotion', 'trust_recovery'));

ALTER TABLE intelligence.sources
  ADD COLUMN connector_key text,
  ADD COLUMN source_category text NOT NULL DEFAULT 'imported_snapshot' CHECK (source_category IN ('external_authoritative', 'sovereign_managed', 'live_system', 'imported_snapshot', 'reference_only')),
  ADD COLUMN display_name text,
  ADD COLUMN connection_state text NOT NULL DEFAULT 'not_connected' CHECK (connection_state IN ('not_connected', 'authorization_required', 'connected', 'disconnected', 'failed')),
  ADD COLUMN processing_state text NOT NULL DEFAULT 'connected' CHECK (processing_state IN ('connected', 'inventoried', 'indexed', 'analyzed', 'studied', 'canonicalized', 'partial', 'failed')),
  ADD COLUMN currentness text NOT NULL DEFAULT 'unknown' CHECK (currentness IN ('current', 'stale', 'failed', 'partial', 'unknown')),
  ADD COLUMN health_state text NOT NULL DEFAULT 'initializing' CHECK (health_state IN ('healthy', 'initializing', 'attention_required', 'partial', 'failed')),
  ADD COLUMN item_count integer NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  ADD COLUMN inventoried_item_count integer NOT NULL DEFAULT 0 CHECK (inventoried_item_count >= 0),
  ADD COLUMN indexed_item_count integer NOT NULL DEFAULT 0 CHECK (indexed_item_count >= 0),
  ADD COLUMN analyzed_item_count integer NOT NULL DEFAULT 0 CHECK (analyzed_item_count >= 0),
  ADD COLUMN studied_item_count integer NOT NULL DEFAULT 0 CHECK (studied_item_count >= 0),
  ADD COLUMN canonicalized_item_count integer NOT NULL DEFAULT 0 CHECK (canonicalized_item_count >= 0),
  ADD COLUMN failed_item_count integer NOT NULL DEFAULT 0 CHECK (failed_item_count >= 0),
  ADD COLUMN excluded_item_count integer NOT NULL DEFAULT 0 CHECK (excluded_item_count >= 0),
  ADD COLUMN last_sweep_at timestamptz,
  ADD COLUMN failure_reason text,
  ADD COLUMN created_by_principal_id text REFERENCES command.principals(principal_id);
UPDATE intelligence.sources SET display_name = canonical_locator WHERE display_name IS NULL;
ALTER TABLE intelligence.sources ALTER COLUMN display_name SET NOT NULL;
CREATE INDEX intelligence_sources_health_idx ON intelligence.sources (tenant_id, health_state, currentness, updated_at DESC);

CREATE TABLE intelligence.source_items (
  source_item_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  source_id text NOT NULL REFERENCES intelligence.sources(source_id),
  display_name text NOT NULL,
  canonical_locator text NOT NULL,
  mime_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  content_hash text,
  item_state text NOT NULL CHECK (item_state IN ('inventoried', 'indexed', 'analyzed', 'excluded', 'failed')),
  storage_state text NOT NULL CHECK (storage_state IN ('external_reference', 'awaiting_object_store', 'stored', 'deleted', 'unavailable')),
  r2_object_key text,
  object_version text,
  privacy_state text NOT NULL DEFAULT 'included' CHECK (privacy_state IN ('included', 'excluded', 'restricted', 'deleted')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_id, canonical_locator)
);
CREATE INDEX intelligence_source_items_inventory_idx ON intelligence.source_items (tenant_id, source_id, item_state, updated_at DESC);

ALTER TABLE intelligence.records
  ADD COLUMN scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN provenance jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN confidence text NOT NULL DEFAULT 'medium' CHECK (confidence IN ('low', 'medium', 'high')),
  ADD COLUMN data_classification text NOT NULL DEFAULT 'internal' CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted')),
  ADD COLUMN current_canonical_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN last_change_set_id text,
  ADD COLUMN tombstone_reason text;
ALTER TABLE intelligence.records DROP CONSTRAINT IF EXISTS records_state_check;
ALTER TABLE intelligence.records ADD CONSTRAINT intelligence_records_state_check CHECK (state IN ('active', 'superseded', 'archived', 'tombstoned', 'retracted'));

CREATE TABLE intelligence.canonical_states (
  canonical_state_id text PRIMARY KEY,
  tenant_id text NOT NULL UNIQUE REFERENCES command.tenants(tenant_id),
  current_revision bigint NOT NULL DEFAULT 0 CHECK (current_revision >= 0),
  last_change_set_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE intelligence.candidate_intelligence (
  candidate_intelligence_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  record_type text NOT NULL CHECK (record_type IN ('fact', 'decision', 'policy', 'entity', 'project', 'domain', 'architecture', 'constraint', 'relationship', 'summary')),
  payload jsonb NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence text NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  reason text NOT NULL,
  state text NOT NULL CHECK (state IN ('proposed', 'under_review', 'accepted', 'rejected', 'superseded')),
  proposed_by_principal_id text NOT NULL REFERENCES command.principals(principal_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intelligence_candidate_intelligence_review_idx ON intelligence.candidate_intelligence (tenant_id, state, updated_at DESC);

CREATE TABLE intelligence.canonical_change_sets (
  canonical_change_set_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  title text NOT NULL,
  reason text NOT NULL,
  state text NOT NULL CHECK (state IN ('pending_approval', 'ready', 'applied', 'rejected', 'superseded')),
  requires_approval boolean NOT NULL DEFAULT true,
  initiator text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence text NOT NULL DEFAULT 'medium' CHECK (confidence IN ('low', 'medium', 'high')),
  source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance jsonb NOT NULL DEFAULT '[]'::jsonb,
  base_canonical_revision bigint NOT NULL CHECK (base_canonical_revision >= 0),
  resulting_canonical_revision bigint,
  affected_record_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposed_by_principal_id text NOT NULL REFERENCES command.principals(principal_id),
  approved_by_principal_id text REFERENCES command.principals(principal_id),
  rejected_by_principal_id text REFERENCES command.principals(principal_id),
  rejection_reason text,
  revert_of_change_set_id text REFERENCES intelligence.canonical_change_sets(canonical_change_set_id),
  applied_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state = 'applied') = (resulting_canonical_revision IS NOT NULL))
);
CREATE INDEX intelligence_change_sets_tenant_state_idx ON intelligence.canonical_change_sets (tenant_id, state, created_at DESC);
CREATE INDEX intelligence_change_sets_revision_idx ON intelligence.canonical_change_sets (tenant_id, resulting_canonical_revision DESC) WHERE state = 'applied';

CREATE TABLE intelligence.canonical_change_operations (
  canonical_change_operation_id text PRIMARY KEY,
  canonical_change_set_id text NOT NULL REFERENCES intelligence.canonical_change_sets(canonical_change_set_id),
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  ordinal integer NOT NULL CHECK (ordinal > 0),
  operation_type text NOT NULL CHECK (operation_type IN ('add', 'update', 'supersede', 'tombstone', 'restore')),
  target_record_id text REFERENCES intelligence.records(intelligence_record_id),
  created_record_id text,
  patch jsonb,
  replacement jsonb,
  reason text,
  before_snapshot jsonb,
  after_snapshot jsonb,
  affected_record_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canonical_change_set_id, ordinal)
);

CREATE TABLE intelligence.canonical_checkpoints (
  canonical_checkpoint_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  canonical_revision bigint NOT NULL CHECK (canonical_revision >= 0),
  title text NOT NULL,
  reason text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_set_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  change_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  automatic boolean NOT NULL DEFAULT false,
  created_by_principal_id text NOT NULL REFERENCES command.principals(principal_id),
  revision_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, canonical_revision, revision_hash)
);
CREATE INDEX intelligence_checkpoints_tenant_revision_idx ON intelligence.canonical_checkpoints (tenant_id, canonical_revision DESC);

CREATE TABLE intelligence.canonical_access_events (
  canonical_access_event_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  record_id text REFERENCES intelligence.records(intelligence_record_id),
  canonical_revision bigint,
  principal_id text REFERENCES command.principals(principal_id),
  actor_instance_id text,
  purpose text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE intelligence.initialization_runs (
  initialization_run_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  mode text NOT NULL CHECK (mode IN ('initialize', 'study', 'sweep')),
  state text NOT NULL CHECK (state IN ('running', 'completed', 'partial', 'failed', 'cancelled')),
  requested_by_principal_id text NOT NULL REFERENCES command.principals(principal_id),
  source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  candidate_intelligence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  canonical_change_set_id text REFERENCES intelligence.canonical_change_sets(canonical_change_set_id),
  coverage jsonb NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intelligence_initialization_runs_tenant_idx ON intelligence.initialization_runs (tenant_id, state, started_at DESC);

CREATE TABLE intelligence.initialization_source_runs (
  initialization_source_run_id text PRIMARY KEY,
  initialization_run_id text NOT NULL REFERENCES intelligence.initialization_runs(initialization_run_id),
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  source_id text NOT NULL REFERENCES intelligence.sources(source_id),
  state text NOT NULL CHECK (state IN ('pending', 'complete', 'partial', 'failed', 'blocked')),
  item_count integer NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  inventoried_item_count integer NOT NULL DEFAULT 0 CHECK (inventoried_item_count >= 0),
  analyzed_item_count integer NOT NULL DEFAULT 0 CHECK (analyzed_item_count >= 0),
  candidate_count integer NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  excluded_count integer NOT NULL DEFAULT 0 CHECK (excluded_count >= 0),
  failure_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (initialization_run_id, source_id)
);

CREATE TABLE audit.recovery_sessions (
  recovery_session_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'completed', 'cancelled')),
  canonical_snapshot_revision bigint NOT NULL,
  canonical_snapshot_checkpoint_id text REFERENCES intelligence.canonical_checkpoints(canonical_checkpoint_id),
  risky_canonical_automation_paused boolean NOT NULL DEFAULT true,
  findings jsonb NOT NULL DEFAULT '{}'::jsonb,
  completion_summary text,
  started_by_principal_id text NOT NULL REFERENCES command.principals(principal_id),
  completed_by_principal_id text REFERENCES command.principals(principal_id),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit.failure_events (
  failure_event_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  kind text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  summary text NOT NULL,
  expected_behavior text,
  actual_behavior text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  canonical_revision bigint,
  status text NOT NULL CHECK (status IN ('open', 'triaged', 'resolved', 'dismissed')),
  reported_by_principal_id text REFERENCES command.principals(principal_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit.improvement_candidates (
  improvement_candidate_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  failure_event_id text REFERENCES audit.failure_events(failure_event_id),
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text NOT NULL,
  target text NOT NULL,
  state text NOT NULL CHECK (state IN ('proposed', 'testing', 'authorized', 'applied', 'rejected', 'superseded')),
  proposed_by_principal_id text REFERENCES command.principals(principal_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'command.workspaces', 'intelligence.source_items', 'intelligence.canonical_states',
    'intelligence.candidate_intelligence', 'intelligence.canonical_change_sets',
    'intelligence.canonical_change_operations', 'intelligence.canonical_checkpoints',
    'intelligence.canonical_access_events', 'intelligence.initialization_runs',
    'intelligence.initialization_source_runs', 'audit.recovery_sessions', 'audit.failure_events',
    'audit.improvement_candidates'
  ] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (tenant_id = command.current_tenant_id()) WITH CHECK (tenant_id = command.current_tenant_id())', table_name);
  END LOOP;
END $$;

COMMIT;
