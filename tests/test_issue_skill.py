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
    "filesystem": FILESYSTEM_TOOLS,
    "github": "gh",
    "gitlab": "glab",
    "gitea": "tea",
    "forgejo": "forgejo-client",
}


def _render(provider: str, tools: str) -> str:
    context: dict[str, object] = {"provider": provider, "tools": tools}
    if provider == "filesystem":
        context.update(issue_root=".harnessctl/issues", issue_prefix="hrn-")
    return render_skill("issue-tracking", **context)


def _config(provider: str, tools: str) -> dict[str, object]:
    config = deepcopy(DEFAULT_CONFIG)
    config["issues"]["type"] = provider
    config["issues"]["tools"] = tools
    return config


def _tree_manifest(root: Path) -> dict[str, tuple[str, bytes | None]]:
    return {
        path.relative_to(root).as_posix(): (
            "directory" if path.is_dir() else "file",
            None if path.is_dir() else path.read_bytes(),
        )
        for path in sorted(root.rglob("*"))
    }


@pytest.mark.parametrize(("provider", "tools"), PROVIDERS.items())
def test_issue_skill_is_self_contained_and_provider_exclusive(provider: str, tools: str) -> None:
    rendered = _render(provider, tools)

    assert "name: issue-tracking" in rendered
    assert tools in rendered
    assert "Initiative" in rendered and "Epic" in rendered and "Story" in rendered
    assert "Gherkin" in rendered
    assert "`.specs/`" in rendered
    assert "target issue is known" in rendered
    assert "Never retry failure reporting through the broken issue channel" in rendered
    assert "ISSUE_TRACKING" not in rendered
    assert "env-get" not in rendered
    assert "{{" not in rendered and "{%" not in rendered

    provider_markers = {
        "github": "Official GitHub CLI",
        "gitlab": "Official GitLab CLI",
        "gitea": "Gitea's official CLI",
        "forgejo": "No official Forgejo CLI",
    }
    for candidate, marker in provider_markers.items():
        assert (marker in rendered) is (candidate == provider)


def test_filesystem_skill_preserves_normalized_revision_workflow() -> None:
    rendered = _render("filesystem", FILESYSTEM_TOOLS)

    assert "latest `expectedRevision`" in rendered
    assert "Before every later revision-sensitive" in rendered
    assert "call `issue_get` again" in rendered
    assert "`issue_comment` for append-only progress" in rendered
    assert "`issue_link_document`" in rendered
    assert "Never directly edit canonical files" in rendered
    assert ".harnessctl/issues" in rendered and "hrn-" in rendered


def test_forgejo_with_tea_infers_no_gitea_contract() -> None:
    rendered = _render("forgejo", "tea")

    assert "`tea --help`" in rendered
    assert "operator-selected executable" in rendered
    assert "operator-verified" in rendered
    assert "Gitea's official CLI" not in rendered
    assert "command groups include" not in rendered
    assert "tea issue" not in rendered


@pytest.mark.parametrize(("provider", "tools"), PROVIDERS.items())
def test_opencode_install_always_adds_specialized_issue_skill(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    provider: str,
    tools: str,
) -> None:
    config = _config(provider, tools)
    config["communication"]["caveman"]["enabled"] = False
    monkeypatch.setattr(install_module, "load_config", lambda root: config)

    installed = install(tmp_path, "opencode")
    target = tmp_path / ".opencode/skills/issue-tracking/SKILL.md"

    assert target in installed
    assert target.read_text(encoding="utf-8") == _render(provider, tools)
    assert not (tmp_path / ".opencode/skills/caveman").exists()
    assert not (tmp_path / ".opencode/skills/memory").exists()


@pytest.mark.parametrize("harness", ["pi"])
def test_pi_install_compiles_issue_skill_out(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, harness: str
) -> None:
    monkeypatch.setattr(
        install_module,
        "load_config",
        lambda root: _config("github", "gh"),
    )

    installed = install(tmp_path, harness)

    assert all("issue-tracking" not in path.as_posix() for path in installed)
    assert not (tmp_path / ".opencode").exists()
    assert not list(tmp_path.rglob("SKILL.md"))


def test_issue_skill_conflict_is_detected_before_mutation(tmp_path: Path) -> None:
    target = tmp_path / ".opencode/skills/issue-tracking/SKILL.md"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"operator content\x00")
    before = _tree_manifest(tmp_path)

    with pytest.raises(FileExistsError, match="issue-tracking/SKILL.md"):
        install(tmp_path, "opencode")

    assert _tree_manifest(tmp_path) == before


def test_force_replaces_existing_issue_skill(tmp_path: Path) -> None:
    target = tmp_path / ".opencode/skills/issue-tracking/SKILL.md"
    target.parent.mkdir(parents=True)
    target.write_text("operator content", encoding="utf-8")

    install(tmp_path, "opencode", force=True)

    assert target.read_text(encoding="utf-8") == _render("filesystem", FILESYSTEM_TOOLS)


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
        if target.as_posix().endswith("/issue-tracking/SKILL.md"):
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
