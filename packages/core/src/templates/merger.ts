import type {
  RawSdrfTemplate,
  RawColumnDefinition,
  SdrfTemplate,
  ColumnDefinition,
  GlobalValidatorDefinition,
  CellValidatorDefinition,
} from "../types/template.js";

/**
 * Given a linearized list of RawSdrfTemplates (in dependency order, from most
 * base to most specific), produce a single merged SdrfTemplate.
 *
 * Column merge rule: if a column name appears in multiple templates, the later
 * (more specific) definition overrides the earlier one, but the position in the
 * final list is that of the first occurrence.
 *
 * Global validator merge rule: concatenate, deduplicating by validator_name.
 *
 * Excludes rule: after collecting all columns, each template's `excludes`
 * definition can remove columns introduced by other templates.
 */
export function mergeTemplates(linearized: RawSdrfTemplate[]): SdrfTemplate {
  if (linearized.length === 0) {
    throw new Error("Cannot merge an empty template list.");
  }

  const composedFrom = linearized.map(t => t.name);

  // Build a map of column name → resolved definition (last writer wins)
  const columnByName = new Map<string, ColumnDefinition>();
  // Track insertion order using the first occurrence of each column name
  const columnOrder: string[] = [];

  for (const template of linearized) {
    for (const rawCol of template.columns ?? []) {
      const colDef = resolveColumn(rawCol, template.name);

      if (!columnByName.has(rawCol.name)) {
        columnOrder.push(rawCol.name);
      }
      // Later template overrides, preserving sourceTemplate of the overriding template
      columnByName.set(rawCol.name, colDef);
    }
  }

  // Apply excludes rules: each template can remove columns from other templates
  for (const template of linearized) {
    const ex = template.excludes;
    if (!ex) continue;
    for (const colName of [...columnOrder]) {
      const col = columnByName.get(colName);
      if (!col) continue;
      // Never exclude a template's own columns
      if (col.sourceTemplate === template.name) continue;
      const excluded =
        (ex.templates?.includes(col.sourceTemplate)) ||
        (ex.categories?.some(cat => colName.toLowerCase().startsWith(cat + "["))) ||
        (ex.columns?.includes(colName));
      if (excluded) {
        columnByName.delete(colName);
        columnOrder.splice(columnOrder.indexOf(colName), 1);
      }
    }
  }

  const columns = columnOrder.map(name => columnByName.get(name)!);

  // Merge global validators — deduplicate by validator_name
  const globalValidatorNames = new Set<string>();
  const globalValidators: GlobalValidatorDefinition[] = [];

  for (const template of linearized) {
    for (const v of template.validators ?? []) {
      if (!globalValidatorNames.has(v.validator_name)) {
        globalValidatorNames.add(v.validator_name);
        globalValidators.push({
          validatorName: v.validator_name,
          params: v.params,
        });
      }
    }
  }

  // Merge mutually_exclusive_with — union of all
  const exclusionSet = new Set<string>();
  for (const template of linearized) {
    for (const name of template.mutually_exclusive_with ?? []) {
      exclusionSet.add(name);
    }
  }

  // Final metadata comes from the last (most specific) template
  const last = linearized[linearized.length - 1];

  return {
    composedFrom,
    name: last.name,
    description: last.description,
    version: last.version,
    usable_alone: last.usable_alone,
    layer: last.layer,
    mutually_exclusive_with: Array.from(exclusionSet),
    columns,
    globalValidators,
  };
}

function resolveColumn(raw: RawColumnDefinition, sourceTemplate: string): ColumnDefinition {
  const cellValidators: CellValidatorDefinition[] = (raw.validators ?? []).map(v => {
    const params = { ...v.params };
    // Extract description and examples from params if present (they may live there per YAML spec)
    const description = params["description"] as string | undefined;
    const examples = params["examples"] as string[] | undefined;

    return {
      validatorName: v.validator_name,
      params,
      description,
      examples,
    };
  });

  return {
    name: raw.name,
    description: raw.description ?? "",
    requirement: raw.requirement ?? "optional",
    cardinality: raw.cardinality ?? "single",
    type: raw.type,
    allowNotApplicable: raw.allow_not_applicable ?? false,
    allowNotAvailable: raw.allow_not_available ?? false,
    allowAnonymized: raw.allow_anonymized ?? false,
    allowPooled: raw.allow_pooled ?? false,
    validators: cellValidators,
    sourceTemplate,
  };
}
