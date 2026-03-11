import type { CellValidationResult, ValidationIssue } from "../../types/validation.js";
import type { CellValidator, CellValidationContext } from "./base.js";

export interface MzValueParams {
  error_level?: "error" | "warning";
}

export class MzValueValidator implements CellValidator {
  readonly name = "mz_value";

  constructor(private readonly params: MzValueParams) {}

  async validate(value: string, context: CellValidationContext): Promise<CellValidationResult> {
    const errorLevel = this.params.error_level ?? "error";

    const num = parseFloat(value);
    if (isNaN(num) || !isFinite(num) || num <= 0) {
      const issue: ValidationIssue = {
        level: errorLevel,
        message: `"${value}" is not a valid m/z value (must be a positive finite number).`,
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
