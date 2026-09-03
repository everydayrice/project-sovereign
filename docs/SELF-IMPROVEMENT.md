# Sovereign Self-Improvement and Failure Learning

Status: V0.1/V1 foundation

## Principle

Sovereign should waste no meaningful failure.

A mistake, user correction, bad retrieval, stale assumption, collision, failed handoff, misleading canonical update or onboarding gap should become structured improvement evidence.

However, "self-learning" does **not** mean an AI may silently rewrite Canonical Intelligence, permissions, Protocol invariants or its own governing code/policy without authority.

The system improves through observable, testable and reversible changes.

## Failure learning lifecycle

```text
FAILURE / CORRECTION / BAD OUTCOME / USER PAIN
→ Failure Event
→ classify impact/root cause
→ preserve evidence
→ immediate correction where authorized
→ generate Improvement Candidate
→ test/validate proposed fix
→ apply automatically only within permitted low-risk policy
   OR request approval for consequential changes
→ create improvement checkpoint
→ regression test / monitoring rule
→ verify the failure no longer reproduces
→ show the user what permanently improved
```

## Failure Event

Capture where appropriate:

- event ID;
- tenant/actor/session/task;
- user-reported vs system-detected;
- symptom;
- affected module/resource;
- expected behavior;
- actual behavior;
- impact/severity;
- suspected and confirmed root cause;
- evidence/artifacts;
- canonical revision/context used;
- provider/model/runtime where relevant;
- correction applied;
- recurrence status.

## System-detected failures

Sovereign should detect failures that users may not explicitly report where feasible, including:

- contradictory canonical records;
- repeated user corrections to the same concept;
- retrieval followed immediately by broader re-retrieval due missing context;
- actors repeatedly using stale canonical revisions;
- failed or abandoned handoffs;
- repeated collision warnings becoming actual merge/deploy conflicts;
- source drift that invalidates canonical assumptions;
- failed initialization connectors;
- low-confidence canonical updates later reverted;
- repeated task rework after Sovereign context was used;
- unexplained gaps between source state and Canonical Intelligence.

Detection creates evidence/candidates, not automatic truth.

## Improvement targets

Improvements may affect:

- retrieval ranking/recommendations;
- source/authority mapping;
- onboarding/study/sweep procedures;
- canonical promotion rules;
- conflict detection;
- traffic coordination policy recommendations;
- schemas/normalization;
- handoff/checkpoint quality;
- extension compatibility;
- prompts/adapters;
- tests/validation;
- UI warnings/explanations;
- caching/deduplication;
- model/provider routing recommendations.

## Permanent learning from corrections

When a user corrects Sovereign, the system should attempt to distinguish:

1. one-off correction to a specific record;
2. recurring misunderstanding pattern;
3. source/authority problem;
4. schema/modeling problem;
5. retrieval/orientation problem;
6. workflow/process problem;
7. provider/model limitation.

The goal is not merely to patch the single answer. Where evidence supports it, create a durable improvement that reduces recurrence across future sessions/tasks.

## User-visible improvement feedback

The user should be able to feel that pain produced value.

Examples:

> Correction applied. The canonical record was reverted and the source-authority rule for this domain was updated. A regression check was added so future sweeps flag this mismatch before promotion.

> This is the third time a fresh actor missed this project dependency. Sovereign has created an improvement candidate for Control Plane orientation and will test it against recent sessions.

> The failed handoff exposed a missing checkpoint field. The Continuity schema/test suite has been updated and future handoffs now require that artifact pointer.

Do not claim permanent improvement unless an actual durable change/test/policy update occurred.

## Improvement log / health view

Command/Console should expose:

- recent failures detected;
- user corrections;
- improvement candidates;
- improvements applied;
- regression tests created;
- reverted improvements;
- recurring unresolved failure patterns;
- before/after outcome metrics where measurable.

Natural language examples:

- "What have you learned from mistakes this week?"
- "Are we repeating any failures?"
- "What did my last correction permanently change?"
- "Show unresolved learning debt."

## Maintenance

Self-maintenance may automatically perform low-risk deterministic work such as:

- schema/reference integrity checks;
- stale source detection;
- index/cache rebuilds;
- lease cleanup;
- duplicate candidate detection;
- regression test execution;
- connector health checks;
- canonical history integrity validation;
- pending conflict surfacing.

Consequential strategy, authority, privacy, permissions, canonical truth and destructive changes remain governed by Command policy/approval.

## Core invariant

Sovereign should become more useful as it encounters real work and real failures, but improvement must remain attributable, testable, reversible and policy-bounded.