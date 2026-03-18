import { load as yamlLoad } from "js-yaml";
import type {
  RawSdrfTemplate,
  RawColumnDefinition,
  RawCellValidator,
  RawGlobalValidator,
  RawRequirement,
  RawExcludes,
} from "../types/template.js";

/**
 * Parse a raw YAML string into a RawSdrfTemplate.
 * Throws if the YAML is invalid or required fields are missing.
 */
export function parseTemplate(yaml: string): RawSdrfTemplate {
  const raw = yamlLoad(yaml) as Record<string, unknown>;

  if (!raw || typeof raw !== "object") {
    throw new Error("Template YAML must be a mapping at the top level.");
  }

  if (typeof raw["name"] !== "string" || !raw["name"]) {
    throw new Error('Template YAML must have a string "name" field.');
  }

  const columns = parseColumns(raw["columns"]);
  if (columns.length === 0) {
    throw new Error('Template YAML must define at least one column.');
  }

  const extendsParsed = parseExtends(raw["extends"]);

  return {
    name: raw["name"] as string,
    description: (raw["description"] as string) ?? "",
    version: (raw["version"] as string) ?? "0.0.0",
    extends: raw["extends"] as string | undefined,
    ...extendsParsed,
    usable_alone: (raw["usable_alone"] as boolean) ?? true,
    layer: raw["layer"] as string | undefined,
    mutually_exclusive_with: (raw["mutually_exclusive_with"] as string[]) ?? [],
    requires: parseRequires(raw["requires"]),
    excludes: parseExcludes(raw["excludes"]),
    validators: parseGlobalValidators(raw["validators"]),
    columns,
  };
}

function parseExtends(raw: unknown): { extendsName?: string; extendsConstraint?: string } {
  if (typeof raw !== "string" || !raw) return {};
  const atIdx = raw.indexOf("@");
  if (atIdx === -1) {
    return { extendsName: raw };
  }
  return {
    extendsName: raw.slice(0, atIdx),
    extendsConstraint: raw.slice(atIdx + 1),
  };
}

function parseGlobalValidators(raw: unknown): RawGlobalValidator[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v: unknown) => {
    const validator = v as Record<string, unknown>;
    return {
      validator_name: (validator["validator_name"] as string) ?? "",
      params: (validator["params"] as Record<string, unknown>) ?? {},
    };
  });
}

function parseColumns(raw: unknown): RawColumnDefinition[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c: unknown) => {
    const col = c as Record<string, unknown>;
    return {
      name: (col["name"] as string) ?? "",
      description: col["description"] as string | undefined,
      requirement: col["requirement"] as "required" | "recommended" | "optional" | undefined,
      cardinality: col["cardinality"] as "single" | "multiple" | undefined,
      type: col["type"] as "integer" | "string" | "float" | undefined,
      allow_not_applicable: col["allow_not_applicable"] as boolean | undefined,
      allow_not_available: col["allow_not_available"] as boolean | undefined,
      allow_anonymized: col["allow_anonymized"] as boolean | undefined,
      allow_pooled: col["allow_pooled"] as boolean | undefined,
      allow_norm: col["allow_norm"] as boolean | undefined,
      validators: parseCellValidators(col["validators"]),
    };
  });
}

function parseCellValidators(raw: unknown): RawCellValidator[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v: unknown) => {
    const validator = v as Record<string, unknown>;
    return {
      validator_name: (validator["validator_name"] as string) ?? "",
      params: (validator["params"] as Record<string, unknown>) ?? {},
    };
  });
}

function parseRequires(raw: unknown): RawRequirement[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (r): r is Record<string, unknown> =>
        typeof r === "object" && r !== null && "layer" in r
    )
    .map(r => ({ layer: r["layer"] as "sample" | "technology" | "experiment" }));
}

function parseExcludes(raw: unknown): RawExcludes | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const ex = raw as Record<string, unknown>;
  return {
    templates: ex["templates"] as string[] | undefined,
    categories: ex["categories"] as
      | ("characteristics" | "comment" | "factor value")[]
      | undefined,
    columns: ex["columns"] as string[] | undefined,
  };
}
