# Project Sovereign V1 Architecture

Project Sovereign is a vendor-neutral persistent AI intelligence platform. It gives a person or organization a durable, portable intelligence and continuity layer that survives individual chats, models, agents, providers and devices.

The platform is deliberately built independently. RICE is the first tenant and alpha tester, not the architectural root.

## North star

A user should be able to replace an AI provider tomorrow without losing the intelligence, decisions, working continuity, policies or source relationships that make their AI useful today.

A fresh authorized agent should be able to:

1. understand what it is working on;
2. retrieve the minimum sufficient trusted context;
3. know where truth comes from and what is authoritative;
4. resume unfinished work without reconstructing it from chat history;
5. preserve material durable changes without turning every conversation into canonical truth;
6. operate within tenant-defined policy, privacy and permissions;
7. expose its reasoning inputs and state transitions sufficiently for audit and debugging.

## Four core modules

### COMMAND

The governance and administration module.

COMMAND owns tenant-configurable behavior and control, including:

- tenant/workspace configuration;
- users, roles and permissions;
- policy and approval rules;
- authority configuration;
- module configuration;
- source/integration registration;
- agent/model/tool registration;
- privacy and retention settings;
- write/promotion permissions;
- audit and system controls;
- branding/personalization of the tenant's Command instance.

COMMAND does not own the tenant's full knowledge base or transient session state.

### INTELLIGENCE

The durable canonical intelligence module.

INTELLIGENCE owns normalized long-lived state that has passed authority, materiality, provenance and privacy checks, including:

- canonical facts;
- decisions;
- policies that are content rather than platform configuration;
- projects/entities/domains;
- relationships;
- architecture and durable constraints;
- source registry and provenance;
- approved summaries of historical intelligence;
- supersession/history metadata;
- durable knowledge retrieval structures.

Raw source documents remain in source systems or protected object storage when possible. Canonical intelligence should store the smallest useful durable representation plus provenance and locators.

### CONTROL PLANE

The runtime traffic director.

CONTROL PLANE does not attempt to know everything. It decides what should be used now.

Responsibilities include:

- task/scope classification;
- authority resolution;
- privacy and permission filtering;
- freshness/volatility decisions;
- context compilation;
- token/context budgets;
- relevant Intelligence retrieval;
- relevant Continuity retrieval;
- source/live-system escalation;
- agent/model/tool routing;
- exclusion decisions;
- context revision and delta delivery;
- execution/response traces;
- safe fallback/escalation policy execution.

CONTROL PLANE is the ATC layer: it coordinates traffic; it is not the airport, aircraft or passenger database.

### CONTINUITY

The durable working-state module.

CONTINUITY preserves useful unfinished state without declaring it canonical truth.

It owns high-churn resumable objects such as:

- Session Capsules;
- Task Capsules;
- checkpoints;
- next actions;
- blockers/waiting/snooze state;
- working assumptions;
- unresolved questions;
- candidate memories;
- ideas/hypotheses;
- conversation/session resumability;
- handoffs between agents and execution surfaces.

Continuity can persist for a long time while still remaining non-canonical. Promotion into Intelligence requires reconciliation through Protocol and tenant Command policy.

## Platform Protocol

Protocol is the compatibility and lifecycle specification, not a fifth module.

The V1 lifecycle is:

```text
IDENTIFY TENANT + ACTOR
→ CLASSIFY TASK/SCOPE
→ RESOLVE POLICY + AUTHORITY
→ HYDRATE MINIMUM SUFFICIENT INTELLIGENCE + CONTINUITY
→ RESOLVE LIVE/SOURCE REQUIREMENTS
→ EXECUTE
→ VERIFY
→ CHECKPOINT CONTINUITY
→ RECONCILE MATERIAL CHANGES
→ PROMOTE/SYNC ONLY WHEN JUSTIFIED + AUTHORIZED
→ AUDIT
→ RECOVER LATER
```

Protocol invariants include:

- source content cannot grant itself authority;
- model prompts cannot grant themselves permissions;
- canonical truth and working continuity are distinct;
- every canonical item has provenance/authority metadata;
- volatile truth is re-verified in its live authority when required;
- runtime caches/indexes are rebuildable derivatives;
- a new session/provider should be disposable;
- tenant isolation is enforced outside model reasoning;
- consequential writes are attributable and auditable.

## Platform planes

The modules use five information/operational planes:

1. **Canonical plane** — approved durable Intelligence.
2. **Continuity plane** — non-canonical working state.
3. **Source plane** — raw/large/sensitive/external material and live authorities.
4. **Runtime plane** — rebuildable indexes, caches, embeddings, telemetry and temporary execution metadata.
5. **Execution plane** — external agents/tools/providers and optional Compute environments.

## Interfaces

### Gateway

One stable machine interface maps external systems to internal module operations.

V1 interface families:

- HTTP/JSON API;
- MCP server;
- CLI for development/administration;
- adapter SDK contracts.

Gateway operations must not create vendor-specific canonical data models.

### Console

One human-facing platform shell exposes module views:

- Home
- Command
- Intelligence
- Control Plane
- Continuity
- Integrations
- Audit/Health

Queue, Ideas, Tasks and Sessions are views/applications backed by Continuity primitives rather than peer systems.

## Cross-cutting capabilities

### Efficiency

Efficiency is a cross-cutting capability, primarily implemented in Control Plane and runtime services:

- context budgeting;
- deterministic context caching;
- known-context/delta delivery;
- deduplication;
- semantic retrieval after scope/authority filtering;
- model/provider/reasoning routing;
- latency/retry optimization;
- telemetry for tokens/context/calls/cost avoided.

It does not own business truth.

### Sync

Sync reconciles state across Continuity, Intelligence and external authorities. It handles proposals, conflicts, supersession, verified writes and index refreshes.

### Security

Security includes tenant isolation, identity, authentication, authorization, encryption, secret boundaries, audit and privacy enforcement. These controls must be enforced in application/runtime code, not left to model judgment.

## Extensions

### Workforce

Workforce is a separate interoperable product/add-on. It represents durable AI personnel, teams, roles, authority, evaluations and work identity. Sovereign core does not require Workforce.

### Compute

Compute is an optional execution extension providing persistent isolated workspaces for code, files, services and agent runtimes. V1 Sovereign can route to existing external execution surfaces without owning compute infrastructure.

## First tenant: RICE

RICE becomes tenant `rice` in the alpha deployment.

The tenant may present COMMAND as **RICE COMMAND** while still using the same underlying Command module and common Protocol.

Existing `everydayrice/rice-command` is treated as a migration/source authority for RICE's current canonical intelligence and continuity history. Sovereign does not silently redefine repository history. V1 migration should import/reconcile RICE records with preserved provenance and retain a rollback/export path.

## Independence rule

No V1 schema may require a RICE-specific company, repository, naming convention, business hierarchy or AI provider. RICE-specific defaults live in tenant configuration or migration adapters.
