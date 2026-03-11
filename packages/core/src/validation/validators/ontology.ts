import type { OntologyRegistry } from "@sdrf-toolkit/ontology-lookup";
import type { CellValidationResult, ValidationIssue } from "../../types/validation.js";
import type { CellValidator, CellValidationContext } from "./base.js";

export interface OntologyParams {
  ontologies: string[];
  parent_term?: string;
  error_level?: "error" | "warning";
  description?: string;
  examples?: string[];
}

export class OntologyValidator implements CellValidator {
  readonly name = "ontology";

  constructor(
    private readonly ontologyRegistry: OntologyRegistry,
    private readonly params: OntologyParams
  ) {}

  async validate(value: string, context: CellValidationContext): Promise<CellValidationResult> {
    const ontologies = this.params.ontologies ?? [];
    const errorLevel = this.params.error_level ?? "error";

    const match = this.ontologyRegistry.resolve(value, ontologies);

    if (!match) {
      const issue: ValidationIssue = {
        level: errorLevel,
        message: `"${value}" was not found in ontolog${ontologies.length === 1 ? "y" : "ies"}: ${ontologies.join(", ")}.`,
        validatorName: this.name,
        rowIndex: context.rowIndex,
        columnName: context.columnDef.name,
        value,
      };
      return { valid: errorLevel === "warning", issues: [issue] };
    }

    if (this.params.parent_term) {
      const isDesc = this.ontologyRegistry.isDescendantOf(
        match.accession,
        this.params.parent_term,
        match.ontology
      );

      if (!isDesc) {
        const issue: ValidationIssue = {
          level: errorLevel,
          message: `"${value}" (${match.accession}) is not a descendant of ${this.params.parent_term} in ontology "${match.ontology}".`,
          validatorName: this.name,
          rowIndex: context.rowIndex,
          columnName: context.columnDef.name,
          value,
        };
        return { valid: errorLevel === "warning", issues: [issue] };
      }
    }

    return { valid: true, issues: [] };
  }
}
