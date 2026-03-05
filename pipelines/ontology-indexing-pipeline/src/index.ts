import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runPipeline } from "./pipeline.js";
import { log } from "./utils.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const { values } = parseArgs({
  options: {
    "output-dir": { type: "string", default: "./output" },
    "data-dir": { type: "string", default: "./data" },
    ontologies: { type: "string" },
    force: { type: "boolean", default: false },
    "index-version": { type: "string", default: "1.0.0" },
  },
  allowPositionals: false,
});

const outputDir = resolve(values["output-dir"] as string);
const dataDir = resolve(values["data-dir"] as string);
const ontologiesFilter = values["ontologies"]
  ? (values["ontologies"] as string).split(",").map((s) => s.trim())
  : undefined;
const force = values["force"] as boolean;
const indexVersion = values["index-version"] as string;

// Resolve config files relative to this script's location (works for both tsx and compiled dist)
const sourcesYaml = resolve(__dirname, "../ontology-sources.yaml");
const allowlistPath = resolve(__dirname, "../ncbitaxon-species-allowlist.txt");

log.info("=== Ontology Indexing Pipeline ===");
log.info(`Output dir:    ${outputDir}`);
log.info(`Data dir:      ${dataDir}`);
log.info(`Index version: ${indexVersion}`);
if (ontologiesFilter) log.info(`Filter:        ${ontologiesFilter.join(", ")}`);
if (force) log.info("Force mode:    re-downloading and rebuilding all");
log.info("");

runPipeline(sourcesYaml, allowlistPath, {
  outputDir,
  dataDir,
  ontologies: ontologiesFilter,
  force,
  indexVersion,
}).catch((err: unknown) => {
  log.error("Fatal error:", err);
  process.exit(1);
});
