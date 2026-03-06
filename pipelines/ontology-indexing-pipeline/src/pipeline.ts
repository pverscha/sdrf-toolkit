import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import yaml from "js-yaml";
import type {
  BuildResult,
  CliOptions,
  Manifest,
  OntologySourceConfig,
  OntologySourcesFile,
  OntologyTermEntry,
} from "./types.js";
import { ensureDir, fileLog, initLogFile, log } from "./utils.js";
import { fetchWithCache } from "./fetch.js";
import { parseOboFile } from "./parsers/obo-parser.js";
import { parseUnimodXml } from "./parsers/unimod-parser.js";
import { parseOwlFile } from "./parsers/owl-parser.js";
import { loadAllowlist, pruneNCBITaxon } from "./pruning.js";
import { buildIndex } from "./index-builder.js";
import { buildManifest } from "./manifest-builder.js";

const ACCESSION_RE = /^[A-Za-z][A-Za-z0-9_]*:[0-9A-Za-z_.-]+$/;

/**
 * Filters out terms that would produce corrupt index entries: those missing an accession or
 * label, and those whose accession doesn't match the canonical `PREFIX:ID` format.
 *
 * Invalid terms are dropped silently (with a warning) rather than aborting the build, because
 * a handful of malformed entries in a 200 K-term ontology should not discard the whole index.
 * Warnings are rate-limited to 5 to avoid flooding the log for systematic issues.
 */
function validateTerms(terms: OntologyTermEntry[], ontologyId: string): OntologyTermEntry[] {
  const valid: OntologyTermEntry[] = [];
  let warned = 0;

  for (const term of terms) {
    if (!term.accession || !term.label) {
      if (warned < 5) {
        log.warn(`[${ontologyId}] Term missing accession or label: ${JSON.stringify(term)}`);
      } else {
        fileLog.warn(`[${ontologyId}] Term missing accession or label: ${JSON.stringify(term)}`);
      }
      warned++;
      continue;
    }
    if (!ACCESSION_RE.test(term.accession)) {
      if (warned < 5) {
        log.warn(`[${ontologyId}] Invalid accession format: ${term.accession}`);
      } else {
        fileLog.warn(`[${ontologyId}] Invalid accession format: ${term.accession}`);
      }
      warned++;
      continue;
    }
    valid.push(term);
  }

  if (warned > 5) {
    log.warn(`[${ontologyId}] ... and ${warned - 5} more validation warnings`);
  }

  return valid;
}

/**
 * Warns about parent accessions that don't resolve within the same index file.
 *
 * Dangling references are expected and harmless: OBO files regularly import terms from
 * other ontologies (e.g. MONDO terms can have HP or DOID parents), and those foreign
 * accessions will not appear in the MONDO index. The warning exists purely to surface
 * unexpected breakage, not to enforce strict integrity. Output is capped at 10 unique
 * dangling IDs to keep the log readable.
 */
function checkParentIntegrity(terms: OntologyTermEntry[], ontologyId: string): void {
  const accessions = new Set(terms.map((t) => t.accession));
  const shownDangling = new Set<string>();
  let danglingCount = 0;

  for (const term of terms) {
    for (const parentId of term.parentIds) {
      if (!accessions.has(parentId) && !shownDangling.has(parentId)) {
        if (danglingCount < 10) {
          log.warn(`[${ontologyId}] Dangling parent ref: ${parentId} (from ${term.accession})`);
        } else {
          fileLog.warn(`[${ontologyId}] Dangling parent ref: ${parentId} (from ${term.accession})`);
        }
        shownDangling.add(parentId);
        danglingCount++;
      }
    }
  }

  if (danglingCount > 10) {
    log.warn(
      `[${ontologyId}] ... and ${danglingCount - 10} more dangling parent refs (cross-ontology imports are expected)`
    );
  }
}

/**
 * Reads and parses the existing `manifest.json` from a previous pipeline run.
 * Returns `null` if no manifest exists yet (first run) or if the file is malformed.
 * Used to carry forward metadata for ontologies that haven't changed.
 */
async function loadExistingManifest(outputDir: string): Promise<Manifest | null> {
  const manifestPath = join(outputDir, "manifest.json");
  if (!existsSync(manifestPath)) return null;
  try {
    const content = await readFile(manifestPath, "utf-8");
    return JSON.parse(content) as Manifest;
  } catch {
    return null;
  }
}

/**
 * Runs the full fetch → parse → validate → build cycle for a single ontology.
 *
 * Returns early with `changed: false` if the upstream file hasn't changed since the last
 * run (HTTP 304 or matching cache metadata). In that case no index file is written; the
 * caller is responsible for populating the result's metadata from the previous manifest so
 * the entry still appears in the new `manifest.json`.
 *
 * NCBITaxon is the only ontology with special handling: `collectRanks` is enabled during
 * parsing so that the pruning step can identify genus-and-above terms, and two separate
 * index files are produced (`ncbitaxon.json.gz` full, `ncbitaxon-pruned.json.gz` pruned).
 * All other ontologies go through the generic single-file path.
 */
async function processOntology(
  config: OntologySourceConfig,
  dataDir: string,
  outputDir: string,
  indexVersion: string,
  allowlistPath: string,
  force: boolean
): Promise<BuildResult> {
  const ext = config.format === "unimod_xml" ? "xml" : config.format === "owl" ? "owl" : "obo";
  const sourceFile = join(dataDir, `${config.id}.${ext}`);
  const metaFile = join(dataDir, `${config.id}.cache.json`);

  const { changed } = await fetchWithCache(config.source_url, sourceFile, metaFile, force);

  if (!changed && !force) {
    const expectedFiles =
      config.id === "ncbitaxon" && config.pruning?.enabled
        ? [
            join(outputDir, `${config.id}.json.gz`),
            join(outputDir, `${config.id}-pruned.json.gz`),
          ]
        : [join(outputDir, `${config.id}.json.gz`)];

    if (expectedFiles.every((f) => existsSync(f))) {
      log.info(`  Skipping (unchanged): ${config.id}`);
      return { id: config.id, sourceVersion: "cached", changed: false };
    }

    log.info(`  Output file(s) missing, rebuilding: ${config.id}`);
    // fall through to full parse → validate → buildIndex
  }

  let terms: OntologyTermEntry[];
  let sourceVersion: string;
  let rankMap: Map<string, string> | undefined;

  if (config.format === "obo") {
    const isNCBITaxon = config.id === "ncbitaxon";
    const parsed = await parseOboFile(sourceFile, {
      defaultPrefix: config.default_prefix,
      additionalPrefixes: config.additional_prefixes,
      collectRanks: isNCBITaxon,
    });
    terms = parsed.terms;
    sourceVersion = parsed.sourceVersion || new Date().toISOString().slice(0, 10);
    rankMap = parsed.rankMap;

    const { discardedByPrefix } = parsed;
    if (discardedByPrefix.length > 0) {
      const prefixCounts = new Map<string, number>();
      for (const acc of discardedByPrefix) {
        const prefix = acc.split(":")[0];
        prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
      }
      const summary = [...prefixCounts.entries()].map(([p, n]) => `${p}: ${n}`).join(", ");
      log.warn(`[${config.id}] Discarded ${discardedByPrefix.length} cross-prefix terms (${summary})`);
      fileLog.warn(`[${config.id}] Full list of ${discardedByPrefix.length} cross-prefix discarded accessions:`);
      for (const acc of discardedByPrefix) {
        fileLog.warn(`[${config.id}]   discarded: ${acc}`);
      }
    }
  } else if (config.format === "unimod_xml") {
    const parsed = await parseUnimodXml(sourceFile);
    terms = parsed.terms;
    sourceVersion = parsed.sourceVersion || new Date().toISOString().slice(0, 10);
  } else if (config.format === "owl") {
    const parsed = await parseOwlFile(sourceFile, {
      defaultPrefix: config.default_prefix,
      additionalPrefixes: config.additional_prefixes,
    });
    terms = parsed.terms;
    sourceVersion = parsed.sourceVersion || new Date().toISOString().slice(0, 10);

    const { discardedByPrefix } = parsed;
    if (discardedByPrefix.length > 0) {
      const prefixCounts = new Map<string, number>();
      for (const acc of discardedByPrefix) {
        const prefix = acc.split(":")[0];
        prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
      }
      const summary = [...prefixCounts.entries()].map(([p, n]) => `${p}: ${n}`).join(", ");
      log.warn(`[${config.id}] Discarded ${discardedByPrefix.length} cross-prefix terms (${summary})`);
      fileLog.warn(`[${config.id}] Full list of ${discardedByPrefix.length} cross-prefix discarded accessions:`);
      for (const acc of discardedByPrefix) {
        fileLog.warn(`[${config.id}]   discarded: ${acc}`);
      }
    }
  } else {
    throw new Error(`Unknown format: ${String(config.format)}`);
  }

  log.info(`  Parsed ${terms.length} raw terms`);

  terms = validateTerms(terms, config.id);
  checkParentIntegrity(terms, config.id);

  log.info(`  ${terms.length} valid terms after validation`);

  if (terms.length === 0) {
    throw new Error(`Produced 0 valid terms after validation`);
  }

  // NCBITaxon: produce full + pruned variants
  if (config.id === "ncbitaxon" && config.pruning?.enabled) {
    const allowlist = await loadAllowlist(allowlistPath);

    const fullResult = await buildIndex(
      config,
      terms,
      sourceVersion,
      outputDir,
      indexVersion,
      "full"
    );

    const prunedTerms = pruneNCBITaxon(terms, rankMap!, allowlist);
    log.info(`  Pruned to ${prunedTerms.length} terms`);

    if (prunedTerms.length === 0) {
      throw new Error(`Pruned NCBITaxon produced 0 terms — check the species allowlist`);
    }

    const prunedResult = await buildIndex(
      config,
      prunedTerms,
      sourceVersion,
      outputDir,
      indexVersion,
      "pruned"
    );

    return {
      id: config.id,
      sourceVersion,
      changed: true,
      variants: {
        full: fullResult,
        pruned: prunedResult,
      },
    };
  }

  const result = await buildIndex(config, terms, sourceVersion, outputDir, indexVersion);

  return {
    id: config.id,
    sourceVersion,
    changed: true,
    fileName: result.fileName,
    compressedSize: result.compressedSize,
    sha256: result.sha256,
    termCount: result.termCount,
  };
}

export async function runPipeline(
  sourcesYamlPath: string,
  allowlistPath: string,
  options: CliOptions
): Promise<void> {
  const { outputDir, dataDir, ontologies: filter, force, indexVersion } = options;

  await ensureDir(outputDir);
  await ensureDir(dataDir);
  initLogFile(outputDir);

  const yamlContent = await readFile(sourcesYamlPath, "utf-8");
  const sourcesFile = yaml.load(yamlContent) as OntologySourcesFile;

  let configs = sourcesFile.ontologies;

  if (filter && filter.length > 0) {
    configs = configs.filter((c) => filter.includes(c.id));
    log.info(`Filtering to ontologies: ${filter.join(", ")}`);
  }

  // Load the previous manifest before any processing so we can carry forward metadata
  // for ontologies that haven't changed. This must happen before the loop because the
  // manifest file is overwritten at the end of the run.
  const existingManifest = await loadExistingManifest(outputDir);

  log.info(`Processing ${configs.length} ontologies…`);

  const results: BuildResult[] = [];

  for (const config of configs) {
    log.info(`\n[${config.id}] ${config.full_name}`);
    try {
      const result = await processOntology(
        config,
        dataDir,
        outputDir,
        indexVersion,
        allowlistPath,
        force
      );
      results.push(result);
    } catch (err) {
      log.error(`Failed to process ${config.id}: ${err}`);
      results.push({
        id: config.id,
        sourceVersion: "",
        changed: false,
        error: String(err),
      });
    }
  }

  // Enrich unchanged results with metadata from the previous manifest so they still appear
  // as complete entries in the new manifest.json. Without this, a consumer reading the
  // manifest would see gaps for any ontology that didn't need a rebuild this run.
  const enrichedResults = results.map((result) => {
    if (result.changed || result.error) return result;

    const existing = existingManifest?.ontologies[result.id];
    if (!existing) {
      log.warn(
        `[${result.id}] No previous manifest entry for unchanged ontology; it will be omitted. Re-run with --force to rebuild.`
      );
      return result;
    }

    return existing.variants
      ? { ...result, sourceVersion: existing.sourceVersion, variants: existing.variants }
      : {
          ...result,
          sourceVersion: existing.sourceVersion,
          fileName: existing.fileName,
          compressedSize: existing.compressedSize,
          sha256: existing.sha256,
          termCount: existing.termCount,
        };
  });

  await buildManifest(enrichedResults, outputDir, indexVersion);

  const succeeded = results.filter((r) => r.changed && !r.error).length;
  const skipped = results.filter((r) => !r.changed && !r.error).length;
  const failed = results.filter((r) => r.error).length;

  log.info(`\nPipeline complete: ${succeeded} built, ${skipped} skipped, ${failed} failed`);

  if (failed > 0) {
    const failedIds = results.filter((r) => r.error).map((r) => r.id);
    throw new Error(
      `${failed} ontolog${failed === 1 ? "y" : "ies"} failed to process: ${failedIds.join(", ")}`
    );
  }
}
