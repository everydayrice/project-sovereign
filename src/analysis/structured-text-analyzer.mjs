const SECTION_TYPES = [
  [/(^|\b)facts?($|\b)/i, "fact"],
  [/(^|\b)polic(?:y|ies)($|\b)/i, "policy"],
  [/(^|\b)decisions?($|\b)/i, "decision"],
  [/(^|\b)constraints?($|\b)/i, "constraint"]
];

export function analyzeStructuredText({ text, sourceId, sourceItemId }) {
  const sections = parseSections(String(text ?? ""));
  const candidates = [];

  for (const section of sections) {
    const recordType = classifySection(section.heading);
    if (!recordType) continue;
    for (const statement of statementsFromSection(section.body)) {
      candidates.push({
        recordType,
        payload: {
          statement,
          source_section: section.heading
        },
        scope: {},
        sourceIds: [sourceId],
        provenance: [{
          source_id: sourceId,
          source_item_id: sourceItemId,
          section: section.heading,
          analyzer: "structured_text_v0_2"
        }],
        confidence: "high",
        reason: "Explicit statement extracted from a labeled structured-text section."
      });
    }
  }

  return {
    analyzer: "structured_text_v0_2",
    supported_sections: SECTION_TYPES.map(([, type]) => type),
    section_count: sections.length,
    candidate_count: candidates.length,
    candidates
  };
}

function parseSections(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections = [];
  let current = null;

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      if (current) sections.push(current);
      current = { heading: heading[2].trim(), body: [] };
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) sections.push(current);
  return sections;
}

function classifySection(heading) {
  for (const [pattern, type] of SECTION_TYPES) {
    if (pattern.test(heading)) return type;
  }
  return null;
}

function statementsFromSection(lines) {
  const statements = [];
  let paragraph = [];

  const flush = () => {
    const value = normalizeStatement(paragraph.join(" "));
    if (value) statements.push(value);
    paragraph = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const bullet = /^[-*+]\s+(.+)$/.exec(line);
    if (bullet) {
      flush();
      const value = normalizeStatement(bullet[1]);
      if (value) statements.push(value);
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return statements;
}

function normalizeStatement(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
