import importlib
import json
import os
import tomllib
import warnings
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace

import pytest

from harnessctl.config import DEFAULT_CONFIG, ConfigError, load_config
from harnessctl.install import (
    CURRENT_SDLC_COMMANDS,
    LEGACY_SDLC_COMMAND_REPLACEMENTS,
    LEGACY_SDLC_COMMANDS,
    RETIRED_SDLC_COMMANDS,
    install,
)
from harnessctl.mcp import (
    recognized_server_intents,
    render_opencode_mcp,
    render_pi_mcp,
)
from harnessctl.templates import (
    COMMAND_METADATA,
    SKILL_ID_MIGRATIONS,
    SKILL_RESOURCE_TEMPLATES,
    TEMPLATES,
    render_prompt,
    render_skill,
    render_skill_resources,
)

install_module = importlib.import_module("harnessctl.install")
config_module = importlib.import_module("harnessctl.config")


def _mock_pi_path() -> str:
    return "C:/tools/pi.exe" if install_module.os.name == "nt" else "/usr/bin/pi"


def _tree_manifest(root: Path) -> dict[str, tuple[str, bytes | None]]:
    return {
        path.relative_to(root).as_posix(): (
            "directory" if path.is_dir() else "file",
            None if path.is_dir() else path.read_bytes(),
        )
        for path in sorted(root.rglob("*"))
    }


def _sdlc_context(
    *,
    memory_enabled: bool,
    tdd_enabled: bool = False,
    code_index_enabled: bool = False,
) -> dict[str, object]:
    return {
        "memory_hooks_enabled": memory_enabled,
        "retrieval_limit": 3,
        "retrieval_max_chars": 2048,
        "tdd_enabled": tdd_enabled,
        "code_index_enabled": code_index_enabled,
    }


def _write_enabled_memory_config(root: Path, memory_root: str = ".harnessctl/memory") -> None:
    config = root / ".harnessctl/config.yaml"
    config.parent.mkdir(parents=True, exist_ok=True)
    config.write_text(
        f"""version: 2
communication:
  caveman: {{enabled: true, mode: balanced}}
memory:
  enabled: true
  backend: repository
  namespace: {{organization_id: acme, project_id: widget, default_topic: general}}
  retrieval: {{limit: 5, max_chars: 4000, include_superseded: false}}
  repository: {{root: {memory_root}}}
""",
        encoding="utf-8",
    )


def write_project_config(root: Path, content: str) -> None:
    config = root / ".harnessctl/config.yaml"
    config.parent.mkdir(parents=True, exist_ok=True)
    config.write_text(f"version: 2\n{content}", encoding="utf-8")


def write_tdd_config(root: Path, *, enabled: bool) -> None:
    write_project_config(
        root,
        f"workflow:\n  tdd:\n    enabled: {'true' if enabled else 'false'}\n",
    )


def write_sdlc_code_index_config(
    root: Path, *, enabled: bool, mcp_server: str = "sdlc-code-index"
) -> None:
    write_project_config(
        root,
        "skills:\n  sdlc-code-index:\n"
        f"    enabled: {'true' if enabled else 'false'}\n"
        f"    mcp_server: {mcp_server}\n",
    )


def write_cvs_provider_config(root: Path, provider: str) -> dict[str, object]:
    tools = {
        "github": "gh",
        "gitlab": "glab",
        "gitea": "tea",
        "forgejo": "forgejo-cli",
    }
    urls = {
        "github": "https://github.com",
        "gitlab": "https://gitlab.com",
        "gitea": "https://gitea.example.test",
        "forgejo": "https://forgejo.example.test",
    }
    token_envs = {
        "github": "GH_TOKEN",
        "gitlab": "GITLAB_TOKEN",
        "gitea": "GITEA_TOKEN",
        "forgejo": "FORGEJO_TOKEN",
    }
    write_project_config(
        root,
        "cvs:\n"
        "  remote:\n"
        f"    provider: {provider}\n"
        f"    tools: {tools[provider]}\n"
        f"    url: {urls[provider]}\n"
        f"    token_env: {token_envs[provider]}\n",
    )
    return load_config(root)


def write_pinned_pi_adapter(root: Path) -> None:
    settings = root / ".pi/settings.json"
    settings.parent.mkdir(parents=True, exist_ok=True)
    settings.write_text(
        '{"packages":["npm:@harnessctl/pi-tools@latest","npm:pi-mcp-adapter@2.26.0"]}\n',
        encoding="utf-8",
    )


def write_legacy_commands(root: Path, harness: str, *, mixed: bool = False) -> Path:
    directory = root / install_module.TARGETS[harness]
    directory.mkdir(parents=True, exist_ok=True)
    for command in LEGACY_SDLC_COMMANDS:
        content = f"custom legacy {command}\n"
        if mixed and command == "work-plan":
            content = install_module.render_command(harness, command, config=load_config(root))
        (directory / f"{command}.md").write_bytes(content.encode("utf-8"))
    return directory


def write_legacy_skill(root: Path, harness: str, skill: str = "caveman") -> Path:
    host_root = ".opencode" if harness == "opencode" else ".pi"
    directory = root / host_root / "skills" / skill
    (directory / "references/empty").mkdir(parents=True)
    (directory / "SKILL.md").write_bytes(b"custom legacy skill\x00\n")
    (directory / "references/custom.md").write_bytes(b"custom reference\n")
    return directory


def test_rendered_prompts_share_the_canonical_body() -> None:
    opencode = render_prompt("work-plan", "opencode")
    pi = render_prompt("work-plan", "pi")

    assert "description: Recognize one Epic and produce its approved executable plan" in opencode
    assert "description:" not in pi
    assert opencode.endswith(pi)
    assert "{{" not in pi
    assert "references/plan.md" in pi
    assert "references/checkpoint.md" in pi


@pytest.mark.parametrize("command", TEMPLATES)
def test_opencode_prompts_separate_frontmatter_from_body(command: str) -> None:
    opencode = render_prompt(command, "opencode")
    pi = render_prompt(command, "pi")

    assert "\n---\n\n# Work " in opencode
    assert opencode.endswith(pi)


@pytest.mark.parametrize("command", TEMPLATES)
def test_enabled_memory_does_not_claim_unverified_completion(command: str) -> None:
    assert command in TEMPLATES
    rendered = render_skill("sdlc", **_sdlc_context(memory_enabled=True))
    checkpoint = render_skill_resources("sdlc", **_sdlc_context(memory_enabled=True))[
        "references/checkpoint.md"
    ]

    assert "current issues/specs/source/Git/tests/provider observations > memory" in rendered
    assert "Checkpoint never proves approval/completion/current state" in checkpoint


def test_memory_entry_prefers_entity_topic_before_default() -> None:
    rendered = render_skill_resources("sdlc", **_sdlc_context(memory_enabled=True))[
        "references/checkpoint.md"
    ]
    normalized = " ".join(rendered.split())

    assert "configured topic + exact Epic ID + phase" in normalized
    assert "Get only a selected relevant record" in normalized


def test_install_all_creates_project_local_targets(tmp_path: Path) -> None:
    write_pinned_pi_adapter(tmp_path)
    installed = install(tmp_path, "all")

    skill_tree_count = sum(
        len(SKILL_RESOURCE_TEMPLATES[skill]) + 1 for skill in ("sdlc", "sdlc-code")
    )
    assert len(installed) == len(TEMPLATES) * 2 + 9 + skill_tree_count * 2
    for command in TEMPLATES:
        assert (tmp_path / f".opencode/commands/{command}.md").exists()
        assert (tmp_path / f".pi/prompts/{command}.md").exists()
    assert not (tmp_path / ".harnessctl").exists()
    assert (tmp_path / ".opencode/skills/sdlc-caveman/SKILL.md").exists()
    assert (tmp_path / ".opencode/skills/sdlc-cvs/SKILL.md").exists()
    for skill in (
        "sdlc-caveman",
        "sdlc-cvs",
        "sdlc-issue-tracking",
        "sdlc-memory",
    ):
        assert (tmp_path / f".pi/skills/{skill}/SKILL.md").exists()
    assert (tmp_path / ".opencode/skills/sdlc/references/checkpoint.md").is_file()
    assert (tmp_path / ".pi/skills/sdlc/references/checkpoint.md").is_file()
    opencode_sdlc = (tmp_path / ".opencode/skills/sdlc/SKILL.md").read_bytes()
    pi_sdlc = (tmp_path / ".pi/skills/sdlc/SKILL.md").read_bytes()
    assert opencode_sdlc == pi_sdlc
    assert b"`sdlc-code-index` is disabled" in opencode_sdlc
    assert b"Do not load a discoverable retained copy" in opencode_sdlc
    assert _tree_manifest(tmp_path / ".opencode/skills/sdlc-code") == _tree_manifest(
        tmp_path / ".pi/skills/sdlc-code"
    )
    assert len(SKILL_RESOURCE_TEMPLATES["sdlc-code"]) == 26


def test_skill_namespace_migration_metadata_is_exact() -> None:
    assert SKILL_ID_MIGRATIONS == {
        "caveman": "sdlc-caveman",
        "cvs": "sdlc-cvs",
        "develop-tdd": "sdlc-develop-tdd",
        "issue-tracking": "sdlc-issue-tracking",
        "memory": "sdlc-memory",
    }


def test_fresh_install_creates_only_prefixed_skill_directories(tmp_path: Path) -> None:
    write_pinned_pi_adapter(tmp_path)

    install(tmp_path, "all")

    for host_root in (tmp_path / ".opencode/skills", tmp_path / ".pi/skills"):
        assert all(path.name.startswith("sdlc") for path in host_root.iterdir())
        assert not any(path.name.startswith("harnessctl-") for path in host_root.iterdir())
        assert not any((host_root / legacy).exists() for legacy in SKILL_ID_MIGRATIONS)


@pytest.mark.parametrize("force", [False, True])
def test_legacy_skill_tree_is_byte_preserved_without_replacement_consent(
    tmp_path: Path, force: bool
) -> None:
    legacy = write_legacy_skill(tmp_path, "opencode")
    before = _tree_manifest(legacy)

    with pytest.warns(UserWarning, match="--replace-sdlc-skill-set") as caught:
        install(tmp_path, "opencode", force=force)

    assert _tree_manifest(legacy) == before
    assert (tmp_path / ".opencode/skills/sdlc/SKILL.md").is_file()
    message = str(caught[0].message).replace("\\", "/")
    assert f"- {legacy.as_posix()}" in message
    assert "references" not in "\n".join(
        line for line in message.splitlines() if line.startswith("- ")
    )


def test_skill_replacement_discloses_roots_and_migrates_only_selected_host(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    write_sdlc_code_index_config(tmp_path, enabled=True)
    selected = [write_legacy_skill(tmp_path, "opencode", skill) for skill in SKILL_ID_MIGRATIONS]
    for skill in SKILL_ID_MIGRATIONS:
        write_legacy_skill(tmp_path, "pi", skill)
    retained_markers = []
    for skill in ("sdlc", "sdlc-code", "sdlc-code-index"):
        marker = tmp_path / f".opencode/skills/{skill}/operator-retained"
        marker.parent.mkdir(parents=True)
        marker.write_bytes(f"retained {skill}\n".encode())
        retained_markers.append(marker)
    other_root = tmp_path / ".pi/skills"
    other_before = _tree_manifest(other_root)
    disclosures: list[str] = []
    original_write = install_module.write_atomic

    def checked_write(path: Path, content: str) -> None:
        assert disclosures, "skill migration write preceded affected-path disclosure"
        original_write(path, content)

    monkeypatch.setattr(install_module, "write_atomic", checked_write)

    install(
        tmp_path,
        "opencode",
        replace_sdlc_skill_set=True,
        disclose_skill_replacement=disclosures.append,
    )

    assert len(disclosures) == 1
    affected = [
        line.removeprefix("- ")
        for line in disclosures[0].replace("\\", "/").splitlines()
        if line.startswith("- ")
    ]
    assert affected == sorted(path.as_posix() for path in selected)
    assert not any(path.exists() for path in selected)
    assert _tree_manifest(other_root) == other_before
    assert (tmp_path / ".opencode/skills/sdlc/SKILL.md").is_file()
    for marker in retained_markers:
        assert marker.read_bytes() == f"retained {marker.parent.name}\n".encode()

    install(tmp_path, "opencode", force=True, replace_sdlc_skill_set=True)


def test_legacy_skill_symlink_is_rejected_before_mutation(tmp_path: Path) -> None:
    legacy = write_legacy_skill(tmp_path, "opencode")
    referent = tmp_path / "operator-policy.md"
    referent.write_bytes(b"operator policy\n")
    (legacy / "linked.md").symlink_to(referent)
    before = _tree_manifest(tmp_path)

    with pytest.raises(ValueError, match="must not contain symlinks"):
        install(tmp_path, "opencode", replace_sdlc_skill_set=True)

    assert _tree_manifest(tmp_path) == before
    assert referent.read_bytes() == b"operator policy\n"


@pytest.mark.parametrize("force", [False, True])
def test_legacy_skill_symlink_is_preserved_without_replacement_consent(
    tmp_path: Path, force: bool
) -> None:
    legacy = write_legacy_skill(tmp_path, "opencode")
    referent = tmp_path / "operator-policy.md"
    referent.write_bytes(b"operator policy\n")
    link = legacy / "linked.md"
    link.symlink_to(referent)

    with pytest.warns(UserWarning, match="--replace-sdlc-skill-set"):
        install(tmp_path, "opencode", force=force)

    assert link.is_symlink()
    assert link.read_bytes() == b"operator policy\n"
    assert referent.read_bytes() == b"operator policy\n"


@pytest.mark.parametrize("force", [False, True])
@pytest.mark.parametrize("harness", ["opencode", "pi", "all"])
@pytest.mark.skipif(not hasattr(os, "mkfifo"), reason="named pipes require os.mkfifo")
def test_legacy_skill_special_entry_is_preserved_without_replacement_consent(
    tmp_path: Path, harness: str, force: bool
) -> None:
    if harness in ("pi", "all"):
        write_pinned_pi_adapter(tmp_path)
    selected_harnesses = ("opencode", "pi") if harness == "all" else (harness,)
    pipes = []
    for selected_harness in selected_harnesses:
        legacy = write_legacy_skill(tmp_path, selected_harness)
        pipe = legacy / "operator.pipe"
        os.mkfifo(pipe)
        pipes.append(pipe)

    with pytest.warns(UserWarning, match="--replace-sdlc-skill-set"):
        install(tmp_path, harness, force=force)

    for pipe in pipes:
        assert pipe.exists()
        assert not pipe.is_file()


def test_explicit_skill_replacement_rejects_symlink_root_before_mutation(
    tmp_path: Path,
) -> None:
    referent = tmp_path / "operator-skill"
    referent.mkdir()
    (referent / "SKILL.md").write_bytes(b"operator policy\n")
    legacy = tmp_path / ".opencode/skills/caveman"
    legacy.parent.mkdir(parents=True)
    legacy.symlink_to(referent, target_is_directory=True)

    with pytest.raises(ValueError, match="root must not be a symlink"):
        install(tmp_path, "opencode", replace_sdlc_skill_set=True)

    assert legacy.is_symlink()
    assert (referent / "SKILL.md").read_bytes() == b"operator policy\n"


@pytest.mark.skipif(not hasattr(os, "mkfifo"), reason="named pipes require os.mkfifo")
def test_explicit_skill_replacement_rejects_special_entry_before_mutation(
    tmp_path: Path,
) -> None:
    legacy = write_legacy_skill(tmp_path, "opencode")
    pipe = legacy / "operator.pipe"
    os.mkfifo(pipe)

    with pytest.raises(ValueError, match="only regular files"):
        install(tmp_path, "opencode", replace_sdlc_skill_set=True)

    assert pipe.exists()
    assert not (tmp_path / ".opencode/skills/sdlc-caveman").exists()


@pytest.mark.parametrize(
    ("harness", "smoke_check"),
    (("opencode", "_smoke_check"), ("pi", "_smoke_check_pi")),
)
def test_skill_migration_failure_restores_exact_legacy_tree_for_each_host(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    harness: str,
    smoke_check: str,
) -> None:
    if harness == "pi":
        write_pinned_pi_adapter(tmp_path)
    for skill in SKILL_ID_MIGRATIONS:
        write_legacy_skill(tmp_path, harness, skill)
    before = _tree_manifest(tmp_path)
    monkeypatch.setattr(
        install_module,
        smoke_check,
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            RuntimeError("injected skill migration failure")
        ),
    )

    with pytest.raises(RuntimeError, match="injected skill migration failure"):
        install(tmp_path, harness, replace_sdlc_skill_set=True)

    assert _tree_manifest(tmp_path) == before


def test_canonical_conflict_precedes_explicit_skill_migration(tmp_path: Path) -> None:
    legacy = write_legacy_skill(tmp_path, "opencode")
    conflict = tmp_path / ".opencode/skills/sdlc-caveman/SKILL.md"
    conflict.parent.mkdir(parents=True)
    conflict.write_bytes(b"operator canonical skill\x00\n")
    before = _tree_manifest(tmp_path)

    with pytest.raises(FileExistsError, match=r"sdlc-caveman[\\/]SKILL\.md"):
        install(tmp_path, "opencode", replace_sdlc_skill_set=True)

    assert _tree_manifest(tmp_path) == before
    assert legacy.exists()


def test_install_refuses_conflicts_and_force_replaces(tmp_path: Path) -> None:
    install(tmp_path, "opencode")
    target = tmp_path / ".opencode/commands/work-build.md"
    original = target.read_text(encoding="utf-8")

    with pytest.raises(FileExistsError):
        install(tmp_path, "opencode")

    target.write_text("custom", encoding="utf-8")
    install(tmp_path, "opencode", force=True)
    assert target.read_text(encoding="utf-8") == original


def test_install_all_reports_all_conflicts(tmp_path: Path) -> None:
    write_pinned_pi_adapter(tmp_path)
    install(tmp_path, "all")

    with pytest.raises(FileExistsError) as error:
        install(tmp_path, "all")

    normalized_error = str(error.value).replace("\\", "/")
    assert ".opencode/commands/work-build.md" in normalized_error
    assert ".pi/prompts/work-build.md" in normalized_error
    assert ".opencode/commands/work-plan.md" in normalized_error


def test_command_set_migration_metadata_is_exact() -> None:
    assert (
        tuple(TEMPLATES)
        == CURRENT_SDLC_COMMANDS
        == (
            "work-plan",
            "work-build",
            "work-verify",
            "work-release",
            "work-continue",
            "work-refresh",
        )
    )
    assert len(LEGACY_SDLC_COMMANDS) == 18
    assert len(RETIRED_SDLC_COMMANDS) == 16
    assert set(LEGACY_SDLC_COMMAND_REPLACEMENTS) == set(LEGACY_SDLC_COMMANDS)
    assert set(LEGACY_SDLC_COMMAND_REPLACEMENTS.values()) == {
        "work-plan",
        "work-build",
        "work-verify",
        "work-release",
        "work-continue",
    }
    assert "work-refresh" not in LEGACY_SDLC_COMMAND_REPLACEMENTS.values()


@pytest.mark.parametrize("force", [False, True])
def test_legacy_commands_fail_before_writes_without_replacement_consent(
    tmp_path: Path, force: bool
) -> None:
    directory = write_legacy_commands(tmp_path, "opencode", mixed=True)
    before = _tree_manifest(tmp_path)

    with pytest.raises(FileExistsError) as error:
        install(tmp_path, "opencode", force=force)

    assert _tree_manifest(tmp_path) == before
    message = str(error.value).replace("\\", "/")
    detected = [line for line in message.splitlines() if line.startswith("- ")]
    assert len(detected) == 17
    assert f"- {directory.as_posix()}/work-verify.md" in detected
    assert f"- {directory.as_posix()}/work-plan.md" not in detected


@pytest.mark.parametrize("harness", ["opencode", "pi"])
@pytest.mark.parametrize("mixed", [False, True])
def test_replacement_migrates_only_selected_harness(
    tmp_path: Path, harness: str, mixed: bool
) -> None:
    if harness == "pi":
        write_pinned_pi_adapter(tmp_path)
    selected = write_legacy_commands(tmp_path, harness, mixed=mixed)
    other_harness = "pi" if harness == "opencode" else "opencode"
    other = write_legacy_commands(tmp_path, other_harness)
    other_before = {path.name: path.read_bytes() for path in other.glob("*.md")}

    install(tmp_path, harness, replace_sdlc_command_set=True)

    assert {path.stem for path in selected.glob("*.md")} == set(CURRENT_SDLC_COMMANDS)
    assert {path.name: path.read_bytes() for path in other.glob("*.md")} == other_before
    for command in CURRENT_SDLC_COMMANDS:
        assert (selected / f"{command}.md").read_text(encoding="utf-8") == (
            install_module.render_command(harness, command, config=load_config(tmp_path))
        )


def test_replacement_discloses_every_affected_path_before_mutation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    directory = write_legacy_commands(tmp_path, "opencode")
    disclosures: list[str] = []
    original_write = install_module.write_atomic

    def checked_write(path: Path, content: str) -> None:
        assert disclosures, "migration write preceded affected-path disclosure"
        original_write(path, content)

    monkeypatch.setattr(install_module, "write_atomic", checked_write)

    install(
        tmp_path,
        "opencode",
        replace_sdlc_command_set=True,
        disclose_sdlc_replacement=disclosures.append,
    )

    assert len(disclosures) == 1
    disclosure = disclosures[0].replace("\\", "/")
    assert "may contain custom changes" in disclosure
    affected = [
        line.removeprefix("- ") for line in disclosure.splitlines() if line.startswith("- ")
    ]
    assert affected == sorted(
        (directory / f"{command}.md").as_posix() for command in LEGACY_SDLC_COMMANDS
    )


def test_all_harness_replacement_is_independent_and_idempotent(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    write_pinned_pi_adapter(tmp_path)
    write_legacy_commands(tmp_path, "opencode")
    write_legacy_commands(tmp_path, "pi", mixed=True)

    install(tmp_path, "all", replace_sdlc_command_set=True)
    first = _tree_manifest(tmp_path)
    monkeypatch.setattr(
        install_module,
        "write_atomic",
        lambda *_args: pytest.fail("idempotent replacement attempted a write"),
    )
    install(tmp_path, "all", replace_sdlc_command_set=True)

    assert _tree_manifest(tmp_path) == first
    for relative in install_module.TARGETS.values():
        assert {path.stem for path in (tmp_path / relative).glob("*.md")} == set(
            CURRENT_SDLC_COMMANDS
        )


def test_replacement_does_not_bypass_unrelated_conflicts(tmp_path: Path) -> None:
    write_legacy_commands(tmp_path, "opencode")
    build = tmp_path / ".opencode/commands/work-build.md"
    build.write_bytes(b"custom build\x00")
    before = _tree_manifest(tmp_path)

    with pytest.raises(FileExistsError, match="work-build.md"):
        install(tmp_path, "opencode", replace_sdlc_command_set=True)

    assert _tree_manifest(tmp_path) == before
    install(tmp_path, "opencode", force=True, replace_sdlc_command_set=True)
    assert build.read_text(encoding="utf-8") == install_module.render_command(
        "opencode", "work-build", config=load_config(tmp_path)
    )


def test_windows_replacement_uses_path_deletion(
    tmp_path: Path,
) -> None:
    write_legacy_commands(tmp_path, "opencode")

    install(tmp_path, "opencode", replace_sdlc_command_set=True)

    assert not any(
        (tmp_path / ".opencode/commands" / f"{command}.md").exists()
        for command in RETIRED_SDLC_COMMANDS
    )


def test_migration_failure_restores_customized_files_and_deletions(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    write_legacy_commands(tmp_path, "opencode")
    before = _tree_manifest(tmp_path)
    monkeypatch.setattr(
        install_module,
        "_smoke_check",
        lambda _root, **_kwargs: (_ for _ in ()).throw(RuntimeError("injected migration failure")),
    )

    with pytest.raises(RuntimeError, match="injected migration failure"):
        install(tmp_path, "opencode", replace_sdlc_command_set=True)

    assert _tree_manifest(tmp_path) == before


def test_build_and_plan_prompts_define_their_boundaries() -> None:
    resources = render_skill_resources("sdlc", **_sdlc_context(memory_enabled=False))
    build = resources["references/build.md"]
    plan = resources["references/plan.md"]

    assert "Implement one local slice" in build
    assert "Never run Verify/Release" in build
    assert "one approved executable plan for one Epic" in plan
    assert "stop before Epic planning" in plan


def test_enabled_tdd_installs_equivalent_selected_host_skills(tmp_path: Path) -> None:
    write_tdd_config(tmp_path, enabled=True)
    write_pinned_pi_adapter(tmp_path)

    installed = install(tmp_path, "all")

    opencode_skill = tmp_path / ".opencode/skills/sdlc-develop-tdd/SKILL.md"
    pi_skill = tmp_path / ".pi/skills/sdlc-develop-tdd/SKILL.md"
    assert opencode_skill in installed
    assert pi_skill in installed
    assert opencode_skill.read_bytes() == pi_skill.read_bytes()
    assert not (opencode_skill.parent / ".harnessctl-generated.json").exists()
    assert not (pi_skill.parent / ".harnessctl-generated.json").exists()
    continue_policies: list[bytes] = []
    for root in (
        tmp_path / ".opencode/skills/sdlc",
        tmp_path / ".pi/skills/sdlc",
    ):
        build = (root / "references/build.md").read_text(encoding="utf-8")
        continue_policy = root / "references/continue.md"
        assert "Load `sdlc-develop-tdd` before implementation" in build
        assert "Red, Green, and Refactor" in build
        assert "load `references/build.md` before implementation" in continue_policy.read_text(
            encoding="utf-8"
        )
        continue_policies.append(continue_policy.read_bytes())
    assert continue_policies[0] == continue_policies[1]


def test_disabled_tdd_is_absent_from_fresh_install(tmp_path: Path) -> None:
    install(tmp_path, "opencode")

    assert not (tmp_path / ".opencode/skills/sdlc-develop-tdd").exists()
    build = (tmp_path / ".opencode/skills/sdlc/references/build.md").read_text(encoding="utf-8")
    continue_policy = (tmp_path / ".opencode/skills/sdlc/references/continue.md").read_text(
        encoding="utf-8"
    )
    assert "develop-tdd" not in build
    assert "Red, Green, and Refactor" not in build
    assert "references/build.md" in continue_policy
    assert "develop-tdd" not in continue_policy


def test_disabling_tdd_retains_dormant_generated_skill(tmp_path: Path) -> None:
    write_tdd_config(tmp_path, enabled=True)
    write_pinned_pi_adapter(tmp_path)
    install(tmp_path, "all")
    skills = (
        tmp_path / ".opencode/skills/sdlc-develop-tdd/SKILL.md",
        tmp_path / ".pi/skills/sdlc-develop-tdd/SKILL.md",
    )
    enabled_content = tuple(skill.read_bytes() for skill in skills)
    assert all(skill.is_file() for skill in skills)

    write_tdd_config(tmp_path, enabled=False)
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        install(tmp_path, "all", force=True)

    assert tuple(skill.read_bytes() for skill in skills) == enabled_content
    assert not any("TDD skill" in str(item.message) for item in caught)
    for root in (
        tmp_path / ".opencode/skills/sdlc",
        tmp_path / ".pi/skills/sdlc",
    ):
        build = (root / "references/build.md").read_text(encoding="utf-8")
        continue_policy = (root / "references/continue.md").read_text(encoding="utf-8")
        assert "develop-tdd" not in build
        assert "develop-tdd" not in continue_policy
        assert "Red, Green, and Refactor" not in continue_policy


def test_enabled_sdlc_code_index_installs_equivalent_selected_host_skills(
    tmp_path: Path,
) -> None:
    write_sdlc_code_index_config(tmp_path, enabled=True, mcp_server="operator-index")
    write_pinned_pi_adapter(tmp_path)

    installed = install(tmp_path, "all")

    opencode_skill = tmp_path / ".opencode/skills/sdlc-code-index/SKILL.md"
    pi_skill = tmp_path / ".pi/skills/sdlc-code-index/SKILL.md"
    assert opencode_skill in installed
    assert pi_skill in installed
    assert opencode_skill.read_bytes() == pi_skill.read_bytes()
    content = opencode_skill.read_text(encoding="utf-8")
    assert "Configured MCP server: `operator-index`" in content
    assert "Configured provider" not in content
    opencode_sdlc = (tmp_path / ".opencode/skills/sdlc/SKILL.md").read_bytes()
    pi_sdlc = (tmp_path / ".pi/skills/sdlc/SKILL.md").read_bytes()
    assert opencode_sdlc == pi_sdlc
    assert b"When `sdlc-code-index` is available" in opencode_sdlc
    assert b"`sdlc-code-index` is disabled" not in opencode_sdlc


def test_disabled_sdlc_code_index_is_absent_from_fresh_install(tmp_path: Path) -> None:
    write_sdlc_code_index_config(tmp_path, enabled=False)
    write_pinned_pi_adapter(tmp_path)

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        install(tmp_path, "all")

    assert not (tmp_path / ".opencode/skills/sdlc-code-index").exists()
    assert not (tmp_path / ".pi/skills/sdlc-code-index").exists()
    assert not any("sdlc-code-index" in str(item.message) for item in caught)
    opencode = json.loads((tmp_path / ".opencode/opencode.json").read_text(encoding="utf-8"))
    pi = json.loads((tmp_path / ".pi/mcp.json").read_text(encoding="utf-8"))
    assert "sdlc-code-index" not in opencode.get("mcp", {})
    assert "sdlc-code-index" not in pi.get("mcpServers", {})


def test_disabling_sdlc_code_index_retains_dormant_generated_skill(tmp_path: Path) -> None:
    write_sdlc_code_index_config(tmp_path, enabled=True)
    write_pinned_pi_adapter(tmp_path)
    install(tmp_path, "all")
    skills = (
        tmp_path / ".opencode/skills/sdlc-code-index/SKILL.md",
        tmp_path / ".pi/skills/sdlc-code-index/SKILL.md",
    )
    retained_content = (
        b"stale OpenCode provider-specific guidance\n",
        b"stale Pi provider-specific guidance\n",
    )
    for skill, content in zip(skills, retained_content, strict=True):
        skill.write_bytes(content)

    write_sdlc_code_index_config(tmp_path, enabled=False)
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        install(tmp_path, "all", force=True)

    assert tuple(skill.read_bytes() for skill in skills) == retained_content
    messages = [str(item.message) for item in caught if "sdlc-code-index" in str(item.message)]
    assert len(messages) == 2
    for path in (
        ".opencode/skills/sdlc-code-index/SKILL.md",
        ".pi/skills/sdlc-code-index/SKILL.md",
    ):
        matching = [message for message in messages if path in message]
        assert len(matching) == 1
        assert "remains discoverable and active-capable" in matching[0]
        assert "remove it manually" in matching[0]
    opencode = json.loads((tmp_path / ".opencode/opencode.json").read_text(encoding="utf-8"))
    pi = json.loads((tmp_path / ".pi/mcp.json").read_text(encoding="utf-8"))
    assert "sdlc-code-index" not in opencode.get("mcp", {})
    assert "sdlc-code-index" not in pi.get("mcpServers", {})
    for host_root in (".opencode", ".pi"):
        core = (tmp_path / host_root / "skills/sdlc/SKILL.md").read_text(encoding="utf-8")
        assert "`sdlc-code-index` is disabled" in core
        assert "Do not load a discoverable retained copy" in core
        assert "When `sdlc-code-index` is available" not in core


@pytest.mark.parametrize("harness", ["opencode", "pi", "all"])
def test_disabled_sdlc_code_index_warning_failure_rolls_back_install(
    tmp_path: Path, harness: str
) -> None:
    write_sdlc_code_index_config(tmp_path, enabled=False)
    if harness in ("pi", "all"):
        write_pinned_pi_adapter(tmp_path)
    host_roots = (".opencode", ".pi") if harness == "all" else (f".{harness}",)
    for host_root in host_roots:
        skill = tmp_path / host_root / "skills/sdlc-code-index/SKILL.md"
        skill.parent.mkdir(parents=True)
        skill.write_bytes(b"operator-retained skill\n")
    before = _tree_manifest(tmp_path)

    with warnings.catch_warnings():
        warnings.simplefilter("error")
        with pytest.raises(UserWarning, match="sdlc-code-index is disabled"):
            install(tmp_path, harness)

    assert _tree_manifest(tmp_path) == before


@pytest.mark.parametrize("harness", ["opencode", "pi", "all"])
def test_disabled_sdlc_code_index_warning_failure_rolls_back_memory_directories(
    tmp_path: Path, harness: str
) -> None:
    write_project_config(
        tmp_path,
        "memory:\n  enabled: true\nskills:\n  sdlc-code-index:\n    enabled: false\n",
    )
    if harness in ("pi", "all"):
        write_pinned_pi_adapter(tmp_path)
    host_roots = (".opencode", ".pi") if harness == "all" else (f".{harness}",)
    for host_root in host_roots:
        skill = tmp_path / host_root / "skills/sdlc-code-index/SKILL.md"
        skill.parent.mkdir(parents=True)
        skill.write_bytes(b"operator-retained skill\n")

    with pytest.warns(UserWarning, match="sdlc-code-index is disabled"):
        install(tmp_path, harness)
    memory_root = tmp_path / ".harnessctl/memory"
    for folder in ("facts", "decisions", "events", "lessons", "tombstones"):
        (memory_root / folder).rmdir()
    memory_root.rmdir()
    before = _tree_manifest(tmp_path)

    with warnings.catch_warnings():
        warnings.simplefilter("error")
        with pytest.raises(UserWarning, match="sdlc-code-index is disabled"):
            install(tmp_path, harness, force=True)

    assert _tree_manifest(tmp_path) == before


@pytest.mark.parametrize("harness", ["opencode", "pi", "all"])
def test_disabled_sdlc_code_index_symlink_is_rejected_before_mutation(
    tmp_path: Path, harness: str
) -> None:
    write_sdlc_code_index_config(tmp_path, enabled=False)
    if harness in ("pi", "all"):
        write_pinned_pi_adapter(tmp_path)
    host_roots = (".opencode", ".pi") if harness == "all" else (f".{harness}",)
    referents: list[Path] = []
    for host_root in host_roots:
        referent = tmp_path / f"operator-{host_root[1:]}-skill.md"
        referent.write_bytes(b"operator skill\n")
        skill = tmp_path / host_root / "skills/sdlc-code-index/SKILL.md"
        skill.parent.mkdir(parents=True)
        skill.symlink_to(referent)
        referents.append(referent)
    before = _tree_manifest(tmp_path)

    with pytest.raises(ValueError, match="must not contain symlinks"):
        install(tmp_path, harness)

    assert _tree_manifest(tmp_path) == before
    assert all(referent.read_bytes() == b"operator skill\n" for referent in referents)


@pytest.mark.parametrize("harness", ["opencode", "pi"])
def test_disabled_tdd_leaves_existing_operator_skill_untouched(
    tmp_path: Path, harness: str
) -> None:
    host_root = ".opencode" if harness == "opencode" else ".pi"
    skill = tmp_path / host_root / "skills/develop-tdd/SKILL.md"
    skill.parent.mkdir(parents=True)
    skill.write_text("operator-owned TDD policy\n", encoding="utf-8")
    if harness == "pi":
        write_pinned_pi_adapter(tmp_path)

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        install(tmp_path, harness)

    assert skill.read_text(encoding="utf-8") == "operator-owned TDD policy\n"
    assert not any("TDD skill" in str(item.message) for item in caught)


def test_enabled_tdd_operator_skill_conflict_precedes_mutation(tmp_path: Path) -> None:
    write_tdd_config(tmp_path, enabled=True)
    skill = tmp_path / ".opencode/skills/sdlc-develop-tdd/SKILL.md"
    skill.parent.mkdir(parents=True)
    skill.write_text("operator-owned TDD policy\n", encoding="utf-8")
    before = _tree_manifest(tmp_path)

    with pytest.raises(FileExistsError, match=r"develop-tdd[\\/]SKILL\.md"):
        install(tmp_path, "opencode")

    assert _tree_manifest(tmp_path) == before


def test_install_rejects_unsupported_harness(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="unsupported harness"):
        install(tmp_path, "unknown")


@pytest.mark.parametrize("unsafe_path", [r"C:outside", r"C:\outside", r"..\outside"])
def test_config_rejects_windows_native_escape_paths(tmp_path: Path, unsafe_path: str) -> None:
    config_path = tmp_path / ".harnessctl/config.yaml"
    config_path.parent.mkdir(parents=True)
    config_path.write_text(
        "\n".join(
            [
                "version: 1",
                "memory:",
                "  repository:",
                f"    root: '{unsafe_path}'",
            ]
        ),
        encoding="utf-8",
    )

    with pytest.raises(ConfigError, match="must stay inside project root"):
        load_config(tmp_path)


def test_config_serves_defaults_without_creating_file(tmp_path: Path) -> None:
    first = load_config(tmp_path)

    assert first["paths"]["tasks"] == ".harnessctl/tasks"
    assert first["issues"]["root"] == ".harnessctl/issues"
    assert first["issues"]["prefix"] == "hrn-"
    assert first["cvs"] == {
        "local": "git",
        "remote": {
            "provider": "github",
            "tools": "gh",
            "url": "https://github.com",
            "token_env": "GH_TOKEN",
        },
    }
    assert first["mcp"] == {
        "output_limit_mode": "bounded-guidance",
    }
    assert first["skills"] == {
        "sdlc-code-index": {"enabled": False, "mcp_server": "sdlc-code-index"}
    }
    assert first["issues"]["tools"].split(",") == [
        "issue_id",
        "issue_create",
        "issue_list",
        "issue_get",
        "issue_update",
        "issue_transition",
        "issue_comment",
        "issue_relate",
        "issue_unrelate",
        "issue_link_document",
        "issue_validate",
        "issue_archive",
    ]
    first["paths"]["tasks"] = "mutated"
    assert load_config(tmp_path)["paths"]["tasks"] == ".harnessctl/tasks"
    assert not (tmp_path / ".harnessctl/config.yaml").exists()


@pytest.mark.parametrize(
    "unsafe_root",
    [
        "../issues",
        "/tmp/issues",
        r"C:\issues",
        ".",
        "nested//issues",
        ".harnessctl/issues/",
        ".harnessctl/`issues",
    ],
)
def test_config_rejects_unsafe_issue_roots(tmp_path: Path, unsafe_root: str) -> None:
    config_path = tmp_path / ".harnessctl/config.yaml"
    config_path.parent.mkdir(parents=True)
    config_path.write_text(
        f"version: 2\nissues:\n  root: '{unsafe_root}'\n",
        encoding="utf-8",
    )

    with pytest.raises(ConfigError, match="issues.root must stay inside project root"):
        load_config(tmp_path)


@pytest.mark.parametrize("escaped_root", [r".harnessctl/\0issues", r".harnessctl/\nissues"])
def test_config_rejects_control_characters_in_issue_root(tmp_path: Path, escaped_root: str) -> None:
    config_path = tmp_path / ".harnessctl/config.yaml"
    config_path.parent.mkdir(parents=True)
    config_path.write_text(
        f'version: 2\nissues:\n  root: "{escaped_root}"\n',
        encoding="utf-8",
    )

    with pytest.raises(ConfigError, match="issues.root must stay inside project root"):
        load_config(tmp_path)


def test_config_deep_merges_partial_v2_over_defaults(tmp_path: Path) -> None:
    config_path = tmp_path / ".harnessctl/config.yaml"
    config_path.parent.mkdir(parents=True)
    config_path.write_text(
        "version: 2\nmemory:\n  enabled: true\n  retrieval:\n    limit: 3\n",
        encoding="utf-8",
    )

    config = load_config(tmp_path)

    assert config["memory"]["enabled"] is True
    assert config["memory"]["backend"] == "repository"
    assert config["memory"]["retrieval"] == {
        "limit": 3,
        "max_chars": 12_000,
        "include_superseded": False,
    }
    assert config["communication"]["caveman"] == {
        "enabled": True,
        "mode": "strict",
    }
    assert config["workflow"] == {
        "default_task_type": "bug",
        "tdd": {"enabled": False},
    }
    assert config["mcp"] == {"output_limit_mode": "bounded-guidance"}
    assert config["skills"] == {
        "sdlc-code-index": {"enabled": False, "mcp_server": "sdlc-code-index"}
    }


@pytest.mark.parametrize("enabled", [True, False])
def test_config_accepts_tdd_workflow_setting_and_preserves_unknown_fields(
    tmp_path: Path, enabled: bool
) -> None:
    config_path = tmp_path / ".harnessctl/config.yaml"
    config_path.parent.mkdir(parents=True)
    config_path.write_text(
        "workflow:\n"
        "  custom_policy: retained\n"
        "  tdd:\n"
        f"    enabled: {str(enabled).lower()}\n"
        "    custom_policy: retained\n",
        encoding="utf-8",
    )

    assert load_config(tmp_path)["workflow"] == {
        "default_task_type": "bug",
        "custom_policy": "retained",
        "tdd": {"enabled": enabled, "custom_policy": "retained"},
    }


def test_config_rejects_non_boolean_tdd_workflow_setting(tmp_path: Path) -> None:
    config_path = tmp_path / ".harnessctl/config.yaml"
    config_path.parent.mkdir(parents=True)
    config_path.write_text("workflow:\n  tdd:\n    enabled: 1\n", encoding="utf-8")

    with pytest.raises(ConfigError, match=r"workflow\.tdd\.enabled must be boolean"):
        load_config(tmp_path)


def test_config_rejects_unreleased_top_level_code_index_with_migration_guidance(
    tmp_path: Path,
) -> None:
    config_path = tmp_path / ".harnessctl/config.yaml"
    config_path.parent.mkdir(parents=True)
    config_path.write_text("code_index:\n  provider: graphify\n", encoding="utf-8")

    with pytest.raises(ConfigError, match=r"code_index.*skills\.sdlc-code-index"):
        load_config(tmp_path)


def test_config_defaults_to_disabled_external_code_index_skill(tmp_path: Path) -> None:
    config = load_config(tmp_path)

    assert config["mcp"] == {"output_limit_mode": "bounded-guidance"}
    assert config["skills"]["sdlc-code-index"] == {
        "enabled": False,
        "mcp_server": "sdlc-code-index",
    }


@pytest.mark.parametrize(
    "server_name", ["sdlc-code-index", "sdlc_cvs_custom", "index_2", "a", "a-b_c-9"]
)
def test_config_accepts_portable_external_code_index_server_name(
    tmp_path: Path, server_name: str
) -> None:
    write_project_config(
        tmp_path,
        f"skills:\n  sdlc-code-index:\n    enabled: true\n    mcp_server: {server_name}\n",
    )

    assert load_config(tmp_path)["skills"]["sdlc-code-index"] == {
        "enabled": True,
        "mcp_server": server_name,
    }


@pytest.mark.parametrize(
    "server_name",
    [
        "A",
        "-index",
        "index-",
        "_index",
        "index_",
        "index.server",
        "index server",
        "cvs_github",
        "sdlc_cvs_github",
        "a" * 65,
    ],
)
def test_config_rejects_invalid_external_code_index_server_name(
    tmp_path: Path, server_name: str
) -> None:
    write_project_config(
        tmp_path,
        f"skills:\n  sdlc-code-index:\n    enabled: true\n    mcp_server: {server_name}\n",
    )

    with pytest.raises(ConfigError, match=r"skills\.sdlc-code-index\.mcp_server"):
        load_config(tmp_path)


def test_config_rejects_legacy_mcp_servers_before_merge(tmp_path: Path) -> None:
    write_project_config(
        tmp_path,
        "mcp:\n  servers:\n    sdlc-code-index:\n      enabled: false\n",
    )

    with pytest.raises(ConfigError, match=r"mcp\.servers.*skills\.sdlc-code-index"):
        load_config(tmp_path)


@pytest.mark.parametrize(
    "yaml",
    [
        "version: 1\nversion: 2\n",
        "mcp:\n  output_limit_mode: hard\n  output_limit_mode: bounded-guidance\n",
    ],
)
def test_config_rejects_duplicate_yaml_keys(tmp_path: Path, yaml: str) -> None:
    config_path = tmp_path / ".harnessctl/config.yaml"
    config_path.parent.mkdir(parents=True)
    config_path.write_text(yaml, encoding="utf-8")

    with pytest.raises(ConfigError, match="duplicate mapping key"):
        load_config(tmp_path)


@pytest.mark.parametrize("yaml", ["1: root-value\n", "mcp:\n  1: nested-value\n"])
def test_config_rejects_non_string_yaml_keys(tmp_path: Path, yaml: str) -> None:
    config_path = tmp_path / ".harnessctl/config.yaml"
    config_path.parent.mkdir(parents=True)
    config_path.write_text(yaml, encoding="utf-8")

    with pytest.raises(ConfigError, match="mapping keys must be strings") as error:
        load_config(tmp_path)
    assert "root-value" not in str(error.value)
    assert "nested-value" not in str(error.value)


@pytest.mark.parametrize(
    ("provider", "tools", "url", "token_env", "normalized"),
    [
        ("github", " gh ", "https://github.com", "GH_TOKEN", "gh"),
        ("gitlab", " glab ", "https://gitlab.com", "GITLAB_TOKEN", "glab"),
        ("gitea", " tea ", "https://gitea.example.com/api", "GITEA_TOKEN", "tea"),
        (
            "forgejo",
            " forgejo-cli ",
            "https://forgejo.example.com",
            "FORGEJO_TOKEN",
            "forgejo-cli",
        ),
    ],
)
def test_config_accepts_and_normalizes_remote_provider_tools(
    tmp_path: Path,
    provider: str,
    tools: str,
    url: str,
    token_env: str,
    normalized: str,
) -> None:
    write_project_config(
        tmp_path,
        f'issues:\n  type: {provider}\n  tools: "{tools}"\n'
        f"  remote:\n    url: {url}\n    token_env: {token_env}\n",
    )

    assert load_config(tmp_path)["issues"] == {
        "root": ".harnessctl/issues",
        "prefix": "hrn-",
        "type": provider,
        "tools": normalized,
        "remote": {"url": url, "token_env": token_env},
    }


@pytest.mark.parametrize("provider", ["github", "gitlab", "gitea", "forgejo"])
def test_config_requires_explicit_remote_tools(tmp_path: Path, provider: str) -> None:
    write_project_config(
        tmp_path,
        f"issues:\n  type: {provider}\n"
        "  remote:\n    url: https://example.com\n    token_env: TOKEN\n",
    )

    with pytest.raises(ConfigError, match=rf"issues\.type={provider} requires issues\.tools"):
        load_config(tmp_path)


@pytest.mark.parametrize(
    ("provider", "tools"),
    [
        ("github", "glab"),
        ("gitlab", "gh"),
        ("gitea", "gh"),
        ("forgejo", "tea,gh"),
    ],
)
def test_config_rejects_provider_tool_mismatches(tmp_path: Path, provider: str, tools: str) -> None:
    write_project_config(
        tmp_path,
        f'issues:\n  type: {provider}\n  tools: "{tools}"\n'
        "  remote:\n    url: https://example.com\n    token_env: TOKEN\n",
    )

    with pytest.raises(ConfigError, match=r"issues\.tools"):
        load_config(tmp_path)


@pytest.mark.parametrize("tools", ["gh --token secret", "../gh", "TOKEN=value", "gh;rm", "gh,", ""])
def test_config_rejects_unsafe_remote_tool_text(tmp_path: Path, tools: str) -> None:
    write_project_config(
        tmp_path,
        f'issues:\n  type: forgejo\n  tools: "{tools}"\n'
        "  remote:\n    url: https://forgejo.example.com\n    token_env: FORGEJO_TOKEN\n",
    )

    with pytest.raises(ConfigError, match=r"issues\.tools"):
        load_config(tmp_path)


@pytest.mark.parametrize("provider", ["github", "gitlab", "gitea", "forgejo"])
def test_config_requires_remote_connection(tmp_path: Path, provider: str) -> None:
    tools = {"github": "gh", "gitlab": "glab", "gitea": "tea", "forgejo": "forgejo-cli"}
    write_project_config(tmp_path, f"issues:\n  type: {provider}\n  tools: {tools[provider]}\n")

    with pytest.raises(ConfigError, match=rf"issues\.type={provider} requires issues\.remote"):
        load_config(tmp_path)


def test_config_rejects_remote_connection_for_filesystem(tmp_path: Path) -> None:
    write_project_config(
        tmp_path,
        "issues:\n  remote:\n    url: https://github.com\n    token_env: GH_TOKEN\n",
    )

    with pytest.raises(ConfigError, match="not allowed"):
        load_config(tmp_path)


@pytest.mark.parametrize(
    ("provider", "url", "token_env", "error"),
    [
        ("github", "https://github.example.com", "GH_TOKEN", r"remote\.url"),
        ("gitea", "gitea.example.com", "GITEA_TOKEN", r"remote\.url"),
        ("gitea", "https://gitea.example.com:abc", "GITEA_TOKEN", r"remote\.url"),
        ("gitea", "https://[bad", "GITEA_TOKEN", r"remote\.url"),
        ("gitea", "https://user:secret@gitea.example.com", "GITEA_TOKEN", r"remote\.url"),
        ("gitea", "https://gitea.example.com/`injected`", "GITEA_TOKEN", r"remote\.url"),
        ("gitea", "https://gitea.example.com/${TOKEN}", "GITEA_TOKEN", r"remote\.url"),
        ("forgejo", "ssh://forgejo.example.com", "FORGEJO_TOKEN", r"remote\.url"),
        ("forgejo", "https://forgejo.example.com", "TOKEN=value", r"remote\.token_env"),
    ],
)
def test_config_rejects_invalid_remote_connection(
    tmp_path: Path, provider: str, url: str, token_env: str, error: str
) -> None:
    tool = {"github": "gh", "gitlab": "glab", "gitea": "tea", "forgejo": "forgejo-cli"}[provider]
    write_project_config(
        tmp_path,
        f"issues:\n  type: {provider}\n  tools: {tool}\n"
        f"  remote:\n    url: {url}\n    token_env: {token_env}\n",
    )

    with pytest.raises(ConfigError, match=error):
        load_config(tmp_path)


def test_config_rejects_remote_url_with_embedded_line_break(tmp_path: Path) -> None:
    write_project_config(
        tmp_path,
        "issues:\n  type: gitea\n  tools: tea\n  remote:\n"
        '    url: "https://gitea.example.com/path\\ninjected"\n'
        "    token_env: GITEA_TOKEN\n",
    )

    with pytest.raises(ConfigError, match=r"remote\.url"):
        load_config(tmp_path)


@pytest.mark.parametrize("local", ["git", "jj"])
@pytest.mark.parametrize(
    ("provider", "tool", "url", "token_env"),
    [
        ("github", "gh", "https://github.com", "GH_TOKEN"),
        ("gitlab", "glab", "https://gitlab.com", "GITLAB_TOKEN"),
        ("gitea", "tea", "https://gitea.example.com", "GITEA_TOKEN"),
        ("forgejo", "forgejo-cli", "https://forgejo.example.com", "FORGEJO_TOKEN"),
    ],
)
def test_config_accepts_every_cvs_provider_combination(
    tmp_path: Path,
    local: str,
    provider: str,
    tool: str,
    url: str,
    token_env: str,
) -> None:
    write_project_config(
        tmp_path,
        f"cvs:\n  local: {local}\n  remote:\n    provider: {provider}\n"
        f"    tools: {tool}\n    url: {url}\n"
        f"    token_env: {token_env}\n",
    )

    assert load_config(tmp_path)["cvs"] == {
        "local": local,
        "remote": {
            "provider": provider,
            "tools": tool,
            "url": url,
            "token_env": token_env,
        },
    }


def test_config_keeps_remote_issue_connection_independent_from_cvs(tmp_path: Path) -> None:
    write_project_config(
        tmp_path,
        "issues:\n  type: github\n  tools: gh\n"
        "  remote:\n    url: https://github.com\n    token_env: ISSUE_TOKEN\n",
    )

    config = load_config(tmp_path)

    assert config["cvs"]["remote"]["token_env"] == "GH_TOKEN"
    assert config["issues"]["remote"] == {
        "url": "https://github.com",
        "token_env": "ISSUE_TOKEN",
    }


@pytest.mark.parametrize(
    "content",
    [
        "cvs:\n  remote:\n    transport: auto\n",
        "issues:\n  type: gitlab\n  tools: glab\n"
        "  remote:\n    transport: mcp\n    url: https://gitlab.com\n"
        "    token_env: ISSUE_TOKEN\n",
    ],
)
def test_config_rejects_removed_transport_settings(tmp_path: Path, content: str) -> None:
    write_project_config(
        tmp_path,
        content,
    )

    with pytest.raises(ConfigError, match="unknown keys"):
        load_config(tmp_path)


@pytest.mark.parametrize("provider", ["gitlab", "gitea", "forgejo"])
def test_config_requires_complete_explicit_cvs_provider_override(
    tmp_path: Path, provider: str
) -> None:
    write_project_config(tmp_path, f"cvs:\n  remote:\n    provider: {provider}\n")

    with pytest.raises(ConfigError, match=r"cvs\.remote\.(tools|url|token_env)"):
        load_config(tmp_path)


@pytest.mark.parametrize(
    "content",
    [
        "cvs:\n  local: svn\n",
        "cvs:\n  remote:\n    tools: glab\n",
        "cvs:\n  remote:\n    url: https://github.example.com\n",
        "cvs:\n  remote:\n    token_env: ghp_secret\n",
        "mcp:\n  output_limit_mode: unlimited\n",
    ],
)
def test_config_rejects_invalid_cvs_and_mcp_values(tmp_path: Path, content: str) -> None:
    write_project_config(tmp_path, content)

    with pytest.raises(ConfigError):
        load_config(tmp_path)


@pytest.mark.parametrize(
    "content",
    [
        "issues:\n  unexpected: true\n",
        "issues:\n  type: github\n  tools: gh\n"
        "  remote:\n    url: https://github.com\n    token_env: GH_TOKEN\n"
        "    unexpected: true\n",
        "cvs:\n  unexpected: true\n",
        "cvs:\n  remote:\n    mcp_id: cvs_github\n",
        "mcp:\n  server_id: cvs_github\n",
    ],
)
def test_config_rejects_unknown_nested_keys_and_configurable_mcp_ids(
    tmp_path: Path, content: str
) -> None:
    write_project_config(tmp_path, content)

    with pytest.raises(ConfigError, match="unknown keys"):
        load_config(tmp_path)


def test_config_accepts_hard_output_limit_as_host_neutral_policy(tmp_path: Path) -> None:
    write_project_config(tmp_path, "mcp:\n  output_limit_mode: hard\n")

    assert load_config(tmp_path)["mcp"] == {
        **DEFAULT_CONFIG["mcp"],
        "output_limit_mode": "hard",
    }


def test_config_normalizes_exact_filesystem_tool_set(tmp_path: Path) -> None:
    canonical = DEFAULT_CONFIG["issues"]["tools"]
    reordered = " , ".join(reversed(canonical.split(",")))
    write_project_config(tmp_path, f'issues:\n  tools: "{reordered}"\n')

    assert load_config(tmp_path)["issues"]["tools"] == canonical

    for invalid in (
        ",".join(canonical.split(",")[1:]),
        f"{canonical},extra",
        f"{canonical},issue_id",
    ):
        write_project_config(tmp_path, f'issues:\n  tools: "{invalid}"\n')
        with pytest.raises(ConfigError, match="must be exactly"):
            load_config(tmp_path)


def test_config_requires_caveman_when_memory_is_enabled(tmp_path: Path) -> None:
    config_path = tmp_path / ".harnessctl/config.yaml"
    config_path.parent.mkdir(parents=True)
    config_path.write_text(
        "memory:\n  enabled: true\ncommunication:\n  caveman:\n    enabled: false\n",
        encoding="utf-8",
    )

    with pytest.raises(
        ConfigError,
        match=r"memory\.enabled=true requires communication\.caveman\.enabled=true",
    ):
        load_config(tmp_path)


def test_config_allows_disabled_memory_and_caveman(tmp_path: Path) -> None:
    config_path = tmp_path / ".harnessctl/config.yaml"
    config_path.parent.mkdir(parents=True)
    config_path.write_text(
        "memory:\n  enabled: false\ncommunication:\n  caveman:\n    enabled: false\n",
        encoding="utf-8",
    )

    config = load_config(tmp_path)

    assert config["memory"]["enabled"] is False
    assert config["communication"]["caveman"]["enabled"] is False


def test_command_metadata_exactly_covers_templates() -> None:
    assert len(COMMAND_METADATA) == 6
    assert COMMAND_METADATA.keys() == TEMPLATES.keys()


def test_memory_disabled_prompts_compile_memory_out() -> None:
    enabled_config = deepcopy(DEFAULT_CONFIG)
    enabled_config["memory"]["enabled"] = True

    for command in TEMPLATES:
        disabled = render_prompt(command, "opencode")
        assert "memory_" not in disabled
        assert "{{" not in disabled
        assert "{%" not in disabled


def test_enabled_pi_prompts_delegate_memory_hooks() -> None:
    config = deepcopy(DEFAULT_CONFIG)
    config["memory"]["enabled"] = True

    for command in TEMPLATES:
        rendered = render_prompt(command, "pi", config=config)
        assert "references/checkpoint.md" in rendered or command in {
            "work-continue",
            "work-refresh",
        }
        assert "memory_search" not in rendered

    checkpoint = render_skill_resources("sdlc", **_sdlc_context(memory_enabled=True))[
        "references/checkpoint.md"
    ]
    assert "memory_store" in checkpoint
    assert "memory_supersede" in checkpoint


def test_enabled_opencode_prompts_delegate_bounded_shared_memory_hooks() -> None:
    enabled_config = deepcopy(DEFAULT_CONFIG)
    enabled_config["memory"]["enabled"] = True
    enabled_config["memory"]["retrieval"]["limit"] = 3
    enabled_config["memory"]["retrieval"]["max_chars"] = 2048
    for command in TEMPLATES:
        rendered = render_prompt(command, "opencode", config=enabled_config)
        assert "memory_search" not in rendered

    checkpoint = render_skill_resources(
        "sdlc",
        memory_hooks_enabled=True,
        retrieval_limit=3,
        retrieval_max_chars=2048,
        tdd_enabled=False,
        code_index_enabled=False,
    )["references/checkpoint.md"]
    normalized = " ".join(checkpoint.split())
    assert "limit 3, 2048 chars" in normalized
    assert "Store only confirmed/currently verified state with provenance" in normalized
    assert "Checkpoint never proves approval/completion/current state" in normalized


def test_caveman_renders_only_selected_mode() -> None:
    strict = render_skill("sdlc-caveman", mode="strict")
    balanced = render_skill("sdlc-caveman", mode="balanced")

    assert "terse technical fragments" in strict
    assert "concise professional sentences" not in strict
    assert "concise professional sentences" in balanced
    assert "terse technical fragments" not in balanced
    assert "{{" not in strict + balanced


def test_repository_memory_skill_is_specialized_and_bounded() -> None:
    rendered = render_skill(
        "sdlc-memory",
        retrieval_limit=8,
        max_chars=12_000,
        repository_root=".harnessctl/memory",
    )

    assert "`memory_search`" in rendered
    assert "Default limit: 8" in rendered
    assert "Mem0" not in rendered
    assert "Graphiti" not in rendered
    assert "chain-of-thought" in rendered
    assert ".harnessctl/cache/harnessctl.sqlite" in rendered
    assert "Every record submitted through `memory_store`" in rendered
    assert "every replacement submitted through `memory_supersede`" in rendered
    assert "every record proposed by `memory_import`" in rendered
    assert "minimum tokens with full technical meaning" in rendered


def test_install_enabled_repository_memory_and_adapter(tmp_path: Path) -> None:
    _write_enabled_memory_config(tmp_path)

    installed = install(tmp_path, "opencode")

    assert len(list((tmp_path / ".opencode/commands").glob("*.md"))) == 6
    for command in TEMPLATES:
        rendered = (tmp_path / f".opencode/commands/{command}.md").read_text(encoding="utf-8")
        assert "memory_search" not in rendered
    checkpoint = (tmp_path / ".opencode/skills/sdlc/references/checkpoint.md").read_text(
        encoding="utf-8"
    )
    assert "memory_store" in checkpoint
    assert "limit 5, 4000 chars" in checkpoint
    assert tmp_path / ".opencode/skills/sdlc-caveman/SKILL.md" in installed
    assert tmp_path / ".opencode/skills/sdlc-memory/SKILL.md" in installed
    opencode = json.loads((tmp_path / ".opencode/opencode.json").read_text(encoding="utf-8"))
    assert "@harnessctl/opencode-tools@latest" in opencode["plugin"]
    assert not (tmp_path / ".opencode/plugins/harnessctl-memory.js").exists()
    assert (tmp_path / ".harnessctl/memory/facts").is_dir()
    assert "/.harnessctl/cache/" in (tmp_path / ".gitignore").read_text()
    assert not (tmp_path / ".harnessctl/cache/harnessctl.sqlite").exists()


def test_install_disabled_memory_compiles_out_integration(tmp_path: Path) -> None:
    installed = install(tmp_path, "opencode")

    assert len(installed) == (
        12 + len(SKILL_RESOURCE_TEMPLATES["sdlc"]) + len(SKILL_RESOURCE_TEMPLATES["sdlc-code"])
    )
    for command in TEMPLATES:
        rendered = (tmp_path / f".opencode/commands/{command}.md").read_text(encoding="utf-8")
        assert "memory_" not in rendered
        assert "Project memory" not in rendered
    assert (tmp_path / ".opencode/skills/sdlc-caveman/SKILL.md").is_file()
    checkpoint = (tmp_path / ".opencode/skills/sdlc/references/checkpoint.md").read_text(
        encoding="utf-8"
    )
    assert "Memory checkpoint unavailable" in checkpoint
    assert "memory_store" not in checkpoint
    opencode = json.loads((tmp_path / ".opencode/opencode.json").read_text(encoding="utf-8"))
    assert "@harnessctl/opencode-tools@latest" in opencode["plugin"]
    assert not (tmp_path / ".opencode/skills/sdlc-memory").exists()
    assert not (tmp_path / ".opencode/plugins").exists()
    assert not (tmp_path / ".opencode/package.json").exists()


@pytest.mark.parametrize("harness", ["pi", "all"])
def test_install_supports_pi_memory_distribution(tmp_path: Path, harness: str) -> None:
    _write_enabled_memory_config(tmp_path)
    write_pinned_pi_adapter(tmp_path)

    installed = install(tmp_path, harness)

    assert tmp_path / ".pi/skills/sdlc-memory/SKILL.md" in installed
    checkpoint = (tmp_path / ".pi/skills/sdlc/references/checkpoint.md").read_text(encoding="utf-8")
    assert "memory_store" in checkpoint
    assert "limit 5, 4000 chars" in checkpoint
    assert (tmp_path / ".harnessctl/memory/facts").is_dir()


def test_all_install_produces_byte_equivalent_sdlc_skill_trees(tmp_path: Path) -> None:
    write_pinned_pi_adapter(tmp_path)

    install(tmp_path, "all")

    opencode = tmp_path / ".opencode/skills/sdlc"
    pi = tmp_path / ".pi/skills/sdlc"
    assert _tree_manifest(opencode) == _tree_manifest(pi)


def test_committed_sdlc_code_trees_match_current_installer_render(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    project_root = Path(__file__).resolve().parents[1]
    config = load_config(project_root)
    monkeypatch.setattr("harnessctl.install.load_config", lambda _root: config)
    write_pinned_pi_adapter(tmp_path)

    install(tmp_path, "all")

    for host_path in (
        ".opencode/skills/sdlc-code",
        ".pi/skills/sdlc-code",
    ):
        assert _tree_manifest(project_root / host_path) == _tree_manifest(tmp_path / host_path)


@pytest.mark.parametrize(
    ("skill", "reference", "heading"),
    (
        ("sdlc", "checkpoint.md", "# Workflow checkpoint"),
        ("sdlc-code", "py.md", "# Python"),
    ),
)
def test_nested_skill_resource_conflict_and_force_are_transactional(
    tmp_path: Path, skill: str, reference: str, heading: str
) -> None:
    target = tmp_path / f".opencode/skills/{skill}/references/{reference}"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"operator checkpoint\x00")
    before = _tree_manifest(tmp_path)

    with pytest.raises(FileExistsError, match=reference):
        install(tmp_path, "opencode")
    assert _tree_manifest(tmp_path) == before

    install(tmp_path, "opencode", force=True)
    assert target.read_text(encoding="utf-8").startswith(heading)


@pytest.mark.parametrize(
    ("skill", "reference"),
    (("sdlc", "checkpoint.md"), ("sdlc-code", "py.md")),
)
def test_nested_skill_resource_symlink_is_rejected_without_mutation(
    tmp_path: Path, skill: str, reference: str
) -> None:
    referent = tmp_path / "operator-checkpoint.md"
    referent.write_bytes(b"operator checkpoint\n")
    target = tmp_path / f".opencode/skills/{skill}/references/{reference}"
    target.parent.mkdir(parents=True)
    target.symlink_to(referent)
    before = _tree_manifest(tmp_path)

    with pytest.raises(ValueError, match="must not contain symlinks"):
        install(tmp_path, "opencode", force=True)

    assert _tree_manifest(tmp_path) == before
    assert referent.read_bytes() == b"operator checkpoint\n"


@pytest.mark.parametrize(
    ("skill", "reference"),
    (("sdlc", "checkpoint.md"), ("sdlc-code", "py.md")),
)
def test_nested_skill_resource_failure_restores_exact_tree(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, skill: str, reference: str
) -> None:
    before = _tree_manifest(tmp_path)
    original_write = install_module.write_atomic

    def fail_on_reference(target: Path, content: str) -> None:
        if target.as_posix().endswith(f"/{skill}/references/{reference}"):
            raise OSError("injected nested resource failure")
        original_write(target, content)

    monkeypatch.setattr(install_module, "write_atomic", fail_on_reference)
    with pytest.raises(OSError, match="injected nested resource failure"):
        install(tmp_path, "opencode")

    assert _tree_manifest(tmp_path) == before


def test_install_reports_command_and_skill_conflicts_before_writes(tmp_path: Path) -> None:
    _write_enabled_memory_config(tmp_path)
    command = tmp_path / ".opencode/commands/work-build.md"
    skill = tmp_path / ".opencode/skills/sdlc-memory/SKILL.md"
    command.parent.mkdir(parents=True)
    skill.parent.mkdir(parents=True)
    command.write_text("custom command", encoding="utf-8")
    skill.write_text("custom skill", encoding="utf-8")
    before = _tree_manifest(tmp_path)

    with pytest.raises(FileExistsError) as error:
        install(tmp_path, "opencode")

    assert _tree_manifest(tmp_path) == before
    message = str(error.value).replace("\\", "/")
    assert ".opencode/commands/work-build.md" in message
    assert ".opencode/skills/sdlc-memory/SKILL.md" in message


@pytest.mark.parametrize("failure_point", ["write", "initialize", "smoke"])
def test_install_failure_restores_exact_tree_and_preserves_existing_paths(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, failure_point: str
) -> None:
    _write_enabled_memory_config(tmp_path, ".harnessctl/custom/memory")
    existing_opencode = tmp_path / ".opencode"
    existing_opencode.mkdir()
    (existing_opencode / "keep.txt").write_bytes(b"keep-opencode\x00")
    (existing_opencode / "package.json").write_bytes(b'{"name":"keep"}\n')
    (tmp_path / ".gitignore").write_bytes(b"/existing-without-newline")
    existing_memory_folder = tmp_path / ".harnessctl/custom/memory/facts"
    existing_memory_folder.mkdir(parents=True)
    (existing_memory_folder / "keep.yaml").write_bytes(b"keep-memory\n")
    before = _tree_manifest(tmp_path)

    if failure_point == "write":
        original_write = install_module.write_atomic
        writes = 0

        def fail_during_write(target: Path, content: str) -> None:
            nonlocal writes
            writes += 1
            if writes == 3:
                raise OSError("injected command write failure")
            original_write(target, content)

        monkeypatch.setattr(install_module, "write_atomic", fail_during_write)
    elif failure_point == "initialize":
        original_initialize = install_module._initialize_memory_paths

        def fail_during_initialize(
            root: Path, repository: dict[str, object], created: list[Path]
        ) -> None:
            original_initialize(root, repository, created)
            raise OSError("injected memory initialization failure")

        monkeypatch.setattr(install_module, "_initialize_memory_paths", fail_during_initialize)
    else:
        monkeypatch.setattr(
            install_module,
            "_smoke_check",
            lambda _root, **_kwargs: (_ for _ in ()).throw(RuntimeError("injected smoke failure")),
        )

    with pytest.raises((OSError, RuntimeError), match="injected"):
        install(tmp_path, "opencode")

    assert _tree_manifest(tmp_path) == before
    assert not (tmp_path / ".harnessctl/cache/harnessctl.sqlite").exists()


def test_install_does_not_modify_unrelated_opencode_package_fields(tmp_path: Path) -> None:
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

    assert package.read_text(encoding="utf-8") == (
        '{"name":"fixture","dependencies":{"other":"1.0.0"}}\n'
    )


def test_opencode_mcp_merge_preserves_operator_configuration(tmp_path: Path) -> None:
    host = tmp_path / ".opencode/opencode.json"
    host.parent.mkdir(parents=True)
    host.write_text(
        '{"$schema":"schema","plugin":["operator"],"mcp":{"operator":{"x":1}}}\n',
        encoding="utf-8",
    )

    install(tmp_path, "opencode")

    document = json.loads(host.read_text(encoding="utf-8"))
    assert document["$schema"] == "schema"
    assert document["plugin"] == ["operator", "@harnessctl/opencode-tools@latest"]
    assert document["mcp"]["operator"] == {"x": 1}
    assert document["mcp"]["sdlc_cvs_github"]["headers"]["Authorization"] == (
        "Bearer {env:GH_TOKEN}"
    )


@pytest.mark.parametrize("harness", ["opencode", "pi"])
@pytest.mark.parametrize("force", [False, True])
@pytest.mark.parametrize("provider", ["github", "gitlab", "gitea", "forgejo"])
def test_install_migrates_exact_legacy_cvs_mcp_id(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    harness: str,
    force: bool,
    provider: str,
) -> None:
    monkeypatch.setattr(install_module.shutil, "which", lambda name: f"/bin/{name}")
    config = write_cvs_provider_config(tmp_path, provider)
    legacy = recognized_server_intents(config, harness)[0]
    if harness == "opencode":
        host = tmp_path / ".opencode/opencode.json"
        container = "mcp"
        generated = render_opencode_mcp(legacy)
    else:
        write_pinned_pi_adapter(tmp_path)
        host = tmp_path / ".pi/mcp.json"
        container = "mcpServers"
        generated = render_pi_mcp(legacy)
    host.parent.mkdir(parents=True, exist_ok=True)
    operator_raw = '{"weight":1e+02,"escaped":"\\u0061"}'
    host.write_text(
        f'{{"operatorRaw":{operator_raw},"{container}":'
        f"{json.dumps({legacy.server_id: generated, 'operator': {'keep': True}})}}}\n",
        encoding="utf-8",
    )

    install(tmp_path, harness, force=force)

    rendered = host.read_text(encoding="utf-8")
    document = json.loads(rendered)
    entries = document[container]
    assert legacy.server_id not in entries
    assert entries[f"sdlc_cvs_{provider}"] == generated
    assert entries["operator"] == {"keep": True}
    assert document["operatorRaw"] == {"weight": 100, "escaped": "a"}
    assert f'"operatorRaw": {operator_raw}' in rendered


@pytest.mark.parametrize("harness", ["opencode", "pi"])
@pytest.mark.parametrize("force", [False, True])
@pytest.mark.parametrize("provider", ["github", "gitlab", "gitea", "forgejo"])
def test_install_preserves_modified_legacy_cvs_mcp_id(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    harness: str,
    force: bool,
    provider: str,
) -> None:
    monkeypatch.setattr(install_module.shutil, "which", lambda name: f"/bin/{name}")
    config = write_cvs_provider_config(tmp_path, provider)
    legacy = recognized_server_intents(config, harness)[0]
    if harness == "opencode":
        host = tmp_path / ".opencode/opencode.json"
        container = "mcp"
        generated = render_opencode_mcp(legacy)
    else:
        write_pinned_pi_adapter(tmp_path)
        host = tmp_path / ".pi/mcp.json"
        container = "mcpServers"
        generated = render_pi_mcp(legacy)
    modified = {**generated, "operatorWeight": 100}
    modified_raw = json.dumps(modified, separators=(",", ":")).replace(
        '"operatorWeight":100', '"operatorWeight":1e+02'
    )
    host.parent.mkdir(parents=True, exist_ok=True)
    operator_raw = '{"weight":1e+02,"escaped":"\\u0061"}'
    host.write_text(
        f'{{"operatorRaw":{operator_raw},"{container}":{{"{legacy.server_id}":{modified_raw}}}}}\n',
        encoding="utf-8",
    )

    with pytest.warns(UserWarning, match=f"preserving modified MCP ID {legacy.server_id}"):
        install(tmp_path, harness, force=force)

    rendered = host.read_text(encoding="utf-8")
    entries = json.loads(rendered)[container]
    assert entries[legacy.server_id] == modified
    assert f"sdlc_cvs_{provider}" in entries
    assert modified_raw in rendered
    assert f'"operatorRaw": {operator_raw}' in rendered


@pytest.mark.parametrize("harness", ["opencode", "pi"])
@pytest.mark.parametrize("provider", ["github", "gitlab", "gitea", "forgejo"])
def test_legacy_cvs_mcp_migration_rolls_back_exact_host_tree(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, harness: str, provider: str
) -> None:
    monkeypatch.setattr(install_module.shutil, "which", lambda name: f"/bin/{name}")
    config = write_cvs_provider_config(tmp_path, provider)
    legacy = recognized_server_intents(config, harness)[0]
    if harness == "opencode":
        host = tmp_path / ".opencode/opencode.json"
        container = "mcp"
        generated = render_opencode_mcp(legacy)
    else:
        write_pinned_pi_adapter(tmp_path)
        host = tmp_path / ".pi/mcp.json"
        container = "mcpServers"
        generated = render_pi_mcp(legacy)
    host.parent.mkdir(parents=True, exist_ok=True)
    host.write_text(
        json.dumps({container: {legacy.server_id: generated}}) + "\n",
        encoding="utf-8",
    )
    before = _tree_manifest(tmp_path)
    monkeypatch.setattr(
        install_module,
        "_smoke_check",
        lambda _root, **_kwargs: (_ for _ in ()).throw(RuntimeError("injected smoke failure")),
    )
    monkeypatch.setattr(
        install_module,
        "_smoke_check_mcp",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("injected smoke failure")),
    )

    with pytest.raises(RuntimeError, match="injected smoke failure"):
        install(tmp_path, harness)

    assert _tree_manifest(tmp_path) == before


def test_repository_does_not_own_codegraphcontext_tooling() -> None:
    repository = Path(__file__).parents[1]
    mise = tomllib.loads((repository / "mise.toml").read_text(encoding="utf-8"))
    lock = tomllib.loads((repository / "mise.lock").read_text(encoding="utf-8"))

    assert "pipx:codegraphcontext" not in mise["tools"]
    assert "pipx:codegraphcontext" not in lock["tools"]
    assert all("codegraphcontext" not in task for task in mise["tasks"])


def test_install_does_not_probe_or_generate_external_code_index_server(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    probed: list[str] = []

    def record_probe(executable: str) -> None:
        probed.append(executable)
        return None

    monkeypatch.setattr(install_module.shutil, "which", record_probe)

    write_sdlc_code_index_config(tmp_path, enabled=True, mcp_server="operator-index")
    install(tmp_path, "opencode")

    assert "mise" not in probed
    assert "cgc" not in probed
    document = json.loads((tmp_path / ".opencode/opencode.json").read_text(encoding="utf-8"))
    assert "operator-index" not in document["mcp"]
    assert "sdlc-code-index" not in document["mcp"]


@pytest.mark.parametrize("harness", ["opencode", "pi"])
@pytest.mark.parametrize("enabled", [False, True])
@pytest.mark.parametrize("force", [False, True])
@pytest.mark.parametrize("migration", [False, True])
def test_external_code_index_host_entry_is_never_mutated(
    tmp_path: Path, harness: str, enabled: bool, force: bool, migration: bool
) -> None:
    external_value = (
        '{\n      "command": [ "operator-index" ],\n'
        '      "environment": {"OPERATOR_SECRET":"\\u0070reserved"},\n'
        '      "weight": 1e+02\n    }'
    )
    if harness == "opencode":
        host = tmp_path / ".opencode/opencode.json"
        container = "mcp"
        host_content = f'{{"plugin":["operator"],"mcp":{{"sdlc-code-index":{external_value}}}}}\n'
    else:
        host = tmp_path / ".pi/mcp.json"
        container = "mcpServers"
        host_content = f'{{"mcpServers":{{"sdlc-code-index":{external_value}}}}}\n'
        write_pinned_pi_adapter(tmp_path)
    host.parent.mkdir(parents=True, exist_ok=True)
    if harness == "pi":
        host.write_bytes(host_content.replace("\n", "\r\n").encode("utf-8"))
    else:
        host.write_text(host_content, encoding="utf-8")
    external = json.loads(external_value)
    write_sdlc_code_index_config(tmp_path, enabled=enabled)
    if migration:
        write_legacy_commands(tmp_path, harness)

    if migration:
        with pytest.warns(UserWarning, match="Replacing deprecated SDLC command outputs"):
            install(
                tmp_path,
                harness,
                force=force,
                replace_sdlc_command_set=True,
            )
    else:
        install(tmp_path, harness, force=force)

    rendered = host.read_text(encoding="utf-8")
    result = json.loads(rendered)
    assert result[container]["sdlc-code-index"] == external
    assert external_value in rendered


@pytest.mark.parametrize("harness", ["opencode", "pi"])
def test_external_code_index_host_entry_survives_owned_conflict(
    tmp_path: Path, harness: str
) -> None:
    if harness == "opencode":
        host = tmp_path / ".opencode/opencode.json"
        content = b'{"mcp":{"sdlc_cvs_github":null,"sdlc-code-index":{"weight":1e+02}}}\n'
    else:
        write_pinned_pi_adapter(tmp_path)
        host = tmp_path / ".pi/mcp.json"
        content = b'{"mcpServers":{"sdlc_cvs_github":null,"sdlc-code-index":{"weight":1e+02}}}\n'
    host.parent.mkdir(parents=True, exist_ok=True)
    host.write_bytes(content)

    with pytest.raises(FileExistsError, match="sdlc_cvs_github"):
        install(tmp_path, harness)

    assert host.read_bytes() == content


@pytest.mark.parametrize("harness", ["opencode", "pi"])
def test_external_code_index_host_entry_survives_install_rollback(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, harness: str
) -> None:
    if harness == "opencode":
        host = tmp_path / ".opencode/opencode.json"
        content = {"mcp": {"sdlc-code-index": {"command": ["operator-index"]}}}
    else:
        write_pinned_pi_adapter(tmp_path)
        host = tmp_path / ".pi/mcp.json"
        content = {"mcpServers": {"sdlc-code-index": {"command": "operator-index"}}}
    host.parent.mkdir(parents=True, exist_ok=True)
    host.write_text(json.dumps(content) + "\n", encoding="utf-8")
    write_sdlc_code_index_config(tmp_path, enabled=True)
    before = _tree_manifest(tmp_path)
    monkeypatch.setattr(
        install_module,
        "_smoke_check",
        lambda _root, **_kwargs: (_ for _ in ()).throw(RuntimeError("injected smoke failure")),
    )
    monkeypatch.setattr(
        install_module,
        "_smoke_check_mcp",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("injected smoke failure")),
    )

    with pytest.raises(RuntimeError, match="injected smoke failure"):
        install(tmp_path, harness)

    assert _tree_manifest(tmp_path) == before


def test_opencode_plugin_version_conflicts_unless_forced(tmp_path: Path) -> None:
    host = tmp_path / ".opencode/opencode.json"
    host.parent.mkdir(parents=True)
    host.write_text('{"plugin":["operator","@harnessctl/opencode-tools@0.1.4"]}\n')

    with pytest.raises(FileExistsError, match="conflicting harnessctl OpenCode plugin"):
        install(tmp_path, "opencode")

    install(tmp_path, "opencode", force=True)
    document = json.loads(host.read_text(encoding="utf-8"))
    assert document["plugin"] == ["operator", "@harnessctl/opencode-tools@latest"]


def test_opencode_install_removes_exact_legacy_plugin_shim(tmp_path: Path) -> None:
    shim = tmp_path / ".opencode/plugins/harnessctl-memory.js"
    shim.parent.mkdir(parents=True)
    shim.write_text(
        "export { CustomToolsPlugin } from '@harnessctl/opencode-tools';\n",
        encoding="utf-8",
    )

    install(tmp_path, "opencode")

    assert not shim.exists()
    document = json.loads((tmp_path / ".opencode/opencode.json").read_text(encoding="utf-8"))
    assert document["plugin"] == ["@harnessctl/opencode-tools@latest"]


def test_opencode_legacy_plugin_cleanup_rolls_back_on_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    shim = tmp_path / ".opencode/plugins/harnessctl-memory.js"
    shim.parent.mkdir(parents=True)
    legacy = "export { CustomToolsPlugin } from '@harnessctl/opencode-tools';\n"
    shim.write_text(legacy, encoding="utf-8")
    before = _tree_manifest(tmp_path)
    monkeypatch.setattr(
        install_module,
        "_smoke_check",
        lambda _root, **_kwargs: (_ for _ in ()).throw(RuntimeError("injected smoke failure")),
    )

    with pytest.raises(RuntimeError, match="injected smoke failure"):
        install(tmp_path, "opencode")

    assert _tree_manifest(tmp_path) == before


def test_opencode_host_symlink_is_rejected_without_overwriting_referent(
    tmp_path: Path,
) -> None:
    referent = tmp_path / "operator-opencode.json"
    original = b'{"operator":true}\n'
    referent.write_bytes(original)
    host = tmp_path / ".opencode/opencode.json"
    host.parent.mkdir(parents=True)
    host.symlink_to(referent)

    with pytest.raises(ValueError, match="must not contain symlinks"):
        install(tmp_path, "opencode")

    assert host.is_symlink()
    assert referent.read_bytes() == original


def test_opencode_host_ancestor_symlink_is_rejected_without_writing_referent(
    tmp_path: Path,
) -> None:
    referent_directory = tmp_path / "operator-opencode"
    referent_directory.mkdir()
    referent = referent_directory / "opencode.json"
    original = b'{"operator":true}\n'
    referent.write_bytes(original)
    (tmp_path / ".opencode").symlink_to(referent_directory, target_is_directory=True)

    with pytest.raises(ValueError, match="must not contain symlinks"):
        install(tmp_path, "opencode")

    assert referent.read_bytes() == original
    assert sorted(path.name for path in referent_directory.iterdir()) == ["opencode.json"]


def test_local_mcp_is_omitted_when_forgejo_server_is_absent(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    write_project_config(
        tmp_path,
        "cvs:\n  remote:\n    provider: gitea\n"
        "    tools: tea\n    url: https://gitea.example.test\n"
        "    token_env: GITEA_TOKEN\n",
    )
    monkeypatch.setattr(install_module.shutil, "which", lambda _name: None)

    installed = install(tmp_path, "opencode")

    host = tmp_path / ".opencode/opencode.json"
    assert host in installed
    document = json.loads(host.read_text(encoding="utf-8"))
    assert document["plugin"] == ["@harnessctl/opencode-tools@latest"]
    assert "sdlc_cvs_gitea" not in document.get("mcp", {})
    assert "sdlc-code-index" not in document.get("mcp", {})


def test_local_mcp_missing_binary_still_installs_cli_skill(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    write_project_config(
        tmp_path,
        "cvs:\n  remote:\n    provider: forgejo\n"
        "    tools: forgejo-cli\n    url: https://forgejo.example.test\n"
        "    token_env: FORGEJO_TOKEN\n",
    )
    monkeypatch.setattr(install_module.shutil, "which", lambda _name: None)

    installed = install(tmp_path, "opencode")

    skill = tmp_path / ".opencode/skills/sdlc-cvs/SKILL.md"
    assert skill in installed
    assert "- Remote CLI: `forgejo-cli`." in skill.read_text(encoding="utf-8")
    assert "- Remote MCP: unavailable." in skill.read_text(encoding="utf-8")


def test_pi_preinstalled_adapter_is_preserved_and_output_guard_is_merged(
    tmp_path: Path,
) -> None:
    settings = tmp_path / ".pi/settings.json"
    settings.parent.mkdir(parents=True)
    settings_before = (
        b'{"operator":true,"packages":["npm:@harnessctl/pi-tools@latest",'
        b'{"source":"npm:pi-mcp-adapter@2.26.0"}]}\n'
    )
    settings.write_bytes(settings_before)
    host = tmp_path / ".pi/mcp.json"
    host.write_text(
        '{"operator":true,"mcpServers":{"operator":{}},"settings":{"keep":1}}\n',
        encoding="utf-8",
    )

    install(tmp_path, "pi")

    assert settings.read_bytes() == settings_before
    document = json.loads(host.read_text(encoding="utf-8"))
    assert document["operator"] is True
    assert document["mcpServers"]["operator"] == {}
    assert document["settings"]["keep"] == 1
    assert document["settings"]["outputGuard"] == {
        "maxBytes": 51200,
        "maxLines": 2000,
        "detailsMaxBytes": 16384,
    }


@pytest.mark.parametrize(
    ("filtered_source", "package_filter"),
    [
        ("npm:@harnessctl/pi-tools@latest", {"extensions": []}),
        ("npm:@harnessctl/pi-tools@latest", {"autoload": False}),
        ("npm:pi-mcp-adapter@2.26.0", {"extensions": []}),
        ("npm:pi-mcp-adapter@2.26.0", {"autoload": False}),
    ],
)
def test_pi_rejects_disabled_required_package_extensions_before_mutation(
    tmp_path: Path, filtered_source: str, package_filter: dict[str, object]
) -> None:
    settings = tmp_path / ".pi/settings.json"
    settings.parent.mkdir(parents=True)
    packages: list[object] = [
        "npm:@harnessctl/pi-tools@latest",
        "npm:pi-mcp-adapter@2.26.0",
    ]
    packages[packages.index(filtered_source)] = {
        "source": filtered_source,
        **package_filter,
    }
    settings.write_text(json.dumps({"packages": packages}) + "\n", encoding="utf-8")
    before = _tree_manifest(tmp_path)

    with pytest.raises(ValueError, match="must load all extensions"):
        install(tmp_path, "pi")

    assert _tree_manifest(tmp_path) == before


def test_pi_missing_adapter_without_opt_in_has_no_project_mutation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    before = _tree_manifest(tmp_path)
    monkeypatch.setattr(
        install_module.shutil,
        "which",
        lambda name: _mock_pi_path() if name == "pi" else None,
    )

    with pytest.raises(RuntimeError, match="allow-pi-package-install"):
        install(tmp_path, "pi")

    assert _tree_manifest(tmp_path) == before


def test_pi_host_symlink_fails_before_package_mutation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    referent = tmp_path / "operator-pi-mcp.json"
    original = b'{"operator":true}\n'
    referent.write_bytes(original)
    host = tmp_path / ".pi/mcp.json"
    host.parent.mkdir(parents=True)
    host.symlink_to(referent)
    monkeypatch.setattr(
        install_module.shutil,
        "which",
        lambda name: _mock_pi_path() if name == "pi" else None,
    )
    monkeypatch.setattr(
        install_module.subprocess,
        "run",
        lambda *_args, **_kwargs: pytest.fail("Pi package mutation preceded host preflight"),
    )

    with pytest.raises(ValueError, match="must not contain symlinks"):
        install(tmp_path, "pi", allow_pi_mcp_adapter_install=True)

    assert host.is_symlink()
    assert referent.read_bytes() == original


def test_pi_owned_file_conflict_fails_before_package_mutation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    command = tmp_path / ".pi/prompts/work-new.md"
    command.parent.mkdir(parents=True)
    command.write_bytes(b"operator command")
    before = _tree_manifest(tmp_path)
    monkeypatch.setattr(
        install_module.shutil,
        "which",
        lambda name: _mock_pi_path() if name == "pi" else None,
    )
    monkeypatch.setattr(
        install_module.subprocess,
        "run",
        lambda *_args, **_kwargs: pytest.fail("Pi package mutation preceded conflict checks"),
    )

    with pytest.raises(FileExistsError, match="work-new.md"):
        install(tmp_path, "pi", allow_pi_mcp_adapter_install=True)

    assert _tree_manifest(tmp_path) == before


def test_pi_noninteractive_opt_in_installs_exact_pin_before_project_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(
        install_module.shutil,
        "which",
        lambda name: _mock_pi_path() if name == "pi" else None,
    )

    def fake_run(args: list[str], **kwargs: object) -> SimpleNamespace:
        calls.append(args)
        assert not (tmp_path / ".pi/mcp.json").exists()
        settings = tmp_path / ".pi/settings.json"
        settings.parent.mkdir(parents=True, exist_ok=True)
        packages = [
            "npm:@harnessctl/pi-tools@latest",
            *(["npm:pi-mcp-adapter@2.26.0"] if "pi-mcp-adapter" in args[3] else []),
        ]
        settings.write_text(json.dumps({"packages": packages}) + "\n", encoding="utf-8")
        assert kwargs["cwd"] == tmp_path.resolve()
        assert kwargs["shell"] is False
        return SimpleNamespace(returncode=0, stdout=b"", stderr=b"")

    monkeypatch.setattr(install_module.subprocess, "run", fake_run)

    install(tmp_path, "pi", allow_pi_package_install=True)

    assert calls == [
        [
            _mock_pi_path(),
            "install",
            "-l",
            "npm:@harnessctl/pi-tools@latest",
            "--approve",
        ],
        [
            _mock_pi_path(),
            "install",
            "-l",
            "npm:pi-mcp-adapter@2.26.0",
            "--approve",
        ],
    ]
    assert (tmp_path / ".pi/mcp.json").is_file()


def test_pi_failure_removes_transaction_adapter_and_restores_exact_tree(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    marker = tmp_path / ".pi/settings.json"
    marker.parent.mkdir(parents=True)
    marker.write_bytes(b'{"operator":true}\n')
    before = _tree_manifest(tmp_path)
    actions: list[str] = []
    monkeypatch.setattr(
        install_module.shutil,
        "which",
        lambda name: _mock_pi_path() if name == "pi" else None,
    )

    def fake_run(args: list[str], **_kwargs: object) -> SimpleNamespace:
        action = args[1]
        actions.append(action)
        source = args[3]
        current = json.loads(marker.read_text(encoding="utf-8")).get("packages", [])
        if action == "install" and source not in current:
            current.append(source)
        elif action == "remove" and source in current:
            current.remove(source)
        marker.write_text(json.dumps({"packages": current}) + "\n", encoding="utf-8")
        return SimpleNamespace(returncode=0, stdout=b"", stderr=b"")

    monkeypatch.setattr(install_module.subprocess, "run", fake_run)
    monkeypatch.setattr(
        install_module,
        "_smoke_check_mcp",
        lambda *_args: (_ for _ in ()).throw(RuntimeError("injected MCP smoke failure")),
    )

    with pytest.raises(BaseExceptionGroup, match="rollback was incomplete"):
        install(tmp_path, "pi", allow_pi_mcp_adapter_install=True)

    assert actions == ["install", "install", "remove", "remove"]
    assert _tree_manifest(tmp_path) == before


def test_pi_rollback_uses_before_images_captured_before_package_mutation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = tmp_path / ".pi/settings.json"
    settings.parent.mkdir(parents=True)
    settings.write_bytes(b'{"operator":true}\n')
    owned_command = tmp_path / ".pi/prompts/work-build.md"
    owned_command.parent.mkdir(parents=True)
    owned_command.write_bytes(b"operator command\x00")
    before = _tree_manifest(tmp_path)
    actions: list[str] = []
    monkeypatch.setattr(
        install_module.shutil,
        "which",
        lambda name: _mock_pi_path() if name == "pi" else None,
    )

    def fake_run(args: list[str], **_kwargs: object) -> SimpleNamespace:
        action = args[1]
        actions.append(action)
        owned_command.write_text(f"package {action}", encoding="utf-8")
        source = args[3]
        current = json.loads(settings.read_text(encoding="utf-8")).get("packages", [])
        if action == "install" and source not in current:
            current.append(source)
        elif action == "remove" and source in current:
            current.remove(source)
        packages = current
        settings.write_text(json.dumps({"packages": packages}), encoding="utf-8")
        return SimpleNamespace(returncode=0, stdout=b"", stderr=b"")

    monkeypatch.setattr(install_module.subprocess, "run", fake_run)
    monkeypatch.setattr(
        install_module,
        "_smoke_check_mcp",
        lambda *_args: (_ for _ in ()).throw(RuntimeError("injected late failure")),
    )

    with pytest.raises(BaseExceptionGroup, match="rollback was incomplete"):
        install(tmp_path, "pi", force=True, allow_pi_mcp_adapter_install=True)

    assert actions == ["install", "install", "remove", "remove"]
    assert _tree_manifest(tmp_path) == before


def test_pi_launcher_uses_direct_vectors_and_safe_windows_cmd(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    direct, shell = install_module._pi_invocation("/opt/pi", "install", windows=False)
    assert direct == [
        "/opt/pi",
        "install",
        "-l",
        "npm:pi-mcp-adapter@2.26.0",
        "--approve",
    ]
    assert shell is False
    exe, shell = install_module._pi_invocation("C:/Pi/pi.exe", "remove", windows=True)
    assert exe == [
        "C:/Pi/pi.exe",
        "remove",
        "-l",
        "npm:pi-mcp-adapter@2.26.0",
        "--approve",
    ]
    assert shell is False
    monkeypatch.setattr(
        install_module.shutil,
        "which",
        lambda name: "C:/Windows/System32/cmd.exe" if name == "cmd.exe" else None,
    )
    shim, shell = install_module._pi_invocation("C:/Pi/pi.cmd", "install", windows=True)
    assert shim[:4] == ["C:/Windows/System32/cmd.exe", "/d", "/s", "/c"]
    assert shim[4] == '"C:/Pi/pi.cmd" install -l npm:pi-mcp-adapter@2.26.0 --approve'
    assert shell is False


@pytest.mark.parametrize(
    "unsafe",
    ["C:/bad%name/pi.cmd", "C:/bad&name/pi.bat", 'C:/bad"name/pi.cmd'],
)
def test_pi_launcher_rejects_unsafe_windows_shim_path(unsafe: str) -> None:
    with pytest.raises(RuntimeError, match="unsafe Windows Pi shim path"):
        install_module._pi_invocation(unsafe, "install", windows=True)
