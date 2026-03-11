import { describe, it, expect } from "vitest";
import { DateValidator } from "../../src/validation/validators/date.js";
import { makeContext } from "./helpers.js";

describe("DateValidator", () => {
  describe("default precision (year | month | day)", () => {
    const v = new DateValidator({});

    it("accepts year-precision dates (YYYY)", async () => {
      expect((await v.validate("2020", makeContext())).valid).toBe(true);
      expect((await v.validate("1999", makeContext())).valid).toBe(true);
    });

    it("accepts month-precision dates (YYYY-MM)", async () => {
      expect((await v.validate("2020-06", makeContext())).valid).toBe(true);
      expect((await v.validate("2023-01", makeContext())).valid).toBe(true);
    });

    it("accepts day-precision dates (YYYY-MM-DD)", async () => {
      expect((await v.validate("2020-06-15", makeContext())).valid).toBe(true);
      expect((await v.validate("1999-12-31", makeContext())).valid).toBe(true);
    });

    it("rejects non-ISO formats", async () => {
      expect((await v.validate("15/06/2020", makeContext())).valid).toBe(false);
      expect((await v.validate("06-2020", makeContext())).valid).toBe(false);
      expect((await v.validate("June 2020", makeContext())).valid).toBe(false);
      expect((await v.validate("20200615", makeContext())).valid).toBe(false);
    });

    it("rejects empty string", async () => {
      expect((await v.validate("", makeContext())).valid).toBe(false);
    });
  });

  describe("precision: ['year']", () => {
    const v = new DateValidator({ precision: ["year"] });

    it("accepts year-only dates", async () => {
      expect((await v.validate("2020", makeContext())).valid).toBe(true);
    });

    it("rejects month-precision dates", async () => {
      expect((await v.validate("2020-06", makeContext())).valid).toBe(false);
    });

    it("rejects day-precision dates", async () => {
      expect((await v.validate("2020-06-15", makeContext())).valid).toBe(false);
    });
  });

  describe("precision: ['month']", () => {
    const v = new DateValidator({ precision: ["month"] });

    it("accepts month-precision dates", async () => {
      expect((await v.validate("2020-06", makeContext())).valid).toBe(true);
    });

    it("rejects year-only dates", async () => {
      expect((await v.validate("2020", makeContext())).valid).toBe(false);
    });

    it("rejects day-precision dates", async () => {
      expect((await v.validate("2020-06-15", makeContext())).valid).toBe(false);
    });
  });

  describe("precision: ['day']", () => {
    const v = new DateValidator({ precision: ["day"] });

    it("accepts day-precision dates", async () => {
      expect((await v.validate("2020-06-15", makeContext())).valid).toBe(true);
    });

    it("rejects year-only dates", async () => {
      expect((await v.validate("2020", makeContext())).valid).toBe(false);
    });

    it("rejects month-precision dates", async () => {
      expect((await v.validate("2020-06", makeContext())).valid).toBe(false);
    });
  });

  describe("precision: ['year', 'day'] (skipping month)", () => {
    const v = new DateValidator({ precision: ["year", "day"] });

    it("accepts year-precision dates", async () => {
      expect((await v.validate("2020", makeContext())).valid).toBe(true);
    });

    it("accepts day-precision dates", async () => {
      expect((await v.validate("2020-06-15", makeContext())).valid).toBe(true);
    });

    it("rejects month-precision dates", async () => {
      expect((await v.validate("2020-06", makeContext())).valid).toBe(false);
    });
  });

  it("issues a warning (not an error) when error_level is 'warning'", async () => {
    const v = new DateValidator({ error_level: "warning" });
    const result = await v.validate("not-a-date", makeContext());
    expect(result.valid).toBe(true);
    expect(result.issues[0].level).toBe("warning");
  });

  it("includes value and column name in the issue", async () => {
    const v = new DateValidator({});
    const ctx = makeContext();
    const result = await v.validate("bad", ctx);
    expect(result.issues[0].value).toBe("bad");
    expect(result.issues[0].columnName).toBe(ctx.columnDef.name);
    expect(result.issues[0].validatorName).toBe("date");
  });
});
