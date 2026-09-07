import assert from "node:assert/strict";
import test from "node:test";
import { InMemorySovereignStore } from "../src/platform/store.mjs";
import { ingestTextSource, supportsAutomaticTextIngestion } from "../src/analysis/source-ingestion.mjs";
import { synthesizeExtractiveAnswer } from "../src/intelligence/retrieval-service.mjs";

const SOURCE = `# PROJECT SOVEREIGN TEST SOURCE

## Test facts

- The internal test project is named ORBIT TEST.
- ORBIT TEST has status: ACTIVE.
- The designated test owner is RICE.

## Test policy

Any launch-date change requires explicit approval.
`;

test("hydration is clean and only later mutations become normalized dirty state", () => {
  const store = new InMemorySovereignStore().importState({
    tenants: [{ tenant_id: "ten_1", slug: "one", display_name: "One", command_display_name: "COMMAND" }]
  });
  assert.deepEqual(store.exportChanges(), {});
  store.update("tenants", "ten_1", (tenant) => ({ ...tenant, display_name: "Updated" }));
  assert.deepEqual(Object.keys(store.exportChanges()), ["tenants"]);
  assert.equal(store.exportChanges().tenants[0].display_name, "Updated");
  store.clearChanges();
  assert.deepEqual(store.exportChanges(), {});
});

test("automatic source ingestion makes ordinary Markdown searchable without canonization", () => {
  assert.equal(supportsAutomaticTextIngestion({ fileName: "source.md", mimeType: "text/markdown" }), true);
  assert.equal(supportsAutomaticTextIngestion({ fileName: "data.json", mimeType: "application/json" }), true);
  assert.equal(supportsAutomaticTextIngestion({ fileName: "scan.bin", mimeType: "application/octet-stream" }), false);

  const result = ingestTextSource({ text: SOURCE, sourceId: "src_1", sourceItemId: "sri_1", fileName: "source.md", mimeType: "text/markdown" });
  assert.equal(result.parser, "markdown_v1");
  assert.ok(result.chunks.length >= 1);
  assert.equal(result.chunks.some((chunk) => chunk.chunk_text.includes("ORBIT TEST has status: ACTIVE.")), true);
  assert.equal(result.candidates.length, 4);
  assert.equal(result.chunks.every((chunk) => chunk.source_chunk_id.startsWith("sch_fnv1a-")), true);
});

test("extractive Ask answers from evidence and preserves source references", () => {
  const answer = synthesizeExtractiveAnswer("What is ORBIT TEST's status?", [{
    kind: "source",
    id: "sch_1",
    source_id: "src_1",
    source_item_id: "sri_1",
    source_name: "project-sovereign-test-source.md",
    heading: "Test facts",
    excerpt: "ORBIT TEST has status: ACTIVE.",
    rank: 0.5,
    metadata: {}
  }]);
  assert.match(answer.text, /ORBIT TEST has status: ACTIVE\./);
  assert.equal(answer.confidence, "supported");
  assert.equal(answer.evidence[0].source_name, "project-sovereign-test-source.md");
  assert.equal(answer.evidence[0].source_item_id, "sri_1");
});
