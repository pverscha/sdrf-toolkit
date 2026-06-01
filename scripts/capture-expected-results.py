#!/usr/bin/env python3
"""
Run the official sdrf-pipelines validator on each integration test fixture and
capture the results as JSON files consumed by the TypeScript integration tests.

Run from the repository root in the sdrf-pipelines conda environment:
    conda run -n sdrf-pipelines python scripts/capture-expected-results.py

Outputs:
    packages/core/tests/integration/fixtures/expected/{name}.json
"""

import csv
import io
import json
import os
import subprocess
import sys
from typing import NamedTuple

FIXTURES_DIR = os.path.join(
    os.path.dirname(__file__),
    "..", "packages", "core", "tests", "integration", "fixtures"
)

CASES = [
    # Single most-specific template per fixture.
    # The official CLI validate-sdrf only applies ONE template at a time (the last -t
    # value wins). Using single templates ensures the comparison is valid.
    {
        "name":      "sample-basic",
        "file":      "valid/sample-basic.sdrf.tsv",
        "templates": ["vertebrates"],
    },
    {
        "name":      "pxd001819",
        "file":      "valid/pxd001819.sdrf.tsv",
        "templates": ["vertebrates"],
    },
    {
        "name":      "pxd015270",
        "file":      "valid/pxd015270.sdrf.tsv",
        "templates": ["human"],
    },
    {
        "name":      "pxd000612",
        "file":      "valid/pxd000612.sdrf.tsv",
        "templates": ["human"],
    },
    {
        "name":      "pxd001474",
        "file":      "valid/pxd001474.sdrf.tsv",
        "templates": ["human"],
    },
    {
        "name":      "pxd002137",
        "file":      "valid/pxd002137.sdrf.tsv",
        "templates": ["human"],
    },
    {
        "name":      "pxd004684",
        "file":      "valid/pxd004684.sdrf.tsv",
        "templates": ["dia-acquisition"],
    },
    {
        "name":      "pxd008934",
        "file":      "valid/pxd008934.sdrf.tsv",
        "templates": ["human"],
    },
    {
        "name":      "pxd009749",
        "file":      "valid/pxd009749.sdrf.tsv",
        "templates": ["immunopeptidomics"],
    },
    {
        "name":      "diann-label-free",
        "file":      "valid/diann-label-free.sdrf.tsv",
        "templates": ["ms-proteomics"],
    },
]


def categorize(message: str) -> str:
    msg = message.lower()
    if "missing from the sdrf file" in msg or ("required column" in msg and "missing" in msg):
        return "MISSING_REQUIRED_COLUMN"
    if "empty value found" in msg:
        return "EMPTY_CELL"
    if "does not match required pattern" in msg or "does not match the required format" in msg:
        return "PATTERN_MISMATCH"
    if "must be one of the allowed values" in msg or ("invalid value" in msg and "allowed" in msg):
        return "INVALID_VALUE"
    if "trailing whitespace" in msg:
        return "TRAILING_WHITESPACE"
    if "duplicate" in msg:
        return "DUPLICATE_COMBINATION"
    if "column order" in msg or "wrong position" in msg or "appears after" in msg:
        return "COLUMN_ORDER_INVALID"
    if "not found in" in msg or "ontology" in msg:
        return "ONTOLOGY_TERM_NOT_FOUND"
    if "insufficient" in msg or ("at least" in msg and "column" in msg):
        return "INSUFFICIENT_COLUMNS"
    if "single cardinality" in msg or "multiple entries" in msg or "multiple unique values" in msg:
        return "SINGLE_CARDINALITY_VIOLATED"
    return "OTHER"


def run_validator(sdrf_path: str, templates: list[str]) -> tuple[list[dict], list[dict]]:
    """Run parse_sdrf validate-sdrf and return (errors, warnings) as dicts.

    Note: the CLI --template option is not `multiple=True`, so only one template
    can be passed per invocation.  CASES uses exactly one template per fixture.
    """
    if len(templates) != 1:
        raise ValueError(f"Expected exactly one template, got: {templates}")
    tmpfile = "/tmp/sdrf_validation_out.tsv"
    cmd = ["parse_sdrf", "validate-sdrf", "-s", sdrf_path, "--skip-ontology",
           "-o", tmpfile, "-t", templates[0]]

    result = subprocess.run(cmd, capture_output=True, text=True)

    errors: list[dict] = []
    warnings: list[dict] = []

    try:
        with open(tmpfile, newline="", encoding="utf-8") as fh:
            reader = csv.DictReader(fh, delimiter="\t")
            for row in reader:
                kind = row.get("type", "").strip().upper()
                msg  = row.get("message", "").strip()
                entry = {"message": msg, "category": categorize(msg)}
                if kind == "ERROR":
                    errors.append(entry)
                elif kind == "WARNING":
                    warnings.append(entry)
    except FileNotFoundError:
        pass

    return errors, warnings


def main() -> None:
    out_dir = os.path.join(FIXTURES_DIR, "expected")
    os.makedirs(out_dir, exist_ok=True)

    for case in CASES:
        name      = case["name"]
        rel_file  = case["file"]
        templates = case["templates"]
        abs_file  = os.path.join(FIXTURES_DIR, rel_file)

        print(f"Processing {name} [{', '.join(templates)}] ...")
        errors, warnings = run_validator(abs_file, templates)

        error_categories   = sorted(set(e["category"] for e in errors))
        warning_categories = sorted(set(w["category"] for w in warnings))

        payload = {
            "file":               rel_file,
            "templates":          templates,
            "has_errors":         len(errors) > 0,
            "has_warnings":       len(warnings) > 0,
            "error_count":        len(errors),
            "warning_count":      len(warnings),
            "error_categories":   error_categories,
            "warning_categories": warning_categories,
            "errors":             errors,
            "warnings":           warnings,
        }

        out_path = os.path.join(out_dir, f"{name}.json")
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2)
            fh.write("\n")

        status = "ERRORS" if errors else ("WARNINGS" if warnings else "CLEAN")
        print(f"  {status}: {len(errors)} error(s), {len(warnings)} warning(s)")
        if error_categories:
            print(f"  Error categories: {error_categories}")
        if warning_categories:
            print(f"  Warning categories: {warning_categories}")

    print("\nDone. Expected results written to fixtures/expected/")


if __name__ == "__main__":
    main()
