import type { ValidationIssue } from "../../types/validation.js";
import type { GlobalValidator } from "./base.js";
import type { SdrfFile } from "../../types/sdrf.js";
import type { SdrfTemplate } from "../../types/template.js";

export class TrailingWhitespaceValidator implements GlobalValidator {
  readonly name = "trailing_whitespace_validator";

  async validate(file: SdrfFile, _template: SdrfTemplate): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    for (const row of file.rows) {
      for (const [columnName, value] of Object.entries(row.cells)) {
        if (value !== value.trim()) {
          issues.push({
            level: "warning",
            message: `Cell in column "${columnName}" at row ${row.index} has leading or trailing whitespace.`,
            validatorName: this.name,
            rowIndex: row.index,
            columnName,
            value,
          });
        }
      }
    }

    return issues;
  }
}
