import { SovereignError } from '../platform/errors.mjs';

function invalid(message) { throw new SovereignError('source_parse_failed', message, { status: 422 }); }

export function parseDelimited(text, delimiter = ',') {
  const records = [];
  let row = [], field = '', quoted = false, closed = false;
  const cell = () => { row.push(field); field = ''; closed = false; if (row.length > 1000) invalid('Table exceeds 1,000 columns.'); };
  const record = () => { cell(); if (row.length > 1 || row[0] !== '') records.push(row); row = []; if (records.length > 100001) invalid('Table exceeds 100,000 data rows.'); };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += char;
    } else if (char === delimiter) cell();
    else if (char === '\n') record();
    else if (char === '"' && field === '' && !closed) quoted = true;
    else {
      if (closed || char === '"') invalid(`Malformed quoted field in record ${records.length + 1}.`);
      field += char;
    }
  }
  if (quoted) invalid('Table ends inside a quoted field.');
  if (field !== '' || row.length || closed) record();
  if (!records.length) return [];
  const headers = records[0];
  const labels = headers.map((name, i) => !name ? `Column ${i + 1}` : headers.filter(h => h === name).length > 1 ? `${name} (column ${i + 1})` : name);
  for (let i = 1; i < records.length; i++) if (records[i].length !== headers.length) invalid(`Record ${i + 1} has ${records[i].length} fields; expected ${headers.length}.`);
  if (records.length === 1) return [{ heading: 'Table columns', text: labels.join(' | '), metadata: { row_number: 1, columns: headers } }];
  return records.slice(1).map((values, i) => ({ heading: `Row ${i + 2}`,
    text: values.map((value, j) => `${labels[j]}: ${value}`).join('\n'),
    metadata: { row_number: i + 2, columns: headers } }));
}

export function parseJsonRecords(text, lines = false) {
  const parse = (value, label) => { try { return JSON.parse(value); } catch { invalid(`Invalid JSON${label ? ` at line ${label}` : ''}.`); } };
  if (lines) return text.split('\n').flatMap((line, index) => line.trim() ? [{ heading: `Line ${index + 1}`, text: JSON.stringify(parse(line, index + 1), null, 2), metadata: { line_number: index + 1 } }] : []);
  const value = parse(text);
  const items = Array.isArray(value) ? value : [value];
  return items.map((item, i) => ({ heading: Array.isArray(value) ? `Item ${i + 1}` : 'JSON document', text: JSON.stringify(item, null, 2), metadata: { record_number: i + 1 } }));
}

export function splitStructuredRecords(records, maxChars) {
  return records.flatMap(record => {
    const count = Math.max(1, Math.ceil(record.text.length / maxChars));
    return Array.from({ length: count }, (_, index) => ({ ...record, text: record.text.slice(index * maxChars, (index + 1) * maxChars),
      metadata: { ...record.metadata, part: index + 1, part_count: count } }));
  });
}
