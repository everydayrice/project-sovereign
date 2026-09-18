import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { getDocumentProxy } from 'unpdf';
import { stableHash } from '../platform/ids.mjs';
import { SovereignError } from '../platform/errors.mjs';
import { ingestTextSource, supportsAutomaticTextIngestion } from './source-ingestion.mjs';
import { splitStructuredRecords } from './structured-file-parser.mjs';

const MIME_FORMATS = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx'
};
function documentFormat({ fileName = '', mimeType = '' }) {
  const ext = String(fileName ?? '').toLowerCase().split('.').at(-1);
  return ['pdf','docx','xlsx'].includes(ext) ? ext : MIME_FORMATS[String(mimeType ?? '').toLowerCase().split(';')[0]];
}
export function supportsAutomaticIngestion(options) { return Boolean(documentFormat(options)) || supportsAutomaticTextIngestion(options); }
const fail = message => { throw new SovereignError('source_parse_failed', message, { status: 422 }); };

export async function ingestStoredSource({ object, ...options }) {
  const format = documentFormat(options);
  if (!format) {
    const text = typeof object.text === 'function' ? await object.text() : await new Response(object.body).text();
    return ingestTextSource({ ...options, text });
  }
  // Object-storage transport errors remain transport errors, not malformed-file errors.
  const buffer = typeof object.arrayBuffer === 'function' ? await object.arrayBuffer() : await new Response(object.body).arrayBuffer();
  if (buffer.byteLength > 10 * 1024 * 1024) fail('Document parsing supports files up to 10 MB. Upload a smaller document or text export.');
  try {
    const bytes = new Uint8Array(buffer);
    const records = format === 'pdf' ? await pdfRecords(bytes) : officeRecords(bytes, format);
    if (!records.some(r => r.text.trim())) fail('No extractable text was found. Scanned documents require OCR or a text export.');
    const parser = `${format}_text_v1`;
    const chunks = splitStructuredRecords(records.filter(r => r.text.trim()), 1800).map((record, ordinal) => ({
      source_chunk_id: `sch_${stableHash({ sourceItemId: options.sourceItemId, ordinal, text: record.text })}`,
      ordinal, heading: record.heading, chunk_text: record.text, content_hash: stableHash(record.text), parser_key: parser, parser_version: '1.0',
      metadata: { ...record.metadata, file_name: options.fileName, mime_type: options.mimeType, source_id: options.sourceId, source_item_id: options.sourceItemId }
    }));
    return { parser, parser_version: '1.0', normalized_text_length: records.reduce((n, r) => n + r.text.length, 0), chunks, candidates: [] };
  } catch (error) {
    if (error instanceof SovereignError) throw error;
    fail(`Could not parse this ${format.toUpperCase()} document. Check that it is valid and not password-protected, or upload a text export.`);
  }
}

async function pdfRecords(bytes) {
  const pdf = await getDocumentProxy(bytes, { isEvalSupported: false, useWorkerFetch: false, useSystemFonts: false, disableFontFace: true });
  try {
    if (pdf.numPages > 100) fail('PDF parsing supports up to 100 pages. Split the document into smaller files.');
    const records = [];
    let length = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = content.items.map(item => typeof item.str === 'string' ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
      length += text.length;
      if (length > 5_000_000) fail('Extracted document text exceeds 5 million characters. Split the file.');
      records.push({ heading: `Page ${number}`, text, metadata: { page_number: number, page_count: pdf.numPages } });
      page.cleanup();
    }
    return records;
  } finally { await pdf.loadingTask.destroy(); }
}

function officeRecords(bytes, format) {
  let total = 0, entries = 0;
  const allowed = name => format === 'docx' ? name === 'word/document.xml' : ['xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/sharedStrings.xml'].includes(name) || /^xl\/worksheets\/[^/]+\.xml$/.test(name);
  const files = unzipSync(bytes, { filter(info) {
    if (++entries > 10000) fail('Document archive contains too many entries.');
    if (!allowed(info.name)) return false;
    total += info.originalSize;
    if (info.originalSize > 10_000_000 || total > 20_000_000) fail('Expanded document content exceeds the parsing limit.');
    return true;
  } });
  const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, trimValues: false, ignoreDeclaration: true });
  const xml = path => {
    if (!files[path]) fail(`Document is missing ${path}.`);
    const text = strFromU8(files[path]);
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) fail('Document XML cannot contain custom entity declarations.');
    if (XMLValidator.validate(text) !== true) fail(`Invalid document XML in ${path}.`);
    return parser.parse(text);
  };
  if (format === 'docx') return all(xml('word/document.xml'), 'p').map((node, i) => ({ heading: `Paragraph ${i + 1}`, text: wordText(node.p), metadata: { paragraph_number: i + 1 } }));
  const strings = files['xl/sharedStrings.xml'] ? all(xml('xl/sharedStrings.xml'), 'si').map(node => all(node.si, 't').map(t => plain(t.t)).join('')) : [];
  const relationships = new Map(all(xml('xl/_rels/workbook.xml.rels'), 'Relationship').map(node => [attr(node, 'Id'), node]));
  const records = [];
  for (const sheet of all(xml('xl/workbook.xml'), 'sheet')) {
    const relation = relationships.get(attr(sheet, 'id'));
    if (!relation || attr(relation, 'TargetMode') === 'External') fail('Workbook contains an unsupported sheet relationship.');
    const target = attr(relation, 'Target');
    const path = target?.startsWith('/xl/') ? target.slice(1) : 'xl/' + target;
    if (!/^xl\/worksheets\/[^/]+\.xml$/.test(path)) fail('Workbook contains an unsupported sheet path.');
    const name = attr(sheet, 'name');
    for (const row of all(xml(path), 'row')) {
      const cells = all(row.row, 'c').map(cell => {
        const address = attr(cell, 'r');
        const type = attr(cell, 't');
        let value = plain(all(cell.c, 'v')[0]?.v ?? []);
        if (type === 's') {
          if (!/^\d+$/.test(value) || strings[Number(value)] === undefined) fail('Workbook has an invalid shared-string reference.');
          value = strings[Number(value)];
        } else if (type === 'inlineStr') value = all(cell.c, 't').map(t => plain(t.t)).join('');
        else if (type === 'b') value = value === '1' ? 'true' : 'false';
        const formula = plain(all(cell.c, 'f')[0]?.f ?? []);
        return `${address}: ${value}${formula ? ` [formula: =${formula}; cached value shown]` : ''}`;
      });
      records.push({ heading: `${name} · Row ${attr(row, 'r')}`, text: cells.join('\n'), metadata: { sheet_name: name, row_number: Number(attr(row, 'r')), values: 'stored_values_no_formula_evaluation' } });
      if (records.length > 100000) fail('Workbook exceeds 100,000 rows.');
    }
  }
  return records;
}

function attr(node, name) { return node?.[':@']?.['@_' + name]; }
function all(nodes, key) {
  const results = [];
  for (const node of nodes ?? []) for (const [tag, children] of Object.entries(node)) {
    if (tag === key) results.push(node);
    else if (Array.isArray(children)) results.push(...all(children, key));
  }
  return results;
}
function plain(nodes) { return (nodes ?? []).map(n => n['#text'] ?? '').join(''); }
function wordText(nodes) {
  return (nodes ?? []).map(node => Object.entries(node).map(([tag, children]) => {
    if (tag === 't') return plain(children);
    if (tag === 'tab') return '\t';
    if (tag === 'br' || tag === 'cr') return '\n';
    if (tag === 'del' || tag === 'instrText' || tag === ':@') return '';
    return Array.isArray(children) ? wordText(children) : '';
  }).join('')).join('');
}
