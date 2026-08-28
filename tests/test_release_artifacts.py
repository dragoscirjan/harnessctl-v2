from __future__ import annotations

import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMMAND_COUNT = 6
CURRENT_COMMANDS = {
    "work-plan",
    "work-build",
    "work-verify",
    "work-release",
    "work-continue",
    "work-refresh",
}
RETIRED_MIGRATION_RESOURCES = {
    "resources/specs-migration/dependencies.json",
    "resources/specs-migration/manifest.json",
    "resources/specs-migration/specs-to-documents-v1.mjs",
    "resources/specs-migration/THIRD_PARTY_NOTICES.txt",
}
RETIRED_MIGRATION_IDENTITY = re.compile(
    r"(?:harnessctl[-_])?specs[-_]migrate|migrate[-_]?specs|"
    r"specs[-_]?migration|specs-to-documents|streaming[-_]?transaction",
    re.IGNORECASE,
)


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


def test_release_gates_exclude_migration_tooling() -> None:
    scripts = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["scripts"]

    assert scripts["version-packages"] == "changeset version && npm install --package-lock-only"
    assert scripts["packages:check"] == "npm run packages:build && node scripts/check-packages.mjs"
    assert all(
        RETIRED_MIGRATION_IDENTITY.search(name) is None
        and RETIRED_MIGRATION_IDENTITY.search(command) is None
        for name, command in scripts.items()
    )


def test_local_npm_document_adapters_remain_release_inputs() -> None:
    assert (ROOT / "extensions/generic-tools/documents.ts").is_file()
    assert (ROOT / "extensions/opencode-tools/document-tools.ts").is_file()
    assert (ROOT / "extensions/pi-tools/document-tools.ts").is_file()

    _run(["npm", "run", "packages:build"], cwd=ROOT, env=os.environ.copy())

    expected = {
        "@harnessctl/generic-tools": {
            "dist/documents.js",
            "dist/documents.d.ts",
        },
        "@harnessctl/opencode-tools": {"dist/document-tools.js", "dist/document-tools.d.ts"},
        "@harnessctl/pi-tools": {"dist/document-tools.js", "dist/document-tools.d.ts"},
    }
    for workspace, required in expected.items():
        result = subprocess.run(
            [
                "npm",
                "pack",
                "--dry-run",
                "--json",
                "--ignore-scripts",
                "--workspace",
                workspace,
            ],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
            timeout=60,
        )
        assert result.returncode == 0, result.stdout + result.stderr
        [packed] = json.loads(result.stdout)
        paths = {entry["path"] for entry in packed["files"]}
        assert required <= paths


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

    for artifact_kind in ("--wheel", "--sdist"):
        _run(
            [
                "uv",
                "build",
                artifact_kind,
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

    rebuilt_source = tmp_path / "rebuilt-source"
    rebuilt_source.mkdir()
    with tarfile.open(sdists[0], mode="r:gz") as archive:
        archive.extractall(rebuilt_source, filter="data")
    extracted_sdist = next(path for path in rebuilt_source.iterdir() if path.is_dir())
    rebuilt_artifacts = tmp_path / "rebuilt-artifacts"
    rebuilt_artifacts.mkdir()
    _run(
        [
            "uv",
            "build",
            "--wheel",
            "--offline",
            "--no-create-gitignore",
            "--out-dir",
            str(rebuilt_artifacts),
            str(extracted_sdist),
        ],
        cwd=tmp_path,
        env=environment,
    )
    rebuilt_wheels = list(rebuilt_artifacts.glob("*.whl"))
    assert len(rebuilt_wheels) == 1

    package_root = source / "src/harnessctl"
    expected_resources = {
        path.relative_to(package_root).as_posix()
        for path in package_root.rglob("*")
        if path.is_file()
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
        == 14
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
    assert "templates/skills/sdlc-issue-tracking/SKILL.md.j2" in expected_resources
    assert "templates/skills/sdlc-documents/SKILL.md.j2" not in expected_resources
    assert "document_contracts.py" not in expected_resources
    assert "specs_migration_bridge.py" not in expected_resources
    assert expected_resources.isdisjoint(RETIRED_MIGRATION_RESOURCES)
    assert "templates/skills/sdlc-cvs/SKILL.md.j2" in expected_resources
    assert "templates/skills/sdlc-develop-tdd/SKILL.md.j2" in expected_resources
    assert "templates/skills/sdlc-code-index/SKILL.md.j2" in expected_resources
    assert "mcp.py" in expected_resources

    with zipfile.ZipFile(wheels[0]) as archive:
        wheel_members = set(archive.namelist())
        metadata_name = next(name for name in wheel_members if name.endswith(".dist-info/METADATA"))
        assert "Version: 0.2.0" in archive.read(metadata_name).decode("utf-8")
    assert {f"harnessctl/{path}" for path in expected_resources} <= wheel_members
    assert "harnessctl/specs_migration_bridge.py" not in wheel_members
    assert (
        not {f"harnessctl/{resource}" for resource in RETIRED_MIGRATION_RESOURCES} & wheel_members
    )
    assert not any("sdlc-documents" in member for member in wheel_members)
    assert not any(member.endswith("/document_contracts.py") for member in wheel_members)

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
    assert "specs_migration_bridge.py" not in sdist_package_members
    assert sdist_package_members.isdisjoint(RETIRED_MIGRATION_RESOURCES)
    with zipfile.ZipFile(rebuilt_wheels[0]) as archive:
        rebuilt_members = set(archive.namelist())
    assert "harnessctl/specs_migration_bridge.py" not in rebuilt_members
    assert (
        not {f"harnessctl/{resource}" for resource in RETIRED_MIGRATION_RESOURCES} & rebuilt_members
    )
    assert not any("sdlc-documents" in member for member in sdist_members)
    assert not any(member.endswith("/document_contracts.py") for member in sdist_members)
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
for provider, tool, url, token_env, command, flag, target_env, version in (
    ('gitea', 'tea', 'https://gitea.example.com', 'GITEA_TOKEN',
     'gitea-mcp', '--host', 'GITEA_ACCESS_TOKEN', '1.6.0'),
    ('forgejo', 'forgejo-cli', 'https://forgejo.example.com', 'FORGEJO_TOKEN',
     'forgejo-mcp', '--url', 'FORGEJO_ACCESS_TOKEN', '2.33.0'),
):
    provider_config = deepcopy(DEFAULT_CONFIG)
    provider_config['cvs']['remote'] = {
        'provider': provider, 'tools': tool, 'url': url, 'token_env': token_env,
    }
    provider_intent = required_server_intents(provider_config, 'opencode')[0]
    provider_rendered = render_opencode_mcp(provider_intent)
    assert provider_intent.compatibility_version == version
    assert provider_rendered['command'] == [
        command, '--transport', 'stdio', flag, url,
    ]
    assert provider_rendered['environment'] == {
        target_env: f'{{env:{token_env}}}',
    }
assert set(TEMPLATES) == set(CURRENT_SDLC_COMMANDS) == {
    'work-plan', 'work-build', 'work-verify', 'work-release', 'work-continue', 'work-refresh'
}
assert len(LEGACY_SDLC_COMMANDS) == 18
assert len(RETIRED_SDLC_COMMANDS) == 16
assert set(LEGACY_SDLC_COMMAND_REPLACEMENTS) == set(LEGACY_SDLC_COMMANDS)
assert 'migrate_specs' not in inspect.signature(install).parameters
assert inspect.signature(install).parameters['replace_sdlc_command_set'].default is False
assert inspect.signature(install).parameters['replace_sdlc_skill_set'].default is False
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
assert 'Red-Green-Refactor' in render_skill('sdlc-develop-tdd')
try:
    render_skill('sdlc-documents')
except ValueError as error:
    assert 'unsupported skill' in str(error)
else:
    raise AssertionError('retired Documents skill remained renderable')
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
assert 'Plan, Build, Verify, Release, and Continue are retrieval-only' in sdlc_code_index
assert 'During `work-refresh` only' in sdlc_code_index
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
    rendered = render_skill('sdlc-issue-tracking', **context)
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
    assert "--replace-sdlc-skill-set" in help_result.stdout
    assert "--migrate-specs" not in help_result.stdout

    legacy_specs = runtime / "legacy-specs"
    specs = legacy_specs / ".specs"
    specs.mkdir(parents=True)
    source = specs / "hld-00001-packaged-artifact-v1.md"
    source.write_text(
        "---\n"
        'id: "00001"\n'
        "type: hld\n"
        'title: "Packaged artifact"\n'
        "version: 1\n"
        "status: approved\n"
        "---\n\n"
        "# Packaged artifact\n\n"
        "Legacy source must remain untouched.\n",
        encoding="utf-8",
    )
    _run(
        [*cli, str(legacy_specs), "--harness", "opencode"],
        cwd=runtime,
        env=environment,
    )
    assert source.read_text(encoding="utf-8").endswith("Legacy source must remain untouched.\n")
    assert not (legacy_specs / ".harnessctl/documents").exists()

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
    assert (disabled_pi / ".pi/skills/sdlc-issue-tracking/SKILL.md").is_file()
    assert not (disabled_pi / ".pi/skills/sdlc-documents").exists()
    assert (disabled_pi / ".pi/mcp.json").is_file()
    for project, harness in ((enabled_pi, "pi"), (enabled_all, "all")):
        _run([*cli, str(project), "--harness", harness], cwd=runtime, env=environment)
        assert (project / ".pi/skills/sdlc-memory/SKILL.md").is_file()
        assert len(list((project / ".pi/prompts").glob("*.md"))) == COMMAND_COUNT
        if harness == "all":
            assert (project / ".opencode/skills/sdlc-memory/SKILL.md").is_file()

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
    for skill in (
        "sdlc-caveman",
        "sdlc-cvs",
        "sdlc-memory",
        "sdlc-issue-tracking",
    ):
        assert (enabled_opencode / f".opencode/skills/{skill}/SKILL.md").is_file()
    code_index_skill_path = enabled_opencode / ".opencode/skills/sdlc-code-index/SKILL.md"
    assert code_index_skill_path.is_file()
    code_index_skill = code_index_skill_path.read_text(encoding="utf-8")
    assert "Configured MCP server: `operator-index`" in code_index_skill
    assert "Configured provider" not in code_index_skill
    opencode_sdlc = (enabled_all / ".opencode/skills/sdlc/SKILL.md").read_bytes()
    pi_sdlc = (enabled_all / ".pi/skills/sdlc/SKILL.md").read_bytes()
    assert opencode_sdlc == pi_sdlc
    assert not (enabled_all / ".opencode/skills/sdlc-documents").exists()
    assert not (enabled_all / ".pi/skills/sdlc-documents").exists()
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
    remote_skill = remote_opencode / ".opencode/skills/sdlc-issue-tracking/SKILL.md"
    assert "Use GitHub CLI `gh` or live tools under `sdlc_cvs_github`" in remote_skill.read_text(
        encoding="utf-8"
    )
    assert "Use only GitLab CLI" not in remote_skill.read_text(encoding="utf-8")
    opencode = json.loads(
        (enabled_opencode / ".opencode/opencode.json").read_text(encoding="utf-8")
    )
    assert "@harnessctl/opencode-tools@latest" in opencode["plugin"]
    assert "sdlc_cvs_github" in opencode["mcp"]
    assert "cvs_github" not in opencode["mcp"]
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
