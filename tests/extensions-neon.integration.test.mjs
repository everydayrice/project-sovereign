import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
import { createSovereignPlatform } from '../src/platform/sovereign-platform.mjs';
import { createServiceCredentialStore } from '../src/auth/service-credentials.mjs';
import { createNeonPersistence } from '../src/platform/neon-persistence.mjs';

test('Normalized extension bootstrap, Owner binding and outbox SQL execute atomically on Neon', {skip:!process.env.SOVEREIGN_EXTENSION_DB_FILE}, async()=>{
 assert.equal(process.env.SOVEREIGN_MACHINE_BRANCH_ID,'br-empty-rice-ayt9b4nn');
 const {url}=JSON.parse(await readFile(process.env.SOVEREIGN_EXTENSION_DB_FILE,'utf8'));assert.ok(!url.includes('ep-purple-glitter'));
 const sql=neon(url);const p=createSovereignPlatform();const tenant=p.command.createTenant({slug:'extension-db-'+crypto.randomUUID().slice(0,8),displayName:'Disposable extension verification'});
 const principal=p.command.createPrincipal({tenantId:tenant.tenant_id,displayName:'Owner'});const base={tenantId:tenant.tenant_id,principalId:principal.principal_id};
 const installed=p.extensions.install({...base,manifest:{manifest_version:1,id:'test.'+crypto.randomUUID(),name:'Disposable extension',publisher:'Test',version:'1.0.0',sovereign:{compatibility:'>=0.2.0',requested_scopes:['continuity:read'],events:['task.created']},privacy:{retention_behavior:'none',uninstall_behavior:'revoke'}},grantedScopes:['continuity:read']});
 const task=p.continuity.createTaskCapsule({tenantId:tenant.tenant_id,ownerPrincipalId:principal.principal_id,title:'Fixture',objective:'Verify mapping'});
 p.extensions.publish({tenantId:tenant.tenant_id,eventType:'task.created',subjectType:'task',subjectId:task.task_capsule_id});
 const statements=[];const persistence=createNeonPersistence(url,{httpSql:{},clientFactory:()=>({connect:async()=>{},end:async()=>{},query:async(q,params=[])=>{if(!['BEGIN','COMMIT','ROLLBACK'].includes(q))statements.push([q,params]);return {rows:[{tenant_id:tenant.tenant_id}],rowCount:1};}})});
 await persistence.bootstrapTenant({authSubjectReference:'fixture-'+crypto.randomUUID(),tenant,principal,store:p.store});
 // Execute the production-generated statements on real Postgres, rolled back as one batch.
 const result=await sql.transaction([...statements.map(([q,params])=>sql.query(q,params)),sql.query(`SELECT
 (SELECT count(*)::int FROM extensions.event_outbox WHERE tenant_id=$1) AS events,
 (SELECT count(*)::int FROM extensions.event_subscriptions WHERE tenant_id=$1) AS subscriptions,
 (SELECT count(*)::int FROM command.principal_role_bindings WHERE tenant_id=$1) AS owners`,[tenant.tenant_id]),sql.query('ROLLBACK')]);
 assert.deepEqual(result[statements.length][0],{events:1,subscriptions:1,owners:1});
 const [remaining]=await sql`SELECT count(*)::int AS count FROM command.tenants WHERE tenant_id=${tenant.tenant_id}`;assert.equal(remaining.count,0);
 assert.ok(installed.installation.extension_installation_id);
 const credentialStatements=[];
 const issuer=createServiceCredentialStore(url,{httpSql:{query:async q=>q.includes('permission_set')?[{permission_set:['*']}]:[{extension_installation_id:installed.installation.extension_installation_id,extension_grant_id:installed.grant.extension_grant_id,granted_scopes:['continuity:read']}]},clientFactory:()=>({connect:async()=>{},end:async()=>{},query:async(q,params=[])=>{if(!['BEGIN','COMMIT','ROLLBACK'].includes(q))credentialStatements.push([q,params]);return {rowCount:1,rows:[]};}})});
 const credential=await issuer.create({tenantId:tenant.tenant_id,createdByPrincipalId:principal.principal_id,displayName:'Disposable bound credential',scopes:['continuity:read'],extensionId:installed.extension.extension_id});
 let grantState='active';
 const resolver=createServiceCredentialStore(url,{httpSql:{query:async(q,params=[])=>{
   if(q.startsWith('UPDATE command.service_credentials SET last_used_at'))return [];
   const fixture=[...statements,...credentialStatements];
   const checks=await sql.transaction([...fixture.map(([statement,args])=>sql.query(statement,args)),sql.query('UPDATE extensions.grants SET state=$1 WHERE extension_grant_id=$2',[grantState,installed.grant.extension_grant_id]),sql.query(q,params),sql.query('ROLLBACK')]);
   return checks[fixture.length+1];
 }}});
 assert.equal((await resolver.resolveToken(credential.token)).extensionId,installed.extension.extension_id);
 grantState='reduced';assert.equal(await resolver.resolveToken(credential.token),null);
 grantState='revoked';assert.equal(await resolver.resolveToken(credential.token),null);

});
