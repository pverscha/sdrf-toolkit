import type { CellValidationResult, ValidationIssue } from "../../types/validation.js";
import type { CellValidator, CellValidationContext } from "./base.js";

export interface SemverParams {
  prefix?: string;
  allow_prerelease?: boolean;
  error_level?: "error" | "warning";
}

const SEMVER_CORE_RE = /^\d+\.\d+\.\d+$/;
const SEMVER_PRE_RE = /^\d+\.\d+\.\d+-[a-zA-Z0-9.]+$/;

export class SemverValidator implements CellValidator {
  readonly name = "semver";

  constructor(private readonly params: SemverParams) {}

  async validate(value: string, context: CellValidationContext): Promise<CellValidationResult> {
    const errorLevel = this.params.error_level ?? "error";

    let v = value;
    if (this.params.prefix && v.startsWith(this.params.prefix)) {
      v = v.slice(this.params.prefix.length);
    }

    const isValid =
      SEMVER_CORE_RE.test(v) ||
      (this.params.allow_prerelease === true && SEMVER_PRE_RE.test(v));

    if (!isValid) {
      const prefixStr = this.params.prefix ?? "";
      const coreExample = `${prefixStr}1.2.3`;
      let hint = `must follow the format MAJOR.MINOR.PATCH (e.g., ${coreExample})`;
      if (this.params.allow_prerelease) {
        hint += ` or include a pre-release label (e.g., ${prefixStr}1.2.3-alpha)`;
      }
      const issue: ValidationIssue = {
        level: errorLevel,
        message: `"${value}" is not a valid version number — ${hint}.`,
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
