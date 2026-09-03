from __future__ import annotations

import hashlib
import json
from importlib.resources import files
from pathlib import Path
from typing import Any

import pytest

from harnessctl.config import (
    CONFIG_V1_REWRITE_GUIDANCE,
    DEFAULT_CONFIG,
    ConfigError,
    load_config,
)

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = json.loads(
    (ROOT / "tests/fixtures/config-v1-conformance.json").read_text(encoding="utf-8")
)
OPENCODE_OVERRIDE_PROTECTED_KEYS = (
    "type",
    "url",
    "command",
    "headers",
    "environment",
    "cwd",
    "auth",
    "oauth",
)
PI_OVERRIDE_PROTECTED_KEYS = (
    "url",
    "command",
    "args",
    "headers",
    "env",
    "cwd",
    "lifecycle",
    "auth",
    "oauth",
)


def _write_config(project: Path, value: Any) -> None:
    path = project / ".harnessctl/config.yaml"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def test_missing_file_returns_generated_defaults(tmp_path: Path) -> None:
    assert load_config(tmp_path) == DEFAULT_CONFIG


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=lambda case: case["id"])
def test_shared_config_v1_conformance(tmp_path: Path, case: dict[str, Any]) -> None:
    _write_config(tmp_path, case["input"])
    if case["valid"]:
        assert load_config(tmp_path) == case["expected"]
        return
    with pytest.raises(ConfigError) as caught:
        load_config(tmp_path)
    assert list(caught.value.validation_paths) == case["error_paths"]
    if case["error_paths"] == ["version"]:
        assert str(caught.value) == CONFIG_V1_REWRITE_GUIDANCE
    else:
        assert "Invalid Config v1" in str(caught.value)


@pytest.mark.parametrize(
    ("content", "message"),
    [
        ("version: 1\nversion: 1\n", "duplicate mapping key"),
        ("version: 1\n1: invalid\n", "mapping keys must be strings"),
        ("[", "expected the node content"),
    ],
)
def test_safe_yaml_failures(tmp_path: Path, content: str, message: str) -> None:
    path = tmp_path / ".harnessctl/config.yaml"
    path.parent.mkdir(parents=True)
    path.write_text(content, encoding="utf-8")
    with pytest.raises(ConfigError, match=message):
        load_config(tmp_path)


def test_packaged_config_artifacts_match_fingerprint_manifest() -> None:
    contracts = files("harnessctl").joinpath("contracts")
    manifest = json.loads(contracts.joinpath("config-v1.fingerprints.json").read_bytes())
    assert manifest["version"] == 1
    assert manifest["algorithm"] == "sha256"
    for name in ("config-v1.schema.json", "config-v1.defaults.json"):
        content = contracts.joinpath(name).read_bytes()
        assert hashlib.sha256(content).hexdigest() == manifest["artifacts"][name]


def test_plain_bitbucket_provider_remains_valid_without_mcp_name(tmp_path: Path) -> None:
    provider = {
        "type": "bitbucket",
        "tools": "git",
        "url": "https://bitbucket.org",
        "token_env": "BITBUCKET_TOKEN",
    }
    _write_config(tmp_path, {"version": 1, "skills": {"cvs": {"provider": provider}}})

    assert load_config(tmp_path)["skills"]["cvs"]["provider"] == provider


def test_workspaces_require_enabled_git_cvs(tmp_path: Path) -> None:
    _write_config(tmp_path, {"version": 1, "skills": {"cvs": {"workspaces": True}}})
    assert load_config(tmp_path)["skills"]["cvs"]["workspaces"] is True

    for cvs in (
        {"enabled": False, "workspaces": True},
        {"local": "jj", "workspaces": True},
    ):
        _write_config(tmp_path, {"version": 1, "skills": {"cvs": cvs}})
        with pytest.raises(ConfigError) as caught:
            load_config(tmp_path)
        assert caught.value.validation_paths == ("skills.cvs.workspaces",)


def test_bitbucket_mcp_name_references_explicit_generic_declaration(tmp_path: Path) -> None:
    provider = {
        "type": "bitbucket",
        "tools": "git",
        "mcpName": "operator_bitbucket",
        "url": "https://bitbucket.org",
        "token_env": "BITBUCKET_TOKEN",
    }
    _write_config(
        tmp_path,
        {
            "version": 1,
            "mcpServers": {"operator_bitbucket": {"command": "operator-mcp"}},
            "skills": {"cvs": {"provider": provider}},
        },
    )

    assert load_config(tmp_path)["skills"]["cvs"]["provider"] == provider


@pytest.mark.parametrize(
    ("skills", "path"),
    [
        ({"cvs": {"provider": {"mcpName": "missing"}}}, "skills.cvs.provider.mcpName"),
        (
            {"codeIndex": {"enabled": True, "mcpName": "missing"}},
            "skills.codeIndex.mcpName",
        ),
    ],
)
def test_enabled_skill_mcp_reference_must_exist(
    tmp_path: Path, skills: dict[str, Any], path: str
) -> None:
    _write_config(tmp_path, {"version": 1, "skills": skills})

    with pytest.raises(ConfigError) as caught:
        load_config(tmp_path)

    assert caught.value.validation_paths == (path,)


def test_enabled_web_retrieval_reference_must_exist(tmp_path: Path) -> None:
    _write_config(
        tmp_path,
        {
            "version": 1,
            "mcpServers": {},
            "skills": {
                "cvs": {"enabled": False},
                "webRetrieval": {"enabled": True},
            },
        },
    )

    with pytest.raises(ConfigError) as caught:
        load_config(tmp_path)

    assert caught.value.validation_paths == ("skills.webRetrieval.mcpName",)


@pytest.mark.parametrize(
    ("yaml_value", "suffix"),
    [
        ("2026-08-30", "released"),
        (".inf", "weight"),
        (".nan", "weight"),
    ],
)
def test_host_overrides_reject_yaml_values_outside_json_data_model(
    tmp_path: Path, yaml_value: str, suffix: str
) -> None:
    path = tmp_path / ".harnessctl/config.yaml"
    path.parent.mkdir(parents=True)
    path.write_text(
        "version: 1\n"
        "mcpServers:\n"
        "  custom:\n"
        "    command: custom-mcp\n"
        "    opencode:\n"
        f"      {suffix}: {yaml_value}\n"
        "skills:\n"
        "  cvs: {enabled: false}\n",
        encoding="utf-8",
    )

    with pytest.raises(ConfigError) as caught:
        load_config(tmp_path)

    assert caught.value.validation_paths == (f"mcpServers.custom.opencode.{suffix}",)


@pytest.mark.parametrize(
    ("host", "protected_key"),
    [("opencode", key) for key in OPENCODE_OVERRIDE_PROTECTED_KEYS]
    + [("pi", key) for key in PI_OVERRIDE_PROTECTED_KEYS],
)
def test_host_override_protected_keys_report_exact_python_paths(
    tmp_path: Path, host: str, protected_key: str
) -> None:
    _write_config(
        tmp_path,
        {
            "version": 1,
            "mcpServers": {
                "custom": {
                    "command": "custom-mcp",
                    host: {protected_key: "replacement"},
                }
            },
            "skills": {"cvs": {"enabled": False}},
        },
    )

    with pytest.raises(ConfigError) as caught:
        load_config(tmp_path)

    assert caught.value.validation_paths == (f"mcpServers.custom.{host}.{protected_key}",)


def test_host_override_rejects_yaml_cycle_at_exact_path(tmp_path: Path) -> None:
    path = tmp_path / ".harnessctl/config.yaml"
    path.parent.mkdir(parents=True)
    path.write_text(
        "version: 1\n"
        "mcpServers:\n"
        "  custom:\n"
        "    command: custom-mcp\n"
        "    opencode: &override\n"
        "      self: *override\n"
        "skills:\n"
        "  cvs: {enabled: false}\n",
        encoding="utf-8",
    )

    with pytest.raises(ConfigError) as caught:
        load_config(tmp_path)

    assert caught.value.validation_paths == ("mcpServers.custom.opencode.self",)
