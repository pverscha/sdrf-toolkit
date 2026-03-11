import type { OntologyIndexFile, OntologyIndexMeta, OntologyTermEntry, SynonymEntry } from "./types.js";

export interface PrefixEntry {
  text: string;
  accession: string;
  /** True if this entry originated from the term's primary label. */
  isLabel: boolean;
}

export class OntologyIndex {
  readonly meta: OntologyIndexMeta;
  private readonly terms: OntologyTermEntry[];

  readonly termsById: Map<string, OntologyTermEntry>;
  readonly termsByLabel: Map<string, string[]>;
  readonly termsBySynonym: Map<string, Array<{ accession: string; type: SynonymEntry["type"] }>>;
  readonly termsByXref: Map<string, string[]>;

  private childrenOfMap: Map<string, string[]> | null = null;
  private prefixEntries: PrefixEntry[] | null = null;

  constructor(indexFile: OntologyIndexFile) {
    this.meta = indexFile.meta;
    this.terms = indexFile.terms;
    this.termsById = new Map();
    this.termsByLabel = new Map();
    this.termsBySynonym = new Map();
    this.termsByXref = new Map();

    for (const term of indexFile.terms) {
      this.termsById.set(term.accession, term);

      const normalizedLabel = term.label.toLowerCase().trim();

      // termsByLabel
      const labelAccessions = this.termsByLabel.get(normalizedLabel) ?? [];
      labelAccessions.push(term.accession);
      this.termsByLabel.set(normalizedLabel, labelAccessions);

      // Insert label as EXACT synonym for unified search
      const labelSynEntries = this.termsBySynonym.get(normalizedLabel) ?? [];
      if (!labelSynEntries.some(e => e.accession === term.accession && e.type === "EXACT")) {
        labelSynEntries.push({ accession: term.accession, type: "EXACT" });
      }
      this.termsBySynonym.set(normalizedLabel, labelSynEntries);

      // Actual synonyms
      for (const syn of term.synonyms) {
        const normalizedSyn = syn.text.toLowerCase().trim();
        const synEntries = this.termsBySynonym.get(normalizedSyn) ?? [];
        synEntries.push({ accession: term.accession, type: syn.type });
        this.termsBySynonym.set(normalizedSyn, synEntries);
      }

      // xrefs
      for (const xref of term.xrefs) {
        const xrefEntries = this.termsByXref.get(xref) ?? [];
        xrefEntries.push(term.accession);
        this.termsByXref.set(xref, xrefEntries);
      }
    }
  }

  /** Returns the children-of map, built lazily on first call. */
  getChildrenOf(): Map<string, string[]> {
    if (this.childrenOfMap === null) {
      this.childrenOfMap = new Map();
      for (const term of this.terms) {
        for (const parentId of term.parentIds) {
          const children = this.childrenOfMap.get(parentId) ?? [];
          children.push(term.accession);
          this.childrenOfMap.set(parentId, children);
        }
      }
    }
    return this.childrenOfMap;
  }

  /** Returns a sorted array of prefix entries, built lazily on first call. */
  getPrefixEntries(): PrefixEntry[] {
    if (this.prefixEntries === null) {
      const entries: PrefixEntry[] = [];
      for (const term of this.terms) {
        entries.push({
          text: term.label.toLowerCase().trim(),
          accession: term.accession,
          isLabel: true,
        });
        for (const syn of term.synonyms) {
          entries.push({
            text: syn.text.toLowerCase().trim(),
            accession: term.accession,
            isLabel: false,
          });
        }
      }
      entries.sort((a, b) => a.text.localeCompare(b.text));
      this.prefixEntries = entries;
    }
    return this.prefixEntries;
  }

  getAllTerms(): OntologyTermEntry[] {
    return this.terms;
  }
}
