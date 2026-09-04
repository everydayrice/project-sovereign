import assert from "node:assert/strict";
import test from "node:test";
import { analyzeStructuredText } from "../src/analysis/structured-text-analyzer.mjs";
import { sourceInitializePageHtml } from "../src/console/source-initialize-page.mjs";

const TEST_SOURCE = `# PROJECT SOVEREIGN TEST SOURCE

## Test facts

- The internal test project is named ORBIT TEST.
- ORBIT TEST has status: ACTIVE.
- The designated test owner is RICE.
- The test priority is HIGH.
- The test region is ORLANDO, FLORIDA.
- The test launch date is 2026-09-15.

## Test policy

For this test only, any change to ORBIT TEST's launch date should require explicit approval before becoming canonical.

## Test decision

Use Cloudflare R2 as the file storage target for this Project Sovereign upload test.

## Test constraint

This document contains synthetic test information only and should not be interpreted as a real business record.
`;

test("structured text analyzer extracts only explicitly labeled candidate intelligence", () => {
  const result = analyzeStructuredText({ text: TEST_SOURCE, sourceId: "src_test", sourceItemId: "sri_test" });
  assert.equal(result.analyzer, "structured_text_v0_2");
  assert.equal(result.candidate_count, 9);
  assert.deepEqual(
    result.candidates.reduce((counts, candidate) => ({ ...counts, [candidate.recordType]: (counts[candidate.recordType] ?? 0) + 1 }), {}),
    { fact: 6, policy: 1, decision: 1, constraint: 1 }
  );
  assert.equal(result.candidates.every((candidate) => candidate.sourceIds[0] === "src_test"), true);
  assert.equal(result.candidates.every((candidate) => candidate.provenance[0].source_item_id === "sri_test"), true);
});

test("structured text analyzer ignores unlabeled narrative sections", () => {
  const result = analyzeStructuredText({ text: "## Notes\nThis should not become Candidate Intelligence.", sourceId: "src", sourceItemId: "item" });
  assert.equal(result.candidate_count, 0);
});

test("source initialization page exposes only inventoried connected sources", () => {
  const html = sourceInitializePageHtml({ sources: [
    { source_id: "src_ready", display_name: "ready.md", source_category: "sovereign_managed", currentness: "current", connection_state: "connected", processing_state: "inventoried" },
    { source_id: "src_done", display_name: "done.md", source_category: "sovereign_managed", currentness: "current", connection_state: "connected", processing_state: "analyzed" }
  ] });
  assert.match(html, /ready\.md/);
  assert.doesNotMatch(html, /done\.md/);
  assert.match(html, /Initialize/);
});
