import { describe, it, expect } from "vitest";
import { IdentifierValidator } from "../../src/validation/validators/identifier.js";
import { makeContext } from "./helpers.js";

describe("IdentifierValidator", () => {
  describe("special values", () => {
    it("accepts listed special values regardless of charset", async () => {
      const v = new IdentifierValidator({
        charset: "[A-Za-z0-9]",
        special_values: ["carrier", "reference", "empty"],
      });
      for (const sv of ["carrier", "reference", "empty"]) {
        expect((await v.validate(sv, makeContext())).valid, `Expected "${sv}" to be valid`).toBe(true);
      }
    });

    it("does not bypass charset for values not in the special list", async () => {
      const v = new IdentifierValidator({
        charset: "[A-Za-z0-9]",
        special_values: ["carrier"],
      });
      expect((await v.validate("sample 01", makeContext())).valid).toBe(false);
    });
  });

  describe("charset validation", () => {
    const v = new IdentifierValidator({ charset: "[A-Za-z0-9_-]" });

    it("accepts values composed entirely of allowed characters", async () => {
      expect((await v.validate("sample_01", makeContext())).valid).toBe(true);
      expect((await v.validate("ID-001", makeContext())).valid).toBe(true);
      expect((await v.validate("ABC", makeContext())).valid).toBe(true);
    });

    it("rejects values containing characters outside the charset", async () => {
      const result = await v.validate("sample 01", makeContext()); // space not allowed
      expect(result.valid).toBe(false);
      expect(result.issues[0].level).toBe("error");
      expect(result.issues[0].validatorName).toBe("identifier");
    });

    it("rejects values with special characters not in charset", async () => {
      expect((await v.validate("sample@01", makeContext())).valid).toBe(false);
      expect((await v.validate("val/ue", makeContext())).valid).toBe(false);
    });
  });

  describe("no charset", () => {
    const v = new IdentifierValidator({});

    it("accepts any value when no charset is configured", async () => {
      expect((await v.validate("anything goes", makeContext())).valid).toBe(true);
      expect((await v.validate("!@#$%^&*()", makeContext())).valid).toBe(true);
      expect((await v.validate("", makeContext())).valid).toBe(true);
    });
  });

  it("issues a warning (not an error) when error_level is 'warning'", async () => {
    const v = new IdentifierValidator({ charset: "[A-Z]", error_level: "warning" });
    const result = await v.validate("abc", makeContext());
    expect(result.valid).toBe(true);
    expect(result.issues[0].level).toBe("warning");
  });

  it("includes value and column name in the issue", async () => {
    const v = new IdentifierValidator({ charset: "[0-9]" });
    const ctx = makeContext();
    const result = await v.validate("abc", ctx);
    expect(result.issues[0].value).toBe("abc");
    expect(result.issues[0].columnName).toBe(ctx.columnDef.name);
  });
});
