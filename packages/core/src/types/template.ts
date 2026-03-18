// ---------------------------------------------------------------------------
// Validator type enums — exhaustive lists of all supported validator names
// ---------------------------------------------------------------------------

/** All supported cell-level validator types. */
export enum CellValidatorType {
  Ontology = "ontology",
  Pattern = "pattern",
  Values = "values",
  SingleCardinality = "single_cardinality_validator",
  NumberWithUnit = "number_with_unit",
  MzValue = "mz_value",
  MzRangeInterval = "mz_range_interval",
  Date = "date",
  Accession = "accession",
  Identifier = "identifier",
  Semver = "semver",
  StructuredKv = "structured_kv",
}

/** All supported global (file-level) validator types. */
export enum GlobalValidatorType {
  TrailingWhitespace = "trailing_whitespace_validator",
  ColumnOrder = "column_order",
  EmptyCells = "empty_cells",
  CombinationNoDuplicate = "combination_of_columns_no_duplicate_validator",
  MinColumns = "min_columns",
}

// ---------------------------------------------------------------------------
// Raw types — the direct shape of parsed YAML before "extends" resolution
// ---------------------------------------------------------------------------

export interface RawGlobalValidator {
  validator_name: string;
  params: Record<string, unknown>;
}

export interface RawCellValidator {
  validator_name: string;
  params: Record<string, unknown>;
}

export interface RawRequirement {
  layer: "sample" | "technology" | "experiment";
}

export interface RawExcludes {
  templates?: string[];
  categories?: ("characteristics" | "comment" | "factor value")[];
  columns?: string[];
}

export interface RawColumnDefinition {
  name: string;
  description?: string;
  requirement?: "required" | "recommended" | "optional";
  cardinality?: "single" | "multiple";
  type?: "integer" | "string" | "float";
  allow_not_applicable?: boolean;
  allow_not_available?: boolean;
  allow_anonymized?: boolean;
  allow_pooled?: boolean;
  validators?: RawCellValidator[];
}

export interface RawSdrfTemplate {
  name: string;
  description: string;
  version: string;
  /** Raw extends value from YAML (may include @constraint, e.g. "base@>=1.0.0") */
  extends?: string;
  /** Parsed base name without constraint */
  extendsName?: string;
  /** Parsed version constraint string (e.g. ">=1.0.0" or ">=1.0.0,<2.0.0") */
  extendsConstraint?: string;
  usable_alone: boolean;
  layer?: string;
  mutually_exclusive_with?: string[];
  requires?: RawRequirement[];
  excludes?: RawExcludes;
  validators?: RawGlobalValidator[];
  columns?: RawColumnDefinition[];
}

// ---------------------------------------------------------------------------
// Resolved types — produced after merging "extends" chains
// ---------------------------------------------------------------------------

export interface CellValidatorDefinition {
  /** The type of cell-level validator to apply. */
  validatorName: CellValidatorType;

  /** Validator-specific parameters */
  params: Record<string, unknown>;

  /** Human-readable description (from YAML) */
  description?: string;

  /** Example valid values (from YAML, useful for UI hints) */
  examples?: string[];
}

export interface GlobalValidatorDefinition {
  validatorName: GlobalValidatorType;
  params: Record<string, unknown>;
}

export interface ColumnDefinition {
  /** Column header name (e.g., "characteristics[disease]", "source name") */
  name: string;

  /** Human-readable description of what this column contains */
  description: string;

  /** Whether this column is required, recommended, or optional */
  requirement: "required" | "recommended" | "optional";

  /**
   * Whether the column accepts multiple semicolon-separated values.
   * Default: "single"
   */
  cardinality: "single" | "multiple";

  /** Data type hint for the column value */
  type?: "integer" | "string" | "float";

  allowNotApplicable: boolean;
  allowNotAvailable: boolean;
  allowAnonymized: boolean;
  allowPooled: boolean;

  /** Validators to run on cell values in this column */
  validators: CellValidatorDefinition[];

  /** Which template this column originated from */
  sourceTemplate: string;
}

export interface SdrfTemplate {
  /** Names of all templates that were composed */
  composedFrom: string[];

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
