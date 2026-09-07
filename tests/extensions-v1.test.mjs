import test from 'node:test';
import assert from 'node:assert/strict';
import { createSovereignPlatform } from '../src/platform/sovereign-platform.mjs';

const manifest={manifest_version:1,id:'example.queue',name:'Queue',publisher:'Example',version:'1.0.0',description:'Independent task view',sovereign:{compatibility:'>=0.2.0',requested_scopes:['continuity:read','continuity:write'],events:['task.created','task.updated']},ui:{launch_url:'https://queue.example.test'},privacy:{retention_behavior:'No local task persistence',uninstall_behavior:'Revoke access; preserve core state'}};
test('Extension events are scoped, acknowledged and stop on disable/revoke without removing core tasks',()=>{
 const p=createSovereignPlatform();const tenant=p.command.createTenant({slug:'extension-events',displayName:'Events'});const principal=p.command.createPrincipal({tenantId:tenant.tenant_id,displayName:'Owner'});const base={tenantId:tenant.tenant_id,principalId:principal.principal_id};
 const installed=p.extensions.install({...base,manifest,grantedScopes:['continuity:read']});const extensionId=installed.extension.extension_id;
 const task=p.continuity.createTaskCapsule({tenantId:base.tenantId,ownerPrincipalId:base.principalId,title:'Preserve me',objective:'Survive uninstall'});
 const event={tenantId:base.tenantId,eventType:'task.created',subjectType:'task',subjectId:task.task_capsule_id};p.extensions.publish(event);
 const events=p.extensions.events({...base,extensionId});assert.equal(events.length,1);assert.deepEqual(events[0].payload,{subject_id:task.task_capsule_id});
 p.extensions.acknowledge({...base,extensionId,eventId:events[0].extension_event_id});assert.equal(p.extensions.events({...base,extensionId}).length,0);
 p.extensions.setEnabled({...base,extensionId,enabled:false});assert.throws(()=>p.extensions.events({...base,extensionId}),{code:'extension_scope_denied'});p.extensions.publish(event);
 p.extensions.setEnabled({...base,extensionId,enabled:true});assert.equal(p.extensions.events({...base,extensionId}).length,0);
 p.extensions.revoke({...base,extensionId});assert.throws(()=>p.extensions.events({...base,extensionId}),{code:'extension_access_revoked'});
 const reinstalled=p.extensions.install({...base,manifest,grantedScopes:['continuity:read']});assert.equal(reinstalled.installation.extension_installation_id,installed.installation.extension_installation_id);assert.notEqual(reinstalled.grant.extension_grant_id,installed.grant.extension_grant_id);
 p.extensions.uninstall({...base,extensionId});assert.ok(p.continuity.requireTask(base.tenantId,task.task_capsule_id));assert.equal(p.extensions.list(base.tenantId)[0].state,'uninstalled');
 assert.ok(p.store.list('auditEvents').some(item=>item.event_type==='extension.uninstalled'));
});
test('Invalid extension events fail before any state mutation',()=>{
 const p=createSovereignPlatform();const before=p.store.exportState();
 assert.throws(()=>p.extensions.install({tenantId:'t',principalId:'p',manifest:{...manifest,sovereign:{...manifest.sovereign,events:['unsupported']}},grantedScopes:['continuity:read']}),{code:'extension_event_invalid'});
 assert.deepEqual(p.store.exportState(),before);
});
