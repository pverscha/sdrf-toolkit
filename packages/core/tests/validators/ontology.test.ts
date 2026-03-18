import { describe, it, expect, vi } from "vitest";
import { OntologyValidator } from "../../src/validation/validators/ontology.js";
import type { OntologyRegistry } from "@sdrf-toolkit/ontology-lookup";
import { makeContext } from "./helpers.js";

/** Minimal OntologyRegistry stub for isolated unit testing. */
function makeRegistry(overrides: Partial<OntologyRegistry> = {}): OntologyRegistry {
  return {
    resolve: vi.fn().mockReturnValue(null),
    isDescendantOf: vi.fn().mockReturnValue(false),
    ...overrides,
  } as unknown as OntologyRegistry;
}

describe("OntologyValidator", () => {
  describe("term lookup", () => {
    it("accepts a value found in the configured ontologies", async () => {
      const registry = makeRegistry({
        resolve: vi.fn().mockReturnValue({ accession: "MS:1000031", ontology: "ms" }),
      });
      const v = new OntologyValidator(registry, { ontologies: ["ms"] });
      const result = await v.validate("mass spectrometer", makeContext());
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it("rejects a value not found in any configured ontology", async () => {
      const registry = makeRegistry({ resolve: vi.fn().mockReturnValue(null) });
      const v = new OntologyValidator(registry, { ontologies: ["ms"] });
      const result = await v.validate("unknown term", makeContext());
      expect(result.valid).toBe(false);
      expect(result.issues[0].level).toBe("error");
      expect(result.issues[0].validatorName).toBe("ontology");
    });

    it("passes the correct ontology list to registry.resolve", async () => {
      const resolveFn = vi.fn().mockReturnValue({ accession: "PATO:0001861", ontology: "pato" });
      const registry = makeRegistry({ resolve: resolveFn });
      const v = new OntologyValidator(registry, { ontologies: ["pato", "uo"] });
      await v.validate("mass unit", makeContext());
      expect(resolveFn).toHaveBeenCalledWith("mass unit", ["pato", "uo"]);
    });
  });

  describe("parent term check", () => {
    it("accepts a term that is a descendant of the required parent", async () => {
      const registry = makeRegistry({
        resolve: vi.fn().mockReturnValue({ accession: "MS:1000031", ontology: "ms" }),
        isDescendantOf: vi.fn().mockReturnValue(true),
      });
      const v = new OntologyValidator(registry, {
        ontologies: ["ms"],
        parent_term: "MS:1000031",
      });
      const result = await v.validate("Orbitrap", makeContext());
      expect(result.valid).toBe(true);
    });

    it("rejects a term that is not a descendant of the required parent", async () => {
      const registry = makeRegistry({
        resolve: vi.fn().mockReturnValue({ accession: "MS:9999999", ontology: "ms" }),
        isDescendantOf: vi.fn().mockReturnValue(false),
      });
      const v = new OntologyValidator(registry, {
        ontologies: ["ms"],
        parent_term: "MS:1000031",
      });
      const result = await v.validate("some unrelated term", makeContext());
      expect(result.valid).toBe(false);
      expect(result.issues[0].message).toMatch(/MS:1000031/);
    });

    it("skips the parent term check when no parent_term is configured", async () => {
      const isDescendantOf = vi.fn().mockReturnValue(false);
      const registry = makeRegistry({
        resolve: vi.fn().mockReturnValue({ accession: "MS:1000031", ontology: "ms" }),
        isDescendantOf,
      });
      const v = new OntologyValidator(registry, { ontologies: ["ms"] });
      const result = await v.validate("any term", makeContext());
      expect(result.valid).toBe(true);
      expect(isDescendantOf).not.toHaveBeenCalled();
    });
  });

  describe("error level", () => {
    it("issues a warning (not an error) when error_level is 'warning' and term not found", async () => {
      const registry = makeRegistry({ resolve: vi.fn().mockReturnValue(null) });
      const v = new OntologyValidator(registry, {
        ontologies: ["ms"],
        error_level: "warning",
      });
      const result = await v.validate("unknown", makeContext());
      expect(result.valid).toBe(true);
      expect(result.issues[0].level).toBe("warning");
    });

    it("issues a warning when parent term check fails and error_level is 'warning'", async () => {
      const registry = makeRegistry({
        resolve: vi.fn().mockReturnValue({ accession: "MS:9999", ontology: "ms" }),
        isDescendantOf: vi.fn().mockReturnValue(false),
      });
      const v = new OntologyValidator(registry, {
        ontologies: ["ms"],
        parent_term: "MS:1000031",
        error_level: "warning",
      });
      const result = await v.validate("wrong term", makeContext());
      expect(result.valid).toBe(true);
      expect(result.issues[0].level).toBe("warning");
    });
  });

  it("includes value and column name in the issue", async () => {
    const registry = makeRegistry({ resolve: vi.fn().mockReturnValue(null) });
    const v = new OntologyValidator(registry, { ontologies: ["ms"] });
    const ctx = makeContext();
    const result = await v.validate("unknown term", ctx);
    expect(result.issues[0].value).toBe("unknown term");
    expect(result.issues[0].columnName).toBe(ctx.columnDef.name);
  });

  it("mentions the ontology name in the error message", async () => {
    const registry = makeRegistry({ resolve: vi.fn().mockReturnValue(null) });
    const v = new OntologyValidator(registry, { ontologies: ["pato"] });
    const result = await v.validate("something", makeContext());
    expect(result.issues[0].message).toMatch(/pato/);
  });

  describe("structured SDRF value parsing (NT=…;AC=…)", () => {
    it("resolves via NT label for full structured value 'NT=homo sapiens;AC=NCBITaxon:9606'", async () => {
      const resolveFn = vi.fn().mockReturnValue({ accession: "NCBITaxon:9606", ontology: "ncbitaxon" });
      const registry = makeRegistry({ resolve: resolveFn });
      const v = new OntologyValidator(registry, { ontologies: ["ncbitaxon"] });
      const result = await v.validate("NT=homo sapiens;AC=NCBITaxon:9606", makeContext());
      expect(result.valid).toBe(true);
      // NT label should be tried first
      expect(resolveFn).toHaveBeenCalledWith("homo sapiens", ["ncbitaxon"]);
    });

    it("resolves via NT label when only NT is present", async () => {
      const resolveFn = vi.fn().mockReturnValue({ accession: "NCBITaxon:9606", ontology: "ncbitaxon" });
      const registry = makeRegistry({ resolve: resolveFn });
      const v = new OntologyValidator(registry, { ontologies: ["ncbitaxon"] });
      const result = await v.validate("NT=homo sapiens", makeContext());
      expect(result.valid).toBe(true);
      expect(resolveFn).toHaveBeenCalledWith("homo sapiens", ["ncbitaxon"]);
    });

    it("falls back to AC accession when NT label lookup fails", async () => {
      const resolveFn = vi.fn()
        .mockReturnValueOnce(null)                                              // NT label miss
        .mockReturnValueOnce({ accession: "NCBITaxon:9606", ontology: "ncbitaxon" }); // AC hit
      const registry = makeRegistry({ resolve: resolveFn });
      const v = new OntologyValidator(registry, { ontologies: ["ncbitaxon"] });
      const result = await v.validate("NT=homo sapiens;AC=NCBITaxon:9606", makeContext());
      expect(result.valid).toBe(true);
      expect(resolveFn).toHaveBeenNthCalledWith(1, "homo sapiens", ["ncbitaxon"]);
      expect(resolveFn).toHaveBeenNthCalledWith(2, "NCBITaxon:9606", ["ncbitaxon"]);
    });

    it("resolves a plain label without structured syntax", async () => {
      const resolveFn = vi.fn().mockReturnValue({ accession: "NCBITaxon:9606", ontology: "ncbitaxon" });
      const registry = makeRegistry({ resolve: resolveFn });
      const v = new OntologyValidator(registry, { ontologies: ["ncbitaxon"] });
      const result = await v.validate("homo sapiens", makeContext());
      expect(result.valid).toBe(true);
      expect(resolveFn).toHaveBeenCalledWith("homo sapiens", ["ncbitaxon"]);
    });

    it("resolves a plain accession without structured syntax", async () => {
      const resolveFn = vi.fn().mockReturnValue({ accession: "NCBITaxon:9606", ontology: "ncbitaxon" });
      const registry = makeRegistry({ resolve: resolveFn });
      const v = new OntologyValidator(registry, { ontologies: ["ncbitaxon"] });
      const result = await v.validate("NCBITaxon:9606", makeContext());
      expect(result.valid).toBe(true);
      expect(resolveFn).toHaveBeenCalledWith("NCBITaxon:9606", ["ncbitaxon"]);
    });

    it("validates full modification parameters value as a single structured term", async () => {
      const resolveFn = vi.fn().mockReturnValue({ accession: "UNIMOD:35", ontology: "unimod" });
      const registry = makeRegistry({ resolve: resolveFn });
      const v = new OntologyValidator(registry, { ontologies: ["unimod"] });
      const result = await v.validate("NT=Oxidation;MT=variable;TA=M;AC=UNIMOD:35", makeContext());
      expect(result.valid).toBe(true);
      expect(resolveFn).toHaveBeenCalledWith("Oxidation", ["unimod"]);
    });

    it("rejects when neither NT nor AC resolves", async () => {
      const registry = makeRegistry({ resolve: vi.fn().mockReturnValue(null) });
      const v = new OntologyValidator(registry, { ontologies: ["ncbitaxon"] });
      const result = await v.validate("NT=not a real term;AC=FAKE:0001", makeContext());
      expect(result.valid).toBe(false);
      expect(result.issues[0].level).toBe("error");
    });

  });
});
