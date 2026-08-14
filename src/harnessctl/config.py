"""Project configuration loading for skill installation."""

from __future__ import annotations

from copy import deepcopy
from pathlib import Path, PurePosixPath
from typing import Any

import yaml

DEFAULT_CONFIG: dict[str, Any] = {
    "version": 2,
    "issues": {
        "prefix": "",
        "type": "filesystem",
        "tools": (
            "issue_id,issue_create,issue_list,issue_get,issue_update,"
            "issue_transition,issue_comment,issue_relate,issue_unrelate,"
            "issue_link_document,issue_validate,issue_archive"
        ),
    },
    "paths": {
        "root": ".harnessctl",
        "tasks": ".harnessctl/tasks",
        "reports": ".harnessctl/reports",
    },
    "workflow": {"default_task_type": "bug"},
    "communication": {"caveman": {"enabled": True, "mode": "strict"}},
    "memory": {
        "enabled": False,
        "backend": "repository",
        "namespace": {
            "organization_id": "local",
            "project_id": "project",
            "default_topic": "general",
        },
        "retrieval": {"limit": 8, "max_chars": 12_000, "include_superseded": False},
        "repository": {
            "root": ".harnessctl/memory",
            "cache": ".harnessctl/cache/memory-index.json",
        },
    },
}


class ConfigError(ValueError):
    """Invalid harnessctl configuration."""


def load_config(cwd: Path) -> dict[str, Any]:
    """Load, migrate, and validate project config without mutating it."""
    path = cwd / ".harnessctl/config.yaml"
    try:
        content = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return deepcopy(DEFAULT_CONFIG)
    except OSError as error:
        raise ConfigError(f"unable to read {path}: {error}") from error
    try:
        value = yaml.safe_load(content)
    except yaml.YAMLError as error:
        raise ConfigError(f"unable to read {path}: {error}") from error
    if not isinstance(value, dict):
        raise ConfigError("configuration root must be a YAML mapping")
    version = value.get("version")
    if version not in (None, 1, 2):
        raise ConfigError(f"unsupported configuration version: {version}")
    config = _merge(DEFAULT_CONFIG, value)
    config["version"] = 2
    _validate(config)
    return config


def _merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    result = deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _merge(result[key], value)
        else:
            result[key] = deepcopy(value)
    return result


def _mapping(parent: dict[str, Any], key: str) -> dict[str, Any]:
    value = parent.get(key)
    if not isinstance(value, dict):
        raise ConfigError(f"{key} must be a mapping")
    return value


def _validate(config: dict[str, Any]) -> None:
    caveman = _mapping(_mapping(config, "communication"), "caveman")
    if not isinstance(caveman.get("enabled"), bool):
        raise ConfigError("communication.caveman.enabled must be boolean")
    if caveman.get("mode") not in ("strict", "balanced"):
        raise ConfigError("communication.caveman.mode must be strict or balanced")

    memory = _mapping(config, "memory")
    if not isinstance(memory.get("enabled"), bool):
        raise ConfigError("memory.enabled must be boolean")
    if memory.get("backend") != "repository":
        raise ConfigError("memory.backend must be repository in config v2")
    namespace = _mapping(memory, "namespace")
    for key in ("organization_id", "project_id", "default_topic"):
        if not isinstance(namespace.get(key), str) or not namespace[key].strip():
            raise ConfigError(f"memory.namespace.{key} must be a non-empty string")
    retrieval = _mapping(memory, "retrieval")
    _bounded_integer(retrieval, "limit", 1, 100)
    _bounded_integer(retrieval, "max_chars", 256, 100_000)
    if not isinstance(retrieval.get("include_superseded"), bool):
        raise ConfigError("memory.retrieval.include_superseded must be boolean")
    repository = _mapping(memory, "repository")
    root = _safe_path(repository, "root")
    cache = _safe_path(repository, "cache")
    if cache == root or root in cache.parents:
        raise ConfigError("memory.repository.cache must be outside memory.repository.root")


def _bounded_integer(parent: dict[str, Any], key: str, low: int, high: int) -> None:
    value = parent.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        raise ConfigError(f"memory.retrieval.{key} must be an integer from {low} to {high}")


def _safe_path(parent: dict[str, Any], key: str) -> PurePosixPath:
    value = parent.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ConfigError(f"memory.repository.{key} must be a non-empty string")
    if "\\" in value or (len(value) >= 2 and value[0].isalpha() and value[1] == ":"):
        raise ConfigError(f"memory.repository.{key} must stay inside project root")
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts:
        raise ConfigError(f"memory.repository.{key} must stay inside project root")
    return path
