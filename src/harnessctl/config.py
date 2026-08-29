"""Config v1 loading backed exclusively by generated TypeScript contracts."""

from __future__ import annotations

import hashlib
import json
import math
from copy import deepcopy
from importlib.resources import files
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator
from yaml.constructor import ConstructorError
from yaml.nodes import MappingNode

CODE_INDEX_SKILL_ID = "codeIndex"
CONFIG_V1_REWRITE_GUIDANCE = (
    "Config v1 requires explicit version: 1. Manually rewrite .harnessctl/config.yaml "
    "using docs/configuration.md; automatic migration is not supported."
)
_SCHEMA_NAME = "config-v1.schema.json"
_DEFAULTS_NAME = "config-v1.defaults.json"
_FINGERPRINTS_NAME = "config-v1.fingerprints.json"
_SUPPORTED_CONFIG_REFINEMENTS = ("enabled-mcp-references-exist",)


class ConfigError(ValueError):
    """Invalid harnessctl configuration."""

    def __init__(self, message: str, validation_paths: tuple[str, ...] = ()) -> None:
        super().__init__(message)
        self.validation_paths = validation_paths


class _ConfigLoader(yaml.SafeLoader):
    """Safe YAML loader that rejects duplicate and non-string mapping keys."""

    def construct_mapping(self, node: MappingNode, deep: bool = False) -> dict[str, Any]:
        self.flatten_mapping(node)
        mapping: dict[str, Any] = {}
        for key_node, value_node in node.value:
            key = self.construct_object(key_node, deep=deep)
            if not isinstance(key, str):
                raise ConstructorError(
                    None,
                    None,
                    "mapping keys must be strings",
                    key_node.start_mark,
                )
            if key in mapping:
                raise ConstructorError(
                    None,
                    None,
                    "duplicate mapping key",
                    key_node.start_mark,
                )
            mapping[key] = self.construct_object(value_node, deep=deep)
        return mapping


def _contract_bytes(name: str) -> bytes:
    return files("harnessctl").joinpath("contracts", name).read_bytes()


def _load_contracts() -> tuple[dict[str, Any], dict[str, Any]]:
    schema_bytes = _contract_bytes(_SCHEMA_NAME)
    defaults_bytes = _contract_bytes(_DEFAULTS_NAME)
    fingerprints = json.loads(_contract_bytes(_FINGERPRINTS_NAME))
    if not isinstance(fingerprints, dict) or fingerprints.get("algorithm") != "sha256":
        raise RuntimeError("invalid Config v1 fingerprint manifest")
    expected = fingerprints.get("artifacts")
    if not isinstance(expected, dict):
        raise RuntimeError("invalid Config v1 fingerprint manifest")
    for name, content in ((_SCHEMA_NAME, schema_bytes), (_DEFAULTS_NAME, defaults_bytes)):
        if hashlib.sha256(content).hexdigest() != expected.get(name):
            raise RuntimeError(f"Config v1 artifact fingerprint mismatch: {name}")
    schema = json.loads(schema_bytes)
    defaults = json.loads(defaults_bytes)
    if not isinstance(schema, dict) or not isinstance(defaults, dict):
        raise RuntimeError("Config v1 artifacts must contain JSON objects")
    Draft202012Validator.check_schema(schema)
    if tuple(schema.get("x-harnessctl-config-refinements", ())) != (_SUPPORTED_CONFIG_REFINEMENTS):
        raise RuntimeError("unsupported or missing Config v1 runtime refinements")
    return schema, defaults


_CONFIG_V1_SCHEMA, DEFAULT_CONFIG = _load_contracts()
_CONFIG_V1_VALIDATOR = Draft202012Validator(
    _CONFIG_V1_SCHEMA,
    format_checker=Draft202012Validator.FORMAT_CHECKER,
)


def load_config(cwd: Path) -> dict[str, Any]:
    """Load and validate a Config v1 document without mutating it."""
    path = cwd / ".harnessctl/config.yaml"
    try:
        content = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return deepcopy(DEFAULT_CONFIG)
    except OSError as error:
        raise ConfigError(f"unable to read {path}: {error}") from error
    try:
        value = yaml.load(content, Loader=_ConfigLoader)
    except yaml.YAMLError as error:
        problem = getattr(error, "problem", None) or "malformed YAML"
        mark = getattr(error, "problem_mark", None)
        location = ""
        if mark is not None:
            location = f" at line {mark.line + 1}, column {mark.column + 1}"
        raise ConfigError(f"unable to read {path}: {problem}{location}") from error
    if not isinstance(value, dict):
        raise ConfigError("configuration root must be a YAML mapping")
    if value.get("version") != 1 or isinstance(value.get("version"), bool):
        raise ConfigError(CONFIG_V1_REWRITE_GUIDANCE, ("version",))
    config = _merge(DEFAULT_CONFIG, value)
    if "mcpServers" in value:
        config["mcpServers"] = deepcopy(value["mcpServers"])
    _validate_host_overrides(config)
    errors = sorted(
        _CONFIG_V1_VALIDATOR.iter_errors(config),
        key=lambda error: tuple(str(segment) for segment in error.absolute_path),
    )
    if errors:
        details = "\n".join(
            f"- {_error_path(error.absolute_path)}: {error.message}" for error in errors
        )
        paths = tuple(
            sorted({_error_path(path) for error in errors for path in _deepest_error_paths(error)})
        )
        raise ConfigError(f"Invalid Config v1:\n{details}", paths)
    _validate_config_refinements(config)
    return config


def _validate_config_refinements(config: dict[str, Any]) -> None:
    """Apply cross-key refinements declared by the generated Config v1 contract."""
    skills = config["skills"]
    references = (
        (
            skills["cvs"]["enabled"],
            skills["cvs"]["provider"].get("mcpName"),
            "skills.cvs.provider.mcpName",
        ),
        (
            skills["issues"]["enabled"] and skills["issues"]["provider"]["type"] != "filesystem",
            skills["issues"]["provider"].get("mcpName"),
            "skills.issues.provider.mcpName",
        ),
        (
            skills["documents"]["enabled"]
            and skills["documents"]["provider"]["type"] != "filesystem",
            skills["documents"]["provider"].get("mcpName"),
            "skills.documents.provider.mcpName",
        ),
        (
            skills[CODE_INDEX_SKILL_ID]["enabled"],
            skills[CODE_INDEX_SKILL_ID]["mcpName"],
            "skills.codeIndex.mcpName",
        ),
    )
    missing = tuple(
        path
        for enabled, server_id, path in references
        if enabled and server_id is not None and server_id not in config["mcpServers"]
    )
    if missing:
        details = "\n".join(f"- {path}: references a missing mcpServers key" for path in missing)
        raise ConfigError(f"Invalid Config v1:\n{details}", missing)


def _validate_host_overrides(config: dict[str, Any]) -> None:
    """Reject YAML values outside the JSON data model at exact override paths."""
    servers = config.get("mcpServers")
    if not isinstance(servers, dict):
        return
    for server_id, declaration in servers.items():
        if not isinstance(declaration, dict):
            continue
        for host in ("opencode", "pi"):
            if host in declaration:
                _validate_json_value(
                    declaration[host],
                    f"mcpServers.{server_id}.{host}",
                    set(),
                )


def _validate_json_value(value: Any, path: str, ancestors: set[int]) -> None:
    if value is None or isinstance(value, (str, bool, int)):
        return
    if isinstance(value, float):
        if math.isfinite(value):
            return
        raise ConfigError(
            f"Invalid Config v1:\n- {path}: host override numbers must be finite",
            (path,),
        )
    if isinstance(value, list):
        _enter_json_container(value, path, ancestors)
        for index, item in enumerate(value):
            _validate_json_value(item, f"{path}.{index}", ancestors)
        ancestors.remove(id(value))
        return
    if isinstance(value, dict):
        _enter_json_container(value, path, ancestors)
        for key, item in value.items():
            key_path = f"{path}.{key}"
            if any(
                ord(character) < 32 or 127 <= ord(character) <= 159 or character in "\u2028\u2029"
                for character in key
            ):
                raise ConfigError(
                    "Invalid Config v1:\n"
                    f"- {key_path}: host override keys must not contain control characters",
                    (key_path,),
                )
            _validate_json_value(item, key_path, ancestors)
        ancestors.remove(id(value))
        return
    raise ConfigError(
        f"Invalid Config v1:\n- {path}: host override values must be JSON-compatible",
        (path,),
    )


def _enter_json_container(
    value: list[Any] | dict[str, Any], path: str, ancestors: set[int]
) -> None:
    identity = id(value)
    if identity in ancestors:
        raise ConfigError(
            f"Invalid Config v1:\n- {path}: host override values must not contain cycles",
            (path,),
        )
    ancestors.add(identity)


def _merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    if (
        isinstance(base.get("type"), str)
        and isinstance(override.get("type"), str)
        and base["type"] != override["type"]
    ):
        return deepcopy(override)
    result = deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _merge(result[key], value)
        else:
            result[key] = deepcopy(value)
    return result


def _error_path(path: Any) -> str:
    segments = [str(segment) for segment in path]
    return ".".join(segments) if segments else "<root>"


def _deepest_error_paths(error: Any) -> list[Any]:
    """Return the most specific portable paths from a composed schema error."""
    candidates = [
        nested_path for nested in error.context for nested_path in _deepest_error_paths(nested)
    ]
    if not candidates:
        return [error.absolute_path]
    maximum_depth = max(len(path) for path in candidates)
    return [path for path in candidates if len(path) == maximum_depth]
