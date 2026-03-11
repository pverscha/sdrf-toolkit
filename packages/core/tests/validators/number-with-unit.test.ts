import { describe, it, expect } from "vitest";
import { NumberWithUnitValidator } from "../../src/validation/validators/number-with-unit.js";
import { makeContext } from "./helpers.js";

describe("NumberWithUnitValidator", () => {
  it("accepts valid integer + unit values", async () => {
    const v = new NumberWithUnitValidator({ units: ["mg", "µg", "nM", "year"] });
    for (const val of ["1 mg", "300 nM", "45 year"]) {
      expect((await v.validate(val, makeContext())).valid, `Expected "${val}" to be valid`).toBe(true);
    }
  });

  it("accepts valid decimal + unit values", async () => {
    const v = new NumberWithUnitValidator({ units: ["mg", "µg"] });
    expect((await v.validate("1.5 mg", makeContext())).valid).toBe(true);
    expect((await v.validate("0.001 µg", makeContext())).valid).toBe(true);
  });

  it("accepts zero as a valid number", async () => {
    const v = new NumberWithUnitValidator({ units: ["mg"] });
    expect((await v.validate("0 mg", makeContext())).valid).toBe(true);
  });

  it("rejects values with no space (missing unit separator)", async () => {
    const v = new NumberWithUnitValidator({ units: ["mg"] });
    const result = await v.validate("150mg", makeContext());
    expect(result.valid).toBe(false);
    expect(result.issues[0].level).toBe("error");
  });

  it("rejects values where the numeric part is non-numeric", async () => {
    const v = new NumberWithUnitValidator({ units: ["mg"] });
    const result = await v.validate("abc mg", makeContext());
    expect(result.valid).toBe(false);
  });

  it("rejects values with an unsupported unit", async () => {
    const v = new NumberWithUnitValidator({ units: ["mg", "µg"] });
    const result = await v.validate("1.5 kg", makeContext());
    expect(result.valid).toBe(false);
    expect(result.issues[0].message).toMatch(/not in the allowed list/);
  });

  it("rejects negative values when allow_negative is false", async () => {
    const v = new NumberWithUnitValidator({ units: ["mg"], allow_negative: false });
    const result = await v.validate("-1 mg", makeContext());
    expect(result.valid).toBe(false);
    expect(result.issues[0].message).toMatch(/[Nn]egative/);
  });

  it("allows negative values by default (allow_negative not set)", async () => {
    const v = new NumberWithUnitValidator({ units: ["mg"] });
    expect((await v.validate("-5 mg", makeContext())).valid).toBe(true);
  });

  it("allows negative values when allow_negative is true", async () => {
    const v = new NumberWithUnitValidator({ units: ["mg"], allow_negative: true });
    expect((await v.validate("-5 mg", makeContext())).valid).toBe(true);
  });

  it("issues a warning (not an error) when error_level is 'warning'", async () => {
    const v = new NumberWithUnitValidator({ units: ["mg"], error_level: "warning" });
    const result = await v.validate("bad", makeContext());
    expect(result.valid).toBe(true);
    expect(result.issues[0].level).toBe("warning");
  });

  it("includes the allowed units in the issue message", async () => {
    const v = new NumberWithUnitValidator({ units: ["mg", "µg"] });
    const result = await v.validate("1 kg", makeContext());
    expect(result.issues[0].message).toMatch(/mg/);
  });

  it("includes value and column name in the issue", async () => {
    const v = new NumberWithUnitValidator({ units: ["mg"] });
    const ctx = makeContext();
    const result = await v.validate("nospace", ctx);
    expect(result.issues[0].value).toBe("nospace");
    expect(result.issues[0].columnName).toBe(ctx.columnDef.name);
  });
});
