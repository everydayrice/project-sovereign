-- Project Sovereign V1 normalized-runtime and source-search foundation.
--
-- This migration is intentionally non-destructive. It extends the existing
-- normalized model so the production Worker can stop treating
-- runtime.tenant_state_snapshots.state as authoritative. The snapshot remains
-- available as rollback/parity evidence until the normalized cutover is
-- production-verified.

BEGIN;

-- Reconcile the normalized canonical-record model with the already-proven
-- service-layer lifecycle without discarding either model's semantics.
ALTER TABLE intelligence.records
  ADD COLUMN IF NOT EXISTS created_by_principal_id text REFERENCES command.principals(principal_id),
  ADD COLUMN IF NOT EXISTS updated_by_principal_id text REFERENCES command.principals(principal_id);

UPDATE intelligence.records
   SET created_by_principal_id = COALESCE(created_by_principal_id, approved_by_principal_id),
       updated_by_principal_id = COALESCE(updated_by_principal_id, approved_by_principal_id)
 WHERE created_by_principal_id IS NULL OR updated_by_principal_id IS NULL;

ALTER TABLE intelligence.record_revisions
  ADD COLUMN IF NOT EXISTS canonical_record_revision_id text,
  ADD COLUMN IF NOT EXISTS canonical_revision bigint,
  ADD COLUMN IF NOT EXISTS change_set_id text,
  ADD COLUMN IF NOT EXISTS before_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS after_snapshot jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS intelligence_record_revision_id_idx
  ON intelligence.record_revisions (canonical_record_revision_id)
  WHERE canonical_record_revision_id IS NOT NULL;

-- Rebuildable derivative search index. Source objects remain in R2 and source
-- metadata remains in intelligence.sources/source_items. Search chunks can be
-- destroyed/rebuilt without losing tenant-owned source objects or canon.
CREATE TABLE IF NOT EXISTS intelligence.source_chunks (
  source_chunk_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES command.tenants(tenant_id),
  source_id text NOT NULL REFERENCES intelligence.sources(source_id),
  source_item_id text NOT NULL REFERENCES intelligence.source_items(source_item_id),
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  heading text,
  chunk_text text NOT NULL,
  content_hash text,
  parser_key text NOT NULL,
  parser_version text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(heading, '') || ' ' || chunk_text)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_item_id, ordinal)
);
CREATE INDEX IF NOT EXISTS intelligence_source_chunks_lookup_idx
  ON intelligence.source_chunks (tenant_id, source_id, source_item_id, ordinal);
CREATE INDEX IF NOT EXISTS intelligence_source_chunks_search_idx
  ON intelligence.source_chunks USING gin (search_vector);

ALTER TABLE intelligence.source_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON intelligence.source_chunks;
CREATE POLICY tenant_isolation ON intelligence.source_chunks
  USING (tenant_id = command.current_tenant_id())
  WITH CHECK (tenant_id = command.current_tenant_id());

-- Backfill the real alpha state that was previously durable only inside the
-- runtime bridge. All inserts are idempotent and retain the existing snapshot
-- untouched for rollback/parity verification.
INSERT INTO intelligence.sources (
  source_id, tenant_id, source_type, canonical_locator, authority_state,
  freshness_class, data_classification, last_verified_at, metadata, revision,
  created_at, updated_at, connector_key, source_category, display_name,
  connection_state, processing_state, currentness, health_state, item_count,
  inventoried_item_count, indexed_item_count, analyzed_item_count,
  studied_item_count, canonicalized_item_count, failed_item_count,
  excluded_item_count, last_sweep_at, failure_reason, created_by_principal_id
)
SELECT
  src->>'source_id', snap.tenant_id, src->>'source_type', src->>'canonical_locator',
  COALESCE(src->>'authority_state','supporting'), COALESCE(src->>'freshness_class','unknown'),
  COALESCE(src->>'data_classification','internal'), NULLIF(src->>'last_verified_at','')::timestamptz,
  COALESCE(src->'metadata','{}'::jsonb), COALESCE((src->>'revision')::integer,1),
  COALESCE(NULLIF(src->>'created_at','')::timestamptz, now()), COALESCE(NULLIF(src->>'updated_at','')::timestamptz, now()),
  NULLIF(src->>'connector_key',''), COALESCE(src->>'source_category','imported_snapshot'),
  COALESCE(src->>'display_name',src->>'canonical_locator'), COALESCE(src->>'connection_state','connected'),
  COALESCE(src->>'processing_state','connected'), COALESCE(src->>'currentness','unknown'),
  COALESCE(src->>'health_state','initializing'), COALESCE((src->>'item_count')::integer,0),
  COALESCE((src->>'inventoried_item_count')::integer,0), COALESCE((src->>'indexed_item_count')::integer,0),
  COALESCE((src->>'analyzed_item_count')::integer,0), COALESCE((src->>'studied_item_count')::integer,0),
  COALESCE((src->>'canonicalized_item_count')::integer,0), COALESCE((src->>'failed_item_count')::integer,0),
  COALESCE((src->>'excluded_item_count')::integer,0), NULLIF(src->>'last_sweep_at','')::timestamptz,
  NULLIF(src->>'failure_reason',''), NULLIF(src->>'created_by_principal_id','')
FROM runtime.tenant_state_snapshots snap
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(snap.state->'sources','[]'::jsonb)) src
ON CONFLICT (source_id) DO NOTHING;

INSERT INTO intelligence.source_items (
  source_item_id, tenant_id, source_id, display_name, canonical_locator,
  mime_type, size_bytes, content_hash, item_state, storage_state,
  r2_object_key, object_version, privacy_state, metadata, discovered_at, updated_at
)
SELECT
  item->>'source_item_id', snap.tenant_id, item->>'source_id', item->>'display_name', item->>'canonical_locator',
  NULLIF(item->>'mime_type',''), NULLIF(item->>'size_bytes','')::bigint, NULLIF(item->>'content_hash',''),
  COALESCE(item->>'item_state','inventoried'), COALESCE(item->>'storage_state','external_reference'),
  NULLIF(item->>'r2_object_key',''), NULLIF(item->>'object_version',''), COALESCE(item->>'privacy_state','included'),
  COALESCE(item->'metadata','{}'::jsonb), COALESCE(NULLIF(item->>'discovered_at','')::timestamptz,now()),
  COALESCE(NULLIF(item->>'updated_at','')::timestamptz,now())
FROM runtime.tenant_state_snapshots snap
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(snap.state->'sourceItems','[]'::jsonb)) item
ON CONFLICT (source_item_id) DO NOTHING;

INSERT INTO intelligence.candidate_intelligence (
  candidate_intelligence_id, tenant_id, record_type, payload, scope, source_ids,
  provenance, confidence, reason, state, proposed_by_principal_id, created_at, updated_at
)
SELECT
  candidate->>'candidate_intelligence_id', snap.tenant_id, candidate->>'record_type', candidate->'payload',
  COALESCE(candidate->'scope','{}'::jsonb), COALESCE(candidate->'source_ids','[]'::jsonb),
  COALESCE(candidate->'provenance','[]'::jsonb), COALESCE(candidate->>'confidence','medium'),
  COALESCE(candidate->>'reason','Candidate intelligence proposed.'), COALESCE(candidate->>'state','proposed'),
  candidate->>'proposed_by_principal_id', COALESCE(NULLIF(candidate->>'created_at','')::timestamptz,now()),
  COALESCE(NULLIF(candidate->>'updated_at','')::timestamptz,now())
FROM runtime.tenant_state_snapshots snap
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(snap.state->'candidateIntelligence','[]'::jsonb)) candidate
ON CONFLICT (candidate_intelligence_id) DO NOTHING;

INSERT INTO intelligence.initialization_runs (
  initialization_run_id, tenant_id, scope, mode, state, requested_by_principal_id,
  source_ids, candidate_intelligence_ids, canonical_change_set_id, coverage,
  started_at, completed_at, created_at, updated_at
)
SELECT
  run->>'initialization_run_id', snap.tenant_id, COALESCE(run->'scope','{}'::jsonb),
  COALESCE(run->>'mode','initialize'), COALESCE(run->>'state','completed'), run->>'requested_by_principal_id',
  COALESCE(run->'source_ids','[]'::jsonb), COALESCE(run->'candidate_intelligence_ids','[]'::jsonb),
  NULLIF(run->>'canonical_change_set_id',''), COALESCE(run->'coverage','{}'::jsonb),
  COALESCE(NULLIF(run->>'started_at','')::timestamptz,now()), NULLIF(run->>'completed_at','')::timestamptz,
  COALESCE(NULLIF(run->>'created_at','')::timestamptz,now()), COALESCE(NULLIF(run->>'updated_at','')::timestamptz,now())
FROM runtime.tenant_state_snapshots snap
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(snap.state->'initializationRuns','[]'::jsonb)) run
ON CONFLICT (initialization_run_id) DO NOTHING;

INSERT INTO intelligence.initialization_source_runs (
  initialization_source_run_id, initialization_run_id, tenant_id, source_id,
  state, item_count, inventoried_item_count, analyzed_item_count, candidate_count,
  excluded_count, failure_reason, updated_at
)
SELECT
  sr->>'initialization_source_run_id', sr->>'initialization_run_id', snap.tenant_id, sr->>'source_id',
  COALESCE(sr->>'state','complete'), COALESCE((sr->>'item_count')::integer,0),
  COALESCE((sr->>'inventoried_item_count')::integer,0), COALESCE((sr->>'analyzed_item_count')::integer,0),
  COALESCE((sr->>'candidate_count')::integer,0), COALESCE((sr->>'excluded_count')::integer,0),
  NULLIF(sr->>'failure_reason',''), COALESCE(NULLIF(sr->>'updated_at','')::timestamptz,now())
FROM runtime.tenant_state_snapshots snap
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(snap.state->'initializationSourceRuns','[]'::jsonb)) sr
ON CONFLICT (initialization_source_run_id) DO NOTHING;

-- Every active tenant gets a normalized canonical-state row even if no canon
-- has been created yet.
INSERT INTO intelligence.canonical_states (
  canonical_state_id, tenant_id, current_revision, last_change_set_id, created_at, updated_at
)
SELECT
  'cst_' || md5(t.tenant_id), t.tenant_id, 0, NULL, now(), now()
FROM command.tenants t
WHERE NOT EXISTS (SELECT 1 FROM intelligence.canonical_states cs WHERE cs.tenant_id=t.tenant_id)
ON CONFLICT (tenant_id) DO NOTHING;

-- Seed source-search evidence from already-extracted alpha candidates so the
-- pre-existing synthetic test source becomes searchable immediately after the
-- cutover without modifying the R2 object.
INSERT INTO intelligence.source_chunks (
  source_chunk_id, tenant_id, source_id, source_item_id, ordinal, heading,
  chunk_text, parser_key, parser_version, metadata
)
SELECT
  'sch_' || md5(c.candidate_intelligence_id), c.tenant_id,
  (c.source_ids->>0),
  (c.provenance->0->>'source_item_id'),
  row_number() OVER (PARTITION BY c.tenant_id, (c.provenance->0->>'source_item_id') ORDER BY c.created_at, c.candidate_intelligence_id) - 1,
  c.payload->>'source_section', c.payload->>'statement', 'structured_text_v0_2', '0.2',
  jsonb_build_object('backfilled_from_candidate', c.candidate_intelligence_id, 'synthetic_test_evidence', true)
FROM intelligence.candidate_intelligence c
WHERE jsonb_array_length(c.source_ids) > 0
  AND c.provenance->0->>'source_item_id' IS NOT NULL
  AND c.payload->>'statement' IS NOT NULL
ON CONFLICT (source_chunk_id) DO NOTHING;

COMMIT;
