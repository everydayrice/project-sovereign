import { requireCondition } from '../platform/errors.mjs';

export const SEARCH_FILTER_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false, properties: {
    kind: { enum: ['source', 'canonical'] },
    record_type: { enum: ['fact','decision','policy','entity','project','domain','architecture','constraint','relationship','summary'] },
    authority_level: { enum: ['verified','approved','provisional'] },
    confidence: { enum: ['low','medium','high'] },
    data_classification: { enum: ['public','internal','confidential','restricted'] },
    scope: { type: 'object', maxProperties: 20, additionalProperties: { type: ['string','number','boolean'] } },
    updated_after: { type: 'string', format: 'date-time' },
    updated_before: { type: 'string', format: 'date-time' }
  }
});

export function normalizeSearchFilters(filters = {}) {
  const valid = (condition, message) => requireCondition(condition, 'invalid_search_filter', message);
  valid(filters !== null && typeof filters === 'object' && !Array.isArray(filters), 'Search filters must be an object.');
  const result = {};
  for (const [key, value] of Object.entries(filters)) {
    const schema = Object.hasOwn(SEARCH_FILTER_SCHEMA.properties, key) ? SEARCH_FILTER_SCHEMA.properties[key] : undefined;
    valid(Boolean(schema), `Unsupported search filter: ${key}.`);
    if (schema.enum) valid(schema.enum.includes(value), `Invalid ${key} filter.`);
    else if (key === 'scope') {
      valid(value !== null && typeof value === 'object' && !Array.isArray(value), 'Scope must be an object.');
      valid(Object.keys(value).length <= 20, 'Scope supports at most 20 fields.');
      for (const [field, item] of Object.entries(value)) {
        valid(field.length > 0 && field.length <= 100 && ['string','number','boolean'].includes(typeof item), 'Scope fields must contain scalar values.');
        valid(typeof item !== 'number' || Number.isFinite(item), 'Scope numbers must be finite.');
        valid(typeof item !== 'string' || item.length <= 500, 'Scope values must be at most 500 characters.');
      }
    } else {
      valid(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)), `${key} must be an ISO timestamp with timezone.`);
      const calendar = new Date(value.slice(0, 10) + 'T00:00:00Z');
      valid(calendar.toISOString().slice(0, 10) === value.slice(0, 10), `${key} must contain a valid calendar date.`);
    }
    result[key] = value;
  }
  valid(!result.updated_after || !result.updated_before || Date.parse(result.updated_after) <= Date.parse(result.updated_before), 'Updated-after must not exceed updated-before.');
  const canonicalOnly = result.record_type || result.authority_level || result.confidence || Object.keys(result.scope ?? {}).length;
  valid(!(result.kind === 'source' && canonicalOnly), 'Record type, authority, confidence and scope apply to canonical evidence only.');
  if (canonicalOnly) result.kind = 'canonical';
  return result;
}

export function searchArgsFromUrl(url) {
  const filters = {};
  for (const key of Object.keys(SEARCH_FILTER_SCHEMA.properties)) {
    if (!url.searchParams.has(key)) continue;
    const value = url.searchParams.get(key);
    if (key === 'scope') {
      try { filters.scope = JSON.parse(value); }
      catch { requireCondition(false, 'invalid_search_filter', 'Scope must be valid JSON.'); }
    } else filters[key] = value;
  }
  return { query: url.searchParams.get('q') ?? '', source_id: url.searchParams.get('source_id') || undefined,
    limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 12, filters };
}

export function requireSearchLimit(limit) {
  requireCondition(Number.isInteger(limit) && limit >= 1 && limit <= 50, 'invalid_search_limit', 'Search limit must be an integer from 1 to 50.');
}
