#!/usr/bin/env python3
"""
Download SDRF fixture files and official template YAML files for integration tests.

Run from the repository root:
    python scripts/download-sdrf-fixtures.py

Outputs:
    packages/core/tests/integration/fixtures/valid/*.sdrf.tsv
    packages/core/tests/integration/fixtures/templates/*.yaml
"""

import os
import sys
import urllib.request

FIXTURES_DIR = os.path.join(
    os.path.dirname(__file__),
    "..", "packages", "core", "tests", "integration", "fixtures"
)

SDRF_BASE = "https://raw.githubusercontent.com/bigbio/sdrf-pipelines/main/tests/data"
TMPL_BASE = "https://raw.githubusercontent.com/bigbio/sdrf-templates/main"

SDRF_FILES = {
    "valid/sample-basic.sdrf.tsv":      f"{SDRF_BASE}/sample.sdrf.tsv",
    "valid/pxd001819.sdrf.tsv":          f"{SDRF_BASE}/PXD001819/PXD001819.sdrf.tsv",
    "valid/pxd015270.sdrf.tsv":          f"{SDRF_BASE}/PXD015270/PXD015270-Sample-1.tsv",
    "valid/pxd000612.sdrf.tsv":          f"{SDRF_BASE}/reference/PXD000612/PXD000612.sdrf.tsv",
    "valid/pxd001474.sdrf.tsv":          f"{SDRF_BASE}/reference/PXD001474/PXD001474.sdrf.tsv",
    "valid/pxd002137.sdrf.tsv":          f"{SDRF_BASE}/reference/PXD002137/PXD002137.sdrf.tsv",
    "valid/pxd004684.sdrf.tsv":          f"{SDRF_BASE}/reference/PXD004684/PXD004684.sdrf.tsv",
    "valid/pxd008934.sdrf.tsv":          f"{SDRF_BASE}/reference/PXD008934/PXD008934.sdrf.tsv",
    "valid/pxd009749.sdrf.tsv":          f"{SDRF_BASE}/mhcquant/PXD009749.sdrf.tsv",
    "valid/diann-label-free.sdrf.tsv":   f"{SDRF_BASE}/diann/label_free.sdrf.tsv",
}

TEMPLATE_FILES = {
    "templates/base.yaml":               f"{TMPL_BASE}/base/1.1.0/base.yaml",
    "templates/sample-metadata.yaml":    f"{TMPL_BASE}/sample-metadata/1.0.0/sample-metadata.yaml",
    "templates/ms-proteomics.yaml":      f"{TMPL_BASE}/ms-proteomics/1.1.0/ms-proteomics.yaml",
    "templates/human.yaml":              f"{TMPL_BASE}/human/1.1.0/human.yaml",
    "templates/vertebrates.yaml":        f"{TMPL_BASE}/vertebrates/1.1.0/vertebrates.yaml",
    "templates/cell-lines.yaml":         f"{TMPL_BASE}/cell-lines/1.1.0/cell-lines.yaml",
    "templates/dia-acquisition.yaml":    f"{TMPL_BASE}/dia-acquisition/1.1.0/dia-acquisition.yaml",
    "templates/immunopeptidomics.yaml":  f"{TMPL_BASE}/immunopeptidomics/1.0.0/immunopeptidomics.yaml",
    "templates/clinical-metadata.yaml":  f"{TMPL_BASE}/clinical-metadata/1.0.0/clinical-metadata.yaml",
}


def download(url: str, dest: str) -> None:
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print(f"  {url}")
    print(f"    -> {os.path.relpath(dest)}")
    try:
        urllib.request.urlretrieve(url, dest)
    except Exception as exc:
        print(f"    ERROR: {exc}", file=sys.stderr)
        raise


def main() -> None:
    print("Downloading SDRF fixture files...")
    for rel, url in SDRF_FILES.items():
        dest = os.path.join(FIXTURES_DIR, rel)
        download(url, dest)

    print("\nDownloading template YAML files...")
    for rel, url in TEMPLATE_FILES.items():
        dest = os.path.join(FIXTURES_DIR, rel)
        download(url, dest)

    print("\nDone.")


if __name__ == "__main__":
    main()
