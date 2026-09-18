import { normalizeSearchFilters } from './search-filters.mjs';

// One predicate set is shared by full-text search and its literal substring fallback.
export function buildSearchQuery({ tenantId, query, sourceId, limit, filters = {}, fallback = false }) {
  const f = normalizeSearchFilters(filters);
  const params = [tenantId, query, sourceId ?? null, limit, f.kind ?? null, f.record_type ?? null,
    f.authority_level ?? null, f.confidence ?? null, f.data_classification ?? null,
    JSON.stringify(f.scope ?? {}), f.updated_after ?? null, f.updated_before ?? null];
  const sourceWhere = `sc.tenant_id=$1 AND si.privacy_state='included'
    AND COALESCE(s.metadata->>'archived','false') <> 'true' AND COALESCE(s.metadata->>'removed','false') <> 'true'
    AND ($3::text IS NULL OR sc.source_id=$3) AND ($5::text IS NULL OR $5='source')
    AND $6::text IS NULL AND $7::text IS NULL AND $8::text IS NULL AND $10::jsonb='{}'::jsonb
    AND ($9::text IS NULL OR s.data_classification=$9)
    AND ($11::timestamptz IS NULL OR sc.updated_at >= $11) AND ($12::timestamptz IS NULL OR sc.updated_at <= $12)`;
  const canonicalWhere = `r.tenant_id=$1 AND r.state='active' AND rr.tenant_id=r.tenant_id
    AND ($3::text IS NULL OR r.source_ids ? $3) AND ($5::text IS NULL OR $5='canonical')
    AND ($6::text IS NULL OR r.record_type=$6) AND ($7::text IS NULL OR r.authority_level=$7)
    AND ($8::text IS NULL OR r.confidence=$8) AND ($9::text IS NULL OR r.data_classification=$9)
    AND r.scope @> $10::jsonb
    AND ($11::timestamptz IS NULL OR r.updated_at >= $11) AND ($12::timestamptz IS NULL OR r.updated_at <= $12)`;
  const canonicalText = `COALESCE(rr.after_snapshot,rr.content)::text`;
  const match = text => fallback ? `strpos(lower(${text}),lower($2)) > 0` : `to_tsvector('simple',${text}) @@ q.value`;
  const rank = vector => fallback ? '0::real' : `ts_rank_cd(${vector},q.value)`;
  return { params, text: `WITH q AS (SELECT websearch_to_tsquery('simple',$2) AS value),
    source_hits AS (
      SELECT 'source'::text AS result_kind, sc.source_chunk_id AS result_id, sc.source_id, sc.source_item_id,
        s.display_name AS source_name, sc.heading, sc.chunk_text AS excerpt, NULL::text AS record_type,
        ${rank('sc.search_vector')} AS rank,
        sc.metadata || jsonb_build_object('data_classification',s.data_classification,'updated_at',sc.updated_at) AS metadata, sc.ordinal
      FROM intelligence.source_chunks sc
      JOIN intelligence.sources s ON s.source_id=sc.source_id AND s.tenant_id=sc.tenant_id
      JOIN intelligence.source_items si ON si.source_item_id=sc.source_item_id AND si.tenant_id=sc.tenant_id AND si.source_id=sc.source_id
      CROSS JOIN q WHERE ${sourceWhere}
        AND (${fallback ? ["sc.chunk_text", "COALESCE(sc.heading,'')", 's.display_name'].map(match).join(' OR ') : 'sc.search_vector @@ q.value'})
    ), canonical_hits AS (
      SELECT 'canonical'::text AS result_kind, r.intelligence_record_id AS result_id,
        NULL::text AS source_id, NULL::text AS source_item_id, 'Canonical Intelligence'::text AS source_name, NULL::text AS heading,
        COALESCE(rr.after_snapshot->'payload',rr.content->'payload',rr.content)::text AS excerpt, r.record_type,
        ${rank(`to_tsvector('simple',${canonicalText})`)} AS rank,
        jsonb_build_object('canonical_revision',r.current_canonical_revision,'authority_level',r.authority_level,
          'confidence',r.confidence,'scope',r.scope,'data_classification',r.data_classification,'updated_at',r.updated_at) AS metadata, 0 AS ordinal
      FROM intelligence.records r
      JOIN intelligence.record_revisions rr ON rr.intelligence_record_id=r.intelligence_record_id AND rr.revision=r.current_revision
      CROSS JOIN q WHERE ${canonicalWhere} AND ${match(canonicalText)}
    ) SELECT * FROM (SELECT * FROM source_hits UNION ALL SELECT * FROM canonical_hits) hits
      ORDER BY rank DESC, result_kind, result_id, ordinal LIMIT $4` };
}
