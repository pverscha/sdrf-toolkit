import Database from "better-sqlite3";
import type { OntologyIndexMeta, OntologySearchResult, OntologyTerm, SynonymEntry } from "./types.js";
import type { IOntologyIndex } from "./ontology-index-interface.js";

interface TermRow {
  accession: string;
  label: string;
  obsolete: number;
  replaced_by: string;
  xrefs: string;
}

interface SynonymRow {
  accession: string;
  text: string;
  type: string;
  is_label: number;
}

function escapeFts5(query: string): string {
  return query.replace(/"/g, '""');
}

/**
 * Ontology index backed by a SQLite database file.
 *
 * Implements IOntologyIndex using prepared statements and FTS5 for prefix
 * search, without loading any terms into memory at construction time.
 * The database must already be decompressed (.db file, not .db.gz).
 */
export class SqliteOntologyIndex implements IOntologyIndex {
  readonly meta: OntologyIndexMeta;

  private readonly db: Database.Database;
  private readonly stmtTermByAccession: Database.Statement<[string], TermRow>;
  private readonly stmtSynonymsByAccession: Database.Statement<[string], SynonymRow>;
  private readonly stmtParentsByChild: Database.Statement<[string], { parent: string }>;
  private readonly stmtExactLabel: Database.Statement<[string], { accession: string }>;
  private readonly stmtExactSynonym: Database.Statement<[string], { accession: string }>;
  private readonly stmtFtsPrefix: Database.Statement<[string, number], SynonymRow>;
  private readonly stmtSubstring: Database.Statement<[string, string, number], SynonymRow>;
  private readonly stmtIsDescendant: Database.Statement<[string, string], { found: number }>;
  private readonly stmtAllDescendants: Database.Statement<[string], { child: string }>;
  private readonly stmtDirectChildren: Database.Statement<[string], { child: string }>;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { readonly: true });
    this.db.pragma("cache_size = -32768"); // 32 MB page cache

    this.meta = this.readMeta();

    this.stmtTermByAccession = this.db.prepare<[string], TermRow>(
      "SELECT accession, label, obsolete, replaced_by, xrefs FROM terms WHERE accession = ?"
    );

    this.stmtSynonymsByAccession = this.db.prepare<[string], SynonymRow>(
      "SELECT accession, text, type, is_label FROM synonyms WHERE accession = ?"
    );

    this.stmtParentsByChild = this.db.prepare<[string], { parent: string }>(
      "SELECT parent FROM parents WHERE child = ?"
    );

    // Tier 2: exact label (is_label = 1 means this row is the primary label)
    this.stmtExactLabel = this.db.prepare<[string], { accession: string }>(
      "SELECT accession FROM synonyms WHERE is_label = 1 AND lower(text) = lower(?)"
    );

    // Tier 3: exact synonym any type (including label)
    this.stmtExactSynonym = this.db.prepare<[string], { accession: string }>(
      "SELECT DISTINCT accession FROM synonyms WHERE lower(text) = lower(?)"
    );

    // Tier 4 + initial tier 5: FTS5 phrase-prefix query (unicode61 tokenizer)
    this.stmtFtsPrefix = this.db.prepare<[string, number], SynonymRow>(`
      SELECT s.accession, s.text, s.type, s.is_label
      FROM synonyms_fts fts
      JOIN synonyms s ON s.rowid = fts.rowid
      WHERE synonyms_fts MATCH ?
      LIMIT ?
    `);

    // Tier 5 fallback: plain LIKE for substrings not matched by FTS5 prefix
    this.stmtSubstring = this.db.prepare<[string, string, number], SynonymRow>(`
      SELECT accession, text, type, is_label
      FROM synonyms
      WHERE lower(text) LIKE lower(?)
        AND lower(text) NOT LIKE lower(?)
      LIMIT ?
    `);

    // Recursive CTE: walk up the parent chain from child looking for ancestor
    this.stmtIsDescendant = this.db.prepare<[string, string], { found: number }>(`
      WITH RECURSIVE anc(a) AS (
        SELECT parent FROM parents WHERE child = ?
        UNION ALL
        SELECT p.parent FROM parents p JOIN anc ON p.child = anc.a
      )
      SELECT 1 AS found FROM anc WHERE a = ? LIMIT 1
    `);

    // Recursive CTE: all descendants of a parent
    this.stmtAllDescendants = this.db.prepare<[string], { child: string }>(`
      WITH RECURSIVE desc(c) AS (
        SELECT child FROM parents WHERE parent = ?
        UNION ALL
        SELECT p.child FROM parents p JOIN desc ON p.parent = desc.c
      )
      SELECT DISTINCT c AS child FROM desc
    `);

    this.stmtDirectChildren = this.db.prepare<[string], { child: string }>(
      "SELECT child FROM parents WHERE parent = ?"
    );
  }

  private readMeta(): OntologyIndexMeta {
    const rows = this.db.prepare<[], { key: string; value: string }>(
      "SELECT key, value FROM meta"
    ).all();
    const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      ontology: m["ontology"] ?? "",
      fullName: m["fullName"] ?? "",
      defaultPrefix: m["defaultPrefix"] ?? "",
      additionalPrefixes: JSON.parse(m["additionalPrefixes"] ?? "[]") as string[],
      sourceVersion: m["sourceVersion"] ?? "",
      indexVersion: m["indexVersion"] ?? "",
      sourceUrl: m["sourceUrl"] ?? "",
      builtAt: m["builtAt"] ?? "",
      termCount: parseInt(m["termCount"] ?? "0", 10),
      obsoleteTermCount: parseInt(m["obsoleteTermCount"] ?? "0", 10),
      schemaVersion: m["schemaVersion"] ?? "",
    };
  }

  private termRowToOntologyTerm(row: TermRow, synonyms: SynonymRow[]): OntologyTerm {
    return {
      accession: row.accession,
      label: row.label,
      synonyms: synonyms.filter((s) => s.is_label === 0).map((s) => s.text),
      ontology: this.meta.ontology,
      obsolete: row.obsolete === 1,
    };
  }

  private fetchTerm(accession: string): OntologyTerm | null {
    const row = this.stmtTermByAccession.get(accession);
    if (!row) return null;
    const synonyms = this.stmtSynonymsByAccession.all(accession);
    return this.termRowToOntologyTerm(row, synonyms);
  }

  search(query: string, limit: number): OntologySearchResult[] {
    const normalized = query.toLowerCase().trim();
    const queryTrimmed = query.trim();
    const results = new Map<string, OntologySearchResult>();

    const add = (accession: string, score: number, matchType: OntologySearchResult["matchType"]): void => {
      const existing = results.get(accession);
      if (!existing || existing.score < score) {
        const term = this.fetchTerm(accession);
        if (term) {
          results.set(accession, { term, matchType, score });
        }
      }
    };

    // Tier 1: exact accession
    if (queryTrimmed.includes(":")) {
      const row = this.stmtTermByAccession.get(queryTrimmed);
      if (row) add(row.accession, 1.0, "accession");
    }

    // Tier 2: exact label
    for (const row of this.stmtExactLabel.all(normalized)) {
      add(row.accession, 1.0, "label");
    }

    // Tier 3: exact synonym (any type)
    for (const row of this.stmtExactSynonym.all(normalized)) {
      add(row.accession, 0.9, "synonym");
    }

    // Tier 4 + 5: FTS5 phrase-prefix then substring fallback
    if (normalized.length >= 3) {
      const ftsQuery = `"${escapeFts5(normalized)}"*`;
      const ftsRows = this.stmtFtsPrefix.all(ftsQuery, limit * 4);
      const prefixPattern = `${normalized}%`;

      for (const row of ftsRows) {
        const lowerText = row.text.toLowerCase();
        if (lowerText === normalized) continue;
        if (lowerText.startsWith(normalized)) {
          // Tier 4: prefix match
          add(row.accession, row.is_label ? 0.8 : 0.7, row.is_label ? "label" : "synonym");
        } else {
          // Tier 5: substring match (FTS5 found it via word tokenization, but it's not a string prefix)
          add(row.accession, row.is_label ? 0.5 : 0.4, row.is_label ? "label" : "synonym");
        }
      }

      // Additional tier 5 via LIKE for substrings not surfaced by FTS5
      if (results.size < limit) {
        const subRows = this.stmtSubstring.all(`%${normalized}%`, prefixPattern, limit * 2);
        for (const row of subRows) {
          add(row.accession, row.is_label ? 0.5 : 0.4, row.is_label ? "label" : "synonym");
        }
      }
    }

    return Array.from(results.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  resolve(value: string): OntologyTerm | null {
    const normalized = value.toLowerCase().trim();
    const valueTrimmed = value.trim();

    // Tier 1: exact accession
    if (valueTrimmed.includes(":")) {
      const row = this.stmtTermByAccession.get(valueTrimmed);
      if (row) {
        const synonyms = this.stmtSynonymsByAccession.all(row.accession);
        return this.termRowToOntologyTerm(row, synonyms);
      }
    }

    // Tier 2: exact label
    const labelRow = this.stmtExactLabel.get(normalized);
    if (labelRow) {
      const term = this.stmtTermByAccession.get(labelRow.accession);
      if (term) {
        const synonyms = this.stmtSynonymsByAccession.all(term.accession);
        return this.termRowToOntologyTerm(term, synonyms);
      }
    }

    // Tier 3: EXACT synonym only
    const synRow = this.db.prepare<[string], { accession: string; type: string }>(
      "SELECT accession, type FROM synonyms WHERE lower(text) = lower(?) AND type = 'EXACT' AND is_label = 0 LIMIT 1"
    ).get(normalized);
    if (synRow) {
      const term = this.stmtTermByAccession.get(synRow.accession);
      if (term) {
        const synonyms = this.stmtSynonymsByAccession.all(term.accession);
        return this.termRowToOntologyTerm(term, synonyms);
      }
    }

    return null;
  }

  isDescendantOf(childAccession: string, ancestorAccession: string): boolean {
    const row = this.stmtIsDescendant.get(childAccession, ancestorAccession);
    return row !== undefined;
  }

  getDescendants(parentAccession: string): string[] {
    return this.stmtAllDescendants.all(parentAccession).map((r) => r.child);
  }

  getDirectDescendants(parentAccession: string): string[] {
    return this.stmtDirectChildren.all(parentAccession).map((r) => r.child);
  }

  close(): void {
    this.db.close();
  }
}
