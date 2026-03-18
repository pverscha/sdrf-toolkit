import { describe, it, expect } from "vitest";
import { ValidationEngine } from "../src/validation/engine.js";
import type { ColumnDefinition, SdrfTemplate } from "../src/types/template.js";
import type { SdrfFile } from "../src/types/sdrf.js";

// Minimal stub OntologyRegistry that always returns null (no matches)
const noOpOntologyRegistry: any = {
  resolve: () => null,
  isDescendantOf: () => false,
};

function makeColDef(overrides: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return {
    name: "test col",
    description: "",
    requirement: "optional",
    cardinality: "single",
    allowNotApplicable: false,
    allowNotAvailable: false,
    allowAnonymized: false,
    allowPooled: false,
    allowNorm: false,
    validators: [],
    sourceTemplate: "base",
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<SdrfTemplate> = {}): SdrfTemplate {
  return {
    composedFrom: ["base"],
    name: "base",
    description: "",
    version: "1.0.0",
    usable_alone: false,
    mutually_exclusive_with: [],
    columns: [],
    globalValidators: [],
    ...overrides,
  };
}

describe("ValidationEngine — validateCell", () => {
  const engine = new ValidationEngine(noOpOntologyRegistry);

  it("passes a cell with no validators", async () => {
    const col = makeColDef();
    const result = await engine.validateCell("any value", col);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("accepts special value 'not applicable' when allowed", async () => {
    const col = makeColDef({ allowNotApplicable: true });
    const result = await engine.validateCell("not applicable", col);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("rejects special value 'not applicable' when not allowed", async () => {
    const col = makeColDef({ allowNotApplicable: false });
    const result = await engine.validateCell("not applicable", col);
    expect(result.valid).toBe(false);
    expect(result.issues[0].level).toBe("error");
  });

  it("validates a values-constrained column", async () => {
    const col = makeColDef({
      validators: [
        {
          validatorName: "values",
          params: { values: ["male", "female"], error_level: "error" },
        },
      ],
    });

    expect((await engine.validateCell("male", col)).valid).toBe(true);
    expect((await engine.validateCell("other", col)).valid).toBe(false);
  });

  it("validates a pattern-constrained column", async () => {
    const col = makeColDef({
      validators: [
        {
          validatorName: "pattern",
          params: { pattern: "^\\d+$" },
        },
      ],
    });

    expect((await engine.validateCell("42", col)).valid).toBe(true);
    expect((await engine.validateCell("abc", col)).valid).toBe(false);
  });

  it("validates a single complete value for cardinality:multiple columns", async () => {
    const col = makeColDef({
      cardinality: "multiple",
      validators: [
        {
          validatorName: "values",
          params: { values: ["HCD", "CID", "ETD"], error_level: "error" },
        },
      ],
    });

    // Each column occurrence is validated as one complete value
    expect((await engine.validateCell("HCD", col)).valid).toBe(true);
    expect((await engine.validateCell("ETD", col)).valid).toBe(true);
    expect((await engine.validateCell("INVALID", col)).valid).toBe(false);
  });
});

describe("ValidationEngine — validateFile", () => {
  const engine = new ValidationEngine(noOpOntologyRegistry);

  it("returns valid when no issues", async () => {
    const file: SdrfFile = {
      headers: ["source name"],
      rows: [{ index: 0, cells: { "source name": ["sample1"] } }],
    };
    const template = makeTemplate({
      columns: [
        makeColDef({ name: "source name", requirement: "required" }),
      ],
    });
    const result = await engine.validateFile(file, template);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("reports error for unrecognized non-bracket column header", async () => {
    const file: SdrfFile = {
      headers: ["source name", "INVALID HEADER"],
      rows: [{ index: 0, cells: { "source name": ["s1"], "INVALID HEADER": ["x"] } }],
    };
    const template = makeTemplate({
      columns: [makeColDef({ name: "source name" })],
    });
    const result = await engine.validateFile(file, template);
    const headerError = result.errors.find(e => e.columnName === "INVALID HEADER");
    expect(headerError).toBeDefined();
  });

  it("allows custom bracket-syntax columns without error", async () => {
    const file: SdrfFile = {
      headers: ["source name", "comment[extra]", "characteristics[custom]", "factor value[fx]"],
      rows: [
        {
          index: 0,
          cells: { "source name": ["s1"], "comment[extra]": ["x"], "characteristics[custom]": ["y"], "factor value[fx]": ["z"] },
        },
      ],
    };
    const template = makeTemplate({
      columns: [makeColDef({ name: "source name" })],
    });
    const result = await engine.validateFile(file, template);
    const headerErrors = result.errors.filter(e => e.validatorName === "column_header");
    expect(headerErrors).toHaveLength(0);
  });

  it("runs global validators", async () => {
    const file: SdrfFile = {
      headers: ["source name"],
      rows: [{ index: 0, cells: { "source name": ["sample1 "] } }], // trailing whitespace
    };
    const template = makeTemplate({
      columns: [makeColDef({ name: "source name" })],
      globalValidators: [{ validatorName: "trailing_whitespace_validator", params: {} }],
    });
    const result = await engine.validateFile(file, template);
    const wsWarning = result.warnings.find(w => w.validatorName === "trailing_whitespace_validator");
    expect(wsWarning).toBeDefined();
  });

  it("distinguishes errors vs warnings in the result", async () => {
    const file: SdrfFile = {
      headers: ["source name"],
      rows: [{ index: 0, cells: { "source name": [""] } }], // empty required cell → error
    };
    const template = makeTemplate({
      columns: [makeColDef({ name: "source name", requirement: "required" })],
      globalValidators: [{ validatorName: "empty_cells", params: {} }],
    });
    const result = await engine.validateFile(file, template);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("validates each occurrence of a cardinality:multiple column independently", async () => {
    const file: SdrfFile = {
      headers: ["source name", "comment[fragmentation]", "comment[fragmentation]"],
      rows: [{
        index: 0,
        cells: {
          "source name": ["S1"],
          "comment[fragmentation]": ["HCD", "ETD"],
        },
      }],
    };
    const template = makeTemplate({
      columns: [
        makeColDef({ name: "source name" }),
        makeColDef({
          name: "comment[fragmentation]",
          cardinality: "multiple",
          validators: [
            {
              validatorName: "values",
              params: { values: ["HCD", "CID", "ETD"], error_level: "error" },
            },
          ],
        }),
      ],
    });
    const result = await engine.validateFile(file, template);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
