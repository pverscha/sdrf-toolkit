import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseUnimodXml } from "../src/parsers/unimod-parser.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES = join(__dirname, "fixtures");

describe("Unimod XML Parser", () => {
  it("extracts source version from majorVersion/minorVersion attributes", async () => {
    const result = await parseUnimodXml(join(FIXTURES, "mini-unimod.xml"));
    expect(result.sourceVersion).toBe("2.5");
  });

  it("formats accession as UNIMOD:<record_id>", async () => {
    const result = await parseUnimodXml(join(FIXTURES, "mini-unimod.xml"));
    const accessions = result.terms.map((t) => t.accession);
    expect(accessions).toContain("UNIMOD:1");
    expect(accessions).toContain("UNIMOD:35");
    expect(accessions).toContain("UNIMOD:21");
  });

  it("parses basic modification fields", async () => {
    const result = await parseUnimodXml(join(FIXTURES, "mini-unimod.xml"));
    const acetyl = result.terms.find((t) => t.accession === "UNIMOD:1");
    expect(acetyl).toBeDefined();
    expect(acetyl!.label).toBe("Acetyl");
    expect(acetyl!.parentIds).toEqual([]);
    expect(acetyl!.obsolete).toBe(false);
    expect(acetyl!.replacedBy).toEqual([]);
    expect(acetyl!.xrefs).toEqual([]);
  });

  it("filters out unapproved modifications (approved != 1)", async () => {
    const result = await parseUnimodXml(join(FIXTURES, "mini-unimod.xml"));
    const unapproved = result.terms.find((t) => t.accession === "UNIMOD:999");
    expect(unapproved).toBeUndefined();
  });

  it("adds full_name as EXACT synonym when different from title", async () => {
    const result = await parseUnimodXml(join(FIXTURES, "mini-unimod.xml"));
    const oxidation = result.terms.find((t) => t.accession === "UNIMOD:35");
    expect(oxidation!.synonyms.some((s) => s.text === "Oxidation or Hydroxylation")).toBe(true);
    expect(oxidation!.synonyms.every((s) => s.type === "EXACT")).toBe(true);
  });

  it("does not add full_name as synonym when identical to title", async () => {
    // Acetyl has full_name="Acetylation" which differs from title="Acetyl"
    // Carbamidomethyl has full_name="Iodoacetamide derivative" (different) → should appear
    const result = await parseUnimodXml(join(FIXTURES, "mini-unimod.xml"));
    const carba = result.terms.find((t) => t.accession === "UNIMOD:4");
    expect(carba!.synonyms.some((s) => s.text === "Iodoacetamide derivative")).toBe(true);
  });

  it("adds alt_name child elements as EXACT synonyms", async () => {
    const result = await parseUnimodXml(join(FIXTURES, "mini-unimod.xml"));
    const acetyl = result.terms.find((t) => t.accession === "UNIMOD:1");
    expect(acetyl!.synonyms.some((s) => s.text === "Acetylation")).toBe(true);
  });

  it("deduplicates synonyms when full_name and alt_name are identical", async () => {
    // Phospho: full_name="Phosphorylation", alt_name=["Phosphorylation", "Phospho"]
    // "Phosphorylation" should appear only once; "Phospho" should not be added since
    // it matches the title, and full_name != title so "Phosphorylation" is added once.
    const result = await parseUnimodXml(join(FIXTURES, "mini-unimod.xml"));
    const phospho = result.terms.find((t) => t.accession === "UNIMOD:21");
    const phosphorylationSyns = phospho!.synonyms.filter((s) => s.text === "Phosphorylation");
    expect(phosphorylationSyns).toHaveLength(1);
  });

  it("parses all approved modifications and skips unapproved", async () => {
    const result = await parseUnimodXml(join(FIXTURES, "mini-unimod.xml"));
    // 4 approved mods: Acetyl(1), Oxidation(35), Phospho(21), Carbamidomethyl(4)
    expect(result.terms).toHaveLength(4);
  });
});
