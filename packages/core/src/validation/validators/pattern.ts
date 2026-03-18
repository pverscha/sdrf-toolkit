import type { CellValidationResult, ValidationIssue } from "../../types/validation.js";
import type { CellValidator, CellValidationContext } from "./base.js";

export interface PatternParams {
  pattern: string;
  case_sensitive?: boolean;
  error_level?: "error" | "warning";
  description?: string;
  examples?: string[];
}

export class PatternValidator implements CellValidator {
  readonly name = "pattern";

  constructor(private readonly params: PatternParams) {}

  async validate(value: string, context: CellValidationContext): Promise<CellValidationResult> {
    const flags = this.params.case_sensitive === false ? "i" : "";
    const regex = new RegExp(this.params.pattern, flags);
    const errorLevel = this.params.error_level ?? "error";

    if (!regex.test(value)) {
      const issue: ValidationIssue = {
        level: errorLevel,
        message: `"${value}" does not match the required format for this field.`,
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
