import type { ValidationIssue } from "../../types/validation.js";
import type { GlobalValidator } from "./base.js";
import type { SdrfFile } from "../../types/sdrf.js";
import type { SdrfTemplate } from "../../types/template.js";

const GROUP_NAMES = [
  "source name",
  "characteristics[...]",
  "material type",
  "protocol ref",
  "assay name",
  "technology type",
  "comment[...]",
  "factor value[...]",
];

export class ColumnOrderValidator implements GlobalValidator {
  readonly name = "column_order";

  async validate(file: SdrfFile, _template: SdrfTemplate): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    let maxGroupSeen = -1;

    for (const header of file.headers) {
      const group = this.getColumnGroup(header);
      if (group === undefined) continue;

      if (group < maxGroupSeen) {
        issues.push({
          level: "error",
          message:
            `Column "${header}" (group: ${GROUP_NAMES[group]}) appears after a column from a later group. ` +
            `Expected group order: ${GROUP_NAMES.join(" → ")}.`,
          validatorName: this.name,
        });
      } else {
        maxGroupSeen = group;
      }
    }

    return issues;
  }

  private getColumnGroup(header: string): number | undefined {
    const h = header.trim().toLowerCase();
    if (h === "source name") return 0;
    if (/^characteristics\[.+\]$/i.test(h)) return 1;
    if (h === "material type") return 2;
    if (h === "protocol ref") return 3;
    if (h === "assay name") return 4;
    if (h === "technology type") return 5;
    if (/^comment\[.+\]$/i.test(h)) return 6;
    if (/^factor value\[.+\]$/i.test(h)) return 7;
    return undefined;
  }
}
