import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";
import Database from "better-sqlite3";
import type {
  OntologySourceConfig,
  OntologyTermEntry,
  VariantResult,
} from "./types.js";
import { ensureDir, log, sha256OfFile } from "./utils.js";
import { SCHEMA_VERSION } from "./version.js";

const SCHEMA_SQL = `
  CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE terms (
    accession TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    obsolete INTEGER NOT NULL DEFAULT 0,
    replaced_by TEXT NOT NULL DEFAULT '[]',
    xrefs TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE synonyms (
    rowid INTEGER PRIMARY KEY,
    accession TEXT NOT NULL REFERENCES terms(accession),
    text TEXT NOT NULL,
    type TEXT NOT NULL,
    is_label INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_syn_accession ON synonyms(accession);
  CREATE INDEX idx_syn_text ON synonyms(lower(text));

  CREATE TABLE parents (
    child TEXT NOT NULL,
    parent TEXT NOT NULL,
    PRIMARY KEY (child, parent)
  );
  CREATE INDEX idx_parents_child ON parents(child);
  CREATE INDEX idx_parents_parent ON parents(parent);

  CREATE VIRTUAL TABLE synonyms_fts USING fts5(
    accession UNINDEXED,
    text,
    content='synonyms',
    content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 1'
  );
`;

/**
 * Builds a SQLite database index from `terms` and compresses it to `<id>.db.gz`.
 *
 * The uncompressed `.db` file is also kept in `outputDir` so callers can open
 * it directly without decompression (useful for local testing).
 *
 * Schema:
 * - `meta`: key/value pairs for OntologyIndexMeta fields
 * - `terms`: one row per term (accession, label, obsolete, replaced_by, xrefs)
 * - `synonyms`: one row per synonym/label (with is_label flag for scoring)
 * - `parents`: one row per (child, parent) edge for hierarchy traversal
 * - `synonyms_fts`: FTS5 virtual table (content='synonyms') for prefix search
 */
export async function buildSqliteIndex(
  config: OntologySourceConfig,
  terms: OntologyTermEntry[],
  sourceVersion: string,
  outputDir: string,
  indexVersion: string
): Promise<VariantResult> {
  await ensureDir(outputDir);

  const dbPath = join(outputDir, `${config.id}.db`);
  const dbGzPath = join(outputDir, `${config.id}.db.gz`);

  const db = new Database(dbPath);

  try {
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("temp_store = MEMORY");
    db.pragma("cache_size = -65536"); // 64 MB page cache

    db.exec(SCHEMA_SQL);

    const nonObsolete = terms.filter((t) => !t.obsolete);
    const obsolete = terms.filter((t) => t.obsolete);

    const metaInsert = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
    const metaData: [string, string][] = [
      ["ontology", config.id],
      ["fullName", config.full_name],
      ["defaultPrefix", config.default_prefix],
      ["additionalPrefixes", JSON.stringify(config.additional_prefixes)],
      ["sourceVersion", sourceVersion],
      ["indexVersion", indexVersion],
      ["sourceUrl", config.source_url],
      ["builtAt", new Date().toISOString()],
      ["termCount", String(nonObsolete.length)],
      ["obsoleteTermCount", String(obsolete.length)],
      ["schemaVersion", SCHEMA_VERSION],
    ];
    for (const [key, value] of metaData) {
      metaInsert.run(key, value);
    }

    const insertTerm = db.prepare(
      "INSERT INTO terms (accession, label, obsolete, replaced_by, xrefs) VALUES (?, ?, ?, ?, ?)"
    );
    const insertSynonym = db.prepare(
      "INSERT INTO synonyms (accession, text, type, is_label) VALUES (?, ?, ?, ?)"
    );
    const insertParent = db.prepare(
      "INSERT OR IGNORE INTO parents (child, parent) VALUES (?, ?)"
    );

    const insertAll = db.transaction((allTerms: OntologyTermEntry[]) => {
      for (const term of allTerms) {
        insertTerm.run(
          term.accession,
          term.label,
          term.obsolete ? 1 : 0,
          JSON.stringify(term.replacedBy),
          JSON.stringify(term.xrefs)
        );

        // Label inserted as EXACT synonym with is_label=1 for tier-2 scoring in search
        insertSynonym.run(term.accession, term.label, "EXACT", 1);

        for (const syn of term.synonyms) {
          insertSynonym.run(term.accession, syn.text, syn.type, 0);
        }

        for (const parentId of term.parentIds) {
          insertParent.run(term.accession, parentId);
        }
      }
    });

    log.info(`  Inserting ${terms.length} terms into SQLite...`);
    insertAll(terms);

    log.info(`  Building FTS5 index...`);
    db.exec("INSERT INTO synonyms_fts(synonyms_fts) VALUES('rebuild')");

    db.exec("ANALYZE");
    db.exec("VACUUM");
  } finally {
    db.close();
  }

  log.info(`  Compressing ${config.id}.db → ${config.id}.db.gz...`);
  const readStream = createReadStream(dbPath);
  const gzip = createGzip({ level: 9 });
  const writeStream = createWriteStream(dbGzPath);
  await pipeline(readStream, gzip, writeStream);

  const sha256 = await sha256OfFile(dbGzPath);
  const { size } = await stat(dbGzPath);

  log.info(
    `  Built ${config.id}.db.gz: ${terms.length} terms, ${(size / 1024 / 1024).toFixed(1)} MB compressed`
  );

  return {
    fileName: `${config.id}.db.gz`,
    compressedSize: size,
    sha256,
    termCount: terms.length,
  };
}
