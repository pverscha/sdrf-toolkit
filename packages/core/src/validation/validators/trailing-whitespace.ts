import type { ValidationIssue } from "../../types/validation.js";
import type { GlobalValidator } from "./base.js";
import type { SdrfFile } from "../../types/sdrf.js";
import type { SdrfTemplate } from "../../types/template.js";

export class TrailingWhitespaceValidator implements GlobalValidator {
  readonly name = "trailing_whitespace_validator";

  async validate(file: SdrfFile, _template: SdrfTemplate): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    // Check column names for trailing whitespace (matches official sdrf-pipelines behaviour)
    for (const header of file.headers) {
      if (header !== header.trimEnd()) {
        issues.push({
          level: "error",
          message: `Column name "${header}" has trailing whitespace.`,
          validatorName: this.name,
          columnName: header,
        });
      }
    }

    // Check cell values for trailing whitespace
    for (const row of file.rows) {
      for (const [columnName, values] of Object.entries(row.cells)) {
        for (const value of values) {
          if (value !== value.trimEnd()) {
            issues.push({
              level: "error",
              message: `Cell in column "${columnName}" has trailing whitespace.`,
              validatorName: this.name,
              rowIndex: row.index,
              columnName,
              value,
            });
          }
        }
      }
    }

    return issues;
  }
}
