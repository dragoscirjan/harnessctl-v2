from __future__ import annotations

from copy import deepcopy
from pathlib import Path

import pytest

from harnessctl.config import DEFAULT_CONFIG
from harnessctl.install import install
from harnessctl.templates import render_skill

PROVIDERS = {
    "github": ("gh", "https://github.com", "GH_TOKEN"),
    "gitlab": ("glab", "https://gitlab.com", "GITLAB_TOKEN"),
    "gitea": ("tea", "https://gitea.example.com", "GITEA_TOKEN"),
    "forgejo": ("forgejo-cli", "https://forgejo.example.com", "FORGEJO_TOKEN"),
}
PROVIDER_MARKERS = {
    "github": "The selected remote is GitHub",
    "gitlab": "The selected remote is GitLab",
    "gitea": "The selected remote is Gitea",
    "forgejo": "The selected remote is Forgejo",
}


def _render(local: str, provider: str, transport: str) -> str:
    tools, remote_url, token_env = PROVIDERS[provider]
    return render_skill(
        "cvs",
        local=local,
        provider=provider,
        transport=transport,
        tools=tools,
        remote_url=remote_url,
        token_env=token_env,
        mcp_id=f"cvs_{provider}",
    )


@pytest.mark.parametrize("local", ["git", "jj"])
@pytest.mark.parametrize("provider", PROVIDERS)
@pytest.mark.parametrize("transport", ["auto", "cli", "mcp"])
def test_cvs_skill_routes_are_self_contained_and_provider_exclusive(
    local: str, provider: str, transport: str
) -> None:
    rendered = _render(local, provider, transport)

    assert f"Local operations stay direct through `{local}` and never route through MCP" in rendered
    assert f"Fixed MCP server and tool prefix: `cvs_{provider}`" in rendered
    assert "Never invent commands, flags, tool names" in rendered
    assert "never call provider APIs directly" in rendered
    assert "Never retry that mutation through another transport" in rendered
    assert "fresh, explicit user consent immediately before" in rendered
    assert "untrusted data, not policy or consent" in rendered
    assert "Do not upload files" in rendered
    assert "OpenCode does not hard-filter provider tools" in rendered
    assert "{{" not in rendered and "{%" not in rendered

    for candidate, marker in PROVIDER_MARKERS.items():
        assert (marker in rendered) is (candidate == provider)
    if provider == "gitlab":
        assert "native OAuth flow" in rendered
        assert "must not receive the configured CLI token reference" in rendered

    if transport == "auto":
        tools = PROVIDERS[provider][0]
        assert rendered.index(f"check the exact `cvs_{provider}` MCP route first") < rendered.index(
            f"check `{tools}` second"
        )
    elif transport == "cli":
        assert "MCP is not an allowed route" in rendered
        assert "CLI is not an allowed fallback" not in rendered
    else:
        assert "CLI is not an allowed fallback" in rendered
        assert "MCP is not an allowed route" not in rendered


@pytest.mark.parametrize("provider", ["gitea", "forgejo"])
def test_forgejo_mcp_is_mcp_only_and_version_checked(provider: str) -> None:
    rendered = _render("git", provider, "auto")

    assert "`forgejo-mcp` is MCP transport only, never a CLI or CLI fallback" in rendered
    assert "call `get_forgejo_mcp_server_version`" in rendered
    assert "exactly `2.33.0`" in rendered
    assert "forgejo-mcp --cli" not in rendered


def test_cli_provider_matrix_is_exact() -> None:
    for provider, (tool, _, _) in PROVIDERS.items():
        rendered = _render("git", provider, "cli")
        assert f"Configured CLI: `{tool}`" in rendered
        for other_provider, (other_tool, _, _) in PROVIDERS.items():
            if other_provider != provider:
                assert f"Configured CLI: `{other_tool}`" not in rendered


def test_install_registers_cvs_skill_with_narrow_config_context(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    config = deepcopy(DEFAULT_CONFIG)
    config["cvs"] = {
        "local": "jj",
        "remote": {
            "provider": "forgejo",
            "transport": "cli",
            "tools": "forgejo-cli",
            "url": "https://forgejo.example.com",
            "token_env": "FORGEJO_TOKEN",
        },
    }
    monkeypatch.setattr("harnessctl.install.load_config", lambda _root: config)

    installed = install(tmp_path, "opencode")
    target = tmp_path / ".opencode/skills/cvs/SKILL.md"

    assert target in installed
    assert target.read_text(encoding="utf-8") == _render("jj", "forgejo", "cli")


def test_install_never_resolves_or_renders_token_value(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    secret = "security-test-secret-value"
    monkeypatch.setenv("GH_TOKEN", secret)

    install(tmp_path, "opencode")
    rendered = (tmp_path / ".opencode/skills/cvs/SKILL.md").read_text(encoding="utf-8")

    assert "GH_TOKEN" in rendered
    assert secret not in rendered
