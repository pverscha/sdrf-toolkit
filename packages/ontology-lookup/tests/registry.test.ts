import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { OntologyRegistry } from "../src/registry.js";
import {OntologyIndexFile, OntologyTermEntry} from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIndexFile(
  id: string,
  terms: OntologyTermEntry[] = []
): OntologyIndexFile {
  return {
    meta: {
      ontology: id,
      fullName: `${id} Ontology`,
      defaultPrefix: id.toUpperCase(),
      additionalPrefixes: [],
      sourceVersion: "2024-01-01",
      sourceUrl: `http://example.com/${id}.obo`,
      builtAt: "2024-01-01T00:00:00Z",
      termCount: terms.length,
      obsoleteTermCount: 0,
      schemaVersion: "1.0",
    },
    terms,
  };
}

function writeGzipped(dir: string, fileName: string, indexFile: OntologyIndexFile): void {
  const json = JSON.stringify(indexFile);
  const compressed = gzipSync(Buffer.from(json, "utf8"));
  writeFileSync(join(dir, fileName), compressed);
}

const testTerms: OntologyTermEntry[] = [
  {
    accession: "TEST:0001",
    label: "diabetes mellitus",
    synonyms: [{ text: "DM", type: "EXACT" }],
    parentIds: [],
    obsolete: false,
    replacedBy: [],
    xrefs: [],
  },
  {
    accession: "TEST:0002",
    label: "type 2 diabetes",
    synonyms: [{ text: "T2DM", type: "EXACT" }],
    parentIds: ["TEST:0001"],
    obsolete: false,
    replacedBy: [],
    xrefs: [],
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let tmpDir: string;

describe("OntologyRegistry", () => {
  beforeEach(() => {
    tmpDir = join(tmpdir(), `ontology-registry-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    writeGzipped(tmpDir, "test.json.gz", makeIndexFile("test", testTerms));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // initialize()
  // -------------------------------------------------------------------------

  it("loads specified ontology on initialize()", async () => {
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
    await registry.initialize();
    expect(registry.isLoaded("test")).toBe(true);
  });

  it("getLoadedOntologies returns loaded IDs", async () => {
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
    await registry.initialize();
    expect(registry.getLoadedOntologies()).toContain("test");
  });

  it("auto-discovers *.json.gz when no ontologies option given", async () => {
    const registry = new OntologyRegistry({ indexDir: tmpDir });
    await registry.initialize();
    expect(registry.isLoaded("test")).toBe(true);
  });

  it("loads multiple ontologies", async () => {
    writeGzipped(tmpDir, "other.json.gz", makeIndexFile("other", []));
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test", "other"] });
    await registry.initialize();
    expect(registry.isLoaded("test")).toBe(true);
    expect(registry.isLoaded("other")).toBe(true);
  });

  it("skips missing index file with a warning (does not throw)", async () => {
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["nonexistent"] });
    await expect(registry.initialize()).resolves.not.toThrow();
    expect(registry.isLoaded("nonexistent")).toBe(false);
  });

  it("returns false for isLoaded before initialize", () => {
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
    expect(registry.isLoaded("test")).toBe(false);
  });

  it("loads variant index when variant option is specified", async () => {
    writeGzipped(tmpDir, "test-pruned.json.gz", makeIndexFile("test", testTerms));
    const registry = new OntologyRegistry({
      indexDir: tmpDir,
      ontologies: ["test"],
      ontologyOptions: { test: { variant: "pruned" } },
    });
    await registry.initialize();
    expect(registry.isLoaded("test")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // search()
  // -------------------------------------------------------------------------

  it("returns results when searching loaded ontology", async () => {
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
    await registry.initialize();
    const results = registry.search("diabetes", ["test"]);
    expect(results.length).toBeGreaterThan(0);
  });

  it("results are sorted by score descending", async () => {
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
    await registry.initialize();
    const results = registry.search("diabetes mellitus", ["test"], { limit: 10 });
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  it("respects the limit option in search", async () => {
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
    await registry.initialize();
    const results = registry.search("diabetes", ["test"], { limit: 1 });
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("returns empty array when searching an unloaded ontology", async () => {
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
    await registry.initialize();
    expect(registry.search("diabetes", ["other"])).toEqual([]);
  });

  it("searches across multiple ontologies", async () => {
    writeGzipped(tmpDir, "other.json.gz", makeIndexFile("other", [
      {
        accession: "OTHER:0001",
        label: "diabetes other type",
        synonyms: [],
        parentIds: [],
        obsolete: false,
        replacedBy: [],
        xrefs: [],
      },
    ]));
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test", "other"] });
    await registry.initialize();
    const results = registry.search("diabetes", ["test", "other"]);
    const ontologies = new Set(results.map(r => r.term.ontology));
    expect(ontologies.has("test")).toBe(true);
    expect(ontologies.has("other")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // resolve()
  // -------------------------------------------------------------------------

  it("resolves exact label", async () => {
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
    await registry.initialize();
    const term = registry.resolve("diabetes mellitus", ["test"]);
    expect(term).not.toBeNull();
    expect(term!.accession).toBe("TEST:0001");
  });

  it("resolves by accession", async () => {
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
    await registry.initialize();
    const term = registry.resolve("TEST:0002", ["test"]);
    expect(term).not.toBeNull();
    expect(term!.label).toBe("type 2 diabetes");
  });

  it("resolves by EXACT synonym", async () => {
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
    await registry.initialize();
    const term = registry.resolve("DM", ["test"]);
    expect(term).not.toBeNull();
    expect(term!.accession).toBe("TEST:0001");
  });

  it("returns null when resolve finds no match", async () => {
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
    await registry.initialize();
    expect(registry.resolve("unknown fuzzy term", ["test"])).toBeNull();
  });

  it("resolve checks ontologies in order, returning first match", async () => {
    writeGzipped(tmpDir, "other.json.gz", makeIndexFile("other", [
      {
        accession: "OTHER:0001",
        label: "diabetes mellitus",
        synonyms: [],
        parentIds: [],
        obsolete: false,
        replacedBy: [],
        xrefs: [],
      },
    ]));
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test", "other"] });
    await registry.initialize();
    // "test" is first — should return the TEST: accession
    const term = registry.resolve("diabetes mellitus", ["test", "other"]);
    expect(term!.ontology).toBe("test");
  });

  // -------------------------------------------------------------------------
  // isDescendantOf()
  // -------------------------------------------------------------------------

  it("isDescendantOf returns true for a parent-child pair", async () => {
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
    await registry.initialize();
    expect(registry.isDescendantOf("TEST:0002", "TEST:0001", "test")).toBe(true);
  });

  it("isDescendantOf returns false for non-ancestor", async () => {
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
    await registry.initialize();
    expect(registry.isDescendantOf("TEST:0001", "TEST:0002", "test")).toBe(false);
  });

  it("isDescendantOf returns false for unloaded ontology", async () => {
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
    await registry.initialize();
    expect(registry.isDescendantOf("TEST:0002", "TEST:0001", "other")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // getDescendants()
  // -------------------------------------------------------------------------

  it("getDescendants returns child accessions", async () => {
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
    await registry.initialize();
    const descendants = registry.getDescendants("TEST:0001", "test");
    expect(descendants).toContain("TEST:0002");
  });

  it("getDescendants returns empty array for leaf node", async () => {
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
    await registry.initialize();
    expect(registry.getDescendants("TEST:0002", "test")).toEqual([]);
  });

  it("getDescendants returns empty array for unloaded ontology", async () => {
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
    await registry.initialize();
    expect(registry.getDescendants("TEST:0001", "other")).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // getDirectDescendants()
  // -------------------------------------------------------------------------

  describe("getDirectDescendants()", () => {
    it("returns direct children only", async () => {
      const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
      await registry.initialize();
      const children = registry.getDirectDescendants("TEST:0001", "test");
      expect(children).toContain("TEST:0002");
      expect(children).toHaveLength(1);
    });

    it("does not include grandchildren", async () => {
      const terms: OntologyTermEntry[] = [
        { accession: "T:001", label: "root",       synonyms: [], parentIds: [],        obsolete: false, replacedBy: [], xrefs: [] },
        { accession: "T:002", label: "child",      synonyms: [], parentIds: ["T:001"], obsolete: false, replacedBy: [], xrefs: [] },
        { accession: "T:003", label: "grandchild", synonyms: [], parentIds: ["T:002"], obsolete: false, replacedBy: [], xrefs: [] },
      ];
      writeGzipped(tmpDir, "deep.json.gz", makeIndexFile("deep", terms));
      const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["deep"] });
      await registry.initialize();
      const children = registry.getDirectDescendants("T:001", "deep");
      expect(children).toEqual(["T:002"]);
      expect(children).not.toContain("T:003");
    });

    it("returns empty array for leaf node", async () => {
      const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
      await registry.initialize();
      expect(registry.getDirectDescendants("TEST:0002", "test")).toEqual([]);
    });

    it("returns empty array for unknown ontology", async () => {
      const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
      await registry.initialize();
      expect(registry.getDirectDescendants("TEST:0001", "unknown")).toEqual([]);
    });

    it("returns empty array for unknown accession", async () => {
      const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
      await registry.initialize();
      expect(registry.getDirectDescendants("TEST:9999", "test")).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // additionalPrefixes support
  // -------------------------------------------------------------------------

  describe("additionalPrefixes support", () => {
    const prideTerms: OntologyTermEntry[] = [
      {
        accession: "PRIDE:0001",
        label: "pride root term",
        synonyms: [],
        parentIds: [],
        obsolete: false,
        replacedBy: [],
        xrefs: [],
      },
      {
        accession: "MS:0001",
        label: "ms child term",
        synonyms: [],
        parentIds: ["PRIDE:0001"],
        obsolete: false,
        replacedBy: [],
        xrefs: [],
      },
      {
        accession: "MS:0002",
        label: "ms grandchild term",
        synonyms: [],
        parentIds: ["MS:0001"],
        obsolete: false,
        replacedBy: [],
        xrefs: [],
      },
    ];

    beforeEach(() => {
      const indexFile: OntologyIndexFile = {
        meta: {
          ontology: "pride",
          fullName: "PRIDE Ontology",
          defaultPrefix: "PRIDE",
          additionalPrefixes: ["MS"],
          sourceVersion: "2024-01-01",
          sourceUrl: "http://example.com/pride.obo",
          builtAt: "2024-01-01T00:00:00Z",
          termCount: prideTerms.length,
          obsoleteTermCount: 0,
          schemaVersion: "1.0",
        },
        terms: prideTerms,
      };
      writeGzipped(tmpDir, "pride.json.gz", indexFile);
    });

    it("resolves an MS: accession from a PRIDE ontology that declares MS as an additional prefix", async () => {
      const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["pride"] });
      await registry.initialize();
      const term = registry.resolve("MS:0001", ["pride"]);
      expect(term).not.toBeNull();
      expect(term!.accession).toBe("MS:0001");
    });

    it("search returns the MS: term from a PRIDE ontology that declares MS as an additional prefix", async () => {
      const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["pride"] });
      await registry.initialize();
      const results = registry.search("MS:0001", ["pride"]);
      expect(results.some(r => r.term.accession === "MS:0001")).toBe(true);
    });

    it("getDirectDescendants returns an MS: child accession for a PRIDE: parent", async () => {
      const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["pride"] });
      await registry.initialize();
      const children = registry.getDirectDescendants("PRIDE:0001", "pride");
      expect(children).toContain("MS:0001");
      expect(children).not.toContain("MS:0002");
    });

    it("isDescendantOf returns true when child has a different prefix than the parent", async () => {
      const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["pride"] });
      await registry.initialize();
      expect(registry.isDescendantOf("MS:0001", "PRIDE:0001", "pride")).toBe(true);
      expect(registry.isDescendantOf("MS:0002", "PRIDE:0001", "pride")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // getVersion()
  // -------------------------------------------------------------------------

  it("getVersion() returns updatedAt from manifest when present", async () => {
    const manifest = {
      schemaVersion: "1.0",
      updatedAt: "2024-03-19T12:00:00Z",
      ontologies: {},
    };
    writeFileSync(join(tmpDir, "manifest.json"), JSON.stringify(manifest));
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
    await registry.initialize();
    expect(registry.getVersion()).toBe("2024-03-19T12:00:00Z");
  });

  it("getVersion() returns null when no manifest is present", async () => {
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
    await registry.initialize();
    expect(registry.getVersion()).toBeNull();
  });

  // -------------------------------------------------------------------------
  // update()
  // -------------------------------------------------------------------------

  it("update() throws when updateSource is not set", async () => {
    const registry = new OntologyRegistry({ indexDir: tmpDir, ontologies: ["test"] });
    await registry.initialize();
    await expect(registry.update()).rejects.toThrow("updateSource");
  });
});
