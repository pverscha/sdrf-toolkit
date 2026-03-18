import type { CellValidationResult, ValidationIssue } from "../../types/validation.js";
import type { CellValidator, CellValidationContext } from "./base.js";

export interface IdentifierParams {
  charset?: string;
  special_values?: string[];
  error_level?: "error" | "warning";
}

export class IdentifierValidator implements CellValidator {
  readonly name = "identifier";

  constructor(private readonly params: IdentifierParams) {}

  async validate(value: string, context: CellValidationContext): Promise<CellValidationResult> {
    const errorLevel = this.params.error_level ?? "error";

    if (this.params.special_values?.includes(value)) {
      return { valid: true, issues: [] };
    }

    if (this.params.charset !== undefined) {
      const charsetRe = new RegExp(`^(${this.params.charset})+$`);
      if (!charsetRe.test(value)) {
        const issue: ValidationIssue = {
          level: errorLevel,
          message: `"${value}" contains invalid characters for this field.`,
          validatorName: this.name,
          rowIndex: context.rowIndex,
          columnName: context.columnDef.name,
          value,
        };
        return { valid: errorLevel === "warning", issues: [issue] };
      }
    }

    return { valid: true, issues: [] };
  }
}
