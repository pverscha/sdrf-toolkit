import { describe, it, expect } from "vitest";
import { SingleCardinalityValidator } from "../../src/validation/validators/single-cardinality.js";
import { makeContext } from "./helpers.js";

describe("SingleCardinalityValidator", () => {
  it("accepts values without semicolons", async () => {
    const v = new SingleCardinalityValidator({});
    expect((await v.validate("sample1", makeContext())).valid).toBe(true);
    expect((await v.validate("hello world", makeContext())).valid).toBe(true);
    expect((await v.validate("", makeContext())).valid).toBe(true);
  });

  it("rejects values containing a single semicolon", async () => {
    const v = new SingleCardinalityValidator({});
    const result = await v.validate("val1;val2", makeContext());
    expect(result.valid).toBe(false);
    expect(result.issues[0].level).toBe("error");
    expect(result.issues[0].validatorName).toBe("single_cardinality_validator");
  });

  it("rejects values containing multiple semicolons", async () => {
    const v = new SingleCardinalityValidator({});
    expect((await v.validate("a;b;c", makeContext())).valid).toBe(false);
  });

  it("issues a warning (not an error) when error_level is 'warning'", async () => {
    const v = new SingleCardinalityValidator({ error_level: "warning" });
    const result = await v.validate("a;b", makeContext());
    expect(result.valid).toBe(true);
    expect(result.issues[0].level).toBe("warning");
  });

  it("issues an error when error_level is 'error'", async () => {
    const v = new SingleCardinalityValidator({ error_level: "error" });
    const result = await v.validate("a;b", makeContext());
    expect(result.valid).toBe(false);
    expect(result.issues[0].level).toBe("error");
  });

  it("includes value and column name in the issue", async () => {
    const v = new SingleCardinalityValidator({});
    const ctx = makeContext();
    const result = await v.validate("x;y", ctx);
    expect(result.issues[0].value).toBe("x;y");
    expect(result.issues[0].columnName).toBe(ctx.columnDef.name);
  });
});
