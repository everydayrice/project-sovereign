# Project Sovereign Naming System

Status: V1 foundation

Project Sovereign is the product-development codename and repository name. The eventual commercial platform name is intentionally separate and may change without changing the architecture.

## Product hierarchy

There is one platform. It has four first-class core modules:

1. **COMMAND** — governance, administration, policy, permissions, authority, personalization, module configuration, integrations, audit and system controls.
2. **INTELLIGENCE** — durable canonical knowledge, memory, relationships, provenance, source registry, decisions and approved long-lived state.
3. **CONTROL PLANE** — the runtime traffic director. It resolves what matters now, which authority/source/model/agent/tool should be used, how much context should be loaded, and what should be excluded.
4. **CONTINUITY** — durable non-canonical working state for unfinished cognition and activity across sessions, devices and AI providers.

These four names are first-class product modules. New nouns should not be promoted to peer modules without a durable responsibility that cannot cleanly belong to one of these four.

## Protocol is not a module

**PROTOCOL** is the platform contract and lifecycle specification. It defines invariants, object semantics, module boundaries, promotion rules, provenance requirements, authorization boundaries and how compatible agents/systems participate.

Protocol is intentionally different from Command:

- Protocol defines what a valid Sovereign-compatible system must do.
- Command lets a tenant/user configure how their own deployment should behave inside those rules.

Example: the platform protocol can require provenance for canonical intelligence. A tenant's Command configuration can define which sources are trusted, which data classes may be persisted, and which actions require approval.

## User personalization convention

A tenant may brand or personalize its Command instance without renaming the platform architecture.

Examples:

- COMMAND → **RICE COMMAND** for the RICE alpha tenant.
- COMMAND → **ACME COMMAND** for an ACME tenant.

This is presentation/configuration, not a fork of the underlying Command module or Protocol.

INTELLIGENCE, CONTROL PLANE and CONTINUITY remain stable architectural module names even if a product UI later gives them friendlier labels.

## Interfaces are not modules

The following are interfaces/surfaces over the platform, not separate truth systems:

- **Gateway** — machine interface through HTTP/JSON, MCP, SDKs, CLI and adapters.
- **Console / Command Center** — human-facing application shell and administration UI.
- **Search / Ask** — intelligence retrieval experiences.
- **Extension Host** — installation/permission/runtime boundary for first-party and third-party extensions.

## Primitives are not modules

The following are core object types used by modules:

- Canonical Record
- Source
- Relationship
- Decision
- Policy
- Context Packet
- Candidate Memory
- Task Capsule
- Session Capsule
- Checkpoint
- Idea
- Agent / Model / Tool Endpoint

Object names should not become product modules simply because they receive their own UI or are consumed by an extension.

## Core views are intentionally minimal

Sovereign core may expose basic native inspection/administration views for its primitives, but specialized productivity products are not bundled into the core merely because they use Sovereign data.

Examples:

- basic Session Capsule inspector — core Continuity administration;
- basic Task Capsule inspector — core Continuity administration;
- full visual Queue Tracker — extension/product;
- full Idea Tracker — extension/product.

## Extensions and plugins

Extensions integrate through Protocol/Gateway/Extension contracts and may have their own repositories, runtimes, brands and product lifecycles.

Examples:

- **RICE Lightning Queue Tracker** — external extension that tracks open/closed tasks, chats and workflows using authorized Continuity/Task Capsule interfaces.
- **RICE Lightning Ideas** — external idea-tracking extension using authorized Continuity/Idea interfaces.
- **WORKFORCE** — persistent AI personnel/organizational layer. Separate add-on/product; interoperates with Sovereign but is not required for Sovereign core.
- **COMPUTE** — optional persistent execution/workspace layer for agents and humans. Not required for V1 core.
- Future connectors, analytics products, agent runtimes and specialized tools follow the same rule.

An extension may add screens, workflows, automations and derived state, but it must not silently create a competing canonical source of Sovereign Intelligence or bypass Command permissions.

## Cross-cutting capabilities are not core modules

- **EFFICIENCY** — optimization across Intelligence, Control Plane and Continuity: context reduction, caching, delta delivery, deduplication, model/provider routing, latency and cost telemetry.
- **SECURITY** — identity, tenant isolation, authentication, authorization, encryption, audit and privacy enforcement across all modules.
- **SYNC** — reconciliation/promotion mechanics between working state, canonical intelligence and external authorities.
- **OBSERVABILITY** — health, tracing, usage and integrity diagnostics.

They may have services and screens, but remain cross-cutting capabilities.

## Commercial product name

`EVRSTATE` was explored as a rough example but is rejected for this project because an existing `everstate.ai` product already operates in the AI state/MCP/session-sync category.

Until a distinct name is selected, use **Project Sovereign** for the project/repository and neutral internal module names for the architecture.
