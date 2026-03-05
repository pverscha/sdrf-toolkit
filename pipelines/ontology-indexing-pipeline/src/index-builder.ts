import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createGunzip, createGzip } from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";
import type {
  OntologyIndexFile,
  OntologySourceConfig,
  OntologyTermEntry,
  VariantResult,
} from "./types.js";
import { ensureDir, log, sha256OfFile } from "./utils.js";

/**
 * Serialises `terms` into an `OntologyIndexFile`, compresses it with gzip (level 9), and
 * writes it to `<outputDir>/<id>.json.gz` (or `<id>-<variant>.json.gz` for non-full variants).
 *
 * File naming follows the convention expected by `@sdrf-toolkit/ontology-lookup`:
 * - No `variant` or `variant = "full"` → `<id>.json.gz` (canonical name, e.g. `ncbitaxon.json.gz`)
 * - Any other variant string → `<id>-<variant>.json.gz` (e.g. `ncbitaxon-pruned.json.gz`)
 *
 * The `meta.termCount` in the output reflects only non-obsolete terms so consumers can
 * display an accurate "active term" count; obsolete terms are still written to `terms[]`
 * so lookups by accession continue to work for deprecated entries.
 *
 * After writing, the file is decompressed and parsed in-memory to verify the roundtrip
 * produced the expected term count. A mismatch logs a warning rather than throwing,
 * because the file is still usable and a crash here would discard all earlier work.
 */
export async function buildIndex(
  config: OntologySourceConfig,
  terms: OntologyTermEntry[],
  sourceVersion: string,
  outputDir: string,
  indexVersion: string,
  variant?: string
): Promise<VariantResult> {
  await ensureDir(outputDir);

  // "full" variant keeps the canonical name (<id>.json.gz); "pruned" appends suffix
  const fileName =
    variant && variant !== "full"
      ? `${config.id}-${variant}.json.gz`
      : `${config.id}.json.gz`;
  const filePath = join(outputDir, fileName);

  const nonObsolete = terms.filter((t) => !t.obsolete);
  const obsolete = terms.filter((t) => t.obsolete);

  const indexFile: OntologyIndexFile = {
    meta: {
      ontology: config.id,
      fullName: config.full_name,
      defaultPrefix: config.default_prefix,
      additionalPrefixes: config.additional_prefixes,
      sourceVersion,
      sourceUrl: config.source_url,
      builtAt: new Date().toISOString(),
      termCount: nonObsolete.length,
      obsoleteTermCount: obsolete.length,
      schemaVersion: "1.0",
    },
    terms,
  };

  const json = JSON.stringify(indexFile);
  const readable = Readable.from([json]);
  const gzip = createGzip({ level: 9 });
  const ws = createWriteStream(filePath);

  await pipeline(readable, gzip, ws);

  // Gzip roundtrip verification
  await verifyGzip(filePath, terms.length);

  const sha256 = await sha256OfFile(filePath);
  const { size } = await stat(filePath);

  log.info(`  Built ${fileName}: ${terms.length} terms, ${(size / 1024).toFixed(1)} KB compressed`);

  return {
    fileName,
    compressedSize: size,
    sha256,
    termCount: terms.length,
  };
}

/**
 * Decompresses the written file and counts its terms as a sanity check.
 * This catches silent failures such as a truncated gzip stream or a JSON serialisation bug
 * that would otherwise only surface at read-time in the consuming package.
 */
async function verifyGzip(filePath: string, expectedCount: number): Promise<void> {
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    const rs = createReadStream(filePath);
    const gz = createGunzip();
    rs.pipe(gz);
    gz.on("data", (chunk: Buffer) => chunks.push(chunk));
    gz.on("end", resolve);
    gz.on("error", reject);
    rs.on("error", reject);
  });

  const json = Buffer.concat(chunks).toString("utf-8");
  const parsed = JSON.parse(json) as OntologyIndexFile;

  if (parsed.terms.length !== expectedCount) {
    log.warn(
      `  Roundtrip verification FAILED: expected ${expectedCount} terms, got ${parsed.terms.length}`
    );
  }
}
