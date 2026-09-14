# Working with Sovereign

## Start work

1. List existing tasks with `continuity_get` and select the intended task by ID.
   Create a task only when no matching work exists. Record its objective and completion criteria.
2. Call `resume` for the task. Read the objective, recent checkpoints, session outcome,
   blockers and next action. The latest checkpoint may be a generic checkout marker;
   the material summary is also in recent checkpoints and the session outcome.
3. Retrieve relevant source/canonical evidence and check its scope and freshness.
   A stored historical statement is not proof of current runtime state.
4. Call `check_in` linked to the task. Claim shared resources where the work requires
   coordination, and heartbeat during long sessions. A saved routine does not itself
   install a scheduler or guarantee that every AI client follows it automatically.

## During work

Checkpoint material decisions, changes, verification, unresolved questions and a
concrete next action. Include repository commit/PR or source references. Keep claims
and permissions scoped to the task. Do not put passwords or tokens into checkpoints.
If a write fails without a receipt, inspect saved state before retrying to avoid duplicates.

## Finish or hand off

1. Save a material checkpoint with evidence and remaining blockers.
2. Check out with a useful outcome summary and next action, releasing open claims.
3. Mark the task completed only when its completion criteria pass. Session checkout
   completion alone does not mean the whole task or project is complete.
4. Call `resume` again to verify the saved outcome and next action can be retrieved.
   Report the persistence receipt from the write; do not invent a receipt for a read.

## Knowledge and project boundaries

Task/session context is non-canonical working state. Stable decisions intended as
shared authority must use canonical proposals and the configured review policy.
Preserve attribution, approval history and reversibility. Historical conversation
content requires deliberate selection/import; a connection does not ingest chat history.

Name the project in each task and record its source references. Until project scoping
has been verified, a project name in a title is an organizational convention, not an
access-control boundary. Tenant permissions remain the hard isolation boundary.
Sovereign is an independent product; business tenants and optional extensions are consumers.

## Project links

Projects use active approved Canonical Intelligence records of type `project`.
Tasks link to those stable record IDs through their existing `intelligence_references`.
One task may carry several references; assigning a project through the Project field
replaces project references while preserving other knowledge references.

In Continuity, choose Project when creating or editing a task. The Project filter
on Continuity and Knowledge filters tasks, task-linked checkpoints and saved records.
Knowledge records match the project's `scope.project` key, plus the project record itself.
Workspace health, reviews, candidates, search and Ask remain workspace-wide. The filter
is organizational, not a permission boundary. Unassigned tasks remain in All projects.

MCP `task_create`, `task_update` and `continuity_get` accept `project_id`, an active
canonical project record ID. An empty string clears a task's project assignment.
The HTTP task endpoints accept the same field/filter. Assignment and filtered reads
validate that the project belongs to the authenticated tenant. Sessions and checkpoints
retain their task link; resume returns the task's intelligence references.

Creating new project knowledge follows the existing canonical proposal/owner approval
workflow. This does not create a second project registry, import other businesses,
or add project-specific permissions. Reversing project scope or using duplicate scope
keys requires reconciliation of affected records before relying on filtered results.
