from __future__ import annotations

from copy import deepcopy
from pathlib import Path

import pytest

from harnessctl.config import DEFAULT_CONFIG, load_config
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


def _render(local: str, provider: str, *, mcp_available: bool = True) -> str:
    tools, remote_url, token_env = PROVIDERS[provider]
    return render_skill(
        "cvs",
        local=local,
        provider=provider,
        tools=tools,
        remote_url=remote_url,
        token_env=token_env,
        mcp_id=f"cvs_{provider}",
        mcp_available=mcp_available,
    )


@pytest.mark.parametrize("local", ["git", "jj"])
@pytest.mark.parametrize("provider", PROVIDERS)
def test_cvs_skill_routes_are_self_contained_and_provider_exclusive(
    local: str, provider: str
) -> None:
    rendered = _render(local, provider)

    assert f"Local operations stay direct through `{local}` and never route through MCP" in rendered
    assert f"Fixed MCP server and tool prefix: `cvs_{provider}`" in rendered
    assert "Never invent commands, flags, tool names" in rendered
    assert "never call provider APIs directly" in rendered
    assert "Never retry that mutation through another tool" in rendered
    assert "Neither route has priority" in rendered
    assert "Choose either" not in rendered
    assert "choose either" in rendered
    assert "Enumerate every valid capability" in rendered
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

    assert "transport policy" not in rendered


@pytest.mark.parametrize("provider", ["gitea", "forgejo"])
def test_forgejo_mcp_is_mcp_only_and_version_checked(provider: str) -> None:
    rendered = _render("git", provider)

    assert "`forgejo-mcp` is only the server executable, never a CLI fallback" in rendered
    assert "call `get_forgejo_mcp_server_version`" in rendered
    assert "exactly `2.33.0`" in rendered
    assert "forgejo-mcp --cli" not in rendered


def test_cli_provider_matrix_is_exact() -> None:
    for provider, (tool, _, _) in PROVIDERS.items():
        rendered = _render("git", provider)
        assert f"Available remote CLI: `{tool}`" in rendered
        for other_provider, (other_tool, _, _) in PROVIDERS.items():
            if other_provider != provider:
                assert f"Available remote CLI: `{other_tool}`" not in rendered


def test_cvs_skill_omits_unavailable_local_mcp() -> None:
    rendered = _render("git", "forgejo", mcp_available=False)

    assert "Available remote CLI: `forgejo-cli`" in rendered
    assert "No MCP server is available" in rendered
    assert "cvs_forgejo" not in rendered


def test_install_registers_cvs_skill_with_narrow_config_context(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    config = deepcopy(DEFAULT_CONFIG)
    config["cvs"] = {
        "local": "jj",
        "remote": {
            "provider": "forgejo",
            "tools": "forgejo-cli",
            "url": "https://forgejo.example.com",
            "token_env": "FORGEJO_TOKEN",
        },
    }
    monkeypatch.setattr("harnessctl.install.load_config", lambda _root: config)
    monkeypatch.setattr("harnessctl.install.shutil.which", lambda _name: "/bin/forgejo-mcp")

    installed = install(tmp_path, "opencode")
    target = tmp_path / ".opencode/skills/cvs/SKILL.md"

    assert target in installed
    assert target.read_text(encoding="utf-8") == _render("jj", "forgejo")


def test_install_never_resolves_or_renders_token_value(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    secret = "security-test-secret-value"
    monkeypatch.setenv("GH_TOKEN", secret)

    install(tmp_path, "opencode")
    rendered = (tmp_path / ".opencode/skills/cvs/SKILL.md").read_text(encoding="utf-8")

    assert "GH_TOKEN" in rendered
    assert secret not in rendered


def test_committed_cvs_skill_matches_current_installer_render(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    project_root = Path(__file__).resolve().parents[1]
    config = load_config(project_root)
    monkeypatch.setattr("harnessctl.install.load_config", lambda _root: config)

    install(tmp_path, "opencode")

    expected = (tmp_path / ".opencode/skills/cvs/SKILL.md").read_bytes()
    actual = (project_root / ".opencode/skills/cvs/SKILL.md").read_bytes()
    assert actual == expected
