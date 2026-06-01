import { existsSync, statSync, createWriteStream } from "node:fs";
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { SqliteOntologyIndex } from "../sqlite-ontology-index.js";

/**
 * Opens a SQLite ontology index from a `.db` or `.db.gz` file.
 *
 * If `dbGzPath` ends in `.db.gz` and the corresponding `.db` file either
 * does not exist or is older than the `.db.gz`, it is decompressed first
 * (one-time cost on first use after download). Subsequent calls open the
 * already-decompressed `.db` file directly.
 */
export async function openSqliteIndex(dbGzPath: string): Promise<SqliteOntologyIndex> {
  const dbPath = dbGzPath.endsWith(".db.gz")
    ? dbGzPath.slice(0, -".gz".length)
    : dbGzPath;

  if (dbGzPath.endsWith(".db.gz")) {
    const needsDecompress =
      !existsSync(dbPath) ||
      statSync(dbPath).mtimeMs < statSync(dbGzPath).mtimeMs;

    if (needsDecompress) {
      await decompressDb(dbGzPath, dbPath);
    }
  }

  return new SqliteOntologyIndex(dbPath);
}

async function decompressDb(srcGz: string, destDb: string): Promise<void> {
  const readStream = createReadStream(srcGz);
  const gunzip = createGunzip();
  const writeStream = createWriteStream(destDb);
  await pipeline(readStream, gunzip, writeStream);
}
