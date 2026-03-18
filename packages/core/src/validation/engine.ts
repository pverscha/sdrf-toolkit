import type { OntologyRegistry } from "@sdrf-toolkit/ontology-lookup";
import type { ColumnDefinition } from "../types/template.js";
import type { SdrfFile } from "../types/sdrf.js";
import type { SdrfTemplate } from "../types/template.js";
import type {
  CellValidationResult,
  FileValidationResult,
  ValidationIssue,
} from "../types/validation.js";
import type { CellValidationContext } from "./validators/base.js";
import { checkSpecialValue } from "./helpers.js";
import { ValidatorFactory } from "./validator-factory.js";

const CUSTOM_COLUMN_PATTERN = /^(comment|characteristics|factor value)\[.+\]$/i;

export class ValidationEngine {
  private readonly factory: ValidatorFactory;

  constructor(
    ontologyRegistry: OntologyRegistry,
    factory?: ValidatorFactory
  ) {
    this.factory = factory ?? new ValidatorFactory(ontologyRegistry);
  }

  /**
   * Validate a single complete cell value against a column definition.
   * Use this for real-time validation in the UI as the user types.
   */
  async validateCell(
    value: string,
    columnDef: ColumnDefinition,
    context?: Partial<CellValidationContext>
  ): Promise<CellValidationResult> {
    const fullContext: CellValidationContext = {
      columnDef,
      rowIndex: context?.rowIndex ?? 0,
      row: context?.row ?? { index: 0, cells: {} },
    };

    return this.validateSingleValue(value, columnDef, fullContext);
  }

  /**
   * Validate an entire SDRF file against a resolved template.
   * Runs all cell-level validators on every cell, then all global validators.
   */
  async validateFile(
    file: SdrfFile,
    template: SdrfTemplate
  ): Promise<FileValidationResult> {
    const allIssues: ValidationIssue[] = [];

    // Build a map of column definitions for fast lookup
    const columnMap = new Map<string, ColumnDefinition>(
      template.columns.map(c => [c.name, c])
    );

    // Validate custom column headers
    for (const header of file.headers) {
      if (!columnMap.has(header) && !CUSTOM_COLUMN_PATTERN.test(header)) {
        allIssues.push({
          level: "error",
          message:
            `Column "${header}" is not a valid SDRF column. ` +
            `Custom columns must use comment[<name>], characteristics[<name>], or factor value[<name>] syntax.`,
          validatorName: "column_header",
          columnName: header,
        });
      }
    }

    // Run cell validators on every cell in the file
    for (const row of file.rows) {
      for (const [columnName, values] of Object.entries(row.cells)) {
        const colDef = columnMap.get(columnName);
        if (!colDef) continue; // custom column — skip cell validation

        const ctx: CellValidationContext = {
          columnDef: colDef,
          rowIndex: row.index,
          row,
        };

        if (colDef.cardinality === "multiple") {
          // Each column occurrence is one complete value — validate independently
          for (const val of values) {
            const result = await this.validateSingleValue(val, colDef, ctx);
            allIssues.push(...result.issues);
          }
        } else {
          const result = await this.validateSingleValue(values[0] ?? "", colDef, ctx);
          allIssues.push(...result.issues);
        }
      }
    }

    // Run global validators
    for (const globalDef of template.globalValidators) {
      const validator = this.factory.createGlobalValidator(globalDef);
      const issues = await validator.validate(file, template);
      allIssues.push(...issues);
    }

    const errors = allIssues.filter(i => i.level === "error");
    const warnings = allIssues.filter(i => i.level === "warning");

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private async validateSingleValue(
    value: string,
    columnDef: ColumnDefinition,
    context: CellValidationContext
  ): Promise<CellValidationResult> {
    // Check special sentinel values first
    const specialResult = checkSpecialValue(value, columnDef);
    if (specialResult !== null) {
      return specialResult;
    }

    const issues: ValidationIssue[] = [];

    for (const validatorDef of columnDef.validators) {
      const validator = this.factory.createCellValidator(validatorDef);
      const result = await validator.validate(value, context);
      issues.push(...result.issues);
    }

    const hasErrors = issues.some(i => i.level === "error");
    return { valid: !hasErrors, issues };
  }

}
