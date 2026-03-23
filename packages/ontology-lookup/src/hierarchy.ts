import type { OntologyIndex } from "./ontology-index.js";

/**
 * Returns true if childAccession is a proper descendant of ancestorAccession
 * by traversing the IS_A parent chain upward. Handles DAG (multiple parents)
 * via a visited set to prevent infinite loops.
 */
export function isDescendantOf(
  index: OntologyIndex,
  childAccession: string,
  ancestorAccession: string
): boolean {
  const visited = new Set<string>();
  const queue = [childAccession];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const term = index.termsById.get(current);
    if (!term) continue;

    for (const parentId of term.parentIds) {
      if (parentId === ancestorAccession) return true;
      if (!visited.has(parentId)) queue.push(parentId);
    }
  }

  return false;
}

/**
 * Returns all descendant accessions of parentAccession (not including the
 * parent itself). Builds the children-of index lazily via index.getChildrenOf(),
 * then BFS downward. Handles DAG correctly — each accession appears at most once.
 */
export function getDescendants(index: OntologyIndex, parentAccession: string): string[] {
  const childrenOf = index.getChildrenOf();
  const result: string[] = [];
  const visited = new Set<string>([parentAccession]);
  const queue = [parentAccession];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = childrenOf.get(current) ?? [];
    for (const child of children) {
      if (!visited.has(child)) {
        visited.add(child);
        result.push(child);
        queue.push(child);
      }
    }
  }

  return result;
}

/**
 * Returns the direct (immediate) child accessions of parentAccession.
 * Unlike getDescendants, this does NOT traverse transitively — only one level down.
 * Returns an empty array if the parent has no children or is not found.
 */
export function getDirectDescendants(index: OntologyIndex, parentAccession: string): string[] {
  return index.getChildrenOf().get(parentAccession) ?? [];
}
