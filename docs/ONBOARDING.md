# Sovereign Onboarding and Initialization

Status: V0.1/V1 foundation

## Goal

Onboarding must feel seamless **and** visibly thorough. A user should finish initialization believing Sovereign understands the important parts of their world, while clearly seeing what is connected, what was studied, what is missing, what is uncertain and what still needs review.

Do not create a false impression of completeness. Show coverage and gaps explicitly.

## Onboarding stages

```text
CREATE TENANT
→ establish Principal/identity
→ privacy/security preferences
→ connect/import sources
→ source inventory
→ authority/source mapping
→ comprehensive initialization sweep
→ candidate intelligence extraction
→ deduplicate/reconcile/conflict detection
→ Canonical Change Set preview
→ user review for consequential merges
→ seed Canonical Intelligence + Continuity
→ build Control Plane terrain map
→ completeness/coverage report
→ optional deep Study passes
→ ready for normal use
```

## Source connection model

Sovereign should support both:

1. **Sovereign-managed storage** — tenant-owned logical storage backed by Sovereign infrastructure such as R2 for uploads/imports/artifacts where appropriate.
2. **External source connections** — Google Drive, Microsoft OneDrive/SharePoint, Dropbox, iCloud where technically supported, GitHub, Notion, Slack/Teams, email, calendars, databases, CRMs and future connectors.

External systems may remain the live/source authority. Sovereign should reference rather than duplicate large/sensitive content when practical.

## Initialization operation

`Initialize` is a Command/Intelligence workflow, not a fifth module.

It should:

- enumerate connected sources and accessible scopes;
- identify files/repos/projects/entities/domains/workspaces/accounts;
- inspect metadata and high-value content;
- detect current vs archived/deprecated material;
- discover likely source/authority relationships;
- detect duplicates and conflicting claims;
- extract Candidate Intelligence;
- identify Continuity/task/session state where recoverable;
- create a proposed initial canonical change set;
- require review where policy says the merge is consequential;
- build indexes/relationships/source maps;
- generate an initialization coverage report.

## Progressive thoroughness

Initialization should be thorough without forcing every account to ingest everything at once.

Use visible stages such as:

- Quick inventory complete;
- Core sources analyzed;
- High-priority domains initialized;
- Deep study pending/optional;
- Background/periodic Sweep configured where authorized.

Users should always be able to deepen a scope later with `Study`.

## Initialization coverage report

After onboarding, show a clear report such as:

- connected sources;
- sources successfully inventoried;
- sources partially analyzed;
- inaccessible/failed sources;
- entities/projects/domains identified;
- candidate records discovered;
- canonical records proposed/applied;
- conflicts requiring review;
- stale/superseded material found;
- sensitive material intentionally excluded/minimized;
- confidence/coverage by major domain;
- recommended next Study/Sweep actions.

Avoid fake single-number precision. Coverage should be evidence-backed and explainable.

## Study

`Study` is an explicit deep-understanding operation.

Examples:

- "Study my company completely"
- "Study this repository and connected infrastructure"
- "Study my sales organization"

Study may intentionally use substantial context/compute to:

- retrieve broadly;
- inspect sources deeply;
- resolve relationships/history;
- identify contradictions/gaps;
- verify live/volatile state;
- produce Candidate Intelligence and recommended canonical updates;
- improve the Control Plane map.

Study should report what it examined and what remains outside scope.

## Sweep

`Sweep` detects change after initialization.

It should identify:

- new sources/items;
- changed content;
- stale canonical state;
- superseded material;
- authority/location changes;
- newly active/dormant projects;
- candidate updates;
- conflicts and unexplained drift.

Sweep proposes Canonical Change Sets rather than silently declaring every discovered change canonical.

## User reassurance without false certainty

The UI should make state legible:

- `Initialized`
- `Partially initialized`
- `Needs review`
- `Deep study recommended`
- `Source disconnected`
- `Sweep overdue`
- `Canonical conflicts pending`

The product should answer naturally:

- "Do you have everything you need?"
- "What haven't you studied yet?"
- "Which sources are missing?"
- "How well do you understand RICE LABS?"
- "What should I connect next?"

## Ongoing onboarding

Onboarding is not a one-time wizard. Sovereign should remain progressively improvable:

- add sources later;
- re-run Initialize against new scopes;
- run Study on important domains;
- run Sweep manually or on policy-controlled schedules;
- review canonical proposals;
- correct misunderstandings;
- measure and surface coverage gaps.

The system should make increasing intelligence depth visible to the user.