"""Validated MCP server intents and host-native projections."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, replace
from typing import Any

from .config import ConfigError

GITHUB_MCP_URL = "https://api.githubcopilot.com/mcp/"
GITLAB_MCP_URL = "https://gitlab.com/api/v4/mcp"
GITHUB_TOOLSETS = "repos,issues,pull_requests,actions,git"
FORGEJO_MCP_VERSION = "2.33.0"
OUTPUT_GUARD = {"maxBytes": 51200, "maxLines": 2000, "detailsMaxBytes": 16384}


@dataclass(frozen=True)
class ServerIntent:
    """Projection-neutral, fixed-identity MCP server request."""

    server_id: str
    provider: str
    transport: str
    url: str
    token_env: str | None
    command: str | None
    args: tuple[str, ...]
    oauth: bool
    compatibility_version: str | None
    toolsets: str | None
    requesting_policies: tuple[str, ...]

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
    return [_intent(service, route) for route, service in services if service["transport"] != "cli"]


def _intent(service: Mapping[str, Any], route: str) -> ServerIntent:
    provider = str(service["provider"])
    policy = str(service["transport"])
    if provider == "github":
        return ServerIntent(
            "cvs_github",
            provider,
            "remote",
            GITHUB_MCP_URL,
            str(service["token_env"]),
            None,
            (),
            False,
            None,
            GITHUB_TOOLSETS,
            (f"{route}:{policy}",),
        )
    if provider == "gitlab":
        return ServerIntent(
            "cvs_gitlab",
            provider,
            "remote",
            GITLAB_MCP_URL,
            None,
            None,
            (),
            True,
            None,
            None,
            (f"{route}:{policy}",),
        )
    url = str(service["url"])
    return ServerIntent(
        f"cvs_{provider}",
        provider,
        "local",
        url,
        str(service["token_env"]),
        "forgejo-mcp",
        ("--transport", "stdio", "--url", url),
        False,
        FORGEJO_MCP_VERSION,
        None,
        (f"{route}:{policy}",),
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
        policies = tuple(dict.fromkeys((*current.requesting_policies, *intent.requesting_policies)))
        deduplicated[intent.server_id] = replace(current, requesting_policies=policies)
    return list(deduplicated.values())


def render_opencode_mcp(intent: ServerIntent) -> dict[str, Any]:
    """Render one exact OpenCode MCP server definition."""
    if intent.transport == "local":
        return {
            "type": "local",
            "command": [intent.command, *intent.args],
            "environment": {"FORGEJO_ACCESS_TOKEN": f"{{env:{intent.token_env}}}"},
        }
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
        return {
            "command": intent.command,
            "args": list(intent.args),
            "env": {"FORGEJO_ACCESS_TOKEN": f"${{{intent.token_env}}}"},
            "lifecycle": "lazy",
        }
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
