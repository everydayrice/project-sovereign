import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
import { createIdeaStore } from '../src/continuity/idea-store.mjs';

test('Ideas reject cross-tenant owners and tasks atomically on real Neon', { skip: !process.env.SOVEREIGN_IDEA_DB_FILE }, async () => {
  assert.equal(process.env.SOVEREIGN_MACHINE_BRANCH_ID, 'br-empty-rice-ayt9b4nn');
  const { url } = JSON.parse(await readFile(process.env.SOVEREIGN_IDEA_DB_FILE, 'utf8'));
  assert.ok(!url.includes('ep-purple-glitter'));
  const sql = neon(url);
  // Each operation runs with fresh fixtures in a transaction that always rolls back.
  const fixture = [
    ["INSERT INTO command.tenants (tenant_id,slug,display_name,command_display_name,state) VALUES ('idea_guard_a','idea-guard-a','Guard A','Command','active'),('idea_guard_b','idea-guard-b','Guard B','Command','active')", []],
    ["INSERT INTO command.principals (principal_id,tenant_id,kind,display_name,state) VALUES ('idea_guard_pa','idea_guard_a','human','A','active'),('idea_guard_pb','idea_guard_b','human','B','active')", []],
    ["INSERT INTO continuity.task_capsules (task_capsule_id,tenant_id,title,objective,state,owner_principal_id) VALUES ('idea_guard_ta','idea_guard_a','A','Guard','active','idea_guard_pa'),('idea_guard_tb','idea_guard_b','B','Guard','active','idea_guard_pb')", []],
    ["INSERT INTO continuity.ideas (idea_id,tenant_id,owner_principal_id,title,state) VALUES ('idea_guard_i','idea_guard_a','idea_guard_pa','Original','captured')", []]
  ];
  const store = createIdeaStore(url, { httpSql: { query: async (statement, params) => {
    const result = await sql.transaction([...fixture.map(([q,p]) => sql.query(q,p)), sql.query(statement,params), sql.query('ROLLBACK')]);
    return result[fixture.length];
  } } });
  const base = { tenantId: 'idea_guard_a', ownerPrincipalId: 'idea_guard_pa', title: 'Guarded idea' };
  await assert.rejects(store.create({ ...base, ownerPrincipalId: 'idea_guard_pb' }), { code: 'idea_reference_not_found' });
  await assert.rejects(store.create({ ...base, taskCapsuleId: 'idea_guard_tb' }), { code: 'idea_reference_not_found' });
  const created = await store.create({ ...base, taskCapsuleId: 'idea_guard_ta' });
  assert.equal(created.task_capsule_id, 'idea_guard_ta');
  await assert.rejects(store.update({ tenantId: base.tenantId, ideaId: 'idea_guard_i', taskCapsuleId: 'idea_guard_tb' }), { code: 'idea_not_found' });
  const updated = await store.update({ tenantId: base.tenantId, ideaId: 'idea_guard_i', taskCapsuleId: 'idea_guard_ta' });
  assert.equal(updated.revision, 2);
  assert.equal(updated.task_capsule_id, 'idea_guard_ta');
  const cleared = await store.update({ tenantId: base.tenantId, ideaId: 'idea_guard_i', taskCapsuleId: null });
  assert.equal(cleared.task_capsule_id, null);
  const [remaining] = await sql`SELECT count(*)::int AS count FROM command.tenants WHERE tenant_id IN ('idea_guard_a','idea_guard_b')`;
  assert.equal(remaining.count, 0);
});
