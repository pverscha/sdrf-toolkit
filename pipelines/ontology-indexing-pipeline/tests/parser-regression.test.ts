/**
 * Parser regression tests against excerpts from real upstream ontology files.
 *
 * Each fixture in tests/fixtures/real/ is a minimal but verbatim slice of an
 * actual upstream file — containing the original header and a handful of stable,
 * well-known terms. Tests verify that the parsers produce correct output for real
 * ontology content, catching regressions that synthetic unit fixtures would not
 * surface: changed version string format, renamed annotation properties, altered
 * deprecation encoding, unexpected prefix filtering, etc.
 *
 * When an upstream ontology changes its format in a way that breaks parsing, the
 * corresponding fixture and its assertions should be updated together so the
 * failure is explicit and traceable.
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOboFile } from "../src/parsers/obo-parser.js";
import { parseOwlFile } from "../src/parsers/owl-parser.js";
import { parseUnimodXml } from "../src/parsers/unimod-parser.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES = join(__dirname, "fixtures", "real");

// ---------------------------------------------------------------------------
// MS ontology (OBO) — psi-ms.obo
// ---------------------------------------------------------------------------

describe("OBO parser — MS ontology excerpt", () => {
  it("extracts version from data-version header", async () => {
    const result = await parseOboFile(join(FIXTURES, "ms-excerpt.obo"), { defaultPrefix: "MS" });
    expect(result.sourceVersion).toBe("4.1.244");
  });

  it("parses MS:1000073 electrospray ionization with correct label, synonym, and parent", async () => {
    const result = await parseOboFile(join(FIXTURES, "ms-excerpt.obo"), { defaultPrefix: "MS" });
    const esi = result.terms.find((t) => t.accession === "MS:1000073");
    expect(esi).toBeDefined();
    expect(esi!.label).toBe("electrospray ionization");
    expect(esi!.synonyms.some((s) => s.text === "ESI" && s.type === "EXACT")).toBe(true);
    expect(esi!.parentIds).toContain("MS:1000008");
    expect(esi!.obsolete).toBe(false);
  });

  it("marks MS:1000009 ionization mode as obsolete", async () => {
    const result = await parseOboFile(join(FIXTURES, "ms-excerpt.obo"), { defaultPrefix: "MS" });
    const obs = result.terms.find((t) => t.accession === "MS:1000009");
    expect(obs).toBeDefined();
    expect(obs!.obsolete).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PATO (OBO)
// ---------------------------------------------------------------------------

describe("OBO parser — PATO ontology excerpt", () => {
  it("extracts version from releases/DATE/filename data-version path", async () => {
    const result = await parseOboFile(join(FIXTURES, "pato-excerpt.obo"), { defaultPrefix: "PATO" });
    // cleanOboVersion strips only the leading "releases/" prefix, leaving the inner path intact
    expect(result.sourceVersion).toBe("2025-05-14/pato.obo");
  });

  it("parses PATO:0000125 mass with correct label and parent", async () => {
    const result = await parseOboFile(join(FIXTURES, "pato-excerpt.obo"), { defaultPrefix: "PATO" });
    const mass = result.terms.find((t) => t.accession === "PATO:0000125");
    expect(mass).toBeDefined();
    expect(mass!.label).toBe("mass");
    expect(mass!.parentIds).toContain("PATO:0001018");
    expect(mass!.obsolete).toBe(false);
  });

  it("parses PATO:0001018 physical quality with EXACT synonym", async () => {
    const result = await parseOboFile(join(FIXTURES, "pato-excerpt.obo"), { defaultPrefix: "PATO" });
    const pq = result.terms.find((t) => t.accession === "PATO:0001018");
    expect(pq).toBeDefined();
    expect(pq!.label).toBe("physical quality");
    expect(pq!.synonyms.some((s) => s.text === "relational physical quality" && s.type === "EXACT")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PRIDE ontology (OBO)
// ---------------------------------------------------------------------------

describe("OBO parser — PRIDE ontology excerpt", () => {
  it("extracts version from releases/DATE data-version path", async () => {
    const result = await parseOboFile(join(FIXTURES, "pride-excerpt.obo"), { defaultPrefix: "PRIDE" });
    expect(result.sourceVersion).toBe("2026-03-05");
  });

  it("parses PRIDE:0000312 Label free with synonyms and xrefs", async () => {
    const result = await parseOboFile(join(FIXTURES, "pride-excerpt.obo"), { defaultPrefix: "PRIDE" });
    const lfq = result.terms.find((t) => t.accession === "PRIDE:0000312");
    expect(lfq).toBeDefined();
    expect(lfq!.label).toBe("Label free");
    expect(lfq!.synonyms.some((s) => s.text === "LFQ" && s.type === "EXACT")).toBe(true);
    expect(lfq!.synonyms.some((s) => s.text === "label-free quantification" && s.type === "EXACT")).toBe(true);
    expect(lfq!.xrefs).toContain("MS:1001834");
    expect(lfq!.xrefs).toContain("MS:1001835");
  });

  it("parses PRIDE:0000436 Spectrum counting with correct parent", async () => {
    const result = await parseOboFile(join(FIXTURES, "pride-excerpt.obo"), { defaultPrefix: "PRIDE" });
    const sc = result.terms.find((t) => t.accession === "PRIDE:0000436");
    expect(sc).toBeDefined();
    expect(sc!.label).toBe("Spectrum counting");
    expect(sc!.parentIds).toContain("PRIDE:0000312");
  });

  it("discards foreign-prefix terms embedded in the PRIDE OBO file", async () => {
    const result = await parseOboFile(join(FIXTURES, "pride-excerpt.obo"), { defaultPrefix: "PRIDE" });
    expect(result.terms.every((t) => t.accession.startsWith("PRIDE:"))).toBe(true);
    expect(result.discardedByPrefix.some((acc) => acc.startsWith("EFO:"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// HANCESTRO (OWL)
// ---------------------------------------------------------------------------

describe("OWL parser — HANCESTRO ontology excerpt", () => {
  it("extracts version from owl:versionInfo", async () => {
    const result = await parseOwlFile(join(FIXTURES, "hancestro-excerpt.owl"), {
      defaultPrefix: "HANCESTRO",
    });
    expect(result.sourceVersion).toBe("2025-10-14");
  });

  it("parses HANCESTRO:0004 ancestry category with label and exact synonym", async () => {
    const result = await parseOwlFile(join(FIXTURES, "hancestro-excerpt.owl"), {
      defaultPrefix: "HANCESTRO",
    });
    const ac = result.terms.find((t) => t.accession === "HANCESTRO:0004");
    expect(ac).toBeDefined();
    expect(ac!.label).toBe("ancestry category");
    expect(ac!.synonyms.some((s) => s.text === "ancestral group" && s.type === "EXACT")).toBe(true);
  });

  it("parses HANCESTRO:0005 European ancestry with correct synonyms and parent", async () => {
    const result = await parseOwlFile(join(FIXTURES, "hancestro-excerpt.owl"), {
      defaultPrefix: "HANCESTRO",
    });
    const ea = result.terms.find((t) => t.accession === "HANCESTRO:0005");
    expect(ea).toBeDefined();
    expect(ea!.label).toBe("European ancestry");
    expect(ea!.synonyms.some((s) => s.text === "European" && s.type === "EXACT")).toBe(true);
    expect(ea!.synonyms.some((s) => s.text === "Caucasian" && s.type === "EXACT")).toBe(true);
    expect(ea!.parentIds).toContain("HANCESTRO:0004");
    expect(ea!.obsolete).toBe(false);
  });

  it("marks HANCESTRO:0003 obsolete country as deprecated", async () => {
    const result = await parseOwlFile(join(FIXTURES, "hancestro-excerpt.owl"), {
      defaultPrefix: "HANCESTRO",
    });
    const obs = result.terms.find((t) => t.accession === "HANCESTRO:0003");
    expect(obs).toBeDefined();
    expect(obs!.obsolete).toBe(true);
  });

  it("discards OBI-prefixed foreign class", async () => {
    const result = await parseOwlFile(join(FIXTURES, "hancestro-excerpt.owl"), {
      defaultPrefix: "HANCESTRO",
    });
    expect(result.discardedByPrefix).toContain("OBI:0000181");
    expect(result.terms.find((t) => t.accession === "OBI:0000181")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Unimod (XML)
// ---------------------------------------------------------------------------

describe("Unimod XML parser — real excerpt", () => {
  it("reads version 2.0 from the real unimod.xml header attributes", async () => {
    const result = await parseUnimodXml(join(FIXTURES, "unimod-excerpt.xml"));
    expect(result.sourceVersion).toBe("2.0");
  });

  it("parses UNIMOD:1 Acetyl with synonym Acetylation", async () => {
    const result = await parseUnimodXml(join(FIXTURES, "unimod-excerpt.xml"));
    const acetyl = result.terms.find((t) => t.accession === "UNIMOD:1");
    expect(acetyl).toBeDefined();
    expect(acetyl!.label).toBe("Acetyl");
    expect(acetyl!.synonyms.some((s) => s.text === "Acetylation" && s.type === "EXACT")).toBe(true);
    expect(acetyl!.obsolete).toBe(false);
  });

  it("parses UNIMOD:21 Phospho with synonym Phosphorylation", async () => {
    const result = await parseUnimodXml(join(FIXTURES, "unimod-excerpt.xml"));
    const phospho = result.terms.find((t) => t.accession === "UNIMOD:21");
    expect(phospho).toBeDefined();
    expect(phospho!.label).toBe("Phospho");
    expect(phospho!.synonyms.some((s) => s.text === "Phosphorylation" && s.type === "EXACT")).toBe(true);
  });

  it("excludes unapproved UNIMOD:5 Carbamyl", async () => {
    const result = await parseUnimodXml(join(FIXTURES, "unimod-excerpt.xml"));
    expect(result.terms.find((t) => t.accession === "UNIMOD:5")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// MONDO (OBO)
// ---------------------------------------------------------------------------

describe("OBO parser — MONDO ontology excerpt", () => {
  it("extracts version from releases/DATE data-version path", async () => {
    const result = await parseOboFile(join(FIXTURES, "mondo-excerpt.obo"), { defaultPrefix: "MONDO" });
    expect(result.sourceVersion).toBe("2026-03-03");
  });

  it("parses MONDO:0000001 disease with label and multiple EXACT synonyms", async () => {
    const result = await parseOboFile(join(FIXTURES, "mondo-excerpt.obo"), { defaultPrefix: "MONDO" });
    const disease = result.terms.find((t) => t.accession === "MONDO:0000001");
    expect(disease).toBeDefined();
    expect(disease!.label).toBe("disease");
    expect(disease!.synonyms.some((s) => s.text === "disorder" && s.type === "EXACT")).toBe(true);
    expect(disease!.synonyms.some((s) => s.text === "medical condition" && s.type === "EXACT")).toBe(true);
    expect(disease!.obsolete).toBe(false);
  });

  it("marks MONDO:0000002 as obsolete and records its replacement", async () => {
    const result = await parseOboFile(join(FIXTURES, "mondo-excerpt.obo"), { defaultPrefix: "MONDO" });
    const obs = result.terms.find((t) => t.accession === "MONDO:0000002");
    expect(obs).toBeDefined();
    expect(obs!.obsolete).toBe(true);
    expect(obs!.replacedBy).toContain("MONDO:0009299");
  });

  it("discards foreign-prefix xref terms that appear as imported [Term] stanzas", async () => {
    const result = await parseOboFile(join(FIXTURES, "mondo-excerpt.obo"), { defaultPrefix: "MONDO" });
    expect(result.terms.every((t) => t.accession.startsWith("MONDO:"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// EFO (OBO)
// ---------------------------------------------------------------------------

describe("OBO parser — EFO ontology excerpt", () => {
  it("preserves the full URL from data-version when it does not start with 'releases/'", async () => {
    const result = await parseOboFile(join(FIXTURES, "efo-excerpt.obo"), { defaultPrefix: "EFO" });
    // EFO uses a full URL as data-version; cleanOboVersion does not rewrite it
    expect(result.sourceVersion).toBe("http://www.ebi.ac.uk/efo/releases/v3.88.0/efo.owl");
  });

  it("parses efo:EFO_0000001 experimental factor using the efo: namespace prefix", async () => {
    const result = await parseOboFile(join(FIXTURES, "efo-excerpt.obo"), { defaultPrefix: "EFO" });
    const ef = result.terms.find((t) => t.accession === "efo:EFO_0000001");
    expect(ef).toBeDefined();
    expect(ef!.label).toBe("experimental factor");
    expect(ef!.synonyms.some((s) => s.text === "ExperimentalFactor" && s.type === "EXACT")).toBe(true);
  });

  it("marks efo:EFO_0000400 as obsolete", async () => {
    const result = await parseOboFile(join(FIXTURES, "efo-excerpt.obo"), { defaultPrefix: "EFO" });
    const obs = result.terms.find((t) => t.accession === "efo:EFO_0000400");
    expect(obs).toBeDefined();
    expect(obs!.obsolete).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DOID (OBO)
// ---------------------------------------------------------------------------

describe("OBO parser — DOID ontology excerpt", () => {
  it("extracts version from releases/DATE/filename data-version path", async () => {
    const result = await parseOboFile(join(FIXTURES, "doid-excerpt.obo"), { defaultPrefix: "DOID" });
    expect(result.sourceVersion).toBe("2026-02-28/doid.obo");
  });

  it("parses DOID:0001816 angiosarcoma with EXACT synonym and parent", async () => {
    const result = await parseOboFile(join(FIXTURES, "doid-excerpt.obo"), { defaultPrefix: "DOID" });
    const angio = result.terms.find((t) => t.accession === "DOID:0001816");
    expect(angio).toBeDefined();
    expect(angio!.label).toBe("angiosarcoma");
    expect(angio!.synonyms.some((s) => s.text === "hemangiosarcoma" && s.type === "EXACT")).toBe(true);
    expect(angio!.parentIds).toContain("DOID:175");
  });

  it("parses DOID:0014667 disease of metabolism with EXACT synonym", async () => {
    const result = await parseOboFile(join(FIXTURES, "doid-excerpt.obo"), { defaultPrefix: "DOID" });
    const dm = result.terms.find((t) => t.accession === "DOID:0014667");
    expect(dm).toBeDefined();
    expect(dm!.label).toBe("disease of metabolism");
    expect(dm!.synonyms.some((s) => s.text === "metabolic disease" && s.type === "EXACT")).toBe(true);
    expect(dm!.parentIds).toContain("DOID:4");
  });
});

// ---------------------------------------------------------------------------
// CL — Cell Ontology (OBO)
// ---------------------------------------------------------------------------

describe("OBO parser — CL ontology excerpt", () => {
  it("extracts version from releases/DATE data-version path", async () => {
    const result = await parseOboFile(join(FIXTURES, "cl-excerpt.obo"), { defaultPrefix: "CL" });
    expect(result.sourceVersion).toBe("2026-03-17");
  });

  it("parses CL:0000001 primary cultured cell with EXACT synonyms and parent", async () => {
    const result = await parseOboFile(join(FIXTURES, "cl-excerpt.obo"), { defaultPrefix: "CL" });
    const pcc = result.terms.find((t) => t.accession === "CL:0000001");
    expect(pcc).toBeDefined();
    expect(pcc!.label).toBe("primary cultured cell");
    expect(pcc!.synonyms.some((s) => s.text === "primary cell culture cell" && s.type === "EXACT")).toBe(true);
    expect(pcc!.synonyms.some((s) => s.text === "unpassaged cultured cell" && s.type === "EXACT")).toBe(true);
    expect(pcc!.parentIds).toContain("CL:0000010");
  });

  it("marks CL:0000002 as obsolete with a CLO replacedBy reference", async () => {
    const result = await parseOboFile(join(FIXTURES, "cl-excerpt.obo"), { defaultPrefix: "CL" });
    const obs = result.terms.find((t) => t.accession === "CL:0000002");
    expect(obs).toBeDefined();
    expect(obs!.obsolete).toBe(true);
    expect(obs!.replacedBy).toContain("CLO:0000019");
  });
});

// ---------------------------------------------------------------------------
// UBERON (OBO)
// ---------------------------------------------------------------------------

describe("OBO parser — UBERON ontology excerpt", () => {
  it("extracts version from releases/DATE data-version path", async () => {
    const result = await parseOboFile(join(FIXTURES, "uberon-excerpt.obo"), { defaultPrefix: "UBERON" });
    expect(result.sourceVersion).toBe("2025-12-04");
  });

  it("parses UBERON:0000002 uterine cervix with synonyms and parent", async () => {
    const result = await parseOboFile(join(FIXTURES, "uberon-excerpt.obo"), { defaultPrefix: "UBERON" });
    const cx = result.terms.find((t) => t.accession === "UBERON:0000002");
    expect(cx).toBeDefined();
    expect(cx!.label).toBe("uterine cervix");
    expect(cx!.synonyms.some((s) => s.text === "cervix uteri" && s.type === "EXACT")).toBe(true);
    expect(cx!.synonyms.some((s) => s.text === "cervix" && s.type === "BROAD")).toBe(true);
    expect(cx!.parentIds).toContain("UBERON:0001560");
  });
});

// ---------------------------------------------------------------------------
// MOD — PSI Protein Modification Ontology (OBO)
// ---------------------------------------------------------------------------

describe("OBO parser — MOD ontology excerpt", () => {
  it("extracts version from data-version header", async () => {
    const result = await parseOboFile(join(FIXTURES, "mod-excerpt.obo"), { defaultPrefix: "MOD" });
    expect(result.sourceVersion).toBe("1.032.4");
  });

  it("parses MOD:00000 protein modification with EXACT synonym", async () => {
    const result = await parseOboFile(join(FIXTURES, "mod-excerpt.obo"), { defaultPrefix: "MOD" });
    const root = result.terms.find((t) => t.accession === "MOD:00000");
    expect(root).toBeDefined();
    expect(root!.label).toBe("protein modification");
    expect(root!.synonyms.some((s) => s.text === "ModRes" && s.type === "EXACT")).toBe(true);
  });

  it("parses MOD:00001 alkylated residue with parent", async () => {
    const result = await parseOboFile(join(FIXTURES, "mod-excerpt.obo"), { defaultPrefix: "MOD" });
    const alkyl = result.terms.find((t) => t.accession === "MOD:00001");
    expect(alkyl).toBeDefined();
    expect(alkyl!.label).toBe("alkylated residue");
    expect(alkyl!.synonyms.some((s) => s.text === "AlkylRes" && s.type === "EXACT")).toBe(true);
    expect(alkyl!.parentIds).toContain("MOD:01156");
  });
});

// ---------------------------------------------------------------------------
// CHEBI (OBO)
// ---------------------------------------------------------------------------

describe("OBO parser — CHEBI ontology excerpt", () => {
  it("extracts version from data-version header", async () => {
    const result = await parseOboFile(join(FIXTURES, "chebi-excerpt.obo"), { defaultPrefix: "CHEBI" });
    expect(result.sourceVersion).toBe("250");
  });

  it("parses CHEBI:10 with correct label and parent", async () => {
    const result = await parseOboFile(join(FIXTURES, "chebi-excerpt.obo"), { defaultPrefix: "CHEBI" });
    const term = result.terms.find((t) => t.accession === "CHEBI:10");
    expect(term).toBeDefined();
    expect(term!.label).toBe("(+)-Atherospermoline");
    expect(term!.parentIds).toContain("CHEBI:133004");
  });

  it("parses CHEBI:100 with EXACT synonym and parent", async () => {
    const result = await parseOboFile(join(FIXTURES, "chebi-excerpt.obo"), { defaultPrefix: "CHEBI" });
    const term = result.terms.find((t) => t.accession === "CHEBI:100");
    expect(term).toBeDefined();
    expect(term!.label).toBe("(-)-medicarpin");
    expect(
      term!.synonyms.some(
        (s) =>
          s.text === "(6aR,11aR)-9-methoxy-6a,11a-dihydro-6H-[1]benzofuro[3,2-c]chromen-3-ol" &&
          s.type === "EXACT"
      )
    ).toBe(true);
    expect(term!.parentIds).toContain("CHEBI:16114");
  });
});

// ---------------------------------------------------------------------------
// NCBITaxon (OBO) — with collectRanks
// ---------------------------------------------------------------------------

describe("OBO parser — NCBITaxon ontology excerpt", () => {
  it("extracts version from data-version header", async () => {
    const result = await parseOboFile(join(FIXTURES, "ncbitaxon-excerpt.obo"), {
      defaultPrefix: "NCBITaxon",
    });
    expect(result.sourceVersion).toBe("2025-12-03");
  });

  it("parses NCBITaxon:9606 Homo sapiens with EXACT synonym and parent", async () => {
    const result = await parseOboFile(join(FIXTURES, "ncbitaxon-excerpt.obo"), {
      defaultPrefix: "NCBITaxon",
    });
    const hs = result.terms.find((t) => t.accession === "NCBITaxon:9606");
    expect(hs).toBeDefined();
    expect(hs!.label).toBe("Homo sapiens");
    expect(hs!.synonyms.some((s) => s.text === "human" && s.type === "EXACT")).toBe(true);
    expect(hs!.parentIds).toContain("NCBITaxon:9605");
  });

  it("parses NCBITaxon:10090 Mus musculus with common-name synonym", async () => {
    const result = await parseOboFile(join(FIXTURES, "ncbitaxon-excerpt.obo"), {
      defaultPrefix: "NCBITaxon",
    });
    const mm = result.terms.find((t) => t.accession === "NCBITaxon:10090");
    expect(mm).toBeDefined();
    expect(mm!.label).toBe("Mus musculus");
    expect(mm!.synonyms.some((s) => s.text === "house mouse")).toBe(true);
    expect(mm!.synonyms.some((s) => s.text === "mouse")).toBe(true);
  });

  it("collects rank annotations when collectRanks=true", async () => {
    const result = await parseOboFile(join(FIXTURES, "ncbitaxon-excerpt.obo"), {
      defaultPrefix: "NCBITaxon",
      collectRanks: true,
    });
    expect(result.rankMap).toBeDefined();
    expect(result.rankMap!.get("NCBITaxon:9606")).toBe("NCBITaxon:species");
    expect(result.rankMap!.get("NCBITaxon:9605")).toBe("NCBITaxon:genus");
    expect(result.rankMap!.get("NCBITaxon:10090")).toBe("NCBITaxon:species");
  });
});

// ---------------------------------------------------------------------------
// HP — Human Phenotype Ontology (OBO)
// ---------------------------------------------------------------------------

describe("OBO parser — HP ontology excerpt", () => {
  it("preserves non-standard data-version path prefix verbatim", async () => {
    const result = await parseOboFile(join(FIXTURES, "hp-excerpt.obo"), { defaultPrefix: "HP" });
    // cleanOboVersion only strips a leading "releases/"; "hp/releases/..." is left unchanged
    expect(result.sourceVersion).toBe("hp/releases/2026-02-16");
  });

  it("parses HP:0000002 Abnormality of body height with EXACT synonym and parent", async () => {
    const result = await parseOboFile(join(FIXTURES, "hp-excerpt.obo"), { defaultPrefix: "HP" });
    const term = result.terms.find((t) => t.accession === "HP:0000002");
    expect(term).toBeDefined();
    expect(term!.label).toBe("Abnormality of body height");
    expect(term!.synonyms.some((s) => s.text === "Abnormality of body height" && s.type === "EXACT")).toBe(true);
    expect(term!.parentIds).toContain("HP:0001507");
  });

  it("parses HP:0000003 Multicystic kidney dysplasia with multiple EXACT synonyms", async () => {
    const result = await parseOboFile(join(FIXTURES, "hp-excerpt.obo"), { defaultPrefix: "HP" });
    const term = result.terms.find((t) => t.accession === "HP:0000003");
    expect(term).toBeDefined();
    expect(term!.label).toBe("Multicystic kidney dysplasia");
    expect(term!.synonyms.some((s) => s.text === "Multicystic dysplastic kidney" && s.type === "EXACT")).toBe(true);
    expect(term!.synonyms.some((s) => s.text === "Multicystic renal dysplasia" && s.type === "EXACT")).toBe(true);
    expect(term!.parentIds).toContain("HP:0000107");
  });
});

// ---------------------------------------------------------------------------
// MP — Mammalian Phenotype Ontology (OBO)
// ---------------------------------------------------------------------------

describe("OBO parser — MP ontology excerpt", () => {
  it("extracts version from releases/DATE/filename data-version path", async () => {
    const result = await parseOboFile(join(FIXTURES, "mp-excerpt.obo"), { defaultPrefix: "MP" });
    expect(result.sourceVersion).toBe("2026-02-17/mp.obo");
  });

  it("parses MP:0000003 abnormal adipose tissue morphology with mixed synonym types", async () => {
    const result = await parseOboFile(join(FIXTURES, "mp-excerpt.obo"), { defaultPrefix: "MP" });
    const term = result.terms.find((t) => t.accession === "MP:0000003");
    expect(term).toBeDefined();
    expect(term!.label).toBe("abnormal adipose tissue morphology");
    expect(term!.synonyms.some((s) => s.text === "abnormality of adipose tissue" && s.type === "BROAD")).toBe(true);
    expect(term!.synonyms.some((s) => s.text === "adipose tissue dysplasia" && s.type === "NARROW")).toBe(true);
    expect(term!.parentIds).toContain("MP:0005375");
  });

  it("marks MP:0000002 as obsolete", async () => {
    const result = await parseOboFile(join(FIXTURES, "mp-excerpt.obo"), { defaultPrefix: "MP" });
    const obs = result.terms.find((t) => t.accession === "MP:0000002");
    expect(obs).toBeDefined();
    expect(obs!.obsolete).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FBbt — Drosophila Gross Anatomy Ontology (OBO)
// ---------------------------------------------------------------------------

describe("OBO parser — FBbt ontology excerpt", () => {
  it("preserves non-standard data-version path prefix verbatim", async () => {
    const result = await parseOboFile(join(FIXTURES, "fbbt-excerpt.obo"), { defaultPrefix: "FBbt" });
    expect(result.sourceVersion).toBe("fbbt/releases/2026-01-13");
  });

  it("parses FBbt:00000001 organism with RELATED synonyms", async () => {
    const result = await parseOboFile(join(FIXTURES, "fbbt-excerpt.obo"), { defaultPrefix: "FBbt" });
    const org = result.terms.find((t) => t.accession === "FBbt:00000001");
    expect(org).toBeDefined();
    expect(org!.label).toBe("organism");
    expect(org!.synonyms.some((s) => s.text === "Drosophila" && s.type === "RELATED")).toBe(true);
    expect(org!.synonyms.some((s) => s.text === "whole organism" && s.type === "RELATED")).toBe(true);
  });

  it("parses FBbt:00000002 tagma with correct parent", async () => {
    const result = await parseOboFile(join(FIXTURES, "fbbt-excerpt.obo"), { defaultPrefix: "FBbt" });
    const tagma = result.terms.find((t) => t.accession === "FBbt:00000002");
    expect(tagma).toBeDefined();
    expect(tagma!.label).toBe("tagma");
    expect(tagma!.parentIds).toContain("FBbt:00057001");
  });
});

// ---------------------------------------------------------------------------
// PO — Plant Ontology (OBO)
// ---------------------------------------------------------------------------

describe("OBO parser — PO ontology excerpt", () => {
  it("extracts version from releases/DATE data-version path", async () => {
    const result = await parseOboFile(join(FIXTURES, "po-excerpt.obo"), { defaultPrefix: "PO" });
    expect(result.sourceVersion).toBe("2026-01-09");
  });

  it("parses PO:0000001 plant embryo proper with EXACT synonym and parent", async () => {
    const result = await parseOboFile(join(FIXTURES, "po-excerpt.obo"), { defaultPrefix: "PO" });
    const term = result.terms.find((t) => t.accession === "PO:0000001");
    expect(term).toBeDefined();
    expect(term!.label).toBe("plant embryo proper");
    expect(term!.synonyms.some((s) => s.type === "EXACT")).toBe(true);
    expect(term!.parentIds).toContain("PO:0025099");
  });

  it("parses PO:0000003 whole plant with EXACT and NARROW synonyms", async () => {
    const result = await parseOboFile(join(FIXTURES, "po-excerpt.obo"), { defaultPrefix: "PO" });
    const term = result.terms.find((t) => t.accession === "PO:0000003");
    expect(term).toBeDefined();
    expect(term!.label).toBe("whole plant");
    expect(term!.synonyms.some((s) => s.text === "planta entera (Spanish, exact)" && s.type === "EXACT")).toBe(true);
    expect(term!.synonyms.some((s) => s.text === "tree (narrow)" && s.type === "NARROW")).toBe(true);
    expect(term!.parentIds).toContain("PO:0009011");
  });
});

// ---------------------------------------------------------------------------
// ZFA — Zebrafish Anatomy Ontology (OBO)
// ---------------------------------------------------------------------------

describe("OBO parser — ZFA ontology excerpt", () => {
  it("preserves non-standard data-version path verbatim", async () => {
    const result = await parseOboFile(join(FIXTURES, "zfa-excerpt.obo"), { defaultPrefix: "ZFA" });
    expect(result.sourceVersion).toBe("zfa/releases/2025-09-05/zfa-full.owl");
  });

  it("parses ZFA:0000001 Kupffer's vesicle with EXACT synonym and parent", async () => {
    const result = await parseOboFile(join(FIXTURES, "zfa-excerpt.obo"), { defaultPrefix: "ZFA" });
    const kv = result.terms.find((t) => t.accession === "ZFA:0000001");
    expect(kv).toBeDefined();
    expect(kv!.label).toBe("Kupffer's vesicle");
    expect(kv!.synonyms.some((s) => s.text === "ciliated organ of asymmetry" && s.type === "EXACT")).toBe(true);
    expect(kv!.parentIds).toContain("ZFA:0001105");
  });

  it("parses ZFA:0000003 adaxial cell with EXACT synonym and parent", async () => {
    const result = await parseOboFile(join(FIXTURES, "zfa-excerpt.obo"), { defaultPrefix: "ZFA" });
    const ac = result.terms.find((t) => t.accession === "ZFA:0000003");
    expect(ac).toBeDefined();
    expect(ac!.label).toBe("adaxial cell");
    expect(ac!.synonyms.some((s) => s.text === "adaxial cells" && s.type === "EXACT")).toBe(true);
    expect(ac!.parentIds).toContain("ZFA:0009000");
  });
});

// ---------------------------------------------------------------------------
// FBdv — Drosophila Development Ontology (OBO)
// ---------------------------------------------------------------------------

describe("OBO parser — FBdv ontology excerpt", () => {
  it("preserves non-standard data-version path prefix verbatim", async () => {
    const result = await parseOboFile(join(FIXTURES, "fbdv-excerpt.obo"), { defaultPrefix: "FBdv" });
    expect(result.sourceVersion).toBe("fbdv/releases/2026-01-13");
  });

  it("parses FBdv:00000000 Drosophila life with EXACT synonym", async () => {
    const result = await parseOboFile(join(FIXTURES, "fbdv-excerpt.obo"), { defaultPrefix: "FBdv" });
    const root = result.terms.find((t) => t.accession === "FBdv:00000000");
    expect(root).toBeDefined();
    expect(root!.label).toBe("Drosophila life");
    expect(root!.synonyms.some((s) => s.text === "Drosophila life cycle" && s.type === "EXACT")).toBe(true);
  });

  it("parses FBdv:00000054 cleavage stage with correct parent", async () => {
    const result = await parseOboFile(join(FIXTURES, "fbdv-excerpt.obo"), { defaultPrefix: "FBdv" });
    const cs = result.terms.find((t) => t.accession === "FBdv:00000054");
    expect(cs).toBeDefined();
    expect(cs!.label).toBe("cleavage stage");
    expect(cs!.parentIds).toContain("FBdv:00005259");
  });
});

// ---------------------------------------------------------------------------
// RSO — Rat Strain Ontology (OBO) — prefix RS
// ---------------------------------------------------------------------------

describe("OBO parser — RSO ontology excerpt", () => {
  it("extracts version from data-version header", async () => {
    const result = await parseOboFile(join(FIXTURES, "rso-excerpt.obo"), { defaultPrefix: "RS" });
    expect(result.sourceVersion).toBe("6.271");
  });

  it("parses RS:0000001 A2/Colle with RELATED synonym and parent", async () => {
    const result = await parseOboFile(join(FIXTURES, "rso-excerpt.obo"), { defaultPrefix: "RS" });
    const term = result.terms.find((t) => t.accession === "RS:0000001");
    expect(term).toBeDefined();
    expect(term!.label).toBe("A2/Colle");
    expect(term!.synonyms.some((s) => s.text === "RGD ID: 737949" && s.type === "RELATED")).toBe(true);
    expect(term!.parentIds).toContain("RS:0000270");
  });

  it("parses RS:0000002 AI with RELATED synonym and parent", async () => {
    const result = await parseOboFile(join(FIXTURES, "rso-excerpt.obo"), { defaultPrefix: "RS" });
    const term = result.terms.find((t) => t.accession === "RS:0000002");
    expect(term).toBeDefined();
    expect(term!.label).toBe("AI");
    expect(term!.synonyms.some((s) => s.text === "amelogenesis imperfecta rat" && s.type === "RELATED")).toBe(true);
    expect(term!.parentIds).toContain("RS:0000765");
  });
});

// ---------------------------------------------------------------------------
// BTO — BRENDA Tissue Ontology (OBO)
// ---------------------------------------------------------------------------

describe("OBO parser — BTO ontology excerpt", () => {
  it("extracts version from releases/DATE data-version path", async () => {
    const result = await parseOboFile(join(FIXTURES, "bto-excerpt.obo"), { defaultPrefix: "BTO" });
    expect(result.sourceVersion).toBe("2021-10-26");
  });

  it("parses BTO:0000000 root term with correct label", async () => {
    const result = await parseOboFile(join(FIXTURES, "bto-excerpt.obo"), { defaultPrefix: "BTO" });
    const root = result.terms.find((t) => t.accession === "BTO:0000000");
    expect(root).toBeDefined();
    expect(root!.label).toBe("tissues, cell types and enzyme sources");
    expect(root!.parentIds).toHaveLength(0);
  });

  it("parses BTO:0000001 with correct parent", async () => {
    const result = await parseOboFile(join(FIXTURES, "bto-excerpt.obo"), { defaultPrefix: "BTO" });
    const term = result.terms.find((t) => t.accession === "BTO:0000001");
    expect(term).toBeDefined();
    expect(term!.label).toBe("culture condition:-induced cell");
    expect(term!.parentIds).toContain("BTO:0000216");
  });
});

// ---------------------------------------------------------------------------
// CLO — Cell Line Ontology (OWL)
// ---------------------------------------------------------------------------

describe("OWL parser — CLO ontology excerpt", () => {
  it("extracts version from owl:versionInfo", async () => {
    const result = await parseOwlFile(join(FIXTURES, "clo-excerpt.owl"), { defaultPrefix: "CLO" });
    expect(result.sourceVersion).toBe("2.1.188");
  });

  it("parses CLO:0000000 cell line cell culturing with correct label", async () => {
    const result = await parseOwlFile(join(FIXTURES, "clo-excerpt.owl"), { defaultPrefix: "CLO" });
    const root = result.terms.find((t) => t.accession === "CLO:0000000");
    expect(root).toBeDefined();
    expect(root!.label).toBe("cell line cell culturing");
  });

  it("parses CLO:0000002 suspension cell line culturing with parent CLO:0000000", async () => {
    const result = await parseOwlFile(join(FIXTURES, "clo-excerpt.owl"), { defaultPrefix: "CLO" });
    const susp = result.terms.find((t) => t.accession === "CLO:0000002");
    expect(susp).toBeDefined();
    expect(susp!.label).toBe("suspension cell line culturing");
    expect(susp!.parentIds).toContain("CLO:0000000");
  });

  it("parses CLO:0000003 adherent cell line culturing with parent CLO:0000000", async () => {
    const result = await parseOwlFile(join(FIXTURES, "clo-excerpt.owl"), { defaultPrefix: "CLO" });
    const adh = result.terms.find((t) => t.accession === "CLO:0000003");
    expect(adh).toBeDefined();
    expect(adh!.label).toBe("adherent cell line culturing");
    expect(adh!.parentIds).toContain("CLO:0000000");
  });

  it("discards OBI-prefixed foreign class", async () => {
    const result = await parseOwlFile(join(FIXTURES, "clo-excerpt.owl"), { defaultPrefix: "CLO" });
    expect(result.discardedByPrefix).toContain("OBI:0600024");
    expect(result.terms.find((t) => t.accession === "OBI:0600024")).toBeUndefined();
  });
});
