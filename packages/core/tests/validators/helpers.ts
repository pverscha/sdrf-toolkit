/**
 * Shared test helpers for validator test suites.
 * Provides factory functions to build CellValidationContext and SdrfTemplate
 * objects without duplicating boilerplate across every test file.
 */

import type { CellValidationContext } from "../../src/validation/validators/base.js";
import type { ColumnDefinition, SdrfTemplate } from "../../src/types/template.js";

export function makeColumnDef(overrides: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return {
    name: "test col",
    description: "",
    requirement: "required",
    cardinality: "single",
    allowNotApplicable: false,
    allowNotAvailable: false,
    allowAnonymized: false,
    allowPooled: false,
    validators: [],
    sourceTemplate: "base",
    ...overrides,
  };
}

export function makeContext(overrides: Partial<CellValidationContext> = {}): CellValidationContext {
  return {
    columnDef: makeColumnDef(),
    rowIndex: 0,
    row: { index: 0, cells: {} },
    ...overrides,
  };
}

export function makeTemplate(overrides: Partial<SdrfTemplate> = {}): SdrfTemplate {
  return {
    composedFrom: ["base"],
    name: "base",
    description: "",
    version: "1.0.0",
    usable_alone: false,
    mutually_exclusive_with: [],
    columns: [
      makeColumnDef({ name: "source name" }),
      makeColumnDef({ name: "assay name" }),
    ],
    globalValidators: [],
    ...overrides,
  };
}
