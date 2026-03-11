import { describe, it, expect } from "vitest";
import { StructuredKvValidator } from "../../src/validation/validators/structured-kv.js";
import { makeContext } from "./helpers.js";

describe("StructuredKvValidator", () => {
  const modificationValidator = new StructuredKvValidator({
    separator: ";",
    fields: [
      { key: "NT", value: ".+" },
      { key: "AC", value: "UNIMOD:\\d+" },
      { key: "MM", value: "\\d+\\.\\d+" },
    ],
  });

  describe("valid inputs", () => {
    it("accepts a fully valid structured value", async () => {
      const result = await modificationValidator.validate(
        "NT=Oxidation;AC=UNIMOD:21;MM=15.9949",
        makeContext()
      );
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it("accepts values with extra (unknown) fields", async () => {
      const result = await modificationValidator.validate(
        "NT=Oxidation;AC=UNIMOD:21;MM=15.9949;EXTRA=whatever",
        makeContext()
      );
      expect(result.valid).toBe(true);
    });

    it("accepts a single-field structure", async () => {
      const v = new StructuredKvValidator({
        separator: ";",
        fields: [{ key: "NT", value: ".+" }],
      });
      const result = await v.validate("NT=Phosphorylation", makeContext());
      expect(result.valid).toBe(true);
    });
  });

  describe("missing required fields", () => {
    it("reports an error when one required field is missing", async () => {
      const result = await modificationValidator.validate(
        "NT=Oxidation;AC=UNIMOD:21",
        makeContext()
      );
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.message.includes("MM"))).toBe(true);
    });

    it("reports separate errors for each missing field", async () => {
      const result = await modificationValidator.validate("NT=Oxidation", makeContext());
      expect(result.valid).toBe(false);
      const missingKeys = result.issues.map(i => i.message).join(" ");
      expect(missingKeys).toMatch(/AC/);
      expect(missingKeys).toMatch(/MM/);
    });

    it("reports an error when all fields are missing", async () => {
      const result = await modificationValidator.validate("", makeContext());
      expect(result.valid).toBe(false);
      expect(result.issues).toHaveLength(3);
    });
  });

  describe("field value pattern mismatch", () => {
    it("rejects when a field value does not match its pattern", async () => {
      const result = await modificationValidator.validate(
        "NT=Oxidation;AC=CHEBI:21;MM=15.9949",
        makeContext()
      );
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.message.includes("AC"))).toBe(true);
    });

    it("rejects when the MM field is not a decimal number", async () => {
      const result = await modificationValidator.validate(
        "NT=Oxidation;AC=UNIMOD:21;MM=not-a-number",
        makeContext()
      );
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.message.includes("MM"))).toBe(true);
    });

    it("reports multiple field errors at once", async () => {
      const result = await modificationValidator.validate(
        "NT=Oxidation;AC=WRONG;MM=also-wrong",
        makeContext()
      );
      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("separator variants", () => {
    it("works with comma separator", async () => {
      const v = new StructuredKvValidator({
        separator: ",",
        fields: [
          { key: "A", value: "\\d+" },
          { key: "B", value: "[a-z]+" },
        ],
      });
      expect((await v.validate("A=1,B=abc", makeContext())).valid).toBe(true);
      expect((await v.validate("A=1;B=abc", makeContext())).valid).toBe(false);
    });

    it("works with pipe separator", async () => {
      const v = new StructuredKvValidator({
        separator: "|",
        fields: [{ key: "X", value: ".+" }],
      });
      expect((await v.validate("X=hello|extra=ignored", makeContext())).valid).toBe(true);
    });
  });

  it("issues warnings (not errors) when error_level is 'warning'", async () => {
    const v = new StructuredKvValidator({
      separator: ";",
      fields: [{ key: "NT", value: ".+" }],
      error_level: "warning",
    });
    const result = await v.validate("AC=UNIMOD:21", makeContext());
    expect(result.valid).toBe(true);
    expect(result.issues[0].level).toBe("warning");
  });

  it("includes value and column name in each issue", async () => {
    const ctx = makeContext();
    const result = await modificationValidator.validate("NT=Oxidation", ctx);
    for (const issue of result.issues) {
      expect(issue.value).toBe("NT=Oxidation");
      expect(issue.columnName).toBe(ctx.columnDef.name);
      expect(issue.validatorName).toBe("structured_kv");
    }
  });
});
