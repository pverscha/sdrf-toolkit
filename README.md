# sdrf-toolkit

A TypeScript toolkit for sample metadata management in computational proteomics. It provides parsing, validation, and generation of SDRF (Sample and Data Relationship Format) files — with local ontology lookup, YAML-driven template composition, and framework-agnostic validation.

SDRF is a community-standard format for describing biological samples and their associated experimental metadata in mass spectrometry-based proteomics, maintained by [HUPO-PSI](https://psidev.info/) and used by [PRIDE](https://www.ebi.ac.uk/pride/) and [ProteomeXchange](https://www.proteomexchange.org/).

---

## Repository structure

```
sdrf-toolkit/
├── packages/
│   ├── core/                     @sdrf-toolkit/core
│   └── ontology-lookup/          @sdrf-toolkit/ontology-lookup
└── pipelines/
    └── ontology-indexing-pipeline/
```

---

## Components

### [@sdrf-toolkit/core](packages/core/README.md)

The main validation and metadata management library. Consumes YAML template files to define the expected columns, requirements, and validation rules for an SDRF file, then validates files against those templates.

**Key capabilities:**

- Load and compose YAML templates with inheritance (`extends`), layer requirements, column exclusions, and mutual exclusivity rules.
- Validate individual cell values in real-time (for use in form UIs) or entire SDRF files in batch.
- Thirteen built-in cell validators: `ontology`, `pattern`, `values`, `number_with_unit`, `mz_value`, `mz_range_interval`, `date`, `accession`, `identifier`, `semver`, `structured_kv`, `single_cardinality_validator`.
- Five built-in file-level validators: `trailing_whitespace_validator`, `column_order`, `empty_cells`, `min_columns`, `combination_of_columns_no_duplicate_validator`.
- Parse SDRF/TSV files into typed objects and serialize them back.

**Depends on:** `@sdrf-toolkit/ontology-lookup` (peer dependency, for ontology-backed validation).

---

### [@sdrf-toolkit/ontology-lookup](packages/ontology-lookup/README.md)

A lightweight, offline-capable ontology lookup library. Loads pre-built compressed indexes from disk at startup, providing term search, synonym resolution, and hierarchy traversal without network calls.

**Key capabilities:**

- Load ontology indexes from the local filesystem (`.json.gz` format produced by the indexing pipeline).
- Search for terms by label, synonym, or accession across one or more ontologies.
- Resolve whether a term is a descendant of another term at any depth (DAG traversal).
- Download and update indexes from a GitHub release (via the built-in updater).

**Depends on:** Pre-built indexes produced by the ontology indexing pipeline.

---

### [Ontology Indexing Pipeline](pipelines/ontology-indexing-pipeline/README.md)

A Node.js build pipeline, run as a scheduled GitHub Actions workflow, that fetches ontology source files and produces the pre-built indexes consumed by `@sdrf-toolkit/ontology-lookup`.

**Key capabilities:**

- Fetch OBO, OWL/RDF, and Unimod XML source files from canonical URLs (with ETag/Last-Modified caching to skip unchanged ontologies).
- Parse each format into a normalized term structure (accession, label, synonyms, parentIds, obsolete flag).
- Produce compressed `.json.gz` index files and a `manifest.json` with checksums.
- NCBITaxon-specific pruning: generate a full index (~2.4 M terms) and a pruned variant containing only species from a curated allowlist plus their ancestors and all genus-and-above nodes.
- Publish indexes as GitHub release assets.

**Runs:** Monthly via GitHub Actions (`build-indexes.yml`). Can also be triggered manually.
