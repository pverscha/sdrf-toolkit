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
  sourceUrl: string;
  builtAt: string;
  termCount: number;
  obsoleteTermCount: number;
  schemaVersion: "1.0";
}

export interface OntologyIndexFile {
  meta: OntologyIndexMeta;
  terms: OntologyTermEntry[];
}

export interface OntologyPruningConfig {
  enabled: boolean;
  strategy: string;
  species_allowlist: string;
}

export interface OntologySourceConfig {
  id: string;
  full_name: string;
  default_prefix: string;
  additional_prefixes: string[];
  source_url: string;
  format: "obo" | "unimod_xml";
  pruning?: OntologyPruningConfig;
  notes?: string | null;
}

export interface OntologySourcesFile {
  ontologies: OntologySourceConfig[];
}

export interface CacheMeta {
  url: string;
  etag?: string;
  lastModified?: string;
  downloadedAt: string;
}

export interface VariantResult {
  fileName: string;
  compressedSize: number;
  sha256: string;
  termCount: number;
}

export interface BuildResult {
  id: string;
  sourceVersion: string;
  changed: boolean;
  variants?: Record<string, VariantResult>;
  fileName?: string;
  compressedSize?: number;
  sha256?: string;
  termCount?: number;
  error?: string;
}

export interface ManifestEntry {
  sourceVersion: string;
  indexVersion: string;
  fileName?: string;
  compressedSize?: number;
  sha256?: string;
  termCount?: number;
  variants?: Record<string, VariantResult>;
}

export interface Manifest {
  schemaVersion: "1.0";
  updatedAt: string;
  ontologies: Record<string, ManifestEntry>;
}

export interface CliOptions {
  outputDir: string;
  dataDir: string;
  ontologies?: string[];
  force: boolean;
  indexVersion: string;
}
