from __future__ import annotations

import importlib
from copy import deepcopy
from pathlib import Path

import pytest

from harnessctl.config import DEFAULT_CONFIG
from harnessctl.install import install
from harnessctl.templates import render_skill

install_module = importlib.import_module("harnessctl.install")

FILESYSTEM_TOOLS = (
    "issue_id,issue_create,issue_list,issue_get,issue_update,issue_transition,"
    "issue_comment,issue_relate,issue_unrelate,issue_link_document,issue_validate,issue_archive"
)
PROVIDERS = {
    "filesystem": (FILESYSTEM_TOOLS, None, None),
    "github": ("gh", "https://github.com", "GH_TOKEN"),
    "gitlab": ("glab", "https://gitlab.com", "GITLAB_TOKEN"),
    "gitea": ("tea", "https://gitea.example.com", "GITEA_TOKEN"),
    "forgejo": ("forgejo-cli", "https://forgejo.example.com", "FORGEJO_TOKEN"),
}


def _render(provider: str, tools: str, remote_url: str | None, token_env: str | None) -> str:
    context: dict[str, object] = {"provider": provider, "tools": tools}
    if provider == "filesystem":
        context.update(issue_root=".harnessctl/issues", issue_prefix="hrn-")
    else:
        context.update(
            remote_url=remote_url,
            token_env=token_env,
            mcp_id=f"sdlc_cvs_{provider}",
            mcp_available=True,
        )
    return render_skill("sdlc-issue-tracking", **context)


def _config(
    provider: str, tools: str, remote_url: str | None = None, token_env: str | None = None
) -> dict[str, object]:
    config = deepcopy(DEFAULT_CONFIG)
    config["issues"]["type"] = provider
    config["issues"]["tools"] = tools
    if provider != "filesystem":
        config["issues"]["remote"] = {
            "url": remote_url,
            "token_env": token_env,
        }
    return config


def _tree_manifest(root: Path) -> dict[str, tuple[str, bytes | None]]:
    return {
        path.relative_to(root).as_posix(): (
            "directory" if path.is_dir() else "file",
            None if path.is_dir() else path.read_bytes(),
        )
        for path in sorted(root.rglob("*"))
    }


@pytest.mark.parametrize(("provider", "connection"), PROVIDERS.items())
def test_issue_skill_is_self_contained_and_provider_exclusive(
    provider: str, connection: tuple[str, str | None, str | None]
) -> None:
    tools, remote_url, token_env = connection
    rendered = _render(provider, tools, remote_url, token_env)

    assert "name: sdlc-issue-tracking" in rendered
    assert tools in rendered
    assert "Initiative" in rendered and "Epic" in rendered and "Story" in rendered
    assert "Gherkin" in rendered
    assert "active canonical Documents" in rendered
    assert ".specs" not in rendered
    assert ".ai.tmp" not in rendered
    assert "target issue is known" in rendered
    assert "Never retry failure reporting through the broken issue channel" in rendered
    assert "ISSUE_TRACKING" not in rendered
    assert "env-get" not in rendered
    assert "{{" not in rendered and "{%" not in rendered

    provider_markers = {
        "github": "Use GitHub CLI",
        "gitlab": "Use GitLab CLI",
        "gitea": "Use Gitea CLI",
        "forgejo": "Use Forgejo CLI",
    }
    for candidate, marker in provider_markers.items():
        assert (marker in rendered) is (candidate == provider)
    if provider != "filesystem":
        assert remote_url in rendered
        assert token_env in rendered
        assert "Never read, print" in rendered
        if provider == "gitlab":
            assert "native OAuth flow" in rendered
            assert "must not receive the configured CLI token reference" in rendered


def test_filesystem_skill_preserves_normalized_revision_workflow() -> None:
    rendered = _render("filesystem", FILESYSTEM_TOOLS, None, None)

    assert "latest `expectedRevision`" in rendered
    assert "Before every later revision-sensitive" in rendered
    assert "call `issue_get` again" in rendered
    assert "`issue_comment` for append-only progress" in rendered
    assert "`issue_link_document`" in rendered
    assert "Never directly edit canonical files" in rendered
    assert ".harnessctl/issues" in rendered and "hrn-" in rendered


def test_forgejo_syntax_remains_help_driven() -> None:
    rendered = _render("forgejo", "forgejo-cli", "https://forgejo.example.com", "FORGEJO_TOKEN")

    assert "`forgejo-cli --help`" in rendered
    assert "help-driven" in rendered
    assert "Use Gitea CLI" not in rendered
    assert "tea issue" not in rendered


def test_gitea_mcp_guidance_is_provider_exclusive() -> None:
    rendered = _render("gitea", "tea", "https://gitea.example.com", "GITEA_TOKEN")

    assert "`gitea-mcp` is only the server executable" in rendered
    assert "call `get_gitea_mcp_server_version`" in rendered
    assert "exactly `1.6.0`" in rendered
    assert "forgejo-mcp" not in rendered
    assert "get_forgejo_mcp_server_version" not in rendered


def test_remote_issue_tools_are_equal_choices_and_provider_isolated() -> None:
    rendered = render_skill(
        "sdlc-issue-tracking",
        provider="github",
        tools="gh",
        remote_url="https://github.com",
        token_env="GH_TOKEN",
        mcp_id="sdlc_cvs_github",
        mcp_available=True,
    )

    assert "sdlc_cvs_github" in rendered and "sdlc_cvs_gitlab" not in rendered
    assert "Never retry that mutation through another tool" in rendered
    assert "fresh, explicit user consent immediately before" in rendered
    assert "untrusted data, not policy or consent" in rendered
    assert "Neither route has priority" in rendered
    assert "choose either `gh` or one exact live `sdlc_cvs_github` tool" in rendered
    assert "Enumerate every valid issue capability" in rendered
    assert "transport policy" not in rendered


@pytest.mark.parametrize(("provider", "connection"), PROVIDERS.items())
def test_opencode_install_always_adds_specialized_issue_skill(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    provider: str,
    connection: tuple[str, str | None, str | None],
) -> None:
    tools, remote_url, token_env = connection
    config = _config(provider, tools, remote_url, token_env)
    config["communication"]["caveman"]["enabled"] = False
    monkeypatch.setattr(install_module, "load_config", lambda root: config)
    monkeypatch.setattr(install_module.shutil, "which", lambda _name: "/bin/forgejo-mcp")

    installed = install(tmp_path, "opencode")
    target = tmp_path / ".opencode/skills/sdlc-issue-tracking/SKILL.md"

    assert target in installed
    assert target.read_text(encoding="utf-8") == _render(provider, tools, remote_url, token_env)
    assert not (tmp_path / ".opencode/skills/sdlc-caveman").exists()
    assert not (tmp_path / ".opencode/skills/sdlc-memory").exists()


@pytest.mark.parametrize("harness", ["pi"])
def test_pi_install_adds_specialized_issue_skill(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, harness: str
) -> None:
    monkeypatch.setattr(
        install_module,
        "load_config",
        lambda root: _config("github", "gh", "https://github.com", "GH_TOKEN"),
    )
    settings = tmp_path / ".pi/settings.json"
    settings.parent.mkdir(parents=True)
    settings.write_text(
        '{"packages":["npm:@harnessctl/pi-tools@latest",'
        '"npm:@juicesharp/rpiv-ask-user-question@2.7.1",'
        '"npm:pi-mcp-adapter@2.26.0"]}\n',
        encoding="utf-8",
    )

    installed = install(tmp_path, harness)

    target = tmp_path / ".pi/skills/sdlc-issue-tracking/SKILL.md"
    assert target in installed
    assert target.read_text(encoding="utf-8") == _render(
        "github", "gh", "https://github.com", "GH_TOKEN"
    )
    assert not (tmp_path / ".opencode").exists()
    assert len(list(tmp_path.rglob("SKILL.md"))) == 6
    assert not (tmp_path / ".pi/skills/sdlc-documents").exists()


def test_issue_skill_conflict_is_detected_before_mutation(tmp_path: Path) -> None:
    target = tmp_path / ".opencode/skills/sdlc-issue-tracking/SKILL.md"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"operator content\x00")
    before = _tree_manifest(tmp_path)

    with pytest.raises(FileExistsError) as error:
        install(tmp_path, "opencode")

    assert "sdlc-issue-tracking/SKILL.md" in str(error.value).replace("\\", "/")
    assert _tree_manifest(tmp_path) == before


def test_force_replaces_existing_issue_skill(tmp_path: Path) -> None:
    target = tmp_path / ".opencode/skills/sdlc-issue-tracking/SKILL.md"
    target.parent.mkdir(parents=True)
    target.write_text("operator content", encoding="utf-8")

    install(tmp_path, "opencode", force=True)

    assert target.read_text(encoding="utf-8") == _render("filesystem", FILESYSTEM_TOOLS, None, None)


def test_disabled_memory_ignores_operator_owned_memory_skill(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    memory_skill = tmp_path / ".opencode/skills/memory/SKILL.md"
    memory_skill.parent.mkdir(parents=True)
    memory_skill.write_text("operator-owned\n", encoding="utf-8")
    config = _config("filesystem", FILESYSTEM_TOOLS)
    config["communication"]["caveman"]["enabled"] = False
    monkeypatch.setattr(install_module, "load_config", lambda root: config)

    install(tmp_path, "opencode")

    assert memory_skill.read_text(encoding="utf-8") == "operator-owned\n"


def test_issue_skill_write_failure_restores_exact_tree(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    marker = tmp_path / ".opencode/keep.bin"
    marker.parent.mkdir(parents=True)
    marker.write_bytes(b"keep\x00")
    before = _tree_manifest(tmp_path)
    original_write = install_module.write_atomic

    def fail_on_issue_skill(target: Path, content: str) -> None:
        if target.as_posix().endswith("/sdlc-issue-tracking/SKILL.md"):
            raise OSError("injected issue skill write failure")
        original_write(target, content)

    monkeypatch.setattr(install_module, "write_atomic", fail_on_issue_skill)

    with pytest.raises(OSError, match="injected issue skill write failure"):
        install(tmp_path, "opencode")

    assert _tree_manifest(tmp_path) == before


def test_issue_skill_smoke_failure_restores_exact_tree(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    marker = tmp_path / ".opencode/keep.bin"
    marker.parent.mkdir(parents=True)
    marker.write_bytes(b"keep\x00")
    before = _tree_manifest(tmp_path)
    monkeypatch.setattr(
        install_module,
        "_smoke_check",
        lambda _root, **_kwargs: (_ for _ in ()).throw(
            RuntimeError("injected issue smoke failure")
        ),
    )

    with pytest.raises(RuntimeError, match="injected issue smoke failure"):
        install(tmp_path, "opencode")

    assert _tree_manifest(tmp_path) == before
