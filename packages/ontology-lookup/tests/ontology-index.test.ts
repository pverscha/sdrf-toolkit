import { describe, it, expect, beforeEach } from "vitest";
import { OntologyIndex } from "../src/ontology-index.js";
import type { OntologyIndexFile } from "../src/types.js";

const mockIndexFile: OntologyIndexFile = {
  meta: {
    ontology: "test",
    fullName: "Test Ontology",
    defaultPrefix: "TEST",
    additionalPrefixes: [],
    sourceVersion: "1.0",
    sourceUrl: "http://example.com/test.obo",
    builtAt: "2024-01-01T00:00:00Z",
    termCount: 2,
    obsoleteTermCount: 0,
    schemaVersion: "1.0",
  },
  terms: [
    {
      accession: "TEST:001",
      label: "Alpha Beta",
      synonyms: [
        { text: "AB", type: "EXACT" },
        { text: "ab related", type: "RELATED" },
      ],
      parentIds: [],
      obsolete: false,
      replacedBy: [],
      xrefs: ["EXT:001"],
    },
    {
      accession: "TEST:002",
      label: "Gamma",
      synonyms: [],
      parentIds: ["TEST:001"],
      obsolete: false,
      replacedBy: [],
      xrefs: [],
    },
  ],
};

let index: OntologyIndex;

describe("OntologyIndex construction", () => {
  beforeEach(() => {
    index = new OntologyIndex(mockIndexFile);
  });

  it("populates termsById with all terms", () => {
    expect(index.termsById.size).toBe(2);
    expect(index.termsById.get("TEST:001")).toBeDefined();
    expect(index.termsById.get("TEST:002")).toBeDefined();
  });

  it("normalizes labels to lowercase in termsByLabel", () => {
    expect(index.termsByLabel.has("alpha beta")).toBe(true);
    expect(index.termsByLabel.has("gamma")).toBe(true);
    expect(index.termsByLabel.get("alpha beta")).toContain("TEST:001");
    expect(index.termsByLabel.get("gamma")).toContain("TEST:002");
  });

  it("inserts label as EXACT entry in termsBySynonym", () => {
    const entries = index.termsBySynonym.get("alpha beta");
    expect(entries).toBeDefined();
    expect(entries!.some(e => e.accession === "TEST:001" && e.type === "EXACT")).toBe(true);
  });

  it("indexes EXACT synonyms in termsBySynonym", () => {
    const abEntries = index.termsBySynonym.get("ab");
    expect(abEntries).toBeDefined();
    expect(abEntries!.some(e => e.accession === "TEST:001" && e.type === "EXACT")).toBe(true);
  });

  it("indexes RELATED synonyms with correct type", () => {
    const relEntries = index.termsBySynonym.get("ab related");
    expect(relEntries).toBeDefined();
    expect(relEntries!.some(e => e.accession === "TEST:001" && e.type === "RELATED")).toBe(true);
  });

  it("indexes xrefs in termsByXref", () => {
    const xrefEntries = index.termsByXref.get("EXT:001");
    expect(xrefEntries).toBeDefined();
    expect(xrefEntries).toContain("TEST:001");
  });

  it("does not duplicate label in termsBySynonym on reconstruction", () => {
    // Label "alpha beta" inserted once as EXACT
    const entries = index.termsBySynonym.get("alpha beta") ?? [];
    const exactCount = entries.filter(e => e.accession === "TEST:001" && e.type === "EXACT").length;
    expect(exactCount).toBe(1);
  });
});

describe("OntologyIndex lazy structures", () => {
  beforeEach(() => {
    index = new OntologyIndex(mockIndexFile);
  });

  it("getChildrenOf builds children map correctly", () => {
    const childrenOf = index.getChildrenOf();
    expect(childrenOf.get("TEST:001")).toContain("TEST:002");
  });

  it("getChildrenOf returns same map on subsequent calls (lazy caching)", () => {
    const first = index.getChildrenOf();
    const second = index.getChildrenOf();
    expect(first).toBe(second);
  });

  it("getPrefixEntries includes both labels and synonyms", () => {
    const entries = index.getPrefixEntries();
    const texts = entries.map(e => e.text);
    expect(texts).toContain("alpha beta");
    expect(texts).toContain("ab");
    expect(texts).toContain("gamma");
  });

  it("getPrefixEntries are sorted lexicographically", () => {
    const entries = index.getPrefixEntries();
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].text.localeCompare(entries[i - 1].text)).toBeGreaterThanOrEqual(0);
    }
  });

  it("getPrefixEntries marks label entries correctly", () => {
    const entries = index.getPrefixEntries();
    const labelEntry = entries.find(e => e.text === "alpha beta");
    expect(labelEntry?.isLabel).toBe(true);
    const synEntry = entries.find(e => e.text === "ab");
    expect(synEntry?.isLabel).toBe(false);
  });

  it("getPrefixEntries returns same array on subsequent calls (lazy caching)", () => {
    const first = index.getPrefixEntries();
    const second = index.getPrefixEntries();
    expect(first).toBe(second);
  });

  it("getAllTerms returns all terms", () => {
    expect(index.getAllTerms().length).toBe(2);
  });
});
