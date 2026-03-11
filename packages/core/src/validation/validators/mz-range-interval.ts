import type { CellValidationResult, ValidationIssue } from "../../types/validation.js";
import type { CellValidator, CellValidationContext } from "./base.js";

export interface MzRangeIntervalParams {
  error_level?: "error" | "warning";
}

export class MzRangeIntervalValidator implements CellValidator {
  readonly name = "mz_range_interval";

  constructor(private readonly params: MzRangeIntervalParams) {}

  async validate(value: string, context: CellValidationContext): Promise<CellValidationResult> {
    const errorLevel = this.params.error_level ?? "error";

    const dashIdx = value.indexOf("-");
    if (dashIdx === -1) {
      const issue: ValidationIssue = {
        level: errorLevel,
        message: `"${value}" is not a valid m/z range (expected "lower-upper", e.g. "100-2000").`,
        validatorName: this.name,
        rowIndex: context.rowIndex,
        columnName: context.columnDef.name,
        value,
      };
      return { valid: errorLevel === "warning", issues: [issue] };
    }

    const lowerStr = value.slice(0, dashIdx);
    const upperStr = value.slice(dashIdx + 1);
    const lower = parseFloat(lowerStr);
    const upper = parseFloat(upperStr);

    if (isNaN(lower) || !isFinite(lower) || lower <= 0 ||
        isNaN(upper) || !isFinite(upper) || upper <= 0) {
      const issue: ValidationIssue = {
        level: errorLevel,
        message: `"${value}" contains non-positive values; m/z must be > 0.`,
        validatorName: this.name,
        rowIndex: context.rowIndex,
        columnName: context.columnDef.name,
        value,
      };
      return { valid: errorLevel === "warning", issues: [issue] };
    }

    if (lower >= upper) {
      const issue: ValidationIssue = {
        level: errorLevel,
        message: `"${value}" has lower bound ${lower} >= upper bound ${upper}.`,
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
