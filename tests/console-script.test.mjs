import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { workflowAssets } from '../src/console/workflows.mjs';

test('Delivered Console script initializes independently of Worker bundle helpers', async () => {
  const script = workflowAssets('continuity').match(/<script>([\s\S]*)<\/script>/)[1];
  const events = [];
  const requests = [];
  const elements = { 'workflow-status': {textContent:''}, 'ideas-list': {replaceChildren(){},append(){}} };
  runInNewContext(script, {
    document: { getElementById: id => elements[id], addEventListener: name => events.push(name), createElement: () => ({}) },
    fetch: async path => { requests.push(path);return {ok:true,json:async()=>({ideas:[]})}; }
  });
  assert.deepEqual(events, ['submit','click']);
  assert.deepEqual(requests, ['/v1/continuity/ideas']);
  assert.ok(!script.includes('__name'));
});
