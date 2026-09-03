# Sovereign Control Plane

Status: V1 foundation

## Mental model

The Control Plane is the **ATC tower, map and traffic board**, not the pilot's brain and not the baggage allowance.

Its job is to tell an authorized agent quickly:

- where it is;
- what it is working on;
- what entities/projects/domains are relevant;
- where the important Intelligence lives;
- what Continuity exists;
- which source/live system is authoritative for what;
- what is stale or volatile;
- what it has permission to access;
- what agents/models/tools/extensions are available;
- which routes it can take next;
- **who else is currently operating in the same resources or intends to do so**;
- **whether the requested work is likely to collide with active work**.

Then the agent decides how much context it wants and, for operational work, declares where it intends to operate.

## Two jobs: orientation and traffic coordination

Control Plane V1 has two primary responsibilities:

1. **Orientation/routing** — provide a fast map of scope, authorities, locations, Continuity, live systems, permissions and available routes.
2. **Traffic coordination** — maintain the live operational picture of who is working where, with what intent, and whether concurrent work is safe, cautionary or approval-gated.

Traffic coordination is defined in [`TRAFFIC-CONTROL.md`](TRAFFIC-CONTROL.md).

## V1 orientation packet

A Control Plane orientation response should be compact and primarily consist of pointers/metadata rather than the complete underlying intelligence.

Conceptual shape:

```json
{
  "tenant": "rice",
  "task": "Rebuild RICE LABS sales strategy",
  "orientation": {
    "entities": ["RICE LABS"],
    "domains": ["sales", "brand", "operations"],
    "authorities": [
      {"topic":"company state","source":"sovereign:intelligence/project.rice-labs"},
      {"topic":"sales program","source":"repo:ricelabs-sales"},
      {"topic":"live pipeline","source":"crm:...","freshness":"live"}
    ],
    "continuity": [
      {"type":"task_capsule","id":"...","state":"active"}
    ],
    "traffic": [
      {"resource":"repo:ricelabs-sales","actor":"claude","intent":"write","state":"active","last_seen":"..."}
    ],
    "available_routes": [
      "intelligence.search",
      "intelligence.get",
      "continuity.resume",
      "source.resolve",
      "live.verify",
      "traffic.claim",
      "traffic.checkpoint",
      "traffic.release"
    ]
  },
  "permissions": ["..."],
  "revision": "..."
}
```

This is orientation, not the final context payload.

## Agent-directed context appetite

After orientation, an agent may choose any authorized retrieval strategy appropriate to its own capabilities and task:

- request one record;
- request a domain bundle;
- search broadly;
- retrieve an entire project context;
- retrieve deep history/provenance;
- resume relevant Continuity;
- verify current live state;
- make several retrieval passes;
- use an optional convenience appetite mode.

Sovereign should not assume that fewer tokens always produce better outcomes.

## Optional appetite hints

For convenience, Gateway may expose non-binding request hints such as:

- `lean`
- `standard`
- `broad`
- `deep`
- `custom`

These are chosen by the requesting agent/user or explicitly configured in Command. They are not hidden automatic policy in V1.

An advanced agent can ignore those labels and issue direct retrieval operations.

## Traffic check-in / check-out

For Sovereign-aware substantive operational work against managed resources, the first operational step is a Control Plane check-in.

The Control Plane should:

- create or resume the actor's Traffic Session;
- return current traffic relevant to the requested resources;
- record planned/active Resource Claims with intent and scope;
- warn about likely conflicts before mutation;
- require approval or exclusivity only where Command policy requires it;
- receive heartbeats/checkpoints while work continues;
- re-evaluate traffic when an actor activates or changes resources;
- release claims on checkout;
- mark abandoned leases stale if an actor disappears without checking out.

Reads and independent branches may coexist. Direct same-branch writes, production deployments, schema migrations and other critical sections can be stronger-coordination cases.

Control Plane tracks traffic; **Command defines the collision policy**.

## What Control Plane still enforces

Agent-directed appetite does not mean unrestricted access.

Control Plane/Command/Security still enforce:

- tenant boundaries;
- identity and scopes;
- privacy/data-class rules;
- source permissions;
- extension permissions;
- explicit tenant resource/spend ceilings;
- technical anti-abuse/service reliability limits;
- live-authority requirements where stale state could be materially wrong;
- configured traffic coordination / exclusivity policies for managed resources.

These are governance/security/coordination constraints, not AI-context optimization.

## Efficiency learning loop

V1 records evidence instead of automatically minimizing.

For each meaningful request, capture where feasible:

- orientation packet size;
- context subsequently requested;
- records/sources retrieved;
- context ultimately referenced/used where observable;
- repeat retrievals;
- cache reuse;
- model/provider/effort;
- latency;
- retries/escalations;
- corrections/rework;
- outcome/user acceptance signals;
- estimated cost;
- traffic collisions/warnings;
- whether warnings prevented conflicting work;
- stale/abandoned traffic sessions;
- concurrent work that completed safely.

Later versions can use this data to recommend better defaults per task/model/agent/tenant and better collision policies by resource type.

A future Command setting may allow policy-bounded automatic appetite optimization, but it must be opt-in/configurable and reversible.

## Storage boundary

Active traffic is high-churn operational state, not canonical Intelligence.

- Traffic Sessions and Resource Claims live in runtime/Continuity state;
- material resumable checkpoints live in Continuity;
- audit events are retained according to Command policy;
- durable conclusions discovered during work may be promoted to Intelligence;
- ordinary check-in/check-out noise must not pollute canonical Intelligence.

## Migration lesson from RICE Control Plane

The original RICE Control Plane aggressively centered "minimum sufficient context" and progressive automatic selection. RICE alpha usage indicates that this can reduce model capability and make work feel under-informed.

Sovereign V1 therefore treats that behavior as an experiment/lesson rather than an invariant. Orientation/routing is retained; automatic context starvation is not.

The expanded ATC model adds another function the earlier RICE design underused: **live traffic awareness and coordination across concurrent agents and resources**.