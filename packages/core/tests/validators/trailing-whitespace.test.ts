import { describe, it, expect } from "vitest";
import { TrailingWhitespaceValidator } from "../../src/validation/validators/trailing-whitespace.js";
import type { SdrfFile } from "../../src/types/sdrf.js";
import { makeTemplate } from "./helpers.js";

describe("TrailingWhitespaceValidator", () => {
  const v = new TrailingWhitespaceValidator();

  it("reports no issues for cells without whitespace", async () => {
    const file: SdrfFile = {
      headers: ["source name"],
      rows: [{ index: 0, cells: { "source name": ["sample1"] } }],
    };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(0);
  });

  it("reports a warning for cells with trailing whitespace", async () => {
    const file: SdrfFile = {
      headers: ["source name"],
      rows: [{ index: 0, cells: { "source name": ["sample1 "] } }],
    };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("warning");
    expect(issues[0].columnName).toBe("source name");
    expect(issues[0].validatorName).toBe("trailing_whitespace_validator");
  });

  it("reports a warning for cells with leading whitespace", async () => {
    const file: SdrfFile = {
      headers: ["source name"],
      rows: [{ index: 0, cells: { "source name": [" sample1"] } }],
    };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("warning");
  });

  it("reports a warning for cells with both leading and trailing whitespace", async () => {
    const file: SdrfFile = {
      headers: ["source name"],
      rows: [{ index: 0, cells: { "source name": ["  sample1  "] } }],
    };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(1);
  });

  it("reports one warning per offending cell across multiple columns", async () => {
    const file: SdrfFile = {
      headers: ["source name", "assay name"],
      rows: [
        { index: 0, cells: { "source name": ["s1 "], "assay name": [" a1"] } },
      ],
    };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(2);
  });

  it("reports one warning per offending cell across multiple rows", async () => {
    const file: SdrfFile = {
      headers: ["source name"],
      rows: [
        { index: 0, cells: { "source name": ["s1 "] } },
        { index: 1, cells: { "source name": [" s2"] } },
        { index: 2, cells: { "source name": ["s3"] } },
      ],
    };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(2);
  });

  it("includes row index and value in each issue", async () => {
    const file: SdrfFile = {
      headers: ["source name"],
      rows: [{ index: 3, cells: { "source name": ["val "] } }],
    };
    const issues = await v.validate(file, makeTemplate());
    expect(issues[0].rowIndex).toBe(3);
    expect(issues[0].value).toBe("val ");
  });

  it("reports no issues for an empty file", async () => {
    const file: SdrfFile = { headers: [], rows: [] };
    const issues = await v.validate(file, makeTemplate());
    expect(issues).toHaveLength(0);
  });
});
