# @sdrf-toolkit/core

A TypeScript library for parsing, validating, and generating SDRF (Sample and Data Relationship Format) files. Driven by YAML template specifications, with a modular validation engine.

## Overview

This package is part of the [sdrf-toolkit](https://github.com/TODO/sdrf-toolkit) monorepo. It depends on [`@sdrf-toolkit/ontology-lookup`](../ontology-lookup/README.md) for ontology-based validation, but all other functionality (template parsing, pattern/values validation, SDRF I/O) works independently.

### What It Does

- **Template management** — load YAML template specifications, resolve `extends` inheritance chains, and expose fully merged column definitions with their validators, descriptions, and examples.
- **SDRF representation** — parse SDRF/TSV files into plain typed objects and serialize them back.
- **Validation engine** — validate individual cell values (real-time, as the user types) or entire files (batch, before export) against a resolved template.

### What It Does NOT Do

- It does not provide ontology term search or hierarchy traversal directly — that is delegated to `@sdrf-toolkit/ontology-lookup`.
- It does not include a UI — it provides the data and validation logic that a UI (such as a Vue/Vuetify application) consumes.

---

## Package Structure

```
core/
├── src/
│   ├── index.ts                          # Public API barrel export
│   ├── types/
│   │   ├── template.ts                   # SdrfTemplate, ColumnDefinition, etc.
│   │   ├── sdrf.ts                       # SdrfFile, SdrfRow
│   │   └── validation.ts                 # ValidationResult, ValidationIssue, etc.
│   ├── templates/
│   │   ├── loader.ts                     # TemplateSource implementations (bundled, FS, remote, fallback)
│   │   ├── parser.ts                     # Parse raw YAML into RawSdrfTemplate objects
│   │   ├── merger.ts                     # Resolve "extends" chains, merge columns
│   │   └── registry.ts                   # TemplateRegistry — holds and resolves templates
│   ├── sdrf/
│   │   ├── parser.ts                     # Parse TSV string or file into SdrfFile
│   │   └── serializer.ts                 # Serialize SdrfFile back to TSV
│   ├── validation/
│   │   ├── engine.ts                     # ValidationEngine — orchestrates all validators
│   │   ├── validator-factory.ts          # Maps validator_name strings to Validator instances
│   │   ├── helpers.ts                    # Special value bypass logic (not applicable, etc.)
│   │   └── validators/
│   │       ├── base.ts                   # CellValidator and GlobalValidator interfaces
│   │       ├── ontology.ts              # OntologyValidator (delegates to ontology-lookup)
│   │       ├── pattern.ts               # PatternValidator (regex)
│   │       ├── values.ts                # ValuesValidator (fixed allowed list)
│   │       ├── single-cardinality.ts    # SingleCardinalityValidator (no semicolons)
│   │       ├── number-with-unit.ts      # NumberWithUnitValidator (e.g., "1.5 mg")
│   │       ├── mz-value.ts              # MzValueValidator (positive finite m/z)
│   │       ├── mz-range-interval.ts     # MzRangeIntervalValidator ("lower-upper")
│   │       ├── date.ts                  # DateValidator (ISO 8601 partial dates)
│   │       ├── accession.ts             # AccessionValidator (prefix/suffix/biosample)
│   │       ├── identifier.ts            # IdentifierValidator (charset + special values)
│   │       ├── semver.ts                # SemverValidator (semantic version strings)
│   │       ├── structured-kv.ts         # StructuredKvValidator (key=value segments)
│   │       ├── trailing-whitespace.ts   # TrailingWhitespaceValidator
│   │       ├── column-order.ts          # ColumnOrderValidator
│   │       ├── empty-cells.ts           # EmptyCellsValidator
│   │       ├── min-columns.ts           # MinColumnsValidator
│   │       └── combination-no-duplicate.ts  # CombinationNoDuplicateValidator
├── templates/                            # Bundled YAML template files (optional default source)
│   ├── base.yaml
│   ├── human.yaml
│   ├── ms-proteomics.yaml
│   ├── dda-acquisition.yaml
│   └── ...
├── tests/
├── package.json
├── tsconfig.json
└── README.md
```

---

## Core Types

All data structures are plain TypeScript interfaces — no class instances. This makes them easy to serialize, clone, pass through Vue reactivity, or send across Electron IPC.

### Template Types

#### `RawSdrfTemplate`

The raw shape of a single YAML template file after parsing, before any `extends` resolution:

```typescript
export interface RawSdrfTemplate {
  name: string;
  description: string;
  version: string;
  extends?: string;
  usable_alone: boolean;
  layer?: string;
  mutually_exclusive_with?: string[];
  validators?: RawGlobalValidator[];
  columns?: RawColumnDefinition[];
}
```

#### `SdrfTemplate`

A fully resolved template after merging all `extends` chains. This is the primary type your application works with:

```typescript
export interface SdrfTemplate {
  /** Names of all templates that were composed (e.g., ["base", "human", "ms-proteomics"]) */
  composedFrom: string[];

  /** Template-level metadata */
  name: string;
  description: string;
  version: string;
  usable_alone: boolean;
  layer?: string;
  mutually_exclusive_with: string[];

  /** Merged column definitions in order */
  columns: ColumnDefinition[];

  /** Global validators (trailing whitespace, column order, etc.) */
  globalValidators: GlobalValidatorDefinition[];
}
```

#### `ColumnDefinition`

A single column in a resolved template. Contains everything a UI needs to render and validate a form field:

```typescript
export interface ColumnDefinition {
  /** Column header name (e.g., "characteristics[disease]", "source name") */
  name: string;

  /** Human-readable description of what this column contains */
  description: string;

  /** Whether this column is required, recommended, or optional */
  requirement: "required" | "recommended" | "optional";

  /**
   * Whether the column accepts multiple semicolon-separated values in a single cell.
   * Default: "single".
   */
  cardinality: "single" | "multiple";

  /** Whether "not applicable" is a valid value for this column */
  allowNotApplicable: boolean;

  /** Whether "not available" is a valid value for this column */
  allowNotAvailable: boolean;

  /** Whether "anonymized" is a valid value for this column */
  allowAnonymized: boolean;    // default: false

  /** Whether "pooled" is a valid value for this column */
  allowPooled: boolean;        // default: false

  /** Validators to run on cell values in this column */
  validators: CellValidatorDefinition[];

  /** Which template this column originated from (useful for UI grouping by layer) */
  sourceTemplate: string;
}
```

#### `CellValidatorDefinition` and `GlobalValidatorDefinition`

```typescript
export interface CellValidatorDefinition {
  /** Validator type: "ontology", "pattern", or "values" */
  validatorName: string;

  /** Validator-specific parameters (see Validator Specifications below) */
  params: Record<string, unknown>;

  /** Human-readable description of the validation rule (from YAML) */
  description?: string;

  /** Example valid values (from YAML, useful for UI hints/placeholders) */
  examples?: string[];
}

export interface GlobalValidatorDefinition {
  validatorName: string;
  params: Record<string, unknown>;
}
```

### SDRF Data Types

```typescript
/** A parsed SDRF file */
export interface SdrfFile {
  /** Column headers as they appear in the file */
  headers: string[];

  /** Rows of data */
  rows: SdrfRow[];
}

export interface SdrfRow {
  /** 0-based row index in the original file (excluding header row) */
  index: number;

  /** Column name → cell value */
  cells: Record<string, string>;
}
```

### Validation Types

```typescript
export type ErrorLevel = "error" | "warning";

export interface ValidationIssue {
  /** Severity level */
  level: ErrorLevel;

  /** Human-readable message describing the issue */
  message: string;

  /** Which validator produced this issue (e.g., "ontology", "pattern", "empty_cells") */
  validatorName: string;

  /** Row index (undefined for file-level issues like column order) */
  rowIndex?: number;

  /** Column name (undefined for row-level or file-level issues) */
  columnName?: string;

  /** The value that failed validation */
  value?: string;
}

/** Result of validating a single cell value */
export interface CellValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/** Result of validating an entire SDRF file */
export interface FileValidationResult {
  /** true if zero errors (warnings don't count) */
  valid: boolean;

  /** All issues with level "error" */
  errors: ValidationIssue[];

  /** All issues with level "warning" */
  warnings: ValidationIssue[];
}
```

---

## Template Loading & Resolution

### Template Sources

The package abstracts where YAML template files come from via the `TemplateSource` interface. Four implementations are provided:

```typescript
export interface TemplateSource {
  /** Load raw YAML text by template name (without .yaml extension) */
  load(name: string): Promise<string>;

  /** List available template names */
  list(): Promise<string[]>;
}

/** Load from YAML files bundled inside the npm package */
export class BundledTemplateSource implements TemplateSource { ... }

/** Load from a directory on the filesystem */
export class FilesystemTemplateSource implements TemplateSource {
  constructor(directory: string);
}

/** Load from a remote URL (e.g., GitHub raw content) */
export class RemoteTemplateSource implements TemplateSource {
  constructor(baseUrl: string);
}

/**
 * Composite source: try multiple sources in order.
 * Useful for "load custom templates first, fall back to bundled defaults."
 */
export class FallbackTemplateSource implements TemplateSource {
  constructor(sources: TemplateSource[]);
}
```

### Template Registry

The `TemplateRegistry` is the main entry point for working with templates. It loads, caches, and resolves templates:

```typescript
export class TemplateRegistry {
  constructor(source: TemplateSource);

  /** Load all available templates from the source. Call once at startup. */
  async initialize(): Promise<void>;

  /** Get a single raw (unmerged) template by name */
  getTemplate(name: string): RawSdrfTemplate | undefined;

  /** List all available template names */
  getAvailableTemplates(): string[];

  /** Get templates filtered by layer (e.g., "sample", "experiment") */
  getTemplatesByLayer(layer: string): RawSdrfTemplate[];

  /**
   * Check which templates are mutually exclusive with a given template.
   * Use this at template selection time in the UI to disable incompatible choices.
   */
  getMutuallyExclusiveWith(name: string): string[];

  /**
   * Resolve a set of template names into a single merged SdrfTemplate.
   * Handles "extends" chains automatically.
   *
   * Example: resolveTemplates(["human", "dda-acquisition"])
   *   → resolves human (extends base), dda-acquisition (extends ms-proteomics → base)
   *   → deduplicates base columns
   *   → returns one merged SdrfTemplate
   */
  async resolveTemplates(names: string[]): Promise<SdrfTemplate>;
}
```

### Template Merge Algorithm

When `resolveTemplates(["human", "dda-acquisition"])` is called, the following steps occur:

**1. Expand extends chains:**
Each template's `extends` field is followed recursively until a template with no parent is reached.

```
human          → extends base          → chain: [base, human]
dda-acquisition → extends ms-proteomics → extends base → chain: [base, ms-proteomics, dda-acquisition]
```

**2. Linearize and deduplicate:**
All chains are combined in dependency order. Duplicates are removed, keeping the first occurrence:

```
[base, human, ms-proteomics, dda-acquisition]
```

**3. Merge columns:**
Walk the linearized list in order. For each template, append its columns to the result. If a column with the same name already exists from an earlier template, the later definition overrides it. This allows more specific templates to refine columns defined in base templates.

**4. Merge global validators:**
Concatenate all global validators from all templates, deduplicating by `validator_name`.

**5. Merge metadata:**
The final `SdrfTemplate` gets `composedFrom: ["base", "human", "ms-proteomics", "dda-acquisition"]`, and `mutually_exclusive_with` is the union of all exclusions from all composed templates.

---

## SDRF Parsing & Serialization

```typescript
/** Parse a TSV string into an SdrfFile */
export function parseSdrf(tsv: string): SdrfFile;

/** Parse from a file path (Node.js only) */
export async function parseSdrfFile(filePath: string): Promise<SdrfFile>;

/** Serialize an SdrfFile back to TSV */
export function serializeSdrf(file: SdrfFile): string;
```

The parser splits on `\n` (handling `\r\n`), splits each line on `\t`, and maps headers to values. It produces raw string values with no transformation — validation is a separate step. Rows are assigned a 0-based `index` (excluding the header row).

The serializer writes headers as the first row, then one row per `SdrfRow`, joined by `\t`, with `\n` line endings.

---

## Validation Engine

### Architecture

The validation system has two levels:

- **Cell validators** operate on a single cell value within a specific column. They are defined per-column in the YAML template (under `validators`).
- **Global validators** operate on the entire `SdrfFile` at once. They are defined at the template level (under `validators` at the root of the YAML).

Both implement async interfaces so that validators like `ontology` (which may become async in the future for remote lookups) work seamlessly.

### Validator Interfaces

```typescript
export interface CellValidator {
  readonly name: string;
  validate(value: string, context: CellValidationContext): Promise<CellValidationResult>;
}

export interface CellValidationContext {
  /** The column definition this cell belongs to */
  columnDef: ColumnDefinition;
  /** 0-based row index */
  rowIndex: number;
  /** Access to the full row (for cross-column checks) */
  row: SdrfRow;
}

export interface GlobalValidator {
  readonly name: string;
  validate(file: SdrfFile, template: SdrfTemplate): Promise<ValidationIssue[]>;
}
```

### Validator Factory

The `ValidatorFactory` maps `validatorName` strings from the YAML to concrete validator instances. It is the extension point for adding custom validator types:

```typescript
export class ValidatorFactory {
  constructor(ontologyRegistry: OntologyRegistry);

  createCellValidator(definition: CellValidatorDefinition): CellValidator;
  createGlobalValidator(definition: GlobalValidatorDefinition): GlobalValidator;
}
```

### Validation Engine

The `ValidationEngine` is the primary API for running validations:

```typescript
export class ValidationEngine {
  constructor(
    ontologyRegistry: OntologyRegistry,
    factory?: ValidatorFactory   // optional — creates a default factory if omitted
  );

  /**
   * Validate a single cell value against a column definition.
   * Use this for real-time validation in the UI as the user types.
   */
  async validateCell(
    value: string,
    columnDef: ColumnDefinition,
    context?: Partial<CellValidationContext>
  ): Promise<CellValidationResult>;

  /**
   * Validate an entire SDRF file against a resolved template.
   * Runs all cell-level validators on every cell, then all global validators.
   */
  async validateFile(
    file: SdrfFile,
    template: SdrfTemplate
  ): Promise<FileValidationResult>;
}
```

### Special Value Handling

Before any cell validator runs, the engine checks for special sentinel values that bypass validation:

| Cell Value | Bypass Condition |
|---|---|
| `"not applicable"` | Allowed only if `columnDef.allowNotApplicable` is `true` |
| `"not available"` | Allowed only if `columnDef.allowNotAvailable` is `true` |
| `"anonymized"` | Allowed only if `columnDef.allowAnonymized` is `true` |
| `"pooled"` | Allowed only if `columnDef.allowPooled` is `true` |

If the value matches a sentinel but the column does not allow it, an error is produced. If the column allows it, all further validators are skipped for that cell.

This logic is centralized in `helpers.ts` so all validators benefit from it automatically.

### Multi-Value Handling (Cardinality: Multiple)

For columns with `cardinality: "multiple"`, cell values may contain semicolon-separated segments (e.g., `"HCD;ETD"`). The engine:

1. Splits the cell value on `;`, trimming whitespace around each segment.
2. Runs each segment through the cell validators independently.
3. Aggregates all issues, annotating each with the specific sub-value that failed.

### Custom Column Handling

When validating a full `SdrfFile` against an `SdrfTemplate`, each column header is classified:

1. **Defined column** — matches a column name in the template. Validators are run normally.
2. **Valid custom column** — does not match a defined column, but follows the bracketed syntax: `comment[<name>]`, `characteristics[<name>]`, or `factor value[<name>]`. Accepted silently with no validators run on its values.
3. **Invalid column** — matches neither. Produces an error: `"Column '<name>' is not a valid SDRF column. Custom columns must use comment[<name>], characteristics[<name>], or factor value[<name>] syntax."`

---

## Built-In Validators

### Cell Validators

#### `ontology`

Validates that a cell value is a recognized term in one or more ontologies. Delegates to `@sdrf-toolkit/ontology-lookup`.

**Params:**
```typescript
{
  ontologies: string[];           // e.g., ["mondo", "efo", "doid", "pato"]
  parent_term?: string;           // e.g., "MS:1000044" — value must be a descendant of this term
  error_level: "error" | "warning";
  description?: string;
  examples?: string[];
}
```

**Logic:**
1. Call `ontologyRegistry.resolve(value, params.ontologies)` for strict matching (exact label, exact synonym, or accession).
2. If no match → produce issue at `params.error_level`.
3. If match found and `parent_term` is set → call `ontologyRegistry.isDescendantOf(match.accession, params.parent_term, match.ontology)`.
4. If not a descendant → produce issue at `params.error_level`.

**Example YAML:**
```yaml
validators:
  - validator_name: ontology
    params:
      ontologies:
        - mondo
        - efo
        - doid
        - pato
      error_level: warning
      description: The disease should be a valid MONDO, EFO, DOID, or PATO ontology term.
      examples:
        - normal
        - breast cancer
        - diabetes mellitus
```

#### `pattern`

Validates that a cell value matches a regular expression.

**Params:**
```typescript
{
  pattern: string;                // regex string (e.g., "^\\d+[yYmMdD]")
  case_sensitive?: boolean;       // default: true
  description?: string;
  examples?: string[];
}
```

**Logic:**
1. Compile regex with `"i"` flag if `case_sensitive` is `false`.
2. Test value against the regex.
3. If no match → produce an error.

**Example YAML:**
```yaml
validators:
  - validator_name: pattern
    params:
      pattern: ^\d+[yYmMdD](\d+[yYmMdD])*(-\d+[yYmMdD](\d+[yYmMdD])*)?$
      case_sensitive: false
      description: Age should be in format like 45Y, 6M, 30Y6M, or ranges like 40Y-50Y.
      examples:
        - 45Y
        - 6M
        - 30Y6M
        - 40Y-50Y
```

#### `values`

Validates that a cell value is one of a fixed set of allowed values.

**Params:**
```typescript
{
  values: string[];               // e.g., ["male", "female", "intersex", ...]
  error_level?: "error" | "warning";  // default: "error"
  case_sensitive?: boolean;       // default: false
  description?: string;
  examples?: string[];
}
```

**Logic:**
1. Normalize the input value (lowercase + trimmed if not case-sensitive).
2. Normalize each entry in `params.values` the same way.
3. Check membership.
4. If not found → produce issue at the specified error level.

**Note on special values:** When a `values` list explicitly includes entries like `"not available"`, `"not applicable"`, `"anonymized"`, or `"pooled"`, the special-value bypass (see above) will have already accepted these before the `values` validator runs. The duplication is harmless and intentional — the YAML is self-documenting about what the column accepts.

**Example YAML:**
```yaml
validators:
  - validator_name: values
    params:
      values:
        - male
        - female
        - intersex
        - not available
        - not applicable
        - anonymized
        - pooled
      error_level: error
      description: Sex should be one of the allowed values.
```

#### `single_cardinality_validator`

Validates that a cell value does not contain semicolons (i.e., it is a single value, not multiple).

**Params:**
```typescript
{
  error_level?: "error" | "warning";  // default: "error"
}
```

**Logic:** If the value contains a `";"` character → produce an issue at the specified level.

**Example YAML:**
```yaml
validators:
  - validator_name: single_cardinality_validator
    params:
      error_level: error
```

#### `number_with_unit`

Validates that a cell value is a number followed by a unit from an allowed list (e.g., `"1.5 mg"`).

**Params:**
```typescript
{
  units: string[];                // e.g., ["mg", "µg", "ng"]
  allow_negative?: boolean;       // default: true (negative numbers are allowed)
  error_level?: "error" | "warning";  // default: "error"
}
```

**Logic:**
1. Split on the last space; the left part must be a valid finite number, the right part must be in `params.units`.
2. If `allow_negative` is `false` and the number is negative → produce an issue.

**Example YAML:**
```yaml
validators:
  - validator_name: number_with_unit
    params:
      units:
        - mg
        - µg
        - ng
      allow_negative: false
      error_level: error
```

#### `mz_value`

Validates that a cell value is a positive finite number (an m/z ratio).

**Params:**
```typescript
{
  error_level?: "error" | "warning";  // default: "error"
}
```

**Logic:** Parse the value as a float. If it is not a positive finite number → produce an issue.

**Example YAML:**
```yaml
validators:
  - validator_name: mz_value
    params:
      error_level: error
```

#### `mz_range_interval`

Validates that a cell value is a valid m/z range in `"lower-upper"` format where both bounds are positive and `lower < upper`.

**Params:**
```typescript
{
  error_level?: "error" | "warning";  // default: "error"
}
```

**Logic:**
1. Split on the first `"-"` character.
2. Both parts must be positive finite numbers.
3. Lower bound must be strictly less than upper bound.

**Example YAML:**
```yaml
validators:
  - validator_name: mz_range_interval
    params:
      error_level: error
```

#### `date`

Validates that a cell value is an ISO 8601 partial date at the specified precision levels.

**Params:**
```typescript
{
  format?: "iso8601";                             // currently only "iso8601" is supported
  precision?: ("year" | "month" | "day")[];       // default: ["year", "month", "day"]
  error_level?: "error" | "warning";              // default: "error"
}
```

**Logic:** Test the value against the allowed precision patterns:
- `"year"` → `/^\d{4}$/` (e.g., `"2024"`)
- `"month"` → `/^\d{4}-\d{2}$/` (e.g., `"2024-03"`)
- `"day"` → `/^\d{4}-\d{2}-\d{2}$/` (e.g., `"2024-03-15"`)

If none of the configured precisions match → produce an issue.

**Example YAML:**
```yaml
validators:
  - validator_name: date
    params:
      precision:
        - year
        - month
      error_level: error
```

#### `accession`

Validates that a cell value is a valid accession number. Supports BioSample format or custom prefix/suffix constraints.

**Params:**
```typescript
{
  format?: "biosample";     // validate against SAM[DENA]\d+ pattern
  prefix?: string;          // value must start with this string
  suffix?: string;          // value must end with this string
  error_level?: "error" | "warning";  // default: "error"
}
```

**Logic:**
- If `format` is `"biosample"`: validate against `/^SAM[DENA]\d+$/`.
- Otherwise: check `prefix` and `suffix` constraints independently.

**Example YAML:**
```yaml
validators:
  - validator_name: accession
    params:
      format: biosample
      error_level: error
```

#### `identifier`

Validates that a cell value consists only of characters matching a given charset pattern, with optional special values that bypass the charset check.

**Params:**
```typescript
{
  charset?: string;           // regex character class body, e.g., "[A-Za-z0-9_-]"
  special_values?: string[];  // values that always pass (e.g., ["N/A"])
  error_level?: "error" | "warning";  // default: "error"
}
```

**Logic:**
1. If the value is in `special_values` → pass immediately.
2. If `charset` is set → test the value against `/^(<charset>)+$/`. If it does not match → produce an issue.

**Example YAML:**
```yaml
validators:
  - validator_name: identifier
    params:
      charset: "[A-Za-z0-9_\\-]"
      special_values:
        - N/A
      error_level: error
```

#### `semver`

Validates that a cell value is a semantic version string (`MAJOR.MINOR.PATCH`), optionally with a prefix and pre-release support.

**Params:**
```typescript
{
  prefix?: string;              // strip this prefix before validation (e.g., "v")
  allow_prerelease?: boolean;   // default: false
  error_level?: "error" | "warning";  // default: "error"
}
```

**Logic:**
1. Strip the prefix if present.
2. Match against `/^\d+\.\d+\.\d+$/`.
3. If `allow_prerelease` is `true`, also accept `/^\d+\.\d+\.\d+-[a-zA-Z0-9.]+$/`.

**Example YAML:**
```yaml
validators:
  - validator_name: semver
    params:
      prefix: v
      allow_prerelease: false
      error_level: error
```

#### `structured_kv`

Validates that a cell value is a structured key=value string with a defined separator and required field patterns.

**Params:**
```typescript
{
  separator: string;              // string to split segments on (e.g., ";")
  fields: {
    key: string;                  // expected key name
    value: string;                // regex pattern the value must match
  }[];
  error_level?: "error" | "warning";  // default: "error"
}
```

**Logic:**
1. Split the value on `separator` to get segments.
2. Parse each segment on the first `"="` to get `key=value` pairs.
3. For each required field in `params.fields`: verify the field is present and its value matches the regex pattern. Missing or mismatching fields produce individual issues.

**Example YAML:**
```yaml
validators:
  - validator_name: structured_kv
    params:
      separator: ";"
      fields:
        - key: AC
          value: "^\\d+\\.\\d+$"
        - key: NAME
          value: "^\\S+$"
      error_level: error
```

---

### Global Validators

#### `trailing_whitespace_validator`

**Scope:** All cells in the entire file.

**Logic:** For every cell in every row, check if `value !== value.trim()`. If leading or trailing whitespace is found, produce a warning with the row index and column name.

#### `column_order`

**Scope:** File headers.

**Logic:**
1. Extract the ordered list of expected column names from the resolved template.
2. Filter the file's headers to include only those present in the expected list.
3. Verify the relative order of these filtered headers matches the template order.
4. Custom columns (bracket syntax not in the template) are excluded from the ordering check — they may appear in any position.

#### `empty_cells`

**Scope:** All rows, for required columns only.

**Logic:** For each column with `requirement: "required"` in the template, check every row. If the cell is empty or contains only whitespace → produce an error.

#### `min_columns`

**Scope:** File headers.

**Params:**
```typescript
{
  min_columns: number;   // minimum number of columns the file must have
}
```

**Logic:** If `file.headers.length < params.min_columns` → produce an error.

**Example YAML:**
```yaml
validators:
  - validator_name: min_columns
    params:
      min_columns: 4
```

#### `combination_of_columns_no_duplicate_validator`

**Scope:** All rows, across specified column combinations.

**Params:**
```typescript
{
  column_name: string[];          // combination must be unique → error if duplicated
  column_name_warning: string[];  // combination should be unique → warning if duplicated
}
```

**Logic:**
1. For `column_name`: build a composite key for each row by concatenating the values of the specified columns (separated by `|`). If any composite key appears more than once → produce an error for each duplicate row.
2. For `column_name_warning`: same logic, but produce a warning instead of an error.

**Example YAML:**
```yaml
validators:
  - validator_name: combination_of_columns_no_duplicate_validator
    params:
      column_name:
        - source name
        - assay name
      column_name_warning:
        - source name
        - assay name
```

---

## YAML Template Format Reference

This section documents the full YAML schema so template authors know what fields are available.

### Template-Level Fields

```yaml
name: human                          # Unique template identifier
description: Human SDRF template...  # Human-readable description
version: 1.1.0                       # Semver version
extends: base                        # Parent template name (optional)
usable_alone: false                  # Whether this template can be used without combining with others
layer: sample                        # Template layer for categorization (optional)
mutually_exclusive_with:             # Templates that cannot be combined with this one
  - vertebrates
  - invertebrates
  - plants
```

### Template-Level Validators

Defined at the root `validators` key. These run on the entire file, not individual cells:

```yaml
validators:
  - validator_name: trailing_whitespace_validator
    params: {}
  - validator_name: column_order
    params: {}
  - validator_name: empty_cells
    params: {}
  - validator_name: min_columns
    params:
      min_columns: 4
  - validator_name: combination_of_columns_no_duplicate_validator
    params:
      column_name:
        - source name
        - assay name
      column_name_warning:
        - source name
        - assay name
```

### Column Definitions

Each column under the `columns` key:

```yaml
columns:
  - name: characteristics[disease]       # Column header
    description: Disease state...        # Human-readable description
    requirement: required                # required | recommended | optional
    cardinality: multiple                # single (default) | multiple
    allow_not_applicable: true           # Whether "not applicable" is accepted
    allow_not_available: true            # Whether "not available" is accepted
    allow_anonymized: false              # Whether "anonymized" is accepted (default: false)
    allow_pooled: false                  # Whether "pooled" is accepted (default: false)
    validators:                          # Cell-level validators
      - validator_name: ontology
        params:
          ontologies:
            - mondo
            - efo
          parent_term: MS:1000044        # Optional: value must descend from this term
          error_level: warning           # error | warning
          description: The disease should be a valid ontology term.
          examples:
            - normal
            - breast cancer
```

---

## Complete Usage Example

```typescript
import {
  TemplateRegistry,
  FallbackTemplateSource,
  FilesystemTemplateSource,
  BundledTemplateSource,
  ValidationEngine,
  parseSdrf,
  serializeSdrf
} from "@sdrf-toolkit/core";
import { OntologyRegistry } from "@sdrf-toolkit/ontology-lookup";

// ─── 1. Initialize (once at app startup) ────────────────────────

const ontologyRegistry = new OntologyRegistry({
  indexDir: "/path/to/ontology-data",
  updateSource: "your-org/sdrf-toolkit",
  releaseTag: "latest"
});
await ontologyRegistry.initialize();

const templateRegistry = new TemplateRegistry(
  new FallbackTemplateSource([
    new FilesystemTemplateSource("/path/to/custom-templates"),
    new BundledTemplateSource(),
  ])
);
await templateRegistry.initialize();

const engine = new ValidationEngine(ontologyRegistry);


// ─── 2. Discover available templates ─────────────────────────────

const allTemplates = templateRegistry.getAvailableTemplates();
// → ["base", "human", "vertebrates", "ms-proteomics", "dda-acquisition", ...]

const sampleTemplates = templateRegistry.getTemplatesByLayer("sample");
// → [{ name: "human", ... }, { name: "vertebrates", ... }, ...]

// Check mutual exclusivity before allowing selection
templateRegistry.getMutuallyExclusiveWith("human");
// → ["vertebrates", "invertebrates", "plants"]


// ─── 3. Resolve selected templates into a merged schema ─────────

const template = await templateRegistry.resolveTemplates(["human", "dda-acquisition"]);

// The template contains everything needed to build a form UI:
for (const col of template.columns) {
  console.log(col.name);            // "characteristics[disease]"
  console.log(col.description);     // "Disease state of the sample"
  console.log(col.requirement);     // "required"
  console.log(col.sourceTemplate);  // "human" — group columns by origin in the UI
  console.log(col.validators);      // Full definitions with descriptions & examples
  // Use col.validators[0].examples for placeholder hints in the UI
  // Use col.validators[0].description for tooltip text
}


// ─── 4. Validate a single cell in real-time ──────────────────────

const colDef = template.columns.find(c => c.name === "characteristics[disease]")!;
const result = await engine.validateCell("breast cancer", colDef);
console.log(result.valid);     // true
console.log(result.issues);    // []

const badResult = await engine.validateCell("not a real disease", colDef);
console.log(badResult.valid);  // false (or true if error_level is "warning")
console.log(badResult.issues); // [{ level: "warning", message: "...", ... }]


// ─── 5. Use ontology search for autocomplete ─────────────────────

// For ontology-backed columns, use the registry directly for autocomplete
const searchResults = ontologyRegistry.search("breast can", ["mondo", "efo", "doid", "pato"]);
// → [
//   { term: { label: "breast cancer", accession: "MONDO:0007254" }, score: 0.8 },
//   { term: { label: "breast carcinoma", ... }, score: 0.7 },
//   ...
// ]


// ─── 6. Validate an entire SDRF file before export ───────────────

const sdrfFile = parseSdrf(tsvString);
const fileResult = await engine.validateFile(sdrfFile, template);

if (!fileResult.valid) {
  // Show blocking errors — user cannot export until these are fixed
  for (const error of fileResult.errors) {
    console.error(`Row ${error.rowIndex}, ${error.columnName}: ${error.message}`);
  }
}

// Show non-blocking warnings — user can export but should review
for (const warning of fileResult.warnings) {
  console.warn(`Row ${warning.rowIndex}, ${warning.columnName}: ${warning.message}`);
}


// ─── 7. Serialize back to TSV ────────────────────────────────────

const tsv = serializeSdrf(sdrfFile);
// Write to file or download
```

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Data model | Plain interfaces, no classes | Serialization-friendly, Vue reactivity-friendly, easy to pass over Electron IPC |
| Validators | Async interface | Future-proof for remote lookups; synchronous validators simply resolve immediately |
| Template sources | Pluggable `TemplateSource` interface | Supports bundled, filesystem, remote, and composite strategies |
| Template resolution | Package resolves `extends` chains | Consuming app just passes template names; no need to understand the inheritance tree |
| Error vs. Warning | Two levels only | Matches the YAML spec; keeps the validation result model simple |
