import { describe, it, expect } from "vitest";
import { satisfiesConstraint } from "../src/templates/semver-utils.js";

describe("satisfiesConstraint", () => {
  // Exact match
  it("accepts an exact matching version", () => {
    expect(satisfiesConstraint("1.1.0", "1.1.0")).toBe(true);
  });

  it("rejects a non-matching version for exact constraint", () => {
    expect(satisfiesConstraint("1.2.0", "1.1.0")).toBe(false);
    expect(satisfiesConstraint("1.0.0", "1.1.0")).toBe(false);
  });

  // >= lower bound
  it("accepts a version equal to the lower bound", () => {
    expect(satisfiesConstraint("1.1.0", ">=1.1.0")).toBe(true);
  });

  it("accepts a version above the lower bound", () => {
    expect(satisfiesConstraint("2.0.0", ">=1.1.0")).toBe(true);
    expect(satisfiesConstraint("1.2.0", ">=1.1.0")).toBe(true);
    expect(satisfiesConstraint("1.1.1", ">=1.1.0")).toBe(true);
  });

  it("rejects a version below the lower bound", () => {
    expect(satisfiesConstraint("1.0.0", ">=1.1.0")).toBe(false);
    expect(satisfiesConstraint("0.9.9", ">=1.1.0")).toBe(false);
  });

  // >=,< compound
  it("accepts a version within the range", () => {
    expect(satisfiesConstraint("1.1.0", ">=1.1.0,<2.0.0")).toBe(true);
    expect(satisfiesConstraint("1.5.3", ">=1.1.0,<2.0.0")).toBe(true);
    expect(satisfiesConstraint("1.9.9", ">=1.1.0,<2.0.0")).toBe(true);
  });

  it("rejects a version at or above the upper bound", () => {
    expect(satisfiesConstraint("2.0.0", ">=1.1.0,<2.0.0")).toBe(false);
    expect(satisfiesConstraint("3.0.0", ">=1.1.0,<2.0.0")).toBe(false);
  });

  it("rejects a version below the lower bound of a range", () => {
    expect(satisfiesConstraint("1.0.0", ">=1.1.0,<2.0.0")).toBe(false);
  });

  // > strict lower bound
  it("handles strict > operator", () => {
    expect(satisfiesConstraint("1.1.1", ">1.1.0")).toBe(true);
    expect(satisfiesConstraint("1.1.0", ">1.1.0")).toBe(false);
  });

  // <= upper bound
  it("handles <= operator", () => {
    expect(satisfiesConstraint("1.0.0", "<=1.1.0")).toBe(true);
    expect(satisfiesConstraint("1.1.0", "<=1.1.0")).toBe(true);
    expect(satisfiesConstraint("1.2.0", "<=1.1.0")).toBe(false);
  });
});
