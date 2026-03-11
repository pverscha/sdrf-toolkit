import { describe, it, expect } from "vitest";
import { ColumnOrderValidator } from "../../src/validation/validators/column-order.js";
import type { SdrfFile } from "../../src/types/sdrf.js";
import { makeTemplate, makeColumnDef } from "./helpers.js";

describe("ColumnOrderValidator", () => {
  const v = new ColumnOrderValidator();

  it("reports no issues when headers match the template order exactly", async () => {
    const file: SdrfFile = {
      headers: ["source name", "assay name"],
      rows: [],
    };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(0);
  });

  it("reports an error when defined headers are in the wrong order", async () => {
    const file: SdrfFile = {
      headers: ["assay name", "source name"],
      rows: [],
    };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("error");
    expect(issues[0].validatorName).toBe("column_order");
  });

  it("reports no issues when only a subset of template columns is present (in order)", async () => {
    const file: SdrfFile = {
      headers: ["source name"],
      rows: [],
    };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(0);
  });

  it("ignores custom bracket-syntax columns in the ordering check", async () => {
    const file: SdrfFile = {
      headers: ["comment[extra]", "source name", "assay name"],
      rows: [],
    };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(0);
  });

  it("ignores bracket-syntax columns interspersed between defined columns", async () => {
    const file: SdrfFile = {
      headers: ["source name", "characteristics[organism]", "assay name"],
      rows: [],
    };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(0);
  });

  it("reports an error when defined headers are out of order even with bracket columns present", async () => {
    const file: SdrfFile = {
      headers: ["assay name", "characteristics[organism]", "source name"],
      rows: [],
    };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("error");
  });

  it("reports no issues for an empty file (no defined headers)", async () => {
    const file: SdrfFile = { headers: [], rows: [] };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(0);
  });

  it("handles three or more columns correctly", async () => {
    const template = makeTemplate({
      columns: [
        makeColumnDef({ name: "a" }),
        makeColumnDef({ name: "b" }),
        makeColumnDef({ name: "c" }),
      ],
    });

    const correct: SdrfFile = { headers: ["a", "b", "c"], rows: [] };
    expect((await v.validate(correct, template))).toHaveLength(0);

    const wrong: SdrfFile = { headers: ["a", "c", "b"], rows: [] };
    expect((await v.validate(wrong, template))).toHaveLength(1);
  });

  it("includes the expected and actual order in the error message", async () => {
    const file: SdrfFile = { headers: ["assay name", "source name"], rows: [] };
    const issues = await v.validate(file, makeTemplate());
    expect(issues[0].message).toMatch(/source name/);
    expect(issues[0].message).toMatch(/assay name/);
  });
});
