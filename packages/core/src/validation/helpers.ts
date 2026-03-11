import type { ColumnDefinition } from "../types/template.js";
import type { CellValidationResult, ValidationIssue } from "../types/validation.js";

/**
 * Check if a value is a special sentinel value and return the bypass result.
 *
 * Returns null if the value is not a special sentinel (normal flow continues).
 * Returns a CellValidationResult if the value IS a sentinel:
 *   - valid: true  → column allows it; all further validators are skipped.
 *   - valid: false → column does not allow it; an error is produced.
 */
export function checkSpecialValue(
  value: string,
  columnDef: ColumnDefinition
): CellValidationResult | null {
  const lower = value.toLowerCase().trim();

  let isAllowed: boolean;

  if (lower === "not applicable") {
    isAllowed = columnDef.allowNotApplicable;
  } else if (lower === "not available") {
    isAllowed = columnDef.allowNotAvailable;
  } else if (lower === "anonymized") {
    isAllowed = columnDef.allowAnonymized;
  } else if (lower === "pooled") {
    isAllowed = columnDef.allowPooled;
  } else {
    return null;
  }

  if (isAllowed) {
    return { valid: true, issues: [] };
  }

  const issue: ValidationIssue = {
    level: "error",
    message: `Value "${value}" is not permitted for column "${columnDef.name}".`,
    validatorName: "special_value",
    value,
  };

  return { valid: false, issues: [issue] };
}
