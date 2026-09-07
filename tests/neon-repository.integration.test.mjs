import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { Client, neon, neonConfig } from "@neondatabase/serverless";
import { createNeonPersistence } from "../src/platform/neon-persistence.mjs";
import { createSovereignPlatform } from "../src/platform/sovereign-platform.mjs";
import { RetrievalService } from "../src/intelligence/retrieval-service.mjs";
import { ingestTextSource } from "../src/analysis/source-ingestion.mjs";

// Explicit opt-in, restricted to the disposable branch prepared for this run.
const enabled = Boolean(process.env.SOVEREIGN_TEST_DATABASE_URL);
if (enabled) {
  assert.equal(process.env.SOVEREIGN_TEST_BRANCH_ID, "br-super-violet-ay6g5iiq");
  assert.ok(!process.env.SOVEREIGN_TEST_DATABASE_URL.includes("ep-purple-glitter"));
  neonConfig.webSocketConstructor = WebSocket;
}
const url = process.env.SOVEREIGN_TEST_DATABASE_URL;
const sql = enabled ? neon(url) : null;
const persistence = enabled ? createNeonPersistence(url, { clientFactory: () => new Client({connectionString:url,connectionTimeoutMillis:15000,query_timeout:30000}) }) : null;

test("Neon: real migrated source answers the acceptance question without canon", { skip: !enabled }, async () => {
  const [tenant] = await sql`SELECT tenant_id FROM command.tenants WHERE slug='rice'`;
  const result = await new RetrievalService({ persistence }).ask({ tenantId: tenant.tenant_id, query: "What is ORBIT TEST's status?" });
  assert.match(result.answer, /ORBIT TEST has status: ACTIVE/);
  assert.ok(result.evidence.some(e => e.source_name === "project-sovereign-test-source.md"));
  assert.deepEqual(await persistence.searchTenant({ tenantId: "wrong-tenant", query: "ORBIT TEST" }), []);
});

test("Neon: 0004 is repeatable and preserves the rollback snapshot", { skip: !enabled }, async () => {
  const before = await sql`SELECT tenant_id,version,md5(state::text) AS digest FROM runtime.tenant_state_snapshots ORDER BY tenant_id`;
  const counts = await sql`SELECT count(*)::int AS count FROM intelligence.source_chunks`;
  const client = new Client(url);
  await client.connect();
  try { await client.query(await readFile(new URL("../db/migrations/0004_v1_normalized_runtime_search.sql", import.meta.url), "utf8")); }
  finally { await client.end(); }
  assert.deepEqual(await sql`SELECT tenant_id,version,md5(state::text) AS digest FROM runtime.tenant_state_snapshots ORDER BY tenant_id`, before);
  assert.deepEqual(await sql`SELECT count(*)::int AS count FROM intelligence.source_chunks`, counts);
});

test("Neon: RLS excludes other tenants under a non-owner database role", { skip: !enabled }, async () => {
  const client = new Client(url);
  await client.connect();
  const role = `acceptance_rls_${crypto.randomUUID().replaceAll("-", "")}`;
  try {
    await client.query("BEGIN");
    const tenant = (await client.query("SELECT tenant_id FROM command.tenants WHERE slug='rice'")).rows[0].tenant_id;
    await client.query(`CREATE ROLE ${role} NOLOGIN`);
    await client.query(`GRANT ${role} TO CURRENT_USER`);
    await client.query(`GRANT USAGE ON SCHEMA intelligence,command TO ${role}`);
    await client.query(`GRANT SELECT ON intelligence.source_chunks TO ${role}`);
    await client.query(`SET LOCAL ROLE ${role}`);
    await client.query("SELECT set_config('app.sovereign_tenant_id',$1,true)",[tenant]);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM intelligence.source_chunks")).rows[0].n,9);
    await client.query("SELECT set_config('app.sovereign_tenant_id','wrong-tenant',true)");
    assert.equal((await client.query("SELECT count(*)::int AS n FROM intelligence.source_chunks")).rows[0].n,0);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});

test("Neon: bootstrap, canonical history, traffic, rollback and concurrent writes round-trip", { skip: !enabled }, async () => {
  console.log("repository acceptance: bootstrap");
  let platform = createSovereignPlatform();
  const suffix = crypto.randomUUID().slice(0, 8);
  const tenant = platform.command.createTenant({ slug: `acceptance-${suffix}`, displayName: "Disposable acceptance tenant" });
  const tenantId = tenant.tenant_id;
  const principal = platform.command.createPrincipal({ tenantId, displayName: "Acceptance owner" });
  const principalId = principal.principal_id;
  const workspace = platform.command.createWorkspace({ tenantId, principalId, slug: "main", displayName: "Main" });
  await persistence.bootstrapTenant({ authSubjectReference: `test:${suffix}`, tenant, principal, workspace, store: platform.store });
  let loaded;
  const reload = async () => { loaded = await persistence.loadTenant(tenantId); platform = createSovereignPlatform({ store: loaded.store }); };
  const save = async () => persistence.saveTenant({ tenantId, store: platform.store, expectedVersion: loaded.version });
  await reload();
  assert.deepEqual(platform.store.exportChanges(), {});
  assert.equal(platform.command.listWorkspaces(tenantId)[0].display_name, "Main");

  console.log("repository acceptance: canon");
  const proposal = platform.intelligence.proposeChangeSet({ tenantId, principalId, title: "Synthetic fact", reason: "Repository acceptance", operations: [{type:"add", record:{recordType:"fact",payload:{statement:"NEBULA TEST status is ACTIVE"}}}] });
  const changeSetId = proposal.change_set.canonical_change_set_id;
  platform.intelligence.approveChangeSet({ tenantId, principalId, changeSetId });
  await save();
  await reload();
  assert.equal(platform.intelligence.currentState(tenantId).current_revision, 1);
  const record = platform.intelligence.listRecords({ tenantId })[0];
  assert.equal(record.payload.statement, "NEBULA TEST status is ACTIVE");
  assert.equal(platform.intelligence.getRecord({ tenantId, recordId:record.canonical_record_id }).revisions.length, 1);
  assert.equal((await persistence.searchTenant({tenantId,query:"NEBULA"}))[0].kind, "canonical");
  assert.deepEqual(await persistence.searchTenant({tenantId,query:"NEBULA",sourceId:"missing-source"}), []);
  const reverted = platform.intelligence.revertChangeSet({ tenantId, principalId, changeSetId });
  platform.intelligence.approveChangeSet({ tenantId, principalId, changeSetId:reverted.canonical_change_set_id });
  await save();
  await reload();
  assert.equal(platform.intelligence.listRecords({tenantId}).length, 0);
  assert.equal(platform.intelligence.getRecord({tenantId,recordId:record.canonical_record_id}).revisions.length, 2);

  console.log("repository acceptance: traffic");
  const task = platform.continuity.createTaskCapsule({tenantId,ownerPrincipalId:principalId,title:"Handoff test",objective:"Durable continuation"});
  const traffic = platform.traffic.checkIn({tenantId,principalId,taskCapsuleId:task.task_capsule_id,objective:"Work",actor:{provider:{key:"test"},surface:{key:"http"}}});
  platform.continuity.createCheckpoint({tenantId,trafficSession:traffic.traffic_session,summary:"Material state",nextAction:"Resume"});
  await save();
  await reload();
  assert.equal(platform.continuity.recentCheckpoints(tenantId,task.task_capsule_id)[0].summary,"Material state");

  console.log("repository acceptance: concurrency");
  const a = await persistence.loadTenant(tenantId);
  const b = await persistence.loadTenant(tenantId);
  a.store.update("taskCapsules",task.task_capsule_id,{next_action:"First writer"});
  b.store.update("taskCapsules",task.task_capsule_id,{next_action:"Second writer"});
  const results = await Promise.allSettled([a,b].map(value => persistence.saveTenant({tenantId,store:value.store,expectedVersion:value.version})));
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(results.find(r=>r.status==="rejected").reason.code,"tenant_state_conflict");
  await reload();
  console.log("repository acceptance: rollback");
  const beforeVersion = loaded.version;
  platform.store.update("tenants",tenantId,{display_name:"Must roll back"});
  platform.store.update("taskCapsules",task.task_capsule_id,{owner_principal_id:"nonexistent"});
  await assert.rejects(save);
  await reload();
  assert.equal(loaded.version,beforeVersion);
  assert.equal(platform.store.get("tenants",tenantId).display_name,"Disposable acceptance tenant");

  console.log("repository acceptance: isolation");
  const [other] = await sql`SELECT principal_id,tenant_id FROM command.principals WHERE tenant_id<>${tenantId} LIMIT 1`;
  platform.store.put("principals",{...principal,principal_id:other.principal_id,display_name:"Must not cross tenants"});
  await assert.rejects(save, error=>error.code==="tenant_persistence_mismatch");
  const [untouched] = await sql`SELECT tenant_id FROM command.principals WHERE principal_id=${other.principal_id}`;
  assert.equal(untouched.tenant_id,other.tenant_id);
  await reload();
  platform.store.update("taskCapsules",task.task_capsule_id,{owner_principal_id:other.principal_id});
  await assert.rejects(save, error=>error.code==="not_found");
  await reload();

  console.log("repository acceptance: atomic index");
  const source=platform.sources.createManagedUpload({tenantId,principalId,fileName:"atomic.txt",mimeType:"text/plain",sizeBytes:20});
  const item=platform.store.list("sourceItems", i=>i.source_id===source.source_id)[0];
  const ingestion=ingestTextSource({text:"Atomic index evidence",sourceId:source.source_id,sourceItemId:item.source_item_id});
  const replacement={sourceId:source.source_id,sourceItemId:item.source_item_id,chunks:ingestion.chunks};
  await persistence.saveTenant({tenantId,store:platform.store,expectedVersion:loaded.version,sourceChunkReplacements:[replacement]});
  await reload();
  assert.equal((await persistence.searchTenant({tenantId,query:"Atomic"})).length,1);
  const versionBeforeIndexFailure=loaded.version;
  platform.store.update("sourceItems",item.source_item_id,{privacy_state:"excluded"});
  await assert.rejects(persistence.saveTenant({tenantId,store:platform.store,expectedVersion:loaded.version,sourceChunkReplacements:[{...replacement,chunks:[{...ingestion.chunks[0],ordinal:-1}]}]}));
  await reload();
  assert.equal(loaded.version,versionBeforeIndexFailure);
  assert.equal(platform.store.get("sourceItems",item.source_item_id).privacy_state,"included");
  assert.equal((await persistence.searchTenant({tenantId,query:"Atomic"})).length,1);
  platform.store.update("sourceItems",item.source_item_id,{privacy_state:"excluded"});
  await save();
  assert.deepEqual(await persistence.searchTenant({tenantId,query:"Atomic"}),[]);
});
