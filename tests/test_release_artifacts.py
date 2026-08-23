from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMMAND_COUNT = 5
CURRENT_COMMANDS = {
    "work-plan",
    "work-build",
    "work-verify",
    "work-release",
    "work-continue",
}


def _run(
    command: list[str],
    *,
    cwd: Path,
    env: dict[str, str],
    expected_returncode: int = 0,
) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        command,
        cwd=cwd,
        env=env,
        text=True,
        capture_output=True,
        check=False,
        timeout=60,
    )
    assert result.returncode == expected_returncode, result.stdout + result.stderr
    return result


def _write_enabled_config(project: Path) -> None:
    config = project / ".harnessctl/config.yaml"
    config.parent.mkdir(parents=True)
    config.write_text(
        "memory:\n  enabled: true\n"
        "skills:\n  sdlc-code-index:\n    enabled: true\n"
        "    mcp_server: operator-index\n",
        encoding="utf-8",
    )


def _write_remote_config(project: Path) -> None:
    config = project / ".harnessctl/config.yaml"
    config.parent.mkdir(parents=True)
    config.write_text(
        "version: 2\nissues:\n  type: github\n  tools: gh\n"
        "  remote:\n    url: https://github.com\n    token_env: GH_TOKEN\n",
        encoding="utf-8",
    )


def _write_pi_adapter_config(project: Path) -> None:
    settings = project / ".pi/settings.json"
    settings.parent.mkdir(parents=True)
    settings.write_text(
        '{"packages":["npm:@harnessctl/pi-tools@latest","npm:pi-mcp-adapter@2.26.0"]}\n',
        encoding="utf-8",
    )


def _copy_runtime_dependency(package: str, site_packages: Path) -> None:
    spec = importlib.util.find_spec(package)
    assert spec is not None and spec.submodule_search_locations
    source = Path(next(iter(spec.submodule_search_locations)))
    shutil.copytree(source, site_packages / package)


def test_pi_tools_package_declares_loadable_extension() -> None:
    package = json.loads((ROOT / "extensions/pi-tools/package.json").read_text(encoding="utf-8"))

    assert package["pi"]["extensions"] == ["./dist/index.js"]
    assert "dist" in package["files"]


def test_release_archives_and_isolated_wheel_install(tmp_path: Path) -> None:
    source = tmp_path / "source"
    source.mkdir()
    shutil.copy2(ROOT / "pyproject.toml", source / "pyproject.toml")
    shutil.copytree(
        ROOT / "src",
        source / "src",
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
    )
    artifacts = tmp_path / "artifacts"
    artifacts.mkdir()
    environment = os.environ.copy()
    environment.update(
        {
            "PIP_NO_INDEX": "1",
            "PYTHONPATH": "",
            "UV_OFFLINE": "1",
            "UV_NO_PROGRESS": "1",
        }
    )

    _run(
        [
            "uv",
            "build",
            "--offline",
            "--no-create-gitignore",
            "--out-dir",
            str(artifacts),
            str(source),
        ],
        cwd=tmp_path,
        env=environment,
    )
    outputs = sorted(path for path in artifacts.iterdir() if path.is_file())
    wheels = [path for path in outputs if path.suffix == ".whl"]
    sdists = [path for path in outputs if path.name.endswith(".tar.gz")]
    assert len(outputs) == 2
    assert len(wheels) == 1
    assert len(sdists) == 1

    package_root = source / "src/harnessctl"
    expected_resources = {
        path.relative_to(package_root).as_posix()
        for path in package_root.rglob("*")
        if path.is_file() and path.suffix in {".py", ".j2"}
    }
    assert "templates/skills/sdlc/SKILL.md.j2" in expected_resources
    assert (
        len(
            {
                path
                for path in expected_resources
                if path.startswith("templates/skills/sdlc/references/") and path.endswith(".md.j2")
            }
        )
        == 13
    )
    assert "templates/skills/sdlc-code/SKILL.md.j2" in expected_resources
    assert (
        len(
            {
                path
                for path in expected_resources
                if path.startswith("templates/skills/sdlc-code/references/")
                and path.endswith(".md.j2")
            }
        )
        == 26
    )
    assert "templates/skills/issue-tracking/SKILL.md.j2" in expected_resources
    assert "templates/skills/cvs/SKILL.md.j2" in expected_resources
    assert "templates/skills/develop-tdd/SKILL.md.j2" in expected_resources
    assert "templates/skills/sdlc-code-index/SKILL.md.j2" in expected_resources
    assert "mcp.py" in expected_resources

    with zipfile.ZipFile(wheels[0]) as archive:
        wheel_members = set(archive.namelist())
        metadata_name = next(name for name in wheel_members if name.endswith(".dist-info/METADATA"))
        assert "Version: 0.2.0" in archive.read(metadata_name).decode("utf-8")
    assert {f"harnessctl/{path}" for path in expected_resources} <= wheel_members

    with tarfile.open(sdists[0], mode="r:gz") as archive:
        sdist_members = set(archive.getnames())
        pyproject_name = next(name for name in sdist_members if name.endswith("/pyproject.toml"))
        assert 'version = "0.2.0"' in archive.extractfile(pyproject_name).read().decode("utf-8")
    sdist_package_members = {
        member.split("/src/harnessctl/", maxsplit=1)[1]
        for member in sdist_members
        if "/src/harnessctl/" in member
    }
    assert expected_resources <= sdist_package_members
    public_templates = {
        Path(path).stem.removesuffix(".md")
        for path in expected_resources
        if path.startswith("templates/sdlc/work-") and path.endswith(".md.j2")
    }
    assert public_templates == CURRENT_COMMANDS
    protected_fragments = ("/.opencode/", "/.pi/", "/.harnessctl/")
    assert not any(
        fragment in f"/{member}/"
        for member in wheel_members | sdist_members
        for fragment in protected_fragments
    )

    virtual_environment = tmp_path / "venv"
    _run(
        [
            "uv",
            "venv",
            "--python",
            sys.executable,
            "--no-project",
            str(virtual_environment),
        ],
        cwd=tmp_path,
        env=environment,
    )
    python = virtual_environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    site_packages = Path(
        _run(
            [
                str(python),
                "-c",
                "import sysconfig; print(sysconfig.get_paths()['purelib'])",
            ],
            cwd=tmp_path,
            env=environment,
        ).stdout.strip()
    )
    for dependency in ("jinja2", "markupsafe", "yaml"):
        _copy_runtime_dependency(dependency, site_packages)
    _run(
        [
            "uv",
            "pip",
            "install",
            "--offline",
            "--python",
            str(python),
            "--no-deps",
            str(wheels[0]),
        ],
        cwd=tmp_path,
        env=environment,
    )
    runtime = tmp_path / "runtime"
    runtime.mkdir()
    render_check = """
import harnessctl
from copy import deepcopy
from pathlib import Path
from harnessctl.config import DEFAULT_CONFIG
from harnessctl.install import (
    CURRENT_SDLC_COMMANDS, LEGACY_SDLC_COMMANDS,
    LEGACY_SDLC_COMMAND_REPLACEMENTS, RETIRED_SDLC_COMMANDS, install,
)
from harnessctl.mcp import required_server_intents, render_opencode_mcp
from harnessctl.templates import TEMPLATES, render_prompt, render_skill, render_skill_resources

checkout = Path(__import__('os').environ['HARNESSCTL_CHECKOUT']).resolve()
assert checkout not in Path(harnessctl.__file__).resolve().parents
config = deepcopy(DEFAULT_CONFIG)
config['memory']['enabled'] = True
intent = required_server_intents(config, 'opencode')[0]
assert render_opencode_mcp(intent)['url'] == 'https://api.githubcopilot.com/mcp/'
assert set(TEMPLATES) == set(CURRENT_SDLC_COMMANDS) == {
    'work-plan', 'work-build', 'work-verify', 'work-release', 'work-continue'
}
assert len(LEGACY_SDLC_COMMANDS) == 18
assert len(RETIRED_SDLC_COMMANDS) == 16
assert set(LEGACY_SDLC_COMMAND_REPLACEMENTS) == set(LEGACY_SDLC_COMMANDS)
assert inspect.signature(install).parameters['replace_sdlc_command_set'].default is False
for command in TEMPLATES:
    assert 'memory_search' not in render_prompt(command, 'opencode', config=config)
    assert 'memory_search' not in render_prompt(command, 'pi', config=config)
checkpoint = render_skill_resources(
    'sdlc', memory_hooks_enabled=True, retrieval_limit=5, retrieval_max_chars=4000,
    tdd_enabled=False, code_index_enabled=True,
)['references/checkpoint.md']
assert 'memory_store' in checkpoint
assert 'limit 5, 4000 chars' in checkpoint
sdlc = render_skill(
    'sdlc', memory_hooks_enabled=True, retrieval_limit=5, retrieval_max_chars=4000,
    tdd_enabled=False, code_index_enabled=True,
)
assert 'When `sdlc-code-index` is available' in sdlc
assert 'relationship-aware codebase retrieval or impact analysis is relevant' in sdlc
assert 'continue with direct source discovery, Glob, Grep, and file reads' in sdlc
disabled_sdlc = render_skill(
    'sdlc', memory_hooks_enabled=True, retrieval_limit=5, retrieval_max_chars=4000,
    tdd_enabled=False, code_index_enabled=False,
)
assert '`sdlc-code-index` is disabled' in disabled_sdlc
assert 'Do not load a discoverable retained copy' in disabled_sdlc
assert 'Red-Green-Refactor' in render_skill('develop-tdd')
sdlc_code = render_skill('sdlc-code')
sdlc_code_resources = render_skill_resources('sdlc-code')
assert 'Apply this root once' in sdlc_code
assert 'JSX syntax alone does not prove React' in sdlc_code
assert len(sdlc_code_resources) == 26
assert 'pyproject.toml' in sdlc_code_resources['references/py.md']
assert (
    'GDScript is a distinct language, not Python'
    in sdlc_code_resources['references/gdscript.md']
)
assert 'A `.h` extension alone is insufficient' in sdlc_code_resources['references/cpp.md']
assert 'repository evidence establishes React' in sdlc_code_resources['references/tsx.md']
sdlc_code_index = render_skill(
    'sdlc-code-index', mcp_server='operator-index'
)
assert 'Configured MCP server: `operator-index`' in sdlc_code_index
assert 'advisory retrieval evidence, never source authority' in sdlc_code_index
assert 'Do not invoke mutation or deletion operations' in sdlc_code_index
assert 'CodeGraphContext' not in sdlc_code_index
providers = {
    'filesystem': (
        'issue_id,issue_create,issue_list,issue_get,issue_update,issue_transition,'
        'issue_comment,issue_relate,issue_unrelate,issue_link_document,'
        'issue_validate,issue_archive'
    ),
    'github': ('gh', 'https://github.com', 'GH_TOKEN'),
    'gitlab': ('glab', 'https://gitlab.com', 'GITLAB_TOKEN'),
    'gitea': ('tea', 'https://gitea.example.com', 'GITEA_TOKEN'),
    'forgejo': ('forgejo-cli', 'https://forgejo.example.com', 'FORGEJO_TOKEN'),
}
for provider, connection in providers.items():
    if provider == 'filesystem':
        tools = connection
    else:
        tools, remote_url, token_env = connection
    context = {'provider': provider, 'tools': tools}
    if provider == 'filesystem':
        context.update(issue_root='.harnessctl/issues', issue_prefix='hrn-')
    else:
        context.update(
            remote_url=remote_url, token_env=token_env,
            mcp_id=f'cvs_{provider}', mcp_available=True,
        )
    rendered = render_skill('issue-tracking', **context)
    assert f'the configured {provider} issue authority' in rendered
    assert tools in rendered
    if provider != 'filesystem':
        assert remote_url in rendered
        assert token_env in rendered
    assert '{{' not in rendered
"""
    isolated_environment = environment | {"HARNESSCTL_CHECKOUT": str(ROOT)}
    render_check = "import inspect\n" + render_check
    _run([str(python), "-c", render_check], cwd=runtime, env=isolated_environment)

    sdist_runtime = tmp_path / "sdist-runtime"
    sdist_runtime.mkdir()
    with tarfile.open(sdists[0], mode="r:gz") as archive:
        archive.extractall(sdist_runtime, filter="data")
    sdist_root = next(path for path in sdist_runtime.iterdir() if path.is_dir())
    sdist_environment = isolated_environment | {"PYTHONPATH": str(sdist_root / "src")}
    _run([sys.executable, "-c", render_check], cwd=sdist_runtime, env=sdist_environment)
    sdist_migration = sdist_runtime / "migration"
    legacy_directory = sdist_migration / ".opencode/commands"
    legacy_directory.mkdir(parents=True)
    for command in {
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
        "work-plan",
        "work-review",
        "work-verify",
        "work-cvs",
        "work-finish",
    }:
        (legacy_directory / f"{command}.md").write_text("legacy\n", encoding="utf-8")
    _run(
        [
            sys.executable,
            "-m",
            "harnessctl.install",
            "--cwd",
            str(sdist_migration),
            "--harness",
            "opencode",
            "--replace-sdlc-command-set",
        ],
        cwd=sdist_runtime,
        env=sdist_environment,
    )
    assert {path.stem for path in legacy_directory.glob("*.md")} == CURRENT_COMMANDS

    disabled_opencode = runtime / "disabled-opencode"
    disabled_pi = runtime / "disabled-pi"
    enabled_opencode = runtime / "enabled-opencode"
    enabled_pi = runtime / "enabled-pi"
    enabled_all = runtime / "enabled-all"
    remote_opencode = runtime / "remote-opencode"
    migrate_opencode = runtime / "migrate-opencode"
    migrate_pi = runtime / "migrate-pi"
    for project in (
        disabled_opencode,
        disabled_pi,
        enabled_opencode,
        enabled_pi,
        enabled_all,
        remote_opencode,
        migrate_opencode,
        migrate_pi,
    ):
        project.mkdir()
    for project in (enabled_opencode, enabled_pi, enabled_all):
        _write_enabled_config(project)
    _write_remote_config(remote_opencode)
    for project in (disabled_pi, enabled_pi, enabled_all, migrate_pi):
        _write_pi_adapter_config(project)

    legacy_commands = {
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
        "work-plan",
        "work-review",
        "work-verify",
        "work-cvs",
        "work-finish",
    }
    for project, relative in (
        (migrate_opencode, Path(".opencode/commands")),
        (migrate_pi, Path(".pi/prompts")),
    ):
        directory = project / relative
        directory.mkdir(parents=True)
        for command in legacy_commands:
            (directory / f"{command}.md").write_text(f"legacy {command}\n", encoding="utf-8")

    cli = [str(python), "-m", "harnessctl.install", "--cwd"]
    help_result = _run(
        [str(python), "-m", "harnessctl.install", "--help"], cwd=runtime, env=environment
    )
    assert "--replace-sdlc-command-set" in help_result.stdout
    _run([*cli, str(disabled_opencode), "--harness", "opencode"], cwd=runtime, env=environment)
    _run([*cli, str(disabled_pi), "--harness", "pi"], cwd=runtime, env=environment)
    assert not (disabled_opencode / ".opencode/skills/sdlc-code-index").exists()
    assert not (disabled_pi / ".pi/skills/sdlc-code-index").exists()
    for project, relative in (
        (disabled_opencode, Path(".opencode/skills/sdlc-code")),
        (disabled_pi, Path(".pi/skills/sdlc-code")),
    ):
        assert (project / relative / "SKILL.md").is_file()
        assert len(list((project / relative / "references").glob("*.md"))) == 26
    assert "Do not load a discoverable retained copy" in (
        disabled_opencode / ".opencode/skills/sdlc/SKILL.md"
    ).read_text(encoding="utf-8")
    assert "Do not load a discoverable retained copy" in (
        disabled_pi / ".pi/skills/sdlc/SKILL.md"
    ).read_text(encoding="utf-8")
    assert (disabled_pi / ".pi/skills/issue-tracking/SKILL.md").is_file()
    assert (disabled_pi / ".pi/mcp.json").is_file()
    for project, harness in ((enabled_pi, "pi"), (enabled_all, "all")):
        _run([*cli, str(project), "--harness", harness], cwd=runtime, env=environment)
        assert (project / ".pi/skills/memory/SKILL.md").is_file()
        assert len(list((project / ".pi/prompts").glob("*.md"))) == COMMAND_COUNT
        if harness == "all":
            assert (project / ".opencode/skills/memory/SKILL.md").is_file()

    _run([*cli, str(enabled_opencode), "--harness", "opencode"], cwd=runtime, env=environment)
    _run([*cli, str(remote_opencode), "--harness", "opencode"], cwd=runtime, env=environment)
    for project, harness, relative in (
        (migrate_opencode, "opencode", Path(".opencode/commands")),
        (migrate_pi, "pi", Path(".pi/prompts")),
    ):
        rejected = _run(
            [*cli, str(project), "--harness", harness],
            cwd=runtime,
            env=environment,
            expected_returncode=2,
        )
        assert "deprecated SDLC command outputs detected" in rejected.stderr
        _run(
            [
                *cli,
                str(project),
                "--harness",
                harness,
                "--replace-sdlc-command-set",
            ],
            cwd=runtime,
            env=environment,
        )
        assert {path.stem for path in (project / relative).glob("*.md")} == CURRENT_COMMANDS
    commands = list((enabled_opencode / ".opencode/commands").glob("*.md"))
    assert len(commands) == COMMAND_COUNT
    assert all("memory_search" not in path.read_text(encoding="utf-8") for path in commands)
    checkpoint = enabled_opencode / ".opencode/skills/sdlc/references/checkpoint.md"
    assert "memory_store" in checkpoint.read_text(encoding="utf-8")
    for skill in ("caveman", "cvs", "memory", "issue-tracking"):
        assert (enabled_opencode / f".opencode/skills/{skill}/SKILL.md").is_file()
    assert (enabled_opencode / ".opencode/skills/sdlc-code-index/SKILL.md").is_file()
    code_index_skill = (enabled_opencode / ".opencode/skills/sdlc-code-index/SKILL.md").read_text(
        encoding="utf-8"
    )
    assert "Configured MCP server: `operator-index`" in code_index_skill
    assert "Configured provider" not in code_index_skill
    opencode_sdlc = (enabled_all / ".opencode/skills/sdlc/SKILL.md").read_bytes()
    pi_sdlc = (enabled_all / ".pi/skills/sdlc/SKILL.md").read_bytes()
    assert opencode_sdlc == pi_sdlc
    assert b"When `sdlc-code-index` is available" in opencode_sdlc
    opencode_code = enabled_all / ".opencode/skills/sdlc-code"
    pi_code = enabled_all / ".pi/skills/sdlc-code"
    assert {
        path.relative_to(opencode_code): path.read_bytes()
        for path in opencode_code.rglob("*")
        if path.is_file()
    } == {
        path.relative_to(pi_code): path.read_bytes()
        for path in pi_code.rglob("*")
        if path.is_file()
    }
    remote_skill = remote_opencode / ".opencode/skills/issue-tracking/SKILL.md"
    assert "Use GitHub CLI `gh` or live tools under `cvs_github`" in remote_skill.read_text(
        encoding="utf-8"
    )
    assert "Use only GitLab CLI" not in remote_skill.read_text(encoding="utf-8")
    opencode = json.loads(
        (enabled_opencode / ".opencode/opencode.json").read_text(encoding="utf-8")
    )
    assert "@harnessctl/opencode-tools@latest" in opencode["plugin"]
    assert not (enabled_opencode / ".opencode/plugins/harnessctl-memory.js").exists()
    assert not (enabled_opencode / ".harnessctl/cache/harnessctl.sqlite").exists()

    conflict = _run(
        [*cli, str(disabled_opencode), "--harness", "opencode"],
        cwd=runtime,
        env=environment,
        expected_returncode=2,
    )
    assert "refusing to overwrite existing files" in conflict.stderr
    _run(
        [*cli, str(disabled_opencode), "--harness", "opencode", "--force"],
        cwd=runtime,
        env=environment,
    )
