import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createSovereignPlatform} from '../src/platform/sovereign-platform.mjs';
import {previewLegacy,applyLegacy,rollbackLegacy} from '../src/portability/legacy-import.mjs';
test('prepared Sovereign document batch previews without writes and rolls back staged candidates',()=>{
 const bundle=JSON.parse(fs.readFileSync(new URL('../imports/sovereign-documents-20260914.json',import.meta.url)));
 const platform=createSovereignPlatform();const tenant=platform.command.createTenant({slug:'import-preview',displayName:'Import preview'});const owner=platform.command.createPrincipal({tenantId:tenant.tenant_id,displayName:'Owner'});
 const args={...bundle,platform,tenantId:tenant.tenant_id,principalId:owner.principal_id};
 for(const f of bundle.files)assert.equal(createHash('sha256').update(f.content.statement).digest('hex'),f.content.sha256);
 const before=platform.store.exportState();const plan=previewLegacy(args);assert.deepEqual(platform.store.exportState(),before);
 assert.equal(plan.inventory.length,3);assert.equal(plan.canonical_writes,0);
 const applied=applyLegacy({...args,planHash:plan.plan_hash,selectedIds:plan.inventory.map(x=>x.entry_id)});
 assert.equal(platform.store.list('candidateIntelligence').length,3);assert.equal(platform.store.list('canonicalRecords').length,0);
 assert.throws(()=>applyLegacy({...args,planHash:plan.plan_hash,selectedIds:plan.inventory.map(x=>x.entry_id)}));
 rollbackLegacy({...args,receiptId:applied.receipt_id});assert.ok(platform.store.list('candidateIntelligence').every(x=>x.state==='rejected'));
 assert.equal(platform.store.list('canonicalRecords').length,0);
});
