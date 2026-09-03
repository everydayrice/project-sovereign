# Project Sovereign V1 Architecture

Project Sovereign is a vendor-neutral persistent AI intelligence platform. It gives a person or organization a durable, portable intelligence and continuity layer that survives individual chats, models, agents, providers and devices.

The platform is deliberately built independently. RICE is the first tenant and alpha tester, not the architectural root.

## North star

A user should be able to replace an AI provider tomorrow without losing the intelligence, decisions, working continuity, policies or source relationships that make their AI useful today.

A fresh authorized agent should be able to:

1. understand what it is working on;
2. quickly learn where relevant intelligence, continuity and authoritative sources live;
3. choose its own context appetite and retrieve as much or as little authorized context as the task requires;
4. know where truth comes from and what is authoritative;
5. resume unfinished work without reconstructing it from chat history;
6. preserve material durable changes without turning every conversation into canonical truth;
7. operate within tenant-defined policy, privacy and permissions;
8. expose its routing/context inputs and state transitions sufficiently for audit and debugging.

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
- extension installation and permissions;
- privacy and retention settings;
- explicit resource/budget ceilings where the tenant chooses to impose them;
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

The orientation and traffic-control module.

CONTROL PLANE is intentionally lightweight. Its primary job is to quickly orient an AI model, agent, bot, human or extension to the environment: what domain it is in, where relevant things live, which sources are authoritative, what continuity exists, what is current/volatile, and which paths are available next.

It should behave more like an ATC/routing brief than an automatic context rationer.

Responsibilities include:

- tenant/actor/task/scope orientation;
- relevant entity/project/domain identification;
- authority and source map;
- privacy/permission/policy boundaries;
- freshness/volatility markers;
- pointers to relevant Intelligence areas;
- pointers to relevant Continuity/session/task state;
- pointers to live systems and extensions;
- agent/model/tool capability map and routing options;
- compact orientation/context packet;
- context revision and route trace;
- safe fallback/escalation information.

CONTROL PLANE does **not** decide the agent's context appetite in V1.

After orientation, the authorized agent chooses whether to retrieve narrowly, broadly or deeply from Intelligence, Continuity and registered sources. The platform may expose convenience appetite modes or recommendations, but these are agent/user choices rather than hidden automatic throttles.

The only mandatory limits are hard boundaries enforced by Command and platform security, such as:

- tenant isolation;
- permissions and scopes;
- privacy/data-class restrictions;
- source-specific access controls;
- explicit user/admin resource or spend ceilings;
- hard technical limits needed to protect service reliability.

CONTROL PLANE may observe context/retrieval behavior and collect telemetry. Later versions may recommend more efficient retrieval based on real outcome data, but V1 must not sacrifice capability by assuming in advance that the smallest context is best.

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

Sovereign core provides primitive APIs and basic administrative inspection for Continuity objects. Full productivity experiences such as Queue Tracker and Idea Tracker belong outside the core and install through the extension system.

## Platform Protocol

Protocol is the compatibility and lifecycle specification, not a fifth module.

The V1 lifecycle is:

```text
IDENTIFY TENANT + ACTOR
→ ORIENT TASK/SCOPE THROUGH CONTROL PLANE
→ RESOLVE POLICY + AUTHORITY MAP
→ RETURN COMPACT TERRAIN/ROUTING BRIEF
→ AGENT CHOOSES CONTEXT APPETITE
→ RETRIEVE AUTHORIZED INTELLIGENCE + CONTINUITY + LIVE SOURCES AS NEEDED
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
- consequential writes are attributable and auditable;
- extensions receive only explicitly granted scopes and cannot bypass Command policy;
- Control Plane orientation does not silently restrict an authorized agent to a platform-chosen minimum context set.

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

One human-facing platform shell exposes only core platform administration and inspection:

- Home
- Command
- Intelligence
- Control Plane
- Continuity
- Extensions
- Integrations
- Audit/Health

Specialized products such as Queue Tracker and Idea Tracker may contribute extension views to the shell or run as separate applications, but remain outside Sovereign core.

### Extension Host

The extension host is the permissioned integration boundary for installable products, similar in spirit to browser extensions.

An extension declares:

- identity and publisher;
- version and compatibility range;
- requested Sovereign scopes;
- module/object types it reads or writes;
- event subscriptions;
- UI contributions, if any;
- external endpoints/runtime requirements;
- data retention/privacy behavior;
- uninstall/revocation behavior.

Command presents requested permissions to the tenant and enforces the granted scopes server-side.

An extension may be:

- hosted externally and connected by API/webhook/MCP;
- installed as a UI/plugin package;
- a separately deployed product with Sovereign credentials;
- first-party, partner, private or third-party.

Extensions must not become hidden canonical authorities merely because they are installed.

## Cross-cutting capabilities

### Efficiency

Efficiency is a cross-cutting capability, primarily implemented as telemetry, caching and optional recommendations rather than hidden context starvation.

V1 may provide:

- deterministic context caching;
- known-context/delta delivery when the requesting agent opts in;
- deduplication;
- retrieval telemetry;
- model/provider/reasoning route recommendations;
- latency/retry telemetry;
- tokens/context/calls/cost measurements;
- suggested appetite/routing improvements based on observed outcomes.

V1 should **observe before it optimizes**. It must not automatically reduce context merely to minimize token count if that can degrade task quality.

It does not own business truth.

### Sync

Sync reconciles state across Continuity, Intelligence and external authorities. It handles proposals, conflicts, supersession, verified writes and index refreshes.

### Security

Security includes tenant isolation, identity, authentication, authorization, encryption, secret boundaries, audit and privacy enforcement. These controls must be enforced in application/runtime code, not left to model judgment.

## Extensions

### RICE Lightning Queue Tracker

The first planned alpha extension is a Queue Tracker supplied by RICE Lightning. It may track open/closed chats, tasks and workflows by consuming authorized Task Capsule, Session Capsule and checkpoint interfaces. It is not part of Sovereign core and does not own canonical intelligence.

### RICE Lightning Ideas

Idea tracking can follow the same model: an external RICE Lightning product using Continuity Idea objects and promotion APIs rather than becoming a Sovereign module.

### Workforce

Workforce is a separate interoperable product/add-on. It represents durable AI personnel, teams, roles, authority, evaluations and work identity. Sovereign core does not require Workforce.

### Compute

Compute is an optional execution extension providing persistent isolated workspaces for code, files, services and agent runtimes. V1 Sovereign can route to existing external execution surfaces without owning compute infrastructure.

## First tenant: RICE

RICE becomes tenant `rice` in the alpha deployment.

The tenant may present COMMAND as **RICE COMMAND** while still using the same underlying Command module and common Protocol.

Existing `everydayrice/rice-command` is treated as a migration/source authority for RICE's current canonical intelligence and continuity history. Sovereign does not silently redefine repository history. V1 migration should import/reconcile RICE records with preserved provenance and retain a rollback/export path.

RICE Lightning is an external product ecosystem from Sovereign's perspective, even when both are controlled by the same owner during alpha. This is deliberate: it tests the extension boundary against a real independent client instead of giving first-party code privileged hidden access.

## Independence rule

No V1 schema may require a RICE-specific company, repository, naming convention, business hierarchy or AI provider. RICE-specific defaults live in tenant configuration or migration adapters.
