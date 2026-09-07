import test from 'node:test';
import assert from 'node:assert/strict';
import { createSovereignPlatform } from '../src/platform/sovereign-platform.mjs';
import { exportTenant } from '../src/portability/export.mjs';
import { executeAgentOperation } from '../src/gateway/agent-operations.mjs';

test('Tenant export excludes other tenants, uninstalled catalog entries and authentication identities',()=>{
 const p=createSovereignPlatform();const a=p.command.createTenant({slug:'export-one',displayName:'One'});const b=p.command.createTenant({slug:'export-two',displayName:'Two'});
 p.command.createPrincipal({tenantId:a.tenant_id,displayName:'Owner',authSubjectReference:'do-not-export-auth-binding'});
 p.command.createPrincipal({tenantId:b.tenant_id,displayName:'Foreign'});
 p.store.put('extensions',{extension_id:'foreign-catalog',manifest:{id:'foreign'}});
 const result=exportTenant({platform:p,tenantId:a.tenant_id,ideas:[{tenant_id:b.tenant_id,title:'Foreign idea'}]});
 assert.equal(result.data.tenants.length,1);assert.equal(result.data.principals.length,1);assert.equal(result.data.extensions.length,0);assert.equal(result.data.ideas.length,0);assert.ok(!JSON.stringify(result).includes('do-not-export-auth-binding'));
});
test('Task-only API provides checkpoint context without traffic-board authority',async()=>{
 const p=createSovereignPlatform();const tenant=p.command.createTenant({slug:'task-detail',displayName:'Detail'});const owner=p.command.createPrincipal({tenantId:tenant.tenant_id,displayName:'Owner'});const task=p.continuity.createTaskCapsule({tenantId:tenant.tenant_id,ownerPrincipalId:owner.principal_id,title:'Task',objective:'Resume'});
 const result=await executeAgentOperation({name:'continuity_get',args:{kind:'task',task_capsule_id:task.task_capsule_id},auth:{tenantId:tenant.tenant_id,principalId:owner.principal_id,permissions:['continuity:read']},persistence:{loadTenant:async()=>({store:p.store,version:1})}});
 assert.equal(result.data.task.task_capsule_id,task.task_capsule_id);assert.deepEqual(result.data.recent_checkpoints,[]);assert.equal(result.data.current_traffic,undefined);
});
