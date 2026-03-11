import type { CellValidationResult, ValidationIssue } from "../../types/validation.js";
import type { CellValidator, CellValidationContext } from "./base.js";

export interface SingleCardinalityParams {
  error_level?: "error" | "warning";
}

export class SingleCardinalityValidator implements CellValidator {
  readonly name = "single_cardinality_validator";

  constructor(private readonly params: SingleCardinalityParams) {}

  async validate(value: string, context: CellValidationContext): Promise<CellValidationResult> {
    const errorLevel = this.params.error_level ?? "error";

    if (value.includes(";")) {
      const issue: ValidationIssue = {
        level: errorLevel,
        message: `Value must not contain multiple entries (semicolons).`,
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
