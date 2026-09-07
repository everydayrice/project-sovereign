# V1 acceptance status — 2026-09-07

V1 is not complete. Merged implementation and unit tests are not substitutes for production acceptance. This record distinguishes completed evidence from remaining work.

| # | Scenario | Status | Evidence / remaining verification |
|---|---|---|---|
| 1 | Auth / tenant | PASS | Owner authenticated and operated the real tenant; governed Console task writes persisted. |
| 2 | File ingestion | PASS | Synthetic Markdown uploaded, stored in R2, normalized, automatically analyzed and queried; source archive/restore returned it to current/analyzed. Broader format coverage remains separate unfinished scope. |
| 3 | Ask Sovereign | PASS | ORBIT TEST source-backed answer worked without canonical promotion; production has zero canonical records. |
| 4 | Canonical lifecycle | BLOCKED | Candidate review, approval, history and reversing proposals implemented and tested locally; production browser lifecycle not completed. |
| 5 | Conflict | BLOCKED | Explicit subject/type/scope contradictions surfaced without writes in tests; live conflicting-evidence review pending. No claim of semantic contradiction detection. |
| 6 | Continuity | BLOCKED | Production Console task create, work, checkpoint, checkout, reload/resume and completion passed. Full two-actor handoff acceptance remains pending. |
| 7 | Traffic | BLOCKED | Domain overlap/lease tests pass; complete live two-actor overlap matrix remains unverified. |
| 8 | Runtime portability | BLOCKED | HTTP/MCP share normalized contracts; independently deployed Queue adapter merged. Queue connection is not configured. |
| 9 | Real MCP client | BLOCKED | Scope/transport/operation tests pass locally. Full real-client acceptance and database transport suite remain incomplete. |
| 10 | Trust Recovery | BLOCKED | Scoped pause, human repair and preserved review history implemented/tested locally; controlled live repair pending. |
| 11 | Extension | BLOCKED | Queue PR47 passed typecheck/build/Worker dry run and merged. Production installation, scoped credential binding and revoke acceptance await Cloudflare access. |
| 12 | Legacy dry run | PASS | Two real records pinned to one repository commit previewed against the production tenant's exported normalized state, with historical authority, original active lifecycle, dates and three checkpoints. Zero writes. Browser synthetic dry run also passed; apply/rollback remains unverified live. |
| 13 | Export | PASS | Administrative single-query production export hydrated through the normalized adapter and saved in documented JSON format. Tenant boundaries, credential exclusion, completed task and actor context verified. Browser download endpoint and separate source binary export remain unverified. |
| 14 | Failure handling | BLOCKED | Real Neon transactional tenant-reference guards and extension grant checks passed; complete DB/R2/parser/auth/concurrency/revocation production matrix remains pending. |
| 15 | Mobile | BLOCKED | Responsive layout and accessible review dialogs implemented; no supported viewport control or completed mobile browser acceptance. |

## Current verification

64 ordinary tests passed, 7 opt-in database integration tests skipped in that run. Separate disposable-Neon tests verified Ideas tenant guards and normalized extension/Owner/event persistence; all their fixtures rolled back. An earlier broad WebSocket integration run did not complete reliably and is not counted as a pass.

The browser connection stalled at the native synthetic-import confirmation. Inspection, dismissal and manual handoff timed out. A read-only production query confirmed that the synthetic import was not applied, the prior Console lifecycle task was completed, and there was no outstanding import cleanup. Native prompts have since been replaced with accessible in-page confirmation dialogs, but live verification remains blocked.

## Unfinished implementation scope

- Production acceptance of role/grant administration and supported versioned policies; broader arbitrary policy types remain unsupported.
- Broader real connector and practical document/spreadsheet parser coverage; unsupported formats currently remain explicitly stored/unparsed.
- Full structured retrieval filters and expanded intelligence workflows.
- Queue production configuration, full machine-client acceptance, live recovery/canonical/traffic acceptance, and mobile verification.
- Release/version promotion and final adversarial review after all acceptance gates pass.

No V1 completion or release promotion is claimed.

Governance follow-up: role/grant editing and supported policy activation are implemented, with 68 ordinary tests passing and one separate disposable-Neon governance transaction test passing. Live governance UI acceptance remains pending.
