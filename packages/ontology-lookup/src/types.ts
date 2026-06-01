// ---------------------------------------------------------------------------
// Internal index format types — must match the pipeline's output exactly.
// SynonymEntry uses `text` (not `value`) to match the pipeline's types.ts.
// ---------------------------------------------------------------------------

export interface SynonymEntry {
  text: string;
  type: "EXACT" | "RELATED" | "BROAD" | "NARROW";
}

export interface OntologyTermEntry {
  accession: string;
  label: string;
  synonyms: SynonymEntry[];
  parentIds: string[];
  obsolete: boolean;
  replacedBy: string[];
  xrefs: string[];
}

export interface OntologyIndexMeta {
  ontology: string;
  fullName: string;
  defaultPrefix: string;
  additionalPrefixes: string[];
  sourceVersion: string;
  indexVersion: string;
  sourceUrl: string;
  builtAt: string;
  termCount: number;
  obsoleteTermCount: number;
  schemaVersion: string;
}

export interface OntologyIndexFile {
  meta: OntologyIndexMeta;
  terms: OntologyTermEntry[];
}

export interface ManifestEntry {
  sourceVersion: string;
  indexVersion: string;
  fileName?: string;
  compressedSize?: number;
  sha256?: string;
  termCount?: number;
}

export interface Manifest {
  schemaVersion: string;
  updatedAt: string;
  ontologies: Record<string, ManifestEntry>;
}

// ---------------------------------------------------------------------------
// Public API types
// ---------------------------------------------------------------------------

/** A resolved ontology term returned from lookups. */
export interface OntologyTerm {
  accession: string;
  label: string;
  synonyms: string[];
  ontology: string;
  obsolete: boolean;
}

export interface OntologySearchResult {
  term: OntologyTerm;
  matchType: "label" | "synonym" | "accession";
  /** 1.0 = exact match, lower = fuzzier */
  score: number;
}

export interface OntologyRegistryOptions {
  /** Directory where index files are stored/cached on disk. */
  indexDir: string;

  /** GitHub repo for pre-built indexes (e.g., "owner/repo"). */
  updateSource?: string;

  /** Which ontologies to load. If omitted, loads all *.json.gz and *.db files in indexDir. */
  ontologies?: string[];
}
