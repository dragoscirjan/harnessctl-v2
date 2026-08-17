import importlib
from copy import deepcopy
from pathlib import Path

import pytest

from harnessctl.config import DEFAULT_CONFIG, ConfigError, load_config
from harnessctl.install import install
from harnessctl.templates import (
    COMMAND_METADATA,
    TEMPLATES,
    render_prompt,
    render_skill,
    render_work_new,
)

install_module = importlib.import_module("harnessctl.install")


def _tree_manifest(root: Path) -> dict[str, tuple[str, bytes | None]]:
    return {
        path.relative_to(root).as_posix(): (
            "directory" if path.is_dir() else "file",
            None if path.is_dir() else path.read_bytes(),
        )
        for path in sorted(root.rglob("*"))
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


def test_rendered_prompts_share_the_canonical_body() -> None:
    opencode = render_work_new("opencode")
    pi = render_work_new("pi")

    assert "description: Start a human-guided work intake" in opencode
    assert "description: Start a human-guided work intake" not in pi
    assert opencode.endswith(pi)
    assert "{{" not in pi
    assert "No files were created or modified." in pi


@pytest.mark.parametrize("command", ["work-new", "work-explore", "work-plan"])
def test_enabled_memory_does_not_claim_that_no_files_changed(command: str) -> None:
    config = deepcopy(DEFAULT_CONFIG)
    config["memory"]["enabled"] = True

    rendered = render_prompt(command, "opencode", config=config)

    assert "No files were created or modified." not in rendered
    assert (
        "No source, issue, specification, or task artifact files were created or modified."
        in rendered
    )


def test_memory_entry_prefers_entity_topic_before_default() -> None:
    config = deepcopy(DEFAULT_CONFIG)
    config["memory"]["enabled"] = True

    rendered = render_prompt("work-explore", "opencode", config=config)
    normalized = " ".join(rendered.split())

    assert "current entity-specific topic when known" in normalized
    assert "otherwise fall back to `general`" in normalized


def test_install_all_creates_project_local_targets(tmp_path: Path) -> None:
    installed = install(tmp_path, "all")

    assert len(installed) == len(TEMPLATES) * 2 + 2
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

    with pytest.raises(FileExistsError) as error:
        install(tmp_path, "all")

    normalized_error = str(error.value).replace("\\", "/")
    assert ".opencode/commands/work-new.md" in normalized_error
    assert ".pi/commands/work-new.md" in normalized_error
    assert ".opencode/commands/work-plan.md" in normalized_error


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


@pytest.mark.parametrize(
    ("provider", "tools", "url", "token_env", "normalized"),
    [
        ("github", " gh ", "https://github.com", "GH_TOKEN", "gh"),
        ("gitlab", " glab ", "https://gitlab.com", "GITLAB_TOKEN", "glab"),
        ("gitea", " tea ", "https://gitea.example.com/api", "GITEA_TOKEN", "tea"),
        (
            "forgejo",
            " forgejo-cli ",
            "http://forgejo.example.com",
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
        ("gitlab", "https://gitlab.com", "GH_TOKEN", r"remote\.token_env"),
        ("gitea", "gitea.example.com", "GITEA_TOKEN", r"remote\.url"),
        ("gitea", "https://gitea.example.com:abc", "GITEA_TOKEN", r"remote\.url"),
        ("gitea", "https://[bad", "GITEA_TOKEN", r"remote\.url"),
        ("gitea", "https://user:secret@gitea.example.com", "GITEA_TOKEN", r"remote\.url"),
        ("gitea", "https://gitea.example.com/`injected`", "GITEA_TOKEN", r"remote\.url"),
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
    assert len(COMMAND_METADATA) == 18
    assert COMMAND_METADATA.keys() == TEMPLATES.keys()


def test_memory_disabled_and_pi_prompts_compile_memory_out() -> None:
    enabled_config = deepcopy(DEFAULT_CONFIG)
    enabled_config["memory"]["enabled"] = True

    for command in TEMPLATES:
        disabled = render_prompt(command, "opencode")
        pi = render_prompt(command, "pi", config=enabled_config)
        for rendered in (disabled, pi):
            assert "memory" not in rendered.lower()
            assert "{{" not in rendered
            assert "{%" not in rendered


def test_enabled_opencode_prompts_have_bounded_shared_memory_hooks() -> None:
    enabled_config = deepcopy(DEFAULT_CONFIG)
    enabled_config["memory"]["enabled"] = True
    enabled_config["memory"]["retrieval"]["limit"] = 3
    enabled_config["memory"]["retrieval"]["max_chars"] = 2048
    priority_commands = {
        "work-resume",
        "work-start-from",
        "work-explore",
        "work-plan",
        "work-hld",
        "work-lld",
        "work-implement",
        "work-verify",
    }

    searched_commands = set()
    for command in TEMPLATES:
        rendered = render_prompt(command, "opencode", config=enabled_config)
        assert rendered.count("## Project memory boundary") == 1
        assert rendered.count("## Project memory exit") == 1
        assert "authoritative and override" in rendered
        assert "provenance" in rendered
        assert "minimum tokens" in rendered
        assert "full technical" in rendered
        assert "never establishes completion" in rendered
        if "`memory_search`" in rendered:
            searched_commands.add(command)
            normalized = " ".join(rendered.split())
            assert rendered.count("`memory_search`") == 1
            assert "limit 3" in rendered
            assert "maximum 2048 returned characters" in normalized
            assert "call `memory_get` only" in rendered

    assert searched_commands == priority_commands


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

    assert len(list((tmp_path / ".opencode/commands").glob("*.md"))) == 18
    for command in TEMPLATES:
        rendered = (tmp_path / f".opencode/commands/{command}.md").read_text(encoding="utf-8")
        assert rendered.count("## Project memory boundary") == 1
        assert rendered.count("## Project memory exit") == 1
    assert tmp_path / ".opencode/skills/caveman/SKILL.md" in installed
    assert tmp_path / ".opencode/skills/memory/SKILL.md" in installed
    assert "@harnessctl/opencode-tools" in (tmp_path / ".opencode/package.json").read_text()
    assert (tmp_path / ".opencode/plugins/harnessctl-memory.js").exists()
    assert (tmp_path / ".harnessctl/memory/facts").is_dir()
    assert "/.harnessctl/cache/" in (tmp_path / ".gitignore").read_text()
    assert not (tmp_path / ".harnessctl/cache/harnessctl.sqlite").exists()


def test_install_disabled_memory_compiles_out_integration(tmp_path: Path) -> None:
    installed = install(tmp_path, "opencode")

    assert len(installed) == 20
    for command in TEMPLATES:
        rendered = (tmp_path / f".opencode/commands/{command}.md").read_text(encoding="utf-8")
        assert "memory_" not in rendered
        assert "Project memory" not in rendered
    assert (tmp_path / ".opencode/skills/caveman/SKILL.md").is_file()
    assert not (tmp_path / ".opencode/skills/memory").exists()
    assert not (tmp_path / ".opencode/plugins").exists()
    assert not (tmp_path / ".opencode/package.json").exists()


@pytest.mark.parametrize("harness", ["pi", "all"])
def test_install_rejects_unverified_pi_memory_distribution(tmp_path: Path, harness: str) -> None:
    _write_enabled_memory_config(tmp_path)
    marker = tmp_path / ".pi/existing.txt"
    marker.parent.mkdir(parents=True)
    marker.write_text("preserve", encoding="utf-8")
    before = _tree_manifest(tmp_path)

    with pytest.raises(
        RuntimeError,
        match="automatic Pi extension and skill installation is not yet verified",
    ):
        install(tmp_path, harness)

    assert _tree_manifest(tmp_path) == before
    assert marker.read_text(encoding="utf-8") == "preserve"
    assert not (tmp_path / ".opencode").exists()


def test_install_reports_command_and_skill_conflicts_before_writes(tmp_path: Path) -> None:
    _write_enabled_memory_config(tmp_path)
    command = tmp_path / ".opencode/commands/work-new.md"
    skill = tmp_path / ".opencode/skills/memory/SKILL.md"
    command.parent.mkdir(parents=True)
    skill.parent.mkdir(parents=True)
    command.write_text("custom command", encoding="utf-8")
    skill.write_text("custom skill", encoding="utf-8")
    before = _tree_manifest(tmp_path)

    with pytest.raises(FileExistsError) as error:
        install(tmp_path, "opencode")

    assert _tree_manifest(tmp_path) == before
    message = str(error.value).replace("\\", "/")
    assert ".opencode/commands/work-new.md" in message
    assert ".opencode/skills/memory/SKILL.md" in message


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
