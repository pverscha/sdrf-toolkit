import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readIndexFile } from "./formats/index-format.js";
import { OntologyIndex } from "./ontology-index.js";
import { searchIndex, resolveIndex } from "./search.js";
import { isDescendantOf, getDescendants } from "./hierarchy.js";
import { Updater } from "./updater.js";
import type {
  OntologyRegistryOptions,
  OntologyTerm,
  OntologySearchResult,
  Manifest,
} from "./types.js";

export class OntologyRegistry {
  private readonly options: OntologyRegistryOptions;
  private readonly indexes = new Map<string, OntologyIndex>();
  private manifest: Manifest | null = null;
  private readonly updater = new Updater();

  constructor(options: OntologyRegistryOptions) {
    this.options = options;
  }

  /**
   * Load specified ontologies from disk into memory.
   * Call once at application startup before using search/resolve/hierarchy methods.
   */
  async initialize(): Promise<void> {
    const { indexDir, ontologies } = this.options;

    // Load local manifest if present
    const manifestPath = join(indexDir, "manifest.json");
    if (existsSync(manifestPath)) {
      try {
        this.manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
      } catch {
        this.manifest = null;
      }
    }

    // Determine which ontology IDs to load
    let ontologyIds: string[];
    if (ontologies && ontologies.length > 0) {
      ontologyIds = ontologies;
    } else {
      // Auto-discover: glob all *.json.gz in indexDir, derive IDs from file names
      if (!existsSync(indexDir)) return;
      ontologyIds = readdirSync(indexDir)
        .filter(f => f.endsWith(".json.gz"))
        .map(f => f.slice(0, -".json.gz".length));
    }

    for (const id of ontologyIds) {
      this.loadOntology(id);
    }
  }

  private loadOntology(id: string): void {
    const { indexDir, ontologyOptions } = this.options;
    const variant = ontologyOptions?.[id]?.variant;

    let fileName: string;

    if (variant) {
      const variantInfo = this.manifest?.ontologies[id]?.variants?.[variant];
      fileName = variantInfo?.fileName ?? `${id}-${variant}.json.gz`;
    } else {
      const manifestEntry = this.manifest?.ontologies[id];
      fileName = manifestEntry?.fileName ?? `${id}.json.gz`;
    }

    const filePath = join(indexDir, fileName);

    if (!existsSync(filePath)) {
      console.warn(`[ontology-lookup] Index file not found, skipping: ${filePath}`);
      return;
    }

    try {
      const indexFile = readIndexFile(filePath);
      this.indexes.set(id, new OntologyIndex(indexFile));
    } catch (err) {
      console.warn(`[ontology-lookup] Failed to load index ${fileName}: ${err}`);
    }
  }

  /**
   * Check for and download updated indexes from the configured GitHub release.
   * Reloads any ontologies that changed. Returns which were updated vs. current.
   */
  async update(): Promise<{ updated: string[]; alreadyCurrent: string[] }> {
    if (!this.options.updateSource) {
      throw new Error(
        "updateSource option is required to call update(). " +
        "Set it to a GitHub owner/repo path (e.g., \"owner/repo\")."
      );
    }

    const result = await this.updater.checkAndUpdate(
      this.options.indexDir,
      this.options.updateSource,
      this.manifest
    );

    // Re-read the updated manifest from disk
    const manifestPath = join(this.options.indexDir, "manifest.json");
    if (existsSync(manifestPath)) {
      this.manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
    }

    // Reload each updated ontology
    for (const id of result.updated) {
      this.loadOntology(id);
    }

    return result;
  }

  /** Returns true if the given ontology is loaded in memory. */
  isLoaded(ontology: string): boolean {
    return this.indexes.has(ontology);
  }

  /** Returns the IDs of all currently loaded ontologies. */
  getLoadedOntologies(): string[] {
    return Array.from(this.indexes.keys());
  }

  /**
   * Search for matching terms across the specified ontologies.
   * Results are merged across ontologies and sorted by score descending.
   */
  search(
    query: string,
    ontologies: string[],
    options?: { limit?: number }
  ): OntologySearchResult[] {
    const limit = options?.limit ?? 10;
    const allResults: OntologySearchResult[] = [];

    for (const ontology of ontologies) {
      const index = this.indexes.get(ontology);
      if (!index) continue;
      allResults.push(...searchIndex(index, query, limit));
    }

    return allResults.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Strictly resolve a value to an ontology term (exact label, exact EXACT synonym,
   * or exact accession). Returns null if not found. Checks ontologies in order.
   */
  resolve(value: string, ontologies: string[]): OntologyTerm | null {
    for (const ontology of ontologies) {
      const index = this.indexes.get(ontology);
      if (!index) continue;
      const result = resolveIndex(index, value);
      if (result) return result;
    }
    return null;
  }

  /**
   * Returns true if termAccession is a descendant of parentAccession in the
   * given ontology (traverses the IS_A chain upward via BFS).
   */
  isDescendantOf(termAccession: string, parentAccession: string, ontology: string): boolean {
    const index = this.indexes.get(ontology);
    if (!index) return false;
    return isDescendantOf(index, termAccession, parentAccession);
  }

  /**
   * Returns all descendant accessions of parentAccession in the given ontology.
   * The parent itself is NOT included in the result.
   */
  getDescendants(parentAccession: string, ontology: string): string[] {
    const index = this.indexes.get(ontology);
    if (!index) return [];
    return getDescendants(index, parentAccession);
  }
}
