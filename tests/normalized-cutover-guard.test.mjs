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
