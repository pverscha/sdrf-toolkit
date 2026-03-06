import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOwlFile } from "../src/parsers/owl-parser.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES = join(__dirname, "fixtures");
const FIXTURE = join(FIXTURES, "mini-hancestro.owl");

describe("OWL Parser", () => {
  it("extracts version from owl:versionInfo", async () => {
    const result = await parseOwlFile(FIXTURE, { defaultPrefix: "HANCESTRO" });
    expect(result.sourceVersion).toBe("2024-06-01");
  });

  it("correctly converts IRI to accession", async () => {
    const result = await parseOwlFile(FIXTURE, { defaultPrefix: "HANCESTRO" });
    const term = result.terms.find((t) => t.accession === "HANCESTRO:0003");
    expect(term).toBeDefined();
  });

  it("extracts label", async () => {
    const result = await parseOwlFile(FIXTURE, { defaultPrefix: "HANCESTRO" });
    const term = result.terms.find((t) => t.accession === "HANCESTRO:0003");
    expect(term!.label).toBe("European");
  });

  it("extracts rdfs:subClassOf with rdf:resource as parentId", async () => {
    const result = await parseOwlFile(FIXTURE, { defaultPrefix: "HANCESTRO" });
    const term = result.terms.find((t) => t.accession === "HANCESTRO:0003");
    expect(term!.parentIds).toContain("HANCESTRO:0001");
  });

  it("ignores complex subClassOf (owl:Restriction) as parent", async () => {
    const result = await parseOwlFile(FIXTURE, { defaultPrefix: "HANCESTRO" });
    const term = result.terms.find((t) => t.accession === "HANCESTRO:0020");
    expect(term).toBeDefined();
    // Should have exactly one parent (the direct superclass), not the restriction
    expect(term!.parentIds).toEqual(["HANCESTRO:0001"]);
  });

  it("extracts exact synonyms", async () => {
    const result = await parseOwlFile(FIXTURE, { defaultPrefix: "HANCESTRO" });
    const term = result.terms.find((t) => t.accession === "HANCESTRO:0005");
    const exact = term!.synonyms.filter((s) => s.type === "EXACT");
    expect(exact.map((s) => s.text)).toContain("African ancestry");
  });

  it("extracts related synonyms", async () => {
    const result = await parseOwlFile(FIXTURE, { defaultPrefix: "HANCESTRO" });
    const term = result.terms.find((t) => t.accession === "HANCESTRO:0005");
    const related = term!.synonyms.filter((s) => s.type === "RELATED");
    expect(related.map((s) => s.text)).toContain("Sub-Saharan African");
  });

  it("extracts broad and narrow synonyms", async () => {
    const result = await parseOwlFile(FIXTURE, { defaultPrefix: "HANCESTRO" });
    const term = result.terms.find((t) => t.accession === "HANCESTRO:0005");
    const broad = term!.synonyms.filter((s) => s.type === "BROAD");
    const narrow = term!.synonyms.filter((s) => s.type === "NARROW");
    expect(broad.map((s) => s.text)).toContain("African group");
    expect(narrow.map((s) => s.text)).toContain("West African");
  });

  it("marks term as obsolete from owl:deprecated", async () => {
    const result = await parseOwlFile(FIXTURE, { defaultPrefix: "HANCESTRO" });
    const term = result.terms.find((t) => t.accession === "HANCESTRO:0010");
    expect(term).toBeDefined();
    expect(term!.obsolete).toBe(true);
  });

  it("extracts replacedBy from obo:IAO_0100001", async () => {
    const result = await parseOwlFile(FIXTURE, { defaultPrefix: "HANCESTRO" });
    const term = result.terms.find((t) => t.accession === "HANCESTRO:0010");
    expect(term!.replacedBy).toContain("HANCESTRO:0005");
  });

  it("extracts xrefs from oboInOwl:hasDbXref", async () => {
    const result = await parseOwlFile(FIXTURE, { defaultPrefix: "HANCESTRO" });
    const term = result.terms.find((t) => t.accession === "HANCESTRO:0005");
    expect(term!.xrefs).toContain("MeSH:D000352");
    expect(term!.xrefs).toContain("SNOMEDCT:413464008");
  });

  it("discards foreign-prefix terms", async () => {
    const result = await parseOwlFile(FIXTURE, { defaultPrefix: "HANCESTRO" });
    const obi = result.terms.find((t) => t.accession === "OBI:0000070");
    expect(obi).toBeUndefined();
    expect(result.discardedByPrefix).toContain("OBI:0000070");
  });

  it("skips anonymous classes (no rdf:about)", async () => {
    const result = await parseOwlFile(FIXTURE, { defaultPrefix: "HANCESTRO" });
    const anon = result.terms.find((t) => t.label === "anonymous term");
    expect(anon).toBeUndefined();
  });
});
