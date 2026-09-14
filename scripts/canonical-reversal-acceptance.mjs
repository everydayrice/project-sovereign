// Opt-in rollback-only SQL acceptance against the isolated regression branch.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Client,neonConfig} from '@neondatabase/serverless';
import {createNeonPersistence} from '../src/platform/neon-persistence.mjs';
import {createSovereignPlatform} from '../src/platform/sovereign-platform.mjs';
assert.equal(process.env.SOVEREIGN_ACCEPTANCE_BRANCH,'br-silent-wave-ayb8z6d5');
assert.ok(process.env.SOVEREIGN_ACCEPTANCE_DB_FILE,'Pass a branch-only connection file');
const {url}=JSON.parse(await fs.readFile(process.env.SOVEREIGN_ACCEPTANCE_DB_FILE,'utf8'));
assert.ok(!url.includes('ep-purple-glitter'),'Production database prohibited');
neonConfig.webSocketConstructor=WebSocket;
const client=new Client({connectionString:url,connectionTimeoutMillis:10000,query_timeout:15000});
await client.connect();
const transactionClient={connect:async()=>{},end:async()=>{},query:async(q,args)=>['BEGIN','COMMIT','ROLLBACK'].includes(q)?{rows:[]}:client.query(q,args)};
const persistence=createNeonPersistence(url,{clientFactory:()=>transactionClient,httpSql:{query:async(q,args)=>(await client.query(q,args)).rows}});
let tenant;
try {
 await client.query('BEGIN');
 const p=createSovereignPlatform();tenant=p.command.createTenant({slug:'reversal-'+crypto.randomUUID().slice(0,8),displayName:'Disposable reversal acceptance'});
 const owner=p.command.createPrincipal({tenantId:tenant.tenant_id,displayName:'Fixture owner'});
 const agent=p.command.createPrincipal({tenantId:tenant.tenant_id,displayName:'Fixture client',kind:'service'});
 await persistence.bootstrapTenant({authSubjectReference:'reversal-'+crypto.randomUUID(),tenant,principal:owner,store:p.store});
 const base={tenantId:tenant.tenant_id,principalId:owner.principal_id};
 async function step(action){const loaded=await persistence.loadTenant(tenant.tenant_id);const platform=createSovereignPlatform({store:loaded.store});const result=action(platform);await persistence.saveTenant({tenantId:tenant.tenant_id,store:platform.store,expectedVersion:loaded.version});return result;}
 const add=await step(p=>p.intelligence.proposeChangeSet({...base,title:'Initial fixture',reason:'Reversal acceptance',operations:[{type:'add',record:{recordType:'decision',payload:{title:'Fixture',value:'original'},provenance:['fixture:reversal'],scope:{project:'acceptance'}}}]}));
 const id=add.operations[0].created_record_id;
 await step(p=>{assert.throws(()=>p.intelligence.approveChangeSet({...base,principalId:agent.principal_id,changeSetId:add.change_set.canonical_change_set_id}),{code:'canonical_approval_required'});return p.intelligence.approveChangeSet({...base,changeSetId:add.change_set.canonical_change_set_id});});
 const update=await step(p=>p.intelligence.proposeChangeSet({...base,title:'Changed fixture',reason:'Reversal acceptance',operations:[{type:'update',recordId:id,patch:{payload:{title:'Fixture',value:'changed'}}}]}));
 await step(p=>p.intelligence.approveChangeSet({...base,changeSetId:update.change_set.canonical_change_set_id}));
 const reverse=await step(p=>{assert.equal(p.intelligence.getRecord({...base,recordId:id}).record.payload.value,'changed');return p.intelligence.revertChangeSet({...base,changeSetId:update.change_set.canonical_change_set_id,title:'Restore fixture',reason:'Verify preserved history'});});
 await step(p=>p.intelligence.approveChangeSet({...base,changeSetId:reverse.canonical_change_set_id}));
 const loaded=await persistence.loadTenant(tenant.tenant_id);const fresh=createSovereignPlatform({store:loaded.store});
 const record=fresh.intelligence.getRecord({...base,recordId:id});
 assert.equal(record.record.payload.value,'original');assert.equal(record.revisions.length,3);
 assert.equal(fresh.intelligence.canonicalStatus(base).current_canonical_revision,3);
 assert.equal(fresh.intelligence.getChangeSet(tenant.tenant_id,update.change_set.canonical_change_set_id).change_set.state,'applied');
 assert.equal(fresh.intelligence.getChangeSet(tenant.tenant_id,reverse.canonical_change_set_id).change_set.revert_of_change_set_id,update.change_set.canonical_change_set_id);
 console.log(JSON.stringify({status:'passed',storage:'real normalized Neon SQL',canonical_revision:3,preserved_record_revisions:3,unauthorized_approval:'rejected',verification:'fresh hydration within rollback transaction'}));
} finally {await client.query('ROLLBACK');if(tenant){const r=await client.query('SELECT count(*)::int AS count FROM command.tenants WHERE tenant_id=$1',[tenant.tenant_id]);assert.equal(r.rows[0].count,0);console.log('Rollback verified: fixture tenant absent.');}await client.end();}
