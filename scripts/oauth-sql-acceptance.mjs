// Print a single rollback-only SQL acceptance statement using the actual store queries.
// Run against an isolated branch after migration 0006, never as a schema migration.
import { createMcpOAuthStore } from '../src/auth/mcp-oauth-store.mjs';
const queries=[];
const sql={query:async(q,p)=>{queries.push({q,p});return q.includes('used_refresh_hashes ?') ? [] : [{scopes:['continuity:read','continuity:write']}];}};
const store=createMcpOAuthStore('unused',{sql});
await store.authorize({tenantId:'ten_oauth_acceptance',principalId:'prn_oauth_owner',servicePrincipalId:'prn_oauth_service',credentialId:'svc_oauth_acceptance',grantId:'oag_acceptance',displayName:'OAuth acceptance',clientId:'soc_acceptance',redirectUri:'https://chatgpt.com/connector_platform_oauth_redirect',resource:'https://sovereign.test/mcp',challenge:'test-challenge',scopes:['continuity:read','continuity:write'],pendingHash:'pending-test-hash',codeHash:'code-test-hash'});
await store.exchange({grantType:'authorization_code',clientId:'soc_acceptance',resource:'https://sovereign.test/mcp',presentedHash:'code-test-hash',challenge:'test-challenge',redirectUri:'https://chatgpt.com/connector_platform_oauth_redirect',refreshHash:'refresh-test-1',accessHash:'access-test-1',accessPrefix:'test'});
await store.exchange({grantType:'refresh_token',clientId:'soc_acceptance',resource:'https://sovereign.test/mcp',presentedHash:'refresh-test-1',refreshHash:'refresh-test-2',accessHash:'access-test-2',accessPrefix:'test'});
const literal=v=>v===null?'NULL':"'"+String(v).replaceAll("'","''")+"'";
const render=(o,overrides={})=>o.q.replace(/\$(\d+)/g,(_,i)=>literal(overrides[i]??o.p[Number(i)-1]));
const assertCount=(q,count)=>`EXECUTE ${literal(q)}; GET DIAGNOSTICS n = ROW_COUNT; IF n <> ${count} THEN RAISE EXCEPTION 'Unexpected affected rows: %, expected ${count}', n; END IF;`;
const steps=[
  `INSERT INTO command.tenants(tenant_id,slug,display_name,command_display_name,state) VALUES('ten_oauth_acceptance','oauth-acceptance','OAuth test','COMMAND','active');`,
  `INSERT INTO command.principals(principal_id,tenant_id,kind,display_name,state) VALUES('prn_oauth_owner','ten_oauth_acceptance','human','Owner','active');`,
  `INSERT INTO command.roles(role_id,tenant_id,name,permission_set) VALUES('rol_oauth_owner','ten_oauth_acceptance','Owner','["*"]');`,
  `INSERT INTO command.principal_role_bindings(tenant_id,principal_id,role_id) VALUES('ten_oauth_acceptance','prn_oauth_owner','rol_oauth_owner');`,
  `INSERT INTO command.oauth_clients(client_id,client_name,redirect_uris) VALUES('soc_acceptance','Test','["https://chatgpt.com/connector_platform_oauth_redirect"]');`,
  assertCount(render(queries[0],{2:'wrong-owner'}),0),
  assertCount(render(queries[0]),1),
  assertCount(render(queries[1],{4:'wrong-challenge'}),0),
  assertCount(render(queries[1],{1:'wrong-client'}),0),
  assertCount(render(queries[1],{2:'https://wrong.test'}),0),
  assertCount(render(queries[1],{5:'https://wrong.test/callback'}),0),
  `UPDATE command.oauth_grants SET code_expires_at=now()-interval '1 second' WHERE grant_id='oag_acceptance';`,
  assertCount(render(queries[1]),0),
  `UPDATE command.oauth_grants SET code_expires_at=now()+interval '5 minutes' WHERE grant_id='oag_acceptance';`,
  assertCount(render(queries[1]),1),
  assertCount(render(queries[1]),0),
  assertCount(render(queries[2]),0),
  assertCount(render(queries[3]),1),
  assertCount(render(queries[3]),0),
  `UPDATE command.principals SET state='revoked' WHERE principal_id='prn_oauth_owner';`,
  assertCount(render(queries[3],{3:'refresh-test-2'}),0),
  `UPDATE command.principals SET state='active' WHERE principal_id='prn_oauth_owner';`,
  `UPDATE command.roles SET permission_set='[]' WHERE role_id='rol_oauth_owner';`,
  assertCount(render(queries[3],{3:'refresh-test-2'}),0),
  `UPDATE command.roles SET permission_set='["*"]' WHERE role_id='rol_oauth_owner';`,
  assertCount(render(queries[2]),1),
  assertCount(render(queries[3],{3:'refresh-test-2'}),0)
];
console.log(`DO $accept$ DECLARE n integer; BEGIN BEGIN\n${steps.join('\n')}\nRAISE EXCEPTION SQLSTATE 'Z0001' USING MESSAGE='Acceptance passed; roll back fixtures'; EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL; END; END $accept$;`);
