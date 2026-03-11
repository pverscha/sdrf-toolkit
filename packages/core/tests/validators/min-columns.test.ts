import { describe, it, expect } from "vitest";
import { MinColumnsValidator } from "../../src/validation/validators/min-columns.js";
import type { SdrfFile } from "../../src/types/sdrf.js";
import { makeTemplate } from "./helpers.js";

describe("MinColumnsValidator", () => {
  it("reports no issues when column count exactly meets the minimum", async () => {
    const v = new MinColumnsValidator({ min_columns: 2 });
    const file: SdrfFile = { headers: ["source name", "assay name"], rows: [] };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(0);
  });

  it("reports no issues when column count exceeds the minimum", async () => {
    const v = new MinColumnsValidator({ min_columns: 1 });
    const file: SdrfFile = {
      headers: ["source name", "assay name", "extra col"],
      rows: [],
    };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(0);
  });

  it("reports an error when column count is below the minimum", async () => {
    const v = new MinColumnsValidator({ min_columns: 5 });
    const file: SdrfFile = { headers: ["source name", "assay name"], rows: [] };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("error");
    expect(issues[0].validatorName).toBe("min_columns");
  });

  it("includes actual and required counts in the error message", async () => {
    const v = new MinColumnsValidator({ min_columns: 5 });
    const file: SdrfFile = { headers: ["source name", "assay name"], rows: [] };
    const issues = await v.validate(file, makeTemplate());
    expect(issues[0].message).toMatch(/2 column\(s\)/);
    expect(issues[0].message).toMatch(/5 are required/);
  });

  it("reports an error for an empty file (0 columns)", async () => {
    const v = new MinColumnsValidator({ min_columns: 1 });
    const file: SdrfFile = { headers: [], rows: [] };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("error");
  });

  it("reports no issues when min_columns is 0", async () => {
    const v = new MinColumnsValidator({ min_columns: 0 });
    const file: SdrfFile = { headers: [], rows: [] };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(0);
  });
});
