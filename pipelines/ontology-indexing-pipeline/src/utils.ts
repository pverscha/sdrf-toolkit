import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import type { WriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export async function sha256OfFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export function sha256OfBuffer(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function cleanOboVersion(raw: string): string {
  return raw.replace(/^releases\//, "").trim();
}

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

let _logStream: WriteStream | null = null;

function ts(): string {
  return new Date().toISOString();
}

function writeToFile(level: string, msg: string, args: unknown[]): void {
  if (!_logStream) return;
  const suffix = args.length > 0 ? " " + args.map(String).join(" ") : "";
  _logStream.write(`${ts()} [${level}] ${msg}${suffix}\n`);
}

export function initLogFile(outputDir: string): void {
  const logPath = join(outputDir, "pipeline.log");
  _logStream = createWriteStream(logPath, { flags: "w", encoding: "utf-8" });
  _logStream.on("error", (err) => console.error(`[ERROR] Log file stream error: ${err}`));
}

export async function closeLogFile(): Promise<void> {
  if (!_logStream) return;
  return new Promise((resolve, reject) => {
    _logStream!.end(resolve);
    _logStream!.on("error", reject);
  });
}

// File-only logger (no console output) — used for verbose/un-rate-limited entries
export const fileLog = {
  info: (msg: string, ...args: unknown[]) => writeToFile("INFO", msg, args),
  warn: (msg: string, ...args: unknown[]) => writeToFile("WARN", msg, args),
  error: (msg: string, ...args: unknown[]) => writeToFile("ERROR", msg, args),
};

export const log = {
  info: (msg: string, ...args: unknown[]) => {
    console.log(`[INFO] ${msg}`, ...args);
    writeToFile("INFO", msg, args);
  },
  warn: (msg: string, ...args: unknown[]) => {
    console.warn(`[WARN] ${msg}`, ...args);
    writeToFile("WARN", msg, args);
  },
  error: (msg: string, ...args: unknown[]) => {
    console.error(`[ERROR] ${msg}`, ...args);
    writeToFile("ERROR", msg, args);
  },
  debug: (msg: string, ...args: unknown[]) => {
    if (process.env.DEBUG) console.debug(`[DEBUG] ${msg}`, ...args);
    writeToFile("DEBUG", msg, args);
  },
};
