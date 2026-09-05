import { requireCondition } from "../platform/errors.mjs";

export class RetrievalService {
  constructor({ persistence }) {
    this.persistence = persistence;
  }

  async search({ tenantId, query, sourceId, limit = 12 }) {
    requireCondition(query?.trim(), "search_query_required", "Search query is required.");
    const results = await this.persistence.searchTenant({ tenantId, query, sourceId, limit });
    return {
      query: query.trim(),
      result_count: results.length,
      results
    };
  }

  async ask({ tenantId, query, sourceId, limit = 8 }) {
    const search = await this.search({ tenantId, query, sourceId, limit });
    const answer = synthesizeExtractiveAnswer(query, search.results);
    return {
      query: search.query,
      answer: answer.text,
      confidence: answer.confidence,
      evidence: answer.evidence,
      result_count: search.result_count,
      synthesis: "extractive_v1",
      provider: "sovereign_deterministic"
    };
  }
}

export function synthesizeExtractiveAnswer(query, results) {
  if (!results?.length) {
    return {
      text: "Sovereign could not find supporting information for that question in the authorized sources or current Canonical Intelligence.",
      confidence: "unknown",
      evidence: []
    };
  }

  const terms = meaningfulTerms(query);
  const rankedSentences = [];
  for (const result of results.slice(0, 8)) {
    for (const sentence of sentences(result.excerpt)) {
      rankedSentences.push({ result, sentence, score: sentenceScore(sentence, terms) + Number(result.rank ?? 0) });
    }
  }
  rankedSentences.sort((left, right) => right.score - left.score);
  const chosen = rankedSentences.filter((entry, index, all) =>
    entry.sentence.length > 1 && all.findIndex((candidate) => candidate.sentence.toLowerCase() === entry.sentence.toLowerCase()) === index
  ).slice(0, 3);

  const evidence = uniqueEvidence((chosen.length ? chosen : results.slice(0, 2).map((result) => ({ result, sentence: cleanExcerpt(result.excerpt) }))).map(({ result, sentence }) => ({
    kind: result.kind,
    id: result.id,
    source_id: result.source_id,
    source_item_id: result.source_item_id,
    source_name: result.source_name,
    heading: result.heading,
    excerpt: sentence,
    record_type: result.record_type,
    metadata: result.metadata
  })));

  const primary = chosen[0]?.sentence ?? cleanExcerpt(results[0].excerpt);
  const secondary = chosen.slice(1).map((entry) => entry.sentence).filter((sentence) => sentence !== primary);
  const text = [primary, ...secondary].join(" ");
  const sourceKinds = new Set(evidence.map((item) => item.kind));
  const confidence = results[0].kind === "canonical" ? "high" : (results.length >= 1 ? "supported" : "unknown");

  return {
    text: text || "Sovereign found relevant evidence, but could not produce a concise extractive answer.",
    confidence,
    evidence,
    source_kinds: [...sourceKinds]
  };
}

function meaningfulTerms(query) {
  const stop = new Set(["the","a","an","is","are","was","were","what","which","who","when","where","why","how","does","do","did","our","we","i","of","to","for","in","on","and","or","about","current","currently"]);
  return [...new Set(String(query ?? "").toLowerCase().match(/[a-z0-9][a-z0-9_.-]*/g) ?? [])].filter((term) => term.length > 1 && !stop.has(term));
}

function sentenceScore(sentence, terms) {
  const lower = sentence.toLowerCase();
  let score = 0;
  for (const term of terms) if (lower.includes(term)) score += 1;
  if (/\b(status|owner|date|priority|region|decision|policy|constraint)\b/i.test(sentence)) score += 0.25;
  return score;
}

function sentences(text) {
  const normalized = cleanExcerpt(text);
  if (!normalized) return [];
  return normalized
    .split(/(?<=[.!?])\s+|\n+/)
    .map((value) => value.replace(/^[-*+]\s*/, "").trim())
    .filter(Boolean);
}

function cleanExcerpt(value) {
  let text = String(value ?? "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("{") && text.endsWith("}"))) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === "string") text = parsed;
      else if (parsed?.statement) text = parsed.statement;
      else text = JSON.stringify(parsed);
    } catch {}
  }
  return text.replace(/\s+/g, " ").replace(/^[-*+]\s*/, "").trim();
}

function uniqueEvidence(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.kind}:${item.id}:${item.excerpt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
