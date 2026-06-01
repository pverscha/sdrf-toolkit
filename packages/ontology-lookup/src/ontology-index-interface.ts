import type { OntologyIndexMeta, OntologySearchResult, OntologyTerm } from "./types.js";

/**
 * Common interface implemented by both OntologyIndex (JSON.gz) and
 * SqliteOntologyIndex (.db). Registry dispatches to whichever is loaded.
 */
export interface IOntologyIndex {
  readonly meta: OntologyIndexMeta;

  search(query: string, limit: number): OntologySearchResult[];
  resolve(value: string): OntologyTerm | null;
  isDescendantOf(childAccession: string, ancestorAccession: string): boolean;
  getDescendants(parentAccession: string): string[];
  getDirectDescendants(parentAccession: string): string[];
}
