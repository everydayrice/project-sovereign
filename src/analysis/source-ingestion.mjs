import { parseDelimited, parseJsonRecords, splitStructuredRecords } from './structured-file-parser.mjs';
import { stableHash } from "../platform/ids.mjs";
import { analyzeStructuredText } from "./structured-text-analyzer.mjs";

const TEXT_EXTENSIONS = new Set([
  "txt","md","markdown","json","jsonl","ndjson","csv","tsv","xml","yaml","yml","toml",
  "js","mjs","cjs","ts","tsx","jsx","css","scss","html","htm","sql","py","rb","go","rs","java","kt","swift","php","sh","bash","zsh","ps1","env","ini","conf","log"
]);

export function supportsAutomaticTextIngestion({ fileName = "", mimeType = "" } = {}) {
  const extension = extensionOf(fileName);
  const mime = String(mimeType ?? "").toLowerCase();
  return mime.startsWith("text/") ||
    ["application/json","application/x-ndjson","application/ndjson","application/ld+json","application/xml","application/sql"].includes(mime) ||
    TEXT_EXTENSIONS.has(extension) ||
    (mime === "application/octet-stream" && TEXT_EXTENSIONS.has(extension));
}

export function ingestTextSource({ text, sourceId, sourceItemId, fileName = "source.txt", mimeType = "text/plain" }) {
  const normalized = normalizeText(text);
  const extension = extensionOf(fileName);
  const parser = parserFor(extension, mimeType);
  const chunks = chunkText(normalized, { parser, fileName }).map((chunk, ordinal) => ({
    source_chunk_id: `sch_${stableHash({ sourceItemId, ordinal, text: chunk.text })}`,
    ordinal,
    heading: chunk.heading ?? null,
    chunk_text: chunk.text,
    content_hash: stableHash(chunk.text),
    parser_key: parser,
    parser_version: "1.1",
    metadata: { ...chunk.metadata, file_name: fileName, mime_type: mimeType, source_id: sourceId, source_item_id: sourceItemId }
  }));

  const structured = ["md","markdown"].includes(extension)
    ? analyzeStructuredText({ text: normalized, sourceId, sourceItemId })
    : { analyzer: parser, candidate_count: 0, candidates: [] };

  return {
    parser,
    parser_version: "1.1",
    normalized_text_length: normalized.length,
    chunks,
    candidates: structured.candidates ?? []
  };
}

export function chunkText(text, { parser = "plain_text_v1", fileName = "source.txt", maxChars = 1800 } = {}) {
  if (!text.trim()) return [];
  if (parser === "json_v1" || parser === "jsonl_v1") return splitStructuredRecords(parseJsonRecords(text, parser === "jsonl_v1"), maxChars);
  if (parser === "delimited_v1" || parser === "tsv_v1") return splitStructuredRecords(parseDelimited(text, parser === "tsv_v1" ? "\t" : ","), maxChars);
  if (parser === "source_code_v1") return chunkCode(text, maxChars, fileName);
  return chunkNarrative(text, maxChars);
}

function chunkNarrative(text, maxChars) {
  const lines = text.split("\n");
  const blocks = [];
  let heading = null;
  let buffer = [];

  const flush = () => {
    const value = buffer.join("\n").trim();
    if (value) blocks.push({ heading, text: value });
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const match = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (match) {
      flush();
      heading = match[1].trim();
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return packBlocks(blocks, maxChars);
}

function chunkCode(text, maxChars, fileName) {
  const lines = text.split("\n");
  const blocks = [];
  let buffer = [];
  let start = 1;
  for (let index = 0; index < lines.length; index += 1) {
    const candidate = [...buffer, lines[index]].join("\n");
    if (candidate.length > maxChars && buffer.length) {
      blocks.push({ heading: `${fileName} lines ${start}-${index}`, text: buffer.join("\n") });
      buffer = [lines[index]];
      start = index + 1;
    } else buffer.push(lines[index]);
  }
  if (buffer.length) blocks.push({ heading: `${fileName} lines ${start}-${lines.length}`, text: buffer.join("\n") });
  return blocks.filter((block) => block.text.trim());
}

function packBlocks(blocks, maxChars) {
  const chunks = [];
  let current = null;
  for (const block of blocks) {
    if (block.text.length > maxChars) {
      if (current) { chunks.push(current); current = null; }
      for (let offset = 0; offset < block.text.length; offset += maxChars) {
        chunks.push({ heading: block.heading, text: block.text.slice(offset, offset + maxChars) });
      }
      continue;
    }
    const combined = current ? `${current.text}\n\n${block.text}` : block.text;
    if (current && combined.length > maxChars) {
      chunks.push(current);
      current = { heading: block.heading, text: block.text };
    } else if (current) {
      current.text = combined;
    } else current = { heading: block.heading, text: block.text };
  }
  if (current) chunks.push(current);
  return chunks;
}

function parserFor(extension, mimeType) {
  if (["jsonl","ndjson"].includes(extension) || String(mimeType).includes("ndjson")) return "jsonl_v1";
  if (extension === "json" || String(mimeType).includes("json")) return "json_v1";
  if (extension === "tsv" || String(mimeType).includes("tab-separated-values")) return "tsv_v1";
  if (extension === "csv" || String(mimeType).includes("csv")) return "delimited_v1";
  if (["js","mjs","cjs","ts","tsx","jsx","css","scss","html","htm","sql","py","rb","go","rs","java","kt","swift","php","sh","bash","zsh","ps1"].includes(extension)) return "source_code_v1";
  if (["md","markdown"].includes(extension)) return "markdown_v1";
  return "plain_text_v1";
}

function extensionOf(fileName) {
  const name = String(fileName ?? "").toLowerCase();
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1) : "";
}

function normalizeText(value) {
  return String(value ?? "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\u0000/g, "");
}
