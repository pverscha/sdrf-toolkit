import type { CellValidationResult, ValidationIssue } from "../../types/validation.js";
import type { CellValidator, CellValidationContext } from "./base.js";

export interface ValuesParams {
  values: string[];
  error_level?: "error" | "warning";
  case_sensitive?: boolean;
  description?: string;
  examples?: string[];
}

export class ValuesValidator implements CellValidator {
  readonly name = "values";

  constructor(private readonly params: ValuesParams) {}

  async validate(value: string, context: CellValidationContext): Promise<CellValidationResult> {
    const errorLevel = this.params.error_level ?? "error";
    const caseSensitive = this.params.case_sensitive ?? false;

    const normalize = (v: string) => (caseSensitive ? v.trim() : v.trim().toLowerCase());
    const normalizedValue = normalize(value);
    const allowed = (this.params.values ?? []).map(normalize);

    if (!allowed.includes(normalizedValue)) {
      const issue: ValidationIssue = {
        level: errorLevel,
        message: `"${value}" is not one of the allowed values: ${(this.params.values ?? []).join(", ")}.`,
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
