# Retrieval and file ingestion

## Search and Ask

All filters run in SQL before ranking and limiting results. Full-text search and
literal substring fallback use the same tenant, privacy and filter predicates.
Sources that are archived/removed or whose items are not included are excluded.
Only active canonical records are returned. Filters narrow existing authorization;
they do not grant access. Canonical records remain separate approved evidence even
when an original supporting source has since been archived.

`GET /v1/search` (owner Console) and `GET /api/v1/search` (scoped service identity)
accept `q`, `source_id`, `limit` (integer 1–50) and these query parameters:

| Filter | Values / meaning |
| --- | --- |
| `kind` | `source` or `canonical`; omitted searches both |
| `record_type` | fact, decision, policy, entity, project, domain, architecture, constraint, relationship, summary |
| `authority_level` | verified, approved, provisional |
| `confidence` | low, medium, high |
| `scope` | JSON object with exact scalar fields, e.g. `{"project":"alpha"}` |
| `data_classification` | public, internal, confidential, restricted |
| `updated_after`, `updated_before` | Inclusive ISO timestamps with timezone; source chunk or canonical record update time |

Record type, authority, confidence and nonempty scope select canonical evidence.
Combining them with `kind=source` returns a validation error. Scope matches existing
canonical scope values; it does not infer a project's identity from its title.
`source_id` matches a chunk's source or a canonical record's supporting source IDs.

MCP `search` / `ask` and `POST /v1/ask` / `POST /api/v1/ask` take the same filter fields
inside a `filters` object. The response echoes normalized filters. Example:

```json
{
  "query": "What is the launch decision?",
  "limit": 8,
  "filters": {
    "record_type": "decision",
    "scope": {"project": "alpha"},
    "confidence": "high"
  }
}
```

The Console's **Search → Filter evidence** exposes evidence type, record type and
classification. Search keeps literal query syntax; Ask extracts meaningful terms
and provides an extractive answer with citations. It does not call a model provider.

## File coverage

| Format | Extracted evidence | Boundaries |
| --- | --- | --- |
| Plain text / Markdown / code | Narrative and code chunks | Existing structured Markdown candidate extraction retained |
| JSON | Valid JSON values and array records | Invalid syntax fails explicitly |
| JSONL / NDJSON | Individual values with line numbers | Invalid lines fail the file; no partial silent indexing |
| CSV / TSV | Column-labeled records with row numbers | Quotes, escaped quotes, embedded newlines, Unicode and empty cells preserved; inconsistent widths rejected |
| PDF | Embedded text with page references | Up to 10 MB / 100 pages; no OCR, image interpretation or layout reconstruction |
| DOCX | Body paragraphs and table paragraphs, in document order | Up to 10 MB; headers, footers, comments and images are not extracted |
| XLSX | Sheets, cell addresses, shared/inline strings and stored cell values | Up to 10 MB; formulas shown with cached values, never evaluated; dates/numbers retain stored values rather than display formatting; charts/images not extracted |

Document archives have bounded XML expansion (10 MB per relevant entry, 20 MB total).
Custom XML entities and external worksheet relationships are rejected. PDF extraction
is limited to 5 million text characters. Tabular files are limited to 100,000 data
rows; CSV/TSV support up to 1,000 columns. Long records are split into chunks with
part numbers and their original row/paragraph/page reference.

The upload limit remains 25 MB: an oversized document can be stored but cannot be
parsed automatically. Unsupported formats remain stored/unparsed. Textless PDFs
require OCR or a text export. The UI reports stored-but-failed parsing, preserving
the original object. Parse failure and removal of stale chunks commit atomically;
a successful retry clears the prior failure. These parsers create searchable source
evidence, not approved canonical records.

Production parsing uses pinned `unpdf`, `fflate` and `fast-xml-parser` packages.
The PDF adapter uses the package's serverless PDF.js build. Original files stay in
the configured R2 bucket; parsing does not send files to another service.

## Verification

Ordinary regression: `npm run check && npm test`.
The opt-in SQL test is restricted to the existing isolated regression branch:

```sh
SOVEREIGN_RETRIEVAL_BRANCH=br-silent-wave-ayb8z6d5 \
SOVEREIGN_RETRIEVAL_DB_FILE=/path/to/private-branch-connection.json \
node --test tests/retrieval-neon.integration.test.mjs
```

The private connection file contains `{"url":"<branch connection string>"}`.
The test uses fresh synthetic tenant/source/canonical records in a rollback-only
transaction, tests real SQL filters and atomic failure recovery, and verifies the
fixture tenant is absent afterward. This is not a production upload or durability
claim across committed transactions.
