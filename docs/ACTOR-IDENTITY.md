# Sovereign Actor Identity and Cross-Surface Bridge

Status: V1 foundation

## Principle

**Provider identity is not actor identity.**

A user may run many concurrent chats, threads, runs, tasks and workspaces through the same provider, account, product and model. Sovereign must distinguish each independently operating session so Control Plane traffic, Continuity, checkpoints, handoffs and Resource Claims remain accurate.

Six ChatGPT chats are therefore six Actor Instances, not one actor.

## Identity hierarchy

Sovereign V1 distinguishes:

1. **Tenant** — customer/workspace boundary.
2. **Principal** — human/service ultimately responsible for the work.
3. **Provider** — OpenAI, Anthropic, Google, xAI, DeepSeek, local runtime, etc.
4. **Product Surface** — ChatGPT, Work, Codex, Claude, Gemini, API client, extension, etc.
5. **Agent Profile** — optional reusable role/capability/persona identity.
6. **Actor Instance** — one independently operating chat/thread/run/task/workspace instance.
7. **Traffic Session** — one active operational objective carried out by an Actor Instance.
8. **Resource Claims** — resources that Traffic Session is using or intends to use.

An Actor Instance may have multiple Traffic Sessions over time. A Traffic Session belongs to exactly one Actor Instance.

## Same-provider example

```text
tenant: rice
principal: John
provider: OpenAI
surface: ChatGPT

actor.chatgpt.01 -> RICE LABS landing page
actor.chatgpt.02 -> Project Sovereign architecture
actor.chatgpt.03 -> Repo A implementation
actor.chatgpt.04 -> Repo A review
actor.chatgpt.05 -> waiting on external response
actor.chatgpt.06 -> RICE MOTORS research
```

Control Plane should show all six independently, including conflicts between `actor.chatgpt.03` and `actor.chatgpt.04` even though both share the same provider/account/model.

## Native and Sovereign-issued identifiers

Adapters use the strongest stable native identifier exposed by a client/provider, but Sovereign never requires one.

Relevant identity fields include:

- `tenant_id`;
- `principal_id`;
- `provider_id`;
- `surface_id`;
- `agent_profile_id` when applicable;
- `external_session_id` when exposed;
- `sovereign_actor_instance_id`;
- `traffic_session_id`.

If no reliable native chat/thread/run ID is available, Sovereign issues `sovereign_actor_instance_id` on first check-in. The adapter/client carries that identifier for later Control Plane calls from that same chat/run.

The platform must not collapse sessions simply because native provider metadata is unavailable.

## Manager/coordinator relationships

Manager/worker is not an identity level.

Actor Instances are siblings by default. Coordination relationships are explicit edges such as:

- `coordinates`;
- `delegated_to`;
- `parent_session`;
- `child_session`;
- `handoff_from`;
- `handoff_to`;
- `reviews`;
- `depends_on`.

This supports both flat concurrent work and intentional orchestration.

Example:

```text
John
└── ChatGPT chat A — coordinator
    ├── Codex run 1 — implementation
    ├── Codex run 2 — tests
    └── ChatGPT chat B — research
```

The same ChatGPT chat could later stop coordinating and become an ordinary sibling session without changing its underlying identity.

## ChatGPT / Work / Codex bridge

The bridge across conversational, workspace and coding surfaces is a first-class Sovereign V1 requirement.

Each is independently identifiable:

```text
OpenAI provider
├── ChatGPT chat A
├── ChatGPT chat B
├── Work session/workspace A
├── Codex run A
└── Codex run B
```

They may share one broader task through common Sovereign objects:

- Task Capsule/objective;
- Session Capsules;
- Continuity checkpoints;
- Resource Claims;
- handoff/delegation lineage;
- Intelligence/source pointers;
- commits/PRs/artifacts;
- Control Plane traffic state.

### Example handoff

```text
ChatGPT chat A
→ checks in
→ develops implementation direction
→ checkpoints Task Capsule
→ delegates implementation to Codex run A

Codex run A
→ checks in as separate Actor Instance
→ receives parent task/checkpoint pointers
→ sees current repository traffic
→ retrieves its chosen context
→ claims repo/worktree
→ implements + checkpoints commit/PR
→ checks out

ChatGPT chat A
→ next Control Plane check-in sees Codex outcome/checkpoint
→ continues from current state rather than stale chat memory
```

The same pattern works for Work, Claude, Gemini, Cursor or any future surface.

## Continuity rule

A conversation's private context is not automatically shared or synchronized verbatim with every other actor.

Instead Sovereign shares structured, governed state:

- current task/objective;
- checkpoints;
- decisions-so-far;
- artifacts;
- blockers;
- next actions;
- traffic/resource state;
- approved or requested Intelligence pointers;
- explicit handoff packets.

This avoids assuming that six chats have identical internal context while still eliminating repeated manual status updates for material state.

## Security and attribution

Every Actor Instance and Traffic Session must remain attributable to its Principal and granted scopes.

An Actor Instance cannot gain permissions because another chat under the same provider/account has them unless Command policy explicitly grants shared authority.

Audit records should preserve actor instance, principal, provider/surface, traffic session and resulting artifacts where applicable.

## V1 acceptance

V1 must demonstrate:

1. at least six simultaneous Actor Instances from the same provider can be distinguished;
2. overlapping Resource Claims between two same-provider chats produce the same warnings as cross-provider actors;
3. a ChatGPT session can hand a task to a distinct Codex Actor Instance through shared Continuity instead of manual full-context copy/paste;
4. Codex checkpoints become visible to the originating ChatGPT/Work actor on subsequent Control Plane check-in;
5. multiple Codex runs in one repository remain independently visible;
6. provider/account/model sameness never collapses separate active sessions into one traffic participant.
