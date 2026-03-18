import { readFile } from "node:fs/promises";
import type { SdrfFile, SdrfRow } from "../types/sdrf.js";

/**
 * Parse a TSV string into an SdrfFile.
 * Raw string values are preserved with no transformation — validation is a separate step.
 */
export function parseSdrf(tsv: string): SdrfFile {
  // Normalize line endings and split into lines
  const lines = tsv.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  // Remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = lines[0].split("\t");

  const rows: SdrfRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells: Record<string, string[]> = {};
    const values = lines[i].split("\t");

    for (let j = 0; j < headers.length; j++) {
      if (!cells[headers[j]]) cells[headers[j]] = [];
      cells[headers[j]].push(values[j] ?? "");
    }

    rows.push({ index: i - 1, cells });
  }

  return { headers, rows };
}

/**
 * Parse an SDRF file from disk (Node.js only).
 */
export async function parseSdrfFile(filePath: string): Promise<SdrfFile> {
  const content = await readFile(filePath, "utf8");
  return parseSdrf(content);
}
