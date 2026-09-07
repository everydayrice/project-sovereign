import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Client, neon, neonConfig } from '@neondatabase/serverless';
import { createServiceCredentialStore, createServiceAuthenticator } from '../src/auth/service-credentials.mjs';
import { createNeonPersistence } from '../src/platform/neon-persistence.mjs';
import { RetrievalService } from '../src/intelligence/retrieval-service.mjs';
import { createServiceHttpGateway } from '../src/gateway/service-http-gateway.mjs';
import { createMcpServer } from '../src/gateway/mcp-server.mjs';
import { createIdeaStore } from '../src/continuity/idea-store.mjs';

const enabled = Boolean(process.env.SOVEREIGN_MACHINE_DB_FILE);
test('real Neon machine credential, HTTP/MCP and durable handoff acceptance', { skip: !enabled }, async () => {
  assert.equal(process.env.SOVEREIGN_MACHINE_BRANCH_ID, 'br-empty-rice-ayt9b4nn');
  const { url } = JSON.parse(await readFile(process.env.SOVEREIGN_MACHINE_DB_FILE, 'utf8'));
  assert.ok(!url.includes('ep-purple-glitter'));
  neonConfig.webSocketConstructor = WebSocket;
  const clientFactory = () => new Client({ connectionString: url, connectionTimeoutMillis: 15000, query_timeout: 30000 });
  const sql = neon(url);
  const [owner] = await sql`SELECT p.tenant_id,p.principal_id FROM command.principals p JOIN command.tenants t USING (tenant_id) WHERE t.slug='rice' AND p.kind='human' AND p.state='active'`;
  const store = createServiceCredentialStore(url, { clientFactory });
  const persistence = createNeonPersistence(url, { clientFactory });
  const retrieval = new RetrievalService({ persistence });
  const authenticateService = createServiceAuthenticator({ credentialStore: store });
  const http = createServiceHttpGateway({ persistence, retrieval, authenticateService, ideaStore: createIdeaStore(url) });
  const mcp = createMcpServer({ persistence, retrieval, authenticateService });
  const credentials = [];
  const revoked = new Set();
  const issue = async scopes => {
    const c = await store.create({ tenantId: owner.tenant_id, createdByPrincipalId: owner.principal_id,
      displayName: 'Disposable machine acceptance', scopes, expiresAt: new Date(Date.now()+3600000).toISOString() });
    credentials.push(c); return c;
  };
  const request = async (c, method, path, body) => {
    const response = await http.fetch(new Request('https://acceptance.invalid/api/v1'+path, {
      method, headers: { authorization: 'Bearer '+c.token, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    }));
    const payload = await response.json();
    assert.ok(response.ok, JSON.stringify({ status: response.status, payload }));
    return payload.data;
  };
  try {
    console.log('machine acceptance: credentials and retrieval');
    const reader = await issue(['intelligence:read']);
    const listed = await store.list({ tenantId: owner.tenant_id, requesterPrincipalId: owner.principal_id });
    assert.ok(!JSON.stringify(listed).includes(reader.token));
    assert.ok(!listed.some(c => 'token_hash' in c));
    const answer = await request(reader, 'POST', '/ask', { query: "What is ORBIT TEST's status?" });
    assert.match(answer.answer, /ACTIVE/);
    const rpc = await mcp.fetch(new Request('https://acceptance.invalid/mcp', { method:'POST', headers:{
      authorization:'Bearer '+reader.token,'content-type':'application/json','MCP-Protocol-Version':'2026-07-28'
    }, body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'}) }));
    const names = (await rpc.json()).result.tools.map(t => t.name);
    assert.ok(names.includes('ask')); assert.ok(!names.includes('task_create'));
    const denied = await http.fetch(new Request('https://acceptance.invalid/api/v1/continuity/tasks', {method:'POST',headers:{authorization:'Bearer '+reader.token,'content-type':'application/json'},body:JSON.stringify({title:'Denied',objective:'Denied'})}));
    assert.equal(denied.status,403);

    console.log('machine acceptance: persistent task and traffic');
    const writer = await issue(['orientation:read','traffic:write','traffic:read','continuity:write','continuity:read','sources:read','command:read']);
    const task = await request(writer,'POST','/continuity/tasks',{title:'Disposable cross-actor handoff',objective:'Verify durable resume',next_action:'Checkpoint work'});
    const entered = await request(writer,'POST','/check-in',{objective:'Verify handoff',task_capsule_id:task.task_capsule_id,actor:{external_session_id:crypto.randomUUID()}});
    const session = entered.traffic_session.traffic_session_id;
    const orientation = await request(writer,'POST','/orient',{traffic_session_id:session});
    assert.equal(orientation.tenant_id,owner.tenant_id);
    assert.equal(orientation.source_map.length,1);
    assert.equal(orientation.intelligence,null);
    await request(writer,'POST','/continuity/checkpoint',{traffic_session_id:session,summary:'Evidence checked',next_action:'Review resumed work'});
    await request(writer,'POST','/check-out',{traffic_session_id:session,next_action:'Review resumed work'});
    const other = await issue(['continuity:read','traffic:read']);
    const resumed = await request(other,'POST','/continuity/resume',{task_capsule_id:task.task_capsule_id});
    assert.equal(resumed.next_action,'Review resumed work');
    assert.ok(JSON.stringify(resumed).includes('Evidence checked'));
    const idea = await request(writer,'POST','/continuity/ideas',{title:'Disposable idea'});
    const updated = await request(writer,'PATCH','/continuity/ideas/'+idea.idea_id,{state:'developing'});
    assert.equal(updated.state,'developing');
    console.log('machine acceptance: revocation');
    await store.revoke({tenantId:owner.tenant_id,credentialId:reader.credential.service_credential_id,revokedByPrincipalId:owner.principal_id});
    revoked.add(reader.credential.service_credential_id);
    assert.equal(await store.resolveToken(reader.token),null);
  } finally {
    for (const c of credentials) {
      if (revoked.has(c.credential.service_credential_id)) continue;
      for (let attempt=0; attempt<3; attempt++) {
        try { await store.revoke({tenantId:owner.tenant_id,credentialId:c.credential.service_credential_id,revokedByPrincipalId:owner.principal_id}); break; }
        catch (error) {
          if(error.code === 'service_credential_not_found') break;
          if(attempt===2 || error.name !== 'ErrorEvent' && error.type !== 'error') throw error;
        }
      }
    }
  }
});
