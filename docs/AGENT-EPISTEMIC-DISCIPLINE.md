# Sovereign Specialist Agent Epistemic Discipline

Status: V0.1 concept / V1 integration contract direction

## Purpose

Specialist agents created through Sovereign Expertise Assignment should be able to operate with configurable epistemic strictness: how strongly they adhere to assigned canonical intelligence, how willing they are to improvise outside established rules, what evidence they require before asserting something, and how they explain their decisions.

The user-facing concept may be called **Stubbornness** because it is intuitive: a highly stubborn specialist does not casually abandon the user's established system because a generic best practice, model prior or plausible-sounding guess suggests something different.

Internally this should be modeled as evidence/authority policy rather than personality alone.

## Core principle

**Established user-specific intelligence beats generic model instinct unless stronger authorized evidence shows that the established intelligence is wrong, stale, incomplete or superseded.**

A specialist should prefer:

1. current assigned Canonical Intelligence;
2. registered authoritative/live sources;
3. approved specialist knowledge/research;
4. clearly labeled general-domain knowledge;
5. explicit uncertainty or refusal to infer when evidence is insufficient.

A specialist must not fabricate a tenant-specific rule merely to provide an answer.

## Stubbornness / epistemic strictness

A profile may expose a simple user setting while retaining more granular internal controls.

Suggested user-facing levels:

### Flexible

The specialist may combine assigned intelligence with general domain reasoning when the established system does not answer the question. It must distinguish established rules from suggestions.

### Grounded

Default recommended mode. The specialist follows assigned/current canonical intelligence strongly, may make bounded recommendations when no rule exists, and clearly labels recommendations, assumptions and uncertainty.

### Strict

The specialist should not depart from established tenant-specific rules without explicit evidence or user instruction. Missing coverage should normally result in `not established`, a request to research, or a proposed rule rather than an invented answer.

### Locked

For deterministic or sensitive use cases. The specialist answers only from explicitly allowed intelligence/source classes or approved procedures. If the answer is not supported, it says so and provides the missing evidence/decision needed. Generic model knowledge may be unavailable unless separately permitted.

These levels configure behavior; they do not change underlying Canonical Intelligence.

## No-hallucination objective

No generative model can be guaranteed to produce zero hallucinations. Sovereign should instead make hallucination resistance measurable and enforceable through architecture.

Controls may include:

- retrieval before tenant-specific assertions;
- required provenance/reference availability;
- explicit `established`, `inferred`, `recommended`, `unknown`, `conflicted` labels internally;
- refusal/fallback when required evidence is absent;
- deterministic rule execution where feasible;
- canonical revision binding;
- freshness checks;
- evaluation suites and regression tests;
- correction/failure feedback into the self-improvement system.

The product promise should be evidence discipline and explainability, not an impossible absolute guarantee.

## Decision explainability contract

A specialist should be able to explain any material recommendation at multiple levels without exposing private model chain-of-thought.

### Concise rationale

For: `Why this name?`

Return a short, useful explanation such as:

- which established rule applied;
- the relevant facts about the current case;
- why the selected option fits better than obvious alternatives;
- any uncertainty or exception.

### Decision breakdown

For: `Walk me through exactly how you decide what's good and what isn't.`

Return the explicit decision framework used by the specialist, including:

- inputs considered;
- canonical rules/criteria;
- precedence/exception rules;
- decision tree or scoring rubric when one exists;
- authoritative source/revision references;
- examples of acceptable/unacceptable cases;
- what would change the outcome.

This is a system/rule explanation, not hidden private chain-of-thought.

### System recap

For: `Break down our system to me again.`

Return a coherent current-state explanation of the assigned domain:

- purpose;
- major rules;
- structure/taxonomy;
- important exceptions;
- examples;
- current canonical revision/checkpoint;
- known gaps/conflicts;
- recent relevant changes.

The explanation should prioritize clarity over dumping raw records.

### Self-audit / test my data

For: `I forgot and want to test whether your data is still accurate.`

The specialist should be able to run a scoped understanding check:

1. resolve the latest authorized canonical revision;
2. compare its Expertise Profile dependencies against current Canonical Intelligence;
3. verify freshness requirements;
4. identify stale/missing/conflicted specialist references;
5. summarize its current understanding;
6. report gaps/uncertainty;
7. propose refresh/study/canonical actions if needed.

The user should be able to distinguish `Bob remembers the system accurately` from `Bob is confidently repeating an old snapshot`.

## Example — mailbox naming specialist

Question:

`Which mailbox should I use to create an account with Vendor X?`

A strict Bob should not answer from generic conventions first.

He should resolve the assigned mailbox-naming intelligence, identify the account purpose and organizational context, apply the established naming/alias rules, and return the selected mailbox plus a concise rationale.

If no established rule covers the circumstance, Bob should say so explicitly, for example:

`Our current canonical mailbox system does not establish a rule for this case. Based on the existing pattern I can recommend X, but that would be a new recommendation rather than an established rule. Would you like me to treat this as a one-off or propose it for canonical inclusion?`

## Canonical adherence vs correction

Stubbornness must not become blind obedience to bad data.

If a specialist discovers that assigned Canonical Intelligence conflicts with a newer authoritative source or explicit owner correction, it should:

1. preserve the current canonical state as the currently governing record unless policy says otherwise;
2. surface the conflict;
3. avoid silently replacing the rule;
4. use live authoritative truth when required for the immediate task and policy permits;
5. create/propose a Canonical Change Set when appropriate;
6. refresh its Expertise Profile after the canonical resolution.

A high-stubbornness agent is stubborn about evidence and governance, not stubborn about being wrong.

## Per-agent configuration

An Expertise Profile may include controls such as:

- `epistemic_strictness`: flexible | grounded | strict | locked;
- `generic_knowledge_policy`: allowed | label_only | restricted | disabled;
- `external_research_policy`: disabled | ask | allowed | required_for_gaps;
- `canonical_adherence`: prefer_current | require_current | revision_pinned;
- `freshness_policy`;
- `unknown_behavior`: state_unknown | ask | research | propose;
- `explanation_default`: concise | standard | detailed;
- `provenance_visibility`: on_request | material_answers | always;
- `conflict_behavior`: warn | block | use_live_and_propose;
- `self_audit_schedule` where applicable.

Command governs available policies and permissions. Workforce or another personnel product may expose them as agent/employee settings.

## Expertise transparency

A user should always be able to ask a specialist:

- `What exactly are you an expert in?`
- `What intelligence are you assigned?`
- `What are you not allowed to use?`
- `What do you know only from public research?`
- `Which canonical checkpoint are you following?`
- `What changed in your expertise recently?`
- `What are you unsure about?`
- `When did you last refresh?`
- `Why did you make that recommendation?`
- `Would another specialist using generic best practices disagree with you, and why?`

These answers should be generated from inspectable Expertise Profile/configuration/provenance state rather than vague persona claims.

## V1 principle

**A specialist should be confidently consistent where the user's system is established, explicitly uncertain where it is not, and able to explain the governing system in plain language on demand.**
