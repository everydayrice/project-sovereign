import { neon } from "@neondatabase/serverless";
import { SovereignError, requireCondition } from "../platform/errors.mjs";
import { newId } from "../platform/ids.mjs";

const IDEA_STATES = new Set(["captured", "developing", "parked", "promoted", "archived"]);

export function createIdeaStore(databaseUrl, { httpSql } = {}) {
  if (!databaseUrl) throw new SovereignError("database_not_configured", "DATABASE_URL is required for Ideas.", { status: 503 });
  const sql = httpSql ?? neon(databaseUrl);
  return {
    async list({ tenantId, states }) {
      const normalizedStates = states?.length ? states.filter((state) => IDEA_STATES.has(state)) : null;
      return sql.query(
        `SELECT idea_id,tenant_id,owner_principal_id,title,description,state,tags,source_references,intelligence_references,task_capsule_id,revision,created_at,updated_at
           FROM continuity.ideas
          WHERE tenant_id=$1 AND ($2::text[] IS NULL OR state=ANY($2::text[]))
          ORDER BY updated_at DESC`,
        [tenantId, normalizedStates]
      );
    },

    async create({ tenantId, ownerPrincipalId, title, description, state = "captured", tags = [], sourceReferences = [], intelligenceReferences = [], taskCapsuleId = null }) {
      requireCondition(title?.trim(), "idea_title_required", "Idea title is required.");
      requireCondition(IDEA_STATES.has(state), "idea_state_invalid", "Idea state is invalid.");
      const rows = await sql.query(
        `INSERT INTO continuity.ideas
         (idea_id,tenant_id,owner_principal_id,title,description,state,tags,source_references,intelligence_references,task_capsule_id,revision,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,1,now(),now())
         RETURNING idea_id,tenant_id,owner_principal_id,title,description,state,tags,source_references,intelligence_references,task_capsule_id,revision,created_at,updated_at`,
        [newId("idea"), tenantId, ownerPrincipalId, title.trim(), description?.trim() || null, state,
          JSON.stringify(normalizeArray(tags)), JSON.stringify(normalizeArray(sourceReferences)), JSON.stringify(normalizeArray(intelligenceReferences)), taskCapsuleId]
      );
      return rows[0];
    },

    async update({ tenantId, ideaId, title, description, state, tags, sourceReferences, intelligenceReferences, taskCapsuleId }) {
      if (state !== undefined) requireCondition(IDEA_STATES.has(state), "idea_state_invalid", "Idea state is invalid.");
      const rows = await sql.query(
        `UPDATE continuity.ideas
            SET title=COALESCE($3,title),
                description=CASE WHEN $4::boolean THEN $5 ELSE description END,
                state=COALESCE($6,state),
                tags=CASE WHEN $7::boolean THEN $8::jsonb ELSE tags END,
                source_references=CASE WHEN $9::boolean THEN $10::jsonb ELSE source_references END,
                intelligence_references=CASE WHEN $11::boolean THEN $12::jsonb ELSE intelligence_references END,
                task_capsule_id=CASE WHEN $13::boolean THEN $14 ELSE task_capsule_id END,
                revision=revision+1,updated_at=now()
          WHERE tenant_id=$1 AND idea_id=$2
        RETURNING idea_id,tenant_id,owner_principal_id,title,description,state,tags,source_references,intelligence_references,task_capsule_id,revision,created_at,updated_at`,
        [tenantId, ideaId, title?.trim() || null, description !== undefined, description?.trim() || null, state ?? null,
          tags !== undefined, JSON.stringify(normalizeArray(tags)), sourceReferences !== undefined, JSON.stringify(normalizeArray(sourceReferences)),
          intelligenceReferences !== undefined, JSON.stringify(normalizeArray(intelligenceReferences)), taskCapsuleId !== undefined, taskCapsuleId || null]
      );
      if (!rows.length) throw new SovereignError("idea_not_found", "Idea was not found.", { status: 404 });
      return rows[0];
    }
  };
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}
