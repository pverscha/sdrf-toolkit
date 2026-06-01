import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { parseSdrf } from "../../src/sdrf/parser.js";
import { ValidationEngine } from "../../src/validation/engine.js";
import { TemplateRegistry } from "../../src/templates/registry.js";
import type { SdrfTemplate } from "../../src/types/template.js";
import { OFFICIAL_TO_LOCAL, SKIP_CATEGORIES, makeMockOntologyRegistry } from "./helpers.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURES  = join(__dir, "fixtures");
const EXPECTED  = join(FIXTURES, "expected");
const TEMPLATES = join(FIXTURES, "templates");

interface ExpectedResult {
  file: string;
  templates: string[];
  has_errors: boolean;
  has_warnings: boolean;
  error_count: number;
  warning_count: number;
  error_categories: string[];
  warning_categories: string[];
}

function loadExpected(name: string): ExpectedResult {
  return JSON.parse(readFileSync(join(EXPECTED, `${name}.json`), "utf8")) as ExpectedResult;
}

function loadSdrf(relPath: string) {
  return parseSdrf(readFileSync(join(FIXTURES, relPath), "utf8"));
}

let engine: ValidationEngine;
let registry: TemplateRegistry;

beforeAll(async () => {
  engine = new ValidationEngine(makeMockOntologyRegistry());
  registry = new TemplateRegistry(TEMPLATES);
  await registry.initialize();
});

// ---------------------------------------------------------------------------
// PRIDE reference files — compared against official validator output
// ---------------------------------------------------------------------------

// Each fixture uses the single most-specific template that covers all required
// validation rules. The official sdrf-pipelines CLI validate-sdrf only applies
// one template per invocation (the last -t value), so single-template
// comparison is the valid baseline for behavioral equivalence testing.
const PRIDE_CASES = [
  { name: "sample-basic",     file: "valid/sample-basic.sdrf.tsv",    templates: ["vertebrates"] },
  { name: "pxd001819",        file: "valid/pxd001819.sdrf.tsv",        templates: ["vertebrates"] },
  { name: "pxd015270",        file: "valid/pxd015270.sdrf.tsv",        templates: ["human"] },
  { name: "pxd000612",        file: "valid/pxd000612.sdrf.tsv",        templates: ["human"] },
  { name: "pxd001474",        file: "valid/pxd001474.sdrf.tsv",        templates: ["human"] },
  { name: "pxd002137",        file: "valid/pxd002137.sdrf.tsv",        templates: ["human"] },
  { name: "pxd004684",        file: "valid/pxd004684.sdrf.tsv",        templates: ["dia-acquisition"] },
  { name: "pxd008934",        file: "valid/pxd008934.sdrf.tsv",        templates: ["human"] },
  { name: "pxd009749",        file: "valid/pxd009749.sdrf.tsv",        templates: ["immunopeptidomics"] },
  { name: "diann-label-free", file: "valid/diann-label-free.sdrf.tsv", templates: ["ms-proteomics"] },
] as const;

describe("PRIDE SDRF files — match official sdrf-pipelines validator outcome", () => {
  for (const { name, file, templates } of PRIDE_CASES) {
    it(name, async () => {
      const expected = loadExpected(name);
      const template = await registry.resolveTemplates([...templates]);
      const result   = await engine.validateFile(loadSdrf(file), template);

      // Error presence must match: if official validator found errors, so must the local validator.
      expect(
        result.errors.length > 0,
        `error presence mismatch for "${name}": official has_errors=${expected.has_errors}, ` +
        `local errors=${result.errors.length}`
      ).toBe(expected.has_errors);

      // For every non-ontology error category the official validator reported, verify that the
      // local validator produces at least one error with the mapped validator name.
      const testableCategories = expected.error_categories.filter(
        (c) => !SKIP_CATEGORIES.has(c)
      );

      for (const officialCategory of testableCategories) {
        const localName = OFFICIAL_TO_LOCAL[officialCategory];
        if (!localName) continue; // no mapping defined — skip

        expect(
          result.errors.some((e) => e.validatorName === localName),
          `expected a local error with validatorName="${localName}" (mapped from official category "${officialCategory}") ` +
          `in "${name}". Local errors: [${result.errors.map((e) => e.validatorName).join(", ")}]`
        ).toBe(true);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Hand-crafted invalid files — specific structural error types
// ---------------------------------------------------------------------------

describe("hand-crafted invalid files — specific structural errors", () => {
  it("detects wrong column order (assay name before characteristics[organism])", async () => {
    const template = await registry.resolveTemplates(["ms-proteomics"]);
    const result   = await engine.validateFile(loadSdrf("invalid/invalid-column-order.sdrf.tsv"), template);
    expect(
      result.errors.some((e) => e.validatorName === "column_order"),
      `expected column_order error; got: [${result.errors.map((e) => e.validatorName).join(", ")}]`
    ).toBe(true);
  });

  it("detects trailing whitespace in column header", async () => {
    const template = await registry.resolveTemplates(["ms-proteomics"]);
    const result   = await engine.validateFile(loadSdrf("invalid/invalid-trailing-whitespace.sdrf.tsv"), template);
    expect(
      result.errors.some((e) => e.validatorName === "trailing_whitespace_validator"),
      `expected trailing_whitespace_validator error`
    ).toBe(true);
  });

  it("detects empty required cell in source name", async () => {
    const template = await registry.resolveTemplates(["ms-proteomics"]);
    const result   = await engine.validateFile(loadSdrf("invalid/invalid-empty-required-cell.sdrf.tsv"), template);
    expect(
      result.errors.some((e) => e.validatorName === "empty_cells"),
      `expected empty_cells error; got: [${result.errors.map((e) => e.validatorName).join(", ")}]`
    ).toBe(true);
  });

  it("detects duplicate source name + assay name + comment[label] combination", async () => {
    const template = await registry.resolveTemplates(["ms-proteomics"]);
    const result   = await engine.validateFile(loadSdrf("invalid/invalid-duplicate-combination.sdrf.tsv"), template);
    expect(
      result.errors.some((e) => e.validatorName === "combination_of_columns_no_duplicate_validator"),
      `expected combination_of_columns_no_duplicate_validator error`
    ).toBe(true);
  });
});
