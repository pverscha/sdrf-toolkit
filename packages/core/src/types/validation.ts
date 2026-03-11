export type ErrorLevel = "error" | "warning";

export interface ValidationIssue {
  /** Severity level */
  level: ErrorLevel;

  /** Human-readable message describing the issue */
  message: string;

  /** Which validator produced this issue */
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
