import type { ValidationIssue } from "../../types/validation.js";
import type { GlobalValidator } from "./base.js";
import type { SdrfFile } from "../../types/sdrf.js";
import type { SdrfTemplate } from "../../types/template.js";

export class EmptyCellsValidator implements GlobalValidator {
  readonly name = "empty_cells";

  async validate(file: SdrfFile, template: SdrfTemplate): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    const requiredColumns = template.columns
      .filter(c => c.requirement === "required")
      .map(c => c.name);

    for (const row of file.rows) {
      for (const columnName of requiredColumns) {
        const value = (row.cells[columnName] ?? [])[0];
        if (value === undefined || value.trim() === "") {
          issues.push({
            level: "error",
            message: `Required column "${columnName}" is empty.`,
            validatorName: this.name,
            rowIndex: row.index,
            columnName,
            value: value ?? "",
          });
        }
      }
    }

    return issues;
  }
}
