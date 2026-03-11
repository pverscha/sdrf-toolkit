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
    const values = file.headers.map(h => row.cells[h] ?? "");
    lines.push(values.join("\t"));
  }

  return lines.join("\n");
}
