import { readFile } from "node:fs/promises";
import type { OntologyTermEntry } from "./types.js";
import { log } from "./utils.js";

const HIGH_LEVEL_RANKS = new Set([
  "NCBITaxon:genus",
  "NCBITaxon:family",
  "NCBITaxon:order",
  "NCBITaxon:class",
  "NCBITaxon:phylum",
  "NCBITaxon:kingdom",
  "NCBITaxon:superkingdom",
]);

export async function loadAllowlist(filePath: string): Promise<Set<string>> {
  const content = await readFile(filePath, "utf-8");
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  return new Set(lines);
}

/**
 * Reduces the full NCBITaxon term set (~2.4 M entries) to a manageable subset
 * relevant for proteomics/SDRF use.
 *
 * A term is included if it meets either of two criteria:
 *   1. It is in `allowlist` (explicit species) or is an ancestor of an allowlisted species.
 *   2. Its rank (from `rankMap`) is genus or higher (family, order, class, phylum, kingdom,
 *      superkingdom), or it is an ancestor of such a term.
 *
 * Criterion 2 ensures that the taxonomy backbone above the species level is always present,
 * so consumers can still traverse the hierarchy for any returned term even if the species
 * itself was not explicitly allowlisted.
 *
 * Ancestor traversal uses an index-based BFS queue rather than recursive DFS to avoid
 * call-stack limits on the 30+ level deep NCBITaxon hierarchy, and to stay O(n) rather
 * than the O(n²) that `Array.shift()` would incur on large queues.
 *
 * `rankMap` is produced by the OBO parser when `collectRanks: true` is set; it maps each
 * accession to its `has_rank` property value (e.g. `"NCBITaxon:species"`).
 */
export function pruneNCBITaxon(
  terms: OntologyTermEntry[],
  rankMap: Map<string, string>,
  allowlist: Set<string>
): OntologyTermEntry[] {
  // Build parent index: accession → parentIds[]
  const parentMap = new Map<string, string[]>();
  for (const term of terms) {
    parentMap.set(term.accession, term.parentIds);
  }

  const included = new Set<string>();

  // BFS upward from startAccession, marking all ancestors as included.
  // Uses index-based queue instead of shift() to stay O(n) not O(n²).
  function markAncestors(startAccession: string) {
    const queue: string[] = [startAccession];
    let i = 0;
    while (i < queue.length) {
      const acc = queue[i++];
      if (included.has(acc)) continue;
      included.add(acc);
      const parents = parentMap.get(acc) ?? [];
      for (const p of parents) {
        if (!included.has(p)) {
          queue.push(p);
        }
      }
    }
  }

  // Mark allowlist species and all their ancestors
  let allowlistHits = 0;
  for (const acc of allowlist) {
    if (parentMap.has(acc)) {
      markAncestors(acc);
      allowlistHits++;
    }
  }
  log.info(`  Pruning: ${allowlistHits} allowlist species matched in taxon tree`);

  // Mark all genus-level (and above) terms and their ancestors
  let rankHits = 0;
  for (const [acc, rank] of rankMap) {
    if (HIGH_LEVEL_RANKS.has(rank)) {
      markAncestors(acc);
      rankHits++;
    }
  }
  log.info(`  Pruning: ${rankHits} genus-and-above terms included`);

  return terms.filter((t) => included.has(t.accession));
}
