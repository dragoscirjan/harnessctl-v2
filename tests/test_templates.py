from copy import deepcopy
from pathlib import Path

import pytest

import harnessctl.templates as template_module
from harnessctl.config import DEFAULT_CONFIG
from harnessctl.templates import (
    COMMAND_METADATA,
    DESCRIPTIONS,
    PHASES,
    SKILL_RESOURCE_TEMPLATES,
    TEMPLATES,
    render_prompt,
    render_skill,
    render_skill_resources,
)

COMMANDS = ("work-plan", "work-build", "work-verify", "work-release", "work-continue")
RETIRED_COMMANDS = (
    "work-new",
    "work-explore",
    "work-resume",
    "work-start-initiative",
    "work-start-epic",
    "work-start-from",
    "work-write-stories",
    "work-start-story",
    "work-design-doc",
    "work-hld",
    "work-lld",
    "work-write-tasks",
    "work-implement",
    "work-review",
    "work-cvs",
    "work-finish",
)
OLD_MEMORY_ENABLED_BYTES = {
    "work-plan": 13_805,
    "work-build": 11_139,
    "work-verify": 12_621,
    "work-release": 10_324,
    "work-continue": 9_729,
}
PHASE_RESOURCE = {
    "work-plan": "references/plan.md",
    "work-build": "references/build.md",
    "work-verify": "references/verify.md",
    "work-release": "references/release.md",
    "work-continue": "references/continue.md",
}
SDLC_CODE_REFERENCES = {
    "cpp",
    "cs",
    "css",
    "ex",
    "fish",
    "gdscript",
    "go",
    "html",
    "java",
    "js",
    "json",
    "jsx",
    "lua",
    "md",
    "ps1",
    "py",
    "rs",
    "sh",
    "svelte",
    "swift",
    "tf",
    "ts",
    "tsx",
    "vue",
    "yaml",
    "zig",
}


def _memory_config() -> dict[str, object]:
    config = deepcopy(DEFAULT_CONFIG)
    config["memory"]["enabled"] = True
    config["memory"]["retrieval"]["limit"] = 3
    config["memory"]["retrieval"]["max_chars"] = 2048
    return config


def _sdlc_context(
    *,
    memory_enabled: bool = True,
    tdd_enabled: bool = False,
    code_index_enabled: bool = True,
) -> dict[str, object]:
    return {
        "memory_hooks_enabled": memory_enabled,
        "retrieval_limit": 3,
        "retrieval_max_chars": 2048,
        "tdd_enabled": tdd_enabled,
        "code_index_enabled": code_index_enabled,
    }


def _words(value: str) -> int:
    return len(value.split())


def test_registry_defines_only_five_epic_first_commands() -> None:
    assert tuple(TEMPLATES) == COMMANDS
    assert tuple(COMMAND_METADATA) == COMMANDS
    assert tuple(DESCRIPTIONS) == COMMANDS
    assert PHASES == ("plan", "build", "verify", "release")

    root = Path(__file__).parents[1] / "src/harnessctl/templates/sdlc"
    sources = tuple(path.stem.removesuffix(".md") for path in sorted(root.glob("work-*.md.j2")))
    assert sources == tuple(sorted(COMMANDS))
    assert not tuple((root / "_partials").glob("*.j2"))


@pytest.mark.parametrize("command", RETIRED_COMMANDS)
def test_retired_commands_are_not_renderable(command: str) -> None:
    with pytest.raises(ValueError, match=f"unsupported command: {command}"):
        render_prompt(command, "opencode")


@pytest.mark.parametrize("harness", ("opencode", "pi"))
@pytest.mark.parametrize("command", COMMANDS)
def test_command_shells_are_compact_and_progressively_disclosed(command: str, harness: str) -> None:
    rendered = render_prompt(command, harness, config=_memory_config())
    body = rendered.split("---\n", 2)[-1] if harness == "opencode" else rendered

    assert _words(body) <= 140
    assert len(body.encode()) <= 900
    assert "Activate `sdlc`" in body
    assert PHASE_RESOURCE[command] in body
    assert "Return compact SDLC result" in body
    assert "{%" not in rendered
    assert "{{" not in rendered


@pytest.mark.parametrize("command", COMMANDS)
def test_command_shells_are_at_least_eighty_percent_smaller(command: str) -> None:
    rendered = render_prompt(command, "opencode", config=_memory_config())
    assert len(rendered.encode()) <= OLD_MEMORY_ENABLED_BYTES[command] * 0.2


def test_sdlc_skill_resource_registry_is_complete_and_bounded() -> None:
    resources = render_skill_resources("sdlc", **_sdlc_context())

    assert set(resources) == set(SKILL_RESOURCE_TEMPLATES["sdlc"])
    assert len(resources) == 13
    assert all(path.startswith("references/") and path.endswith(".md") for path in resources)
    assert all(content.endswith("\n") for content in resources.values())
    assert all("{%" not in content and "{{" not in content for content in resources.values())
    assert all(
        _words(content) <= (550 if path in PHASE_RESOURCE.values() else 350)
        for path, content in resources.items()
    )
    assert all(
        len(content.encode()) <= (4000 if path in PHASE_RESOURCE.values() else 2600)
        for path, content in resources.items()
    )


def test_sdlc_code_skill_and_resource_registry_are_complete() -> None:
    skill = render_skill("sdlc-code")
    resources = render_skill_resources("sdlc-code")
    expected = {f"references/{name}.md" for name in SDLC_CODE_REFERENCES}

    assert set(resources) == expected == set(SKILL_RESOURCE_TEMPLATES["sdlc-code"])
    assert all(content.endswith("\n") for content in (skill, *resources.values()))
    assert all(
        "{%" not in content and "{{" not in content for content in (skill, *resources.values())
    )
    assert "Apply this root once" in skill
    assert "explicit repository policy and the approved task" in skill
    assert "Treat named tools as alternatives" in skill
    assert "Do not classify ambiguous `.h` or `.sh` files" in skill
    assert "JSX syntax alone does not prove React" in skill
    assert "`.gd`: read `gdscript.md`" in skill
    assert "All 26 bundled subjects map one-to-one" in skill


def test_sdlc_code_references_preserve_contextual_dispatch_rules() -> None:
    resources = render_skill_resources("sdlc-code")

    assert "pyproject.toml" in resources["references/py.md"]
    assert "GDScript is a distinct language, not Python" in resources["references/gdscript.md"]
    assert "project.godot" in resources["references/gdscript.md"]
    assert "supported Godot version" in resources["references/gdscript.md"]
    assert "A `.h` extension alone is insufficient" in resources["references/cpp.md"]
    assert "A `.sh` extension does not prove Bash" in resources["references/sh.md"]
    assert "repository evidence establishes React" in resources["references/tsx.md"]
    for framework in ("vue", "svelte"):
        assert "script" in resources[f"references/{framework}.md"]
        assert "TypeScript" in resources[f"references/{framework}.md"]
    artifact_exclusions = {
        "md": "Code-oriented class and architecture rules do not apply.",
        "json": "Do not apply class, interface, or dependency-injection guidance.",
        "yaml": "Do not apply class, interface, or dependency-injection guidance",
    }
    for artifact, exclusion in artifact_exclusions.items():
        assert exclusion in resources[f"references/{artifact}.md"]


@pytest.mark.parametrize(
    "unsafe",
    (
        "/references/plan.md",
        "../plan.md",
        "references\\plan.md",
        "plan.md",
        "references/../plan.md",
    ),
)
def test_skill_resource_paths_reject_unsafe_names(
    monkeypatch: pytest.MonkeyPatch, unsafe: str
) -> None:
    monkeypatch.setitem(template_module.SKILL_RESOURCE_TEMPLATES, "bad", {unsafe: "x"})
    with pytest.raises(ValueError, match="unsafe skill resource path"):
        render_skill_resources("bad")


def test_skill_resource_paths_reject_portable_collisions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setitem(
        template_module.SKILL_RESOURCE_TEMPLATES,
        "bad",
        {"references/Plan.md": "x", "references/plan.md": "y"},
    )
    with pytest.raises(ValueError, match="duplicate portable skill resource path"):
        render_skill_resources("bad")


def test_core_skill_preserves_universal_invariants_and_budget() -> None:
    skill = render_skill("sdlc", **_sdlc_context())
    normalized = " ".join(skill.split())

    assert _words(skill) <= 400
    assert len(skill.encode()) <= 2800
    for phrase in (
        "exactly one authoritative, non-archived Epic",
        "issues/specs/source/Git/tests/provider observations > memory",
        "**Required**, **Recommended**, **Optional**, or **Not needed**",
        "Remote and destructive actions need fresh action-specific consent",
        "switch route after attempted mutation",
        "Execute only this command's phase",
        "When `sdlc-code-index` is available",
        "relationship-aware codebase retrieval or impact analysis is relevant",
        "continue with direct source discovery, Glob, Grep, and file reads",
    ):
        assert phrase in normalized
    for field in ("Epic:", "Phase:", "Done:", "Evidence:", "Next:", "Blockers:", "Checkpoint:"):
        assert field in skill


def test_core_skill_does_not_load_retained_code_index_when_disabled() -> None:
    skill = render_skill("sdlc", **_sdlc_context(code_index_enabled=False))
    normalized = " ".join(skill.split())

    assert "`sdlc-code-index` is disabled" in normalized
    assert "Do not load a discoverable retained copy" in normalized
    assert "continue with direct source discovery, Glob, Grep, and file reads" in normalized
    assert "When `sdlc-code-index` is available" not in normalized


@pytest.mark.parametrize("command", COMMANDS)
def test_typical_command_core_and_phase_meet_aggregate_budget(command: str) -> None:
    shell = render_prompt(command, "pi", config=_memory_config())
    core = render_skill("sdlc", **_sdlc_context())
    phase = render_skill_resources("sdlc", **_sdlc_context())[PHASE_RESOURCE[command]]
    combined = shell + core + phase
    assert _words(combined) <= 1050
    assert len(combined.encode()) <= 7500


def test_conditional_policy_stays_out_of_normal_phase_references() -> None:
    resources = render_skill_resources("sdlc", **_sdlc_context())
    cases = (
        ("references/plan.md", "references/plan-initiative.md", "one Epic is insufficient"),
        ("references/build.md", "references/build-yolo.md", "one-time Epic-scoped consent"),
        (
            "references/verify.md",
            "references/verify-defects.md",
            "provider-discoverable non-archived",
        ),
        ("references/release.md", "references/release-deploy.md", "repository-owned workflow"),
        ("references/continue.md", "references/continue-reconcile.md", "Never choose by timestamp"),
    )
    for normal, conditional, marker in cases:
        assert marker not in resources[normal]
        assert marker in resources[conditional]


def test_checkpoint_reference_compiles_memory_policy_by_configuration() -> None:
    enabled = render_skill_resources("sdlc", **_sdlc_context())["references/checkpoint.md"]
    disabled = render_skill_resources("sdlc", **_sdlc_context(memory_enabled=False))[
        "references/checkpoint.md"
    ]

    assert "limit 3, 2048 chars" in enabled
    assert "memory_store" in enabled
    assert "memory_supersede" in enabled
    assert "Memory checkpoint unavailable" not in enabled
    assert "Memory checkpoint unavailable" in disabled
    assert "memory_store" not in disabled


def test_build_reference_compiles_tdd_policy_by_configuration() -> None:
    enabled = render_skill_resources("sdlc", **_sdlc_context(tdd_enabled=True))[
        "references/build.md"
    ]
    disabled = render_skill_resources("sdlc", **_sdlc_context(tdd_enabled=False))[
        "references/build.md"
    ]

    assert "Load `develop-tdd` before implementation" in enabled
    assert "Red, Green, and Refactor" in enabled
    assert "Load `sdlc-code` before implementation" in enabled
    assert "Load `sdlc-code` before implementation" in disabled
    assert "develop-tdd" not in disabled
    assert "Red, Green, and Refactor" not in disabled


def test_continue_reference_delegates_build_resume_to_current_build_policy() -> None:
    enabled = render_skill_resources("sdlc", **_sdlc_context(tdd_enabled=True))[
        "references/continue.md"
    ]
    disabled = render_skill_resources("sdlc", **_sdlc_context(tdd_enabled=False))[
        "references/continue.md"
    ]

    for rendered in (enabled, disabled):
        assert "load `references/build.md` before implementation" in rendered
        assert "compiled coding and optional TDD rules" in rendered
        assert "non-Build resumes" in rendered
        assert "develop-tdd" not in rendered
        assert "sdlc-code" not in rendered
        for phase in ("plan", "verify", "release"):
            assert f"references/{phase}.md" not in rendered


def test_develop_tdd_skill_preserves_canonical_cycle_and_rules() -> None:
    skill = render_skill("develop-tdd")

    for phrase in (
        "Red-Green-Refactor",
        "Write failing tests first",
        "fail for the **right reason**",
        "minimum code",
        "No behavior changes",
        "one test (or a small batch)",
    ):
        assert phrase in skill


def test_sdlc_code_index_skill_preserves_retrieval_and_authority_boundaries() -> None:
    skill = render_skill("sdlc-code-index", mcp_server="operator-index")

    for phrase in (
        "Configured MCP server: `operator-index`",
        "advisory retrieval evidence, never source authority",
        "missing, stale, incomplete, or unsuitable",
        "Glob for file discovery and Grep for exact text search",
        "Read the source files",
        "Never invent tool names, parameters, or response fields",
        "operator owns installation, setup, startup, indexing, watching",
        "models, credentials, storage, data, and removal",
        "Do not invoke mutation or deletion operations",
    ):
        assert phrase in skill
    for provider in ("CodeGraphContext", "GitNexus", "Graphify"):
        assert provider not in skill
    assert "{{" not in skill


def test_phase_references_preserve_rare_but_required_boundaries() -> None:
    resources = render_skill_resources("sdlc", **_sdlc_context())
    all_text = " ".join(resources.values())
    for phrase in (
        "work-plan <epic-id>",
        "work-build <epic-id>",
        "work-verify",
        "one canonical Bug per occurrence",
        "Never auto-merge",
        "at most five unfinished Epic workflows",
        "Never execute next step or combine phases",
    ):
        assert phrase in all_text
