# Sovereign document snapshot batch

Prepared September 14, 2026. This batch is ready for preview, not applied to production.

`sovereign-documents-20260914.json` contains three exact Markdown snapshots from
`everydayrice/project-sovereign` at commit `4e548e63dd25e372a3d81e926ef8a4be299157b8`:

| Document | Purpose |
| --- | --- |
| docs/ARCHITECTURE.md | Product purpose, module responsibilities and boundaries |
| docs/CHATGPT-CONNECTION.md | Connection, account roles and acceptance evidence |
| docs/WORKING-ROUTINE.md | Task continuity routine and project links |

Each source text is wrapped in a summary record with its project scope, original
path, exact commit and SHA-256. The wrapper is generated for import; it is not
represented as the original Markdown file format. The pinned source text is preserved.
The existing legacy-import workflow treats these as historical document snapshots
with unknown currentness and creates unapproved candidates. It does not approve new
canonical decisions. The four existing approved baseline records overlap this material:
review any future proposals against those records rather than approving duplicates.

## Apply through existing owner workflow

1. Open Command, then Import legacy records.
2. Select the JSON batch and choose Preview import. Recompute the preview against
   the current workspace; a preview from a test fixture is not production approval.
3. Inspect the three paths, commit and existing-source/duplicate results, then select
   the intended entries and apply.
4. Verify three source snapshots, source-backed retrieval and the returned receipt.
   Canonical revision should stay unchanged. Save the receipt before any later review.

Candidates produced by this legacy adapter retain `project_scope` in their source
payload; they do not automatically receive top-level canonical `scope.project`.
Any later canonical proposal must explicitly set that scope and reconcile the four
existing records. This batch does not import tasks, credentials or unrelated history.

The local regression verifies read-only preview, text hashes, candidate-only staging,
duplicate prevention and rollback. Actual production application and retrieval are
still pending. Rollback after changes or canonical promotion requires reconciliation.
