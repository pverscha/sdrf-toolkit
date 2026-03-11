import { readFileSync } from "node:fs";
import type { Manifest } from "../types.js";

/**
 * Reads and parses a manifest.json file.
 * Returns null if the file cannot be read or parsed.
 */
export function readManifestFile(manifestPath: string): Manifest | null {
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
  } catch {
    return null;
  }
}
