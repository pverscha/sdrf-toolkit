import { describe, it, expect } from "vitest";
import { AccessionValidator } from "../../src/validation/validators/accession.js";
import { makeContext } from "./helpers.js";

describe("AccessionValidator", () => {
  describe("prefix constraint", () => {
    const v = new AccessionValidator({ prefix: "SAMEA" });

    it("accepts values starting with the required prefix", async () => {
      expect((await v.validate("SAMEA12345", makeContext())).valid).toBe(true);
    });

    it("rejects values not starting with the required prefix", async () => {
      const result = await v.validate("SAMN12345", makeContext());
      expect(result.valid).toBe(false);
      expect(result.issues[0].level).toBe("error");
    });
  });

  describe("suffix constraint", () => {
    const v = new AccessionValidator({ suffix: ".1" });

    it("accepts values ending with the required suffix", async () => {
      expect((await v.validate("ACCESSION.1", makeContext())).valid).toBe(true);
    });

    it("rejects values not ending with the required suffix", async () => {
      expect((await v.validate("ACCESSION.2", makeContext())).valid).toBe(false);
      expect((await v.validate("ACCESSION", makeContext())).valid).toBe(false);
    });
  });

  describe("prefix + suffix combined", () => {
    const v = new AccessionValidator({ prefix: "GSE", suffix: ".txt" });

    it("accepts values matching both prefix and suffix", async () => {
      expect((await v.validate("GSE12345.txt", makeContext())).valid).toBe(true);
    });

    it("rejects values missing prefix only", async () => {
      expect((await v.validate("12345.txt", makeContext())).valid).toBe(false);
    });

    it("rejects values missing suffix only", async () => {
      expect((await v.validate("GSE12345", makeContext())).valid).toBe(false);
    });
  });

  describe("no constraints", () => {
    const v = new AccessionValidator({});

    it("accepts any non-empty string", async () => {
      expect((await v.validate("anything", makeContext())).valid).toBe(true);
      expect((await v.validate("XYZ-001", makeContext())).valid).toBe(true);
    });
  });

  it("issues a warning (not an error) when error_level is 'warning'", async () => {
    const v = new AccessionValidator({ prefix: "SAMEA", error_level: "warning" });
    const result = await v.validate("INVALID", makeContext());
    expect(result.valid).toBe(true);
    expect(result.issues[0].level).toBe("warning");
  });

  it("includes value and column name in the issue", async () => {
    const v = new AccessionValidator({ prefix: "SAMEA" });
    const ctx = makeContext();
    const result = await v.validate("BAD", ctx);
    expect(result.issues[0].value).toBe("BAD");
    expect(result.issues[0].columnName).toBe(ctx.columnDef.name);
    expect(result.issues[0].validatorName).toBe("accession");
  });
});
