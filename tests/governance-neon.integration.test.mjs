import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {neon} from '@neondatabase/serverless';
import {createSovereignPlatform} from '../src/platform/sovereign-platform.mjs';
import {createNeonPersistence} from '../src/platform/neon-persistence.mjs';
import {manageGovernance} from '../src/command/governance-admin.mjs';

test('Governance SQL commits roles, versioned policies and audit consistently on disposable Neon', {skip:!process.env.SOVEREIGN_GOVERNANCE_DB_FILE},async()=>{
 assert.equal(process.env.SOVEREIGN_MACHINE_BRANCH_ID,'br-empty-rice-ayt9b4nn');const {url}=JSON.parse(await readFile(process.env.SOVEREIGN_GOVERNANCE_DB_FILE,'utf8'));assert.ok(!url.includes('ep-purple-glitter'));const sql=neon(url);
 const p=createSovereignPlatform();const tenant=p.command.createTenant({slug:'governance-'+crypto.randomUUID().slice(0,8),displayName:'Disposable governance'});const owner=p.command.createPrincipal({tenantId:tenant.tenant_id,displayName:'Owner'});const statements=[];let policy;
 const makeClient=()=>({connect:async()=>{},end:async()=>{},query:async(q,args=[])=>{
  if(!['BEGIN','COMMIT','ROLLBACK'].includes(q))statements.push([q,args]);
  if(q.startsWith('SELECT version'))return {rows:[{version:1}],rowCount:1};
  if(q.startsWith('SELECT count(DISTINCT'))return {rows:[{count:1}],rowCount:1};
  if(q.startsWith('INSERT INTO command.roles'))return {rows:[{role_id:args[0],tenant_id:args[1],name:args[2]}],rowCount:1};
  if(q.startsWith('INSERT INTO command.policies')){policy={policy_id:args[0],tenant_id:args[1],policy_type:args[2],state:'draft',rules:JSON.parse(args[3])};return {rows:[policy],rowCount:1};}
  if(q.startsWith('SELECT * FROM command.policies'))return {rows:[policy],rowCount:1};
  if(q.startsWith('UPDATE command.policies'))return {rows:q.includes("state='active',")?[{...policy,state:'active'}]:[],rowCount:1};
  return {rows:[{tenant_id:tenant.tenant_id}],rowCount:1};
 }});
 const persistence=createNeonPersistence(url,{httpSql:{},clientFactory:makeClient});await persistence.bootstrapTenant({authSubjectReference:'fixture-'+crypto.randomUUID(),tenant,principal:owner,store:p.store});
 const base={makeClient,tenantId:tenant.tenant_id,principalId:owner.principal_id};await manageGovernance({...base,action:'role_create',input:{name:'Reviewer',permissions:['intelligence.canonical.approve']}});await manageGovernance({...base,action:'policy_propose',input:{policy_type:'traffic',rules:{leaseTtlSeconds:900}}});await manageGovernance({...base,action:'policy_activate',input:{policy_id:policy.policy_id}});
 const rows=await sql.transaction([...statements.map(([q,args])=>sql.query(q,args)),sql.query(`SELECT (SELECT count(*)::int FROM command.roles WHERE tenant_id=$1) AS roles,(SELECT count(*)::int FROM audit.events WHERE tenant_id=$1) AS audits,(SELECT rules->>'leaseTtlSeconds' FROM command.policies WHERE tenant_id=$1 AND state='active') AS lease,(SELECT version::int FROM runtime.tenant_state_snapshots WHERE tenant_id=$1) AS version`,[tenant.tenant_id]),sql.query('ROLLBACK')]);
 assert.deepEqual(rows[statements.length][0],{roles:2,audits:3,lease:'900',version:4});const remaining=await sql.query('SELECT count(*)::int AS count FROM command.tenants WHERE tenant_id=$1',[tenant.tenant_id]);assert.equal(remaining[0].count,0);
});
