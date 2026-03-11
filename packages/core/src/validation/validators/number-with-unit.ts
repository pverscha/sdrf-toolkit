import type { CellValidationResult, ValidationIssue } from "../../types/validation.js";
import type { CellValidator, CellValidationContext } from "./base.js";

export interface NumberWithUnitParams {
  units: string[];
  allow_negative?: boolean;
  error_level?: "error" | "warning";
}

export class NumberWithUnitValidator implements CellValidator {
  readonly name = "number_with_unit";

  constructor(private readonly params: NumberWithUnitParams) {}

  async validate(value: string, context: CellValidationContext): Promise<CellValidationResult> {
    const errorLevel = this.params.error_level ?? "error";

    const lastSpace = value.lastIndexOf(" ");
    if (lastSpace === -1) {
      const issue: ValidationIssue = {
        level: errorLevel,
        message: `"${value}" must be a number followed by a unit (e.g., "1.5 mg").`,
        validatorName: this.name,
        rowIndex: context.rowIndex,
        columnName: context.columnDef.name,
        value,
      };
      return { valid: errorLevel === "warning", issues: [issue] };
    }

    const numStr = value.slice(0, lastSpace).trim();
    const unit = value.slice(lastSpace + 1).trim();

    const num = parseFloat(numStr);
    if (isNaN(num) || !isFinite(num)) {
      const issue: ValidationIssue = {
        level: errorLevel,
        message: `"${numStr}" is not a valid number in "${value}".`,
        validatorName: this.name,
        rowIndex: context.rowIndex,
        columnName: context.columnDef.name,
        value,
      };
      return { valid: errorLevel === "warning", issues: [issue] };
    }

    if (this.params.allow_negative === false && num < 0) {
      const issue: ValidationIssue = {
        level: errorLevel,
        message: `Negative values are not allowed: "${value}".`,
        validatorName: this.name,
        rowIndex: context.rowIndex,
        columnName: context.columnDef.name,
        value,
      };
      return { valid: errorLevel === "warning", issues: [issue] };
    }

    if (!this.params.units.includes(unit)) {
      const issue: ValidationIssue = {
        level: errorLevel,
        message: `Unit "${unit}" is not in the allowed list: [${this.params.units.join(", ")}].`,
        validatorName: this.name,
        rowIndex: context.rowIndex,
        columnName: context.columnDef.name,
        value,
      };
      return { valid: errorLevel === "warning", issues: [issue] };
    }

    return { valid: true, issues: [] };
  }
}
