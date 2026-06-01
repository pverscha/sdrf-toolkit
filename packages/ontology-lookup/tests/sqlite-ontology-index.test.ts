import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { SqliteOntologyIndex } from "../src/sqlite-ontology-index.js";

// ---------------------------------------------------------------------------
// Helpers — build a small SQLite database with the same schema as the pipeline
// ---------------------------------------------------------------------------

function createTestDb(dbPath: string): void {
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

    CREATE TABLE terms (
      accession TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      obsolete INTEGER NOT NULL DEFAULT 0,
      replaced_by TEXT NOT NULL DEFAULT '[]',
      xrefs TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE synonyms (
      rowid INTEGER PRIMARY KEY,
      accession TEXT NOT NULL,
      text TEXT NOT NULL,
      type TEXT NOT NULL,
      is_label INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX idx_syn_accession ON synonyms(accession);
    CREATE INDEX idx_syn_text ON synonyms(lower(text));

    CREATE TABLE parents (
      child TEXT NOT NULL,
      parent TEXT NOT NULL,
      PRIMARY KEY (child, parent)
    );
    CREATE INDEX idx_parents_child ON parents(child);
    CREATE INDEX idx_parents_parent ON parents(parent);

    CREATE VIRTUAL TABLE synonyms_fts USING fts5(
      accession UNINDEXED,
      text,
      content='synonyms',
      content_rowid='rowid',
      tokenize='unicode61 remove_diacritics 1'
    );
  `);

  const metaData: [string, string][] = [
    ["ontology", "ncbitaxon"],
    ["fullName", "NCBI Taxonomy"],
    ["defaultPrefix", "NCBITaxon"],
    ["additionalPrefixes", "[]"],
    ["sourceVersion", "2024-01-01"],
    ["indexVersion", "1.0.0"],
    ["sourceUrl", "http://example.com/ncbitaxon.obo"],
    ["builtAt", "2024-01-01T00:00:00Z"],
    ["termCount", "5"],
    ["obsoleteTermCount", "1"],
    ["schemaVersion", "1.0.0"],
  ];
  const metaStmt = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
  for (const [k, v] of metaData) metaStmt.run(k, v);

  const insertTerm = db.prepare(
    "INSERT INTO terms (accession, label, obsolete, replaced_by, xrefs) VALUES (?, ?, ?, ?, ?)"
  );
  const insertSyn = db.prepare(
    "INSERT INTO synonyms (accession, text, type, is_label) VALUES (?, ?, ?, ?)"
  );
  const insertParent = db.prepare(
    "INSERT OR IGNORE INTO parents (child, parent) VALUES (?, ?)"
  );

  const terms = [
    { acc: "NCBITaxon:1",    label: "root",             obsolete: 0, parents: [] },
    { acc: "NCBITaxon:9443", label: "Primates",         obsolete: 0, parents: ["NCBITaxon:1"] },
    { acc: "NCBITaxon:9604", label: "Hominidae",        obsolete: 0, parents: ["NCBITaxon:9443"] },
    { acc: "NCBITaxon:9605", label: "Homo",             obsolete: 0, parents: ["NCBITaxon:9604"] },
    { acc: "NCBITaxon:9606", label: "Homo sapiens",     obsolete: 0, parents: ["NCBITaxon:9605"] },
    { acc: "NCBITaxon:9595", label: "Gorilla gorilla",  obsolete: 0, parents: ["NCBITaxon:9604"] },
    { acc: "NCBITaxon:9999", label: "Obsolete taxon",   obsolete: 1, parents: [] },
  ];

  const synonyms: { acc: string; text: string; type: string; isLabel: number }[] = [
    { acc: "NCBITaxon:9606", text: "Homo sapiens",     type: "EXACT",   isLabel: 1 },
    { acc: "NCBITaxon:9606", text: "human",            type: "EXACT",   isLabel: 0 },
    { acc: "NCBITaxon:9606", text: "man",              type: "RELATED", isLabel: 0 },
    { acc: "NCBITaxon:9595", text: "Gorilla gorilla",  type: "EXACT",   isLabel: 1 },
    { acc: "NCBITaxon:9595", text: "western gorilla",  type: "EXACT",   isLabel: 0 },
    { acc: "NCBITaxon:9443", text: "Primates",         type: "EXACT",   isLabel: 1 },
    { acc: "NCBITaxon:9604", text: "Hominidae",        type: "EXACT",   isLabel: 1 },
    { acc: "NCBITaxon:9604", text: "great apes",       type: "RELATED", isLabel: 0 },
    { acc: "NCBITaxon:9605", text: "Homo",             type: "EXACT",   isLabel: 1 },
    { acc: "NCBITaxon:1",    text: "root",             type: "EXACT",   isLabel: 1 },
    { acc: "NCBITaxon:9999", text: "Obsolete taxon",   type: "EXACT",   isLabel: 1 },
  ];

  const insertAll = db.transaction(() => {
    for (const t of terms) {
      insertTerm.run(t.acc, t.label, t.obsolete, "[]", "[]");
      for (const p of t.parents) insertParent.run(t.acc, p);
    }
    for (const s of synonyms) {
      insertSyn.run(s.acc, s.text, s.type, s.isLabel);
    }
  });
  insertAll();

  db.exec("INSERT INTO synonyms_fts(synonyms_fts) VALUES('rebuild')");
  db.close();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let tmpDir: string;
let dbPath: string;
let index: SqliteOntologyIndex;

beforeAll(() => {
  tmpDir = join(tmpdir(), `sqlite-index-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  dbPath = join(tmpDir, "ncbitaxon.db");
  createTestDb(dbPath);
  index = new SqliteOntologyIndex(dbPath);
});

afterAll(() => {
  index.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("SqliteOntologyIndex — meta", () => {
  it("reads metadata from the meta table", () => {
    expect(index.meta.ontology).toBe("ncbitaxon");
    expect(index.meta.fullName).toBe("NCBI Taxonomy");
    expect(index.meta.termCount).toBe(5);
  });
});

describe("SqliteOntologyIndex — search", () => {
  it("tier 1: exact accession lookup (score 1.0)", () => {
    const results = index.search("NCBITaxon:9606", 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].term.accession).toBe("NCBITaxon:9606");
    expect(results[0].score).toBe(1.0);
    expect(results[0].matchType).toBe("accession");
  });

  it("tier 2: exact label match (score 1.0, matchType label)", () => {
    const results = index.search("Homo sapiens", 10);
    const top = results.find((r) => r.term.accession === "NCBITaxon:9606");
    expect(top).toBeDefined();
    expect(top!.score).toBe(1.0);
    expect(top!.matchType).toBe("label");
  });

  it("tier 3: exact synonym match (score 0.9)", () => {
    const results = index.search("human", 10);
    const match = results.find((r) => r.term.accession === "NCBITaxon:9606");
    expect(match).toBeDefined();
    expect(match!.score).toBe(0.9);
  });

  it("tier 4: prefix on label returns score 0.8", () => {
    const results = index.search("Homo", 10);
    const homoSapiens = results.find((r) => r.term.accession === "NCBITaxon:9606");
    expect(homoSapiens).toBeDefined();
    expect(homoSapiens!.score).toBeGreaterThanOrEqual(0.7);
  });

  it("returns multiple results for a prefix search", () => {
    const results = index.search("Hom", 10);
    const accessions = results.map((r) => r.term.accession);
    expect(accessions).toContain("NCBITaxon:9606"); // Homo sapiens
    expect(accessions).toContain("NCBITaxon:9605"); // Homo
  });

  it("returns empty array for a query with no match", () => {
    const results = index.search("zyxwvutsrq", 10);
    expect(results).toEqual([]);
  });

  it("respects the limit parameter", () => {
    const results = index.search("Homo", 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("results are sorted by score descending", () => {
    const results = index.search("Homo sapiens", 10);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });
});

describe("SqliteOntologyIndex — resolve", () => {
  it("resolves by exact accession", () => {
    const term = index.resolve("NCBITaxon:9606");
    expect(term).not.toBeNull();
    expect(term!.label).toBe("Homo sapiens");
  });

  it("resolves by exact label (case-insensitive)", () => {
    const term = index.resolve("homo sapiens");
    expect(term).not.toBeNull();
    expect(term!.accession).toBe("NCBITaxon:9606");
  });

  it("resolves by EXACT synonym", () => {
    const term = index.resolve("human");
    expect(term).not.toBeNull();
    expect(term!.accession).toBe("NCBITaxon:9606");
  });

  it("does not resolve a RELATED synonym", () => {
    const term = index.resolve("man");
    expect(term).toBeNull();
  });

  it("returns null for an unknown value", () => {
    expect(index.resolve("does not exist")).toBeNull();
  });
});

describe("SqliteOntologyIndex — hierarchy", () => {
  it("isDescendantOf returns true for direct parent-child", () => {
    expect(index.isDescendantOf("NCBITaxon:9606", "NCBITaxon:9605")).toBe(true);
  });

  it("isDescendantOf returns true for transitive ancestor", () => {
    expect(index.isDescendantOf("NCBITaxon:9606", "NCBITaxon:9443")).toBe(true);
  });

  it("isDescendantOf returns false for non-ancestor", () => {
    expect(index.isDescendantOf("NCBITaxon:9443", "NCBITaxon:9606")).toBe(false);
  });

  it("isDescendantOf returns false for unrelated terms", () => {
    expect(index.isDescendantOf("NCBITaxon:9606", "NCBITaxon:9595")).toBe(false);
  });

  it("getDirectDescendants returns immediate children only", () => {
    const children = index.getDirectDescendants("NCBITaxon:9604");
    expect(children).toContain("NCBITaxon:9605");
    expect(children).toContain("NCBITaxon:9595");
    expect(children).not.toContain("NCBITaxon:9606"); // grandchild
  });

  it("getDirectDescendants returns empty for leaf node", () => {
    expect(index.getDirectDescendants("NCBITaxon:9606")).toEqual([]);
  });

  it("getDescendants returns all transitive descendants", () => {
    const desc = index.getDescendants("NCBITaxon:9604");
    expect(desc).toContain("NCBITaxon:9605");
    expect(desc).toContain("NCBITaxon:9595");
    expect(desc).toContain("NCBITaxon:9606");
    expect(desc).not.toContain("NCBITaxon:9604"); // parent not included
  });

  it("getDescendants returns empty for leaf node", () => {
    expect(index.getDescendants("NCBITaxon:9606")).toEqual([]);
  });
});

describe("SqliteOntologyIndex — term structure", () => {
  it("returned term includes synonyms (excluding label)", () => {
    const term = index.resolve("NCBITaxon:9606");
    expect(term!.synonyms).toContain("human");
    expect(term!.synonyms).toContain("man");
    expect(term!.synonyms).not.toContain("Homo sapiens"); // label excluded from synonyms[]
  });

  it("returns obsolete flag correctly", () => {
    const results = index.search("NCBITaxon:9999", 10);
    const obsolete = results.find((r) => r.term.accession === "NCBITaxon:9999");
    expect(obsolete?.term.obsolete).toBe(true);
  });
});
