import { readFile } from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";
import type { OntologyTermEntry, SynonymEntry } from "../types.js";

export interface OwlParseOptions {
  defaultPrefix: string;
  additionalPrefixes?: string[];
}

export interface OwlParseResult {
  terms: OntologyTermEntry[];
  sourceVersion: string;
  discardedByPrefix: string[];
}

/**
 * Converts an OBO Foundry IRI like
 *   http://purl.obolibrary.org/obo/HANCESTRO_0003
 * to the canonical accession form HANCESTRO:0003.
 * Returns null for IRIs that don't match the expected pattern.
 */
function iriToAccession(iri: unknown): string | null {
  if (typeof iri !== "string") return null;
  // Extract last path segment (after last / or #)
  const segment = iri.split(/[/#]/).pop();
  if (!segment) return null;
  // Must match PREFIX_LOCALID where PREFIX is all letters and LOCALID is non-empty
  const underscoreIdx = segment.indexOf("_");
  if (underscoreIdx <= 0) return null;
  const prefix = segment.slice(0, underscoreIdx);
  const localId = segment.slice(underscoreIdx + 1);
  if (!prefix || !localId) return null;
  // prefix must be alphabetic/alphanumeric; localId must be non-empty
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(prefix)) return null;
  return `${prefix}:${localId}`;
}

/**
 * Extracts the string value from a node that may be a plain string,
 * a number, or an object like { "#text": "...", "@_rdf:datatype": "..." }.
 */
function textValue(node: unknown): string {
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if ("#text" in obj) return String(obj["#text"] ?? "");
  }
  return "";
}

/**
 * Extracts synonym entries from a raw array (or single value) returned by fast-xml-parser
 * for a given synonym annotation property.
 */
function extractSynonyms(raw: unknown, type: SynonymEntry["type"]): SynonymEntry[] {
  if (raw === undefined || raw === null) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const results: SynonymEntry[] = [];
  for (const entry of arr) {
    const text = textValue(entry).trim();
    if (text) results.push({ text, type });
  }
  return results;
}

/**
 * Attempts to extract a version string from the owl:Ontology node.
 * Priority: owl:versionInfo > owl:versionIRI path segment > today's date.
 */
function extractVersion(ontologyNode: Record<string, unknown> | undefined): string {
  if (!ontologyNode) return new Date().toISOString().slice(0, 10);

  // 1. owl:versionInfo (plain string or text node)
  if (ontologyNode["owl:versionInfo"] !== undefined) {
    const v = textValue(ontologyNode["owl:versionInfo"]).trim();
    if (v) return v;
  }

  // 2. owl:versionIRI[@rdf:resource] — extract from path e.g. "releases/2024-06-01/"
  const versionIRI = ontologyNode["owl:versionIRI"];
  if (versionIRI && typeof versionIRI === "object") {
    const resource = (versionIRI as Record<string, unknown>)["@_rdf:resource"];
    if (typeof resource === "string") {
      // Look for a releases/VERSION segment
      const releasesMatch = resource.match(/releases\/([^/]+)/);
      if (releasesMatch) return releasesMatch[1];
      // Otherwise take the last path segment
      const lastSegment = resource.split("/").filter(Boolean).pop();
      if (lastSegment) return lastSegment;
    }
  }

  return new Date().toISOString().slice(0, 10);
}

export async function parseOwlFile(filePath: string, options: OwlParseOptions): Promise<OwlParseResult> {
  const content = await readFile(filePath, "utf-8");

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: false,
    textNodeName: "#text",
    parseTagValue: false,
    isArray: (name) =>
      [
        "owl:Class",
        "rdfs:subClassOf",
        "oboInOwl:hasExactSynonym",
        "oboInOwl:hasRelatedSynonym",
        "oboInOwl:hasBroadSynonym",
        "oboInOwl:hasNarrowSynonym",
        "oboInOwl:hasDbXref",
      ].includes(name),
  });

  const parsed = parser.parse(content) as Record<string, unknown>;

  // Navigate to root element — could be rdf:RDF or owl:Ontology wrapper
  const rdfRoot = (parsed["rdf:RDF"] ?? parsed) as Record<string, unknown>;

  const ontologyNode = rdfRoot["owl:Ontology"] as Record<string, unknown> | undefined;
  const sourceVersion = extractVersion(ontologyNode);

  // Build allowed prefixes set (case-insensitive comparison)
  const allowedPrefixes = new Set<string>(
    [options.defaultPrefix, ...(options.additionalPrefixes ?? [])].map((p) => p.toUpperCase())
  );

  const terms: OntologyTermEntry[] = [];
  const discardedByPrefix: string[] = [];

  const rawClasses = rdfRoot["owl:Class"];
  if (!Array.isArray(rawClasses)) {
    return { terms, sourceVersion, discardedByPrefix };
  }

  for (const cls of rawClasses as Record<string, unknown>[]) {
    // Must have rdf:about; skip anonymous classes
    const about = cls["@_rdf:about"];
    if (!about) continue;

    const accession = iriToAccession(about);
    if (!accession) continue;

    // Prefix filter
    const prefix = accession.split(":")[0].toUpperCase();
    if (!allowedPrefixes.has(prefix)) {
      discardedByPrefix.push(accession);
      continue;
    }

    // Label
    const label = textValue(cls["rdfs:label"]).trim();
    if (!label) continue;

    // Parents: only direct rdfs:subClassOf with rdf:resource (not restrictions)
    const parentIds: string[] = [];
    const subClassOf = cls["rdfs:subClassOf"];
    if (Array.isArray(subClassOf)) {
      for (const sc of subClassOf as unknown[]) {
        if (sc && typeof sc === "object") {
          const resource = (sc as Record<string, unknown>)["@_rdf:resource"];
          if (resource) {
            const parentAccession = iriToAccession(resource);
            if (parentAccession) parentIds.push(parentAccession);
          }
          // Complex subClassOf (owl:Restriction etc.) — skip
        }
        // Plain string values are unusual but guard against them
      }
    }

    // Synonyms
    const synonyms: SynonymEntry[] = [
      ...extractSynonyms(cls["oboInOwl:hasExactSynonym"], "EXACT"),
      ...extractSynonyms(cls["oboInOwl:hasRelatedSynonym"], "RELATED"),
      ...extractSynonyms(cls["oboInOwl:hasBroadSynonym"], "BROAD"),
      ...extractSynonyms(cls["oboInOwl:hasNarrowSynonym"], "NARROW"),
    ];

    // Obsolete
    const deprecatedRaw = cls["owl:deprecated"];
    const obsolete =
      deprecatedRaw === true ||
      deprecatedRaw === "true" ||
      textValue(deprecatedRaw).trim() === "true";

    // Replaced by: obo:IAO_0100001 or oboInOwl:replacedBy
    const replacedBy: string[] = [];
    for (const key of ["obo:IAO_0100001", "oboInOwl:replacedBy"]) {
      const rbRaw = cls[key];
      if (rbRaw === undefined) continue;
      const rbArr = Array.isArray(rbRaw) ? rbRaw : [rbRaw];
      for (const rb of rbArr) {
        if (rb && typeof rb === "object") {
          const resource = (rb as Record<string, unknown>)["@_rdf:resource"];
          if (resource) {
            const acc = iriToAccession(resource);
            if (acc) replacedBy.push(acc);
          }
        }
      }
    }

    // XRefs
    const xrefs: string[] = [];
    const xrefRaw = cls["oboInOwl:hasDbXref"];
    if (Array.isArray(xrefRaw)) {
      for (const x of xrefRaw as unknown[]) {
        const t = textValue(x).trim();
        if (t) xrefs.push(t);
      }
    } else if (xrefRaw !== undefined) {
      const t = textValue(xrefRaw).trim();
      if (t) xrefs.push(t);
    }

    terms.push({ accession, label, synonyms, parentIds, obsolete, replacedBy, xrefs });
  }

  return { terms, sourceVersion, discardedByPrefix };
}
