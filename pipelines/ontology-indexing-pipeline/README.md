# Ontology Index Build Pipeline

A GitHub Actions pipeline that periodically fetches ontology source files (OBO, OWL, XML), extracts structured term data, and produces pre-built JSON indexes consumed by [`@sdrf-toolkit/ontology-lookup`](../packages/ontology-lookup/README.md).

## Purpose

The `@sdrf-toolkit/ontology-lookup` package does **not** parse ontology source files at runtime. Instead, it loads pre-built `.json.gz` index files from disk. This pipeline is responsible for producing those index files.

The pipeline runs as a scheduled GitHub Action (e.g., monthly) and publishes the indexes as GitHub release assets. Downstream consumers (the `@sdrf-toolkit/ontology-lookup` updater) fetch indexes from these releases.

---

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      GitHub Actions Workflow                    │
│                                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐           │
│  │  Fetch   │───▶│  Parse &     │───▶│  Produce     │           │
│  │  Sources │    │  Extract     │    │  Indexes     │           │
│  └──────────┘    └──────────────┘    └──────────────┘           │
│       │                │                    │                   │
│  OBO/OWL/XML     For each term:       .json.gz files            │
│  files from      - accession          + manifest.json           │
│  canonical       - label              + checksums.sha256        │
│  URLs            - synonyms                 │                   │
│                  - parents                  ▼                   │
│                  - obsolete          ┌──────────────┐           │
│                  - replacedBy        │  Publish as  │           │
│                  - xrefs             │  GH Release  │           │
│                                      └──────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Ontology Source Registry

The pipeline must know where to fetch each ontology and how to parse it. This is defined in a configuration file (`ontology-sources.yaml`) at the root of the pipeline:

```yaml
# ontology-sources.yaml
# Defines all ontologies to be indexed, their source URLs, and parsing strategy.

ontologies:
  - id: mondo
    full_name: Monarch Disease Ontology
    default_prefix: MONDO
    additional_prefixes: []
    source_url: http://purl.obolibrary.org/obo/mondo.obo
    format: obo
    notes: null

  - id: efo
    full_name: Experimental Factor Ontology
    default_prefix: EFO
    additional_prefixes: []
    source_url: http://www.ebi.ac.uk/efo/efo.obo
    format: obo
    notes: null

  - id: doid
    full_name: Human Disease Ontology
    default_prefix: DOID
    additional_prefixes: []
    source_url: http://purl.obolibrary.org/obo/doid.obo
    format: obo
    notes: null

  - id: cl
    full_name: Cell Ontology
    default_prefix: CL
    additional_prefixes: []
    source_url: http://purl.obolibrary.org/obo/cl.obo
    format: obo
    notes: null

  - id: clo
    full_name: Cell Line Ontology
    default_prefix: CLO
    additional_prefixes: []
    source_url: http://purl.obolibrary.org/obo/clo.obo
    format: obo
    notes: null

  - id: uberon
    full_name: Uber-anatomy Ontology
    default_prefix: UBERON
    additional_prefixes: []
    source_url: http://purl.obolibrary.org/obo/uberon.obo
    format: obo
    notes: null

  - id: pato
    full_name: Phenotype And Trait Ontology
    default_prefix: PATO
    additional_prefixes: []
    source_url: http://purl.obolibrary.org/obo/pato.obo
    format: obo
    notes: null

  - id: ms
    full_name: PSI Mass Spectrometry Ontology
    default_prefix: MS
    additional_prefixes: []
    source_url: http://purl.obolibrary.org/obo/ms.obo
    format: obo
    notes: null

  - id: mod
    full_name: PSI Protein Modification Ontology
    default_prefix: MOD
    additional_prefixes: []
    source_url: http://purl.obolibrary.org/obo/mod.obo
    format: obo
    notes: null

  - id: pride
    full_name: PRIDE Controlled Vocabulary
    default_prefix: PRIDE
    additional_prefixes: []
    source_url: https://raw.githubusercontent.com/PRIDE-Utilities/pride-ontology/master/pride_cv.obo
    format: obo
    notes: Hosted on GitHub, not OBO Foundry.

  - id: chebi
    full_name: Chemical Entities of Biological Interest
    default_prefix: CHEBI
    additional_prefixes: []
    source_url: http://purl.obolibrary.org/obo/chebi.obo
    format: obo
    notes: Large ontology (~170K terms). May require increased memory for parsing.

  - id: ncbitaxon
    full_name: NCBI Taxonomy
    default_prefix: NCBITaxon
    additional_prefixes: []
    source_url: http://purl.obolibrary.org/obo/ncbitaxon.obo
    format: obo
    pruning:
      enabled: true
      strategy: ancestor_chain
      # Produce both a full and a pruned variant.
      # The pruned variant keeps only terms at genus level and above,
      # plus any species explicitly listed in the species_allowlist file.
      species_allowlist: ncbitaxon-species-allowlist.txt
    notes: >
      Very large (~2.4M terms). Produces two variants: full and pruned.
      The pruned variant is recommended for most use cases.

  - id: hp
    full_name: Human Phenotype Ontology
    default_prefix: HP
    additional_prefixes: []
    source_url: http://purl.obolibrary.org/obo/hp.obo
    format: obo
    notes: null

  - id: mp
    full_name: Mammalian Phenotype Ontology
    default_prefix: MP
    additional_prefixes: []
    source_url: http://purl.obolibrary.org/obo/mp.obo
    format: obo
    notes: null

  - id: mondo
    full_name: Monarch Disease Ontology
    default_prefix: MONDO
    additional_prefixes: []
    source_url: http://purl.obolibrary.org/obo/mondo.obo
    format: obo
    notes: null

  - id: hancestro
    full_name: Human Ancestry Ontology
    default_prefix: HANCESTRO
    additional_prefixes: []
    source_url: http://purl.obolibrary.org/obo/hancestro.obo
    format: obo
    notes: null

  - id: fbbt
    full_name: Drosophila Gross Anatomy Ontology
    default_prefix: FBbt
    additional_prefixes: []
    source_url: http://purl.obolibrary.org/obo/fbbt.obo
    format: obo
    notes: null

  - id: po
    full_name: Plant Ontology
    default_prefix: PO
    additional_prefixes: []
    source_url: http://purl.obolibrary.org/obo/po.obo
    format: obo
    notes: null

  - id: zfa
    full_name: Zebrafish Anatomy Ontology
    default_prefix: ZFA
    additional_prefixes: []
    source_url: http://purl.obolibrary.org/obo/zfa.obo
    format: obo
    notes: null

  - id: zfs
    full_name: Zebrafish Developmental Stages Ontology
    default_prefix: ZFS
    additional_prefixes: []
    source_url: http://purl.obolibrary.org/obo/zfs.obo
    format: obo
    notes: null

  - id: eo
    full_name: Plant Environment Ontology
    default_prefix: EO
    additional_prefixes: []
    source_url: http://purl.obolibrary.org/obo/eo.obo
    format: obo
    notes: null

  - id: fbdv
    full_name: Drosophila Development Ontology
    default_prefix: FBdv
    additional_prefixes: []
    source_url: http://purl.obolibrary.org/obo/fbdv.obo
    format: obo
    notes: null

  - id: rso
    full_name: Rat Strain Ontology
    default_prefix: RS
    additional_prefixes: []
    source_url: http://purl.obolibrary.org/obo/rs.obo
    format: obo
    notes: null

  - id: bto
    full_name: BRENDA Tissue Ontology
    default_prefix: BTO
    additional_prefixes: []
    source_url: http://purl.obolibrary.org/obo/bto.obo
    format: obo
    notes: null

  - id: unimod
    full_name: Unimod Protein Modifications
    default_prefix: UNIMOD
    additional_prefixes: []
    source_url: http://www.unimod.org/xml/unimod.xml
    format: unimod_xml
    notes: >
      Unimod uses its own XML format, NOT OBO/OWL.
      Requires a dedicated parser (see "Special Parsers" section below).
```

---

## Detailed Step Descriptions

### Step 1: Fetch Source Files

For each ontology in `ontology-sources.yaml`:

1. Download the file from `source_url`.
2. Store it in a temporary working directory as `<id>.<format>` (e.g., `mondo.obo`, `unimod.xml`).
3. Record the HTTP `Last-Modified` or `ETag` header if available, for change detection on subsequent runs.
4. If the file has not changed since the last build (based on ETag/Last-Modified or content hash), skip processing for that ontology and reuse the existing index.

**Error handling:** If a source URL is unreachable, log a warning and skip that ontology. The pipeline should not fail entirely because one ontology is temporarily unavailable. The previous index for that ontology remains in the release unchanged.

### Step 2: Parse Source Files

The parsing step is format-dependent. The pipeline must support at minimum two parsers:

#### OBO Parser (used by most ontologies)

**Recommended library:** Python `fastobo` or `pronto`.

For each OBO file, extract the following per term stanza (`[Term]`):

| OBO Field | Maps To | Notes |
|---|---|---|
| `id:` | `accession` | e.g., `MONDO:0005015` |
| `name:` | `label` | Primary name |
| `synonym:` | `synonyms[]` | Parse the synonym type (EXACT, RELATED, BROAD, NARROW) from the OBO synonym line format: `synonym: "text" EXACT []` |
| `is_a:` | `parentIds[]` | Direct parent accessions. Multiple `is_a:` lines → multiple parents. |
| `is_obsolete: true` | `obsolete: true` | Default `false` if absent |
| `replaced_by:` | `replacedBy[]` | Only present on obsolete terms |
| `xref:` | `xrefs[]` | Cross-references to other ontologies |

**OBO synonym line format:**
```
synonym: "diabetes" EXACT []
synonym: "sugar diabetes" RELATED [MONDO:patterns/...]
synonym: "type 2 diabetes" NARROW [DOID:9352]
```

The parser should extract the quoted text and the synonym type keyword (`EXACT`, `RELATED`, `BROAD`, `NARROW`).

**Terms to skip:**
- Terms from the `owl:` namespace (these are OWL structural artifacts, not real ontology terms).
- Terms whose accession prefix doesn't match the ontology's `default_prefix` or `additional_prefixes` (these are imported terms and should be indexed only in their home ontology). Exception: if the ontology intentionally includes cross-ontology terms (rare), this can be configured per-ontology.

#### Unimod XML Parser

Unimod distributes its data as a custom XML file (`unimod.xml`), not OBO/OWL.

**Structure of `unimod.xml`:**
```xml
<unimod>
  <modifications>
    <mod title="Oxidation" record_id="35" ...>
      <specificity .../>
      <delta .../>
    </mod>
    <mod title="Carbamidomethyl" record_id="4" ...>
      ...
    </mod>
  </modifications>
</unimod>
```

**Mapping:**

| Unimod XML | Maps To | Notes |
|---|---|---|
| `record_id` attribute | `accession` | Format as `UNIMOD:<record_id>` (e.g., `UNIMOD:35`) |
| `title` attribute | `label` | e.g., `"Oxidation"` |
| Alternative names (if present) | `synonyms[]` | All as EXACT type |
| (none) | `parentIds` | Unimod has no hierarchy — set to `[]` |
| (none) | `obsolete` | Always `false` for Unimod |
| (none) | `xrefs` | Set to `[]` unless cross-refs are available |

### Step 3: Produce Index Files

For each ontology, assemble the parsed terms into the `OntologyIndexFile` JSON structure:

```typescript
interface OntologyIndexFile {
  meta: {
    ontology: string;           // from ontology-sources.yaml: id
    fullName: string;           // from ontology-sources.yaml: full_name
    defaultPrefix: string;      // from ontology-sources.yaml: default_prefix
    additionalPrefixes: string[];
    sourceVersion: string;      // extracted from the OBO header (data-version or ontology version)
    sourceUrl: string;          // from ontology-sources.yaml: source_url
    builtAt: string;            // ISO 8601 timestamp of this build run
    termCount: number;          // count of non-obsolete terms
    obsoleteTermCount: number;  // count of obsolete terms
    schemaVersion: "1.0";
  };
  terms: OntologyTermEntry[];   // flat array of all terms (non-obsolete + obsolete)
}
```

**Extracting `sourceVersion`:**
- For OBO files: look for the `data-version:` or `ontology:` header field. Example: `data-version: releases/2024-12-01` → extract `"2024-12-01"`.
- For Unimod XML: look for a version attribute on the root element, or fall back to the current date.
- If no version is found, use the build date as a fallback.

**Producing the file:**
1. Serialize the `OntologyIndexFile` object to JSON.
2. Gzip the JSON (maximum compression).
3. Write as `<id>.json.gz` (e.g., `mondo.json.gz`).
4. Compute SHA-256 hash of the compressed file.

#### NCBITaxon: Producing Two Variants

For NCBITaxon, the pipeline produces **two** output files:

1. **`ncbitaxon.json.gz`** (full) — all ~2.4M terms.
2. **`ncbitaxon-pruned.json.gz`** (pruned) — a subset.

**Pruning algorithm:**
1. Start with the full parsed term set.
2. Load the species allowlist from `ncbitaxon-species-allowlist.txt` (one accession per line, e.g., `NCBITaxon:9606` for Homo sapiens).
3. For each term in the allowlist, walk up the parent chain and mark all ancestors as "included."
4. Additionally, include all terms at **genus level and above** (taxonomic ranks: genus, family, order, class, phylum, kingdom, superkingdom). NCBITaxon OBO includes `property_value: has_rank NCBITaxon:genus` annotations that indicate rank.
5. The pruned set = allowlisted species + their ancestors + all genus-and-above terms.
6. Produce `ncbitaxon-pruned.json.gz` from this subset.

The species allowlist file should contain all species commonly found in proteomics SDRF submissions. An initial list can be seeded from the PRIDE database or manually curated.

### Step 4: Generate Manifest

After all indexes are produced, generate `manifest.json`:

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
      "sha256": "a1b2c3d4e5f6...",
      "termCount": 24893
    },
    "ncbitaxon": {
      "sourceVersion": "2024-12-15",
      "indexVersion": "1.0.3",
      "variants": {
        "full": {
          "fileName": "ncbitaxon.json.gz",
          "compressedSize": 83886080,
          "sha256": "e5f6a7b8c9d0...",
          "termCount": 2400000
        },
        "pruned": {
          "fileName": "ncbitaxon-pruned.json.gz",
          "compressedSize": 5242880,
          "sha256": "c9d0e1f2a3b4...",
          "termCount": 75000
        }
      }
    }
  }
}
```

**`indexVersion`:** This is a version string for the index format/build, independent of the source ontology version. Increment it when the index schema changes or when a bug in the build pipeline is fixed. Use semver (e.g., `"1.0.3"`).

**Manifest rules:**
- Ontologies with a single output use the flat format (`fileName`, `sha256`, etc. directly under the ontology key).
- Ontologies with multiple variants use the `variants` key with nested entries.
- `compressedSize` is the file size in bytes of the `.json.gz` file.

### Step 5: Generate Checksums

Produce `checksums.sha256` containing one line per file:

```
a1b2c3d4e5f6...  mondo.json.gz
f7e8d9c0b1a2...  efo.json.gz
e5f6a7b8c9d0...  ncbitaxon.json.gz
c9d0e1f2a3b4...  ncbitaxon-pruned.json.gz
...
```

This is a standard `sha256sum`-compatible format. The manifest already contains these hashes, but the standalone file allows quick verification with `sha256sum -c checksums.sha256`.

### Step 6: Publish as GitHub Release

1. Create a new GitHub release (or update the existing "latest" release, depending on strategy).
2. Upload all `.json.gz` files, `manifest.json`, and `checksums.sha256` as release assets.
3. Tag the release with a version string (e.g., `indexes-v1.0.3` or a date-based tag like `indexes-2025-01-15`).

**Release strategy options:**
- **Rolling "latest" release:** Always overwrite the same release. Consumers always fetch from a stable URL. Simpler but no version history.
- **Versioned releases:** Create a new release each time. Consumers can pin to a specific version. More complex but allows rollback.

Recommendation: use versioned releases with a `latest` tag that always points to the most recent one. This gives both stability and history.

---

## Pipeline Configuration

### GitHub Actions Workflow Skeleton

```yaml
# .github/workflows/build-indexes.yaml
name: Build Ontology Indexes

on:
  schedule:
    - cron: "0 4 1 * *"    # Monthly, 1st of each month at 04:00 UTC
  workflow_dispatch:          # Manual trigger

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 120      # Large ontologies may take time

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install dependencies
        run: pip install fastobo pronto pyyaml

      - name: Fetch and build indexes
        run: python scripts/build_indexes.py

      - name: Verify checksums
        run: cd output && sha256sum -c checksums.sha256

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: indexes-${{ github.run_number }}
          files: output/*
```

### Recommended Python Project Structure

```
pipeline/
├── ontology-sources.yaml             # Ontology registry (see above)
├── ncbitaxon-species-allowlist.txt   # Species to keep in pruned NCBITaxon
├── scripts/
│   ├── build_indexes.py              # Main entry point
│   ├── fetch.py                      # Download source files with caching
│   ├── parsers/
│   │   ├── __init__.py
│   │   ├── obo_parser.py            # OBO format → OntologyTermEntry list
│   │   └── unimod_parser.py         # Unimod XML → OntologyTermEntry list
│   ├── pruning.py                    # NCBITaxon pruning logic
│   ├── index_builder.py             # Assemble OntologyIndexFile + gzip
│   ├── manifest_builder.py          # Generate manifest.json + checksums.sha256
│   └── utils.py                      # Shared helpers (hashing, version extraction)
├── output/                           # Build artifacts (gitignored)
│   ├── manifest.json
│   ├── mondo.json.gz
│   ├── efo.json.gz
│   └── ...
├── tests/
│   ├── test_obo_parser.py
│   ├── test_unimod_parser.py
│   ├── test_pruning.py
│   └── fixtures/                     # Small test OBO/XML files
│       ├── mini-mondo.obo
│       └── mini-unimod.xml
└── requirements.txt
```

---

## OBO Parsing: Detailed Field Extraction Guide

This section provides precise instructions for extracting each field from OBO format files. This is the most critical part of the pipeline — incorrect parsing here propagates errors to all downstream consumers.

### OBO File Structure

An OBO file consists of a **header** followed by **term stanzas**:

```
format-version: 1.4
data-version: releases/2024-12-01
ontology: mondo
default-namespace: MONDO

[Term]
id: MONDO:0005015
name: diabetes mellitus
def: "A metabolic disease characterized by..."
synonym: "diabetes" EXACT []
synonym: "DM" EXACT [MONDO:equivalentTo]
synonym: "sugar diabetes" RELATED []
is_a: MONDO:0005070 ! metabolic disease
xref: DOID:9351
xref: EFO:0000400
property_value: exactMatch DOID:9351

[Term]
id: MONDO:0000001
name: obsolete disease or disorder
is_obsolete: true
replaced_by: MONDO:0700096

[Typedef]
id: RO:0002573
name: has modifier
```

### Extraction Rules

**From the header:**
- `data-version:` → `meta.sourceVersion`. Strip any prefix like `releases/`. If absent, fall back to `ontology:` value or the build date.
- `ontology:` → cross-check against `ontology-sources.yaml` `id`.

**From each `[Term]` stanza:**

| Line Pattern | Target Field | Extraction Rule |
|---|---|---|
| `id: <accession>` | `accession` | Take the full value (e.g., `MONDO:0005015`). |
| `name: <label>` | `label` | Take the full value after `name: `. |
| `synonym: "<text>" <TYPE> [<xrefs>]` | `synonyms[]` | Extract the quoted text and the type keyword. See below. |
| `is_a: <parent_id> ! <comment>` | `parentIds[]` | Take only the accession before the `!` comment. Trim whitespace. |
| `is_obsolete: true` | `obsolete` | Set to `true`. Default `false` if line absent. |
| `replaced_by: <accession>` | `replacedBy[]` | Collect all `replaced_by` lines. |
| `xref: <accession>` | `xrefs[]` | Collect all `xref` lines. Take the accession value. |
| `alt_id: <accession>` | (see note) | Alternate IDs. Index these so lookups by alt_id resolve to the primary term. Store as additional entries in `xrefs[]` or handle in a separate `altIds` field. |

**Synonym line parsing:**

The OBO synonym format is: `synonym: "<text>" <TYPE> <SCOPE> [<xref_list>]`

```
synonym: "diabetes" EXACT []
synonym: "breast carcinoma" EXACT [NCIT:C4872]
synonym: "sugar diabetes" RELATED []
synonym: "cancer of breast" BROAD [DOID:1612]
```

Regex for extraction: `^synonym:\s+"([^"]+)"\s+(EXACT|RELATED|BROAD|NARROW)`

- Group 1: synonym text
- Group 2: synonym type

**Stanzas to skip:**
- `[Typedef]` stanzas — these define relationships, not terms.
- `[Instance]` stanzas — rare, not relevant.
- Any term whose `id:` prefix doesn't match the ontology's configured prefixes (these are imported terms).

### OBO Edge Cases

1. **Multi-line definitions:** `def:` lines can span multiple lines if the value is enclosed in quotes. The parser must handle this correctly, but `def:` is not extracted for our purposes — it can be ignored.

2. **Escaped quotes in synonyms:** Synonym text may contain escaped quotes: `synonym: "5\"10\"" EXACT []`. Handle `\"` within the quoted string.

3. **Multiple `is_a:` lines:** A term can have multiple parent relationships. Each `is_a:` line produces one entry in `parentIds[]`.

4. **`relationship:` lines:** Some ontologies express parent-child relationships via `relationship: part_of <id>` instead of `is_a:`. For this pipeline, **only extract `is_a:` relationships**. `part_of` and other relationship types are not needed for hierarchy traversal in the SDRF validation context.

5. **Namespace filtering:** Some OBO files contain terms from multiple namespaces. If the ontology config specifies a `default_prefix`, skip terms whose `id:` prefix doesn't match.

---

## Unimod XML Parsing: Detailed Guide

### File Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<unimod xmlns="http://www.unimod.org/xmlns/schema/unimod_2"
        majorVersion="2" minorVersion="0">
  <elements>
    <!-- Chemical elements referenced by modifications -->
    <elem title="Hydrogen" avge_mass="1.00794" ... />
    ...
  </elements>
  <modifications>
    <mod title="Acetyl"
         full_name="Acetylation"
         record_id="1"
         username_of_poster="..."
         date_time_posted="..."
         date_time_modified="..."
         approved="1">
      <specificity hidden="0" site="N-term" position="Any N-term" classification="Post-translational" />
      <specificity hidden="0" site="K" position="Anywhere" classification="Post-translational" />
      <delta avge_mass="42.0106" mono_mass="42.010565" composition="H(2) C(2) O" />
      <alt_name>Acetylation</alt_name>
    </mod>
    <mod title="Oxidation"
         full_name="Oxidation or Hydroxylation"
         record_id="35"
         approved="1">
      <specificity hidden="0" site="M" position="Anywhere" classification="Post-translational" />
      <delta avge_mass="15.9994" mono_mass="15.994915" composition="O" />
    </mod>
    ...
  </modifications>
  <amino_acids>
    ...
  </amino_acids>
</unimod>
```

### Extraction Mapping

For each `<mod>` element under `<modifications>`:

| XML Attribute/Element | Target Field | Extraction Rule |
|---|---|---|
| `record_id` attribute | `accession` | Format as `UNIMOD:<record_id>` (e.g., `UNIMOD:1`, `UNIMOD:35`) |
| `title` attribute | `label` | e.g., `"Acetyl"`, `"Oxidation"` |
| `full_name` attribute | `synonyms[0]` | Add as an EXACT synonym if different from `title` |
| `<alt_name>` child elements | `synonyms[]` | Each `<alt_name>` text → EXACT synonym |
| (none) | `parentIds` | Always `[]` — Unimod has no hierarchy |
| (none) | `obsolete` | Always `false` |
| (none) | `replacedBy` | Always `[]` |
| (none) | `xrefs` | Always `[]` unless cross-references are available |

**Additional metadata to extract (for the `meta` object):**
- `majorVersion` and `minorVersion` from the root `<unimod>` element → `meta.sourceVersion` as `"<major>.<minor>"`.

**Filtering:**
- Only include modifications where `approved="1"`. Skip unapproved entries.
- Skip the `<elements>` and `<amino_acids>` sections — only `<modifications>` is relevant.

---

## Validation & Quality Checks

After building each index, the pipeline should run validation checks before publishing:

1. **Term count sanity check:** Compare the number of terms against the previous build. Flag if the count drops by more than 10% (may indicate a parsing bug or a broken source file).

2. **Required fields:** Every term must have a non-empty `accession` and `label`. Log a warning for terms missing these and exclude them from the index.

3. **Accession format:** Verify accessions match the pattern `<PREFIX>:<ID>` (e.g., `MONDO:0005015`). Log and skip malformed accessions.

4. **Parent reference integrity:** For each term's `parentIds`, verify the referenced accession exists in the same index. Log warnings for dangling parent references (these can occur when ontologies import terms from other ontologies).

5. **Obsolete term replacement:** For obsolete terms with `replacedBy`, verify the replacement accession exists.

6. **Index decompression roundtrip:** After gzipping, decompress the file and verify the JSON parses correctly and the term count matches.

---

## Extending with New Ontologies

To add a new ontology to the pipeline:

1. Add an entry to `ontology-sources.yaml` with the ontology's `id`, `full_name`, `default_prefix`, `source_url`, and `format`.
2. If the format is `obo`, no code changes are needed — the generic OBO parser handles it.
3. If the format is something new (e.g., OWL/RDF, custom XML), implement a new parser in `scripts/parsers/` that produces the same `OntologyTermEntry[]` output.
4. Run the pipeline and verify the output index.
5. Add the ontology to the `@sdrf-toolkit/ontology-lookup` supported ontologies list.

---

## Expected Outputs Summary

After a successful pipeline run, the `output/` directory contains:

| File | Description | Size (approx.) |
|---|---|---|
| `manifest.json` | Version manifest with checksums | <1 KB |
| `checksums.sha256` | SHA-256 hashes for all `.json.gz` files | <1 KB |
| `mondo.json.gz` | MONDO index | ~3 MB |
| `efo.json.gz` | EFO index | ~2 MB |
| `cl.json.gz` | Cell Ontology index | ~0.5 MB |
| `uberon.json.gz` | UBERON index | ~1.5 MB |
| `chebi.json.gz` | ChEBI index | ~15 MB |
| `ncbitaxon.json.gz` | NCBITaxon (full) | ~80 MB |
| `ncbitaxon-pruned.json.gz` | NCBITaxon (pruned) | ~5 MB |
| `ms.json.gz` | Mass Spectrometry Ontology | ~0.3 MB |
| `unimod.json.gz` | Unimod modifications | ~0.2 MB |
| ... | (one per ontology) | varies |

Total release size: approximately **110–120 MB** (dominated by NCBITaxon full).