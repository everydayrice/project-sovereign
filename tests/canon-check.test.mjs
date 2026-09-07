import test from 'node:test';
import assert from 'node:assert/strict';
import {createSovereignPlatform} from '../src/platform/sovereign-platform.mjs';
import {proposeCandidateForCanon} from '../src/intelligence/candidate-review.mjs';
test('Canon Check surfaces explicit subject contradictions without mutation or cross-tenant evidence',()=>{
 const platform=createSovereignPlatform();const tenant=platform.command.createTenant({slug:'canon-check',displayName:'Check'});const owner=platform.command.createPrincipal({tenantId:tenant.tenant_id,displayName:'Owner'});const base={tenantId:tenant.tenant_id,principalId:owner.principal_id};
 for(const status of ['active','cancelled'])platform.intelligence.createCandidate({...base,recordType:'fact',payload:{subject:'Synthetic project',status},scope:{project:'synthetic'}});
 const other=platform.command.createTenant({slug:'other-check',displayName:'Other'});const otherOwner=platform.command.createPrincipal({tenantId:other.tenant_id,displayName:'Other'});platform.intelligence.createCandidate({tenantId:other.tenant_id,principalId:otherOwner.principal_id,recordType:'fact',payload:{subject:'Synthetic project',status:'private'},scope:{project:'synthetic'}});
 const before=platform.store.exportState();const check=platform.intelligence.canonCheck(base);assert.equal(check.possible_conflicts.length,1);assert.equal(check.possible_conflicts[0].entries.length,2);assert.deepEqual(platform.store.exportState(),before);
 const candidate=platform.store.list('candidateIntelligence',item=>item.tenant_id===tenant.tenant_id)[0];const proposal=proposeCandidateForCanon({platform,...base,candidateId:candidate.candidate_intelligence_id});platform.intelligence.rejectChangeSet({...base,changeSetId:proposal.change_set.canonical_change_set_id,reason:'Conflicting evidence needs review'});assert.equal(platform.store.get('candidateIntelligence',candidate.candidate_intelligence_id).state,'rejected');
});
