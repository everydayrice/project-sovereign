# Sovereign Control Plane

Status: V1 foundation

## Mental model

The Control Plane is the **ATC tower and map**, not the pilot's brain and not the baggage allowance.

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
- which routes it can take next.

Then the agent decides how much context it wants.

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
    "available_routes": [
      "intelligence.search",
      "intelligence.get",
      "continuity.resume",
      "source.resolve",
      "live.verify"
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
- live-authority requirements where stale state could be materially wrong.

These are governance/security constraints, not AI-context optimization.

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
- estimated cost.

Later versions can use this data to recommend better defaults per task/model/agent/tenant.

A future Command setting may allow policy-bounded automatic appetite optimization, but it must be opt-in/configurable and reversible.

## Migration lesson from RICE Control Plane

The original RICE Control Plane aggressively centered "minimum sufficient context" and progressive automatic selection. RICE alpha usage indicates that this can reduce model capability and make work feel under-informed.

Sovereign V1 therefore treats that behavior as an experiment/lesson rather than an invariant. Orientation/routing is retained; automatic context starvation is not.
