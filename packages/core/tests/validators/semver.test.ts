import { describe, it, expect } from "vitest";
import { SemverValidator } from "../../src/validation/validators/semver.js";
import { makeContext } from "./helpers.js";

describe("SemverValidator", () => {
  describe("core semver (MAJOR.MINOR.PATCH)", () => {
    const v = new SemverValidator({});

    it("accepts valid semver strings", async () => {
      for (const val of ["1.0.0", "2.3.4", "0.0.1", "10.20.30"]) {
        expect((await v.validate(val, makeContext())).valid, `Expected "${val}" to be valid`).toBe(true);
      }
    });

    it("rejects missing patch component", async () => {
      expect((await v.validate("1.0", makeContext())).valid).toBe(false);
    });

    it("rejects single component", async () => {
      expect((await v.validate("1", makeContext())).valid).toBe(false);
    });

    it("rejects four-component versions", async () => {
      expect((await v.validate("1.0.0.0", makeContext())).valid).toBe(false);
    });

    it("rejects non-numeric components", async () => {
      expect((await v.validate("abc", makeContext())).valid).toBe(false);
      expect((await v.validate("1.x.0", makeContext())).valid).toBe(false);
    });

    it("rejects empty string", async () => {
      expect((await v.validate("", makeContext())).valid).toBe(false);
    });
  });

  describe("prefix stripping", () => {
    const v = new SemverValidator({ prefix: "v" });

    it("accepts version string with the configured prefix", async () => {
      expect((await v.validate("v1.2.3", makeContext())).valid).toBe(true);
    });

    it("accepts bare version string (prefix not mandatory)", async () => {
      expect((await v.validate("1.2.3", makeContext())).valid).toBe(true);
    });

    it("rejects an invalid version even after prefix stripping", async () => {
      expect((await v.validate("v1.2", makeContext())).valid).toBe(false);
    });

    it("does not strip a different prefix", async () => {
      const v2 = new SemverValidator({ prefix: "ver-" });
      expect((await v2.validate("ver-1.0.0", makeContext())).valid).toBe(true);
      expect((await v2.validate("v1.0.0", makeContext())).valid).toBe(false); // "v" remains → "v1.0.0" invalid
    });
  });

  describe("prerelease support", () => {
    it("rejects prerelease versions by default", async () => {
      const v = new SemverValidator({});
      expect((await v.validate("1.0.0-alpha", makeContext())).valid).toBe(false);
      expect((await v.validate("1.0.0-beta.1", makeContext())).valid).toBe(false);
    });

    it("accepts prerelease versions when allow_prerelease is true", async () => {
      const v = new SemverValidator({ allow_prerelease: true });
      expect((await v.validate("1.0.0-alpha.1", makeContext())).valid).toBe(true);
      expect((await v.validate("1.0.0-beta", makeContext())).valid).toBe(true);
      expect((await v.validate("2.1.0-rc.3", makeContext())).valid).toBe(true);
    });

    it("still accepts stable versions when allow_prerelease is true", async () => {
      const v = new SemverValidator({ allow_prerelease: true });
      expect((await v.validate("1.0.0", makeContext())).valid).toBe(true);
    });
  });

  it("issues a warning (not an error) when error_level is 'warning'", async () => {
    const v = new SemverValidator({ error_level: "warning" });
    const result = await v.validate("bad", makeContext());
    expect(result.valid).toBe(true);
    expect(result.issues[0].level).toBe("warning");
  });

  it("includes value and column name in the issue", async () => {
    const v = new SemverValidator({});
    const ctx = makeContext();
    const result = await v.validate("bad", ctx);
    expect(result.issues[0].value).toBe("bad");
    expect(result.issues[0].columnName).toBe(ctx.columnDef.name);
    expect(result.issues[0].validatorName).toBe("semver");
  });
});
