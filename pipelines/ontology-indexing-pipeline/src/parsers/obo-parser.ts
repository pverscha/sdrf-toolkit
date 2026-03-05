import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import type { OntologyTermEntry, SynonymEntry } from "../types.js";
import { cleanOboVersion } from "../utils.js";

type ParserState = "header" | "term" | "typedef" | "instance";

export interface OboParseOptions {
  defaultPrefix: string;
  additionalPrefixes?: string[];
  collectRanks?: boolean;
}

export interface OboParseResult {
  terms: OntologyTermEntry[];
  sourceVersion: string;
  rankMap?: Map<string, string>;
}

interface CurrentTerm {
  accession?: string;
  label?: string;
  synonyms: SynonymEntry[];
  parentIds: string[];
  obsolete: boolean;
  replacedBy: string[];
  xrefs: string[];
  rank?: string;
}

const SYNONYM_RE = /^synonym:\s+"((?:[^"\\]|\\.)*)"\s+(EXACT|RELATED|BROAD|NARROW)/;
const IS_A_RE = /^is_a:\s+(\S+)/;
const REPLACED_BY_RE = /^replaced_by:\s+(\S+)/;
const XREF_RE = /^xref:\s+(\S+)/;
const HAS_RANK_RE = /^property_value:\s+has_rank\s+(\S+)/;

function makeTerm(): CurrentTerm {
  return {
    synonyms: [],
    parentIds: [],
    obsolete: false,
    replacedBy: [],
    xrefs: [],
  };
}

/**
 * Parses an OBO-format ontology file line-by-line using a state machine with four states:
 * `header`, `term`, `typedef`, and `instance`.
 *
 * The parser transitions between states when it encounters stanza headers (`[Term]`,
 * `[Typedef]`, `[Instance]`). On each transition the current term-in-progress is flushed.
 * `[Typedef]` and `[Instance]` stanzas are otherwise ignored. The final term at end-of-file
 * is also flushed explicitly because OBO files do not require a trailing blank line.
 *
 * Terms are filtered by prefix: only accessions whose prefix matches `defaultPrefix` or one
 * of `additionalPrefixes` are retained. OBO files routinely embed imported terms from other
 * ontologies (e.g. a MONDO file will contain HP and DOID terms), and those should only be
 * indexed in their home ontology.
 *
 * When `collectRanks` is `true` (used for NCBITaxon), the parser also reads
 * `property_value: has_rank <rank>` annotations and returns them in `rankMap` for use by
 * the pruning step.
 */
export async function parseOboFile(
  filePath: string,
  options: OboParseOptions
): Promise<OboParseResult> {
  const { defaultPrefix, additionalPrefixes = [], collectRanks = false } = options;
  const allowedPrefixes = [defaultPrefix, ...additionalPrefixes];

  const terms: OntologyTermEntry[] = [];
  const rankMap = new Map<string, string>();
  let sourceVersion = "";

  let state: ParserState = "header";
  let current: CurrentTerm = makeTerm();

  // Commits the current term to the output list.
  // Silently drops it if we are not inside a [Term] stanza, if it has no accession,
  // or if its prefix belongs to a foreign ontology (imported terms).
  function flushTerm() {
    if (state !== "term" || !current.accession) return;
    const prefix = current.accession.split(":")[0];
    if (!allowedPrefixes.includes(prefix)) return;

    terms.push({
      accession: current.accession,
      label: current.label ?? "",
      synonyms: current.synonyms,
      parentIds: current.parentIds,
      obsolete: current.obsolete,
      replacedBy: current.replacedBy,
      xrefs: current.xrefs,
    });

    if (collectRanks && current.rank && current.accession) {
      rankMap.set(current.accession, current.rank);
    }
  }

  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();

    if (trimmed === "[Term]") {
      flushTerm();
      state = "term";
      current = makeTerm();
      continue;
    }

    if (trimmed === "[Typedef]") {
      flushTerm();
      state = "typedef";
      current = makeTerm();
      continue;
    }

    if (trimmed === "[Instance]") {
      flushTerm();
      state = "instance";
      current = makeTerm();
      continue;
    }

    if (state === "header") {
      if (trimmed.startsWith("data-version:")) {
        sourceVersion = cleanOboVersion(trimmed.slice("data-version:".length).trim());
      } else if (trimmed.startsWith("ontology:") && !sourceVersion) {
        sourceVersion = trimmed.slice("ontology:".length).trim();
      }
      continue;
    }

    if (state === "term") {
      if (trimmed.startsWith("id:")) {
        current.accession = trimmed.slice(3).trim();
      } else if (trimmed.startsWith("name:")) {
        current.label = trimmed.slice(5).trim();
      } else if (trimmed.startsWith("synonym:")) {
        const m = SYNONYM_RE.exec(trimmed);
        if (m) {
          current.synonyms.push({
            text: m[1].replace(/\\"/g, '"'),
            type: m[2] as SynonymEntry["type"],
          });
        }
      } else if (trimmed.startsWith("is_a:")) {
        const m = IS_A_RE.exec(trimmed);
        if (m) current.parentIds.push(m[1]);
      } else if (trimmed === "is_obsolete: true") {
        current.obsolete = true;
      } else if (trimmed.startsWith("replaced_by:")) {
        const m = REPLACED_BY_RE.exec(trimmed);
        if (m) current.replacedBy.push(m[1]);
      } else if (trimmed.startsWith("xref:")) {
        const m = XREF_RE.exec(trimmed);
        if (m) current.xrefs.push(m[1]);
      } else if (collectRanks && trimmed.startsWith("property_value: has_rank")) {
        const m = HAS_RANK_RE.exec(trimmed);
        if (m) current.rank = m[1];
      }
    }
  }

  // Flush final term (no trailing stanza boundary at EOF)
  flushTerm();

  return {
    terms,
    sourceVersion,
    rankMap: collectRanks ? rankMap : undefined,
  };
}
