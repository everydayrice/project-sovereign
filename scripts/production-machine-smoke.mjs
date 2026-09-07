// Explicitly opt-in. Creates one 15-minute, read-only production service credential,
// exercises the real Worker, then revokes it. Never prints the token or DB URL.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client, neon, neonConfig } from '@neondatabase/serverless';
import { createServiceCredentialStore } from '../src/auth/service-credentials.mjs';

assert.equal(process.env.SOVEREIGN_LIVE_SMOKE_APPROVED, 'project-sovereign-readonly');
const { url } = JSON.parse(await readFile(process.env.SOVEREIGN_LIVE_DB_FILE,'utf8'));
assert.ok(url.includes('ep-purple-glitter'));
neonConfig.webSocketConstructor=WebSocket;
const sql=neon(url);
const [owner]=await sql`SELECT p.tenant_id,p.principal_id FROM command.principals p JOIN command.tenants t USING(tenant_id) WHERE t.slug='rice' AND p.kind='human' AND p.state='active'`;
assert.equal(owner.tenant_id,'ten_64d1b0c6-1b25-437b-ac73-3be122ca8d6b');
const store=createServiceCredentialStore(url,{clientFactory:()=>new Client({connectionString:url,connectionTimeoutMillis:15000,query_timeout:30000})});
const created=await store.create({tenantId:owner.tenant_id,createdByPrincipalId:owner.principal_id,displayName:'Release verification — read-only, temporary',scopes:['intelligence:read','continuity:read'],expiresAt:new Date(Date.now()+900000).toISOString()});
const origin='https://project-sovereign.ricecloud.workers.dev';
const request=(path,body)=>fetch(origin+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+created.token,'content-type':'application/json','MCP-Protocol-Version':'2026-07-28'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
try {
  let response=await request('/api/v1/search?q=ORBIT%20TEST');
  assert.equal(response.status,200); let data=await response.json();
  assert.ok(JSON.stringify(data).includes('ORBIT TEST'));
  console.log('PASS live authenticated HTTP Search');
  response=await request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'ask',arguments:{query:"What is ORBIT TEST's status?"}}});
  data=await response.json();assert.ok(!data.error);assert.match(data.result.structuredContent.answer,/ACTIVE/);
  console.log('PASS live authenticated MCP Ask');
  response=await request('/api/v1/continuity');assert.equal(response.status,200);
  console.log('PASS live authenticated Continuity read');
  response=await request('/api/v1/continuity/tasks',{title:'Must be denied',objective:'Scope verification'});
  assert.equal(response.status,403);
  console.log('PASS live denied write without write scope');
} finally {
  let revoked=false;
  for(let attempt=0;attempt<3;attempt++) {
    try {await store.revoke({tenantId:owner.tenant_id,credentialId:created.credential.service_credential_id,revokedByPrincipalId:owner.principal_id});revoked=true;break;}
    catch(error){if(error.code==='service_credential_not_found'){revoked=true;break;} if(attempt===2)throw error;}
  }
  assert.ok(revoked);
  const response=await request('/api/v1/continuity');assert.equal(response.status,401);
  console.log('PASS live revoked credential rejected');
}
