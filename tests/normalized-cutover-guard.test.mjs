import assert from "node:assert/strict";
import test from "node:test";
import { createNormalizedNeonPersistence } from "../src/platform/neon-normalized-persistence.mjs";
import { RetrievalService } from "../src/intelligence/retrieval-service.mjs";

test("cutover refuses a legacy write absent from normalized tables", async () => {
  const persistence=createNormalizedNeonPersistence("postgres://unused",{httpSql:{query:async()=>[{
    runtimeVersion:4, tenants:[{tenant_id:"ten_1"}], sources:[],
    snapshotParity:{sources:[{id:"src_legacy",updated_at:"2026-09-07T10:00:00Z",revision:1}]}
  }]}});
  await assert.rejects(persistence.loadTenant("ten_1"),error=>error.code==="normalized_cutover_incomplete" && error.status===503);
});

test("cutover refuses newer legacy values even if the source ID already exists", async () => {
  const persistence=createNormalizedNeonPersistence("postgres://unused",{httpSql:{query:async()=>[{
    runtimeVersion:4, sources:[{source_id:"src_1",tenant_id:"ten_1",revision:1,updated_at:"2026-09-07T09:00:00Z"}],
    snapshotParity:{sources:[{id:"src_1",revision:2,updated_at:"2026-09-07T10:00:00Z"}]}
  }]}});
  await assert.rejects(persistence.loadTenant("ten_1"),error=>error.code==="normalized_cutover_incomplete");
});

test("extension grant freshness survives loading and subsequent permission-state writes", async () => {
  const updated="2026-09-07T17:53:00.776Z";
  const grant={extension_grant_id:"exg_test",tenant_id:"ten_1",extension_installation_id:"ins_1",state:"active",granted_scopes:["continuity:read"],granted_by_principal_id:"prn_1",granted_at:"2026-09-07T17:41:50.236Z",updated_at:updated,revision:2};
  const queries=[];
  const persistence=createNormalizedNeonPersistence("postgres://unused",{
    httpSql:{query:async()=>[{runtimeVersion:4,principals:[{principal_id:"prn_1",tenant_id:"ten_1"}],extensionInstallations:[{extension_installation_id:"ins_1",tenant_id:"ten_1",extension_id:"ext_1"}],extensionGrants:[grant],snapshotParity:{extensionGrants:[{id:"exg_test",updated_at:updated,revision:2}]}}]},
    clientFactory:()=>({connect:async()=>{},end:async()=>{},query:async(q,p)=>{queries.push({q,p});return {rows:q.startsWith('SELECT version')?[{version:4}]:[]};}})
  });
  const loaded=await persistence.loadTenant("ten_1");
  const next="2026-09-07T18:00:00.000Z";
  loaded.store.update("extensionGrants","exg_test",{state:"reduced",updated_at:next,revision:3});
  await persistence.saveTenant({tenantId:"ten_1",store:loaded.store,expectedVersion:4});
  const write=queries.find(({q})=>q.startsWith('INSERT INTO extensions.grants'));
  assert.ok(write);
  assert.match(write.q,/updated_at/);
  assert.match(write.q,/revision/);
  assert.ok(write.p.includes(next));
  assert.ok(write.p.includes(3));
});

test("extension grants still fail closed when the rollback mirror has newer permissions", async () => {
  const persistence=createNormalizedNeonPersistence("postgres://unused",{httpSql:{query:async()=>[{
    runtimeVersion:4,extensionGrants:[{extension_grant_id:"exg_test",tenant_id:"ten_1",updated_at:"2026-09-07T10:00:00Z",revision:1}],
    snapshotParity:{extensionGrants:[{id:"exg_test",updated_at:"2026-09-07T11:00:00Z",revision:2}]}
  }]}});
  await assert.rejects(persistence.loadTenant("ten_1"),error=>error.code==="normalized_cutover_incomplete" && error.details.collection==="extensionGrants");
});

test("Ask normalizes question words and possessives while Search preserves literal syntax", async () => {
  const queries=[];
  const retrieval=new RetrievalService({persistence:{searchTenant:async({query})=>{queries.push(query);return []}}});
  const result=await retrieval.ask({tenantId:"ten_1",query:"What is ORBIT TEST’s status?"});
  assert.equal(queries[0],"orbit test status");
  assert.equal(result.query,"What is ORBIT TEST’s status?");
  await retrieval.search({tenantId:"ten_1",query:'"ORBIT TEST" -inactive'});
  assert.equal(queries[1],'"ORBIT TEST" -inactive');
  await assert.rejects(retrieval.ask({tenantId:"ten_1",query:{}}),error=>error.code==="search_query_required");
});
