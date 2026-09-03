# Sovereign Expertise Assignment

Status: V0.1 concept / V1 integration contract direction

## Purpose

Sovereign should allow a tenant to assign selected intelligence, sources, study permissions and specialist memory to a durable AI agent or external personnel system without copying or forking the tenant's canonical intelligence.

The core concept is an **Expertise Profile**: a persistent, permissioned lens over Sovereign Intelligence and related sources that defines what an agent is expected to know deeply by default.

This solves the paradox of an ever-growing Intelligence module: Sovereign may contain enormous amounts of knowledge, but no actor should be forced to load or reason over everything at once. Intelligence remains broad; expertise is intentionally scoped.

## Architectural boundary

- **INTELLIGENCE** owns canonical knowledge, candidate intelligence, sources, provenance, revisions and historical state.
- **COMMAND** controls who/what may access which intelligence and source classes.
- **CONTROL PLANE** orients the actor and exposes available routes; it does not silently decide the actor's full context appetite.
- **CONTINUITY** preserves the agent's task/session working state and specialist learning progress where appropriate.
- **Workforce or another agent/personnel product** may own durable employees, roles, teams, scorecards, agent-specific episodic memory and employment lifecycle.

Sovereign does not require Workforce. Workforce is a first-class example consumer of the Expertise Assignment contract.

## Expertise Profile

Conceptual fields:

- `expertise_profile_id`
- tenant/workspace
- subject / role label
- assigned actor or external agent/personnel identity
- scope selectors
- source policy
- canonical revision policy
- study curriculum/objectives
- specialist memory policy
- permitted skills/tools/actions
- freshness requirements
- evaluation/certification state
- created/updated provenance

## Scope selectors

An Expertise Profile may target any combination of:

- tenant-wide intelligence
- organization/workspace
- project
- entity/company/brand
- domain/function such as sales, production, finance, legal, IT, naming, email administration
- circumstance/use case
- explicit record/relationship sets
- tagged intelligence collections
- custom queries/rules

Examples:

- Bob: shared-mailbox naming and Microsoft 365 mailbox/email administration
- Sarah: all RICE LABS sales intelligence
- Jeremy: all production/fulfillment intelligence
- Lilly: sales intelligence across the tenant plus approved public sales research

## Assignment modes

### Live-linked

The profile points to the current canonical intelligence matching its scope. When Canonical Intelligence changes, the agent receives the latest authorized state on subsequent retrieval/check-in.

Use for operational expertise that should track current truth.

### Revision-pinned

The profile is pinned to one canonical checkpoint/revision or explicit package.

Use for audits, reproducibility, regulated workflows, experiments, or tasks that must remain tied to an exact historical understanding.

### Hybrid

The profile follows current canonical intelligence but may also retain approved specialist supplements, agent-specific episodic memory, research collections or pinned reference packages.

This will likely be the default for durable specialist agents.

## Source / study modes

A profile can restrict or permit learning sources.

### Internal-only

Use only authorized tenant/workspace/project intelligence and registered internal/source systems.

### Public-research

May perform public internet/research study within policy. External research retains source/provenance/freshness metadata and does not silently become tenant canonical truth.

### Hybrid

Combines internal intelligence with permitted external study.

### Explicit custom

Tenant defines exact allowed source classes, domains, repositories, datasets or providers.

## Initialization / Study lifecycle

A specialist can be initialized through a deliberate curriculum:

```text
CREATE / HIRE AGENT
→ ASSIGN ROLE + EXPERTISE PROFILE
→ RESOLVE AUTHORIZED INTELLIGENCE/SOURCES
→ INVENTORY COVERAGE + GAPS
→ STUDY INTERNAL INTELLIGENCE
→ OPTIONAL PUBLIC/EXTERNAL STUDY
→ RECONCILE CONFLICTS + PROVENANCE
→ BUILD SPECIALIST INDEX / MEMORY
→ EVALUATE AGAINST TASK SUITE
→ REPORT COVERAGE / UNCERTAINTY
→ ACTIVATE
→ CONTINUOUSLY REFRESH / RE-STUDY AS NEEDED
```

Initialization should not claim complete mastery merely because ingestion finished. It should report what was studied, coverage, freshness, source quality, conflicts, missing areas and evaluation results.

## External research boundary

Public research may make an agent better informed without automatically changing organization-wide Canonical Intelligence.

Research outputs can become:

- agent-specific specialist reference material;
- candidate intelligence;
- source collections;
- proposed canonical updates;
- reusable study packages.

Promotion to Canonical Intelligence follows normal canonical change-set / approval policy.

## Skills are separate from intelligence

An agent's expertise has at least four independent dimensions:

1. **Intelligence** — what it knows and can retrieve.
2. **Skills / playbooks** — how it performs procedures.
3. **Authority / permissions** — what it is allowed to do.
4. **Experience / continuity** — what it has learned from its own prior work and outcomes.

Assigning sales intelligence to Sarah does not automatically authorize Sarah to send email, change CRM records, quote pricing or close deals. Command/Workforce permissions remain separate.

## Specialist-memory boundary

Agent-specific memory may include:

- prior cases handled;
- owner feedback;
- mistakes and corrections;
- customer/task patterns;
- specialist heuristics;
- evaluation history;
- unresolved hypotheses;
- personal working preferences where appropriate.

This state is not automatically tenant-wide canonical truth. Durable conclusions that should benefit everyone can be proposed for canonical promotion.

## Expertise packages

For portability and reproducibility, Sovereign may expose an **Expertise Package** as a versioned manifest describing:

- scope selectors;
- canonical revision/checkpoint dependencies;
- approved source collections;
- specialist supplements;
- study/evaluation state;
- freshness requirements;
- provenance.

The package should reference canonical/source material rather than duplicate it unnecessarily.

## Agent interaction

A user should be able to interact naturally:

- "Give Bob the shared mailbox naming system."
- "Make Sarah my RICE LABS sales specialist."
- "Lilly can use our sales intelligence plus public research."
- "Restrict Jeremy to production knowledge for RICE LABS only."
- "Pin this audit agent to Canonical Checkpoint 218."
- "What does Sarah know, what is she missing, and when was her expertise last refreshed?"
- "Refresh Sarah against the latest canonical sales changes."
- "Study these three sales leaders and add useful findings to Lilly's specialist knowledge, but don't canonicalize anything without review."

## Evaluation instead of unsupported 'superintelligence' claims

Sovereign can aim to create exceptionally capable specialist agents, but should not claim guaranteed superintelligence or total mastery merely from data volume.

Expertise quality should be demonstrated through:

- coverage metrics;
- freshness;
- provenance quality;
- conflict resolution;
- task benchmarks;
- historical outcome quality;
- correction/regression rate;
- user acceptance;
- comparisons against defined expert baselines where available.

## Example — Bob

Bob is assigned:

- mailbox naming canonical records;
- email/account alias rules;
- Microsoft 365 source documentation and tenant-specific history;
- prior mailbox decisions and owner feedback;
- relevant specialist memory from prior naming cases.

When asked which email to use for a new service, Bob retrieves this expertise by default and can answer according to the user's actual established system rather than generic internet conventions.

## Example — Sarah

Sarah is assigned:

- all tenant-authorized sales canonical intelligence;
- sales history and approved playbooks;
- sales-related Continuity when task-relevant;
- permitted CRM/live sales sources;
- hybrid public research permission;
- specialist sales memory and evaluation history.

Sarah can advise on sales questions and, if separately authorized with tools/actions, execute sales tasks such as research, lead generation, drafting, follow-up or other governed operations.

## V1 principle

**Centralize truth; specialize access and expertise.**

Sovereign should become more knowledgeable over time without forcing every agent to know everything. Specialized agents receive deep, durable, explainable expertise while retaining an authorized route back to broader Sovereign Intelligence when the task requires it.
