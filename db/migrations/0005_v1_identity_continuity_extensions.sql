-- Project Sovereign V1 service identity, Continuity and extension-event schema.
-- Apply after 0004_v1_normalized_runtime_search.sql.
-- Non-destructive: only additive tables/indexes/policies plus owner-role backfill.

BEGIN;

-- COMMAND already had roles/bindings in V0.1, but the first alpha tenant was
-- bootstrapped before those controls were used by the browser runtime. Establish
-- one explicit Owner role per tenant and bind the earliest active human principal
-- so privileged V1 actions do not rely on "any signed-in human" semantics.
INSERT INTO command.roles (role_id,tenant_id,name,permission_set,created_at,updated_at)
SELECT 'rol_owner_' || md5(t.tenant_id), t.tenant_id, 'Owner', '["*"]'::jsonb, now(), now()
FROM command.tenants t
ON CONFLICT (tenant_id,name) DO NOTHING;

INSERT INTO command.principal_role_bindings (tenant_id,principal_id,role_id,granted_by_principal_id,created_at)
SELECT tenant_id,principal_id,role_id,principal_id,now()
FROM (
  SELECT t.tenant_id,
         (SELECT p.principal_id FROM command.principals p WHERE p.tenant_id=t.tenant_id AND p.kind='human' AND p.state='active' ORDER BY p.created_at,p.principal_id LIMIT 1) AS principal_id,
         r.role_id
  FROM command.tenants t
  JOIN command.roles r ON r.tenant_id=t.tenant_id AND r.name='Owner'
) seed
WHERE principal_id IS NOT NULL
ON CONFLICT (tenant_id,principal_id,role_id) DO NOTHING;

CREATE TABLE command.service_credentials (
  service_credential_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  principal_id text NOT NULL REFERENCES command.principals(principal_id),
  display_name text NOT NULL,
  token_prefix text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  state text NOT NULL CHECK (state IN ('active','revoked','expired')),
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by_principal_id text NOT NULL REFERENCES command.principals(principal_id),
  revoked_by_principal_id text REFERENCES command.principals(principal_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (jsonb_typeof(scopes) = 'array')
);
CREATE INDEX command_service_credentials_lookup_idx
  ON command.service_credentials (token_prefix, state);
CREATE INDEX command_service_credentials_tenant_idx
  ON command.service_credentials (tenant_id, principal_id, state, created_at DESC);

CREATE TABLE continuity.ideas (
  idea_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  owner_principal_id text NOT NULL REFERENCES command.principals(principal_id),
  title text NOT NULL,
  description text,
  state text NOT NULL CHECK (state IN ('captured','developing','parked','promoted','archived')),
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  intelligence_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  task_capsule_id text REFERENCES continuity.task_capsules(task_capsule_id),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(tags) = 'array'),
  CHECK (jsonb_typeof(source_references) = 'array'),
  CHECK (jsonb_typeof(intelligence_references) = 'array')
);
CREATE INDEX continuity_ideas_tenant_state_idx
  ON continuity.ideas (tenant_id, state, updated_at DESC);

CREATE TABLE extensions.event_subscriptions (
  extension_event_subscription_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  extension_installation_id text NOT NULL REFERENCES extensions.installations(extension_installation_id),
  event_type text NOT NULL,
  delivery_url text,
  state text NOT NULL CHECK (state IN ('active','paused','revoked')),
  created_by_principal_id text NOT NULL REFERENCES command.principals(principal_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, extension_installation_id, event_type)
);
CREATE INDEX extensions_event_subscriptions_active_idx
  ON extensions.event_subscriptions (tenant_id, event_type, state);

CREATE TABLE extensions.event_outbox (
  extension_event_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  extension_installation_id text NOT NULL REFERENCES extensions.installations(extension_installation_id),
  event_type text NOT NULL,
  subject_type text,
  subject_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL CHECK (state IN ('pending','delivered','failed','discarded')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX extensions_event_outbox_delivery_idx
  ON extensions.event_outbox (state, available_at, created_at);
CREATE INDEX extensions_event_outbox_tenant_idx
  ON extensions.event_outbox (tenant_id, extension_installation_id, created_at DESC);

DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'command.service_credentials',
    'continuity.ideas',
    'extensions.event_subscriptions',
    'extensions.event_outbox'
  ] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %s USING (tenant_id = command.current_tenant_id()) WITH CHECK (tenant_id = command.current_tenant_id())',
      target
    );
  END LOOP;
END $$;

COMMIT;
