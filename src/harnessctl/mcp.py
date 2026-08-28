"""Validated MCP server intents and host-native projections."""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass, replace
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
SAME_ID_MCP_MIGRATIONS = frozenset({CVS_MCP_SERVER_IDS["gitea"]})
_ENVIRONMENT_NAME = re.compile(r"[A-Z][A-Z0-9_]*")


@dataclass(frozen=True)
class ServerIntent:
    """Projection-neutral, fixed-identity MCP server request."""

    server_id: str
    provider: str
    transport: str
    url: str | None
    token_env: str | None
    command: str | None
    args: tuple[str, ...]
    oauth: bool
    compatibility_version: str | None
    toolsets: str | None
    requesting_routes: tuple[str, ...]
    environment: tuple[tuple[str, str], ...] = ()

    def definition(self) -> tuple[object, ...]:
        """Return every field that determines host server behavior."""
        return (
            self.server_id,
            self.provider,
            self.transport,
            self.url,
            self.token_env,
            self.command,
            self.args,
            self.oauth,
            self.compatibility_version,
            self.toolsets,
            self.environment,
        )


def required_server_intents(config: Mapping[str, Any], harness: str) -> list[ServerIntent]:
    """Build candidate intents for independently configured CVS and Issues routes."""
    if harness not in {"opencode", "pi", "all"}:
        raise ValueError(f"unsupported harness: {harness}")
    services: list[tuple[str, Mapping[str, Any]]] = [("cvs", config["cvs"]["remote"])]
    issues = config["issues"]
    if issues["type"] != "filesystem":
        services.append(
            (
                "issues",
                {
                    "provider": issues["type"],
                    "tools": issues["tools"],
                    **issues["remote"],
                },
            )
        )
    return [_intent(service, route) for route, service in services]


def recognized_server_intents(config: Mapping[str, Any], harness: str) -> list[ServerIntent]:
    """Return historical generated definitions eligible for exact reconciliation."""
    recognized: list[ServerIntent] = []
    for intent in required_server_intents(config, harness):
        if intent.server_id not in CVS_MCP_SERVER_IDS.values():
            continue
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


def _intent(service: Mapping[str, Any], route: str) -> ServerIntent:
    provider = str(service["provider"])
    if provider == "github":
        return ServerIntent(
            CVS_MCP_SERVER_IDS[provider],
            provider,
            "remote",
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
            CVS_MCP_SERVER_IDS[provider],
            provider,
            "remote",
            GITLAB_MCP_URL,
            None,
            None,
            (),
            True,
            None,
            None,
            (route,),
        )
    url = str(service["url"])
    if provider == "gitea":
        return ServerIntent(
            CVS_MCP_SERVER_IDS[provider],
            provider,
            "local",
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
        CVS_MCP_SERVER_IDS[provider],
        provider,
        "local",
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
    if intent.transport == "local":
        rendered: dict[str, Any] = {
            "type": "local",
            "command": [intent.command, *intent.args],
        }
        environment = _environment_bindings(intent)
        if environment:
            rendered["environment"] = {
                target: f"{{env:{source}}}" for target, source in environment
            }
        return rendered
    if intent.url is None:
        raise ConfigError(f"remote MCP intent {intent.server_id} requires a URL")
    rendered: dict[str, Any] = {"type": "remote", "url": intent.url}
    if intent.oauth:
        rendered["oauth"] = {}
    else:
        rendered["headers"] = {
            "Authorization": f"Bearer {{env:{intent.token_env}}}",
            "X-MCP-Toolsets": intent.toolsets,
        }
        rendered["oauth"] = False
    return rendered


def render_pi_mcp(intent: ServerIntent) -> dict[str, Any]:
    """Render one exact pi-mcp-adapter server definition."""
    if intent.transport == "local":
        rendered: dict[str, Any] = {
            "command": intent.command,
            "args": list(intent.args),
            "lifecycle": "lazy",
        }
        environment = _environment_bindings(intent)
        if environment:
            rendered["env"] = {target: f"${{{source}}}" for target, source in environment}
        return rendered
    if intent.url is None:
        raise ConfigError(f"remote MCP intent {intent.server_id} requires a URL")
    if intent.oauth:
        return {
            "url": intent.url,
            "auth": "oauth",
            "oauth": {},
            "lifecycle": "lazy",
        }
    return {
        "url": intent.url,
        "headers": {
            "Authorization": f"Bearer ${{{intent.token_env}}}",
            "X-MCP-Toolsets": intent.toolsets,
        },
        "auth": "bearer",
        "lifecycle": "lazy",
    }


def _environment_bindings(intent: ServerIntent) -> tuple[tuple[str, str], ...]:
    if not isinstance(intent.command, str) or not intent.command:
        raise ConfigError(f"local MCP intent {intent.server_id} requires a command")
    targets: set[str] = set()
    for target, source in intent.environment:
        if (
            _ENVIRONMENT_NAME.fullmatch(target) is None
            or _ENVIRONMENT_NAME.fullmatch(source) is None
        ):
            raise ConfigError(
                f"local MCP intent {intent.server_id} environment bindings "
                "must use uppercase environment variable names"
            )
        if target in targets:
            raise ConfigError(
                f"local MCP intent {intent.server_id} environment contains "
                f"duplicate target {target}"
            )
        targets.add(target)
    return intent.environment
