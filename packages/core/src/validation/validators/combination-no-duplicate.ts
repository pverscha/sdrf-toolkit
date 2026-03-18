import type { ValidationIssue } from "../../types/validation.js";
import type { GlobalValidator } from "./base.js";
import type { SdrfFile } from "../../types/sdrf.js";
import type { SdrfTemplate } from "../../types/template.js";

export interface CombinationNoDuplicateParams {
  column_name?: string[];
  column_name_warning?: string[];
}

export class CombinationNoDuplicateValidator implements GlobalValidator {
  readonly name = "combination_of_columns_no_duplicate_validator";

  constructor(private readonly params: CombinationNoDuplicateParams) {}

  async validate(file: SdrfFile, _template: SdrfTemplate): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    issues.push(...this.checkDuplicates(file, this.params.column_name ?? [], "error"));
    issues.push(...this.checkDuplicates(file, this.params.column_name_warning ?? [], "warning"));

    return issues;
  }

  private checkDuplicates(
    file: SdrfFile,
    columns: string[],
    level: "error" | "warning"
  ): ValidationIssue[] {
    if (columns.length === 0) return [];

    const seen = new Map<string, number>(); // key → first row index
    const issues: ValidationIssue[] = [];

    for (const row of file.rows) {
      const key = columns.map(col => (row.cells[col] ?? [])[0] ?? "").join("|");

      if (seen.has(key)) {
        issues.push({
          level,
          message:
            `Duplicate combination of [${columns.join(", ")}] found at row ${row.index} ` +
            `(first occurrence at row ${seen.get(key)}).`,
          validatorName: this.name,
          rowIndex: row.index,
          value: key,
        });
      } else {
        seen.set(key, row.index);
      }
    }

    return issues;
  }
}
