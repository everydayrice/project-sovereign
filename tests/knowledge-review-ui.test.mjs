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
