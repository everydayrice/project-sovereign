import assert from 'node:assert/strict';
import test from 'node:test';
import { zipSync, strToU8 } from 'fflate';
import { ingestStoredSource, supportsAutomaticIngestion } from '../src/analysis/document-ingestion.mjs';

const zip = files => zipSync(Object.fromEntries(Object.entries(files).map(([path, text]) => [path, strToU8(text)])));
const ingest = (bytes, fileName) => ingestStoredSource({ object: new Blob([bytes]), fileName, sourceId: 'src_doc', sourceItemId: 'sri_doc', mimeType: 'application/octet-stream' });

test('DOCX extracts ordered body and table paragraphs with provenance and no automatic canon', async () => {
  const bytes = zip({ 'word/document.xml': '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Launch &amp; review</w:t></w:r><w:r><w:tab/><w:t>September</w:t></w:r><w:del><w:r><w:delText>obsolete</w:delText></w:r></w:del></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Table evidence</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>' });
  const result = await ingest(bytes, 'review.docx');
  assert.equal(result.parser, 'docx_text_v1');
  assert.deepEqual(result.chunks.map(c => c.chunk_text), ['Launch & review\tSeptember', 'Table evidence']);
  assert.deepEqual(result.chunks.map(c => c.metadata.paragraph_number), [1, 2]);
  assert.deepEqual(result.candidates, []);
});

function workbook(sheet) {
  return {
    'xl/workbook.xml': '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sales" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Résumé</t></si><si><r><t>Two </t></r><r><t>parts</t></r></si></sst>',
    'xl/worksheets/sheet1.xml': sheet
  };
}
test('XLSX preserves sheet names, sparse cell addresses, shared strings and cached formulas', async () => {
  const bytes = zip(workbook('<worksheet><sheetData><row r="2"><c r="A2" t="s"><v>0</v></c><c r="C2" t="inlineStr"><is><t>Ready</t></is></c><c r="D2"><f>SUM(E2:F2)</f><v>12</v></c><c r="G2" t="b"><v>1</v></c></row><row r="3"><c r="A3" t="s"><v>1</v></c></row></sheetData></worksheet>'));
  const result = await ingest(bytes, 'sales.xlsx');
  assert.equal(result.parser, 'xlsx_text_v1');
  assert.match(result.chunks[0].chunk_text, /A2: Résumé\nC2: Ready\nD2: 12 \[formula: =SUM\(E2:F2\); cached value shown\]\nG2: true/);
  assert.equal(result.chunks[0].metadata.sheet_name, 'Sales');
  assert.equal(result.chunks[0].metadata.row_number, 2);
  assert.equal(result.chunks[1].chunk_text, 'A3: Two parts');
});

// Small, valid PDF fixture with a real cross-reference table and Helvetica text.
function pdfFixture(text) {
  const stream = text ? `BT /F1 12 Tf 40 240 Td (${text}) Tj ET` : '';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let content = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(content.length); content += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = content.length;
  content += `xref\n0 6\n0000000000 65535 f \n` + offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  content += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return strToU8(content);
}
test('PDF extracts actual text with page references and rejects textless documents', async () => {
  assert.equal(supportsAutomaticIngestion({ fileName: 'report.PDF' }), true);
  const result = await ingest(pdfFixture('Sovereign launch evidence'), 'report.pdf');
  assert.equal(result.parser, 'pdf_text_v1');
  assert.match(result.chunks[0].chunk_text, /Sovereign launch evidence/);
  assert.equal(result.chunks[0].metadata.page_number, 1);
  await assert.rejects(ingest(pdfFixture(''), 'scan.pdf'), /No extractable text/);
});

test('document parsing rejects broken archives, XML entities, external sheets and excessive expansion', async () => {
  await assert.rejects(ingest(strToU8('not a document'), 'broken.docx'), { code: 'source_parse_failed' });
  await assert.rejects(ingest(zip({ 'word/document.xml': '<!DOCTYPE doc [<!ENTITY custom "bad">]><doc>&custom;</doc>' }), 'entities.docx'), /entity declarations/);
  const external = workbook('<worksheet/>');
  external['xl/_rels/workbook.xml.rels'] = '<Relationships><Relationship Id="rId1" Target="https://example.com" TargetMode="External"/></Relationships>';
  await assert.rejects(ingest(zip(external), 'external.xlsx'), /unsupported sheet relationship/);
  await assert.rejects(ingest(zip({ 'word/document.xml': 'x'.repeat(10_000_001) }), 'huge.docx'), /Expanded document/);
  await assert.rejects(ingest(new Uint8Array(10 * 1024 * 1024 + 1), 'huge.pdf'), /10 MB/);
  await assert.rejects(ingest(zip(workbook('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>999</v></c></row></sheetData></worksheet>')), 'bad.xlsx'), /invalid shared-string/);
});
