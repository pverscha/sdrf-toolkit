import { readFile } from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";
import type { OntologyTermEntry, SynonymEntry } from "../types.js";

export interface UnimodParseResult {
  terms: OntologyTermEntry[];
  sourceVersion: string;
}

interface UnimodMod {
  "@_title"?: string;
  "@_full_name"?: string;
  "@_record_id"?: string | number;
  "@_approved"?: string | number;
  alt_name?: string | string[] | { "#text"?: string } | Array<string | { "#text"?: string }>;
}

interface UnimodModifications {
  mod?: UnimodMod | UnimodMod[];
}

interface UnimodRoot {
  "@_majorVersion"?: string | number;
  "@_minorVersion"?: string | number;
  modifications?: UnimodModifications;
}

interface ParsedXml {
  unimod?: UnimodRoot;
}

function extractAltNameText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)["#text"] ?? "");
  }
  return "";
}

export async function parseUnimodXml(filePath: string): Promise<UnimodParseResult> {
  const content = await readFile(filePath, "utf-8");

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    isArray: (name) => ["mod", "alt_name", "specificity"].includes(name),
    textNodeName: "#text",
  });

  const parsed = parser.parse(content) as ParsedXml;
  const unimod = parsed.unimod;

  const majorVersion = unimod?.["@_majorVersion"] ?? "0";
  const minorVersion = unimod?.["@_minorVersion"] ?? "0";
  const sourceVersion = `${majorVersion}.${minorVersion}`;

  const rawMods = unimod?.modifications?.mod;
  const modifications: UnimodMod[] = Array.isArray(rawMods)
    ? rawMods
    : rawMods
    ? [rawMods]
    : [];

  const terms: OntologyTermEntry[] = [];

  for (const mod of modifications) {
    if (String(mod["@_approved"]) !== "1") continue;

    const recordId = mod["@_record_id"];
    const title = mod["@_title"];
    const fullName = mod["@_full_name"];

    if (!recordId || !title) continue;

    const accession = `UNIMOD:${recordId}`;

    const synonymSet = new Set<string>();
    const synonyms: SynonymEntry[] = [];

    const addSynonym = (text: string) => {
      const trimmed = text.trim();
      if (trimmed && !synonymSet.has(trimmed)) {
        synonymSet.add(trimmed);
        synonyms.push({ text: trimmed, type: "EXACT" });
      }
    };

    if (fullName && String(fullName) !== String(title)) {
      addSynonym(String(fullName));
    }

    const altNames = mod.alt_name;
    if (altNames !== undefined) {
      const altNameArr = Array.isArray(altNames) ? altNames : [altNames];
      for (const entry of altNameArr) {
        const text = extractAltNameText(entry);
        if (text) addSynonym(text);
      }
    }

    terms.push({
      accession,
      label: String(title),
      synonyms,
      parentIds: [],
      obsolete: false,
      replacedBy: [],
      xrefs: [],
    });
  }

  return { terms, sourceVersion };
}
