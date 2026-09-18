import assert from 'node:assert/strict';
import test from 'node:test';
import { ingestTextSource, supportsAutomaticTextIngestion } from '../src/analysis/source-ingestion.mjs';
import { processStoredSource } from '../src/worker-entry.mjs';
import { createSovereignPlatform } from '../src/platform/sovereign-platform.mjs';
import { InMemorySovereignStore } from '../src/platform/store.mjs';

const ingest = (text, fileName) => ingestTextSource({ text, fileName, sourceId: 'src_fixture', sourceItemId: 'sri_fixture' });
test('CSV and TSV preserve quoted fields, multiline records, Unicode and trailing empty cells', () => {
  const csv = ingest('\uFEFFName,Notes,Empty\r\n"José, Jr.","Line one\r\nHe said ""hello""",\r\n', 'people.csv');
  assert.equal(csv.chunks.length, 1);
  assert.equal(csv.chunks[0].chunk_text, 'Name: José, Jr.\nNotes: Line one\nHe said "hello"\nEmpty: ');
  assert.equal(csv.chunks[0].metadata.row_number, 2);
  assert.deepEqual(csv.candidates, []);
  const tsv = ingest('Name\tValue\nA\t\nB\t"two\tparts"\n', 'table.tsv');
  assert.equal(tsv.parser, 'tsv_v1');
  assert.match(tsv.chunks[1].chunk_text, /two\tparts/);
  assert.equal(tsv.chunks[0].chunk_text, 'Name: A\nValue: ');
  assert.equal(ingest('Name\tValue\nA\t', 'last-empty.tsv').chunks[0].chunk_text, 'Name: A\nValue: ');
});

test('JSONL preserves each record and line provenance; long records stay bounded', () => {
  assert.equal(supportsAutomaticTextIngestion({ mimeType: 'application/x-ndjson' }), true);
  const result = ingest('{"first":"alpha"}\n\n{"second":"βeta"}\n', 'records.jsonl');
  assert.equal(result.parser, 'jsonl_v1');
  assert.deepEqual(result.chunks.map(c => c.metadata.line_number), [1, 3]);
  assert.deepEqual(result.chunks.map(c => JSON.parse(c.chunk_text)), [{ first: 'alpha' }, { second: 'βeta' }]);
  const long = ingest('Name,Value\nA,' + 'x'.repeat(5000), 'long.csv');
  assert.ok(long.chunks.length > 1);
  assert.ok(long.chunks.every(c => c.chunk_text.length <= 1800 && c.metadata.row_number === 2));
  assert.equal(long.chunks.map(c => c.chunk_text).join(''), 'Name: A\nValue: ' + 'x'.repeat(5000));
  assert.deepEqual(ingest('null', 'null.json').chunks.map(c => c.chunk_text), ['null']);
});

test('malformed JSON, JSONL and tables fail explicitly instead of silently becoming prose', () => {
  for (const [text, name] of [['{"broken":', 'bad.json'], ['{}\nnope', 'bad.jsonl'], ['a,b\n"open,b', 'bad.csv'], ['a,b\n1', 'bad.csv'], ['a,b\n"closed"extra,2', 'bad.csv']]) {
    assert.throws(() => ingest(text, name), { code: 'source_parse_failed', status: 422 });
  }
});

test('stored malformed files retain the original object and persist failure without candidates or stale chunks', async () => {
  const p = createSovereignPlatform();
  const tenant = p.command.createTenant({ slug: 'parser-test', displayName: 'Parser test' });
  const owner = p.command.createPrincipal({ tenantId: tenant.tenant_id, displayName: 'Owner' });
  const source = p.sources.createManagedUpload({ tenantId: tenant.tenant_id, principalId: owner.principal_id, fileName: 'broken.csv', mimeType: 'text/csv', sizeBytes: 10 });
  const item = p.store.list('sourceItems', i => i.source_id === source.source_id)[0];
  p.store.update('sourceItems', item.source_item_id, { storage_state: 'stored' });
  let state = p.store.exportState(), replacement, saves = 0;
  const args = { request: new Request('https://test.invalid/v1/sources/upload-file', { method: 'POST' }), sourceId: source.source_id,
    authenticate: async () => ({ authSubject: 'fixture' }), tolerateUnsupported: true,
    files: { assertConfigured() {}, get: async () => ({ text: async () => 'A,B\n"unterminated' }) },
    persistence: { resolveAuthBinding: async () => ({ tenant_id: tenant.tenant_id, principal_id: owner.principal_id }),
      authorize: async () => true,
      loadTenant: async () => ({ store: new InMemorySovereignStore().importState(state), version: 1 }),
      saveTenant: async ({ store, sourceChunkReplacements }) => { state = store.exportState(); replacement = sourceChunkReplacements; saves++; return { version: 2 }; }
    }
  };
  const result = await processStoredSource(args);
  assert.equal(result.state, 'failed');
  assert.equal(result.searchable, false);
  assert.equal(result.tenant_state_version, 2);
  assert.equal(saves, 1);
  assert.equal(state.sourceItems[0].storage_state, 'stored');
  assert.equal(state.sourceItems[0].item_state, 'failed');
  assert.equal(state.sources[0].processing_state, 'failed');
  assert.equal(state.candidateIntelligence.length, 0);
  assert.deepEqual(replacement[0].chunks, []);
  // Storage failures must remain visible and must not invent a parser receipt.
  args.files.get = async () => { throw new Error('storage unavailable'); };
  await assert.rejects(processStoredSource(args), /storage unavailable/);
  assert.equal(saves, 1);
  args.files.get = async () => ({ text: async () => 'A,B\nOne,Two' });
  const retry = await processStoredSource(args);
  assert.equal(retry.state, 'ready');
  assert.equal(state.sources[0].failed_item_count, 0);
  assert.equal(state.sources[0].failure_reason, null);
  assert.equal(state.sourceItems[0].metadata.parse_error, null);
  assert.equal(replacement[0].chunks.length, 1);
});
