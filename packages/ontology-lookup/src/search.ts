import type { OntologyIndex } from "./ontology-index.js";
import type { OntologyTermEntry, OntologySearchResult, OntologyTerm } from "./types.js";

function toOntologyTerm(term: OntologyTermEntry, ontology: string): OntologyTerm {
  return {
    accession: term.accession,
    label: term.label,
    synonyms: term.synonyms.map(s => s.text),
    ontology,
    obsolete: term.obsolete,
  };
}

/**
 * Search an OntologyIndex using a 5-tier scoring strategy.
 *
 * Tier 1: Exact accession (1.0) — query contains ":" and matches a term accession
 * Tier 2: Exact label (1.0) — case-insensitive exact label match
 * Tier 3: Exact synonym (0.9) — case-insensitive match on any synonym type
 * Tier 4: Prefix on label (0.8) or prefix on synonym (0.7)
 * Tier 5: Substring on label (0.5) or synonym (0.4)
 *
 * Results are deduplicated by accession (highest score wins) and sorted descending.
 */
export function searchIndex(
  index: OntologyIndex,
  query: string,
  limit: number
): OntologySearchResult[] {
  const normalized = query.toLowerCase().trim();
  const queryTrimmed = query.trim();
  const ontology = index.meta.ontology;
  const results = new Map<string, OntologySearchResult>();

  function add(accession: string, score: number, matchType: OntologySearchResult["matchType"]): void {
    const existing = results.get(accession);
    if (!existing || existing.score < score) {
      const term = index.termsById.get(accession);
      if (term) {
        results.set(accession, { term: toOntologyTerm(term, ontology), matchType, score });
      }
    }
  }

  // Tier 1: exact accession — only when query looks like an accession
  if (queryTrimmed.includes(":")) {
    const term = index.termsById.get(queryTrimmed);
    if (term) {
      add(term.accession, 1.0, "accession");
    }
  }

  // Tier 2: exact label
  const labelMatches = index.termsByLabel.get(normalized);
  if (labelMatches) {
    for (const acc of labelMatches) {
      add(acc, 1.0, "label");
    }
  }

  // Tier 3: exact synonym (all types — label entries also live here as EXACT)
  const synMatches = index.termsBySynonym.get(normalized);
  if (synMatches) {
    for (const { accession } of synMatches) {
      add(accession, 0.9, "synonym");
    }
  }

  // Tier 4 & 5: prefix / substring via sorted prefix entries
  for (const entry of index.getPrefixEntries()) {
    // Skip entries already resolved at their maximum possible score
    const existing = results.get(entry.accession);

    if (entry.text.startsWith(normalized) && entry.text !== normalized) {
      // Tier 4: prefix match
      const score = entry.isLabel ? 0.8 : 0.7;
      if (!existing || existing.score < score) {
        add(entry.accession, score, entry.isLabel ? "label" : "synonym");
      }
    } else if (entry.text.includes(normalized) && !entry.text.startsWith(normalized)) {
      // Tier 5: substring match (not prefix)
      const score = entry.isLabel ? 0.5 : 0.4;
      if (!existing || existing.score < score) {
        add(entry.accession, score, entry.isLabel ? "label" : "synonym");
      }
    }
  }

  return Array.from(results.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Strict resolution — only exact accession, exact label, or EXACT synonym.
 * Used for validation where fuzzy matching is undesirable.
 */
export function resolveIndex(index: OntologyIndex, value: string): OntologyTerm | null {
  const normalized = value.toLowerCase().trim();
  const valueTrimmed = value.trim();
  const ontology = index.meta.ontology;

  // Tier 1: exact accession
  if (valueTrimmed.includes(":")) {
    const term = index.termsById.get(valueTrimmed);
    if (term) return toOntologyTerm(term, ontology);
  }

  // Tier 2: exact label
  const labelMatches = index.termsByLabel.get(normalized);
  if (labelMatches && labelMatches.length > 0) {
    const term = index.termsById.get(labelMatches[0]);
    if (term) return toOntologyTerm(term, ontology);
  }

  // Tier 3: EXACT synonym only
  const synMatches = index.termsBySynonym.get(normalized);
  if (synMatches) {
    for (const { accession, type } of synMatches) {
      if (type === "EXACT") {
        const term = index.termsById.get(accession);
        if (term) return toOntologyTerm(term, ontology);
      }
    }
  }

  return null;
}
