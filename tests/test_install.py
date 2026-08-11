from pathlib import Path

import pytest

from harnessctl.install import install
from harnessctl.templates import TEMPLATES, render_prompt, render_skill, render_work_new


def test_rendered_prompts_share_the_canonical_body() -> None:
    opencode = render_work_new("opencode")
    pi = render_work_new("pi")

    assert "description: Start a human-guided work intake" in opencode
    assert "description: Start a human-guided work intake" not in pi
    assert opencode.endswith(pi)
    assert "{{" not in pi
    assert "No files were created or modified." in pi


def test_install_all_creates_project_local_targets(tmp_path: Path) -> None:
    installed = install(tmp_path, "all")

    assert len(installed) == len(TEMPLATES) * 2 + 1
    for command in TEMPLATES:
        assert (tmp_path / f".opencode/commands/{command}.md").exists()
        assert (tmp_path / f".pi/commands/{command}.md").exists()
    assert not (tmp_path / ".harnessctl").exists()
    assert (tmp_path / ".opencode/skills/caveman/SKILL.md").exists()


def test_install_refuses_conflicts_and_force_replaces(tmp_path: Path) -> None:
    install(tmp_path, "opencode")
    target = tmp_path / ".opencode/commands/work-new.md"
    original = target.read_text(encoding="utf-8")

    with pytest.raises(FileExistsError):
        install(tmp_path, "opencode")

    target.write_text("custom", encoding="utf-8")
    install(tmp_path, "opencode", force=True)
    assert target.read_text(encoding="utf-8") == original


def test_install_all_reports_all_conflicts(tmp_path: Path) -> None:
    install(tmp_path, "all")

    with pytest.raises(FileExistsError, match=r"\.opencode/commands/work-new\.md") as error:
        install(tmp_path, "all")

    assert ".pi/commands/work-new.md" in str(error.value)
    assert ".opencode/commands/work-plan.md" in str(error.value)


def test_explore_and_plan_prompts_define_their_boundaries() -> None:
    explore = render_prompt("work-explore", "pi")
    plan = render_prompt("work-plan", "opencode")

    assert "### Confirmed evidence" in explore
    assert "Do not create or modify files." in explore
    assert "human approval" in plan
    assert "Do not create or modify files." in plan
    assert "description: Gather repository evidence for a work contract" not in explore
    assert "description: Propose an implementation plan for human approval" in plan


def test_install_rejects_unsupported_harness(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="unsupported harness"):
        install(tmp_path, "unknown")


def test_caveman_renders_only_selected_mode() -> None:
    strict = render_skill("caveman", mode="strict")
    balanced = render_skill("caveman", mode="balanced")

    assert "terse technical fragments" in strict
    assert "concise professional sentences" not in strict
    assert "concise professional sentences" in balanced
    assert "terse technical fragments" not in balanced
    assert "{{" not in strict + balanced


def test_repository_memory_skill_is_specialized_and_bounded() -> None:
    rendered = render_skill(
        "memory",
        retrieval_limit=8,
        max_chars=12_000,
        repository_root=".harnessctl/memory",
        cache_path=".harnessctl/cache/memory.db",
    )

    assert "`memory_search`" in rendered
    assert "Default limit: 8" in rendered
    assert "Mem0" not in rendered
    assert "Graphiti" not in rendered
    assert "chain-of-thought" in rendered


def test_install_enabled_repository_memory_and_adapter(tmp_path: Path) -> None:
    config = tmp_path / ".harnessctl/config.yaml"
    config.parent.mkdir(parents=True)
    config.write_text(
        """version: 2
communication:
  caveman: {enabled: true, mode: balanced}
memory:
  enabled: true
  backend: repository
  namespace: {organization_id: acme, project_id: widget, default_topic: general}
  retrieval: {limit: 5, max_chars: 4000, include_superseded: false}
  repository: {root: .harnessctl/memory, cache: .harnessctl/cache/memory.db}
""",
        encoding="utf-8",
    )

    installed = install(tmp_path, "opencode")

    assert tmp_path / ".opencode/skills/memory/SKILL.md" in installed
    assert "@harnessctl/opencode-tools" in (tmp_path / ".opencode/package.json").read_text()
    assert (tmp_path / ".opencode/plugins/harnessctl-memory.js").exists()
    assert (tmp_path / ".harnessctl/memory/facts").is_dir()
    assert "/.harnessctl/cache/" in (tmp_path / ".gitignore").read_text()


@pytest.mark.parametrize("harness", ["pi", "all"])
def test_install_rejects_unverified_pi_memory_distribution(tmp_path: Path, harness: str) -> None:
    config = tmp_path / ".harnessctl/config.yaml"
    config.parent.mkdir(parents=True)
    config.write_text("memory:\n  enabled: true\n", encoding="utf-8")

    with pytest.raises(
        RuntimeError,
        match="automatic Pi extension and skill installation is not yet verified",
    ):
        install(tmp_path, harness)

    assert not (tmp_path / ".pi").exists()
    assert not (tmp_path / ".opencode").exists()


def test_install_preserves_unrelated_opencode_package_fields(tmp_path: Path) -> None:
    package = tmp_path / ".opencode/package.json"
    package.parent.mkdir(parents=True)
    package.write_text('{"name":"fixture","dependencies":{"other":"1.0.0"}}\n', encoding="utf-8")
    config = tmp_path / ".harnessctl/config.yaml"
    config.parent.mkdir(parents=True)
    config.write_text(
        "version: 1\n"
        "memory:\n"
        "  enabled: true\n"
        "  namespace:\n"
        "    organization_id: acme\n"
        "    project_id: widget\n",
        encoding="utf-8",
    )

    install(tmp_path, "opencode")

    content = package.read_text(encoding="utf-8")
    assert '"name": "fixture"' in content
    assert '"other": "1.0.0"' in content
