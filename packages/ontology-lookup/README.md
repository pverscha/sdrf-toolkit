# @sdrf-toolkit/ontology-lookup

A lightweight, self-contained TypeScript library for local ontology term lookup, synonym resolution, and hierarchy traversal. Designed for Node.js / Electron environments.

This package loads pre-built ontology indexes from disk into memory at startup, providing fast, offline-capable term search and validation without depending on external services like the EBI OLS API.

## Overview

This package is part of the [sdrf-toolkit](https://github.com/TODO/sdrf-toolkit) monorepo but is **fully independent** — it has no dependency on `@sdrf-toolkit/core` and can be used standalone in any Node.js project that needs ontology term lookup.

### What It Does

- **Index management** — download, cache, and update pre-built ontology indexes from a GitHub release.
- **Term lookup** — given an ontology ID (e.g., `"mondo"`) and a query string, return matching terms by label, synonym, or accession.
- **Hierarchy queries** — given a term accession, determine whether it is a descendant of another term (at any depth).
- **Synonym resolution** — match user input against primary labels, exact synonyms, related synonyms, and accessions.

### What It Does NOT Do

- It does not parse OBO/OWL files directly. It consumes pre-built JSON indexes produced by a separate [build pipeline](../ontology-index-pipeline/README.md).
- It does not provide a running HTTP service. It is an in-process library loaded into your application's memory.

---

## Package Structure

```
ontology-lookup/
├── src/
│   ├── index.ts                  # Public API barrel export
│   ├── types.ts                  # OntologyTerm, SearchResult, SynonymEntry, etc.
│   ├── registry.ts               # OntologyRegistry — loads & manages multiple ontologies
│   ├── ontology-index.ts         # OntologyIndex — single-ontology in-memory index
│   ├── search.ts                 # Tiered search logic (exact → prefix → fuzzy)
│   ├── hierarchy.ts              # Ancestor/descendant DAG traversal
│   ├── updater.ts                # Download/update pre-built indexes from GitHub
│   └── formats/
│       └── index-format.ts       # Read/decompress the .json.gz index format
├── tests/
├── package.json
├── tsconfig.json
└── README.md
```

---

## Pre-Built Index Format

The package consumes ontology indexes that are built and published by a separate pipeline (see the [ontology-index-pipeline README](../ontology-index-pipeline/README.md) for details on how these are produced).

### Distribution Structure

Indexes are hosted as a GitHub release with one `.json.gz` file per ontology, plus a manifest:

```
ontology-indexes/          (GitHub release assets)
├── manifest.json           # Version manifest — tracks what's available
├── mondo.json.gz           # ~3 MB compressed
├── efo.json.gz             # ~2 MB compressed
├── cl.json.gz              # ~0.5 MB compressed
├── ncbitaxon-pruned.json.gz  # Pruned variant for large ontologies
├── uberon.json.gz
├── ...
└── checksums.sha256        # SHA-256 integrity hashes
```

### Local Cache

When downloaded, files are stored in a local directory (`indexDir`) with the same structure:

```
<indexDir>/
├── manifest.json           # Local copy — used to detect when updates are available
├── mondo.json.gz           # Kept compressed on disk, decompressed into memory on load
├── efo.json.gz
└── ...
```

### Index File Schema

Each `.json.gz` file, when decompressed, contains a JSON object conforming to the `OntologyIndexFile` interface:

```typescript
interface OntologyIndexFile {
  meta: OntologyIndexMeta;
  terms: OntologyTermEntry[];
}
```

#### `OntologyIndexMeta`

```typescript
interface OntologyIndexMeta {
  /** Ontology short name, lowercase (e.g., "mondo", "efo", "cl") */
  ontology: string;

  /** Full human-readable name (e.g., "Monarch Disease Ontology") */
  fullName: string;

  /** Default accession prefix (e.g., "MONDO", "EFO", "CL") */
  defaultPrefix: string;

  /** Additional prefixes this ontology uses (some ontologies import terms from others) */
  additionalPrefixes: string[];

  /** Version string of the source ontology (e.g., "2024-12-01") */
  sourceVersion: string;

  /** URL of the source OBO/OWL file used to build this index */
  sourceUrl: string;

  /** ISO 8601 timestamp when this index was built */
  builtAt: string;

  /** Total number of non-obsolete terms */
  termCount: number;

  /** Total number of obsolete terms included */
  obsoleteTermCount: number;

  /** Schema version of this index file format (for forward compatibility) */
  schemaVersion: "1.0";
}
```

#### `OntologyTermEntry`

```typescript
interface OntologyTermEntry {
  /** Full accession with prefix (e.g., "MONDO:0005015", "CL:0000540") */
  accession: string;

  /** Primary label / preferred name (e.g., "diabetes mellitus", "neuron") */
  label: string;

  /**
   * Synonym entries with type classification.
   * Types follow OBO convention: EXACT, RELATED, BROAD, NARROW.
   *
   * - EXACT: interchangeable with the label (used for validation matching)
   * - RELATED: loosely associated (included in search, lower ranking)
   * - BROAD: more general than the label
   * - NARROW: more specific than the label
   */
  synonyms: SynonymEntry[];

  /**
   * Direct parent term accessions (IS_A relationships only).
   * Used for hierarchy traversal. Multiple parents possible (DAG, not tree).
   */
  parentIds: string[];

  /**
   * Whether this term is marked obsolete in the source ontology.
   * Obsolete terms are included so that legacy data referencing them can still be
   * parsed — but consumers should produce a warning suggesting the replacement.
   */
  obsolete: boolean;

  /**
   * If obsolete, the suggested replacement term accession(s).
   * Corresponds to IAO:0100001 (term_replaced_by) in OBO format.
   */
  replacedBy: string[];

  /**
   * Cross-references to other ontologies (e.g., a MONDO term may xref DOID, OMIM).
   * Enables resolving terms that are referenced by an accession from a different ontology.
   */
  xrefs: string[];
}

interface SynonymEntry {
  /** The synonym text (e.g., "DM", "sugar diabetes") */
  value: string;

  /** OBO synonym type */
  type: "EXACT" | "RELATED" | "BROAD" | "NARROW";
}
```

#### Concrete Example

A small fragment of `mondo.json.gz` (decompressed):

```json
{
  "meta": {
    "ontology": "mondo",
    "fullName": "Monarch Disease Ontology",
    "defaultPrefix": "MONDO",
    "additionalPrefixes": [],
    "sourceVersion": "2024-12-01",
    "sourceUrl": "http://purl.obolibrary.org/obo/mondo.obo",
    "builtAt": "2025-01-15T08:30:00Z",
    "termCount": 24893,
    "obsoleteTermCount": 3421,
    "schemaVersion": "1.0"
  },
  "terms": [
    {
      "accession": "MONDO:0005015",
      "label": "diabetes mellitus",
      "synonyms": [
        { "value": "diabetes", "type": "EXACT" },
        { "value": "DM", "type": "EXACT" },
        { "value": "sugar diabetes", "type": "RELATED" }
      ],
      "parentIds": ["MONDO:0005070"],
      "obsolete": false,
      "replacedBy": [],
      "xrefs": ["DOID:9351", "EFO:0000400", "HP:0000819"]
    },
    {
      "accession": "MONDO:0007254",
      "label": "breast cancer",
      "synonyms": [
        { "value": "malignant neoplasm of breast", "type": "EXACT" },
        { "value": "breast carcinoma", "type": "EXACT" },
        { "value": "cancer of breast", "type": "RELATED" }
      ],
      "parentIds": ["MONDO:0024678", "MONDO:0002975"],
      "obsolete": false,
      "replacedBy": [],
      "xrefs": ["DOID:1612", "EFO:0000305"]
    },
    {
      "accession": "MONDO:0008903",
      "label": "obsolete lung cancer",
      "synonyms": [],
      "parentIds": [],
      "obsolete": true,
      "replacedBy": ["MONDO:0005012"],
      "xrefs": []
    }
  ]
}
```

### Manifest File

The `manifest.json` tracks all available ontology indexes and their versions. The updater compares this against the local manifest to determine which files need downloading.

```json
{
  "schemaVersion": "1.0",
  "updatedAt": "2025-01-15T08:30:00Z",
  "ontologies": {
    "mondo": {
      "sourceVersion": "2024-12-01",
      "indexVersion": "1.0.3",
      "fileName": "mondo.json.gz",
      "compressedSize": 3145728,
      "sha256": "a1b2c3d4...",
      "termCount": 24893
    },
    "ncbitaxon": {
      "sourceVersion": "2024-12-15",
      "indexVersion": "1.0.3",
      "variants": {
        "full": {
          "fileName": "ncbitaxon.json.gz",
          "compressedSize": 83886080,
          "sha256": "e5f6a7b8...",
          "termCount": 2400000
        },
        "pruned": {
          "fileName": "ncbitaxon-pruned.json.gz",
          "compressedSize": 5242880,
          "sha256": "c9d0e1f2...",
          "termCount": 75000
        }
      }
    }
  }
}
```

Ontologies that offer multiple variants (like NCBITaxon with `full` and `pruned`) use the `variants` key instead of the flat fields. The consuming code specifies which variant to use via `OntologyRegistryOptions.ontologyOptions`.

---

## Public API

### Types

```typescript
/** A resolved ontology term returned from lookups */
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
  score: number;  // 1.0 = exact match, lower = fuzzier
}

export interface OntologyRegistryOptions {
  /** Directory where index files are stored/cached on disk */
  indexDir: string;

  /** GitHub repo for pre-built indexes (e.g., "org/ontology-indexes") */
  updateSource?: string;

  /** Which ontologies to load. If omitted, loads all available in indexDir. */
  ontologies?: string[];

  /** Per-ontology configuration overrides */
  ontologyOptions?: Record<string, {
    /** Use pruned variant if available (for large ontologies like NCBITaxon) */
    variant?: "full" | "pruned";
  }>;
}
```

### `OntologyRegistry`

The main entry point. Manages loading, searching, and updating multiple ontologies.

```typescript
export class OntologyRegistry {
  constructor(options: OntologyRegistryOptions);

  /**
   * Load specified ontologies from disk into memory.
   * Call once at application startup.
   * Reads .json.gz files from indexDir, decompresses, and builds in-memory indexes.
   */
  async initialize(): Promise<void>;

  /**
   * Check for and download updated indexes from the GitHub release.
   * Compares the remote manifest against the local manifest.
   * Downloads only changed files. Reloads affected ontologies in memory.
   * Returns which ontologies were updated vs. already current.
   */
  async update(): Promise<{ updated: string[]; alreadyCurrent: string[] }>;

  /** Whether a specific ontology is loaded in memory */
  isLoaded(ontology: string): boolean;

  /** List all currently loaded ontology IDs */
  getLoadedOntologies(): string[];

  /**
   * Search for a term across one or more ontologies.
   * Returns ranked results using a tiered scoring strategy.
   *
   * @param query - The search string (label, synonym, or accession)
   * @param ontologies - Which ontologies to search (e.g., ["mondo", "efo"])
   * @param options.limit - Maximum number of results (default: 10)
   */
  search(
    query: string,
    ontologies: string[],
    options?: { limit?: number }
  ): OntologySearchResult[];

  /**
   * Validate that a value is a recognized term in any of the given ontologies.
   * Uses strict matching only (exact label, exact synonym, or exact accession).
   * Returns the matched term, or null if not found.
   *
   * @param value - The value to validate (e.g., "breast cancer", "MONDO:0007254")
   * @param ontologies - Which ontologies to check
   */
  resolve(
    value: string,
    ontologies: string[]
  ): OntologyTerm | null;

  /**
   * Check whether a term is a descendant of a parent term at any depth.
   * Traverses the IS_A parent chain upward from the child term.
   * Handles multiple inheritance (DAG) correctly using a visited set.
   *
   * @param termAccession - The candidate descendant (e.g., "MONDO:0007254")
   * @param parentAccession - The required ancestor (e.g., "MS:1000044")
   * @param ontology - Which ontology to search in
   */
  isDescendantOf(
    termAccession: string,
    parentAccession: string,
    ontology: string
  ): boolean;

  /**
   * Get all descendant accessions of a given parent term.
   * Builds a reverse parent→children index lazily on first call, then BFS/DFS.
   * Useful for pre-computing the full set of valid terms under a parent constraint.
   */
  getDescendants(
    parentAccession: string,
    ontology: string
  ): string[];
}
```

---

## In-Memory Architecture

When `initialize()` is called, each `.json.gz` file is decompressed and parsed into an `OntologyIndex` instance. The `OntologyIndex` builds several lookup structures from the flat term array for fast querying:

```typescript
class OntologyIndex {
  readonly meta: OntologyIndexMeta;

  /**
   * Primary lookup: accession → full term entry.
   * Used for: resolve-by-accession, hierarchy traversal, xref resolution.
   */
  private termsById: Map<string, OntologyTermEntry>;

  /**
   * Label lookup: normalized (lowercase, trimmed) label → accession(s).
   * Multiple accessions possible if two terms share a label (rare but valid).
   */
  private termsByLabel: Map<string, string[]>;

  /**
   * Synonym lookup: normalized synonym value → array of { accession, type }.
   * Labels are also inserted here as EXACT type for uniform search.
   */
  private termsBySynonym: Map<string, Array<{ accession: string; type: SynonymEntry["type"] }>>;

  /**
   * Reverse parent index: parent accession → child accessions.
   * Built LAZILY on first call to getDescendants() or isDescendantOf() that
   * requires top-down traversal. Avoids upfront cost if hierarchy queries
   * are never used.
   */
  private childrenOf: Map<string, string[]> | null;

  /**
   * Cross-reference index: xref string → local accession(s).
   * Enables resolving a term when referenced by an accession from
   * a different ontology (e.g., looking up DOID:9351 in the MONDO index).
   */
  private termsByXref: Map<string, string[]>;

  /**
   * Prefix trie for autocomplete search. Built LAZILY on first search() call.
   * Maps normalized label/synonym prefixes to accession sets.
   */
  private prefixIndex: PrefixTrie | null;
}
```

### Memory Estimates

| Ontology | Approx. Terms | Estimated In-Memory Size |
|---|---|---|
| MONDO | ~25K | ~30 MB |
| EFO | ~35K | ~40 MB |
| CL (Cell Ontology) | ~6K | ~8 MB |
| UBERON | ~15K | ~20 MB |
| ChEBI | ~170K | ~200 MB |
| NCBITaxon (pruned) | ~50–100K | ~60–120 MB |
| NCBITaxon (full) | ~2.4M | ~2.5 GB |
| Most others | <10K | <15 MB each |

Total for all ~24 ontologies (excluding full NCBITaxon): roughly **400–600 MB**. This is manageable for an Electron application.

---

## Search Strategy

The `search()` method uses a tiered approach, progressing from high-confidence to fuzzy matches:

| Tier | Match Type | Score | Description |
|---|---|---|---|
| 1 | Exact accession | 1.0 | Query contains `:` and matches an accession exactly |
| 2 | Exact label | 1.0 | Case-insensitive exact match on `term.label` |
| 3 | Exact synonym | 0.9 | Case-insensitive exact match on any synonym |
| 4 | Prefix (label) | 0.8 | Label starts with the query |
| 4 | Prefix (synonym) | 0.7 | A synonym starts with the query |
| 5 | Substring / fuzzy | 0.3–0.6 | Label or synonym contains query, or edit-distance match |

The `resolve()` method (used for validation) uses **only tiers 1–3** — a value must be an exact match on label, exact synonym (EXACT type only), or accession to be considered valid. This ensures validation is strict while search remains forgiving for autocomplete.

---

## Hierarchy Traversal

Ontologies are structured as Directed Acyclic Graphs (DAGs) using IS_A relationships. Each term stores its direct `parentIds`.

### `isDescendantOf(child, ancestor)`

1. Start at the `child` term.
2. Walk upward through `parentIds` recursively.
3. Maintain a `visited` set to handle multiple inheritance paths (prevents infinite loops in the DAG).
4. Return `true` as soon as `ancestor` is found in the chain.
5. Return `false` if the entire ancestor tree is exhausted without finding the target.

### `getDescendants(parent)`

1. On first call, build a reverse index: for every term, register it as a child of each of its `parentIds`. This `childrenOf` map is cached for subsequent calls.
2. BFS/DFS downward from the given `parent` accession.
3. Return all reachable descendant accessions.

---

## Update Mechanism

The `update()` method provides a simple, pull-based update flow:

1. Fetch `manifest.json` from the configured GitHub release URL.
2. Compare each ontology's `indexVersion` and `sourceVersion` against the locally cached manifest.
3. Download only the `.json.gz` files that have changed.
4. Verify SHA-256 checksums after download.
5. Write new files to `indexDir`, replacing the old ones.
6. Reload the affected ontologies in memory (decompress + rebuild indexes).
7. Update the local `manifest.json`.

There is no background polling, no daemon, no cron. The consuming application calls `update()` whenever it wants — typically on startup or via a user-triggered "check for updates" action.

---

## Large Ontology Handling: NCBITaxon

NCBITaxon is an outlier with ~2.4 million terms. Two strategies are supported:

### Strategy A — Pruned Index (Recommended for Initial Release)

The build pipeline produces a pruned version containing only species commonly referenced in proteomics SDRF files, plus their full ancestor chain (to preserve hierarchy queries). This reduces the term count to ~50K–100K terms (~60–120 MB in memory).

### Strategy B — Full Index with Lazy Loading

The full NCBITaxon is shipped as a separate, larger file. At load time, only the `termsById` map is built (accession → label + parents). Synonym and prefix indexes are built lazily and only for the subset of terms actually queried. This trades slower first-search for lower startup memory.

The consumer selects the strategy via `ontologyOptions`:

```typescript
const registry = new OntologyRegistry({
  indexDir: "/path/to/indexes",
  ontologyOptions: {
    ncbitaxon: { variant: "pruned" }
  }
});
```

---

## Supported Ontologies (Initial Set)

The following ontologies are supported in the initial release:

ms, efo, mod, clo, fbbt, cl, po, uberon, zfa, zfs, eo, fbdv, rso, chebi, ncbitaxon, pato, pride, mondo, hp, mp, hancestro, unimod, bto, doid.

---

## Usage Example

```typescript
import { OntologyRegistry } from "@sdrf-toolkit/ontology-lookup";

// 1. Initialize at application startup
const registry = new OntologyRegistry({
  indexDir: "/path/to/ontology-data",
  updateSource: "your-org/ontology-indexes",
  ontologies: ["mondo", "efo", "cl", "uberon", "ncbitaxon"],
  ontologyOptions: {
    ncbitaxon: { variant: "pruned" }
  }
});

await registry.initialize();

// 2. Optionally check for updates
const updateResult = await registry.update();
console.log(`Updated: ${updateResult.updated.join(", ")}`);

// 3. Search for terms (e.g., for autocomplete in a UI)
const results = registry.search("breast can", ["mondo", "efo"]);
// → [
//   { term: { label: "breast cancer", accession: "MONDO:0007254", ... }, score: 0.8, matchType: "label" },
//   { term: { label: "breast carcinoma", accession: "MONDO:...", ... }, score: 0.7, matchType: "synonym" },
//   ...
// ]

// 4. Validate a specific value (strict matching for validation)
const term = registry.resolve("diabetes mellitus", ["mondo", "efo", "doid", "pato"]);
if (term) {
  console.log(`Valid: ${term.label} (${term.accession})`);
} else {
  console.log("Not a recognized ontology term");
}

// 5. Check hierarchy constraints (e.g., parent_term: MS:1000044)
const isValid = registry.isDescendantOf("MS:1000133", "MS:1000044", "ms");
// → true if MS:1000133 (CID) is a descendant of MS:1000044 (dissociation method)

// 6. Get all valid terms under a parent (for pre-computing allowed values)
const validMethods = registry.getDescendants("MS:1000044", "ms");
// → ["MS:1000133", "MS:1000134", "MS:1000135", ...]
```