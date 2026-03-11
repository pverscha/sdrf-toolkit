import { describe, it, expect } from "vitest";
import { MzValueValidator } from "../../src/validation/validators/mz-value.js";
import { makeContext } from "./helpers.js";

describe("MzValueValidator", () => {
  it("accepts positive integers", async () => {
    const v = new MzValueValidator({});
    expect((await v.validate("100", makeContext())).valid).toBe(true);
    expect((await v.validate("1200", makeContext())).valid).toBe(true);
  });

  it("accepts positive decimal values", async () => {
    const v = new MzValueValidator({});
    expect((await v.validate("400.5", makeContext())).valid).toBe(true);
    expect((await v.validate("0.001", makeContext())).valid).toBe(true);
    expect((await v.validate("1200.0", makeContext())).valid).toBe(true);
  });

  it("rejects zero", async () => {
    const v = new MzValueValidator({});
    const result = await v.validate("0", makeContext());
    expect(result.valid).toBe(false);
    expect(result.issues[0].level).toBe("error");
  });

  it("rejects negative values", async () => {
    const v = new MzValueValidator({});
    expect((await v.validate("-400", makeContext())).valid).toBe(false);
    expect((await v.validate("-0.1", makeContext())).valid).toBe(false);
  });

  it("rejects non-numeric strings", async () => {
    const v = new MzValueValidator({});
    expect((await v.validate("abc", makeContext())).valid).toBe(false);
    expect((await v.validate("", makeContext())).valid).toBe(false);
    expect((await v.validate("NaN", makeContext())).valid).toBe(false);
  });

  it("issues a warning (not an error) when error_level is 'warning'", async () => {
    const v = new MzValueValidator({ error_level: "warning" });
    const result = await v.validate("0", makeContext());
    expect(result.valid).toBe(true);
    expect(result.issues[0].level).toBe("warning");
  });

  it("issues an error when error_level is 'error'", async () => {
    const v = new MzValueValidator({ error_level: "error" });
    const result = await v.validate("-5", makeContext());
    expect(result.valid).toBe(false);
    expect(result.issues[0].level).toBe("error");
  });

  it("includes value and column name in the issue", async () => {
    const v = new MzValueValidator({});
    const ctx = makeContext();
    const result = await v.validate("0", ctx);
    expect(result.issues[0].value).toBe("0");
    expect(result.issues[0].columnName).toBe(ctx.columnDef.name);
    expect(result.issues[0].validatorName).toBe("mz_value");
  });
});
