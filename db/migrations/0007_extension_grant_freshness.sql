-- Preserve grant freshness so rollback parity can distinguish a real legacy
-- write from metadata that the normalized table previously could not store.
DO $$
BEGIN
  ALTER TABLE extensions.grants ADD COLUMN IF NOT EXISTS updated_at timestamptz;
  ALTER TABLE extensions.grants ADD COLUMN IF NOT EXISTS revision integer;

  UPDATE extensions.grants
  SET updated_at=COALESCE(updated_at,revoked_at,granted_at), revision=COALESCE(revision,1)
  WHERE updated_at IS NULL OR revision IS NULL;

  -- Recover metadata only when every persisted permission field agrees.
  -- Conflicting or missing grants must still fail the cutover guard.
  UPDATE extensions.grants g
  SET updated_at=GREATEST(g.updated_at,(e->>'updated_at')::timestamptz),
      revision=GREATEST(g.revision,COALESCE((e->>'revision')::integer,1))
  FROM runtime.tenant_state_snapshots s,
       LATERAL jsonb_array_elements(COALESCE(s.state->'extensionGrants','[]'::jsonb)) e
  WHERE s.tenant_id=g.tenant_id
    AND e->>'extension_grant_id'=g.extension_grant_id
    AND e->>'tenant_id'=g.tenant_id
    AND e->>'extension_installation_id'=g.extension_installation_id
    AND e->>'state'=g.state
    AND e->'granted_scopes'=g.granted_scopes
    AND COALESCE(e->'granted_by'->>'principal_id',e->>'granted_by_principal_id')=g.granted_by_principal_id
    AND (e->>'granted_at')::timestamptz=g.granted_at
    AND (e->>'revoked_at')::timestamptz IS NOT DISTINCT FROM g.revoked_at;

  ALTER TABLE extensions.grants ALTER COLUMN updated_at SET DEFAULT now();
  ALTER TABLE extensions.grants ALTER COLUMN updated_at SET NOT NULL;
  ALTER TABLE extensions.grants ALTER COLUMN revision SET DEFAULT 1;
  ALTER TABLE extensions.grants ALTER COLUMN revision SET NOT NULL;
END $$;
