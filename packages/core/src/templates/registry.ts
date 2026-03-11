import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseTemplate } from "./parser.js";
import { mergeTemplates } from "./merger.js";
import { satisfiesConstraint } from "./semver-utils.js";
import type { RawSdrfTemplate, SdrfTemplate } from "../types/template.js";

export class TemplateRegistry {
  private readonly templates = new Map<string, RawSdrfTemplate>();

  constructor(private readonly directory: string) {}

  /**
   * Load all available templates from the directory.
   * Call once at startup.
   */
  async initialize(): Promise<void> {
    const entries = await readdir(this.directory);
    const yamlFiles = entries.filter(f => f.endsWith(".yaml"));
    await Promise.all(
      yamlFiles.map(async file => {
        const name = file.slice(0, -".yaml".length);
        const yaml = await readFile(join(this.directory, file), "utf8");
        const template = parseTemplate(yaml);
        this.templates.set(template.name, template);
      })
    );
  }

  /** Get a single raw (unmerged) template by name */
  getTemplate(name: string): RawSdrfTemplate | undefined {
    return this.templates.get(name);
  }

  /** List all available template names */
  getAvailableTemplates(): string[] {
    return Array.from(this.templates.keys());
  }

  /** Get templates filtered by layer */
  getTemplatesByLayer(layer: string): RawSdrfTemplate[] {
    return Array.from(this.templates.values()).filter(t => t.layer === layer);
  }

  /**
   * Check which templates are mutually exclusive with a given template.
   * Returns all template names that cannot be combined with `name`.
   */
  getMutuallyExclusiveWith(name: string): string[] {
    const template = this.templates.get(name);
    if (!template) return [];

    const exclusions = new Set<string>(template.mutually_exclusive_with ?? []);

    // Also include any template that lists `name` in its own mutually_exclusive_with
    for (const [otherName, other] of this.templates) {
      if (otherName !== name && (other.mutually_exclusive_with ?? []).includes(name)) {
        exclusions.add(otherName);
      }
    }

    return Array.from(exclusions);
  }

  /**
   * Resolve a set of template names into a single merged SdrfTemplate.
   * Handles "extends" chains automatically.
   *
   * Example: resolveTemplates(["human", "dda-acquisition"])
   *   → expands chains → deduplicates → merges into one SdrfTemplate.
   */
  async resolveTemplates(names: string[]): Promise<SdrfTemplate> {
    // Expand each name into its full dependency chain
    const allChains: string[][] = names.map(name => this.expandChain(name));

    // Linearize: combine all chains in order, keeping first occurrence of each name
    const seen = new Set<string>();
    const linearized: RawSdrfTemplate[] = [];

    for (const chain of allChains) {
      for (const name of chain) {
        if (!seen.has(name)) {
          seen.add(name);
          const template = this.templates.get(name);
          if (!template) {
            // If not in registry, try to load it on demand
            const yaml = await readFile(join(this.directory, `${name}.yaml`), "utf8");
            const parsed = parseTemplate(yaml);
            this.templates.set(parsed.name, parsed);
            linearized.push(parsed);
          } else {
            linearized.push(template);
          }
        }
      }
    }

    // Enforce requires layer dependencies
    const layers = new Set(
      linearized.map(t => t.layer).filter((l): l is string => Boolean(l))
    );
    for (const template of linearized) {
      for (const req of template.requires ?? []) {
        if (!layers.has(req.layer)) {
          throw new Error(
            `Template "${template.name}" requires a "${req.layer}" layer template, ` +
            `but none is present in the combination.`
          );
        }
      }
    }

    return mergeTemplates(linearized);
  }

  /**
   * Expand a template name into its full inheritance chain, ordered from
   * most-base to most-specific: [base, ..., name].
   */
  private expandChain(name: string): string[] {
    const chain: string[] = [];
    const visited = new Set<string>();

    const walk = (current: string) => {
      if (visited.has(current)) {
        throw new Error(`Circular "extends" detected in template "${current}".`);
      }
      visited.add(current);

      const template = this.templates.get(current);
      if (!template) {
        throw new Error(
          `Template "${current}" was referenced but is not loaded. ` +
          `Call initialize() first or load "${current}" explicitly.`
        );
      }

      if (template.extendsName) {
        const parentName = template.extendsName;
        const parent = this.templates.get(parentName);
        if (parent && template.extendsConstraint &&
            !satisfiesConstraint(parent.version, template.extendsConstraint)) {
          console.warn(
            `Template "${template.name}" requires "${parentName}@${template.extendsConstraint}" ` +
            `but found version ${parent.version}.`
          );
        }
        walk(parentName);
      }

      chain.push(current);
    };

    walk(name);
    return chain;
  }
}
