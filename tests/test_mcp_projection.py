import json
from copy import deepcopy
from dataclasses import replace
from pathlib import Path

import pytest

from harnessctl.config import DEFAULT_CONFIG, ConfigError
from harnessctl.install import _merge_host_json, _merge_pi_json
from harnessctl.mcp import (
    GITHUB_MCP_URL,
    GITHUB_TOOLSETS,
    GITLAB_MCP_URL,
    OUTPUT_GUARD,
    deduplicate_server_intents,
    render_opencode_mcp,
    render_pi_mcp,
    required_server_intents,
)


def _intent(
    provider: str,
    *,
    url: str | None = None,
    token_env: str | None = None,
):
    config = deepcopy(DEFAULT_CONFIG)
    tools = {
        "github": "gh",
        "gitlab": "glab",
        "gitea": "tea",
        "forgejo": "forgejo-cli",
    }
    config["cvs"]["remote"] = {
        "provider": provider,
        "transport": "mcp",
        "tools": tools[provider],
        "url": url
        or {
            "github": "https://github.com",
            "gitlab": "https://gitlab.com",
            "gitea": "https://gitea.example.test",
            "forgejo": "https://forgejo.example.test",
        }[provider],
        "token_env": token_env or f"{provider.upper()}_TOKEN",
    }
    return required_server_intents(config, "opencode")[0]


def test_github_and_gitlab_exact_host_projections() -> None:
    github = _intent("github", token_env="GH_TOKEN")
    gitlab = _intent("gitlab")

    assert render_opencode_mcp(github) == {
        "type": "remote",
        "url": GITHUB_MCP_URL,
        "headers": {
            "Authorization": "Bearer {env:GH_TOKEN}",
            "X-MCP-Toolsets": GITHUB_TOOLSETS,
        },
        "oauth": False,
    }
    assert render_pi_mcp(github) == {
        "url": GITHUB_MCP_URL,
        "headers": {
            "Authorization": "Bearer ${GH_TOKEN}",
            "X-MCP-Toolsets": GITHUB_TOOLSETS,
        },
        "auth": "bearer",
        "lifecycle": "lazy",
    }
    assert render_opencode_mcp(gitlab) == {
        "type": "remote",
        "url": GITLAB_MCP_URL,
        "oauth": {},
    }
    assert render_pi_mcp(gitlab) == {
        "url": GITLAB_MCP_URL,
        "auth": "oauth",
        "oauth": {},
        "lifecycle": "lazy",
    }
    assert "TOKEN" not in json.dumps(render_opencode_mcp(gitlab))


@pytest.mark.parametrize("provider", ["gitea", "forgejo"])
def test_local_forge_projection_maps_only_token_name(provider: str) -> None:
    intent = _intent(provider, token_env="FORGE_TOKEN")

    assert render_opencode_mcp(intent) == {
        "type": "local",
        "command": [
            "forgejo-mcp",
            "--transport",
            "stdio",
            "--url",
            intent.url,
        ],
        "environment": {"FORGEJO_ACCESS_TOKEN": "{env:FORGE_TOKEN}"},
    }
    assert render_pi_mcp(intent) == {
        "command": "forgejo-mcp",
        "args": ["--transport", "stdio", "--url", intent.url],
        "env": {"FORGEJO_ACCESS_TOKEN": "${FORGE_TOKEN}"},
        "lifecycle": "lazy",
    }


def test_intents_deduplicate_identical_routes_and_reject_mismatch() -> None:
    intent = _intent("github", token_env="GH_TOKEN")
    duplicate = replace(intent, requesting_policies=("issues:mcp",))

    deduplicated = deduplicate_server_intents([intent, duplicate])

    assert len(deduplicated) == 1
    assert deduplicated[0].requesting_policies == ("cvs:mcp", "issues:mcp")
    with pytest.raises(ConfigError, match="fixed ID cvs_github"):
        deduplicate_server_intents([intent, replace(duplicate, token_env="ISSUES_TOKEN")])


def test_opencode_merge_preserves_unrelated_content_and_avoids_rewrite(
    tmp_path: Path,
) -> None:
    path = tmp_path / "opencode.json"
    original = '{\n  "$schema": "x",\n  "mcp": {"operator": {"url": "x"}}\n}\n'
    path.write_text(original, encoding="utf-8")
    expected = render_opencode_mcp(_intent("github", token_env="GH_TOKEN"))

    merged = _merge_host_json(path, "mcp", {"cvs_github": expected}, force=False)
    assert merged is not None
    document = json.loads(merged)
    assert document["$schema"] == "x"
    assert document["mcp"]["operator"] == {"url": "x"}
    path.write_text(merged, encoding="utf-8")
    assert _merge_host_json(path, "mcp", {"cvs_github": expected}, force=False) is None


def test_owned_conflict_requires_force_and_force_is_narrow(tmp_path: Path) -> None:
    path = tmp_path / "mcp.json"
    path.write_text(
        json.dumps(
            {
                "unrelated": True,
                "mcpServers": {"cvs_github": {"url": "wrong"}, "operator": {}},
                "settings": {"outputGuard": {"maxBytes": 1}, "operator": True},
            }
        ),
        encoding="utf-8",
    )
    intent = _intent("github", token_env="GH_TOKEN")

    with pytest.raises(FileExistsError, match="cvs_github"):
        _merge_pi_json(path, [intent], force=False)
    merged = _merge_pi_json(path, [intent], force=True)
    assert merged is not None
    document = json.loads(merged)
    assert document["unrelated"] is True
    assert document["mcpServers"]["operator"] == {}
    assert document["settings"]["operator"] is True
    assert document["settings"]["outputGuard"] == OUTPUT_GUARD


@pytest.mark.parametrize(
    "content",
    ['{"mcp":1}', '{"mcp":{},"mcp":{}}', "[]"],
)
def test_host_merge_rejects_incompatible_or_duplicate_json(tmp_path: Path, content: str) -> None:
    path = tmp_path / "opencode.json"
    path.write_text(content, encoding="utf-8")
    intent = _intent("github", token_env="GH_TOKEN")

    with pytest.raises(ValueError):
        _merge_host_json(
            path,
            "mcp",
            {intent.server_id: render_opencode_mcp(intent)},
            force=False,
        )
