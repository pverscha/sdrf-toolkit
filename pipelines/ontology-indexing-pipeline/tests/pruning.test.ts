import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOboFile } from "../src/parsers/obo-parser.js";
import { pruneNCBITaxon } from "../src/pruning.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES = join(__dirname, "fixtures");

async function loadMiniTaxon() {
  return parseOboFile(join(FIXTURES, "mini-ncbitaxon.obo"), {
    defaultPrefix: "NCBITaxon",
    collectRanks: true,
  });
}

describe("NCBITaxon Pruning", () => {
  it("keeps allowlist species and all their ancestors", async () => {
    const parsed = await loadMiniTaxon();
    const allowlist = new Set(["NCBITaxon:9606"]); // Homo sapiens only
    const pruned = pruneNCBITaxon(parsed.terms, parsed.rankMap!, allowlist);

    const accessions = new Set(pruned.map((t) => t.accession));
    expect(accessions.has("NCBITaxon:9606")).toBe(true); // Homo sapiens (allowlisted)
    expect(accessions.has("NCBITaxon:9605")).toBe(true); // Homo (genus, ancestor)
    expect(accessions.has("NCBITaxon:2759")).toBe(true); // Eukaryota (superkingdom, ancestor)
    expect(accessions.has("NCBITaxon:1")).toBe(true); // root (ancestor)
  });

  it("includes all genus-level terms and their ancestors when allowlist is empty", async () => {
    const parsed = await loadMiniTaxon();
    const allowlist = new Set<string>();
    const pruned = pruneNCBITaxon(parsed.terms, parsed.rankMap!, allowlist);

    const accessions = new Set(pruned.map((t) => t.accession));
    expect(accessions.has("NCBITaxon:9605")).toBe(true); // Homo (genus)
    expect(accessions.has("NCBITaxon:862507")).toBe(true); // Mus (genus)
    // Ancestors of genus-level terms are also included
    expect(accessions.has("NCBITaxon:2759")).toBe(true); // Eukaryota
  });

  it("excludes species-level terms not in allowlist when using empty allowlist", async () => {
    const parsed = await loadMiniTaxon();
    const allowlist = new Set<string>();
    const pruned = pruneNCBITaxon(parsed.terms, parsed.rankMap!, allowlist);

    const accessions = new Set(pruned.map((t) => t.accession));
    expect(accessions.has("NCBITaxon:9606")).toBe(false); // Homo sapiens (species, not allowlisted)
    expect(accessions.has("NCBITaxon:10090")).toBe(false); // Mus musculus (species, not allowlisted)
    expect(accessions.has("NCBITaxon:9999")).toBe(false); // random species
  });

  it("keeps superkingdom-level terms regardless of allowlist", async () => {
    const parsed = await loadMiniTaxon();
    const allowlist = new Set<string>();
    const pruned = pruneNCBITaxon(parsed.terms, parsed.rankMap!, allowlist);

    const accessions = new Set(pruned.map((t) => t.accession));
    expect(accessions.has("NCBITaxon:2759")).toBe(true); // Eukaryota (superkingdom)
  });

  it("keeps family-level terms (Hominidae) via genus-level BFS upward", async () => {
    const parsed = await loadMiniTaxon();
    const allowlist = new Set<string>();
    const pruned = pruneNCBITaxon(parsed.terms, parsed.rankMap!, allowlist);

    const accessions = new Set(pruned.map((t) => t.accession));
    // Homo (genus) → Homininae (subfamily, ancestor) → Hominidae (family, ancestor) all included
    expect(accessions.has("NCBITaxon:9604")).toBe(true); // Hominidae (family)
  });

  it("handles multiple allowlist species without duplicating ancestors", async () => {
    const parsed = await loadMiniTaxon();
    const allowlist = new Set(["NCBITaxon:9606", "NCBITaxon:10090"]); // Homo sapiens + Mus musculus
    const pruned = pruneNCBITaxon(parsed.terms, parsed.rankMap!, allowlist);

    // Both species included
    const accessions = new Set(pruned.map((t) => t.accession));
    expect(accessions.has("NCBITaxon:9606")).toBe(true);
    expect(accessions.has("NCBITaxon:10090")).toBe(true);
    // Shared ancestor Mammalia included exactly once
    const mammaliaCount = pruned.filter((t) => t.accession === "NCBITaxon:40674").length;
    expect(mammaliaCount).toBe(1);
  });

  it("returns empty array for empty terms input", async () => {
    const pruned = pruneNCBITaxon([], new Map(), new Set(["NCBITaxon:9606"]));
    expect(pruned).toEqual([]);
  });

  it("returns empty array when allowlist has no matches and no genus-level terms", async () => {
    // Use terms with no ranks at all
    const terms = [
      {
        accession: "NCBITaxon:1",
        label: "root",
        synonyms: [],
        parentIds: [],
        obsolete: false,
        replacedBy: [],
        xrefs: [],
      },
    ];
    const rankMap = new Map<string, string>(); // no ranks
    const pruned = pruneNCBITaxon(terms, rankMap, new Set<string>());
    expect(pruned).toEqual([]);
  });
});
