# Project Sovereign Extension System

Status: V1 contract direction

Sovereign extensions are permissioned external products that add workflows, interfaces, automations or integrations without becoming part of the four-module core.

The model is intentionally similar to browser extensions: the platform exposes stable capabilities; an extension declares what it needs; the tenant approves scopes; the runtime enforces those scopes; uninstalling the extension must not corrupt Sovereign core state.

## Extension principles

1. Sovereign must remain useful with no extensions installed.
2. Extensions use public/declared contracts. First-party extensions do not receive hidden privileged APIs.
3. Extensions cannot grant themselves permissions, authority or broader data access.
4. Installing an extension does not make its database or output canonical Sovereign Intelligence.
5. Core objects remain owned by their Sovereign module; extension-specific state belongs to the extension unless explicitly promoted through governed APIs.
6. Uninstall/revocation must stop future access immediately and preserve or remove extension-owned state according to declared policy.
7. Extension events and material writes are auditable.

## Example extension manifest

```json
{
  "manifest_version": 1,
  "id": "rice-lightning.queue",
  "name": "Queue Tracker",
  "publisher": "RICE Lightning",
  "version": "1.0.0",
  "sovereign": {
    "compatibility": ">=1.0.0",
    "requested_scopes": [
      "continuity.tasks.read",
      "continuity.tasks.write",
      "continuity.sessions.read",
      "continuity.checkpoints.read",
      "events.subscribe"
    ],
    "events": [
      "task.created",
      "task.updated",
      "task.completed",
      "session.checkpointed"
    ]
  },
  "ui": {
    "mode": "external_app",
    "launch_url": "https://queue.rice.lightning"
  },
  "privacy": {
    "retains_sovereign_data": false
  }
}
```

The exact schema will be versioned in code; this example establishes the product contract.

## Scope families

V1 scope families should be granular and module-oriented.

Examples:

- `command.integrations.read`
- `intelligence.records.read`
- `intelligence.records.propose`
- `continuity.tasks.read`
- `continuity.tasks.write`
- `continuity.sessions.read`
- `continuity.sessions.write`
- `continuity.ideas.read`
- `continuity.ideas.write`
- `control_plane.context.request`
- `control_plane.route.request`
- `events.subscribe`

Canonical promotion/write scopes should be exceptional and governed separately from ordinary Continuity writes.

## Installation flow

```text
Discover or provide extension
→ inspect publisher + manifest
→ validate Sovereign compatibility
→ show requested permissions and data behavior
→ tenant approves/denies scopes through Command
→ create scoped extension identity/credentials
→ register event subscriptions/UI contribution
→ run
→ audit usage
→ permissions can be reduced/revoked at any time
```

## Runtime models

Supported extension models may include:

1. **External app** — independently hosted product using Sovereign APIs/events.
2. **Embedded UI extension** — contributes navigation/panels/components to Sovereign Console within a sandboxed/declared UI contract.
3. **Service integration** — background service, connector or automation with no user-facing UI.
4. **Agent/MCP extension** — exposes or consumes AI tools/resources through the Gateway.

V1 should prioritize external apps and service integrations before supporting arbitrary in-process code execution.

## First alpha extensions

### RICE Lightning — Queue Tracker

Purpose: track open/closed chats, tasks and workflows and provide a focused visual execution queue.

Uses Sovereign Continuity primitives but remains independently developed and hosted by RICE Lightning.

### RICE Lightning — Ideas

Purpose: richer idea capture, exploration, lifecycle and promotion experience over Sovereign Continuity Idea primitives.

### Workforce

Separate product/add-on for persistent AI personnel. It may receive scoped Intelligence, Continuity and Control Plane access but must maintain its own domain state and authority boundaries.

## Marketplace later

A public extension marketplace is not required for V1. V1 only needs the architectural contract, private/manual installation, permissions, credentials, event subscriptions and revocation.

Future marketplace capabilities may add publisher verification, signing, reviews, automated security checks, billing, version rollout and enterprise allowlists.
