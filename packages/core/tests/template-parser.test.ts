import { describe, it, expect } from "vitest";
import { parseTemplate } from "../src/templates/parser.js";

const SIMPLE_YAML = `
name: test-template
description: A test template
version: 1.2.3
usable_alone: true
columns:
  - name: source name
    description: Sample ID
    requirement: required
    cardinality: single
    allow_not_applicable: false
    allow_not_available: false
    allow_anonymized: false
    allow_pooled: false
    validators: []
`;

const EXTENDED_YAML = `
name: child-template
description: Child
version: 1.0.0
extends: parent-template
usable_alone: false
layer: sample
mutually_exclusive_with:
  - other-template
validators:
  - validator_name: trailing_whitespace_validator
    params: {}
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

const CONSTRAINED_EXTENDS_YAML = `
name: specific-template
description: Specific
version: 2.0.0
extends: base-template@>=1.0.0
usable_alone: false
columns:
  - name: source name
    description: Sample ID
    requirement: required
    validators: []
`;

const WITH_TYPE_YAML = `
name: typed-template
description: Typed
version: 1.0.0
usable_alone: true
columns:
  - name: sample count
    description: Number of samples
    requirement: optional
    type: integer
    validators: []
`;

const WITH_REQUIRES_YAML = `
name: requires-template
description: Needs sample layer
version: 1.0.0
usable_alone: false
requires:
  - layer: sample
  - layer: experiment
columns:
  - name: source name
    description: Sample ID
    requirement: required
    validators: []
`;

const WITH_EXCLUDES_YAML = `
name: excludes-template
description: Excludes some cols
version: 1.0.0
usable_alone: false
excludes:
  templates:
    - base
  categories:
    - comment
  columns:
    - assay name
columns:
  - name: source name
    description: Sample ID
    requirement: required
    validators: []
`;

describe("parseTemplate", () => {
  it("parses a simple template", () => {
    const template = parseTemplate(SIMPLE_YAML);
    expect(template.name).toBe("test-template");
    expect(template.description).toBe("A test template");
    expect(template.version).toBe("1.2.3");
    expect(template.usable_alone).toBe(true);
    expect(template.extends).toBeUndefined();
    expect(template.columns).toHaveLength(1);
    expect(template.columns![0].name).toBe("source name");
    expect(template.columns![0].requirement).toBe("required");
  });

  it("parses extends and layer fields", () => {
    const template = parseTemplate(EXTENDED_YAML);
    expect(template.name).toBe("child-template");
    expect(template.extends).toBe("parent-template");
    expect(template.extendsName).toBe("parent-template");
    expect(template.extendsConstraint).toBeUndefined();
    expect(template.layer).toBe("sample");
    expect(template.mutually_exclusive_with).toEqual(["other-template"]);
  });

  it("parses validators at template and column level", () => {
    const template = parseTemplate(EXTENDED_YAML);
    expect(template.validators).toHaveLength(1);
    expect(template.validators![0].validator_name).toBe("trailing_whitespace_validator");

    const col = template.columns![0];
    expect(col.cardinality).toBe("multiple");
    expect(col.allow_not_applicable).toBe(true);
    expect(col.validators).toHaveLength(1);
    expect(col.validators![0].validator_name).toBe("ontology");
    expect(col.validators![0].params["ontologies"]).toEqual(["mondo"]);
  });

  it("throws on missing name field", () => {
    expect(() => parseTemplate("description: oops\nversion: 1.0.0\nusable_alone: false"))
      .toThrow();
  });

  it("throws on non-mapping YAML", () => {
    expect(() => parseTemplate("- item1\n- item2")).toThrow();
  });

  it("defaults usable_alone to true when omitted", () => {
    const yaml = `
name: no-usable-alone
description: Test
version: 1.0.0
columns:
  - name: source name
    validators: []
`;
    const template = parseTemplate(yaml);
    expect(template.usable_alone).toBe(true);
  });

  it("parses constrained extends into extendsName and extendsConstraint", () => {
    const template = parseTemplate(CONSTRAINED_EXTENDS_YAML);
    expect(template.extends).toBe("base-template@>=1.0.0");
    expect(template.extendsName).toBe("base-template");
    expect(template.extendsConstraint).toBe(">=1.0.0");
  });

  it("throws when columns array is empty", () => {
    const yaml = `
name: no-columns
description: Test
version: 1.0.0
usable_alone: false
columns: []
`;
    expect(() => parseTemplate(yaml)).toThrow("at least one column");
  });

  it("throws when columns field is absent", () => {
    const yaml = `
name: no-columns
description: Test
version: 1.0.0
usable_alone: false
`;
    expect(() => parseTemplate(yaml)).toThrow("at least one column");
  });

  it("parses type field on columns", () => {
    const template = parseTemplate(WITH_TYPE_YAML);
    expect(template.columns![0].type).toBe("integer");
  });

  it("parses requires field", () => {
    const template = parseTemplate(WITH_REQUIRES_YAML);
    expect(template.requires).toHaveLength(2);
    expect(template.requires![0].layer).toBe("sample");
    expect(template.requires![1].layer).toBe("experiment");
  });

  it("parses excludes field", () => {
    const template = parseTemplate(WITH_EXCLUDES_YAML);
    expect(template.excludes).toBeDefined();
    expect(template.excludes!.templates).toEqual(["base"]);
    expect(template.excludes!.categories).toEqual(["comment"]);
    expect(template.excludes!.columns).toEqual(["assay name"]);
  });
});
