from pathlib import Path

import pytest

from harnessctl.install import install
from harnessctl.templates import render_prompt, render_work_new


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

    assert len(installed) == 6
    assert (tmp_path / ".opencode/commands/work-new.md").exists()
    assert (tmp_path / ".opencode/commands/work-explore.md").exists()
    assert (tmp_path / ".opencode/commands/work-plan.md").exists()
    assert (tmp_path / ".pi/commands/work-new.md").exists()
    assert (tmp_path / ".pi/commands/work-explore.md").exists()
    assert (tmp_path / ".pi/commands/work-plan.md").exists()
    assert not (tmp_path / ".harnessctl").exists()


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
