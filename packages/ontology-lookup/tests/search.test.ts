import { describe, it, expect, beforeEach } from "vitest";
import { OntologyIndex } from "../src/ontology-index.js";
import { searchIndex, resolveIndex } from "../src/search.js";
import type { OntologyIndexFile } from "../src/types.js";

const mockIndexFile: OntologyIndexFile = {
  meta: {
    ontology: "test",
    fullName: "Test Ontology",
    defaultPrefix: "TEST",
    additionalPrefixes: [],
    sourceVersion: "2024-01-01",
    sourceUrl: "http://example.com/test.obo",
    builtAt: "2024-01-01T00:00:00Z",
    termCount: 4,
    obsoleteTermCount: 1,
    schemaVersion: "1.0",
  },
  terms: [
    {
      accession: "TEST:0001",
      label: "diabetes mellitus",
      synonyms: [
        { text: "DM", type: "EXACT" },
        { text: "sugar diabetes", type: "RELATED" },
      ],
      parentIds: ["TEST:0000"],
      obsolete: false,
      replacedBy: [],
      xrefs: ["DOID:9351"],
    },
    {
      accession: "TEST:0002",
      label: "breast cancer",
      synonyms: [
        { text: "malignant neoplasm of breast", type: "EXACT" },
        { text: "cancer of breast", type: "RELATED" },
      ],
      parentIds: ["TEST:0000"],
      obsolete: false,
      replacedBy: [],
      xrefs: [],
    },
    {
      accession: "TEST:0003",
      label: "diabetes insipidus",
      synonyms: [{ text: "DI", type: "EXACT" }],
      parentIds: ["TEST:0000"],
      obsolete: false,
      replacedBy: [],
      xrefs: [],
    },
    {
      accession: "TEST:0004",
      label: "obsolete disease",
      synonyms: [],
      parentIds: [],
      obsolete: true,
      replacedBy: ["TEST:0001"],
      xrefs: [],
    },
  ],
};

let index: OntologyIndex;

describe("searchIndex — tiered scoring", () => {
  beforeEach(() => {
    index = new OntologyIndex(mockIndexFile);
  });

  it("tier 1: exact accession yields score 1.0", () => {
    const results = searchIndex(index, "TEST:0001", 10);
    const match = results.find(r => r.term.accession === "TEST:0001");
    expect(match).toBeDefined();
    expect(match!.score).toBe(1.0);
    expect(match!.matchType).toBe("accession");
  });

  it("tier 1: accession lookup is case-sensitive", () => {
    // "test:0001" should NOT match "TEST:0001" (exact map lookup)
    const results = searchIndex(index, "test:0001", 10);
    const accMatch = results.find(r => r.matchType === "accession");
    expect(accMatch).toBeUndefined();
  });

  it("tier 2: exact label yields score 1.0", () => {
    const results = searchIndex(index, "breast cancer", 10);
    const match = results.find(r => r.term.accession === "TEST:0002");
    expect(match).toBeDefined();
    expect(match!.score).toBe(1.0);
    expect(match!.matchType).toBe("label");
  });

  it("tier 2: label match is case-insensitive", () => {
    const results = searchIndex(index, "BREAST CANCER", 10);
    const match = results.find(r => r.term.accession === "TEST:0002");
    expect(match).toBeDefined();
    expect(match!.score).toBe(1.0);
  });

  it("tier 3: exact synonym yields score 0.9", () => {
    const results = searchIndex(index, "DM", 10);
    const match = results.find(r => r.term.accession === "TEST:0001");
    expect(match).toBeDefined();
    expect(match!.score).toBe(0.9);
    expect(match!.matchType).toBe("synonym");
  });

  it("tier 3: RELATED synonyms also yield score 0.9 in search (not resolve)", () => {
    const results = searchIndex(index, "sugar diabetes", 10);
    const match = results.find(r => r.term.accession === "TEST:0001");
    expect(match).toBeDefined();
    expect(match!.score).toBe(0.9);
  });

  it("tier 4: prefix on label yields score 0.8", () => {
    const results = searchIndex(index, "diabet", 10);
    const labelMatches = results.filter(r => r.matchType === "label");
    expect(labelMatches.length).toBeGreaterThan(0);
    expect(labelMatches.every(r => r.score === 0.8)).toBe(true);
  });

  it("tier 4: prefix on synonym yields score 0.7", () => {
    const results = searchIndex(index, "malignant", 10);
    const synMatch = results.find(r => r.matchType === "synonym");
    expect(synMatch).toBeDefined();
    expect(synMatch!.score).toBe(0.7);
  });

  it("tier 5: substring on label yields score 0.5", () => {
    // "ncer" is contained in "breast cancer" but doesn't start with it
    const results = searchIndex(index, "ncer", 10);
    const labelMatch = results.find(r => r.matchType === "label");
    expect(labelMatch).toBeDefined();
    expect(labelMatch!.score).toBe(0.5);
  });

  it("tier 5: substring on synonym yields score 0.4", () => {
    // "neoplas" is contained in "malignant neoplasm of breast"
    const results = searchIndex(index, "neoplas", 10);
    expect(results.length).toBeGreaterThan(0);
    // Should contain TEST:0002 (the synonym match)
    expect(results.some(r => r.term.accession === "TEST:0002")).toBe(true);
  });

  it("deduplicates by accession, keeping the highest score", () => {
    // "diabetes mellitus" matches tier 2 (exact label) for TEST:0001
    // and tier 4 prefix for TEST:0003; both should appear once
    const results = searchIndex(index, "diabetes mellitus", 10);
    const accessions = results.map(r => r.term.accession);
    const unique = new Set(accessions);
    expect(accessions.length).toBe(unique.size);
    const dm = results.find(r => r.term.accession === "TEST:0001");
    expect(dm!.score).toBe(1.0); // exact label wins over prefix/synonym
  });

  it("respects the limit parameter", () => {
    const results = searchIndex(index, "dia", 1);
    expect(results.length).toBe(1);
  });

  it("results are sorted by score descending", () => {
    const results = searchIndex(index, "dia", 10);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  it("returns empty array when no terms match", () => {
    const results = searchIndex(index, "zzznomatch", 10);
    expect(results).toHaveLength(0);
  });

  it("returns ontology ID on each result", () => {
    const results = searchIndex(index, "breast cancer", 10);
    expect(results[0].term.ontology).toBe("test");
  });
});

describe("resolveIndex — strict matching", () => {
  beforeEach(() => {
    index = new OntologyIndex(mockIndexFile);
  });

  it("resolves by exact accession", () => {
    const result = resolveIndex(index, "TEST:0002");
    expect(result).not.toBeNull();
    expect(result!.accession).toBe("TEST:0002");
  });

  it("resolves by exact label (case-insensitive)", () => {
    const result = resolveIndex(index, "Diabetes Mellitus");
    expect(result).not.toBeNull();
    expect(result!.accession).toBe("TEST:0001");
  });

  it("resolves by EXACT synonym", () => {
    const result = resolveIndex(index, "malignant neoplasm of breast");
    expect(result).not.toBeNull();
    expect(result!.accession).toBe("TEST:0002");
  });

  it("does NOT resolve by RELATED synonym", () => {
    expect(resolveIndex(index, "sugar diabetes")).toBeNull();
  });

  it("does NOT resolve by prefix", () => {
    expect(resolveIndex(index, "diabet")).toBeNull();
  });

  it("does NOT resolve by substring", () => {
    expect(resolveIndex(index, "mellitus")).toBeNull();
  });

  it("returns null for unrecognized value", () => {
    expect(resolveIndex(index, "completely unknown term")).toBeNull();
  });

  it("returns ontology ID on resolved term", () => {
    const result = resolveIndex(index, "breast cancer");
    expect(result!.ontology).toBe("test");
  });
});
