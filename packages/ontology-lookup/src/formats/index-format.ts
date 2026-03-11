import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import type { OntologyIndexFile } from "../types.js";

/**
 * Reads a .json.gz file from disk, decompresses it, and parses the JSON.
 * Returns a fully typed OntologyIndexFile.
 */
export function readIndexFile(filePath: string): OntologyIndexFile {
  const compressed = readFileSync(filePath);
  const decompressed = gunzipSync(compressed);
  return JSON.parse(decompressed.toString("utf8")) as OntologyIndexFile;
}
