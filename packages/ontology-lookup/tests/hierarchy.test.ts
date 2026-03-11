import { describe, it, expect, beforeEach } from "vitest";
import { OntologyIndex } from "../src/ontology-index.js";
import { isDescendantOf, getDescendants } from "../src/hierarchy.js";
import type { OntologyIndexFile } from "../src/types.js";

// DAG structure used in tests:
//
//   ROOT
//   ├── A
//   │   ├── B
//   │   │   └── D  ←── multiple parents (B and X)
//   │   └── C
//   └── X
//       └── D
//
const mockIndexFile: OntologyIndexFile = {
  meta: {
    ontology: "test",
    fullName: "Test",
    defaultPrefix: "TEST",
    additionalPrefixes: [],
    sourceVersion: "1.0",
    sourceUrl: "http://example.com",
    builtAt: "2024-01-01T00:00:00Z",
    termCount: 6,
    obsoleteTermCount: 0,
    schemaVersion: "1.0",
  },
  terms: [
    { accession: "ROOT", label: "root", synonyms: [], parentIds: [], obsolete: false, replacedBy: [], xrefs: [] },
    { accession: "A", label: "A", synonyms: [], parentIds: ["ROOT"], obsolete: false, replacedBy: [], xrefs: [] },
    { accession: "B", label: "B", synonyms: [], parentIds: ["A"], obsolete: false, replacedBy: [], xrefs: [] },
    { accession: "C", label: "C", synonyms: [], parentIds: ["A"], obsolete: false, replacedBy: [], xrefs: [] },
    { accession: "X", label: "X", synonyms: [], parentIds: ["ROOT"], obsolete: false, replacedBy: [], xrefs: [] },
    { accession: "D", label: "D", synonyms: [], parentIds: ["B", "X"], obsolete: false, replacedBy: [], xrefs: [] },
  ],
};

let index: OntologyIndex;

describe("isDescendantOf", () => {
  beforeEach(() => {
    index = new OntologyIndex(mockIndexFile);
  });

  it("returns true for a direct parent relationship", () => {
    expect(isDescendantOf(index, "A", "ROOT")).toBe(true);
  });

  it("returns true for a two-hop ancestor", () => {
    expect(isDescendantOf(index, "B", "ROOT")).toBe(true);
  });

  it("returns true for a three-hop ancestor", () => {
    expect(isDescendantOf(index, "D", "ROOT")).toBe(true);
  });

  it("returns true via one parent path in a multi-parent DAG", () => {
    expect(isDescendantOf(index, "D", "B")).toBe(true);
    expect(isDescendantOf(index, "D", "X")).toBe(true);
  });

  it("returns true traversing through A via B path", () => {
    expect(isDescendantOf(index, "D", "A")).toBe(true);
  });

  it("returns false when the relationship is inverted (parent is not descendant of child)", () => {
    expect(isDescendantOf(index, "ROOT", "A")).toBe(false);
    expect(isDescendantOf(index, "A", "B")).toBe(false);
  });

  it("returns false for unrelated terms on different branches", () => {
    expect(isDescendantOf(index, "C", "X")).toBe(false);
    expect(isDescendantOf(index, "C", "B")).toBe(false);
  });

  it("returns false when a term is compared to itself", () => {
    expect(isDescendantOf(index, "A", "A")).toBe(false);
    expect(isDescendantOf(index, "ROOT", "ROOT")).toBe(false);
  });

  it("returns false for a non-existent child term", () => {
    expect(isDescendantOf(index, "MISSING", "ROOT")).toBe(false);
  });

  it("returns false for a non-existent ancestor", () => {
    expect(isDescendantOf(index, "A", "MISSING")).toBe(false);
  });
});

describe("getDescendants", () => {
  beforeEach(() => {
    index = new OntologyIndex(mockIndexFile);
  });

  it("returns all descendants of ROOT", () => {
    const result = new Set(getDescendants(index, "ROOT"));
    expect(result).toEqual(new Set(["A", "B", "C", "X", "D"]));
  });

  it("returns descendants of A (B, C, and D)", () => {
    const result = new Set(getDescendants(index, "A"));
    expect(result).toEqual(new Set(["B", "C", "D"]));
  });

  it("returns descendants of X (only D)", () => {
    const result = new Set(getDescendants(index, "X"));
    expect(result).toEqual(new Set(["D"]));
  });

  it("returns empty array for a leaf node", () => {
    expect(getDescendants(index, "D")).toEqual([]);
    expect(getDescendants(index, "C")).toEqual([]);
  });

  it("does NOT include the parent itself in the result", () => {
    const descendants = getDescendants(index, "A");
    expect(descendants).not.toContain("A");
  });

  it("handles DAG — D appears only once even though reachable via B and X", () => {
    const descendants = getDescendants(index, "ROOT");
    const dCount = descendants.filter(d => d === "D").length;
    expect(dCount).toBe(1);
  });

  it("returns empty array for a non-existent term", () => {
    expect(getDescendants(index, "MISSING")).toEqual([]);
  });
});
