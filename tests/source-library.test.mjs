import test from 'node:test';
import assert from 'node:assert/strict';
import { createSovereignPlatform } from '../src/platform/sovereign-platform.mjs';

test('Source archive and removal preserve evidence while excluding active inventory and object access',()=>{
 const p=createSovereignPlatform();const tenant=p.command.createTenant({slug:'source-library',displayName:'Library'});const principal=p.command.createPrincipal({tenantId:tenant.tenant_id,displayName:'Owner'});const base={tenantId:tenant.tenant_id,principalId:principal.principal_id};
 const source=p.sources.createManagedUpload({...base,fileName:'evidence.md',mimeType:'text/markdown',sizeBytes:10});
 p.sources.updateSource({...base,sourceId:source.source_id,displayName:'Renamed evidence',archived:true});assert.equal(p.sources.sourceHealth(base.tenantId).total,0);assert.equal(p.sources.sourceHealth(base.tenantId).registry.length,1);
 p.sources.updateSource({...base,sourceId:source.source_id,archived:false});assert.equal(p.sources.sourceHealth(base.tenantId).total,1);
 assert.throws(()=>p.sources.updateSource({...base,tenantId:'foreign',sourceId:source.source_id,removed:true}),{code:'not_found'});
 p.sources.updateSource({...base,sourceId:source.source_id,removed:true});assert.equal(p.sources.sourceHealth(base.tenantId).total,0);assert.equal(p.store.list('sourceItems')[0].privacy_state,'excluded');
 assert.equal(p.store.list('sources').length,1);assert.equal(p.store.list('auditEvents').at(-1).event_type,'source.removed');
});
