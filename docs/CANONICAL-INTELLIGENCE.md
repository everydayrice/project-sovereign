# Sovereign Canonical Intelligence

Status: V0.1/V1 foundation

## Principle

Canonical does **not** mean deleting or flattening old intelligence. Sovereign Canonical Intelligence is versioned, attributable, reversible durable state.

The current canonical view is derived from an append-only history of canonical changes, revisions, supersessions and explicit removals/tombstones. Historical records remain inspectable unless retention/privacy policy requires deletion.

## Canonical objects

### Canonical Record

A durable approved/verified intelligence object with:

- stable record ID;
- tenant/scope/entity/domain;
- record type;
- current payload/state;
- authority and provenance;
- source locators;
- privacy/data classification;
- revision/version;
- current lifecycle state;
- created/updated/verified times;
- supersession relationships;
- canonical checkpoint/change-set membership.

### Canonical Change Set

A proposed or applied atomic group of canonical changes. This is the intelligence equivalent of a commit/change set.

A change set may:

- add records;
- modify records;
- supersede records;
- merge/reconcile records;
- remove from the current canonical view while retaining history where policy permits;
- restore/revert prior state.

Every change set should contain:

- change-set ID;
- human-readable title/summary;
- reason/rationale;
- initiator (user, actor, import, sweep, study, migration, extension);
- exact before/after diff;
- affected records/scopes;
- provenance/evidence;
- confidence/authority assessment;
- approval requirement and result;
- created/applied times;
- predecessor/base canonical revision;
- resulting canonical revision;
- rollback/revert references.

### Canonical Checkpoint

A named/readable canonical snapshot boundary over one or more applied change sets.

A checkpoint should answer:

- what changed since the previous checkpoint;
- why it changed;
- what records/scopes were affected;
- who/what changed them;
- what evidence supported the changes;
- whether user approval was required;
- current unresolved conflicts/gaps;
- resulting canonical revision/hash.

Checkpoints may be automatic for low-risk deterministic updates or explicit/user-approved for consequential merges.

## Canonical update lifecycle

```text
SOURCE / CONVERSATION / STUDY / SWEEP / USER REQUEST
→ Candidate Intelligence
→ deduplicate + reconcile
→ authority/provenance/privacy checks
→ Canonical Change Set proposal
→ policy decides auto-apply vs confirmation
→ apply atomically
→ Canonical Checkpoint / revision
→ notify/confirm to user according to Command policy
→ indexes/caches refresh
```

## User-visible confirmation

Consequential canonical changes should be easy to recognize and approve.

Example interaction:

> Canonical record update detected — 14 records would be added, 3 modified, 1 superseded. Review or include canonically?

Command policy determines which changes require confirmation. Examples likely to require confirmation:

- broad initialization imports;
- large merges/reconciliations;
- consequential identity/entity relationships;
- legal/financial/ownership/authority changes;
- conflict resolution where evidence is ambiguous;
- deletion/tombstone operations;
- low-confidence inferred durable state.

Low-risk deterministic updates may auto-apply when explicitly permitted, but still produce an auditable change set/checkpoint.

## Canon status / canon check

Sovereign should support a natural-language and API operation equivalent to `canon status` / `canon check`.

It should return, scoped as requested:

- current canonical revision/checkpoint;
- recent change sets;
- records added/modified/superseded/removed;
- pending canonical proposals;
- unresolved conflicts;
- stale/unverified canonical intelligence;
- initialization/sweep/study changes awaiting review;
- recent retrieval/use of canonical datasets where telemetry is enabled;
- who/what produced each update.

Examples:

- "canon check"
- "what changed canonically today?"
- "show canonical updates for RICE LABS"
- "what is pending canonical approval?"
- "are you getting all of this canonically?"

## Manual canonical control

Authorized users/actors must be able to request:

- propose canonical update;
- modify canonical record;
- merge/reconcile records;
- create canonical checkpoint;
- force a canon status/check;
- review pending proposals;
- approve/reject a proposed change set;
- revert a specific canonical change set;
- restore a previous canonical revision;
- remove/tombstone a record from the current canonical view;
- export historical canonical state.

Manual commands are governed by Command permissions/policy and never bypass audit/provenance requirements.

## Undo / revert semantics

Prefer **revert** over destructive history rewriting.

If change set C introduced an incorrect update, a revert creates a new change set R that restores the prior effective state while preserving C in history.

Hard deletion is reserved for retention/privacy/legal requirements and must be separately audited.

## Canonical retrieval checkpoints

Retrieval itself normally does not modify Canonical Intelligence, but Sovereign may record lightweight usage telemetry or a Canonical Access Event when configured.

For meaningful work, actors may checkpoint that canonical datasets were retrieved/relied upon, e.g.:

- canonical revision used;
- records/scopes retrieved;
- freshness/verification state at retrieval;
- resulting task/traffic session.

This supports later questions such as: "Which canonical revision did Codex use when it made this change?"

## History UX

Historical intelligence must be understandable by humans, not only stored as database rows.

Console should provide:

- chronological canonical timeline;
- named checkpoints/releases;
- before/after diffs;
- filters by scope/entity/domain/actor/source;
- current vs historical view;
- supersession graph;
- rollback/revert actions;
- source/provenance drilldown;
- natural-language summaries such as "What changed between these checkpoints?"

## Core invariant

Canonical Intelligence is trusted because its history is visible, attributable, reviewable and reversible — not because old information disappeared.