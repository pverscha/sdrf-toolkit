import type { ValidationIssue } from "../../types/validation.js";
import type { GlobalValidator } from "./base.js";
import type { SdrfFile } from "../../types/sdrf.js";
import type { SdrfTemplate } from "../../types/template.js";

export interface MinColumnsParams {
  min_columns: number;
}

export class MinColumnsValidator implements GlobalValidator {
  readonly name = "min_columns";

  constructor(private readonly params: MinColumnsParams) {}

  async validate(file: SdrfFile, _template: SdrfTemplate): Promise<ValidationIssue[]> {
    if (file.headers.length < this.params.min_columns) {
      return [
        {
          level: "error",
          message: `File has ${file.headers.length} column(s) but at least ${this.params.min_columns} are required.`,
          validatorName: this.name,
        },
      ];
    }
    return [];
  }
}
