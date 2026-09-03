# Sovereign Control Plane Traffic Coordination

Status: V1 foundation

## Purpose

The Control Plane is not only a map of where intelligence, continuity and authorities live. It is also the **traffic coordination layer** for active work across humans, AI agents, models, tools, repositories, databases, environments and other managed resources.

Every participating actor begins substantive operational work by checking in with the Control Plane. The Control Plane returns orientation and current traffic, then records where the actor intends to operate. Actors checkpoint material movement and check out when they leave or finish.

This creates a shared operational picture across otherwise independent AI sessions and providers.

## Mental model

The Control Plane is the **ATC tower, map and traffic board**.

It should answer quickly:

- who is currently working;
- what each actor is working on;
- where each actor is operating or intends to operate;
- whether that activity is read-only, write-capable, deployment, migration or another risk class;
- which branch/worktree/path/environment/resource is involved;
- when the actor last checked in or checkpointed;
- whether another actor is likely to collide with the requested work;
- what the safest route forward is.

The Control Plane coordinates. It does not perform the work itself and does not automatically ration an agent's context appetite.

## Two primary coordination objects

### Traffic Session

A Traffic Session represents an actor's active work session.

Conceptual fields:

- `session_id`;
- tenant/workspace;
- actor identity;
- provider/runtime identity where relevant;
- task/objective;
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
        "actor":"claude",
        "intent":"write",
        "branch":"feature/a",
        "state":"active",
        "last_seen":"..."
      }
    ]
  }
}
```

This lets a second agent see the collision risk before touching the resource.

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

The Control Plane should surface actor, task, claim scope, last checkpoint and recommended coordination action.

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
- handing work to another actor.

A checkpoint may update both Continuity state and the live traffic registry.

Example:

```text
ChatGPT checked in: repo C + repo A planned
→ working repo C
→ checkpoint: repo C complete, PR #123
→ release repo C claim
→ activate repo A claim
→ Control Plane re-evaluates current repo A traffic
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

- active Traffic Sessions and Resource Claims belong in the runtime/Continuity plane;
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

1. **check in** before managed-resource work;
2. **declare intent/resources** before mutation;
3. **inspect current traffic** before proceeding;
4. **checkpoint/heartbeat** during meaningful work;
5. **re-check traffic when changing/activating resources**;
6. **check out/release claims** when leaving a resource;
7. **report artifacts/outcome** on checkout;
8. allow TTL/stale recovery when an actor fails to check out.

Read-only informational questions that do not enter a managed resource may use a lightweight orientation-only session or no resource claim, according to Command policy.

## V1 principle

The goal is **collision awareness before collision prevention**.

V1 should reliably show who is where and warn about likely conflicts. Hard locking should be reserved for clearly unsafe critical sections. As RICE alpha usage generates evidence, Command policies can become more sophisticated about what may run concurrently.