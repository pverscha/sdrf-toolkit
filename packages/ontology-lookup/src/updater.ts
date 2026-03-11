import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Manifest } from "./types.js";

export class Updater {
  /**
   * Fetches the remote manifest, compares against the locally loaded manifest,
   * downloads changed index files, verifies SHA-256 checksums, and writes them
   * to disk. Returns which ontologies were updated vs. already current.
   */
  async checkAndUpdate(
    indexDir: string,
    updateSource: string,
    loadedManifest: Manifest | null
  ): Promise<{ updated: string[]; alreadyCurrent: string[] }> {
    const baseUrl = `https://github.com/${updateSource}/releases/latest/download`;

    const manifestUrl = `${baseUrl}/manifest.json`;
    const manifestResponse = await fetch(manifestUrl);
    if (!manifestResponse.ok) {
      throw new Error(
        `Failed to fetch manifest from ${manifestUrl}: ${manifestResponse.status} ${manifestResponse.statusText}`
      );
    }
    const remoteManifest = (await manifestResponse.json()) as Manifest;

    const updated: string[] = [];
    const alreadyCurrent: string[] = [];

    mkdirSync(indexDir, { recursive: true });

    for (const [id, remoteEntry] of Object.entries(remoteManifest.ontologies)) {
      const localEntry = loadedManifest?.ontologies[id];

      const needsUpdate =
        !localEntry ||
        localEntry.indexVersion !== remoteEntry.indexVersion ||
        localEntry.sourceVersion !== remoteEntry.sourceVersion;

      if (!needsUpdate) {
        alreadyCurrent.push(id);
        continue;
      }

      // Collect all files to download for this ontology
      const filesToDownload: Array<{ fileName: string; sha256: string }> = [];

      if (remoteEntry.variants) {
        for (const variant of Object.values(remoteEntry.variants)) {
          filesToDownload.push({ fileName: variant.fileName, sha256: variant.sha256 });
        }
      } else if (remoteEntry.fileName && remoteEntry.sha256) {
        filesToDownload.push({ fileName: remoteEntry.fileName, sha256: remoteEntry.sha256 });
      }

      for (const { fileName, sha256 } of filesToDownload) {
        const fileUrl = `${baseUrl}/${fileName}`;
        const fileResponse = await fetch(fileUrl);
        if (!fileResponse.ok) {
          throw new Error(
            `Failed to download ${fileUrl}: ${fileResponse.status} ${fileResponse.statusText}`
          );
        }

        const buffer = Buffer.from(await fileResponse.arrayBuffer());

        const actualSha256 = createHash("sha256").update(buffer).digest("hex");
        if (actualSha256 !== sha256) {
          throw new Error(
            `SHA-256 mismatch for ${fileName}: expected ${sha256}, got ${actualSha256}`
          );
        }

        writeFileSync(join(indexDir, fileName), buffer);
      }

      updated.push(id);
    }

    // Persist the updated manifest locally
    writeFileSync(join(indexDir, "manifest.json"), JSON.stringify(remoteManifest, null, 2));

    return { updated, alreadyCurrent };
  }
}
