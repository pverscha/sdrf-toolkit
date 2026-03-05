import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOboFile } from "../src/parsers/obo-parser.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES = join(__dirname, "fixtures");

describe("OBO Parser", () => {
  it("extracts source version from data-version header", async () => {
    const result = await parseOboFile(join(FIXTURES, "mini-mondo.obo"), {
      defaultPrefix: "MONDO",
    });
    expect(result.sourceVersion).toBe("2024-12-01");
  });

  it("parses basic term fields (accession, label, is_a, xrefs)", async () => {
    const result = await parseOboFile(join(FIXTURES, "mini-mondo.obo"), {
      defaultPrefix: "MONDO",
    });
    const dm = result.terms.find((t) => t.accession === "MONDO:0005015");
    expect(dm).toBeDefined();
    expect(dm!.label).toBe("diabetes mellitus");
    expect(dm!.parentIds).toEqual(["MONDO:0005070"]);
    expect(dm!.xrefs).toContain("DOID:9351");
    expect(dm!.xrefs).toContain("EFO:0000400");
    expect(dm!.obsolete).toBe(false);
  });

  it("parses synonyms with correct type", async () => {
    const result = await parseOboFile(join(FIXTURES, "mini-mondo.obo"), {
      defaultPrefix: "MONDO",
    });
    const dm = result.terms.find((t) => t.accession === "MONDO:0005015");
    const exactSynonyms = dm!.synonyms.filter((s) => s.type === "EXACT");
    expect(exactSynonyms.map((s) => s.text)).toContain("diabetes");
    expect(exactSynonyms.map((s) => s.text)).toContain("DM");

    const relatedSynonyms = dm!.synonyms.filter((s) => s.type === "RELATED");
    expect(relatedSynonyms.map((s) => s.text)).toContain("sugar diabetes");
  });

  it("handles escaped quotes in synonym text", async () => {
    const result = await parseOboFile(join(FIXTURES, "mini-mondo.obo"), {
      defaultPrefix: "MONDO",
    });
    const t = result.terms.find((t) => t.accession === "MONDO:0099999");
    expect(t).toBeDefined();
    expect(t!.synonyms).toHaveLength(1);
    expect(t!.synonyms[0].text).toBe('5"10" measurement');
  });

  it("filters imported terms with wrong prefix", async () => {
    const result = await parseOboFile(join(FIXTURES, "mini-mondo.obo"), {
      defaultPrefix: "MONDO",
    });
    const doidTerm = result.terms.find((t) => t.accession === "DOID:9351");
    expect(doidTerm).toBeUndefined();
  });

  it("marks obsolete terms and collects replacedBy", async () => {
    const result = await parseOboFile(join(FIXTURES, "mini-mondo.obo"), {
      defaultPrefix: "MONDO",
    });
    const obs = result.terms.find((t) => t.accession === "MONDO:0000100");
    expect(obs).toBeDefined();
    expect(obs!.obsolete).toBe(true);
    expect(obs!.replacedBy).toContain("MONDO:0005015");
  });

  it("handles multiple is_a parents", async () => {
    const result = await parseOboFile(join(FIXTURES, "mini-mondo.obo"), {
      defaultPrefix: "MONDO",
    });
    const t = result.terms.find((t) => t.accession === "MONDO:0000200");
    expect(t).toBeDefined();
    expect(t!.parentIds).toHaveLength(2);
    expect(t!.parentIds).toContain("MONDO:0005015");
    expect(t!.parentIds).toContain("MONDO:0005070");
  });

  it("flushes final term at EOF (no trailing blank line)", async () => {
    const result = await parseOboFile(join(FIXTURES, "mini-mondo.obo"), {
      defaultPrefix: "MONDO",
    });
    const last = result.terms.find((t) => t.accession === "MONDO:0000999");
    expect(last).toBeDefined();
    expect(last!.label).toBe("final term at EOF");
  });

  it("skips [Typedef] stanzas", async () => {
    const result = await parseOboFile(join(FIXTURES, "mini-mondo.obo"), {
      defaultPrefix: "MONDO",
    });
    const typedef = result.terms.find((t) => t.accession === "RO:0002573");
    expect(typedef).toBeUndefined();
  });

  it("collects rank annotations when collectRanks=true", async () => {
    const result = await parseOboFile(join(FIXTURES, "mini-ncbitaxon.obo"), {
      defaultPrefix: "NCBITaxon",
      collectRanks: true,
    });
    expect(result.rankMap).toBeDefined();
    expect(result.rankMap!.get("NCBITaxon:9606")).toBe("NCBITaxon:species");
    expect(result.rankMap!.get("NCBITaxon:9605")).toBe("NCBITaxon:genus");
    expect(result.rankMap!.get("NCBITaxon:2759")).toBe("NCBITaxon:superkingdom");
  });
});
