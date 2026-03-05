import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BuildResult, Manifest, ManifestEntry } from "./types.js";
import { log } from "./utils.js";

/**
 * Writes `manifest.json` and `checksums.sha256` to `outputDir` from the pipeline results.
 *
 * Every result that carries metadata (either freshly built this run, or carried forward from
 * the previous manifest for unchanged ontologies) is included. Results with errors or with
 * no metadata available are skipped; the latter can happen on a first-ever run for an
 * ontology that reported no change, which should not occur in practice.
 *
 * Ontologies with a single output file use a flat manifest shape (`fileName`, `sha256`, …
 * directly on the entry). Ontologies with multiple variants (currently only NCBITaxon) use
 * a `variants` key with one nested entry per variant, matching the schema that
 * `@sdrf-toolkit/ontology-lookup` expects to consume.
 *
 * The `checksums.sha256` file is `sha256sum -c` compatible for quick offline verification.
 */
export async function buildManifest(
    results: BuildResult[],
    outputDir: string,
  indexVersion: string
): Promise<void> {
  const manifest: Manifest = {
    schemaVersion: "1.0",
    updatedAt: new Date().toISOString(),
    ontologies: {},
  };

  const checksumLines: string[] = [];

  for (const result of results) {
    if (result.error) continue;
    if (!result.variants && !result.fileName) continue;

    const entry: ManifestEntry = {
      sourceVersion: result.sourceVersion,
      indexVersion,
    };

    if (result.variants) {
      entry.variants = result.variants;
      for (const v of Object.values(result.variants)) {
        checksumLines.push(`${v.sha256}  ${v.fileName}`);
      }
    } else if (result.fileName) {
      entry.fileName = result.fileName;
      entry.compressedSize = result.compressedSize;
      entry.sha256 = result.sha256;
      entry.termCount = result.termCount;
      checksumLines.push(`${result.sha256}  ${result.fileName}`);
    }

    manifest.ontologies[result.id] = entry;
  }

  const manifestPath = join(outputDir, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  log.info(`Wrote ${manifestPath}`);

  const checksumPath = join(outputDir, "checksums.sha256");
  await writeFile(checksumPath, checksumLines.join("\n") + "\n", "utf-8");
  log.info(`Wrote ${checksumPath}`);
}
