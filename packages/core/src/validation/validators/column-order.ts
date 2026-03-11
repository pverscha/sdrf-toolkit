import type { ValidationIssue } from "../../types/validation.js";
import type { GlobalValidator } from "./base.js";
import type { SdrfFile } from "../../types/sdrf.js";
import type { SdrfTemplate } from "../../types/template.js";

const CUSTOM_COLUMN_PATTERN = /^(comment|characteristics|factor value)\[.+\]$/i;

export class ColumnOrderValidator implements GlobalValidator {
  readonly name = "column_order";

  async validate(file: SdrfFile, template: SdrfTemplate): Promise<ValidationIssue[]> {
    const expectedOrder = template.columns.map(c => c.name);

    // Filter file headers to only those that are defined in the template
    // (custom bracket-syntax columns may appear anywhere)
    const definedFileHeaders = file.headers.filter(h => expectedOrder.includes(h));

    // Check that the relative order of defined headers matches the template order
    const expectedFiltered = expectedOrder.filter(name => definedFileHeaders.includes(name));

    if (JSON.stringify(definedFileHeaders) !== JSON.stringify(expectedFiltered)) {
      return [
        {
          level: "error",
          message:
            `Column order does not match the template. ` +
            `Expected order (for defined columns): ${expectedFiltered.join(", ")}. ` +
            `Found: ${definedFileHeaders.join(", ")}.`,
          validatorName: this.name,
        },
      ];
    }

    return [];
  }
}
