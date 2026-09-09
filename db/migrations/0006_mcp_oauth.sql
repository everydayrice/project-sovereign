-- Additive OAuth storage for remote MCP clients. No existing records are changed.
BEGIN;
CREATE TABLE command.oauth_clients (
  client_id text PRIMARY KEY,
  client_name text NOT NULL,
  redirect_uris jsonb NOT NULL CHECK (jsonb_typeof(redirect_uris)='array'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE command.oauth_grants (
  grant_id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES command.oauth_clients(client_id),
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  service_credential_id text NOT NULL UNIQUE REFERENCES command.service_credentials(service_credential_id),
  redirect_uri text NOT NULL,
  resource text NOT NULL,
  code_challenge text NOT NULL,
  code_hash text NOT NULL UNIQUE,
  code_expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  refresh_hash text UNIQUE,
  used_refresh_hashes jsonb NOT NULL DEFAULT '[]'::jsonb,
  refresh_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE command.oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE command.oauth_grants ENABLE ROW LEVEL SECURITY;
-- No public/Data API policies: only the existing trusted server connection accesses these tables.
COMMIT;
