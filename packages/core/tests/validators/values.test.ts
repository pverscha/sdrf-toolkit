import { describe, it, expect } from "vitest";
import { ValuesValidator } from "../../src/validation/validators/values.js";
import { makeContext } from "./helpers.js";

describe("ValuesValidator", () => {
  it("accepts values in the allowed list", async () => {
    const v = new ValuesValidator({ values: ["male", "female", "intersex"] });
    for (const val of ["male", "female", "intersex"]) {
      expect((await v.validate(val, makeContext())).valid, `Expected "${val}" to be valid`).toBe(true);
    }
  });

  it("rejects values not in the allowed list", async () => {
    const v = new ValuesValidator({ values: ["male", "female"] });
    const result = await v.validate("unknown", makeContext());
    expect(result.valid).toBe(false);
    expect(result.issues[0].level).toBe("error");
    expect(result.issues[0].validatorName).toBe("values");
  });

  it("is case-insensitive by default", async () => {
    const v = new ValuesValidator({ values: ["male", "female"] });
    expect((await v.validate("MALE", makeContext())).valid).toBe(true);
    expect((await v.validate("Female", makeContext())).valid).toBe(true);
    expect((await v.validate("FEMALE", makeContext())).valid).toBe(true);
  });

  it("is case-sensitive when case_sensitive is true", async () => {
    const v = new ValuesValidator({ values: ["Male"], case_sensitive: true });
    expect((await v.validate("Male", makeContext())).valid).toBe(true);
    expect((await v.validate("male", makeContext())).valid).toBe(false);
    expect((await v.validate("MALE", makeContext())).valid).toBe(false);
  });

  it("issues a warning (not an error) when error_level is 'warning'", async () => {
    const v = new ValuesValidator({ values: ["a", "b"], error_level: "warning" });
    const result = await v.validate("c", makeContext());
    expect(result.valid).toBe(true);
    expect(result.issues[0].level).toBe("warning");
  });

  it("issues an error when error_level is 'error'", async () => {
    const v = new ValuesValidator({ values: ["a"], error_level: "error" });
    const result = await v.validate("z", makeContext());
    expect(result.valid).toBe(false);
    expect(result.issues[0].level).toBe("error");
  });

  it("trims leading/trailing whitespace before comparison", async () => {
    const v = new ValuesValidator({ values: ["male"] });
    // The validator trims input values during comparison
    expect((await v.validate("  male  ", makeContext())).valid).toBe(true);
  });

  it("includes allowed values list in the issue message", async () => {
    const v = new ValuesValidator({ values: ["a", "b"] });
    const result = await v.validate("c", makeContext());
    expect(result.issues[0].message).toMatch(/a, b/);
  });

  it("includes value and column name in the issue", async () => {
    const v = new ValuesValidator({ values: ["x"] });
    const ctx = makeContext();
    const result = await v.validate("y", ctx);
    expect(result.issues[0].value).toBe("y");
    expect(result.issues[0].columnName).toBe(ctx.columnDef.name);
  });
});
