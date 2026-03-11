import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TemplateRegistry } from "../src/templates/registry.js";

async function makeTempDir(templates: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sdrf-test-"));
  await Promise.all(
    Object.entries(templates).map(([name, yaml]) =>
      writeFile(join(dir, `${name}.yaml`), yaml, "utf8")
    )
  );
  return dir;
}

const BASE_YAML = `
name: base
description: Base template
version: 1.0.0
usable_alone: false
validators:
  - validator_name: trailing_whitespace_validator
    params: {}
columns:
  - name: source name
    description: Sample ID
    requirement: required
    cardinality: single
    validators: []
  - name: assay name
    description: Assay ID
    requirement: required
    cardinality: single
    validators: []
`;

const HUMAN_YAML = `
name: human
description: Human template
version: 1.0.0
extends: base
usable_alone: false
layer: sample
mutually_exclusive_with:
  - vertebrates
columns:
  - name: characteristics[disease]
    description: Disease
    requirement: required
    cardinality: multiple
    allow_not_applicable: true
    allow_not_available: true
    validators:
      - validator_name: ontology
        params:
          ontologies:
            - mondo
          error_level: warning
`;

const MS_YAML = `
name: ms-proteomics
description: MS template
version: 1.0.0
extends: base
usable_alone: false
layer: experiment
columns:
  - name: comment[instrument]
    description: Instrument
    requirement: required
    cardinality: single
    validators: []
`;

const DDA_YAML = `
name: dda-acquisition
description: DDA template
version: 1.0.0
extends: ms-proteomics
usable_alone: false
layer: experiment
columns:
  - name: comment[precursor mass tolerance]
    description: Precursor tolerance
    requirement: required
    cardinality: single
    validators: []
`;

const VERTEBRATES_YAML = `
name: vertebrates
description: Vertebrates
version: 1.0.0
extends: base
usable_alone: false
layer: sample
mutually_exclusive_with:
  - human
columns:
  - name: characteristics[organism]
    description: Organism
    requirement: required
    validators: []
`;

const REQUIRES_SAMPLE_YAML = `
name: requires-sample
description: Requires sample layer
version: 1.0.0
usable_alone: false
layer: experiment
requires:
  - layer: sample
columns:
  - name: comment[instrument]
    description: Instrument
    requirement: required
    validators: []
`;

describe("TemplateRegistry", () => {
  let registry: TemplateRegistry;
  let dir: string;

  beforeEach(async () => {
    dir = await makeTempDir({
      base: BASE_YAML,
      human: HUMAN_YAML,
      "ms-proteomics": MS_YAML,
      "dda-acquisition": DDA_YAML,
      vertebrates: VERTEBRATES_YAML,
      "requires-sample": REQUIRES_SAMPLE_YAML,
    });
    registry = new TemplateRegistry(dir);
    await registry.initialize();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it("lists all available templates after initialize", () => {
    const names = registry.getAvailableTemplates();
    expect(names).toContain("base");
    expect(names).toContain("human");
    expect(names).toContain("ms-proteomics");
    expect(names).toContain("dda-acquisition");
  });

  it("retrieves a raw template by name", () => {
    const tmpl = registry.getTemplate("human");
    expect(tmpl).toBeDefined();
    expect(tmpl!.name).toBe("human");
    expect(tmpl!.extends).toBe("base");
  });

  it("returns undefined for unknown template", () => {
    expect(registry.getTemplate("nonexistent")).toBeUndefined();
  });

  it("filters templates by layer", () => {
    const sampleTemplates = registry.getTemplatesByLayer("sample");
    const names = sampleTemplates.map(t => t.name);
    expect(names).toContain("human");
    expect(names).toContain("vertebrates");
    expect(names).not.toContain("ms-proteomics");
    expect(names).not.toContain("base"); // base has no layer
  });

  it("returns mutual exclusions for a template", () => {
    const exclusions = registry.getMutuallyExclusiveWith("human");
    expect(exclusions).toContain("vertebrates");
  });

  it("returns mutual exclusions bidirectionally", () => {
    // vertebrates says mutually_exclusive_with: [human], so human should appear in vertebrates exclusions
    const exclusions = registry.getMutuallyExclusiveWith("vertebrates");
    expect(exclusions).toContain("human");
  });

  it("resolves a single template expanding its chain", async () => {
    const resolved = await registry.resolveTemplates(["human"]);
    expect(resolved.composedFrom).toEqual(["base", "human"]);
    expect(resolved.columns.map(c => c.name)).toContain("source name");
    expect(resolved.columns.map(c => c.name)).toContain("characteristics[disease]");
  });

  it("resolves multiple templates and deduplicates base", async () => {
    const resolved = await registry.resolveTemplates(["human", "dda-acquisition"]);
    // base should appear only once in composedFrom
    const baseCount = resolved.composedFrom.filter(n => n === "base").length;
    expect(baseCount).toBe(1);
    // All columns from both chains should be present
    const colNames = resolved.columns.map(c => c.name);
    expect(colNames).toContain("source name");            // from base
    expect(colNames).toContain("characteristics[disease]"); // from human
    expect(colNames).toContain("comment[instrument]");      // from ms-proteomics
    expect(colNames).toContain("comment[precursor mass tolerance]"); // from dda-acquisition
  });

  it("global validators are merged and deduplicated", async () => {
    const resolved = await registry.resolveTemplates(["human"]);
    // "trailing_whitespace_validator" comes from base — should appear once
    const names = resolved.globalValidators.map(v => v.validatorName);
    expect(names.filter(n => n === "trailing_whitespace_validator")).toHaveLength(1);
  });

  it("throws on circular extends", async () => {
    const circularDir = await makeTempDir({
      a: "name: a\ndescription: A\nversion: 1.0.0\nusable_alone: false\nextends: b\ncolumns:\n  - name: col a\n    validators: []",
      b: "name: b\ndescription: B\nversion: 1.0.0\nusable_alone: false\nextends: a\ncolumns:\n  - name: col b\n    validators: []",
    });
    try {
      const reg = new TemplateRegistry(circularDir);
      await reg.initialize();
      await expect(reg.resolveTemplates(["a"])).rejects.toThrow(/[Cc]ircular/);
    } finally {
      await rm(circularDir, { recursive: true });
    }
  });

  it("throws when requires layer is absent from the combination", async () => {
    // requires-sample needs a "sample" layer template, but we only give it alone
    await expect(registry.resolveTemplates(["requires-sample"])).rejects.toThrow(
      /requires a "sample" layer/
    );
  });

  it("resolves successfully when required layer is present", async () => {
    // human provides layer: sample, requires-sample needs layer: sample
    const resolved = await registry.resolveTemplates(["human", "requires-sample"]);
    expect(resolved.composedFrom).toContain("human");
    expect(resolved.composedFrom).toContain("requires-sample");
  });
});
