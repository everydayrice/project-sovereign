-- Project Sovereign V0.2 production runtime activation.
--
-- The V0.2 services still use a synchronous in-process repository contract.
-- Until the normalized Neon repositories fully replace that contract, this
-- migration provides a durable, versioned tenant-state bridge so Worker
-- isolates never become the source of truth. It is intentionally isolated in
-- runtime.* and can be retired without rewriting Canonical Intelligence.

BEGIN;

CREATE TABLE runtime.auth_bindings (
  auth_subject_reference text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  principal_id text NOT NULL REFERENCES command.principals(principal_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, principal_id)
);

CREATE INDEX runtime_auth_bindings_tenant_idx
  ON runtime.auth_bindings (tenant_id, principal_id);

CREATE TABLE runtime.tenant_state_snapshots (
  tenant_id text PRIMARY KEY REFERENCES command.tenants(tenant_id),
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  state_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE runtime.tenant_state_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON runtime.tenant_state_snapshots
  USING (tenant_id = command.current_tenant_id())
  WITH CHECK (tenant_id = command.current_tenant_id());

COMMIT;
