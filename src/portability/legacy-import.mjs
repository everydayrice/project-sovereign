import {newId,stableHash} from '../platform/ids.mjs';
import {SovereignError,requireCondition} from '../platform/errors.mjs';
import {ingestTextSource} from '../analysis/source-ingestion.mjs';

export function previewLegacy({platform,tenantId,repository,commit,files}) {
 requireCondition(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) && /^[a-f0-9]{40}$/i.test(commit),'legacy_provenance_required','Repository and exact commit SHA are required.');
 requireCondition(Array.isArray(files)&&files.length>0&&files.length<=200,'legacy_files_required','Provide 1–200 explicitly selected files.');
 const inventory=files.map(file=>{
  requireCondition(typeof file.path==='string'&&!file.path.startsWith('/')&&!file.path.split('/').includes('..'),'legacy_path_invalid','A relative repository path is required.');
  requireCondition(file.content&&typeof file.content==='object'&&!Array.isArray(file.content),'legacy_record_invalid','Legacy JSON records must be objects.');
  requireCondition(file.checkpoints===undefined||(Array.isArray(file.checkpoints)&&file.checkpoints.length<=1000&&file.checkpoints.every(c=>c&&typeof c==='object'&&typeof c.summary==='string'&&c.summary.trim())), 'legacy_checkpoints_invalid','Checkpoint history must contain summaries (maximum 1,000 per task).');
  const checkpoints=file.checkpoints??[];
  const record=file.content;const recordType=['fact','decision','policy','entity','project','domain','architecture','constraint','relationship','summary'].includes(record.kind)?record.kind:'summary';const kind=record.kind==='task_capsule'?'working_task':'intelligence_candidate';
  const provenance={repository,path:file.path,commit,legacy_id:record.id??null,source_created_at:record.created_at??null,source_updated_at:record.updated_at??null};
  const locator=`https://github.com/${repository}/blob/${commit}/${file.path.split('/').map(encodeURIComponent).join('/')}`;
  const existing=platform.sources.listSources(tenantId).find(source=>source.canonical_locator===locator);
  const conflicts=platform.store.list('canonicalRecords',item=>item.tenant_id===tenantId&&item.provenance?.some(ref=>ref.legacy_id===record.id&&record.id)).map(item=>item.canonical_record_id);
  return {entry_id:stableHash({repository,commit,path:file.path,record,checkpoints}),path:file.path,kind,record_type:recordType,title:String(record.title??record.name??record.id??file.path),lifecycle:record.status??record.state??'unknown',authority:'historical',provenance,locator,existing_source_id:existing?.source_id??null,possible_conflicts:conflicts,record,checkpoints};
 });
 requireCondition(new Set(inventory.map(item=>item.path)).size===inventory.length,'legacy_duplicate_path','Each path may appear only once.');
 return {format:'sovereign.legacy-preview',repository,commit,plan_hash:stableHash(inventory),inventory,canonical_writes:0,notice:'Intelligence imports remain candidates. Working tasks retain their legacy lifecycle. Review provenance, conflicts and timestamps before selecting entries.'};
}

export function applyLegacy({platform,tenantId,principalId,repository,commit,files,selectedIds,planHash}) {
 const plan=previewLegacy({platform,tenantId,repository,commit,files});
 requireCondition(plan.plan_hash===planHash,'legacy_plan_changed','Preview changed; review a new dry run.',{status:409});
 requireCondition(Array.isArray(selectedIds)&&selectedIds.length>0&&new Set(selectedIds).size===selectedIds.length,'legacy_selection_required','Select unique entries to import.');
 const selected=selectedIds.map(id=>plan.inventory.find(item=>item.entry_id===id));
 requireCondition(selected.every(Boolean),'legacy_selection_invalid','Selection is not part of this preview.');
 requireCondition(selected.every(item=>!item.existing_source_id),'legacy_already_imported','One or more selected files have already been imported.',{status:409});
 const imported=[];const chunks=[];
 // Validate all task identities before changing state.
 for(const item of selected)if(item.kind==='working_task')requireCondition(typeof item.record.title==='string'&&item.record.title.trim()&&typeof item.record.objective==='string'&&item.record.objective.trim()&&['planned','active','waiting','blocked','completed','cancelled'].includes(item.record.status),'legacy_task_invalid','Task title, objective and explicit lifecycle are required.');
 for(const item of selected){
  const source=platform.sources.createSource({tenantId,principalId,connectorKey:'github',displayName:item.title,locator:item.locator,authorityState:'historical',connectionState:'connected',currentness:'unknown',metadata:{legacy_provenance:item.provenance,imported_snapshot:true}});
  const inventory=platform.sources.recordInventory({tenantId,sourceId:source.source_id,items:[{name:item.path,locator:item.locator,mimeType:'application/json',sizeBytes:new TextEncoder().encode(JSON.stringify({record:item.record,checkpoints:item.checkpoints})).length,contentHash:stableHash({record:item.record,checkpoints:item.checkpoints})}]});
  const sourceItem=inventory.items[0];const ingestion=ingestTextSource({text:JSON.stringify({record:item.record,checkpoints:item.checkpoints}),sourceId:source.source_id,sourceItemId:sourceItem.source_item_id,fileName:item.path,mimeType:'application/json'});
  chunks.push({sourceId:source.source_id,sourceItemId:sourceItem.source_item_id,chunks:ingestion.chunks});
  platform.sources.updateProcessing({tenantId,sourceId:source.source_id,processingState:'analyzed',currentness:'unknown',delta:{analyzedItemCount:1,indexedItemCount:1}});
  let result,collection,id;
  if(item.kind==='working_task'){
   result=platform.continuity.createTaskCapsule({tenantId,ownerPrincipalId:principalId,title:item.record.title,objective:item.record.objective,state:item.record.status,nextAction:item.record.next_action??item.checkpoints.at(-1)?.next_action??(Array.isArray(item.checkpoints.at(-1)?.next_actions)?item.checkpoints.at(-1).next_actions.join('\n'):undefined),blockers:item.record.blocked_by??item.checkpoints.at(-1)?.blocked_by??[],intelligenceReferences:[{legacy_provenance:item.provenance,source_id:source.source_id,legacy_checkpoints:item.checkpoints}]});collection='taskCapsules';id=result.task_capsule_id;
  }else{
   result=platform.intelligence.createCandidate({tenantId,principalId,recordType:item.record_type,payload:{legacy_record:item.record,legacy_lifecycle:item.lifecycle},sourceIds:[source.source_id],provenance:[item.provenance],reason:'Selective legacy import; requires reconciliation and human review.'});collection='candidateIntelligence';id=result.candidate_intelligence_id;
  }
  const dates={};for(const key of ['created_at','updated_at'])if(typeof item.record[key]==='string'&&Number.isFinite(Date.parse(item.record[key])))dates[key]=new Date(item.record[key]).toISOString();
  if(Object.keys(dates).length)platform.store.update(collection,id,dates);
  imported.push({collection,id,revision:result.revision??null,source_id:source.source_id,source_revision:platform.store.get('sources',source.source_id).revision});
 }
 const audit=platform.store.put('auditEvents',{audit_event_id:newId('aud'),tenant_id:tenantId,principal_id:principalId,event_type:'legacy.imported',subject_type:'legacy_import',subject_id:plan.plan_hash,outcome:'success',metadata:{repository,commit,plan_hash:plan.plan_hash,imported},occurred_at:new Date().toISOString()});
 return {receipt_id:audit.audit_event_id,imported,canonical_writes:0,sourceChunkReplacements:chunks};
}

export function rollbackLegacy({platform,tenantId,principalId,receiptId}) {
 const receipt=platform.store.requireTenant('auditEvents',receiptId,tenantId);
 requireCondition(receipt.event_type==='legacy.imported'&&!receipt.metadata.rolled_back,'legacy_receipt_invalid','An active import receipt is required.',{status:409});
 const entries=receipt.metadata.imported;
 for(const entry of entries){const record=platform.store.requireTenant(entry.collection,entry.id,tenantId);const source=platform.store.requireTenant('sources',entry.source_id,tenantId);if((entry.revision!==null&&record.revision!==entry.revision)||(entry.collection==='candidateIntelligence'&&record.state!=='proposed')||source.revision!==entry.source_revision||platform.store.list('canonicalRecords',item=>item.tenant_id===tenantId&&item.source_ids?.includes(entry.source_id)).length)throw new SovereignError('legacy_rollback_requires_review','Imported state changed or became supporting canon; reconcile before rollback.',{status:409});}
 for(const entry of entries){platform.store.update(entry.collection,entry.id,current=>({...current,state:entry.collection==='taskCapsules'?'cancelled':'rejected',revision:current.revision?current.revision+1:undefined,updated_at:new Date().toISOString()}));platform.sources.updateSource({tenantId,principalId,sourceId:entry.source_id,removed:true});}
 platform.store.update('auditEvents',receiptId,{metadata:{...receipt.metadata,rolled_back:true,rolled_back_by:principalId,rolled_back_at:new Date().toISOString()}});
 return {receipt_id:receiptId,state:'rolled_back',history_preserved:true};
}
