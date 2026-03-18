import { describe, it, expect } from "vitest";
import { EmptyCellsValidator } from "../../src/validation/validators/empty-cells.js";
import type { SdrfFile } from "../../src/types/sdrf.js";
import { makeTemplate, makeColumnDef } from "./helpers.js";

describe("EmptyCellsValidator", () => {
  const v = new EmptyCellsValidator();

  it("reports no issues when required columns are filled", async () => {
    const file: SdrfFile = {
      headers: ["source name", "assay name"],
      rows: [{ index: 0, cells: { "source name": ["s1"], "assay name": ["a1"] } }],
    };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(0);
  });

  it("reports an error for an empty string in a required column", async () => {
    const file: SdrfFile = {
      headers: ["source name", "assay name"],
      rows: [{ index: 0, cells: { "source name": [""], "assay name": ["a1"] } }],
    };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("error");
    expect(issues[0].columnName).toBe("source name");
    expect(issues[0].validatorName).toBe("empty_cells");
  });

  it("reports an error for whitespace-only values in a required column", async () => {
    const singleColTemplate = makeTemplate({
      columns: [makeColumnDef({ name: "source name", requirement: "required" })],
    });
    const file: SdrfFile = {
      headers: ["source name"],
      rows: [{ index: 0, cells: { "source name": ["   "] } }],
    };
    const issues = await v.validate(file, singleColTemplate);
    expect(issues).toHaveLength(1);
  });

  it("reports an error when the key is entirely missing from the row cells", async () => {
    const singleColTemplate = makeTemplate({
      columns: [makeColumnDef({ name: "source name", requirement: "required" })],
    });
    const file: SdrfFile = {
      headers: ["source name"],
      rows: [{ index: 0, cells: {} }],
    };
    const issues = await v.validate(file, singleColTemplate);
    expect(issues).toHaveLength(1);
    expect(issues[0].columnName).toBe("source name");
  });

  it("does not flag optional columns that are empty", async () => {
    const template = makeTemplate({
      columns: [makeColumnDef({ name: "optional col", requirement: "optional" })],
    });
    const file: SdrfFile = {
      headers: ["optional col"],
      rows: [{ index: 0, cells: { "optional col": [""] } }],
    };
    const issues = await v.validate(file, template);
    expect(issues).toHaveLength(0);
  });

  it("reports separate errors for each empty required column in a row", async () => {
    const file: SdrfFile = {
      headers: ["source name", "assay name"],
      rows: [{ index: 0, cells: { "source name": [""], "assay name": [""] } }],
    };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(2);
  });

  it("reports separate errors for each row with empty required cells", async () => {
    const singleColTemplate = makeTemplate({
      columns: [makeColumnDef({ name: "source name", requirement: "required" })],
    });
    const file: SdrfFile = {
      headers: ["source name"],
      rows: [
        { index: 0, cells: { "source name": [""] } },
        { index: 1, cells: { "source name": ["s1"] } },
        { index: 2, cells: { "source name": [""] } },
      ],
    };
    const issues = await v.validate(file, singleColTemplate);
    expect(issues).toHaveLength(2);
    expect(issues.map(i => i.rowIndex)).toEqual([0, 2]);
  });

  it("reports no issues for an empty file (no rows)", async () => {
    const file: SdrfFile = { headers: ["source name"], rows: [] };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(0);
  });

  it("includes row index in the issue", async () => {
    const file: SdrfFile = {
      headers: ["source name"],
      rows: [{ index: 5, cells: { "source name": [""] } }],
    };
    const issues = await v.validate(file, makeTemplate());
    expect(issues[0].rowIndex).toBe(5);
  });
});
