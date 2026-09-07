import {newId} from '../platform/ids.mjs';
import {requireCondition,SovereignError} from '../platform/errors.mjs';

export const GOVERNANCE_PERMISSIONS=['*','command.manage','command.service_credentials.manage','command.export','command.import','intelligence.canonical.approve','sources.manage','extensions.manage','recovery.manage'];
export const CLASSIFICATIONS=['public','internal','confidential','restricted'];
export function validatePolicy(type,rules){
 requireCondition(rules&&typeof rules==='object'&&!Array.isArray(rules),'policy_rules_invalid','Policy rules must be an object.');
 const fields={traffic:['leaseTtlSeconds'],privacy:['default_classification','minimum_classification'],approval:['require_human'],retention:['preserve_evidence']};
 requireCondition(fields[type]&&Object.keys(rules).length>0&&Object.keys(rules).every(key=>fields[type].includes(key)),'policy_rules_unsupported','Choose supported policy fields.');
 if(type==='traffic')requireCondition(Number.isInteger(rules.leaseTtlSeconds)&&rules.leaseTtlSeconds>=60&&rules.leaseTtlSeconds<=3600,'policy_lease_invalid','Lease must be 60–3,600 seconds.');
 if(type==='privacy'){
  requireCondition(CLASSIFICATIONS.includes(rules.default_classification)&&CLASSIFICATIONS.includes(rules.minimum_classification),'policy_classification_invalid','Choose valid default and minimum classifications.');
  requireCondition(CLASSIFICATIONS.indexOf(rules.default_classification)>=CLASSIFICATIONS.indexOf(rules.minimum_classification),'policy_classification_invalid','Default classification cannot be below the minimum.');
 }
 if(type==='approval')requireCondition(rules.require_human===true,'policy_human_review_required','Canonical approval must retain human review.');
 if(type==='retention')requireCondition(rules.preserve_evidence===true,'policy_evidence_required','Evidence history must remain preserved.');
 return structuredClone(rules);
}
export function activePolicy(store,tenantId,type){return store.list('policies',p=>p.tenant_id===tenantId&&p.policy_type===type&&p.state==='active'&&Date.parse(p.effective_at)<=Date.now()).sort((a,b)=>b.effective_at.localeCompare(a.effective_at))[0]?.rules??{};}

export async function manageGovernance({makeClient,tenantId,principalId,action,input={}}){
 requireCondition(['role_create','role_update','role_grant','role_revoke','policy_propose','policy_activate','policy_retire'].includes(action),'governance_action_invalid','Unknown governance action.');
 if(['role_create','role_update'].includes(action)){
  requireCondition(typeof input.name==='string'&&input.name.trim()&&input.name.length<=80,'role_name_required','Role name must be 1–80 characters.');
  requireCondition(Array.isArray(input.permissions)&&input.permissions.every(p=>GOVERNANCE_PERMISSIONS.includes(p)),'role_permissions_invalid','Use supported permissions.');
 }
 if(action==='role_update')requireCondition(typeof input.expected_updated_at==='string'&&Number.isFinite(Date.parse(input.expected_updated_at)),'role_version_required','Reload the role before editing.');
 if(action==='policy_propose')validatePolicy(input.policy_type,input.rules);
 const client=makeClient();await client.connect();
 try{
  await client.query('BEGIN');
  const lock=await client.query('SELECT version FROM runtime.tenant_state_snapshots WHERE tenant_id=$1 FOR UPDATE',[tenantId]);
  requireCondition(lock.rows.length===1,'tenant_state_not_found','Tenant state unavailable.',{status:404});
  const authorized=await client.query(`SELECT 1 FROM command.principal_role_bindings b JOIN command.roles r ON r.tenant_id=b.tenant_id AND r.role_id=b.role_id JOIN command.principals p ON p.tenant_id=b.tenant_id AND p.principal_id=b.principal_id WHERE b.tenant_id=$1 AND b.principal_id=$2 AND p.kind='human' AND p.state='active' AND (r.permission_set ? '*' OR r.permission_set ? 'command.manage') LIMIT 1`,[tenantId,principalId]);
  requireCondition(authorized.rows.length>0,'command_permission_denied','Your current role cannot administer governance.',{status:403});
  let before=[];
  if(action==='role_update')before=(await client.query('SELECT * FROM command.roles WHERE tenant_id=$1 AND role_id=$2 FOR UPDATE',[tenantId,input.role_id])).rows;
  if(action==='role_grant'||action==='role_revoke')before=(await client.query('SELECT * FROM command.principal_role_bindings WHERE tenant_id=$1 AND principal_id=$2 AND role_id=$3',[tenantId,input.principal_id,input.role_id])).rows;
  if(action==='policy_activate'||action==='policy_retire')before=(await client.query('SELECT * FROM command.policies WHERE tenant_id=$1 AND policy_id=$2 FOR UPDATE',[tenantId,input.policy_id])).rows;
  let result;
  if(action==='role_create')result=await client.query('INSERT INTO command.roles (role_id,tenant_id,name,permission_set) VALUES ($1,$2,$3,$4::jsonb) RETURNING *',[newId('rol'),tenantId,input.name.trim(),JSON.stringify([...new Set(input.permissions)])]);
  if(action==='role_update')result=await client.query('UPDATE command.roles SET name=$3,permission_set=$4::jsonb,updated_at=now() WHERE tenant_id=$1 AND role_id=$2 AND updated_at=$5::timestamptz RETURNING *',[tenantId,input.role_id,input.name.trim(),JSON.stringify([...new Set(input.permissions)]),input.expected_updated_at]);
  if(action==='role_grant')result=await client.query(`INSERT INTO command.principal_role_bindings (tenant_id,principal_id,role_id,granted_by_principal_id) SELECT $1,p.principal_id,r.role_id,$4 FROM command.principals p JOIN command.roles r ON r.tenant_id=p.tenant_id WHERE p.tenant_id=$1 AND p.principal_id=$2 AND r.role_id=$3 AND p.kind='human' AND p.state='active' ON CONFLICT (tenant_id,principal_id,role_id) DO UPDATE SET granted_by_principal_id=EXCLUDED.granted_by_principal_id RETURNING *`,[tenantId,input.principal_id,input.role_id,principalId]);
  if(action==='role_revoke')result=await client.query('DELETE FROM command.principal_role_bindings WHERE tenant_id=$1 AND principal_id=$2 AND role_id=$3 RETURNING *',[tenantId,input.principal_id,input.role_id]);
  if(action==='policy_propose')result=await client.query(`INSERT INTO command.policies (policy_id,tenant_id,policy_type,state,rules,effective_at) VALUES ($1,$2,$3,'draft',$4::jsonb,now()) RETURNING *`,[newId('pol'),tenantId,input.policy_type,JSON.stringify(input.rules)]);
  if(action==='policy_activate'){
   const selected=await client.query("SELECT * FROM command.policies WHERE tenant_id=$1 AND policy_id=$2 AND state='draft' FOR UPDATE",[tenantId,input.policy_id]);
   requireCondition(selected.rows.length===1,'policy_not_draft','Choose a draft policy.',{status:409});validatePolicy(selected.rows[0].policy_type,selected.rows[0].rules);
   const previous=await client.query("UPDATE command.policies SET state='superseded',revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND policy_type=$2 AND state='active' RETURNING policy_id",[tenantId,selected.rows[0].policy_type]);
   result=await client.query("UPDATE command.policies SET state='active',supersedes_policy_id=$3,effective_at=now(),revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND policy_id=$2 RETURNING *",[tenantId,input.policy_id,previous.rows[0]?.policy_id??null]);
  }
  if(action==='policy_retire')result=await client.query("UPDATE command.policies SET state='retired',revision=revision+1,updated_at=now() WHERE tenant_id=$1 AND policy_id=$2 AND state IN ('draft','active') RETURNING *",[tenantId,input.policy_id]);
  if(action==='role_update'&&before.length&&!result?.rows.length)throw new SovereignError('role_changed','This role changed since it was loaded. Reload before saving.',{status:409});
  requireCondition(result?.rows.length>0,'governance_target_not_found','No matching tenant-owned target.',{status:404});
  const owners=await client.query(`SELECT count(DISTINCT p.principal_id)::int AS count FROM command.principals p JOIN command.principal_role_bindings b ON b.tenant_id=p.tenant_id AND b.principal_id=p.principal_id JOIN command.roles r ON r.tenant_id=b.tenant_id AND r.role_id=b.role_id WHERE p.tenant_id=$1 AND p.state='active' AND p.kind='human' AND r.permission_set ? '*'`,[tenantId]);
  requireCondition(Number(owners.rows[0]?.count)>0,'last_owner_required','Keep at least one active human with Owner access.',{status:409});
  await client.query(`INSERT INTO audit.events (audit_event_id,tenant_id,principal_id,event_type,subject_type,subject_id,outcome,metadata) VALUES ($1,$2,$3,$4,'governance',$5,'success',$6::jsonb)`,[newId('aud'),tenantId,principalId,'governance.'+action,input.role_id??input.policy_id??result.rows[0].role_id??result.rows[0].policy_id,JSON.stringify({action,before,before_version:Number(lock.rows[0].version),result:result.rows[0]})]);
  await client.query(`UPDATE runtime.tenant_state_snapshots SET state=jsonb_set(jsonb_set(state,'{policies}',(SELECT COALESCE(jsonb_agg(to_jsonb(p)),'[]'::jsonb) FROM command.policies p WHERE p.tenant_id=$1)),'{auditEvents}',(SELECT COALESCE(jsonb_agg(to_jsonb(a)),'[]'::jsonb) FROM audit.events a WHERE a.tenant_id=$1)),version=version+1,updated_at=now() WHERE tenant_id=$1`,[tenantId]);
  await client.query('UPDATE runtime.tenant_state_snapshots SET state_hash=md5(state::text) WHERE tenant_id=$1',[tenantId]);
  await client.query('COMMIT');return {action,record:result.rows[0]};
 }catch(error){try{await client.query('ROLLBACK');}catch{}if(error.code==='23505')throw new SovereignError('governance_duplicate','This role name already exists.',{status:409});throw error;}finally{await client.end();}
}
