import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readIndexFile } from "./parsers/index-parser.js";
import { openSqliteIndex } from "./parsers/sqlite-parser.js";
import { readManifestFile } from "./parsers/manifest-parser.js";
import { OntologyIndex } from "./ontology-index.js";
import { Updater } from "./updater.js";
import type { IOntologyIndex } from "./ontology-index-interface.js";
import type {
  OntologyRegistryOptions,
  OntologyTerm,
  OntologySearchResult,
  Manifest,
} from "./types.js";

export class OntologyRegistry {
  private readonly options: OntologyRegistryOptions;
  private readonly indexes = new Map<string, IOntologyIndex>();
  private manifest: Manifest | null = null;
  private readonly updater = new Updater();

  constructor(options: OntologyRegistryOptions) {
    this.options = options;
  }

  /**
   * Load specified ontologies from disk.
   * Call once at application startup before using search/resolve/hierarchy methods.
   */
  async initialize(): Promise<void> {
    const { indexDir, ontologies } = this.options;

    const manifestPath = join(indexDir, "manifest.json");
    if (existsSync(manifestPath)) {
      this.manifest = readManifestFile(manifestPath);
    }

    let ontologyIds: string[];
    if (ontologies && ontologies.length > 0) {
      ontologyIds = ontologies;
    } else {
      if (!existsSync(indexDir)) return;
      // Auto-discover: *.json.gz (in-memory indexes) and *.db (SQLite indexes)
      const files = readdirSync(indexDir);
      const jsonIds = files
        .filter((f) => f.endsWith(".json.gz"))
        .map((f) => f.slice(0, -".json.gz".length));
      const dbIds = files
        .filter((f) => f.endsWith(".db") && !f.endsWith(".db.gz"))
        .map((f) => f.slice(0, -".db".length));
      // Merge, deduplicating (db takes precedence if both somehow exist)
      ontologyIds = [...new Set([...jsonIds, ...dbIds])];
    }

    for (const id of ontologyIds) {
      await this.loadOntology(id);
    }
  }

  private async loadOntology(id: string): Promise<void> {
    const { indexDir } = this.options;
    const manifestEntry = this.manifest?.ontologies[id];
    const manifestFileName = manifestEntry?.fileName;

    let filePath: string;
    let isSqlite = false;

    if (manifestFileName) {
      if (manifestFileName.endsWith(".db.gz")) {
        // SQLite index: manifest records the .db.gz name; we open the decompressed .db
        filePath = join(indexDir, manifestFileName);
        isSqlite = true;
      } else {
        filePath = join(indexDir, manifestFileName);
      }
    } else {
      // No manifest entry: try .db first, then .json.gz
      const dbPath = join(indexDir, `${id}.db`);
      const dbGzPath = join(indexDir, `${id}.db.gz`);
      if (existsSync(dbPath) || existsSync(dbGzPath)) {
        filePath = existsSync(dbGzPath) ? dbGzPath : dbPath;
        isSqlite = true;
      } else {
        filePath = join(indexDir, `${id}.json.gz`);
      }
    }

    if (isSqlite) {
      // Ensure we have the .db.gz or .db file
      const dbGzPath = filePath.endsWith(".db.gz") ? filePath : filePath + ".gz";
      const dbPath = filePath.endsWith(".db.gz") ? filePath.slice(0, -".gz".length) : filePath;

      if (!existsSync(dbPath) && !existsSync(dbGzPath)) {
        console.warn(`[ontology-lookup] SQLite index not found, skipping: ${dbPath}`);
        return;
      }

      try {
        const index = await openSqliteIndex(existsSync(dbGzPath) ? dbGzPath : dbPath);
        this.indexes.set(id, index);
      } catch (err) {
        console.warn(`[ontology-lookup] Failed to load SQLite index for ${id}: ${err}`);
      }
      return;
    }

    if (!existsSync(filePath)) {
      console.warn(`[ontology-lookup] Index file not found, skipping: ${filePath}`);
      return;
    }

    try {
      const indexFile = readIndexFile(filePath);
      this.indexes.set(id, new OntologyIndex(indexFile));
    } catch (err) {
      console.warn(`[ontology-lookup] Failed to load index for ${id}: ${err}`);
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

    const manifestPath = join(this.options.indexDir, "manifest.json");
    if (existsSync(manifestPath)) {
      this.manifest = readManifestFile(manifestPath);
    }

    for (const id of result.updated) {
      await this.loadOntology(id);
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
   * Returns the `updatedAt` timestamp of the locally installed ontology index
   * (from manifest.json), or null if no manifest is present.
   */
  getVersion(): string | null {
    return this.manifest?.updatedAt ?? null;
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
      allResults.push(...index.search(query, limit));
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
      const result = index.resolve(value);
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
    return index.isDescendantOf(termAccession, parentAccession);
  }

  /**
   * Returns all descendant accessions of parentAccession in the given ontology.
   * The parent itself is NOT included in the result.
   */
  getDescendants(parentAccession: string, ontology: string): string[] {
    const index = this.indexes.get(ontology);
    if (!index) return [];
    return index.getDescendants(parentAccession);
  }

  /**
   * Returns the direct (immediate) child accessions of parentAccession in the
   * given ontology. Unlike getDescendants, this does NOT traverse transitively.
   */
  getDirectDescendants(parentAccession: string, ontology: string): string[] {
    const index = this.indexes.get(ontology);
    if (!index) return [];
    return index.getDirectDescendants(parentAccession);
  }
}
