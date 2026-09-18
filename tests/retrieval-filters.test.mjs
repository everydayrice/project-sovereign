import assert from 'node:assert/strict';
import test from 'node:test';
import { RetrievalService } from '../src/intelligence/retrieval-service.mjs';
import { normalizeSearchFilters, searchArgsFromUrl } from '../src/intelligence/search-filters.mjs';
import { createServiceHttpGateway } from '../src/gateway/service-http-gateway.mjs';
import { createMcpServer } from '../src/gateway/mcp-server.mjs';
import { createSovereignPlatform } from '../src/platform/sovereign-platform.mjs';

test('retrieval rejects invalid filters and limits before touching storage', async () => {
  const retrieval = new RetrievalService({ persistence: { searchTenant() { throw Error('must not run'); } } });
  for (const filters of [null, [], { kind: 'everything' }, { tenant_id: 'other' }, { scope: { project: {} } }, { updated_after: 'yesterday' }, { updated_after: '2026-09-19T00:00:00Z', updated_before: '2026-09-18T00:00:00Z' }, { kind: 'source', record_type: 'decision' }]) {
    await assert.rejects(retrieval.search({ tenantId: 'ten', query: 'query', filters }), { code: 'invalid_search_filter' });
  }
  for (const limit of [0, -1, 1.5, 51, NaN, '8']) await assert.rejects(retrieval.search({ tenantId: 'ten', query: 'query', limit }), { code: 'invalid_search_limit' });
  assert.throws(() => searchArgsFromUrl(new URL('https://test.invalid?q=q&scope=broken')), { code: 'invalid_search_filter' });
  assert.throws(() => normalizeSearchFilters({ updated_after: '2026-02-30T00:00:00Z' }), { code: 'invalid_search_filter' });
  assert.throws(() => normalizeSearchFilters({ constructor: 'unexpected' }), { code: 'invalid_search_filter' });
  assert.deepEqual(normalizeSearchFilters({ scope: { project: 'alpha' } }), { kind: 'canonical', scope: { project: 'alpha' } });
});

test('HTTP Search and MCP Ask pass identical normalized filters and retain scope authorization', async () => {
  const p = createSovereignPlatform();
  const calls = [];
  const persistence = { loadTenant: async () => ({ store: p.store }), searchTenant: async input => { calls.push(input); return []; } };
  const retrieval = new RetrievalService({ persistence });
  let auth = { tenantId: 'ten_bound', principalId: 'prn_bound', permissions: ['intelligence:read'] };
  const options = { persistence, retrieval, authenticateService: async () => auth };
  const http = createServiceHttpGateway(options), mcp = createMcpServer(options);
  const filters = { record_type: 'decision', scope: { project: 'alpha' }, confidence: 'high' };
  const query = new URLSearchParams({ q: 'launch', source_id: 'src_fixture', limit: '5', record_type: 'decision', scope: JSON.stringify(filters.scope), confidence: 'high' });
  const response = await http.fetch(new Request('https://test.invalid/api/v1/search?' + query));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.filters.kind, 'canonical');
  const rpc = async (method, params) => (await mcp.fetch(new Request('https://test.invalid/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }))).json();
  const ask = await rpc('tools/call', { name: 'ask', arguments: { query: 'What is the launch?', source_id: 'src_fixture', limit: 5, filters } });
  assert.equal(ask.result.structuredContent.confidence, 'unknown');
  assert.deepEqual(calls[0], calls[1]);
  const listing = await rpc('tools/list');
  assert.equal(listing.result.tools.find(t => t.name === 'search').inputSchema.properties.filters.additionalProperties, false);
  auth = { ...auth, permissions: [] };
  assert.equal((await http.fetch(new Request('https://test.invalid/api/v1/search?' + query))).status, 403);
  assert.equal(calls.length, 2);
});
