import type { SdrfFile } from "../types/sdrf.js";

/**
 * Serialize an SdrfFile back to a TSV string.
 * Headers are written as the first row, then one row per SdrfRow, joined by tabs,
 * with newline (\n) line endings.
 */
export function serializeSdrf(file: SdrfFile): string {
  const lines: string[] = [];

  lines.push(file.headers.join("\t"));

  for (const row of file.rows) {
    const columnCounts = new Map<string, number>();
    const values = file.headers.map(h => {
      const count = columnCounts.get(h) ?? 0;
      columnCounts.set(h, count + 1);
      return (row.cells[h] ?? [])[count] ?? "";
    });
    lines.push(values.join("\t"));
  }

  return lines.join("\n");
}
