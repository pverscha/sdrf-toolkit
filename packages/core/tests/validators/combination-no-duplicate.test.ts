import { describe, it, expect } from "vitest";
import { CombinationNoDuplicateValidator } from "../../src/validation/validators/combination-no-duplicate.js";
import type { SdrfFile } from "../../src/types/sdrf.js";
import { makeTemplate } from "./helpers.js";

describe("CombinationNoDuplicateValidator", () => {
  describe("error-level duplicate detection (column_name)", () => {
    const v = new CombinationNoDuplicateValidator({
      column_name: ["source name", "assay name"],
    });

    it("reports no issues when all combinations are unique", async () => {
      const file: SdrfFile = {
        headers: ["source name", "assay name"],
        rows: [
          { index: 0, cells: { "source name": "s1", "assay name": "a1" } },
          { index: 1, cells: { "source name": "s1", "assay name": "a2" } },
          { index: 2, cells: { "source name": "s2", "assay name": "a1" } },
        ],
      };
      const issues = await v.validate(file, makeTemplate());
      expect(issues).toHaveLength(0);
    });

    it("reports an error for an exact duplicate combination", async () => {
      const file: SdrfFile = {
        headers: ["source name", "assay name"],
        rows: [
          { index: 0, cells: { "source name": "s1", "assay name": "a1" } },
          { index: 1, cells: { "source name": "s1", "assay name": "a1" } },
        ],
      };
      const issues = await v.validate(file, makeTemplate());
      expect(issues).toHaveLength(1);
      expect(issues[0].level).toBe("error");
      expect(issues[0].rowIndex).toBe(1);
      expect(issues[0].validatorName).toBe("combination_of_columns_no_duplicate_validator");
    });

    it("reports multiple errors for multiple duplicate rows", async () => {
      const file: SdrfFile = {
        headers: ["source name", "assay name"],
        rows: [
          { index: 0, cells: { "source name": "s1", "assay name": "a1" } },
          { index: 1, cells: { "source name": "s1", "assay name": "a1" } },
          { index: 2, cells: { "source name": "s1", "assay name": "a1" } },
        ],
      };
      const issues = await v.validate(file, makeTemplate());
      expect(issues).toHaveLength(2);
    });

    it("references the first occurrence row in the duplicate message", async () => {
      const file: SdrfFile = {
        headers: ["source name", "assay name"],
        rows: [
          { index: 0, cells: { "source name": "s1", "assay name": "a1" } },
          { index: 5, cells: { "source name": "s1", "assay name": "a1" } },
        ],
      };
      const issues = await v.validate(file, makeTemplate());
      expect(issues[0].message).toMatch(/row 0/);
      expect(issues[0].message).toMatch(/row 5/);
    });
  });

  describe("warning-level duplicate detection (column_name_warning)", () => {
    const v = new CombinationNoDuplicateValidator({
      column_name_warning: ["source name"],
    });

    it("reports a warning for duplicate values in warning columns", async () => {
      const file: SdrfFile = {
        headers: ["source name"],
        rows: [
          { index: 0, cells: { "source name": "s1" } },
          { index: 1, cells: { "source name": "s1" } },
        ],
      };
      const issues = await v.validate(file, makeTemplate());
      expect(issues).toHaveLength(1);
      expect(issues[0].level).toBe("warning");
    });

    it("reports no issues when warning-column values are unique", async () => {
      const file: SdrfFile = {
        headers: ["source name"],
        rows: [
          { index: 0, cells: { "source name": "s1" } },
          { index: 1, cells: { "source name": "s2" } },
        ],
      };
      const issues = await v.validate(file, makeTemplate());
      expect(issues).toHaveLength(0);
    });
  });

  describe("combined error + warning columns", () => {
    it("reports both errors and warnings independently", async () => {
      const v = new CombinationNoDuplicateValidator({
        column_name: ["assay name"],
        column_name_warning: ["source name"],
      });
      const file: SdrfFile = {
        headers: ["source name", "assay name"],
        rows: [
          { index: 0, cells: { "source name": "s1", "assay name": "a1" } },
          { index: 1, cells: { "source name": "s1", "assay name": "a1" } },
        ],
      };
      const issues = await v.validate(file, makeTemplate());
      const errors = issues.filter(i => i.level === "error");
      const warnings = issues.filter(i => i.level === "warning");
      expect(errors).toHaveLength(1);
      expect(warnings).toHaveLength(1);
    });
  });

  describe("edge cases", () => {
    it("reports no issues when column_name is an empty array", async () => {
      const v = new CombinationNoDuplicateValidator({ column_name: [] });
      const file: SdrfFile = {
        headers: ["source name"],
        rows: [
          { index: 0, cells: { "source name": "s1" } },
          { index: 1, cells: { "source name": "s1" } },
        ],
      };
      const issues = await v.validate(file, makeTemplate());
      expect(issues).toHaveLength(0);
    });

    it("treats missing column values as empty string for key construction", async () => {
      const v = new CombinationNoDuplicateValidator({ column_name: ["source name", "assay name"] });
      const file: SdrfFile = {
        headers: ["source name", "assay name"],
        rows: [
          { index: 0, cells: { "source name": "s1" } }, // assay name missing
          { index: 1, cells: { "source name": "s1" } }, // assay name missing → same key
        ],
      };
      const issues = await v.validate(file, makeTemplate());
      expect(issues).toHaveLength(1);
    });

    it("reports no issues for a single-row file", async () => {
      const v = new CombinationNoDuplicateValidator({ column_name: ["source name"] });
      const file: SdrfFile = {
        headers: ["source name"],
        rows: [{ index: 0, cells: { "source name": "s1" } }],
      };
      const issues = await v.validate(file, makeTemplate());
      expect(issues).toHaveLength(0);
    });
  });
});
