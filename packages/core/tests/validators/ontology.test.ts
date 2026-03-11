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
});
