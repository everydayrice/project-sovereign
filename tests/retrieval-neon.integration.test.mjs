import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Client, neonConfig } from '@neondatabase/serverless';
import { createNeonPersistence } from '../src/platform/neon-persistence.mjs';
import { createSovereignPlatform } from '../src/platform/sovereign-platform.mjs';
import { RetrievalService } from '../src/intelligence/retrieval-service.mjs';
import { ingestTextSource } from '../src/analysis/source-ingestion.mjs';

test('real SQL: structured filters, fallback, privacy and atomic indexing with rollback', { skip: !process.env.SOVEREIGN_RETRIEVAL_DB_FILE }, async () => {
  assert.equal(process.env.SOVEREIGN_RETRIEVAL_BRANCH, 'br-silent-wave-ayb8z6d5');
  const { url } = JSON.parse(await readFile(process.env.SOVEREIGN_RETRIEVAL_DB_FILE, 'utf8'));
  assert.ok(!url.includes('ep-purple-glitter'), 'Production database prohibited');
  neonConfig.webSocketConstructor = WebSocket;
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 15000, query_timeout: 15000 });
  await client.connect();
  const transactionClient = { connect: async () => {}, end: async () => {}, query: (q, args) => client.query(
    q === 'BEGIN' ? 'SAVEPOINT acceptance_operation' : q === 'COMMIT' ? 'RELEASE SAVEPOINT acceptance_operation' : q === 'ROLLBACK' ? 'ROLLBACK TO SAVEPOINT acceptance_operation' : q, args) };
  const persistence = createNeonPersistence(url, { clientFactory: () => transactionClient, httpSql: { query: async (q, args) => (await client.query(q, args)).rows } });
  let tenant;
  try {
    await client.query('BEGIN');
    let p = createSovereignPlatform();
    tenant = p.command.createTenant({ slug: 'retrieval-' + crypto.randomUUID().slice(0, 8), displayName: 'Disposable retrieval acceptance' });
    const tenantId = tenant.tenant_id;
    const owner = p.command.createPrincipal({ tenantId, displayName: 'Fixture owner' });
    const principalId = owner.principal_id;
    await persistence.bootstrapTenant({ tenant, principal: owner, store: p.store, authSubjectReference: 'retrieval-' + crypto.randomUUID() });
    let loaded;
    const reload = async () => { loaded = await persistence.loadTenant(tenantId); p = createSovereignPlatform({ store: loaded.store }); };
    await reload();
    const source = p.sources.createManagedUpload({ tenantId, principalId, fileName: 'fixture.csv', mimeType: 'text/csv', sizeBytes: 100 });
    const item = p.store.list('sourceItems', i => i.source_id === source.source_id)[0];
    const ingestion = ingestTextSource({ text: 'Project,Status\nNeedle,Active', sourceId: source.source_id, sourceItemId: item.source_item_id, fileName: 'fixture.csv' });
    const replacement = { sourceId: source.source_id, sourceItemId: item.source_item_id, chunks: ingestion.chunks };
    const add = p.intelligence.proposeChangeSet({ tenantId, principalId, title: 'Fixture records', reason: 'Isolated retrieval test', operations: ['alpha','beta'].map(project => ({ type: 'add', record: { recordType: 'decision', authorityLevel: 'approved', payload: { statement: 'Needle launch approved' }, scope: { project }, confidence: project === 'alpha' ? 'high' : 'low', sourceIds: [source.source_id] } })) });
    p.intelligence.approveChangeSet({ tenantId, principalId, changeSetId: add.change_set.canonical_change_set_id });
    await persistence.saveTenant({ tenantId, store: p.store, expectedVersion: loaded.version, sourceChunkReplacements: [replacement] });
    await reload();
    const retrieval = new RetrievalService({ persistence });
    const search = async (filters = {}, query = 'Needle', extra = {}) => (await retrieval.search({ tenantId, query, filters, ...extra })).results;
    assert.equal((await search()).length, 3);
    assert.equal((await search({ kind: 'source' })).length, 1);
    assert.equal((await search({ record_type: 'decision' })).length, 2);
    const scoped = await search({ scope: { project: 'alpha' }, confidence: 'high', authority_level: 'approved' });
    assert.equal(scoped.length, 1);
    assert.equal(scoped[0].metadata.scope.project, 'alpha');
    assert.equal((await search({ scope: { project: 'other' } })).length, 0);
    assert.equal((await search({ record_type: 'fact' })).length, 0);
    assert.equal((await search({ confidence: 'low' })).length, 1);
    assert.equal((await search({ data_classification: 'restricted' })).length, 0);
    assert.equal((await search({ updated_after: '2099-01-01T00:00:00Z' })).length, 0);
    assert.equal((await search({ updated_before: '2000-01-01T00:00:00Z' })).length, 0);
    assert.equal((await search({}, 'Needle', { sourceId: 'missing-source' })).length, 0);
    assert.equal((await search({}, 'Needle', { limit: 1 })).length, 1);
    assert.equal((await search({}, 'Needle', { tenantId: 'other-tenant' })).length, 0);
    // Substring does not match a lexeme: exercise both branches of fallback SQL.
    assert.equal((await search({ kind: 'source' }, 'eedl')).length, 1);
    assert.equal((await search({ scope: { project: 'alpha' } }, 'eedl')).length, 1);
    assert.equal((await search({ data_classification: 'restricted' }, 'eedl')).length, 0);
    assert.equal((await search({}, '%')).length, 0);
    const answer = await retrieval.ask({ tenantId, query: 'What is the Needle launch?', filters: { scope: { project: 'alpha' } } });
    assert.equal(answer.evidence.length, 1);
    assert.equal(answer.evidence[0].metadata.scope.project, 'alpha');
    // Failed index replacement must roll back metadata and version together.
    const version = loaded.version;
    p.store.update('sourceItems', item.source_item_id, { privacy_state: 'excluded' });
    await assert.rejects(persistence.saveTenant({ tenantId, store: p.store, expectedVersion: version, sourceChunkReplacements: [{ ...replacement, chunks: [{ ...ingestion.chunks[0], ordinal: -1 }] }] }));
    await reload();
    assert.equal(loaded.version, version);
    assert.equal(p.store.get('sourceItems', item.source_item_id).privacy_state, 'included');
    assert.equal((await search({ kind: 'source' })).length, 1);
    p.store.update('sourceItems', item.source_item_id, { privacy_state: 'excluded' });
    await persistence.saveTenant({ tenantId, store: p.store, expectedVersion: loaded.version });
    assert.equal((await search({ kind: 'source' })).length, 0);
    assert.equal((await search({ kind: 'source' }, 'eedl')).length, 0);
    await reload();
    p.store.update('sourceItems', item.source_item_id, { privacy_state: 'included' });
    p.sources.updateSource({ tenantId, principalId, sourceId: source.source_id, archived: true });
    await persistence.saveTenant({ tenantId, store: p.store, expectedVersion: loaded.version });
    assert.equal((await search({ kind: 'source' })).length, 0);
    assert.equal((await search({ kind: 'source' }, 'eedl')).length, 0);
  } finally {
    await client.query('ROLLBACK');
    if (tenant) assert.equal((await client.query('SELECT count(*)::int AS count FROM command.tenants WHERE tenant_id=$1', [tenant.tenant_id])).rows[0].count, 0);
    await client.end();
  }
});
