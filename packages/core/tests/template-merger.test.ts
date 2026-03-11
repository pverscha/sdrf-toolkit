import { describe, it, expect } from "vitest";
import { mergeTemplates } from "../src/templates/merger.js";
import type { RawSdrfTemplate } from "../src/types/template.js";

const base: RawSdrfTemplate = {
  name: "base",
  description: "Base template",
  version: "1.0.0",
  usable_alone: false,
  validators: [
    { validator_name: "trailing_whitespace_validator", params: {} },
    { validator_name: "empty_cells", params: {} },
  ],
  columns: [
    {
      name: "source name",
      description: "Sample ID",
      requirement: "required",
      cardinality: "single",
      allow_not_applicable: false,
      allow_not_available: false,
      validators: [],
    },
    {
      name: "assay name",
      description: "Assay ID",
      requirement: "required",
      cardinality: "single",
      allow_not_applicable: false,
      allow_not_available: false,
      validators: [],
    },
  ],
};

const human: RawSdrfTemplate = {
  name: "human",
  description: "Human template",
  version: "1.0.0",
  extends: "base",
  usable_alone: false,
  layer: "sample",
  mutually_exclusive_with: ["vertebrates"],
  validators: [],
  columns: [
    {
      name: "characteristics[disease]",
      description: "Disease",
      requirement: "required",
      cardinality: "multiple",
      allow_not_applicable: true,
      allow_not_available: true,
      validators: [
        {
          validator_name: "ontology",
          params: { ontologies: ["mondo"], error_level: "warning" },
        },
      ],
    },
  ],
};

const msProteomics: RawSdrfTemplate = {
  name: "ms-proteomics",
  description: "MS proteomics template",
  version: "1.0.0",
  extends: "base",
  usable_alone: false,
  layer: "experiment",
  validators: [
    { validator_name: "trailing_whitespace_validator", params: {} }, // duplicate — should be deduped
  ],
  columns: [
    {
      name: "comment[instrument]",
      description: "Instrument",
      requirement: "required",
      cardinality: "single",
      allow_not_applicable: false,
      allow_not_available: false,
      validators: [],
    },
    // Override "assay name" to change description
    {
      name: "assay name",
      description: "Assay ID (overridden by MS proteomics)",
      requirement: "required",
      cardinality: "single",
      allow_not_applicable: false,
      allow_not_available: false,
      validators: [],
    },
  ],
};

describe("mergeTemplates", () => {
  it("merges a single template into itself", () => {
    const result = mergeTemplates([base]);
    expect(result.composedFrom).toEqual(["base"]);
    expect(result.columns).toHaveLength(2);
    expect(result.globalValidators).toHaveLength(2);
  });

  it("merges base + human in order, appending human columns", () => {
    const result = mergeTemplates([base, human]);
    expect(result.composedFrom).toEqual(["base", "human"]);
    expect(result.columns.map(c => c.name)).toEqual([
      "source name",
      "assay name",
      "characteristics[disease]",
    ]);
  });

  it("sets sourceTemplate correctly", () => {
    const result = mergeTemplates([base, human]);
    const diseaseCol = result.columns.find(c => c.name === "characteristics[disease]")!;
    expect(diseaseCol.sourceTemplate).toBe("human");
  });

  it("later template overrides column definition", () => {
    const result = mergeTemplates([base, msProteomics]);
    const assayCol = result.columns.find(c => c.name === "assay name")!;
    expect(assayCol.description).toBe("Assay ID (overridden by MS proteomics)");
    expect(assayCol.sourceTemplate).toBe("ms-proteomics");
  });

  it("column position is preserved at first occurrence", () => {
    const result = mergeTemplates([base, msProteomics]);
    const names = result.columns.map(c => c.name);
    // "assay name" appears in base (index 1) — its position is preserved
    expect(names.indexOf("assay name")).toBe(1);
    // "comment[instrument]" is added by ms-proteomics
    expect(names.indexOf("comment[instrument]")).toBe(2);
  });

  it("deduplicates global validators by name", () => {
    const result = mergeTemplates([base, msProteomics]);
    const names = result.globalValidators.map(v => v.validatorName);
    expect(names.filter(n => n === "trailing_whitespace_validator")).toHaveLength(1);
  });

  it("unions mutually_exclusive_with across templates", () => {
    const result = mergeTemplates([base, human]);
    expect(result.mutually_exclusive_with).toContain("vertebrates");
  });

  it("resolves column defaults (requirement, cardinality, etc.)", () => {
    const minimal: RawSdrfTemplate = {
      name: "minimal",
      description: "",
      version: "1.0.0",
      usable_alone: false,
      columns: [{ name: "my col", validators: [] }],
    };
    const result = mergeTemplates([minimal]);
    const col = result.columns[0];
    expect(col.requirement).toBe("optional");
    expect(col.cardinality).toBe("single");
    expect(col.allowNotApplicable).toBe(false);
    expect(col.allowAnonymized).toBe(false);
  });

  it("throws on empty template list", () => {
    expect(() => mergeTemplates([])).toThrow();
  });

  it("passes through type field on columns", () => {
    const typed: RawSdrfTemplate = {
      name: "typed",
      description: "",
      version: "1.0.0",
      usable_alone: false,
      columns: [{ name: "count", type: "integer", validators: [] }],
    };
    const result = mergeTemplates([typed]);
    expect(result.columns[0].type).toBe("integer");
  });

  // ---------------------------------------------------------------------------
  // excludes logic
  // ---------------------------------------------------------------------------

  it("excludes.templates removes columns from specified source template", () => {
    const child: RawSdrfTemplate = {
      name: "child",
      description: "",
      version: "1.0.0",
      usable_alone: false,
      excludes: { templates: ["base"] },
      columns: [{ name: "child col", validators: [] }],
    };
    const result = mergeTemplates([base, child]);
    const names = result.columns.map(c => c.name);
    // base columns should be removed
    expect(names).not.toContain("source name");
    expect(names).not.toContain("assay name");
    // child's own column is kept
    expect(names).toContain("child col");
  });

  it("excludes.categories removes columns matching category prefix", () => {
    const child: RawSdrfTemplate = {
      name: "child",
      description: "",
      version: "1.0.0",
      usable_alone: false,
      excludes: { categories: ["characteristics"] },
      columns: [{ name: "my col", validators: [] }],
    };
    const result = mergeTemplates([base, human, child]);
    const names = result.columns.map(c => c.name);
    // characteristics[disease] came from human — should be removed
    expect(names).not.toContain("characteristics[disease]");
    // non-characteristics columns from base are kept
    expect(names).toContain("source name");
    expect(names).toContain("assay name");
  });

  it("excludes.columns removes specific named columns", () => {
    const child: RawSdrfTemplate = {
      name: "child",
      description: "",
      version: "1.0.0",
      usable_alone: false,
      excludes: { columns: ["assay name"] },
      columns: [{ name: "my col", validators: [] }],
    };
    const result = mergeTemplates([base, child]);
    const names = result.columns.map(c => c.name);
    expect(names).not.toContain("assay name");
    expect(names).toContain("source name");
  });

  it("excludes never removes a template's own columns", () => {
    const self: RawSdrfTemplate = {
      name: "self",
      description: "",
      version: "1.0.0",
      usable_alone: false,
      excludes: { templates: ["self"] }, // tries to exclude its own columns — should be a no-op
      columns: [{ name: "own col", validators: [] }],
    };
    const result = mergeTemplates([self]);
    expect(result.columns.map(c => c.name)).toContain("own col");
  });
});
