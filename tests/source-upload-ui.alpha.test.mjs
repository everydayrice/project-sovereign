import assert from "node:assert/strict";
import test from "node:test";
import { sourceUploadPageHtml } from "../src/console/source-upload-page.mjs";

test("Sources browser upload page exposes a real file input and upload endpoint", () => {
  const page = sourceUploadPageHtml();
  assert.match(page, /type="file"/);
  assert.match(page, /\/v1\/sources\/upload-file/);
  assert.match(page, /Data classification/);
  assert.match(page, /Upload file/);
  assert.match(page, /will not become Canonical Intelligence automatically/);
});
