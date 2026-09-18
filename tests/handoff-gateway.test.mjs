import assert from 'node:assert/strict';
import test from 'node:test';
import { createSovereignPlatform } from '../src/platform/sovereign-platform.mjs';
import { InMemorySovereignStore } from '../src/platform/store.mjs';
import { createServiceHttpGateway } from '../src/gateway/service-http-gateway.mjs';
import { createMcpServer } from '../src/gateway/mcp-server.mjs';
import { executeAgentOperation } from '../src/gateway/agent-operations.mjs';
import { SovereignError } from '../src/platform/errors.mjs';

function fixture() {
  const platform = createSovereignPlatform();
  const tenant = platform.command.createTenant({ slug: 'handoff-gateway', displayName: 'Handoff test' });
  const principal = platform.command.createPrincipal({ tenantId: tenant.tenant_id, displayName: 'Owner' });
  const other = platform.command.createPrincipal({ tenantId: tenant.tenant_id, displayName: 'Other principal' });
  const auth = { tenantId: tenant.tenant_id, principalId: principal.principal_id,
    permissions: ['continuity:read', 'continuity:write', 'traffic:read', 'traffic:write', 'orientation:read'] };
  const persistence = {
    state: platform.store.exportState(), version: 1,
    async loadTenant() { return { store: new InMemorySovereignStore().importState(this.state), version: this.version }; },
    async saveTenant({ store, expectedVersion }) {
      if (expectedVersion !== this.version) throw new SovereignError('concurrent_write', 'Stale state', { status: 409 });
      this.state = store.exportState();
      return { version: ++this.version };
    }
  };
  const http = createServiceHttpGateway({ persistence, authenticateService: async () => auth });
  const mcp = createMcpServer({ persistence, authenticateService: async () => auth });
  const invoke = async (name, args, identity = auth) => (await executeAgentOperation({ name, args, auth: identity, persistence })).data;
  const rpc = async (name, args) => {
    const response = await mcp.fetch(new Request('https://test.invalid/mcp', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }));
    return { status: response.status, body: await response.json() };
  };
  const request = async (path, body) => {
    const response = await http.fetch(new Request(`https://test.invalid/api/v1${path}`, body === undefined ? {} : {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    }));
    return { status: response.status, body: await response.json() };
  };
  const enter = (task, identity = auth) => invoke('check_in', { objective: 'Handoff acceptance', task_capsule_id: task.task_capsule_id }, identity);
  return { platform, auth, other, persistence, invoke, rpc, request, enter };
}

test('HTTP sender and fresh MCP receiver persist offer, acceptance, completion and resume', async () => {
  const f = fixture();
  const task = await f.invoke('task_create', { title: 'Transfer work', objective: 'Prove shared transport lifecycle' });
  const sender = await f.enter(task);
  const offered = await f.request('/continuity/handoffs', { traffic_session_id: sender.traffic_session.traffic_session_id, summary: 'Implementation ready for review', next_action: 'Verify tests' });
  assert.equal(offered.status, 201);
  assert.ok(offered.body.persistence.version);
  const handoffId = offered.body.data.handoff_id;
  const receiver = (await f.rpc('check_in', { objective: 'Review handoff', task_capsule_id: task.task_capsule_id })).body.result.structuredContent;
  assert.notEqual(receiver.actor_instance.actor_instance_id, sender.actor_instance.actor_instance_id);
  const receive = { traffic_session_id: receiver.traffic_session.traffic_session_id, handoff_id: handoffId };
  const accepted = await f.rpc('handoff_accept', receive);
  assert.equal(accepted.body.result.structuredContent.state, 'accepted');
  assert.ok(accepted.body.result.structuredContent._persistence.version > offered.body.persistence.version);
  const replay = await f.rpc('handoff_accept', receive);
  assert.equal(replay.status, 409);
  const completed = await f.request(`/continuity/handoffs/${handoffId}/complete`, receive);
  assert.equal(completed.status, 200);
  assert.equal(completed.body.data.state, 'completed');
  const resumed = await f.invoke('resume', { task_capsule_id: task.task_capsule_id });
  assert.equal(resumed.pending_handoff, null);
  assert.equal(resumed.recent_handoffs[0].state, 'completed');
  assert.equal(resumed.next_action, 'Verify tests');
  assert.notEqual(resumed.task.state, 'completed');
  assert.ok(resumed.recent_checkpoints.some(c => c.summary.startsWith('Accepted handoff:')));
  const audit = new InMemorySovereignStore().importState(f.persistence.state).list('auditEvents');
  assert.ok(audit.some(e => e.event_type === 'continuity.handoff_accepted'));
  assert.ok(audit.some(e => e.event_type === 'continuity.handoff_completed'));
});

test('handoff validates scope, principal, actor assignment and task before persistence', async () => {
  const f = fixture();
  const task = await f.invoke('task_create', { title: 'Task A', objective: 'Transfer' });
  const otherTask = await f.invoke('task_create', { title: 'Task B', objective: 'Unrelated' });
  const sender = await f.enter(task);
  const receiver = await f.enter(task);
  const unrelated = await f.enter(otherTask);
  const sending = { traffic_session_id: sender.traffic_session.traffic_session_id, summary: 'Review', to_actor_instance_id: receiver.actor_instance.actor_instance_id };
  const rejected = async (name, args, code, auth) => {
    const before = f.persistence.version;
    await assert.rejects(() => f.invoke(name, args, auth), error => error.code === code);
    assert.equal(f.persistence.version, before);
  };
  await rejected('handoff_create', { ...sending, task_capsule_id: otherTask.task_capsule_id }, 'handoff_task_mismatch');
  await rejected('handoff_create', { ...sending, to_actor_instance_id: 'act_missing' }, 'not_found');
  await rejected('handoff_create', sending, 'service_scope_denied', { ...f.auth, permissions: ['traffic:write'] });
  const offered = await f.invoke('handoff_create', sending);
  const args = { handoff_id: offered.handoff_id, traffic_session_id: receiver.traffic_session.traffic_session_id };
  await rejected('handoff_accept', { ...args, traffic_session_id: unrelated.traffic_session.traffic_session_id }, 'handoff_task_mismatch');
  await rejected('handoff_accept', args, 'session_principal_mismatch', { ...f.auth, principalId: f.other.principal_id });
  await rejected('handoff_accept', { ...args, traffic_session_id: sender.traffic_session.traffic_session_id }, 'handoff_not_assigned');
  await rejected('handoff_complete', args, 'handoff_not_accepted');
  await f.invoke('handoff_accept', args);
  await rejected('handoff_complete', { ...args, traffic_session_id: sender.traffic_session.traffic_session_id }, 'handoff_not_assigned');
  await f.invoke('check_out', { traffic_session_id: receiver.traffic_session.traffic_session_id });
  await rejected('handoff_complete', args, 'session_not_live');
});

test('handoff supports distinct principals in the same tenant without impersonation', async () => {
  const f = fixture();
  const task = await f.invoke('task_create', { title: 'Shared work', objective: 'Distinct principals' });
  const sender = await f.enter(task);
  const otherAuth = { ...f.auth, principalId: f.other.principal_id };
  const receiver = await f.enter(task, otherAuth);
  const offered = await f.invoke('handoff_create', { traffic_session_id: sender.traffic_session.traffic_session_id, summary: 'Take over', to_actor_instance_id: receiver.actor_instance.actor_instance_id });
  const args = { traffic_session_id: receiver.traffic_session.traffic_session_id, handoff_id: offered.handoff_id };
  await f.invoke('handoff_accept', args, otherAuth);
  assert.equal((await f.invoke('handoff_complete', args, otherAuth)).state, 'completed');
});

test('service HTTP project filter excludes unrelated tasks and rejects foreign project IDs', async () => {
  const f = fixture();
  const p = f.platform;
  const proposal = p.intelligence.proposeChangeSet({ ...f.auth, title: 'Projects', reason: 'Test filters',
    operations: ['One', 'Two'].map(title => ({ type: 'add', record: { recordType: 'project', payload: { title } } })) });
  p.intelligence.approveChangeSet({ ...f.auth, changeSetId: proposal.change_set.canonical_change_set_id });
  const [a, b] = proposal.operations.map(o => o.created_record_id);
  f.persistence.state = p.store.exportState();
  const selected = await f.invoke('task_create', { title: 'Selected', objective: 'A', project_id: a });
  await f.invoke('task_create', { title: 'Excluded', objective: 'B', project_id: b });
  const result = await f.request(`/continuity?kind=tasks&project_id=${a}`);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data.tasks.map(t => t.task_capsule_id), [selected.task_capsule_id]);
  assert.equal((await f.request('/continuity?kind=tasks&project_id=cir_unknown')).status, 404);
});

test('handoff cannot reference another tenant actor through internal service calls', () => {
  const f = fixture();
  const p = f.platform;
  const foreign = p.command.createTenant({ slug: 'foreign', displayName: 'Foreign' });
  const principal = p.command.createPrincipal({ tenantId: foreign.tenant_id, displayName: 'Foreign owner' });
  const session = p.traffic.checkIn({ tenantId: foreign.tenant_id, principalId: principal.principal_id, actor: { provider: { key: 'test' }, surface: { key: 'test', type: 'mcp' } }, objective: 'Other tenant' });
  const task = p.continuity.createTaskCapsule({ tenantId: f.auth.tenantId, ownerPrincipalId: f.auth.principalId, title: 'Local task', objective: 'No foreign references' });
  const sender = p.traffic.checkIn({ ...f.auth, actor: { provider: { key: 'test' }, surface: { key: 'test', type: 'mcp' } }, objective: 'Send', taskCapsuleId: task.task_capsule_id });
  const args = { ...f.auth, trafficSessionId: sender.traffic_session.traffic_session_id, summary: 'Local handoff' };
  assert.throws(() => p.traffic.handoff({ ...args, toActorInstanceId: session.actor_instance.actor_instance_id }), error => error.code === 'not_found');
  const handoff = p.traffic.handoff(args);
  assert.throws(() => p.continuity.acceptHandoff({ tenantId: f.auth.tenantId, handoffId: handoff.handoff_id, actorInstanceId: session.actor_instance.actor_instance_id }), error => error.code === 'not_found');
  assert.equal(p.store.get('handoffs', handoff.handoff_id).state, 'offered');
});
