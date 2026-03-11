import { describe, it, expect } from "vitest";
import { PatternValidator } from "../../src/validation/validators/pattern.js";
import { makeContext } from "./helpers.js";

describe("PatternValidator", () => {
  it("accepts values matching the pattern", async () => {
    const v = new PatternValidator({ pattern: "^\\d+$" });
    expect((await v.validate("123", makeContext())).valid).toBe(true);
    expect((await v.validate("0", makeContext())).valid).toBe(true);
  });

  it("rejects values not matching the pattern", async () => {
    const v = new PatternValidator({ pattern: "^\\d+$" });
    const result = await v.validate("abc", makeContext());
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].level).toBe("error");
    expect(result.issues[0].validatorName).toBe("pattern");
  });

  it("is case-sensitive by default", async () => {
    const v = new PatternValidator({ pattern: "^[A-Z]+$" });
    expect((await v.validate("ABC", makeContext())).valid).toBe(true);
    expect((await v.validate("abc", makeContext())).valid).toBe(false);
  });

  it("is case-insensitive when case_sensitive is false", async () => {
    const v = new PatternValidator({ pattern: "^[A-Z]+$", case_sensitive: false });
    expect((await v.validate("abc", makeContext())).valid).toBe(true);
    expect((await v.validate("ABC", makeContext())).valid).toBe(true);
    expect((await v.validate("Abc", makeContext())).valid).toBe(true);
  });

  it("issues a warning (not an error) when error_level is 'warning'", async () => {
    const v = new PatternValidator({ pattern: "^\\d+$", error_level: "warning" });
    const result = await v.validate("abc", makeContext());
    expect(result.valid).toBe(true);
    expect(result.issues[0].level).toBe("warning");
  });

  it("issues an error when error_level is 'error'", async () => {
    const v = new PatternValidator({ pattern: "^\\d+$", error_level: "error" });
    const result = await v.validate("abc", makeContext());
    expect(result.valid).toBe(false);
    expect(result.issues[0].level).toBe("error");
  });

  it("rejects an empty string when the pattern requires content", async () => {
    const v = new PatternValidator({ pattern: "^\\d+$" });
    expect((await v.validate("", makeContext())).valid).toBe(false);
  });

  it("accepts an empty string when the pattern allows it", async () => {
    const v = new PatternValidator({ pattern: "^\\d*$" });
    expect((await v.validate("", makeContext())).valid).toBe(true);
  });

  it("accepts valid age ranges (real-world example)", async () => {
    const v = new PatternValidator({
      pattern: "^\\d+[yYmMdD](\\d+[yYmMdD])*(-\\d+[yYmMdD](\\d+[yYmMdD])*)?$",
      case_sensitive: false,
    });
    for (const age of ["45Y", "6M", "30Y6M", "40Y-50Y", "1D", "45y"]) {
      expect((await v.validate(age, makeContext())).valid, `Expected "${age}" to be valid`).toBe(true);
    }
    for (const age of ["45", "forty-five", "", "abc"]) {
      expect((await v.validate(age, makeContext())).valid, `Expected "${age}" to be invalid`).toBe(false);
    }
  });

  it("includes value and column name in the issue", async () => {
    const v = new PatternValidator({ pattern: "^\\d+$" });
    const ctx = makeContext();
    const result = await v.validate("bad", ctx);
    expect(result.issues[0].value).toBe("bad");
    expect(result.issues[0].columnName).toBe(ctx.columnDef.name);
  });
});
