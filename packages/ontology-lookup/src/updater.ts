import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync, unlinkSync, existsSync, createWriteStream, createReadStream } from "node:fs";
import { join } from "node:path";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import type { Manifest } from "./types.js";

export class Updater {
  /**
   * Fetches the remote manifest, compares against the locally loaded manifest,
   * downloads changed index files, verifies SHA-256 checksums, and writes them
   * to disk. Returns which ontologies were updated vs. already current.
   *
   * For `.db.gz` files, also decompresses to `.db` after download so the
   * registry can open the SQLite file directly without decompression on each use.
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

      if (!remoteEntry.fileName || !remoteEntry.sha256) {
        continue;
      }

      const { fileName, sha256 } = remoteEntry;
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

      const localPath = join(indexDir, fileName);
      writeFileSync(localPath, buffer);

      // For SQLite indexes, decompress .db.gz → .db so the registry can open it directly
      if (fileName.endsWith(".db.gz")) {
        const dbPath = localPath.slice(0, -".gz".length);
        if (existsSync(dbPath)) unlinkSync(dbPath);
        await decompressFile(localPath, dbPath);
      }

      updated.push(id);
    }

    writeFileSync(join(indexDir, "manifest.json"), JSON.stringify(remoteManifest, null, 2));

    return { updated, alreadyCurrent };
  }
}

async function decompressFile(src: string, dest: string): Promise<void> {
  const readStream = createReadStream(src);
  const gunzip = createGunzip();
  const writeStream = createWriteStream(dest);
  await pipeline(readStream, gunzip, writeStream);
}
