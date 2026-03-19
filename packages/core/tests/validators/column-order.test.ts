import { describe, it, expect } from "vitest";
import { ColumnOrderValidator } from "../../src/validation/validators/column-order.js";
import type { SdrfFile } from "../../src/types/sdrf.js";
import { makeTemplate } from "./helpers.js";

describe("ColumnOrderValidator", () => {
  const v = new ColumnOrderValidator();
  const template = makeTemplate();

  // ── Valid orderings ──────────────────────────────────────────────────────────

  it("reports no issues for the full correct group order", async () => {
    const file: SdrfFile = {
      headers: [
        "source name",
        "characteristics[organism]",
        "material type",
        "protocol ref",
        "assay name",
        "technology type",
        "comment[data file]",
        "factor value[condition]",
      ],
      rows: [],
    };
    expect(await v.validate(file, template)).toHaveLength(0);
  });

  it("reports no issues when only a subset of groups is present (in order)", async () => {
    const file: SdrfFile = {
      headers: ["source name", "assay name", "factor value[condition]"],
      rows: [],
    };
    expect(await v.validate(file, template)).toHaveLength(0);
  });

  it("reports no issues when unclassified columns appear anywhere", async () => {
    const file: SdrfFile = {
      headers: ["unknown col", "source name", "another unknown", "assay name"],
      rows: [],
    };
    expect(await v.validate(file, template)).toHaveLength(0);
  });

  it("reports no issues for an empty header list", async () => {
    const file: SdrfFile = { headers: [], rows: [] };
    expect(await v.validate(file, template)).toHaveLength(0);
  });

  // ── Invalid orderings ────────────────────────────────────────────────────────

  it("reports an error when characteristics[x] appears after assay name", async () => {
    const file: SdrfFile = {
      headers: ["source name", "assay name", "characteristics[organism]"],
      rows: [],
    };
    const issues = await v.validate(file, template);
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("error");
    expect(issues[0].validatorName).toBe("column_order");
    expect(issues[0].message).toContain("characteristics[organism]");
  });

  it("reports an error when source name appears last", async () => {
    const file: SdrfFile = {
      headers: ["assay name", "source name"],
      rows: [],
    };
    const issues = await v.validate(file, template);
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("error");
    expect(issues[0].message).toContain("source name");
  });

  it("reports one error per violating column (multiple violations)", async () => {
    const file: SdrfFile = {
      headers: [
        "factor value[condition]",
        "source name",           // group 0 < maxGroupSeen 7 → error
        "characteristics[x]",   // group 1 < maxGroupSeen 7 → error
      ],
      rows: [],
    };
    const issues = await v.validate(file, template);
    expect(issues).toHaveLength(2);
  });

  // ── Case-insensitivity ───────────────────────────────────────────────────────

  it("is case-insensitive for characteristics", async () => {
    const file: SdrfFile = {
      headers: ["source name", "CHARACTERISTICS[organism]", "assay name"],
      rows: [],
    };
    expect(await v.validate(file, template)).toHaveLength(0);
  });

  it("is case-insensitive for factor value", async () => {
    const file: SdrfFile = {
      headers: ["source name", "Factor Value[condition]"],
      rows: [],
    };
    expect(await v.validate(file, template)).toHaveLength(0);
  });

  it("reports an error for FACTOR VALUE[x] appearing before source name", async () => {
    const file: SdrfFile = {
      headers: ["Factor Value[condition]", "source name"],
      rows: [],
    };
    const issues = await v.validate(file, template);
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("error");
  });
});
