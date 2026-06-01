import type { OntologyRegistry } from "@sdrf-toolkit/ontology-lookup";

/**
 * Maps official Python sdrf-pipelines error category strings to the local
 * TypeScript validator name strings reported in ValidationIssue.validatorName.
 */
export const OFFICIAL_TO_LOCAL: Record<string, string> = {
  MISSING_REQUIRED_COLUMN:         "empty_cells",
  EMPTY_CELL:                      "empty_cells",
  TRAILING_WHITESPACE:             "trailing_whitespace_validator",
  TRAILING_WHITESPACE_COLUMN_NAME: "trailing_whitespace_validator",
  COLUMN_ORDER_INVALID:            "column_order",
  CHARACTERISTICS_AFTER_ASSAY:     "column_order",
  COMMENT_BEFORE_ASSAY:            "column_order",
  FACTOR_COLUMN_NOT_LAST:          "column_order",
  ONTOLOGY_TERM_NOT_FOUND:         "ontology",
  INVALID_ONTOLOGY_TERM_FORMAT:    "ontology",
  PATTERN_MISMATCH:                "pattern",
  INVALID_VALUE:                   "values",
  DUPLICATE_COMBINATION:           "combination_of_columns_no_duplicate_validator",
  DUPLICATE_VALUE:                 "combination_of_columns_no_duplicate_validator",
  INSUFFICIENT_COLUMNS:            "min_columns",
  SINGLE_CARDINALITY_VIOLATED:     "single_cardinality_validator",
};

/**
 * Categories that should not be compared against the local validator output.
 * Ontology errors are excluded because the mock registry passes all ontology
 * lookups in CI.
 */
export const SKIP_CATEGORIES = new Set([
  "ONTOLOGY_TERM_NOT_FOUND",
  "INVALID_ONTOLOGY_TERM_FORMAT",
]);

/**
 * Mock OntologyRegistry that passes every lookup.
 * Ontology validation requires pre-built indexes not available in CI.
 * All structural and format validators are exercised without it.
 */
export function makeMockOntologyRegistry(): OntologyRegistry {
  return {
    resolve: () => ({ accession: "MOCK:0000001", ontology: "mock" }),
    isDescendantOf: () => true,
  } as unknown as OntologyRegistry;
}
