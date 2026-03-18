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

interface ParsedOntologyValue {
  /** Uppercase key → original-case value (e.g. "NT" → "homo sapiens", "AC" → "NCBITaxon:9606") */
  fields: Map<string, string>;
  /** true when the raw value contained no "=" (plain label or accession) */
  isPlain: boolean;
}

/**
 * Mirrors Python's `ontology_term_parser`: split on ";" to obtain key=value
 * pairs, then split each pair on the first "=" only.
 *
 * Plain values (no "=") are stored under the "NT" key so callers can treat
 * them uniformly.
 */
function parseStructuredValue(value: string): ParsedOntologyValue {
  const fields = new Map<string, string>();
  const segments = value.split(";");

  if (segments.length === 1 && !segments[0].includes("=")) {
    // Plain label ("homo sapiens") or plain accession ("NCBITaxon:9606")
    fields.set("NT", segments[0].trim());
    return { fields, isPlain: true };
  }

  for (const seg of segments) {
    const eqIdx = seg.indexOf("=");
    if (eqIdx === -1) continue;
    const key = seg.slice(0, eqIdx).trim().toUpperCase();
    const val = seg.slice(eqIdx + 1).trim(); // preserve original case for AC lookups
    fields.set(key, val);
  }
  return { fields, isPlain: false };
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

    // Parse structured SDRF format (e.g. "NT=homo sapiens;AC=NCBITaxon:9606")
    // or plain values ("homo sapiens", "NCBITaxon:9606").
    const { fields, isPlain } = parseStructuredValue(value);
    const ntValue = fields.get("NT"); // label — resolveIndex normalizes to lowercase
    const acValue = fields.get("AC"); // accession — case-sensitive

    // Resolve: NT label first (matches Python behaviour), AC as fallback
    let match = ntValue ? this.ontologyRegistry.resolve(ntValue, ontologies) : null;
    if (!match && acValue) {
      match = this.ontologyRegistry.resolve(acValue, ontologies);
    }

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
