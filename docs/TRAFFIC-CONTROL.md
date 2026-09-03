# Sovereign Control Plane Traffic Coordination

Status: V1 foundation

## Purpose

The Control Plane is not only a map of where intelligence, continuity and authorities live. It is also the **traffic coordination layer** for active work across humans, AI agents, models, tools, chats, repositories, databases, environments and other managed resources.

Every participating actor begins substantive operational work by checking in with the Control Plane. The Control Plane returns orientation and current traffic, then records where the actor intends to operate. Actors checkpoint material movement and check out when they leave or finish.

This creates a shared operational picture across otherwise independent AI sessions and providers.

## Mental model

The Control Plane is the **ATC tower, map and traffic board**.

It should answer quickly:

- who is currently working;
- which exact chat/thread/run/workspace is doing the work;
- what each actor is working on;
- where each actor is operating or intends to operate;
- whether that activity is read-only, write-capable, deployment, migration or another risk class;
- which branch/worktree/path/environment/resource is involved;
- when the actor last checked in or checkpointed;
- whether another actor is likely to collide with the requested work;
- what the safest route forward is.

The Control Plane coordinates. It does not perform the work itself and does not automatically ration an agent's context appetite.

## Identity hierarchy

Provider identity is not actor identity.

Sovereign should distinguish at least these layers:

1. **Tenant** — the Sovereign customer/workspace, for example `rice`.
2. **Principal** — the human/service ultimately responsible for the activity, for example John.
3. **Provider** — OpenAI, Anthropic, Google, xAI, DeepSeek, local runtime, etc.
4. **Product/surface** — ChatGPT, Work, Codex, Claude, Gemini, Cursor, API agent, extension, etc.
5. **Agent Profile** — optional reusable role/persona/capability identity, for example `ChatGPT general`, `Codex coding`, `Steve Director of Sales`.
6. **Actor Instance** — one concrete independently operating chat/thread/run/task/workspace instance.
7. **Traffic Session** — the active operational session for an Actor Instance doing a particular objective.
8. **Resource Claims** — what that Traffic Session is currently using or intends to use.

### Same provider, many actors

Six simultaneous ChatGPT conversations are **six Actor Instances**, not one actor.

They may share:

- tenant;
- principal;
- provider;
- product surface;
- model family;
- account/organization;
- even the same Agent Profile.

But each chat has independent conversation state, may be stale relative to the others, may pursue a different task and may claim different or overlapping resources. Therefore each must have its own actor/session identity in Control Plane.

Example:

```text
principal: John
provider: OpenAI
surface: ChatGPT

actor_instance: chatgpt-chat-01 → Repo A
actor_instance: chatgpt-chat-02 → Repo B
actor_instance: chatgpt-chat-03 → Repo A
actor_instance: chatgpt-chat-04 → research only
actor_instance: chatgpt-chat-05 → waiting
actor_instance: chatgpt-chat-06 → Repo C
```

Control Plane can then warn `chatgpt-chat-03` that `chatgpt-chat-01` is already writing Repo A even though both are "ChatGPT."

### Manager vs worker is a relationship, not identity

The system should not automatically model one ChatGPT account as one manager plus six workers.

By default, simultaneous chats are sibling Actor Instances under the same principal.

If one session is intentionally coordinating others, Sovereign can record explicit relationships such as:

- `coordinates`;
- `delegated_to`;
- `parent_session_id`;
- `child_session_id`;
- `handoff_from`;
- `handoff_to`.

Example:

```text
John
└── ChatGPT chat A (coordinator)
    ├── Codex task 1 (implementation)
    ├── Codex task 2 (tests)
    └── ChatGPT chat B (research)
```

The coordinator role is explicit and can change. It is not inferred from provider/account identity.

## Session identity when native chat IDs are available or unavailable

Sovereign should use the strongest stable external session/thread/run identifier available from an adapter, but must not depend on every AI vendor exposing one.

The check-in contract therefore supports both:

- `external_session_id` — native chat/thread/run/task/workspace identifier when exposed by the client/provider;
- `sovereign_actor_instance_id` — Sovereign-issued stable actor instance identifier;
- `traffic_session_id` — Sovereign-issued identifier for the current operational activity.

If a provider does not expose a usable native conversation ID, the Sovereign adapter/client creates or receives a Sovereign Actor Instance ID on first check-in and carries that identity for subsequent check-ins/tool calls from that chat/run.

This means coordination does not rely on being able to tell providers apart. It works when every participant is ChatGPT, every participant is Codex, or all participants use exactly the same underlying model.

## ChatGPT / Work / Codex bridge

A first-class Sovereign V1 use case is continuity and traffic coordination across OpenAI surfaces used together.

The mental model is:

```text
John / tenant RICE
        │
        ├── ChatGPT chat A
        │      └── may plan / coordinate / research
        │
        ├── ChatGPT chat B
        │      └── independent work
        │
        ├── Work workspace/session
        │      └── persistent artifact/browser work
        │
        └── Codex task/run
               └── repository execution
```

Each surface has separate Actor Instances and Traffic Sessions, but they can share:

- the same Task Capsule/objective;
- Continuity checkpoints;
- Resource Claims;
- handoff lineage;
- Intelligence pointers;
- artifacts/commits/PRs;
- live traffic warnings.

A ChatGPT session handing implementation to Codex should not require the user to manually paste a full state recap. Sovereign should let the Codex Actor Instance check in, see the parent task/session/checkpoint, see current repo traffic, retrieve its chosen context and claim the relevant resource.

Likewise, when Codex finishes or checkpoints, ChatGPT/Work sessions should be able to see the updated state on their next Control Plane check-in rather than relying on stale conversation memory.

This bridge is one of the primary V1 value propositions, not a secondary integration detail.

## Two primary coordination objects

### Traffic Session

A Traffic Session represents an actor's active work session.

Conceptual fields:

- `session_id`;
- tenant/workspace;
- principal identity;
- provider identity;
- product/surface identity;
- agent profile when applicable;
- actor instance identity;
- native external session/thread/run ID when available;
- task/objective;
- parent/child/handoff relationships when present;
- parent Task/Session Capsule when present;
- state: `planned`, `active`, `waiting`, `blocked`, `completed`, `cancelled`, `stale`;
- checked-in time;
- last heartbeat/checkpoint;
- checkout time;
- current resource claims;
- current next action;
- outcome/artifact pointers on checkout.

### Resource Claim

A Resource Claim declares that a Traffic Session is using or intends to use a resource.

Conceptual fields:

- `claim_id`;
- `session_id`;
- resource type and canonical locator;
- intent: `observe`, `read`, `plan`, `write`, `merge`, `deploy`, `migrate`, `admin`, `destructive` or extension-defined intent;
- scope within the resource;
- branch/worktree/environment/schema/path when applicable;
- coordination mode: `shared`, `caution`, `exclusive`;
- state: `planned`, `active`, `released`, `stale`;
- created/activated/last-seen/released times;
- related revision/commit/PR/change-set identifiers when known.

A claim is coordination metadata, not legal ownership and not automatically a hard lock.

## Check-in lifecycle

```text
ACTOR STARTS SUBSTANTIVE OPERATIONAL WORK
→ CONTROL PLANE CHECK-IN
→ identify/create Actor Instance
→ create/refresh Traffic Session
→ request orientation + target resources
→ Control Plane returns map + active traffic + conflicts/warnings
→ actor declares intended Resource Claims
→ policy evaluates coexistence/warning/approval/exclusivity
→ actor proceeds
→ periodic heartbeat/checkpoint/update
→ claims change as actor moves between resources
→ actor checks out/relinquishes claims
→ outcome/artifacts/checkpoints are recorded
```

The first Control Plane interaction should be cheap. It should not require loading full intelligence merely to register presence.

## Traffic-aware orientation

Every orientation response should include relevant live traffic for requested resources.

Example:

```json
{
  "orientation": {
    "resources": [
      {"id":"repo:A","location":"..."},
      {"id":"repo:C","location":"..."}
    ],
    "traffic": [
      {
        "resource":"repo:A",
        "actor_instance":"chatgpt-chat-01",
        "provider":"openai",
        "surface":"chatgpt",
        "intent":"write",
        "branch":"feature/a",
        "state":"active",
        "last_seen":"..."
      }
    ]
  }
}
```

This lets a second agent see the collision risk before touching the resource, even when the second agent is another chat from the same provider/account.

## Collision policy

The Control Plane should not treat all simultaneous activity as a conflict.

### Normally safe / informational

- read + read;
- observe + any non-sensitive activity;
- separate repositories;
- separate branches/worktrees with no known overlapping production mutation;
- different database schemas/resources where policy declares coexistence safe.

### Caution / warning

- read while another actor is actively rewriting the same area and freshness matters;
- write + write in the same repository on separate branches with likely overlapping files;
- merge work while another branch is rapidly changing the same base;
- two actors modifying shared generated artifacts, lockfiles, migrations or global configuration.

The Control Plane should surface actor instance, surface/provider, task, claim scope, last checkpoint and recommended coordination action.

### Exclusive or approval-gated

Command policy may require exclusivity or explicit approval for operations such as:

- direct writes to the same branch/worktree;
- production deployments to the same environment;
- database/schema migrations against the same target;
- destructive/admin actions;
- secrets/identity configuration changes;
- other tenant-defined critical sections.

The policy must be configurable. Control Plane detects and coordinates the traffic; Command defines what requires warning, approval or denial.

## Leases, heartbeats and stale sessions

Check-in cannot depend on perfect agent behavior.

Resource Claims therefore behave like renewable coordination leases:

- check-in creates a lease;
- heartbeats/checkpoints refresh it;
- checkout releases it immediately;
- if the actor disappears, the lease eventually expires according to Command policy;
- an expired session becomes `stale`, not `completed`;
- stale claims remain visible in history and may require confirmation before risky overlapping work.

This prevents a crashed model, closed browser or abandoned agent from permanently blocking resources.

## Checkpoints

An actor should checkpoint when something material changes, including:

- moving from one resource to another;
- changing from read/planning to write/deploy/migrate intent;
- switching branch/worktree/environment;
- creating a commit/PR/change set;
- becoming blocked/waiting;
- reaching a meaningful intermediate state;
- handing work to another actor/surface.

A checkpoint may update both Continuity state and the live traffic registry.

Example:

```text
ChatGPT chat A checked in: repo C + repo A planned
→ working repo C
→ checkpoint: repo C complete, PR #123
→ release repo C claim
→ activate repo A claim
→ Control Plane re-evaluates current repo A traffic
→ sees ChatGPT chat B or Codex task already active
→ proceed/warn/approve according to current conditions
```

Claims should be re-evaluated when they become active because traffic may have changed since initial planning.

## Checkout

Checkout should record at minimum:

- released resources;
- result/status;
- material artifacts such as commit/PR/deployment/change-set IDs;
- unresolved blockers or follow-up;
- next action/handoff when work continues elsewhere.

Checkout closes traffic, not necessarily the underlying Task Capsule. An actor can leave a resource while the broader task remains active.

## Storage boundary

Traffic is high-churn operational state.

- active Actor Instances, Traffic Sessions and Resource Claims belong in the runtime/Continuity plane;
- material resumable checkpoints belong in Continuity;
- audit events may be retained according to Command policy;
- durable conclusions/decisions discovered during work may later be promoted into Intelligence;
- ordinary check-in noise does not become canonical Intelligence.

## Resource model

V1 should support a generic resource locator rather than GitHub-only locking.

Examples:

- repository;
- branch/worktree;
- file/path or path set;
- pull request;
- database/project/schema;
- deployment environment;
- Cloudflare Worker or service;
- document/design;
- campaign/account;
- external SaaS object;
- extension-defined resource.

This lets the same coordination model eventually cover coding agents, research agents, marketing operators, database agents and human collaborators.

## Protocol requirement

For Sovereign-aware substantive operational work, Protocol V1 should require:

1. **identify/create the exact Actor Instance** rather than collapsing sessions by provider;
2. **check in** before managed-resource work;
3. **declare intent/resources** before mutation;
4. **inspect current traffic** before proceeding;
5. **checkpoint/heartbeat** during meaningful work;
6. **re-check traffic when changing/activating resources**;
7. **check out/release claims** when leaving a resource;
8. **report artifacts/outcome** on checkout;
9. **preserve parent/child/handoff relationships** between ChatGPT, Work, Codex and other cooperating surfaces where applicable;
10. allow TTL/stale recovery when an actor fails to check out.

Read-only informational questions that do not enter a managed resource may use a lightweight orientation-only session or no resource claim, according to Command policy.

## V1 principle

The goal is **collision awareness before collision prevention** and **session-level visibility before provider-level labeling**.

V1 should reliably distinguish simultaneous chats/runs from the same AI provider, show who is where and warn about likely conflicts. Hard locking should be reserved for clearly unsafe critical sections. As RICE alpha usage generates evidence, Command policies can become more sophisticated about what may run concurrently.