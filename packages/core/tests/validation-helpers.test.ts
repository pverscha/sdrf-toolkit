import { describe, it, expect } from "vitest";
import { checkSpecialValue } from "../src/validation/helpers.js";
import type { ColumnDefinition } from "../src/types/template.js";

function makeCol(overrides: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return {
    name: "test col",
    description: "",
    requirement: "required",
    cardinality: "single",
    allowNotApplicable: false,
    allowNotAvailable: false,
    allowAnonymized: false,
    allowPooled: false,
    allowNorm: false,
    validators: [],
    sourceTemplate: "base",
    ...overrides,
  };
}

describe("checkSpecialValue", () => {
  it("returns null for non-special values", () => {
    expect(checkSpecialValue("breast cancer", makeCol())).toBeNull();
    expect(checkSpecialValue("", makeCol())).toBeNull();
    expect(checkSpecialValue("Homo sapiens", makeCol())).toBeNull();
  });

  it("returns valid=true when 'not applicable' is allowed", () => {
    const col = makeCol({ allowNotApplicable: true });
    const result = checkSpecialValue("not applicable", col);
    expect(result).not.toBeNull();
    expect(result!.valid).toBe(true);
    expect(result!.issues).toHaveLength(0);
  });

  it("returns valid=false when 'not applicable' is not allowed", () => {
    const col = makeCol({ allowNotApplicable: false });
    const result = checkSpecialValue("not applicable", col);
    expect(result).not.toBeNull();
    expect(result!.valid).toBe(false);
    expect(result!.issues[0].level).toBe("error");
  });

  it("is case-insensitive for special values", () => {
    const col = makeCol({ allowNotAvailable: true });
    expect(checkSpecialValue("NOT AVAILABLE", col)!.valid).toBe(true);
    expect(checkSpecialValue("Not Available", col)!.valid).toBe(true);
  });

  it("handles 'anonymized' and 'pooled'", () => {
    const col = makeCol({ allowAnonymized: true, allowPooled: false });
    expect(checkSpecialValue("anonymized", col)!.valid).toBe(true);
    expect(checkSpecialValue("pooled", col)!.valid).toBe(false);
  });

  it("returns valid=true when 'norm' is allowed", () => {
    const col = makeCol({ allowNorm: true });
    const result = checkSpecialValue("norm", col);
    expect(result).not.toBeNull();
    expect(result!.valid).toBe(true);
  });

  it("returns valid=false when 'norm' is not allowed", () => {
    const col = makeCol({ allowNorm: false });
    const result = checkSpecialValue("norm", col);
    expect(result).not.toBeNull();
    expect(result!.valid).toBe(false);
  });
});
