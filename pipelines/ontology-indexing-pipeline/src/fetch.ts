import { createWriteStream, existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { CacheMeta } from "./types.js";
import { ensureDir, log } from "./utils.js";

/**
 * Downloads a file to `destPath`, using HTTP conditional requests (ETag / If-Modified-Since)
 * to skip the download when the server reports the content has not changed (HTTP 304).
 *
 * Cache metadata (ETag, Last-Modified) is persisted to `metaPath` as JSON so it survives
 * across pipeline runs. On the next run these headers are replayed to the server, allowing
 * cheap no-op runs when upstream ontologies haven't been updated.
 *
 * On any network error, if a previously downloaded file already exists at `destPath` the
 * function logs a warning and returns `{ changed: false }` instead of throwing — the caller
 * can then reuse the stale cache rather than aborting the entire pipeline run.
 *
 * Returns `{ changed: true }` when a new file was written, `{ changed: false }` when the
 * server confirmed no change or when the network failed but a cached copy exists.
 */
export async function fetchWithCache(
  url: string,
  destPath: string,
  metaPath: string,
  force: boolean = false
): Promise<{ changed: boolean }> {
  await ensureDir(dirname(destPath));

  let existingMeta: CacheMeta | null = null;
  if (!force && existsSync(metaPath)) {
    try {
      existingMeta = JSON.parse(await readFile(metaPath, "utf-8")) as CacheMeta;
    } catch {
      // ignore corrupt meta
    }
  }

  const headers: Record<string, string> = {};
  if (!force && existingMeta?.etag) {
    headers["If-None-Match"] = existingMeta.etag;
  }
  if (!force && existingMeta?.lastModified) {
    headers["If-Modified-Since"] = existingMeta.lastModified;
  }

  try {
    const res = await fetch(url, { headers });

    if (res.status === 304 && existsSync(destPath)) {
      log.info(`  Not modified (304): ${url}`);
      return { changed: false };
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    }

    if (!res.body) {
      throw new Error(`No response body from ${url}`);
    }

    const ws = createWriteStream(destPath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeStream = Readable.fromWeb(res.body as any);
    await pipeline(nodeStream, ws);

    const meta: CacheMeta = {
      url,
      etag: res.headers.get("etag") ?? undefined,
      lastModified: res.headers.get("last-modified") ?? undefined,
      downloadedAt: new Date().toISOString(),
    };
    await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");

    log.info(`  Downloaded: ${url}`);
    return { changed: true };
  } catch (err) {
    if (existsSync(destPath)) {
      log.warn(`Network error fetching ${url}, reusing cached file: ${err}`);
      return { changed: false };
    }
    throw err;
  }
}
