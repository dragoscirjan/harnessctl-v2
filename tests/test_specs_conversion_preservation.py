from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).parents[1]
FIXTURE_PATH = ROOT / "tests/fixtures/specs-conversion-preservation-v1.json"
COMPLETION_PATH = ROOT / ".harnessctl/documents/.control/specs-to-documents-v1/completion.json"
DOCUMENTS_ROOT = ROOT / ".harnessctl/documents"
LEGACY_METADATA_KEYS = {
    "source_path",
    "source_sha256",
    "decoder_version",
    "original_status",
    "field_conversions",
    "frontmatter",
    "rewrites",
}
MAPPING_KEYS = {
    "sourcePath",
    "targetPath",
    "sourceSha256",
    "targetSha256",
    "documentId",
}


def _fixture() -> dict[str, Any]:
    return json.loads(FIXTURE_PATH.read_bytes())


def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _frontmatter(payload: bytes) -> dict[str, Any]:
    opening, document = payload.split(b"\n---\n", maxsplit=1)
    assert opening.startswith(b"---\n")
    metadata = yaml.safe_load(opening.removeprefix(b"---\n"))
    assert document.startswith(b"\n# ")
    assert isinstance(metadata, dict)
    return metadata


def test_fixture_matches_temporary_completion_record_when_present() -> None:
    if not COMPLETION_PATH.exists():
        return

    fixture = _fixture()
    completion = json.loads(COMPLETION_PATH.read_bytes())
    completion_mapping = [
        {key: entry[key] for key in MAPPING_KEYS} for entry in completion["metadata"]["mapping"]
    ]

    assert completion["identity"] == fixture["migrationId"]
    assert completion_mapping == fixture["mapping"]


def test_converted_documents_remain_byte_and_provenance_exact() -> None:
    fixture = _fixture()
    mapping = fixture["mapping"]
    lineage_ids = fixture["lineageIds"]

    assert fixture["fixtureVersion"] == 1
    assert fixture["convertedCount"] == len(mapping) == 19
    assert all(set(entry) == MAPPING_KEYS for entry in mapping)
    assert len({entry["sourcePath"] for entry in mapping}) == 19
    assert len({entry["targetPath"] for entry in mapping}) == 19
    assert lineage_ids == sorted({entry["documentId"] for entry in mapping})
    assert len(lineage_ids) == 14

    for entry in mapping:
        payload = (ROOT / entry["targetPath"]).read_bytes()
        metadata = _frontmatter(payload)
        legacy_spec = metadata["metadata"]["legacy_spec"]

        assert _sha256(payload) == entry["targetSha256"]
        assert metadata["id"] == entry["documentId"]
        assert set(legacy_spec) == LEGACY_METADATA_KEYS
        assert legacy_spec["source_path"] == entry["sourcePath"]
        assert legacy_spec["source_sha256"] == entry["sourceSha256"]


def test_active_documents_preserve_converted_inventory_and_v4_successors() -> None:
    fixture = _fixture()
    expected_paths = {entry["targetPath"] for entry in fixture["mapping"]} | set(
        fixture["successorPaths"]
    )
    active_paths = {path.relative_to(ROOT).as_posix() for path in DOCUMENTS_ROOT.glob("doc-*.md")}

    assert expected_paths <= active_paths


def test_specs_v1_is_exact_inert_history() -> None:
    archive = _fixture()["legacyArchive"]
    expected_paths = {entry["path"] for entry in archive}
    actual_paths = {
        path.relative_to(ROOT).as_posix()
        for path in (ROOT / ".specs-v1").iterdir()
        if path.is_file()
    }

    assert actual_paths == expected_paths
    for entry in archive:
        assert _sha256((ROOT / entry["path"]).read_bytes()) == entry["sha256"]
