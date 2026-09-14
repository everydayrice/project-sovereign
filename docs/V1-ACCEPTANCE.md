# V1 acceptance status — 2026-09-14

V1 is not complete. Merged implementation and unit tests are not substitutes for production acceptance. This record distinguishes completed evidence from remaining work.

## Current evidence: September 14

Standalone ChatGPT connection acceptance passed. The owner confirmed task creation,
checkpoint persistence and retrieval in a fresh ChatGPT conversation through the
production MCP connection. This establishes the core continuity path; it does not
complete the remaining V1 gates below.

Merged fixes: [PR24](https://github.com/everydayrice/project-sovereign/pull/24)
adds the build command; [PR25](https://github.com/everydayrice/project-sovereign/pull/25)
adds cancellation/expiry recovery; [PR26](https://github.com/everydayrice/project-sovereign/pull/26)
repairs consent Origin handling while retaining CSRF checks; and
[PR27](https://github.com/everydayrice/project-sovereign/pull/27) restores extension
grant freshness metadata so normalized workspace loading succeeds.
Production migrations 0006 and 0007 were applied. Main at verification was
`ac392f659bb87e323229e6de75ee9cd38ae78fb1`; CI and Workers Builds succeeded.
The PR27 run passed 78 ordinary tests with 8 opt-in tests skipped. Separate isolated
Neon calls verified task creation/read, session check-in, checkpoint and fresh-server
resume. These are prior verification results, not a new test run for this document.

The connected workspace also saved and retrieved a real project baseline and five
prioritized backlog tasks, with persistence version 25 after checkout. Canonical
status remained revision 0 with no approved records. Existing conversation history
has not been automatically imported or promoted.

## Historical September 9 follow-up (superseded by current evidence)

RICE Lightning/Queue is an optional external integration, not a Sovereign launch
dependency. Historical Queue references below do not define the standalone release gate.

The old MCP handler omitted standard initialization. This change adds initialization,
version negotiation, notifications, ping, HTTP authentication challenges, and OAuth
account linking using the existing Sovereign login. The official MCP SDK now connects
and resumes a checkpoint through a fresh client using local test persistence.
73 ordinary tests pass (8 opt-in tests skipped). Separate rollback-only tests against
the isolated Neon migration branch validate the real OAuth SQL, including PKCE binding,
expiry, one-time redemption, client/resource/callback binding, owner permissions,
refresh rotation and revocation on refresh-token replay.

Migration 0006 is prepared and tested, pending explicit production migration approval.
Worker bundling passes a Wrangler deployment dry run. Production deployment and
ChatGPT account linking/read-write-resume remain unverified. No release promotion is claimed.
See [ChatGPT connection](CHATGPT-CONNECTION.md) for the exact setup and acceptance prompts.

| # | Scenario | Status | Evidence / remaining verification |
|---|---|---|---|
| 1 | Auth / tenant | PASS | Owner authenticated and operated the real tenant; governed Console task writes persisted. |
| 2 | File ingestion | PASS | Synthetic Markdown uploaded, stored in R2, normalized, automatically analyzed and queried; source archive/restore returned it to current/analyzed. Broader format coverage remains separate unfinished scope. |
| 3 | Ask Sovereign | PASS | ORBIT TEST source-backed answer worked without canonical promotion; production has zero canonical records. |
| 4 | Canonical lifecycle | BLOCKED | Candidate review, approval, history and reversing proposals implemented and tested locally; production browser lifecycle not completed. |
| 5 | Conflict | BLOCKED | Explicit subject/type/scope contradictions surfaced without writes in tests; live conflicting-evidence review pending. No claim of semantic contradiction detection. |
| 6 | Continuity | BLOCKED | Production Console task create, work, checkpoint, checkout, reload/resume and completion passed. Production ChatGPT cross-conversation resume also passed September 14. Full two-actor handoff acceptance remains pending. |
| 7 | Traffic | BLOCKED | Domain overlap/lease tests pass; complete live two-actor overlap matrix remains unverified. |
| 8 | Runtime portability | PARTIAL | HTTP/MCP share normalized contracts; production ChatGPT connection passed. Additional independent provider acceptance remains pending. Queue configuration is optional. |
| 9 | Real MCP client | PASS (core) | Production ChatGPT account linking, task creation, checkpoint and fresh-conversation retrieval passed September 14. Broader failure/concurrency coverage remains in gate 14. |
| 10 | Trust Recovery | BLOCKED | Scoped pause, human repair and preserved review history implemented/tested locally; controlled live repair pending. |
| 11 | Extension | BLOCKED | Queue PR47 passed typecheck/build/Worker dry run and merged. Production installation, scoped credential binding and revoke acceptance await Cloudflare access. |
| 12 | Legacy dry run | PASS | Two real records pinned to one repository commit previewed against the production tenant's exported normalized state, with historical authority, original active lifecycle, dates and three checkpoints. Zero writes. Browser synthetic dry run also passed; apply/rollback remains unverified live. |
| 13 | Export | PASS | Administrative single-query production export hydrated through the normalized adapter and saved in documented JSON format. Tenant boundaries, credential exclusion, completed task and actor context verified. Browser download endpoint and separate source binary export remain unverified. |
| 14 | Failure handling | BLOCKED | Real Neon transactional tenant-reference guards and extension grant checks passed; complete DB/R2/parser/auth/concurrency/revocation production matrix remains pending. |
| 15 | Mobile | BLOCKED | Responsive layout and accessible review dialogs implemented; no supported viewport control or completed mobile browser acceptance. |

## Historical September 7 verification

64 ordinary tests passed, 7 opt-in database integration tests skipped in that run. Separate disposable-Neon tests verified Ideas tenant guards and normalized extension/Owner/event persistence; all their fixtures rolled back. An earlier broad WebSocket integration run did not complete reliably and is not counted as a pass.

The browser connection stalled at the native synthetic-import confirmation. Inspection, dismissal and manual handoff timed out. A read-only production query confirmed that the synthetic import was not applied, the prior Console lifecycle task was completed, and there was no outstanding import cleanup. Native prompts have since been replaced with accessible in-page confirmation dialogs, but live verification remains blocked.

## Unfinished implementation scope

- Production acceptance of role/grant administration and supported versioned policies; broader arbitrary policy types remain unsupported.
- Broader real connector and practical document/spreadsheet parser coverage; unsupported formats currently remain explicitly stored/unparsed.
- Full structured retrieval filters and expanded intelligence workflows.
- Live recovery/canonical/traffic acceptance, broader machine-client failure coverage, and mobile verification. Queue production configuration remains optional integration work.
- Release/version promotion and final adversarial review after all acceptance gates pass.

No V1 completion or release promotion is claimed.

Governance follow-up: role/grant editing and supported policy activation are implemented, with 68 ordinary tests passing and one separate disposable-Neon governance transaction test passing. Live governance UI acceptance remains pending.
