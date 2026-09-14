import { requireCondition } from '../platform/errors.mjs';
export function projectRecords(store, tenantId) {
 return store.list('canonicalRecords', r=>r.tenant_id===tenantId&&r.record_type==='project'&&r.lifecycle_state==='active');
}
export function requireProject(store, tenantId, id) {
 const record=store.requireTenant('canonicalRecords',id,tenantId);
 requireCondition(record.record_type==='project'&&record.lifecycle_state==='active','invalid_project','Choose an active approved project.');
 return record;
}
export function withProject(store,tenantId,references,projectId) {
 if(projectId===undefined)return references;
 if(projectId)requireProject(store,tenantId,projectId);
 const refs=(references??[]).filter(ref=>{const r=typeof ref==='string'?store.get('canonicalRecords',ref):null;return !(r?.tenant_id===tenantId&&r.record_type==='project');});
 return projectId?[...refs,projectId]:refs;
}
