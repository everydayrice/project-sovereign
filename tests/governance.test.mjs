import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeGovernance } from '../src/auth/governance.mjs';
import { createNormalizedNeonPersistence } from '../src/platform/neon-normalized-persistence.mjs';
import { createSovereignPlatform } from '../src/platform/sovereign-platform.mjs';

test('Governance checks explicit role permissions independently from sign-in', async () => {
  const paths = ['/v1/command/workspaces', '/v1/intelligence/canonical/change-sets/ccs/approve', '/v1/intelligence/canonical/change-sets/ccs/approve-candidate', '/v1/recovery/rcv/complete', '/v1/extensions/install'];
  for (const path of paths) {
    const args = { request: new Request('https://sovereign.test'+path, { method: 'POST' }), tenantId: 'tenant', principalId: 'member' };
    await assert.rejects(authorizeGovernance({ ...args, persistence: { principalPermissions: async () => ['control_plane.use'] } }), { code: 'command_permission_denied' });
    await authorizeGovernance({ ...args, persistence: { principalPermissions: async () => ['*'] } });
  }
});

test('Owner binding failure rolls back tenant bootstrap before any commit', async () => {
  const platform = createSovereignPlatform();
  const tenant = platform.command.createTenant({ slug: 'atomic-owner', displayName: 'Owner' });
  const principal = platform.command.createPrincipal({ tenantId: tenant.tenant_id, displayName: 'Owner' });
  const statements = [];
  const client = { connect: async () => {}, end: async () => {}, query: async (q) => {
    statements.push(q);
    if (q.includes('WITH owner_role')) throw new Error('Role storage failure');
    return { rows: [{ tenant_id: tenant.tenant_id }], rowCount: 1 };
  } };
  const persistence = createNormalizedNeonPersistence('postgres://unused', { httpSql: {}, clientFactory: () => client });
  await assert.rejects(persistence.bootstrapTenant({ authSubjectReference: 'owner', tenant, principal, store: platform.store }), /Role storage failure/);
  assert.ok(statements.includes('BEGIN'));
  assert.equal(statements.at(-1), 'ROLLBACK');
  assert.ok(!statements.includes('COMMIT'));
  assert.ok(statements.some(q => q.includes('INSERT INTO runtime.auth_bindings')));
});
