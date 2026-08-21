"""Project configuration loading for skill installation."""

from __future__ import annotations

import re
from copy import deepcopy
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import urlsplit

import yaml

FILESYSTEM_ISSUE_TOOLS = (
    "issue_id,issue_create,issue_list,issue_get,issue_update,issue_transition,"
    "issue_comment,issue_relate,issue_unrelate,issue_link_document,issue_validate,"
    "issue_archive"
)
REMOTE_ISSUE_TYPES = frozenset({"github", "gitlab", "gitea", "forgejo"})
REMOTE_ISSUE_PROVIDERS = {
    "github": {"tool": "gh", "url": "https://github.com", "token_env": "GH_TOKEN"},
    "gitlab": {"tool": "glab", "url": "https://gitlab.com", "token_env": "GITLAB_TOKEN"},
    "gitea": {"tool": "tea", "url": None, "token_env": "GITEA_TOKEN"},
    "forgejo": {"tool": "forgejo-cli", "url": None, "token_env": "FORGEJO_TOKEN"},
}
CVS_LOCALS = frozenset({"git", "jj"})
MCP_OUTPUT_LIMIT_MODES = frozenset({"bounded-guidance", "hard"})

DEFAULT_CONFIG: dict[str, Any] = {
    "version": 2,
    "issues": {
        "root": ".harnessctl/issues",
        "prefix": "hrn-",
        "type": "filesystem",
        "tools": FILESYSTEM_ISSUE_TOOLS,
    },
    "cvs": {
        "local": "git",
        "remote": {
            "provider": "github",
            "tools": "gh",
            "url": "https://github.com",
            "token_env": "GH_TOKEN",
        },
    },
    "mcp": {"output_limit_mode": "bounded-guidance"},
    "paths": {
        "root": ".harnessctl",
        "tasks": ".harnessctl/tasks",
        "reports": ".harnessctl/reports",
    },
    "workflow": {"default_task_type": "bug", "tdd": {"enabled": False}},
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
    _require_explicit_remote_configuration(value)
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
    issues = _mapping(config, "issues")
    _allowed_keys(issues, {"root", "prefix", "type", "tools", "remote"}, "issues")
    _safe_path(issues, "root", "issues")
    prefix = issues.get("prefix")
    if not isinstance(prefix, str) or not all(
        character.isascii() and (character.isalnum() or character in "_-") for character in prefix
    ):
        raise ConfigError(
            "issues.prefix must contain only ASCII letters, digits, underscores, or hyphens"
        )
    issue_type = issues.get("type")
    if issue_type not in {"filesystem", *REMOTE_ISSUE_TYPES}:
        raise ConfigError("issues.type must be filesystem, github, gitlab, gitea, or forgejo")
    _normalize_issue_tools(issues, issue_type)
    _validate_issue_remote(issues, issue_type)

    cvs = _mapping(config, "cvs")
    _allowed_keys(cvs, {"local", "remote"}, "cvs")
    if cvs.get("local") not in CVS_LOCALS:
        raise ConfigError("cvs.local must be git or jj")
    remote = _mapping(cvs, "remote")
    _allowed_keys(
        remote,
        {"provider", "tools", "url", "token_env"},
        "cvs.remote",
    )
    _validate_remote_service(remote, "cvs.remote", "provider")

    mcp = _mapping(config, "mcp")
    _allowed_keys(mcp, {"output_limit_mode"}, "mcp")
    if mcp.get("output_limit_mode") not in MCP_OUTPUT_LIMIT_MODES:
        raise ConfigError("mcp.output_limit_mode must be bounded-guidance or hard")

    tdd = _mapping(_mapping(config, "workflow"), "tdd")
    if not isinstance(tdd.get("enabled"), bool):
        raise ConfigError("workflow.tdd.enabled must be boolean")

    caveman = _mapping(_mapping(config, "communication"), "caveman")
    if not isinstance(caveman.get("enabled"), bool):
        raise ConfigError("communication.caveman.enabled must be boolean")
    if caveman.get("mode") not in ("strict", "balanced"):
        raise ConfigError("communication.caveman.mode must be strict or balanced")

    memory = _mapping(config, "memory")
    if not isinstance(memory.get("enabled"), bool):
        raise ConfigError("memory.enabled must be boolean")
    if memory["enabled"] and not caveman["enabled"]:
        raise ConfigError("memory.enabled=true requires communication.caveman.enabled=true")
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
    _safe_path(repository, "root", "memory.repository")


def _require_explicit_remote_configuration(source: dict[str, Any]) -> None:
    issues = source.get("issues")
    if (
        isinstance(issues, dict)
        and issues.get("type") in REMOTE_ISSUE_TYPES
        and "tools" not in issues
    ):
        raise ConfigError(
            f"issues.type={issues['type']} requires issues.tools to be selected explicitly"
        )
    if (
        isinstance(issues, dict)
        and issues.get("type") in REMOTE_ISSUE_TYPES
        and "remote" not in issues
    ):
        raise ConfigError(f"issues.type={issues['type']} requires issues.remote")

    cvs = source.get("cvs")
    if not isinstance(cvs, dict) or not isinstance(cvs.get("remote"), dict):
        return
    remote = cvs["remote"]
    provider = remote.get("provider")
    if provider is None or provider == "github":
        return
    for key in ("tools", "url", "token_env"):
        if key not in remote:
            raise ConfigError(
                f"cvs.remote.provider={provider} requires cvs.remote.{key} "
                "to be selected explicitly"
            )


def _normalize_issue_tools(issues: dict[str, Any], issue_type: str) -> None:
    value = issues.get("tools")
    if not isinstance(value, str):
        raise ConfigError("issues.tools must be a string")
    tools = [tool.strip() for tool in value.split(",")]
    if any(
        not tool
        or not all(
            character.isascii() and (character.isalnum() or character in "_-") for character in tool
        )
        for tool in tools
    ):
        raise ConfigError(
            "issues.tools entries must be safe executable identifiers without "
            "arguments, paths, assignments, or shell operators"
        )
    if issue_type == "filesystem":
        required = FILESYSTEM_ISSUE_TOOLS.split(",")
        if (
            len(tools) != len(required)
            or len(set(tools)) != len(tools)
            or any(tool not in required for tool in tools)
        ):
            raise ConfigError(
                f"issues.tools must be exactly {FILESYSTEM_ISSUE_TOOLS} for issues.type=filesystem"
            )
        issues["tools"] = FILESYSTEM_ISSUE_TOOLS
        return
    expected = REMOTE_ISSUE_PROVIDERS[issue_type]["tool"]
    if tools != [expected]:
        raise ConfigError(f"issues.tools must be exactly {expected} for issues.type={issue_type}")
    issues["tools"] = expected


def _validate_issue_remote(issues: dict[str, Any], issue_type: str) -> None:
    remote = issues.get("remote")
    if issue_type == "filesystem":
        if remote is not None:
            raise ConfigError("issues.remote is not allowed for issues.type=filesystem")
        return
    if not isinstance(remote, dict):
        raise ConfigError("issues.remote must be a mapping")
    _allowed_keys(remote, {"url", "token_env"}, "issues.remote")
    if set(remote) != {"url", "token_env"}:
        raise ConfigError("issues.remote must contain exactly url and token_env")
    service = {"provider": issue_type, **remote, "tools": issues["tools"]}
    _validate_remote_service(service, "issues.remote", "provider")
    remote["url"] = service["url"]


def _validate_remote_service(remote: dict[str, Any], namespace: str, provider_key: str) -> None:
    provider = remote.get(provider_key)
    if provider not in REMOTE_ISSUE_TYPES:
        raise ConfigError(f"{namespace}.{provider_key} must be github, gitlab, gitea, or forgejo")
    expected = REMOTE_ISSUE_PROVIDERS[provider]
    tools = remote.get("tools")
    if not isinstance(tools, str):
        raise ConfigError(f"{namespace}.tools must be a string")
    normalized_tools = _tool_identifiers(tools, f"{namespace}.tools")
    if normalized_tools != [expected["tool"]]:
        raise ConfigError(
            f"{namespace}.tools must be exactly {expected['tool']} for "
            f"{namespace}.{provider_key}={provider}"
        )
    remote["tools"] = expected["tool"]
    url = _validate_remote_url(remote.get("url"), namespace)
    expected_url = expected["url"]
    if expected_url is not None and url != expected_url:
        raise ConfigError(
            f"{namespace}.url must be exactly {expected_url} for "
            f"{namespace}.{provider_key}={provider}"
        )
    remote["url"] = url
    _validate_environment_name(remote.get("token_env"), f"{namespace}.token_env")


def _validate_remote_url(value: Any, namespace: str) -> str:
    url = value
    if (
        not isinstance(url, str)
        or not url.strip()
        or not url.isprintable()
        or any(character.isspace() for character in url)
        or any(character in url for character in "`${}")
    ):
        raise ConfigError(f"{namespace}.url must be a non-empty absolute HTTPS URL")
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as error:
        raise ConfigError(f"{namespace}.url must be a valid absolute HTTPS URL") from error
    if (
        parsed.scheme != "https"
        or not parsed.netloc
        or parsed.hostname is None
        or parsed.username is not None
        or parsed.password is not None
        or port is not None
        and not 1 <= port <= 65535
        or parsed.query
        or parsed.fragment
    ):
        raise ConfigError(f"{namespace}.url must be an absolute HTTPS URL without credentials")
    return url


def _validate_environment_name(value: Any, namespace: str) -> None:
    if not isinstance(value, str) or re.fullmatch(r"[A-Z][A-Z0-9_]*", value) is None:
        raise ConfigError(
            f"{namespace} must be an uppercase environment variable name, not a token value"
        )


def _allowed_keys(parent: dict[str, Any], allowed: set[str], namespace: str) -> None:
    unknown = sorted(set(parent) - allowed)
    if unknown:
        raise ConfigError(f"{namespace} contains unknown keys: {', '.join(unknown)}")


def _tool_identifiers(value: str, namespace: str) -> list[str]:
    tools = [tool.strip() for tool in value.split(",")]
    if any(
        not tool
        or not all(
            character.isascii() and (character.isalnum() or character in "_-") for character in tool
        )
        for tool in tools
    ):
        raise ConfigError(
            f"{namespace} entries must be safe executable identifiers without "
            "arguments, paths, assignments, or shell operators"
        )
    return tools


def _bounded_integer(parent: dict[str, Any], key: str, low: int, high: int) -> None:
    value = parent.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        raise ConfigError(f"memory.retrieval.{key} must be an integer from {low} to {high}")


def _safe_path(parent: dict[str, Any], key: str, namespace: str) -> PurePosixPath:
    value = parent.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ConfigError(f"{namespace}.{key} must be a non-empty string")
    if (
        value == "."
        or "//" in value
        or value.endswith("/")
        or "\\" in value
        or "`" in value
        or not value.isprintable()
        or (len(value) >= 2 and value[0].isalpha() and value[1] == ":")
    ):
        raise ConfigError(f"{namespace}.{key} must stay inside project root")
    path = PurePosixPath(value)
    if path.is_absolute() or "." in path.parts or ".." in path.parts:
        raise ConfigError(f"{namespace}.{key} must stay inside project root")
    return path
