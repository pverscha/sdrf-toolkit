import type { CellValidationResult, ValidationIssue } from "../../types/validation.js";
import type { ColumnDefinition } from "../../types/template.js";
import type { SdrfRow, SdrfFile } from "../../types/sdrf.js";
import type { SdrfTemplate } from "../../types/template.js";

export interface CellValidationContext {
  /** The column definition this cell belongs to */
  columnDef: ColumnDefinition;

  /** 0-based row index */
  rowIndex: number;

  /** Access to the full row (for cross-column checks) */
  row: SdrfRow;
}

export interface CellValidator {
  readonly name: string;
  validate(value: string, context: CellValidationContext): Promise<CellValidationResult>;
}

export interface GlobalValidator {
  readonly name: string;
  validate(file: SdrfFile, template: SdrfTemplate): Promise<ValidationIssue[]>;
}
