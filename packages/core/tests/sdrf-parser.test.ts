import { describe, it, expect } from "vitest";
import { parseSdrf } from "../src/sdrf/parser.js";
import { serializeSdrf } from "../src/sdrf/serializer.js";

describe("parseSdrf", () => {
  it("parses a simple TSV into headers and rows", () => {
    const tsv = "source name\tassay name\n" +
                "sample1\tassay1\n" +
                "sample2\tassay2";

    const result = parseSdrf(tsv);

    expect(result.headers).toEqual(["source name", "assay name"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      index: 0,
      cells: { "source name": ["sample1"], "assay name": ["assay1"] },
    });
    expect(result.rows[1]).toEqual({
      index: 1,
      cells: { "source name": ["sample2"], "assay name": ["assay2"] },
    });
  });

  it("handles Windows line endings (CRLF)", () => {
    const tsv = "source name\tassay name\r\nsample1\tassay1\r\n";
    const result = parseSdrf(tsv);
    expect(result.headers).toEqual(["source name", "assay name"]);
    expect(result.rows).toHaveLength(1);
  });

  it("ignores trailing empty lines", () => {
    const tsv = "source name\tsex\nsample1\tmale\n\n";
    const result = parseSdrf(tsv);
    expect(result.rows).toHaveLength(1);
  });

  it("returns empty file for empty TSV", () => {
    const result = parseSdrf("");
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it("fills missing cells with empty string", () => {
    const tsv = "a\tb\tc\nval1\tval2";
    const result = parseSdrf(tsv);
    expect(result.rows[0].cells["c"]).toEqual([""]);
  });
});

describe("serializeSdrf", () => {
  it("serializes a file back to TSV", () => {
    const file = {
      headers: ["source name", "assay name"],
      rows: [
        { index: 0, cells: { "source name": ["sample1"], "assay name": ["assay1"] } },
        { index: 1, cells: { "source name": ["sample2"], "assay name": ["assay2"] } },
      ],
    };

    const tsv = serializeSdrf(file);
    expect(tsv).toBe(
      "source name\tassay name\n" +
      "sample1\tassay1\n" +
      "sample2\tassay2"
    );
  });

  it("roundtrips parse → serialize", () => {
    const original = "source name\tassay name\nsample1\tassay1\nsample2\tassay2";
    const parsed = parseSdrf(original);
    const serialized = serializeSdrf(parsed);
    expect(serialized).toBe(original);
  });
});
