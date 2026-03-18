import type { CellValidationResult, ValidationIssue } from "../../types/validation.js";
import type { CellValidator, CellValidationContext } from "./base.js";

export interface StructuredKvField {
  key: string;
  value: string; // regex pattern
}

export interface StructuredKvParams {
  separator: string;
  fields: StructuredKvField[];
  error_level?: "error" | "warning";
}

export class StructuredKvValidator implements CellValidator {
  readonly name = "structured_kv";

  constructor(private readonly params: StructuredKvParams) {}

  async validate(value: string, context: CellValidationContext): Promise<CellValidationResult> {
    const errorLevel = this.params.error_level ?? "error";

    const segments = value.split(this.params.separator);
    const segmentMap = new Map<string, string>();
    for (const seg of segments) {
      const eqIdx = seg.indexOf("=");
      if (eqIdx === -1) continue;
      const k = seg.slice(0, eqIdx);
      const v = seg.slice(eqIdx + 1);
      segmentMap.set(k, v);
    }

    const issues: ValidationIssue[] = [];
    for (const field of this.params.fields) {
      const segValue = segmentMap.get(field.key);
      if (segValue === undefined) {
        issues.push({
          level: errorLevel,
          message: `Required field "${field.key}" not found in structured value "${value}".`,
          validatorName: this.name,
          rowIndex: context.rowIndex,
          columnName: context.columnDef.name,
          value,
        });
        continue;
      }
      const re = new RegExp(field.value);
      if (!re.test(segValue)) {
        issues.push({
          level: errorLevel,
          message: `The "${field.key}" field has an invalid value: "${segValue}".`,
          validatorName: this.name,
          rowIndex: context.rowIndex,
          columnName: context.columnDef.name,
          value,
        });
      }
    }

    if (issues.length > 0) {
      return { valid: errorLevel === "warning", issues };
    }

    return { valid: true, issues: [] };
  }
}
