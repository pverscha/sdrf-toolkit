import { describe, it, expect } from "vitest";
import { MzRangeIntervalValidator } from "../../src/validation/validators/mz-range-interval.js";
import { makeContext } from "./helpers.js";

describe("MzRangeIntervalValidator", () => {
  it("accepts valid integer ranges", async () => {
    const v = new MzRangeIntervalValidator({});
    expect((await v.validate("100-2000", makeContext())).valid).toBe(true);
    expect((await v.validate("50-500", makeContext())).valid).toBe(true);
  });

  it("accepts valid decimal ranges", async () => {
    const v = new MzRangeIntervalValidator({});
    expect((await v.validate("400.5-1600.0", makeContext())).valid).toBe(true);
    expect((await v.validate("0.1-999.9", makeContext())).valid).toBe(true);
  });

  it("rejects when lower bound equals upper bound", async () => {
    const v = new MzRangeIntervalValidator({});
    const result = await v.validate("500-500", makeContext());
    expect(result.valid).toBe(false);
    expect(result.issues[0].level).toBe("error");
  });

  it("rejects when lower bound exceeds upper bound", async () => {
    const v = new MzRangeIntervalValidator({});
    const result = await v.validate("2000-100", makeContext());
    expect(result.valid).toBe(false);
  });

  it("rejects values without a dash separator", async () => {
    const v = new MzRangeIntervalValidator({});
    expect((await v.validate("100", makeContext())).valid).toBe(false);
    expect((await v.validate("100 2000", makeContext())).valid).toBe(false);
  });

  it("rejects zero lower bound", async () => {
    const v = new MzRangeIntervalValidator({});
    expect((await v.validate("0-2000", makeContext())).valid).toBe(false);
  });

  it("rejects negative lower bound", async () => {
    const v = new MzRangeIntervalValidator({});
    expect((await v.validate("-100-2000", makeContext())).valid).toBe(false);
  });

  it("rejects zero upper bound", async () => {
    const v = new MzRangeIntervalValidator({});
    expect((await v.validate("100-0", makeContext())).valid).toBe(false);
  });

  it("rejects non-numeric bounds", async () => {
    const v = new MzRangeIntervalValidator({});
    expect((await v.validate("abc-2000", makeContext())).valid).toBe(false);
    expect((await v.validate("100-xyz", makeContext())).valid).toBe(false);
  });

  it("issues a warning (not an error) when error_level is 'warning'", async () => {
    const v = new MzRangeIntervalValidator({ error_level: "warning" });
    const result = await v.validate("500-100", makeContext());
    expect(result.valid).toBe(true);
    expect(result.issues[0].level).toBe("warning");
  });

  it("includes value and column name in the issue", async () => {
    const v = new MzRangeIntervalValidator({});
    const ctx = makeContext();
    const result = await v.validate("bad", ctx);
    expect(result.issues[0].value).toBe("bad");
    expect(result.issues[0].columnName).toBe(ctx.columnDef.name);
    expect(result.issues[0].validatorName).toBe("mz_range_interval");
  });
});
