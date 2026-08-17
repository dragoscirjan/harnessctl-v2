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
COMMAND_COUNT = 18


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
    config.write_text("memory:\n  enabled: true\n", encoding="utf-8")


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
    settings.write_text('{"packages":["npm:pi-mcp-adapter@2.26.0"]}\n', encoding="utf-8")


def _copy_runtime_dependency(package: str, site_packages: Path) -> None:
    spec = importlib.util.find_spec(package)
    assert spec is not None and spec.submodule_search_locations
    source = Path(next(iter(spec.submodule_search_locations)))
    shutil.copytree(source, site_packages / package)


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
    assert len(expected_resources & {"templates/sdlc/_partials/memory-entry.md.j2"}) == 1
    assert len(expected_resources & {"templates/sdlc/_partials/memory-exit.md.j2"}) == 1
    assert "templates/skills/issue-tracking/SKILL.md.j2" in expected_resources
    assert "templates/skills/cvs/SKILL.md.j2" in expected_resources
    assert "mcp.py" in expected_resources

    with zipfile.ZipFile(wheels[0]) as archive:
        wheel_members = set(archive.namelist())
    assert {f"harnessctl/{path}" for path in expected_resources} <= wheel_members

    with tarfile.open(sdists[0], mode="r:gz") as archive:
        sdist_members = set(archive.getnames())
    sdist_package_members = {
        member.split("/src/harnessctl/", maxsplit=1)[1]
        for member in sdist_members
        if "/src/harnessctl/" in member
    }
    assert expected_resources <= sdist_package_members
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
from harnessctl.mcp import required_server_intents, render_opencode_mcp
from harnessctl.templates import TEMPLATES, render_prompt, render_skill

checkout = Path(__import__('os').environ['HARNESSCTL_CHECKOUT']).resolve()
assert checkout not in Path(harnessctl.__file__).resolve().parents
config = deepcopy(DEFAULT_CONFIG)
config['memory']['enabled'] = True
intent = required_server_intents(config, 'opencode')[0]
assert render_opencode_mcp(intent)['url'] == 'https://api.githubcopilot.com/mcp/'
assert len(TEMPLATES) == 18
for command in TEMPLATES:
    assert '## Project memory exit' in render_prompt(command, 'opencode', config=config)
    assert 'memory_' not in render_prompt(command, 'pi', config=config)
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
            transport='auto', remote_url=remote_url, token_env=token_env,
            mcp_id=f'cvs_{provider}',
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
    _run([str(python), "-c", render_check], cwd=runtime, env=isolated_environment)

    disabled_opencode = runtime / "disabled-opencode"
    disabled_pi = runtime / "disabled-pi"
    enabled_opencode = runtime / "enabled-opencode"
    enabled_pi = runtime / "enabled-pi"
    enabled_all = runtime / "enabled-all"
    remote_opencode = runtime / "remote-opencode"
    for project in (
        disabled_opencode,
        disabled_pi,
        enabled_opencode,
        enabled_pi,
        enabled_all,
        remote_opencode,
    ):
        project.mkdir()
    for project in (enabled_opencode, enabled_pi, enabled_all):
        _write_enabled_config(project)
    _write_remote_config(remote_opencode)
    _write_pi_adapter_config(disabled_pi)

    cli = [str(python), "-m", "harnessctl.install", "--cwd"]
    _run([*cli, str(disabled_opencode), "--harness", "opencode"], cwd=runtime, env=environment)
    _run([*cli, str(disabled_pi), "--harness", "pi"], cwd=runtime, env=environment)
    assert not (disabled_pi / ".opencode/skills/issue-tracking").exists()
    assert (disabled_pi / ".pi/mcp.json").is_file()
    for project, harness in ((enabled_pi, "pi"), (enabled_all, "all")):
        result = _run(
            [*cli, str(project), "--harness", harness],
            cwd=runtime,
            env=environment,
            expected_returncode=2,
        )
        assert "automatic Pi extension and skill installation is not yet verified" in result.stderr
        assert not (project / ".opencode").exists()
        assert not (project / ".pi").exists()

    _run([*cli, str(enabled_opencode), "--harness", "opencode"], cwd=runtime, env=environment)
    _run([*cli, str(remote_opencode), "--harness", "opencode"], cwd=runtime, env=environment)
    commands = list((enabled_opencode / ".opencode/commands").glob("*.md"))
    assert len(commands) == COMMAND_COUNT
    assert all("## Project memory exit" in path.read_text(encoding="utf-8") for path in commands)
    for skill in ("caveman", "cvs", "memory", "issue-tracking"):
        assert (enabled_opencode / f".opencode/skills/{skill}/SKILL.md").is_file()
    remote_skill = remote_opencode / ".opencode/skills/issue-tracking/SKILL.md"
    assert "Use only GitHub CLI `gh`" in remote_skill.read_text(encoding="utf-8")
    assert "Use only GitLab CLI" not in remote_skill.read_text(encoding="utf-8")
    assert (enabled_opencode / ".opencode/plugins/harnessctl-memory.js").is_file()
    package = json.loads((enabled_opencode / ".opencode/package.json").read_text(encoding="utf-8"))
    assert package["dependencies"]["@harnessctl/opencode-tools"] == "0.1.0"
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
