import test from 'node:test';
import assert from 'node:assert/strict';
import { intelligenceWorkbench } from '../src/console/workflows.mjs';
test('knowledge review escapes untrusted text and keeps approval and reversal controls',()=>{
 const change={title:'<script>unsafe</script>',state:'pending_approval',reason:'Review',canonical_change_set_id:'ccs_test',provenance:['javascript:alert(1)']};
 const snapshot={canonical_changes:[{change_set:change,operations:[{operation_type:'add',replacement:{payload:{title:'Readable decision',statement:'<img onerror=alert(1)>'}}}]}],canonical_records:[],candidates:[],sources:{sources:[]},canon_check:{coverage:'Bounded',possible_conflicts:[],source_issues:[],uncertainties:[]}};
 const html=intelligenceWorkbench(snapshot);
 assert.ok(html.includes('Readable decision'));
 assert.ok(html.includes('&lt;img onerror=alert(1)&gt;'));
 assert.ok(!html.includes('<script>unsafe'));
 assert.ok(!html.includes('href="javascript:'));
 assert.ok(html.includes('data-canon-action="approve" data-id="ccs_test"'));
 assert.ok(html.includes('<details class="technical"><summary>Audit and technical details</summary>'));
 change.state='applied';
 const applied=intelligenceWorkbench(snapshot);
 assert.ok(applied.includes('data-canon-action="revert"'));
 assert.ok(!applied.includes('data-canon-action="approve"'));
});

test('knowledge view switching defaults to saved records and follows URL history', async()=>{
 const {workflowAssets}=await import('../src/console/workflows.mjs');
 const {runInNewContext}=await import('node:vm');
 const ids=['knowledge-records','knowledge-review','knowledge-search','knowledge-health','knowledge-candidates','knowledge-history'];
 const panels=Object.fromEntries(ids.map(id=>[id,{id,hidden:false}]));
 const links=ids.map(id=>({hash:'#'+id,setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];}}));
 const location={hash:''};let onHash;
 const html=workflowAssets('intelligence');
 const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
 const document={querySelectorAll(selector){return selector==='[data-knowledge-nav] a'?links:[];},getElementById(id){return panels[id]??(id==='workflow-status'?{}:null);},addEventListener(){}};
 runInNewContext(script,{document,location,window:{addEventListener(name,fn){if(name==='hashchange')onHash=fn;}},URLSearchParams,fetch(){throw Error('Unexpected request');}});
 assert.equal(panels['knowledge-records'].hidden,false);
 assert.equal(panels['knowledge-review'].hidden,true);
 location.hash='#knowledge-review';onHash();
 assert.equal(panels['knowledge-records'].hidden,true);
 assert.equal(panels['knowledge-review'].hidden,false);
 assert.equal(links[1]['aria-current'],'page');
 location.hash='#unknown';onHash();assert.equal(panels['knowledge-records'].hidden,false);
});
