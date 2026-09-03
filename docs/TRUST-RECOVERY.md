# Sovereign Trust Recovery

Status: V1 product requirement

## Purpose

Sovereign must assume that at some point a user may lose confidence in the system and feel that the intelligence, history, configuration or coordination state is too complex, possibly inaccurate, or no longer under their control.

This is a critical failure mode. A persistent intelligence platform that becomes difficult to inspect or safely correct can feel worse than having no persistent system at all.

Trust recovery therefore is a first-class product capability, not a support-only workflow.

## Core principle

When trust drops, complexity must collapse.

The user should be able to say things such as:

- "I don't trust the data anymore."
- "Is my Sovereign state fucked?"
- "Check everything."
- "What do you actually think you know about me?"
- "Show me what's wrong."
- "I think you misunderstood this entire project."
- "Take me back to before yesterday's updates."
- "Re-study this scope from source."

Sovereign should recognize this as a request for trust recovery and offer a safe, guided path rather than requiring the user to understand internal architecture.

## Recovery mode

Recovery Mode should be invokable from natural language or the Console.

Default behavior:

1. create a recovery snapshot/checkpoint of current state;
2. pause or approval-gate risky canonical mutations in the affected scope;
3. keep read access available;
4. inspect current Canonical Intelligence, Continuity, source coverage, pending changes and recent canonical history;
5. identify conflicts, stale records, low-confidence areas, failed connectors, unresolved candidates and suspicious recent changes;
6. present findings in human-readable form;
7. offer non-destructive repair actions;
8. verify the repaired state against authoritative sources;
9. produce a Recovery Checkpoint and plain-language summary;
10. record the failure/experience as input to the self-improvement system.

Recovery Mode must not silently delete or rewrite historical data.

## Recovery Center

The Console should provide a simple Recovery Center that answers five questions first:

### 1. What does Sovereign currently believe?

Show the current canonical state for the selected scope in plain language.

Examples:

- current project architecture;
- current entity/business relationships;
- active policies and constraints;
- important current facts;
- current source authorities;
- current Continuity/task state.

The user should not have to inspect raw JSON or database rows.

### 2. What changed recently?

Show recent Canonical Change Sets and Checkpoints with concise diffs:

- added;
- modified;
- superseded;
- reverted;
- imported;
- pending approval.

Allow drill-down to exact records, sources, actor/session, timestamp and rationale.

### 3. What might be wrong?

Surface:

- conflicting canonical records;
- canonical/source disagreement;
- stale volatile information;
- low-confidence or weakly sourced state;
- high-confidence changes later reverted;
- failed/partial initialization or source scans;
- disconnected or unhealthy source integrations;
- pending canonical proposals;
- unusual bursts of canonical changes;
- repeated corrections in the same domain;
- indexes/caches that are unhealthy or out of sync;
- unresolved migration/reconciliation debt.

### 4. What does Sovereign not know well enough?

Show explicit coverage gaps instead of pretending completeness.

Examples:

- unstudied sources;
- partially initialized domains;
- sources connected but not fully analyzed;
- inaccessible sources;
- conflicting authorities;
- areas relying mainly on user statements or model inference;
- stale deep-study results.

### 5. What can I safely do about it?

Offer simple repair actions with impact previews.

Examples:

- approve/reject pending canonical changes;
- revert a Canonical Change Set;
- restore current state from an earlier Canonical Checkpoint by creating a new revert change set;
- re-study a scope from authoritative sources;
- re-run initialization for a selected source/domain;
- quarantine suspicious candidate/canonical records from normal retrieval while preserving history;
- mark a source as authoritative/non-authoritative;
- correct a relationship/fact manually;
- rebuild derivative indexes/caches;
- reconnect or re-scan a source;
- compare two checkpoints;
- export the current intelligence package before repair.

## Trust Check / Canon Check

A lightweight natural-language command should always be available.

Examples:

- "trust check"
- "canon check"
- "system check"
- "are you keeping up?"
- "what have you recorded from this conversation?"

A useful response should summarize:

- current canonical revision/checkpoint;
- recent canonical changes;
- pending approvals;
- recent Continuity checkpoints;
- unresolved conflicts;
- stale/uncertain areas;
- source/integration health;
- initialization/coverage gaps;
- active recovery or learning issues;
- whether anything discussed recently appears material but has not been preserved.

Do not reduce this to a single opaque health score. If a score is shown, it must be decomposable into understandable evidence.

## Safe rollback and repair

Recovery actions should be non-destructive by default.

Reverting a canonical change should create a new Canonical Change Set that reverses the selected change while preserving history.

Hard deletion is reserved for explicit privacy/legal/retention requirements or deliberate user action.

The system should support:

- revert one record revision;
- revert one Canonical Change Set;
- restore a scope to the effective state of a prior Canonical Checkpoint;
- selectively preserve later unrelated changes;
- preview the resulting state before applying;
- verify after applying;
- undo the recovery action itself through another versioned change.

## Scope isolation

A user who distrusts one area should not have to reset the whole tenant.

Recovery can target:

- one fact/record;
- one project/entity/domain;
- one source/integration;
- one initialization batch;
- one time window;
- one actor/session;
- the entire tenant only when necessary.

## Understanding validation

The system should let users test Sovereign's understanding directly.

Examples:

- "Explain what you know about RICE LABS."
- "What are you least confident about?"
- "What would you tell a brand-new AI about this project?"
- "Show the evidence behind this relationship."
- "What changed your understanding?"
- "What would you retrieve for a deep task on this topic?"

The Console may provide an interactive "Test Understanding" experience that generates a human-readable briefing from Canonical Intelligence and highlights source/provenance links and uncertainty.

## Visibility as a product requirement

Persistent intelligence cannot remain invisible.

The user should be able to see and feel that Sovereign is working through:

- canonical activity indicators;
- recent-change timeline;
- pending canonical update prompts;
- source coverage maps;
- initialization progress;
- current-vs-historical record views;
- conflict/uncertainty badges;
- Continuity checkpoints;
- Control Plane traffic board;
- self-improvement/failure-resolution history;
- clear explanations of why a fact is considered canonical.

The goal is not to overwhelm users with telemetry. Default views should be simple, with deep auditability available on demand.

## Self-improvement linkage

Every trust-recovery event is valuable learning evidence.

Recovery should capture, where appropriate:

- what caused the user to lose trust;
- whether the cause was incorrect intelligence, stale intelligence, missing context, confusing UI, poor visibility, bad retrieval, excessive complexity, failed initialization, faulty promotion, connector failure or another category;
- what repair resolved it;
- whether the same pattern appeared elsewhere;
- what regression tests/policies/retrieval rules/UI changes should prevent recurrence;
- whether the improvement was verified after deployment.

A user should be able to ask:

- "What did this incident permanently improve?"
- "Could this happen again?"
- "What changed because I reported this?"

The answer must distinguish between an immediate local correction and an actual system-level improvement that has been implemented and verified.

## Product principle

A user should never feel trapped by the sophistication of their own intelligence system.

Sovereign should always provide a visible, reversible and understandable path from:

"I think this whole thing is wrong"

back to:

"I can see what it knows, I can see what changed, I understand the uncertainty, I can repair it safely, and I trust the resulting state again."
