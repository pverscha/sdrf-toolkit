import type { CellValidationResult, ValidationIssue } from "../../types/validation.js";
import type { CellValidator, CellValidationContext } from "./base.js";

export interface DateParams {
  format?: "iso8601";
  precision?: ("year" | "month" | "day")[];
  error_level?: "error" | "warning";
}

const YEAR_RE = /^\d{4}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export class DateValidator implements CellValidator {
  readonly name = "date";

  constructor(private readonly params: DateParams) {}

  async validate(value: string, context: CellValidationContext): Promise<CellValidationResult> {
    const errorLevel = this.params.error_level ?? "error";
    const precision = this.params.precision ?? ["year", "month", "day"];

    let matched = false;
    if (precision.includes("year") && YEAR_RE.test(value)) matched = true;
    if (precision.includes("month") && MONTH_RE.test(value)) matched = true;
    if (precision.includes("day") && DAY_RE.test(value)) matched = true;

    if (!matched) {
      const issue: ValidationIssue = {
        level: errorLevel,
        message: `"${value}" is not a valid date (accepted precision: ${precision.join(", ")}).`,
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
