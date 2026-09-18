# Remaining owner acceptance

These checks need the owner's Console/browser or an independent AI-provider account.
They are pending, not implied by passing unit tests or a successful deployment.
Do not change hosting, authentication or network settings just to satisfy this list.

Use a clearly named `SOVEREIGN ACCEPTANCE` fixture scope. Keep real business knowledge
out of reversal/recovery experiments. Save the resulting record/task/import IDs and
receipts so results can be verified and the fixture can be archived afterward.

1. **Files and mobile.** On your phone, open the Console → Sources / Storage. Upload
   a small PDF containing selectable text, a DOCX and an XLSX with a unique test phrase.
   Confirm each becomes searchable. In Intelligence, search the phrase with source
   evidence selected, open the original, and verify page/paragraph/sheet/row references.
   Confirm the sidebar, upload, search and review controls fit without horizontal
   overflow. Upload malformed JSON and verify “stored, but not analyzed” is clear.
2. **Knowledge history and recovery.** Use synthetic fixture knowledge to propose,
   approve and update one decision. Propose its reversing revision, inspect it,
   approve it, and verify the original value plus all revisions remain in History.
   Start Trust Recovery for the fixture scope, inspect its findings, record the
   outcome, and complete recovery. Confirm that the scoped automation pause ends.
3. **Prepared import and export.** Command → Import legacy records: preview
   `imports/sovereign-documents-20260914.json`, inspect all three pinned paths and
   duplicates, apply the selected entries, and retain the receipt. Confirm canonical
   revision is unchanged. Before approving any imported candidates, exercise rollback
   and verify imported sources leave active retrieval. Download the tenant export and
   confirm it opens as JSON and contains the current task/checkpoint history.
4. **Independent provider.** Connect a supported MCP client from an AI provider other
   than ChatGPT using the existing Sovereign OAuth flow. Follow
   `docs/CHATGPT-CONNECTION.md` for the server URL and shared continuity sequence,
   adapting only the client UI. Resume an existing fixture task, save a distinct
   checkpoint and retrieve it from a fresh ChatGPT conversation. Record provider,
   client, task ID, checkpoint and receipt. Relabeling two ChatGPT actors does not
   satisfy this check. Mobile use of ChatGPT also is not a second provider.

Remaining engineering acceptance beyond these owner checks includes the full live
two-actor collision/handoff matrix, controlled production failure/revocation coverage,
role/policy administration and real external connector authorization/synchronization.
Any credential issuance or access expansion remains subject to the normal owner
consent flow. A V1 release should only be promoted after its required gates have
explicit dated evidence; optional Queue integration is not a prerequisite.
