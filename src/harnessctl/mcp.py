"""Validated MCP server intents and host-native projections."""

from __future__ import annotations

import json
import re
from collections.abc import Mapping
from copy import deepcopy
from dataclasses import dataclass, field, replace
from typing import Any

from .config import ConfigError

GITHUB_MCP_URL = "https://api.githubcopilot.com/mcp/"
GITLAB_MCP_URL = "https://gitlab.com/api/v4/mcp"
GITHUB_TOOLSETS = "repos,issues,pull_requests,actions,git"
GITEA_MCP_VERSION = "1.6.0"
FORGEJO_MCP_VERSION = "2.33.0"
OUTPUT_GUARD = {"maxBytes": 51200, "maxLines": 2000, "detailsMaxBytes": 16384}
CVS_MCP_SERVER_IDS = {
    provider: f"sdlc_cvs_{provider}" for provider in ("github", "gitlab", "gitea", "forgejo")
}
LEGACY_CVS_MCP_SERVER_IDS = {provider: f"cvs_{provider}" for provider in CVS_MCP_SERVER_IDS}
_ENVIRONMENT_TARGET_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
_ENVIRONMENT_REFERENCE_NAME = re.compile(r"[A-Z][A-Z0-9_]*")
_HEADER_ENV_REFERENCE = re.compile(r"\{env:([A-Z][A-Z0-9_]*)\}")
_HEADER_TEMPLATE = re.compile(r"(?:[^\x00-\x1f\x7f-\x9f\u2028\u2029{}]|\{env:[A-Z][A-Z0-9_]*\})*")


@dataclass(frozen=True)
class ServerIntent:
    """Projection-neutral, fixed-identity MCP server request."""

    server_id: str
    provider: str
    url: str | None
    token_env: str | None
    command: str | None
    args: tuple[str, ...]
    oauth: bool
    compatibility_version: str | None
    toolsets: str | None
    requesting_routes: tuple[str, ...]
    environment: tuple[tuple[str, str], ...] = ()
    headers: tuple[tuple[str, str], ...] = ()
    cwd: str | None = None
    opencode_override: dict[str, Any] = field(default_factory=dict)
    pi_override: dict[str, Any] = field(default_factory=dict)

    def definition(self) -> tuple[object, ...]:
        """Return every field that determines host server behavior."""
        return (
            self.server_id,
            self.provider,
            self.url,
            self.token_env,
            self.command,
            self.args,
            self.oauth,
            self.compatibility_version,
            self.toolsets,
            self.environment,
            self.headers,
            self.cwd,
            _canonical_override(self.opencode_override),
            _canonical_override(self.pi_override),
        )


def required_server_intents(config: Mapping[str, Any], harness: str) -> list[ServerIntent]:
    """Build intents solely from explicit host-neutral MCP declarations."""
    if harness not in {"opencode", "pi", "all"}:
        raise ValueError(f"unsupported harness: {harness}")
    return _declared_server_intents(config, _referencing_routes(config))


def _declared_server_intents(
    config: Mapping[str, Any], referencing_routes: Mapping[str, tuple[str, ...]]
) -> list[ServerIntent]:
    """Convert host-neutral Config v1 declarations to projection-neutral intents."""
    intents: list[ServerIntent] = []
    for server_id, declaration in config.get("mcpServers", {}).items():
        if "url" in declaration:
            intents.append(
                ServerIntent(
                    server_id=str(server_id),
                    provider="generic",
                    url=str(declaration["url"]),
                    token_env=None,
                    command=None,
                    args=(),
                    oauth=False,
                    compatibility_version=None,
                    toolsets=None,
                    requesting_routes=(
                        "mcpServers",
                        *referencing_routes.get(str(server_id), ()),
                    ),
                    headers=tuple(declaration.get("headers", {}).items()),
                    opencode_override=deepcopy(declaration.get("opencode", {})),
                    pi_override=deepcopy(declaration.get("pi", {})),
                )
            )
            continue
        intents.append(
            ServerIntent(
                server_id=str(server_id),
                provider="generic",
                url=None,
                token_env=None,
                command=str(declaration["command"]),
                args=tuple(declaration.get("args", ())),
                oauth=False,
                compatibility_version=None,
                toolsets=None,
                requesting_routes=(
                    "mcpServers",
                    *referencing_routes.get(str(server_id), ()),
                ),
                environment=tuple(declaration.get("environment", {}).items()),
                cwd=declaration.get("cwd"),
                opencode_override=deepcopy(declaration.get("opencode", {})),
                pi_override=deepcopy(declaration.get("pi", {})),
            )
        )
    return intents


def recognized_server_intents(config: Mapping[str, Any], harness: str) -> list[ServerIntent]:
    """Return historical generated definitions eligible for exact reconciliation."""
    recognized: list[ServerIntent] = []
    for intent in _historical_provider_intents(config):
        recognized.append(intent)
        legacy_id = LEGACY_CVS_MCP_SERVER_IDS[intent.provider]
        recognized.append(replace(intent, server_id=legacy_id))
        if intent.provider == "gitea":
            recognized.extend(
                (
                    _historical_forgejo_backed_gitea_intent(intent, legacy_id),
                    _historical_forgejo_backed_gitea_intent(intent, intent.server_id),
                )
            )
    return recognized


def _referencing_routes(config: Mapping[str, Any]) -> dict[str, tuple[str, ...]]:
    """Associate enabled skill references with declarations without defining them."""
    skills = config["skills"]
    references: list[tuple[str, Mapping[str, Any]]] = []
    cvs = skills["cvs"]
    if cvs["enabled"] and "mcpName" in cvs["provider"]:
        references.append(("cvs", cvs["provider"]))
    for route in ("issues", "documents"):
        skill = skills[route]
        if (
            skill["enabled"]
            and skill["provider"]["type"] != "filesystem"
            and "mcpName" in skill["provider"]
        ):
            references.append((route, skill["provider"]))
    code_index = skills["codeIndex"]
    if code_index["enabled"]:
        references.append(("codeIndex", code_index))
    web_retrieval = skills["webRetrieval"]
    if web_retrieval["enabled"]:
        references.append(("webRetrieval", web_retrieval))

    routes: dict[str, list[str]] = {}
    for route, reference in references:
        routes.setdefault(str(reference["mcpName"]), []).append(route)
    return {server_id: tuple(dict.fromkeys(values)) for server_id, values in routes.items()}


def _historical_provider_intents(config: Mapping[str, Any]) -> list[ServerIntent]:
    """Reconstruct only exact provider-derived definitions emitted before Config v1."""
    skills = config["skills"]
    services: list[tuple[str, Mapping[str, Any]]] = []
    cvs = skills["cvs"]
    if cvs["enabled"] and "mcpName" in cvs["provider"]:
        services.append(("cvs", cvs["provider"]))
    issues = skills["issues"]
    if (
        issues["enabled"]
        and issues["provider"]["type"] != "filesystem"
        and "mcpName" in issues["provider"]
    ):
        services.append(("issues", issues["provider"]))
    unique: dict[tuple[object, ...], ServerIntent] = {}
    for route, service in services:
        if service["type"] not in CVS_MCP_SERVER_IDS:
            continue
        intent = _intent(service, route)
        unique.setdefault(intent.definition(), intent)
    return list(unique.values())


def _intent(service: Mapping[str, Any], route: str) -> ServerIntent:
    provider = str(service["type"])
    server_id = str(service["mcpName"])
    if provider == "github":
        return ServerIntent(
            server_id,
            provider,
            GITHUB_MCP_URL,
            str(service["token_env"]),
            None,
            (),
            False,
            None,
            GITHUB_TOOLSETS,
            (route,),
        )
    if provider == "gitlab":
        return ServerIntent(
            server_id,
            provider,
            GITLAB_MCP_URL,
            None,
            None,
            (),
            True,
            None,
            None,
            (route,),
        )
    if provider not in {"gitea", "forgejo"}:
        raise ConfigError(f"MCP projection is not supported for provider {provider}")
    url = str(service["url"])
    if provider == "gitea":
        return ServerIntent(
            server_id,
            provider,
            url,
            str(service["token_env"]),
            "gitea-mcp",
            ("--transport", "stdio", "--host", url),
            False,
            GITEA_MCP_VERSION,
            None,
            (route,),
            (("GITEA_ACCESS_TOKEN", str(service["token_env"])),),
        )
    return ServerIntent(
        server_id,
        provider,
        url,
        str(service["token_env"]),
        "forgejo-mcp",
        ("--transport", "stdio", "--url", url),
        False,
        FORGEJO_MCP_VERSION,
        None,
        (route,),
        (("FORGEJO_ACCESS_TOKEN", str(service["token_env"])),),
    )


def _historical_forgejo_backed_gitea_intent(intent: ServerIntent, server_id: str) -> ServerIntent:
    """Return the exact managed Gitea definition emitted before provider separation."""
    if intent.url is None or intent.token_env is None:
        raise ConfigError("historical Gitea MCP intent requires URL and token environment")
    return replace(
        intent,
        server_id=server_id,
        command="forgejo-mcp",
        args=("--transport", "stdio", "--url", intent.url),
        compatibility_version=FORGEJO_MCP_VERSION,
        environment=(("FORGEJO_ACCESS_TOKEN", intent.token_env),),
    )


def deduplicate_server_intents(intents: list[ServerIntent]) -> list[ServerIntent]:
    """Collapse identical fixed IDs and reject differing definitions."""
    deduplicated: dict[str, ServerIntent] = {}
    for intent in intents:
        current = deduplicated.get(intent.server_id)
        if current is None:
            deduplicated[intent.server_id] = intent
            continue
        if current.definition() != intent.definition():
            raise ConfigError(f"conflicting MCP definitions for fixed ID {intent.server_id}")
        routes = tuple(dict.fromkeys((*current.requesting_routes, *intent.requesting_routes)))
        deduplicated[intent.server_id] = replace(current, requesting_routes=routes)
    return list(deduplicated.values())


def render_opencode_mcp(intent: ServerIntent) -> dict[str, Any]:
    """Render one exact OpenCode MCP server definition."""
    if intent.command is not None:
        rendered: dict[str, Any] = {
            "type": "local",
            "command": [intent.command, *intent.args],
        }
        environment = _environment_bindings(intent)
        if environment:
            rendered["environment"] = {
                target: f"{{env:{source}}}" for target, source in environment
            }
        if intent.cwd is not None:
            rendered["cwd"] = intent.cwd
        return _merge_host_override(intent.opencode_override, rendered)
    if intent.url is None:
        raise ConfigError(f"remote MCP intent {intent.server_id} requires a URL")
    rendered: dict[str, Any] = {"type": "remote", "url": intent.url}
    if intent.headers:
        rendered["headers"] = {
            header: _render_header_template(value, "opencode") for header, value in intent.headers
        }
    elif intent.oauth:
        rendered["oauth"] = {}
    elif intent.token_env is not None:
        rendered["headers"] = {
            "Authorization": f"Bearer {{env:{intent.token_env}}}",
            "X-MCP-Toolsets": intent.toolsets,
        }
        rendered["oauth"] = False
    return _merge_host_override(intent.opencode_override, rendered)


def render_pi_mcp(intent: ServerIntent) -> dict[str, Any]:
    """Render one exact pi-mcp-adapter server definition."""
    if intent.command is not None:
        rendered: dict[str, Any] = {
            "command": intent.command,
            "args": list(intent.args),
            "lifecycle": "lazy",
        }
        environment = _environment_bindings(intent)
        if environment:
            rendered["env"] = {target: f"${{{source}}}" for target, source in environment}
        if intent.cwd is not None:
            rendered["cwd"] = intent.cwd
        return _merge_host_override(intent.pi_override, rendered)
    if intent.url is None:
        raise ConfigError(f"remote MCP intent {intent.server_id} requires a URL")
    if intent.headers:
        return _merge_host_override(
            intent.pi_override,
            {
                "url": intent.url,
                "headers": {
                    header: _render_header_template(value, "pi") for header, value in intent.headers
                },
                "lifecycle": "lazy",
            },
        )
    if intent.oauth:
        return _merge_host_override(
            intent.pi_override,
            {
                "url": intent.url,
                "auth": "oauth",
                "oauth": {},
                "lifecycle": "lazy",
            },
        )
    if intent.token_env is not None:
        return _merge_host_override(
            intent.pi_override,
            {
                "url": intent.url,
                "headers": {
                    "Authorization": f"Bearer ${{{intent.token_env}}}",
                    "X-MCP-Toolsets": intent.toolsets,
                },
                "auth": "bearer",
                "lifecycle": "lazy",
            },
        )
    return _merge_host_override(intent.pi_override, {"url": intent.url, "lifecycle": "lazy"})


def _merge_host_override(
    override: Mapping[str, Any], authoritative: Mapping[str, Any]
) -> dict[str, Any]:
    """Copy a host extension map and overlay adapter-owned fields authoritatively."""
    rendered = deepcopy(dict(override))
    rendered.update(deepcopy(dict(authoritative)))
    return rendered


def _canonical_override(override: Mapping[str, Any]) -> str:
    """Return a deterministic, hashable identity for validated JSON settings."""
    return json.dumps(
        override, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":")
    )


def _render_header_template(value: str, harness: str) -> str:
    """Translate validated host-neutral environment references without resolving them."""
    if _HEADER_TEMPLATE.fullmatch(value) is None:
        raise ConfigError(
            "MCP header templates must contain only static text and well-formed "
            "{env:NAME} references without control characters"
        )
    if harness == "opencode":
        return value
    if harness == "pi":
        return _HEADER_ENV_REFERENCE.sub(lambda match: f"${{{match.group(1)}}}", value)
    raise ValueError(f"unsupported harness: {harness}")


def _environment_bindings(intent: ServerIntent) -> tuple[tuple[str, str], ...]:
    if not isinstance(intent.command, str) or not intent.command:
        raise ConfigError(f"local MCP intent {intent.server_id} requires a command")
    targets: set[str] = set()
    for target, source in intent.environment:
        if (
            _ENVIRONMENT_TARGET_NAME.fullmatch(target) is None
            or _ENVIRONMENT_REFERENCE_NAME.fullmatch(source) is None
        ):
            raise ConfigError(
                f"local MCP intent {intent.server_id} environment bindings "
                "must use valid target names and uppercase source environment references"
            )
        if target in targets:
            raise ConfigError(
                f"local MCP intent {intent.server_id} environment contains "
                f"duplicate target {target}"
            )
        targets.add(target)
    return intent.environment
