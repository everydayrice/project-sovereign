import assert from "node:assert/strict";
import test from "node:test";
import { sourceUploadPageHtml } from "../src/console/source-upload-page.mjs";

test("Sources browser upload is a single automatic ingestion action", () => {
  const page = sourceUploadPageHtml();
  assert.match(page, /type="file"/);
  assert.match(page, /\/v1\/sources\/upload-file/);
  assert.match(page, /Data classification/);
  assert.match(page, /Upload file/);
  assert.match(page, /automatically processes supported content/);
  assert.match(page, /do not need to initialize the file or review every extracted statement/);
  assert.match(page, /Uploading and processing/);
});
