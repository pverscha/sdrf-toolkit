import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";
import type { Manifest } from "../src/types.js";

// ---------------------------------------------------------------------------
// Mock node:fs — keep all real exports but replace mkdirSync + writeFileSync
//
// We stub only the two write-side functions so tests never touch the real
// filesystem. All other fs functions (e.g. readFileSync, existsSync) remain
// fully functional. This lets us assert *what* would have been written and
// *where*, without needing temp directories or cleanup.
// ---------------------------------------------------------------------------

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return {
    ...real,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

// Import mocked functions AFTER vi.mock hoisting resolves
import { mkdirSync, writeFileSync } from "node:fs";
import { Updater } from "../src/updater.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute a real SHA-256 hex digest of a Buffer.
 *
 * We intentionally use the real crypto implementation (not a mock) so that
 * the checksum verification path inside Updater is exercised end-to-end.
 * Tests that need a correct checksum call this; tests that want to trigger a
 * mismatch pass a hard-coded wrong hex string instead.
 */
function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Build a minimal but valid Manifest fixture.
 *
 * Accepts an optional ontologies map so callers can add only the entries they
 * care about without having to repeat the envelope fields in every test.
 */
function makeManifest(
  ontologies: Manifest["ontologies"] = {}
): Manifest {
  return {
    schemaVersion: "1.0",
    updatedAt: "2024-01-01T00:00:00Z",
    ontologies,
  };
}

/**
 * Build a fake fetch Response that returns JSON.
 *
 * Used to simulate the manifest endpoint. Pass ok=false to exercise the
 * non-2xx branch (e.g., 404 Not Found).
 */
function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 404,
    statusText: ok ? "OK" : "Not Found",
    json: () => Promise.resolve(body),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  } as unknown as Response;
}

/**
 * Build a fake fetch Response that returns raw binary data.
 *
 * Used to simulate index-file downloads. The ArrayBuffer slice preserves the
 * exact byte content of the Buffer, which is necessary for SHA-256 checks to
 * produce the expected digest. Pass ok=false to simulate a failed download.
 */
function binaryResponse(buf: Buffer, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 404,
    statusText: ok ? "OK" : "Not Found",
    json: () => Promise.reject(new Error("not JSON")),
    arrayBuffer: () => Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const INDEX_DIR = "/fake/index";
const UPDATE_SOURCE = "owner/repo";
const BASE_URL = `https://github.com/${UPDATE_SOURCE}/releases/latest/download`;

let updater: Updater;

// Create a fresh Updater instance before each test and reset the write-side
// mocks so call history from one test can never bleed into another.
beforeEach(() => {
  updater = new Updater();
  vi.mocked(mkdirSync).mockReset();
  vi.mocked(writeFileSync).mockReset();
});

// Remove the global fetch stub after each test. This prevents a stub set up
// in one test from being active — and potentially causing confusion — during
// a later test that forgets to stub fetch itself.
afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// 1. Manifest fetching
//
// The very first network call Updater makes is to retrieve the remote
// manifest.json. These tests guard the URL construction, error propagation,
// and the requirement that the final manifest is always persisted locally so
// the next run can compare versions without hitting the network again.
// ---------------------------------------------------------------------------

describe("manifest fetching", () => {
  it("throws 'Failed to fetch manifest' when manifest response is non-OK", async () => {
    // A non-2xx response (e.g. 404, 500) means the remote release assets are
    // unreachable. Updater must surface this as a clear error rather than
    // silently swallowing it or treating an empty manifest as authoritative.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(null, false)));
    expect(
      updater.checkAndUpdate(INDEX_DIR, UPDATE_SOURCE, null)
    ).rejects.toThrow("Failed to fetch manifest");
  });

  it("constructs the correct manifest URL from updateSource", async () => {
    // The updateSource is a GitHub "owner/repo" slug. Updater must expand it
    // into the full GitHub Releases download URL. A wrong URL here would mean
    // every user pointing at a custom release repo would silently fetch from
    // the wrong place.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(makeManifest()));
    vi.stubGlobal("fetch", fetchMock);
    await updater.checkAndUpdate(INDEX_DIR, UPDATE_SOURCE, null);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/manifest.json`);
  });

  it("persists the fetched manifest to {indexDir}/manifest.json after a successful run", async () => {
    // After a successful update cycle the remote manifest must be written to
    // disk. This local copy is what the next call to checkAndUpdate reads as
    // its `loadedManifest` argument, so missing this write would cause every
    // run to re-download all ontologies from scratch.
    const remote = makeManifest();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(remote)));
    await updater.checkAndUpdate(INDEX_DIR, UPDATE_SOURCE, null);
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
      `${INDEX_DIR}/manifest.json`,
      JSON.stringify(remote, null, 2)
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Already current
//
// When the local manifest entry for an ontology matches the remote entry on
// both sourceVersion and indexVersion, no download should happen. These tests
// verify that the "skip" logic works correctly and does not waste bandwidth.
// ---------------------------------------------------------------------------

describe("already current", () => {
  it("marks ontology as alreadyCurrent when both sourceVersion and indexVersion match", async () => {
    // Both version fields are compared. If either has changed the ontology
    // must be re-downloaded (covered in the "update triggered" group). When
    // both are identical the entry belongs in alreadyCurrent, not updated.
    const remote = makeManifest({
      ms: { sourceVersion: "4.1.30", indexVersion: "1", fileName: "ms.json.gz", sha256: "abc", compressedSize: 100, termCount: 10 },
    });
    const local = makeManifest({
      ms: { sourceVersion: "4.1.30", indexVersion: "1" },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(remote)));
    const result = await updater.checkAndUpdate(INDEX_DIR, UPDATE_SOURCE, local);
    expect(result.alreadyCurrent).toContain("ms");
    expect(result.updated).toHaveLength(0);
  });

  it("makes no file-download fetch calls for up-to-date ontologies (only 1 total fetch)", async () => {
    // The single fetch call must be the manifest request. Any additional call
    // would indicate a spurious file download, which wastes bandwidth and
    // could overwrite a valid local index with an identical remote copy.
    const remote = makeManifest({
      ms: { sourceVersion: "4.1.30", indexVersion: "1", fileName: "ms.json.gz", sha256: "abc", compressedSize: 100, termCount: 10 },
    });
    const local = makeManifest({
      ms: { sourceVersion: "4.1.30", indexVersion: "1" },
    });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(remote));
    vi.stubGlobal("fetch", fetchMock);
    await updater.checkAndUpdate(INDEX_DIR, UPDATE_SOURCE, local);
    expect(fetchMock).toHaveBeenCalledTimes(1); // only manifest
  });
});

// ---------------------------------------------------------------------------
// 3. Update triggered
//
// Updater must detect every condition that makes a local copy stale: no local
// manifest at all, an upstream ontology release, or a rebuilt index for the
// same upstream version. It must then download the file, verify it, and write
// it to the expected path. The indexDir must also be created up front so that
// the write does not fail on a fresh installation.
// ---------------------------------------------------------------------------

describe("update triggered", () => {
  it("triggers update when loadedManifest is null (no local manifest)", async () => {
    // A null loadedManifest means this is the first run or the local manifest
    // was deleted. Every remote ontology must be downloaded in this case —
    // there is no local version to compare against.
    const fileContent = Buffer.from("fake-gz-content");
    const checksum = sha256(fileContent);
    const remote = makeManifest({
      ms: { sourceVersion: "4.1.30", indexVersion: "1", fileName: "ms.json.gz", sha256: checksum, compressedSize: fileContent.length, termCount: 10 },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(remote))
      .mockResolvedValueOnce(binaryResponse(fileContent));
    vi.stubGlobal("fetch", fetchMock);
    const result = await updater.checkAndUpdate(INDEX_DIR, UPDATE_SOURCE, null);
    expect(result.updated).toContain("ms");
  });

  it("triggers update when sourceVersion differs", async () => {
    // sourceVersion tracks the upstream ontology release (e.g. "4.1.31").
    // When the remote is newer, the local index is based on old data and must
    // be replaced even if indexVersion has not changed.
    const fileContent = Buffer.from("new-content");
    const checksum = sha256(fileContent);
    const remote = makeManifest({
      ms: { sourceVersion: "4.1.31", indexVersion: "1", fileName: "ms.json.gz", sha256: checksum, compressedSize: fileContent.length, termCount: 10 },
    });
    const local = makeManifest({
      ms: { sourceVersion: "4.1.30", indexVersion: "1" },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(remote))
      .mockResolvedValueOnce(binaryResponse(fileContent));
    vi.stubGlobal("fetch", fetchMock);
    const result = await updater.checkAndUpdate(INDEX_DIR, UPDATE_SOURCE, local);
    expect(result.updated).toContain("ms");
  });

  it("triggers update when indexVersion differs", async () => {
    // indexVersion tracks the build of the index itself (e.g. a bug fix in
    // the indexing pipeline). The upstream ontology source may be unchanged
    // while the index file has been improved; users must receive the rebuild.
    const fileContent = Buffer.from("rebuilt-content");
    const checksum = sha256(fileContent);
    const remote = makeManifest({
      ms: { sourceVersion: "4.1.30", indexVersion: "2", fileName: "ms.json.gz", sha256: checksum, compressedSize: fileContent.length, termCount: 10 },
    });
    const local = makeManifest({
      ms: { sourceVersion: "4.1.30", indexVersion: "1" },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(remote))
      .mockResolvedValueOnce(binaryResponse(fileContent));
    vi.stubGlobal("fetch", fetchMock);
    const result = await updater.checkAndUpdate(INDEX_DIR, UPDATE_SOURCE, local);
    expect(result.updated).toContain("ms");
  });

  it("writes downloaded file to the correct path", async () => {
    // The index file must land at {indexDir}/{fileName} — exactly the path
    // OntologyRegistry will look for when loading the ontology. Any deviation
    // (wrong directory, wrong name) would silently break subsequent lookups.
    const fileContent = Buffer.from("index-data");
    const checksum = sha256(fileContent);
    const remote = makeManifest({
      ms: { sourceVersion: "4.1.30", indexVersion: "1", fileName: "ms.json.gz", sha256: checksum, compressedSize: fileContent.length, termCount: 10 },
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse(remote))
      .mockResolvedValueOnce(binaryResponse(fileContent)));
    await updater.checkAndUpdate(INDEX_DIR, UPDATE_SOURCE, null);
    const writeCalls = vi.mocked(writeFileSync).mock.calls;
    const filePaths = writeCalls.map(([p]) => p);
    expect(filePaths).toContain(`${INDEX_DIR}/ms.json.gz`);
  });

  it("calls mkdirSync with { recursive: true } on indexDir", async () => {
    // Updater must ensure the target directory exists before attempting any
    // writes. Without { recursive: true } the call would throw when one or
    // more parent directories are also absent — a common situation on first
    // install.
    const remote = makeManifest();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(remote)));
    await updater.checkAndUpdate(INDEX_DIR, UPDATE_SOURCE, null);
    expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith(INDEX_DIR, { recursive: true });
  });
});

// ---------------------------------------------------------------------------
// 4. SHA-256 verification
//
// Every downloaded file is verified against the checksum declared in the
// remote manifest before it is written to disk. This guards against corrupted
// downloads, network truncation, and (in a threat-model sense) tampered
// release assets. A bad file must never reach the filesystem.
// ---------------------------------------------------------------------------

describe("SHA-256 verification", () => {
  it("throws 'SHA-256 mismatch' when downloaded content doesn't match declared checksum", async () => {
    // The manifest declares a checksum of all-zeroes, which cannot match any
    // real file. Updater must detect this immediately and throw rather than
    // proceeding with an index that could contain corrupt or malicious data.
    const fileContent = Buffer.from("real-content");
    const wrongChecksum = "0000000000000000000000000000000000000000000000000000000000000000";
    const remote = makeManifest({
      ms: { sourceVersion: "4.1.30", indexVersion: "1", fileName: "ms.json.gz", sha256: wrongChecksum, compressedSize: fileContent.length, termCount: 10 },
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse(remote))
      .mockResolvedValueOnce(binaryResponse(fileContent)));
    expect(
      updater.checkAndUpdate(INDEX_DIR, UPDATE_SOURCE, null)
    ).rejects.toThrow("SHA-256 mismatch");
  });

  it("does not write the file when verification fails", async () => {
    // Writing a file whose checksum doesn't match would leave a corrupt index
    // on disk. The next run might see a matching local manifest entry (since
    // it was written) and skip the re-download, resulting in a permanently
    // broken installation. The file must not be written at all on failure.
    const fileContent = Buffer.from("some-data");
    const wrongChecksum = "0000000000000000000000000000000000000000000000000000000000000000";
    const remote = makeManifest({
      ms: { sourceVersion: "4.1.30", indexVersion: "1", fileName: "ms.json.gz", sha256: wrongChecksum, compressedSize: fileContent.length, termCount: 10 },
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse(remote))
      .mockResolvedValueOnce(binaryResponse(fileContent)));
    expect(
      updater.checkAndUpdate(INDEX_DIR, UPDATE_SOURCE, null)
    ).rejects.toThrow();
    const writeCalls = vi.mocked(writeFileSync).mock.calls;
    const filePaths = writeCalls.map(([p]) => p);
    expect(filePaths).not.toContain(`${INDEX_DIR}/ms.json.gz`);
  });
});

// ---------------------------------------------------------------------------
// 5. File download errors
//
// When a file fetch returns a non-2xx status, Updater must throw with a
// descriptive message. Silently continuing would leave the local index stale
// while reporting a successful update, which is worse than failing loudly.
// ---------------------------------------------------------------------------

describe("file download errors", () => {
  it("throws 'Failed to download' when the file response is non-OK", async () => {
    // A 404 on the index file typically means the release asset is missing or
    // the fileName in the manifest is wrong. Updater must not treat an empty
    // or error body as a valid index.
    const remote = makeManifest({
      ms: { sourceVersion: "4.1.30", indexVersion: "1", fileName: "ms.json.gz", sha256: "abc", compressedSize: 100, termCount: 10 },
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse(remote))
      .mockResolvedValueOnce(binaryResponse(Buffer.alloc(0), false)));
    expect(
      updater.checkAndUpdate(INDEX_DIR, UPDATE_SOURCE, null)
    ).rejects.toThrow("Failed to download");
  });

  it("error message includes the file URL", async () => {
    // Including the URL (or at minimum the fileName) in the error message
    // allows users and CI logs to pinpoint which asset caused the failure
    // without having to dig through network traces.
    const remote = makeManifest({
      ms: { sourceVersion: "4.1.30", indexVersion: "1", fileName: "ms.json.gz", sha256: "abc", compressedSize: 100, termCount: 10 },
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse(remote))
      .mockResolvedValueOnce(binaryResponse(Buffer.alloc(0), false)));
    expect(
      updater.checkAndUpdate(INDEX_DIR, UPDATE_SOURCE, null)
    ).rejects.toThrow("ms.json.gz");
  });
});

// ---------------------------------------------------------------------------
// 6. Variants support
//
// Large ontologies like NCBITaxon ship as two separate files: a "full" index
// and a "pruned" index (model-organism subset). The manifest represents these
// as a `variants` map rather than a single fileName/sha256 pair. Updater must
// download and verify every variant independently so that users who only load
// one variant still get a correct, verified file.
// ---------------------------------------------------------------------------

describe("variants support", () => {
  it("downloads all variant files for an ontology with variants", async () => {
    // Both the full and the pruned variant must be fetched when any variant
    // entry is present. Skipping a variant would leave a stale file on disk
    // for users who load that specific variant.
    const fullContent = Buffer.from("full-ncbitaxon-data");
    const prunedContent = Buffer.from("pruned-ncbitaxon-data");
    const remote = makeManifest({
      ncbitaxon: {
        sourceVersion: "2024-01-01",
        indexVersion: "1",
        variants: {
          full: { fileName: "ncbitaxon.json.gz", sha256: sha256(fullContent), compressedSize: fullContent.length, termCount: 1000 },
          pruned: { fileName: "ncbitaxon-pruned.json.gz", sha256: sha256(prunedContent), compressedSize: prunedContent.length, termCount: 100 },
        },
      },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(remote))
      .mockResolvedValueOnce(binaryResponse(fullContent))
      .mockResolvedValueOnce(binaryResponse(prunedContent));
    vi.stubGlobal("fetch", fetchMock);
    const result = await updater.checkAndUpdate(INDEX_DIR, UPDATE_SOURCE, null);
    expect(result.updated).toContain("ncbitaxon");
    const writeCalls = vi.mocked(writeFileSync).mock.calls.map(([p]) => p);
    expect(writeCalls).toContain(`${INDEX_DIR}/ncbitaxon.json.gz`);
    expect(writeCalls).toContain(`${INDEX_DIR}/ncbitaxon-pruned.json.gz`);
  });

  it("throws SHA-256 mismatch for a bad variant checksum", async () => {
    // Each variant is verified independently. Passing the first variant's
    // checksum must not mask a bad checksum on the second variant. This test
    // intentionally provides a correct digest for "full" and a wrong one for
    // "pruned" to confirm that per-variant verification is not short-circuited.
    const fullContent = Buffer.from("full-data");
    const prunedContent = Buffer.from("pruned-data");
    const wrongChecksum = "0000000000000000000000000000000000000000000000000000000000000000";
    const remote = makeManifest({
      ncbitaxon: {
        sourceVersion: "2024-01-01",
        indexVersion: "1",
        variants: {
          full: { fileName: "ncbitaxon.json.gz", sha256: sha256(fullContent), compressedSize: fullContent.length, termCount: 1000 },
          pruned: { fileName: "ncbitaxon-pruned.json.gz", sha256: wrongChecksum, compressedSize: prunedContent.length, termCount: 100 },
        },
      },
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse(remote))
      .mockResolvedValueOnce(binaryResponse(fullContent))
      .mockResolvedValueOnce(binaryResponse(prunedContent)));
    await expect(
      updater.checkAndUpdate(INDEX_DIR, UPDATE_SOURCE, null)
    ).rejects.toThrow("SHA-256 mismatch");
  });
});

// ---------------------------------------------------------------------------
// 7. Mixed results
//
// A realistic update run processes multiple ontologies in one call, each of
// which may independently be current or outdated. These tests confirm that
// the return value correctly segregates ontologies into the two buckets and
// that edge cases (empty manifest, new ontology absent from local manifest)
// are handled without errors.
// ---------------------------------------------------------------------------

describe("mixed results", () => {
  it("correctly populates both updated and alreadyCurrent in one call with multiple ontologies", async () => {
    // ms has a newer sourceVersion → must be downloaded and appear in updated.
    // pato versions are identical → must be skipped and appear in alreadyCurrent.
    // Both must be present in the return value from a single checkAndUpdate call.
    const msContent = Buffer.from("ms-data");
    const remote = makeManifest({
      ms: { sourceVersion: "4.1.31", indexVersion: "1", fileName: "ms.json.gz", sha256: sha256(msContent), compressedSize: msContent.length, termCount: 10 },
      pato: { sourceVersion: "2024-01-01", indexVersion: "1", fileName: "pato.json.gz", sha256: "deadbeef", compressedSize: 50, termCount: 5 },
    });
    const local = makeManifest({
      ms: { sourceVersion: "4.1.30", indexVersion: "1" },  // outdated
      pato: { sourceVersion: "2024-01-01", indexVersion: "1" }, // current
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse(remote))
      .mockResolvedValueOnce(binaryResponse(msContent)));
    const result = await updater.checkAndUpdate(INDEX_DIR, UPDATE_SOURCE, local);
    expect(result.updated).toContain("ms");
    expect(result.alreadyCurrent).toContain("pato");
  });

  it("returns empty arrays when the remote manifest has no ontologies", async () => {
    // An empty ontologies map is a valid (if unusual) manifest. Updater must
    // not crash and must return two empty arrays — it has nothing to update
    // and nothing to report as current.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(makeManifest())));
    const result = await updater.checkAndUpdate(INDEX_DIR, UPDATE_SOURCE, null);
    expect(result.updated).toHaveLength(0);
    expect(result.alreadyCurrent).toHaveLength(0);
  });

  it("treats a local manifest that lacks the remote ontology as needing update", async () => {
    // When a new ontology is added to the remote manifest that was not
    // present in the local manifest at all, there is no local entry to
    // compare against. Updater must treat absence as "needs update" rather
    // than "already current", so users automatically receive new ontologies.
    const content = Buffer.from("new-ontology-data");
    const remote = makeManifest({
      newonto: { sourceVersion: "1.0", indexVersion: "1", fileName: "newonto.json.gz", sha256: sha256(content), compressedSize: content.length, termCount: 42 },
    });
    const local = makeManifest({}); // "newonto" not in local
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse(remote))
      .mockResolvedValueOnce(binaryResponse(content)));
    const result = await updater.checkAndUpdate(INDEX_DIR, UPDATE_SOURCE, local);
    expect(result.updated).toContain("newonto");
    expect(result.alreadyCurrent).toHaveLength(0);
  });
});
