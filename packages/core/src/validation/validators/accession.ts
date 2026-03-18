import type { CellValidationResult, ValidationIssue } from "../../types/validation.js";
import type { CellValidator, CellValidationContext } from "./base.js";

export interface AccessionParams {
  prefix?: string;
  suffix?: string;
  // TODO: It's unclear which formats need to be supported at this point and how they should be validated. So, the
  // provided format will be read in, but it will not be checked by the validator itself.
  format?: string;
  error_level?: "error" | "warning";
}

const BIOSAMPLE_RE = /^SAM[DENA]\d+$/;

export class AccessionValidator implements CellValidator {
  readonly name = "accession";

  constructor(private readonly params: AccessionParams) {}

  async validate(value: string, context: CellValidationContext): Promise<CellValidationResult> {
    const errorLevel = this.params.error_level ?? "error";

    let valid = true;
    if (this.params.prefix !== undefined && !value.startsWith(this.params.prefix)) {
      valid = false;
    }
    if (this.params.suffix !== undefined && !value.endsWith(this.params.suffix)) {
      valid = false;
    }

    if (!valid) {
      const parts: string[] = [];
      if (this.params.prefix) parts.push(`start with "${this.params.prefix}"`);
      if (this.params.suffix) parts.push(`end with "${this.params.suffix}"`);
      const example = `${this.params.prefix ?? ""}XXXXXX${this.params.suffix ?? ""}`;
      const issue: ValidationIssue = {
        level: errorLevel,
        message: `"${value}" is not a valid accession. Values in this field must ${parts.join(" and ")} (e.g., ${example}).`,
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
