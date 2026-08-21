"""Install compiled harnessctl prompts into a project."""

from __future__ import annotations

import argparse
import contextlib
import errno
import json
import os
import shutil
import subprocess
import sys
import tempfile
import warnings
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import ConfigError, load_config
from .mcp import (
    OUTPUT_GUARD,
    ServerIntent,
    deduplicate_server_intents,
    render_opencode_mcp,
    render_pi_mcp,
    required_server_intents,
)
from .templates import TEMPLATES, render_prompt, render_skill, render_skill_resources

TARGETS = {
    "opencode": Path(".opencode/commands"),
    "pi": Path(".pi/prompts"),
}
COMMANDS = tuple(TEMPLATES.keys())
CURRENT_SDLC_COMMANDS = COMMANDS
LEGACY_SDLC_COMMANDS = (
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
)
LEGACY_SDLC_COMMAND_REPLACEMENTS = {
    "work-new": "work-plan",
    "work-explore": "work-plan",
    "work-resume": "work-continue",
    "work-start-initiative": "work-plan",
    "work-start-epic": "work-plan",
    "work-start-from": "work-continue",
    "work-write-stories": "work-plan",
    "work-start-story": "work-plan",
    "work-design-doc": "work-plan",
    "work-hld": "work-plan",
    "work-lld": "work-plan",
    "work-write-tasks": "work-plan",
    "work-implement": "work-build",
    "work-plan": "work-plan",
    "work-review": "work-verify",
    "work-verify": "work-verify",
    "work-cvs": "work-release",
    "work-finish": "work-release",
}
OVERLAPPING_SDLC_COMMANDS = frozenset({"work-plan", "work-verify"})
RETIRED_SDLC_COMMANDS = tuple(
    command for command in LEGACY_SDLC_COMMANDS if command not in OVERLAPPING_SDLC_COMMANDS
)
OPENCODE_SKILLS = Path(".opencode/skills")
TDD_SKILL = Path("develop-tdd/SKILL.md")
OPENCODE_PLUGIN = Path(".opencode/plugins/harnessctl-memory.js")
LEGACY_PLUGIN_CONTENT = "export { CustomToolsPlugin } from '@harnessctl/opencode-tools';\n"
OPENCODE_TOOLS_PLUGIN = "@harnessctl/opencode-tools@latest"
LOCAL_CACHE = Path(".harnessctl/cache/harnessctl.sqlite")
OPENCODE_CONFIG = Path(".opencode/opencode.json")
PI_MCP_CONFIG = Path(".pi/mcp.json")
PI_SETTINGS = Path(".pi/settings.json")
PI_ADAPTER = "npm:pi-mcp-adapter@2.26.0"
PI_TOOLS = "npm:@harnessctl/pi-tools@latest"
PI_TIMEOUT_SECONDS = 120
PI_RESIDUAL_EFFECTS = (
    "project-local .pi/npm, package-manager metadata, downloads, caches, "
    "lifecycle-script effects, and other external state may remain"
)


def install(
    cwd: Path,
    harness: str,
    force: bool = False,
    *,
    replace_sdlc_command_set: bool = False,
    allow_pi_package_install: bool = False,
    allow_pi_mcp_adapter_install: bool = False,
    confirm_pi_mcp_adapter_install: Callable[[str], bool] | None = None,
    disclose_sdlc_replacement: Callable[[str], None] | None = None,
) -> list[Path]:
    """Install prompt files for one harness or all supported harnesses."""
    if harness == "all":
        harnesses: Iterable[str] = TARGETS
    elif harness in TARGETS:
        harnesses = (harness,)
    else:
        raise ValueError(f"unsupported harness: {harness}")

    root = cwd.resolve()
    config = load_config(root)
    if harness in ("opencode", "all") and config["mcp"]["output_limit_mode"] == "hard":
        raise ConfigError("mcp.output_limit_mode=hard is supported only by Pi")

    intents = deduplicate_server_intents(required_server_intents(config, harness))
    intents = _available_server_intents(intents)
    rendered_targets: list[tuple[Path, str]] = []
    command_targets: dict[Path, tuple[str, str]] = {}
    retired_targets: list[Path] = []
    conflicts: list[Path] = []
    tdd_enabled = bool(config["workflow"]["tdd"]["enabled"])
    tdd_skill_content = render_skill("develop-tdd")
    sdlc_context = {
        "memory_hooks_enabled": bool(config["memory"]["enabled"]),
        "retrieval_limit": config["memory"]["retrieval"]["limit"],
        "retrieval_max_chars": config["memory"]["retrieval"]["max_chars"],
        "tdd_enabled": tdd_enabled,
    }
    for selected_harness in harnesses:
        relative_directory = TARGETS[selected_harness]
        for command in COMMANDS:
            relative_target = relative_directory / f"{command}.md"
            target = _target(root, relative_target)
            content = render_command(selected_harness, command, config=config)
            rendered_targets.append((target, content))
            command_targets[target] = (command, content)
        retired_targets.extend(
            _target(root, relative_directory / f"{command}.md") for command in RETIRED_SDLC_COMMANDS
        )
    if harness in ("opencode", "all"):
        _append_skill_tree(
            rendered_targets,
            root,
            OPENCODE_SKILLS / "sdlc",
            "sdlc",
            sdlc_context,
        )
        cvs = config["cvs"]
        cvs_remote = cvs["remote"]
        rendered_targets.append(
            (
                _target(root, OPENCODE_SKILLS / "cvs/SKILL.md"),
                render_skill(
                    "cvs",
                    local=cvs["local"],
                    provider=cvs_remote["provider"],
                    tools=cvs_remote["tools"],
                    remote_url=cvs_remote["url"],
                    token_env=cvs_remote["token_env"],
                    mcp_id=f"cvs_{cvs_remote['provider']}",
                    mcp_available=_has_mcp(intents, cvs_remote["provider"]),
                ),
            )
        )
        issues = config["issues"]
        issue_context: dict[str, object] = {
            "provider": issues["type"],
            "tools": issues["tools"],
        }
        if issues["type"] == "filesystem":
            issue_context.update(issue_root=issues["root"], issue_prefix=issues["prefix"])
        else:
            issue_context.update(
                remote_url=issues["remote"]["url"],
                token_env=issues["remote"]["token_env"],
                mcp_id=f"cvs_{issues['type']}",
                mcp_available=_has_mcp(intents, issues["type"]),
            )
        rendered_targets.append(
            (
                _target(root, OPENCODE_SKILLS / "issue-tracking/SKILL.md"),
                render_skill("issue-tracking", **issue_context),
            )
        )
        communication = config["communication"]["caveman"]
        if communication["enabled"]:
            rendered_targets.append(
                (
                    _target(root, OPENCODE_SKILLS / "caveman/SKILL.md"),
                    render_skill("caveman", mode=communication["mode"]),
                )
            )
        memory = config["memory"]
        if memory["enabled"]:
            repository = memory["repository"]
            retrieval = memory["retrieval"]
            rendered_targets.extend(
                [
                    (
                        _target(root, OPENCODE_SKILLS / "memory/SKILL.md"),
                        render_skill(
                            "memory",
                            retrieval_limit=retrieval["limit"],
                            max_chars=retrieval["max_chars"],
                            repository_root=repository["root"],
                        ),
                    ),
                ]
            )
        if tdd_enabled:
            rendered_targets.append((_target(root, OPENCODE_SKILLS / TDD_SKILL), tdd_skill_content))
    if harness in ("pi", "all"):
        _append_skill_tree(
            rendered_targets,
            root,
            Path(".pi/skills/sdlc"),
            "sdlc",
            sdlc_context,
        )
        cvs = config["cvs"]
        cvs_remote = cvs["remote"]
        rendered_targets.append(
            (
                _target(root, Path(".pi/skills/cvs/SKILL.md")),
                render_skill(
                    "cvs",
                    local=cvs["local"],
                    provider=cvs_remote["provider"],
                    tools=cvs_remote["tools"],
                    remote_url=cvs_remote["url"],
                    token_env=cvs_remote["token_env"],
                    mcp_id=f"cvs_{cvs_remote['provider']}",
                    mcp_available=_has_mcp(intents, cvs_remote["provider"]),
                ),
            )
        )
        issues = config["issues"]
        issue_context = {"provider": issues["type"], "tools": issues["tools"]}
        if issues["type"] == "filesystem":
            issue_context.update(issue_root=issues["root"], issue_prefix=issues["prefix"])
        else:
            issue_context.update(
                remote_url=issues["remote"]["url"],
                token_env=issues["remote"]["token_env"],
                mcp_id=f"cvs_{issues['type']}",
                mcp_available=_has_mcp(intents, issues["type"]),
            )
        rendered_targets.extend(
            [
                (
                    _target(root, Path(".pi/skills/issue-tracking/SKILL.md")),
                    render_skill("issue-tracking", **issue_context),
                ),
                (
                    _target(root, Path(".pi/skills/caveman/SKILL.md")),
                    render_skill("caveman", mode=config["communication"]["caveman"]["mode"]),
                ),
                (
                    _target(root, Path(".pi/skills/memory/SKILL.md")),
                    render_skill(
                        "memory",
                        retrieval_limit=config["memory"]["retrieval"]["limit"],
                        max_chars=config["memory"]["retrieval"]["max_chars"],
                        repository_root=config["memory"]["repository"]["root"],
                    ),
                ),
            ]
        )
        if tdd_enabled:
            rendered_targets.append(
                (_target(root, Path(".pi/skills") / TDD_SKILL), tdd_skill_content)
            )
    if config["memory"]["enabled"]:
        rendered_targets.append(
            (
                _target(root, Path(".gitignore")),
                _memory_ignore(root, config["memory"]["repository"]),
            )
        )
    if harness in ("opencode", "all"):
        opencode_path = _target(root, OPENCODE_CONFIG)
        opencode_content = _merge_opencode_json(
            opencode_path,
            intents,
            force=force,
        )
        if opencode_content is not None:
            rendered_targets.append((opencode_path, opencode_content))

    pi_state: _PiPackageState | None = None
    pi_executable: str | None = None
    required_pi_packages: tuple[str, ...] = ()
    if harness in ("pi", "all"):
        if intents:
            pi_mcp_path = _target(root, PI_MCP_CONFIG)
            pi_content = _merge_pi_json(pi_mcp_path, intents, force=force)
            if pi_content is not None:
                rendered_targets.append((pi_mcp_path, pi_content))
        required_pi_packages = (PI_TOOLS, *((PI_ADAPTER,) if intents else ()))
        pi_state = _inspect_pi_packages(root)
        if any(source not in pi_state.configured for source in required_pi_packages):
            pi_executable = _preflight_pi_launcher()

    mergeable_targets = {
        _target(root, Path(".gitignore")),
        _target(root, OPENCODE_CONFIG),
        _target(root, PI_MCP_CONFIG),
    }
    _validate_plan(root, rendered_targets, config, harness, retired_targets)
    legacy_command_targets = _detect_legacy_commands(command_targets, retired_targets)
    if legacy_command_targets and not replace_sdlc_command_set:
        joined = "\n".join(f"- {target}" for target in legacy_command_targets)
        raise FileExistsError(
            "deprecated SDLC command outputs detected; rerun with "
            f"--replace-sdlc-command-set to replace them:\n{joined}"
        )

    for target, content in rendered_targets:
        if not target.exists() or target in mergeable_targets or force:
            continue
        command = command_targets.get(target, (None, ""))[0]
        replacement_authorized = replace_sdlc_command_set and (
            command in OVERLAPPING_SDLC_COMMANDS or target.read_bytes() == content.encode("utf-8")
        )
        if not replacement_authorized:
            conflicts.append(target)
    if conflicts:
        joined = "\n".join(f"- {target}" for target in conflicts)
        raise FileExistsError(f"refusing to overwrite existing files:\n{joined}")
    if replace_sdlc_command_set and legacy_command_targets:
        joined = "\n".join(f"- {target}" for target in legacy_command_targets)
        disclosure = (
            "Replacing deprecated SDLC command outputs. These files may contain "
            "custom changes. Existing work-plan/work-verify files will be replaced "
            f"and retired command files will be deleted:\n{joined}"
        )
        if disclose_sdlc_replacement is None:
            warnings.warn(disclosure, UserWarning, stacklevel=2)
        else:
            disclose_sdlc_replacement(disclosure)
    deletion_targets = (
        [target for target in retired_targets if target.exists()]
        if replace_sdlc_command_set
        else []
    )
    legacy_plugin_targets: list[Path] = []
    if harness in ("opencode", "all"):
        legacy_plugin = _target(root, OPENCODE_PLUGIN)
        if legacy_plugin.exists():
            if not legacy_plugin.is_file():
                raise ValueError(f"legacy OpenCode plugin must be a regular file: {legacy_plugin}")
            if legacy_plugin.read_text(encoding="utf-8") == LEGACY_PLUGIN_CONTENT:
                legacy_plugin_targets.append(legacy_plugin)

    write_targets = [
        (target, content)
        for target, content in rendered_targets
        if not target.exists() or target.read_bytes() != content.encode("utf-8")
    ]
    previous = _capture_before_images(
        [
            *(target for target, _ in write_targets),
            *deletion_targets,
            *legacy_plugin_targets,
        ]
    )
    created_directories: list[Path] = []
    installed_pi_packages: list[str] = []
    pi_package_install_attempted = False
    settings_path = _target(root, PI_SETTINGS) if pi_state is not None else None
    settings_before = _capture_before_image(settings_path) if settings_path is not None else None
    mutation_started = False
    try:
        if pi_state is not None:
            for source in required_pi_packages:
                if source in pi_state.configured:
                    continue
                _authorize_pi_package_install(
                    source,
                    allow_pi_package_install or allow_pi_mcp_adapter_install,
                    confirm_pi_mcp_adapter_install,
                )
                pi_package_install_attempted = True
                mutation_started = True
                try:
                    _run_pi_package_action(root, "install", source, pi_executable=pi_executable)
                except BaseException:
                    try:
                        if source in _inspect_pi_packages(root).configured:
                            installed_pi_packages.append(source)
                    except BaseException:
                        # A newly malformed settings file leaves package state ambiguous.
                        installed_pi_packages.append(source)
                    raise
                installed_pi_packages.append(source)
                if source not in _inspect_pi_packages(root).configured:
                    raise RuntimeError(f"Pi did not register exact project-local package {source}")
        for target, content in write_targets:
            mutation_started = True
            _target(root, target.relative_to(root))
            _ensure_directory(target.parent, root, created_directories)
            write_atomic(target, content)
        for target in deletion_targets:
            mutation_started = True
            target.unlink(missing_ok=True)
        for target in legacy_plugin_targets:
            mutation_started = True
            target.unlink()
        if config["memory"]["enabled"]:
            _initialize_memory_paths(root, config["memory"]["repository"], created_directories)
        if harness in ("opencode", "all"):
            _smoke_check(
                root,
                check_memory=config["memory"]["enabled"],
                check_tdd=tdd_enabled,
            )
        if harness in ("pi", "all"):
            _smoke_check_pi(root, required_pi_packages, rendered_targets)
        _smoke_check_mcp(root, harness, intents)
    except BaseException as error:
        rollback_errors: list[BaseException] = []
        for source in reversed(installed_pi_packages):
            try:
                _run_pi_package_action(root, "remove", source)
            except BaseException as cleanup_error:
                rollback_errors.append(cleanup_error)
        if mutation_started:
            rollback_errors.extend(_rollback(root, previous, created_directories))
        if (
            pi_package_install_attempted
            and settings_path is not None
            and settings_before is not None
        ):
            rollback_errors.extend(_restore_before_image(root, settings_path, settings_before))
        if pi_package_install_attempted:
            rollback_errors.append(
                RuntimeError(f"Pi package cleanup is best effort: {PI_RESIDUAL_EFFECTS}")
            )
        if rollback_errors:
            raise BaseExceptionGroup(
                "installation failed and rollback was incomplete",
                [error, *rollback_errors],
            ) from error
        raise
    return [target for target, _ in rendered_targets]


@dataclass(frozen=True)
class _PiPackageState:
    configured: frozenset[str]


def _available_server_intents(intents: list[ServerIntent]) -> list[ServerIntent]:
    """Omit local MCP servers whose operator-installed executable is unavailable."""
    forgejo_mcp_available = shutil.which("forgejo-mcp") is not None
    return [
        intent for intent in intents if intent.command != "forgejo-mcp" or forgejo_mcp_available
    ]


def _append_skill_tree(
    rendered_targets: list[tuple[Path, str]],
    root: Path,
    relative_root: Path,
    skill: str,
    context: Mapping[str, object],
) -> None:
    """Append one skill and all validated progressive-disclosure resources."""
    rendered_targets.append(
        (_target(root, relative_root / "SKILL.md"), render_skill(skill, **context))
    )
    rendered_targets.extend(
        (_target(root, relative_root / relative), content)
        for relative, content in render_skill_resources(skill, **context).items()
    )


def _has_mcp(intents: list[ServerIntent], provider: str) -> bool:
    """Return whether the configured provider has a projected MCP server."""
    return any(intent.server_id == f"cvs_{provider}" for intent in intents)


def _reject_duplicate_members(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, member in pairs:
        if key in value:
            raise ValueError(f"duplicate JSON member: {key}")
        value[key] = member
    return value


def _load_json_object(path: Path, label: str) -> tuple[dict[str, Any], bytes | None]:
    if path.is_symlink():
        raise ValueError(f"{label} must not be a symlink: {path}")
    if not path.exists():
        return {}, None
    if not path.is_file():
        raise ValueError(f"{label} must be a regular file: {path}")
    original = path.read_bytes()
    try:
        loaded = json.loads(original.decode("utf-8"), object_pairs_hook=_reject_duplicate_members)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        raise ValueError(f"invalid {label} {path}: {error}") from error
    if not isinstance(loaded, dict):
        raise ValueError(f"{label} must contain a JSON object: {path}")
    return loaded, original


def _merge_host_json(
    path: Path,
    container_name: str,
    required: Mapping[str, Mapping[str, Any]],
    *,
    force: bool,
) -> str | None:
    """Merge only fixed IDs, preserving unrelated top-level and sibling values."""
    if not required:
        return None
    document, original = _load_json_object(path, "host MCP configuration")
    container = document.get(container_name)
    if container is None:
        container = {}
        document[container_name] = container
    if not isinstance(container, dict):
        raise ValueError(f"{container_name} must be a JSON object in {path}")
    changed = original is None
    for server_id, expected in required.items():
        current = container.get(server_id)
        if current == expected:
            continue
        if current is not None and not force:
            raise FileExistsError(f"conflicting harnessctl-owned MCP ID {server_id} in {path}")
        container[server_id] = dict(expected)
        changed = True
    if not changed:
        return None
    return json.dumps(document, indent=2, ensure_ascii=False) + "\n"


def _merge_opencode_json(
    path: Path,
    intents: list[ServerIntent],
    *,
    force: bool,
) -> str | None:
    """Register harnessctl tools and merge owned MCP IDs into OpenCode config."""
    document, original = _load_json_object(path, "OpenCode configuration")
    plugins = document.get("plugin")
    if plugins is None:
        plugins = []
        document["plugin"] = plugins
    if not isinstance(plugins, list) or not all(isinstance(item, str) for item in plugins):
        raise ValueError(f"plugin must be an array of strings in {path}")

    changed = original is None
    managed = [
        item
        for item in plugins
        if item == "@harnessctl/opencode-tools" or item.startswith("@harnessctl/opencode-tools@")
    ]
    if managed != [OPENCODE_TOOLS_PLUGIN]:
        if managed and not force:
            raise FileExistsError(f"conflicting harnessctl OpenCode plugin in {path}: {managed}")
        plugins[:] = [
            item
            for item in plugins
            if item != "@harnessctl/opencode-tools"
            and not item.startswith("@harnessctl/opencode-tools@")
        ]
        plugins.append(OPENCODE_TOOLS_PLUGIN)
        changed = True

    required = {intent.server_id: render_opencode_mcp(intent) for intent in intents}
    if required:
        container = document.get("mcp")
        if container is None:
            container = {}
            document["mcp"] = container
        if not isinstance(container, dict):
            raise ValueError(f"mcp must be a JSON object in {path}")
        for server_id, expected in required.items():
            current = container.get(server_id)
            if current == expected:
                continue
            if current is not None and not force:
                raise FileExistsError(f"conflicting harnessctl-owned MCP ID {server_id} in {path}")
            container[server_id] = dict(expected)
            changed = True

    if not changed:
        return None
    return json.dumps(document, indent=2, ensure_ascii=False) + "\n"


def _merge_pi_json(path: Path, intents: list[ServerIntent], *, force: bool) -> str | None:
    """Merge Pi servers and the sole harnessctl-owned adapter setting."""
    if not intents:
        return None
    document, original = _load_json_object(path, "Pi MCP configuration")
    servers = document.get("mcpServers")
    if servers is None:
        servers = {}
        document["mcpServers"] = servers
    if not isinstance(servers, dict):
        raise ValueError(f"mcpServers must be a JSON object in {path}")
    settings = document.get("settings")
    if settings is None:
        settings = {}
        document["settings"] = settings
    if not isinstance(settings, dict):
        raise ValueError(f"settings must be a JSON object in {path}")

    changed = original is None
    for intent in intents:
        expected = render_pi_mcp(intent)
        current = servers.get(intent.server_id)
        if current != expected:
            if current is not None and not force:
                raise FileExistsError(
                    f"conflicting harnessctl-owned MCP ID {intent.server_id} in {path}"
                )
            servers[intent.server_id] = expected
            changed = True
    current_guard = settings.get("outputGuard")
    if current_guard != OUTPUT_GUARD:
        if current_guard is not None and not force:
            raise FileExistsError(f"conflicting settings.outputGuard in {path}")
        settings["outputGuard"] = dict(OUTPUT_GUARD)
        changed = True
    if not changed:
        return None
    return json.dumps(document, indent=2, ensure_ascii=False) + "\n"


def _inspect_pi_packages(root: Path) -> _PiPackageState:
    settings_path = _target(root, PI_SETTINGS)
    settings, _ = _load_json_object(settings_path, "Pi project settings")
    packages = settings.get("packages", [])
    if not isinstance(packages, list):
        raise ValueError(f"packages must be an array in {settings_path}")
    sources: list[str] = []
    extension_filtered_sources: set[str] = set()
    for entry in packages:
        if isinstance(entry, str):
            source = entry
        elif isinstance(entry, dict) and isinstance(entry.get("source"), str):
            source = entry["source"]
            if entry.get("autoload") is False or "extensions" in entry:
                extension_filtered_sources.add(source)
        else:
            raise ValueError(f"malformed package entry in {settings_path}")
        sources.append(source)
    configured: set[str] = set()
    for required, identifying_fragment in (
        (PI_ADAPTER, "pi-mcp-adapter"),
        (PI_TOOLS, "@harnessctl/pi-tools"),
    ):
        exact_count = sources.count(required)
        related_sources = [source for source in sources if identifying_fragment in source]
        if exact_count > 1:
            raise ValueError(
                f"duplicate exact Pi package entries for {required} in {settings_path}"
            )
        if related_sources and related_sources != [required]:
            raise ValueError(
                f"wrong Pi package source in {settings_path}; expected exactly {required}"
            )
        if required in extension_filtered_sources:
            raise ValueError(f"Pi package {required} must load all extensions in {settings_path}")
        if exact_count == 1:
            configured.add(required)
    return _PiPackageState(configured=frozenset(configured))


def _authorize_pi_package_install(
    source: str,
    noninteractive_opt_in: bool,
    confirmation: Callable[[str], bool] | None,
) -> None:
    disclosure = (
        f"Harnessctl must run `pi install -l {source} --approve`, modifying "
        f".pi/settings.json and project-local .pi/npm; {PI_RESIDUAL_EFFECTS}."
    )
    print(disclosure, file=sys.stderr)
    if confirmation is not None:
        if not confirmation(disclosure):
            raise RuntimeError(f"Pi package installation was not approved: {source}")
        return
    if not noninteractive_opt_in:
        raise RuntimeError(
            f"Pi requires {source}; install it manually or pass "
            "--allow-pi-package-install in noninteractive operation "
            "(--allow-pi-mcp-adapter-install remains a compatible alias)"
        )


def _pi_invocation(
    pi_path: str, action: str, source: str = PI_ADAPTER, *, windows: bool | None = None
) -> tuple[list[str], bool]:
    if source not in {PI_ADAPTER, PI_TOOLS}:
        raise ValueError(f"unsupported Pi package source: {source}")
    package_args = [action, "-l", source, "--approve"]
    suffix = Path(pi_path).suffix.lower()
    is_windows = os.name == "nt" if windows is None else windows
    if not is_windows:
        return [pi_path, *package_args], False
    if suffix == ".exe":
        return [pi_path, *package_args], False
    if suffix not in {".cmd", ".bat"}:
        raise RuntimeError("Windows Pi executable must be an .exe, .cmd, or .bat")
    prohibited = '\r\n\x00"%!^&|<>'
    if any(character in pi_path for character in prohibited):
        raise RuntimeError("unsafe Windows Pi shim path")
    cmd_path = shutil.which("cmd.exe")
    if cmd_path is None:
        raise RuntimeError("Windows Pi shim requires cmd.exe on PATH")
    command = f'"{pi_path}" {" ".join(package_args)}'
    return [cmd_path, "/d", "/s", "/c", command], False


def _preflight_pi_launcher() -> str:
    pi_path = shutil.which("pi")
    if pi_path is None:
        raise RuntimeError("Pi package installation requires pi on PATH")
    _pi_invocation(pi_path, "install")
    return pi_path


def _run_pi_package_action(
    root: Path,
    action: str,
    source: str,
    *,
    pi_executable: str | None = None,
) -> None:
    pi_path = pi_executable or shutil.which("pi")
    if pi_path is None:
        raise RuntimeError("Pi package action requires pi on PATH")
    invocation, use_shell = _pi_invocation(pi_path, action, source)
    try:
        result = subprocess.run(
            invocation,
            cwd=root,
            shell=use_shell,
            check=False,
            capture_output=True,
            timeout=PI_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(f"pi {action} timed out; result may be ambiguous") from error
    try:
        stdout = result.stdout.decode("utf-8", errors="strict")
        stderr = result.stderr.decode("utf-8", errors="strict")
    except UnicodeDecodeError as error:
        raise RuntimeError(f"pi {action} produced undecodable output") from error
    if result.returncode != 0:
        detail = (stderr or stdout).strip()
        raise RuntimeError(f"pi {action} failed with exit {result.returncode}: {detail}")


def _restore_before_image(
    root: Path, path: Path, before: tuple[bool, bytes]
) -> list[BaseException]:
    try:
        _target(root, path.relative_to(root))
        existed, content = before
        if existed:
            path.parent.mkdir(parents=True, exist_ok=True)
            write_atomic_bytes(path, content)
        else:
            path.unlink(missing_ok=True)
        if path.exists() != existed or (existed and path.read_bytes() != content):
            raise RuntimeError(f"failed to verify exact rollback of {path}")
    except BaseException as error:
        return [error]
    return []


def _capture_before_image(path: Path) -> tuple[bool, bytes]:
    """Capture one validated regular-file before-image without following symlinks."""
    if path.is_symlink():
        raise ValueError(f"managed target must not be a symlink: {path}")
    if not path.exists():
        return False, b""
    if not path.is_file():
        raise IsADirectoryError(f"target is not a regular file: {path}")
    return True, path.read_bytes()


def _capture_before_images(paths: Iterable[Path]) -> list[tuple[Path, bool, bytes]]:
    """Capture every unique owned file before an external package can mutate it."""
    captured: list[tuple[Path, bool, bytes]] = []
    seen: set[Path] = set()
    for path in paths:
        if path in seen:
            continue
        seen.add(path)
        existed, content = _capture_before_image(path)
        captured.append((path, existed, content))
    return captured


def _smoke_check_mcp(root: Path, harness: str, intents: list[ServerIntent]) -> None:
    if harness in ("opencode", "all") and intents:
        document, _ = _load_json_object(
            _target(root, OPENCODE_CONFIG), "OpenCode MCP configuration"
        )
        for intent in intents:
            if document.get("mcp", {}).get(intent.server_id) != render_opencode_mcp(intent):
                raise RuntimeError(f"OpenCode MCP smoke check failed for {intent.server_id}")
    if harness in ("pi", "all") and intents:
        document, _ = _load_json_object(_target(root, PI_MCP_CONFIG), "Pi MCP configuration")
        for intent in intents:
            if document.get("mcpServers", {}).get(intent.server_id) != render_pi_mcp(intent):
                raise RuntimeError(f"Pi MCP smoke check failed for {intent.server_id}")
        if document.get("settings", {}).get("outputGuard") != OUTPUT_GUARD:
            raise RuntimeError("Pi settings.outputGuard smoke check failed")
        if PI_ADAPTER not in _inspect_pi_packages(root).configured:
            raise RuntimeError("Pi adapter package smoke check failed")


def _smoke_check_pi(
    root: Path,
    required_packages: tuple[str, ...],
    rendered_targets: list[tuple[Path, str]],
) -> None:
    """Verify Pi discovery paths and exact package registrations."""
    command_directory = _target(root, TARGETS["pi"])
    actual_commands = {path.stem for path in command_directory.glob("*.md") if path.is_file()}
    if not set(COMMANDS) <= actual_commands:
        raise RuntimeError("Pi command smoke check failed")
    for skill in ("cvs", "issue-tracking", "caveman", "memory", "sdlc"):
        skill_path = _target(root, Path(f".pi/skills/{skill}/SKILL.md"))
        if not skill_path.is_file():
            raise RuntimeError(f"Pi {skill} skill smoke check failed")
    for target, expected in rendered_targets:
        if target == root / ".pi" or root / ".pi" not in target.parents:
            continue
        if target.read_text(encoding="utf-8") != expected:
            raise RuntimeError(f"Pi owned-file smoke check failed for {target}")
    configured = _inspect_pi_packages(root).configured
    missing = [source for source in required_packages if source not in configured]
    if missing:
        raise RuntimeError(f"Pi package smoke check failed; missing {', '.join(missing)}")


def write_atomic(target: Path, content: str) -> None:
    """Write content through a same-directory temporary file and atomic replace."""
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as temporary:
            temporary.write(content)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_name, target)
    except BaseException:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(temporary_name)
        raise


def write_atomic_bytes(target: Path, content: bytes) -> None:
    """Restore exact bytes through a same-directory atomic replacement."""
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
    try:
        with os.fdopen(descriptor, "wb") as temporary:
            temporary.write(content)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_name, target)
    except BaseException:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(temporary_name)
        raise


def _target(root: Path, relative: Path) -> Path:
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"target escapes project root: {relative}")
    target = root
    for part in relative.parts:
        if part in ("", "."):
            continue
        target /= part
        if target.is_symlink():
            raise ValueError(f"managed target path must not contain symlinks: {target}")
    resolved = target.resolve()
    if resolved != root and root not in resolved.parents:
        raise ValueError(f"target escapes project root: {relative}")
    return target


def _ensure_directory(directory: Path, root: Path, created: list[Path]) -> None:
    """Create a directory path while recording only directories created by this call."""
    missing: list[Path] = []
    current = directory
    while current != root:
        if root not in current.parents:
            raise ValueError(f"directory escapes project root: {directory}")
        if current.exists():
            if not current.is_dir():
                raise NotADirectoryError(f"path is not a directory: {current}")
            break
        missing.append(current)
        current = current.parent

    for path in reversed(missing):
        try:
            path.mkdir()
        except FileExistsError:
            if not path.is_dir():
                raise
        else:
            created.append(path)


def _validate_plan(
    root: Path,
    rendered_targets: list[tuple[Path, str]],
    config: Mapping[str, Any],
    harness: str,
    retired_targets: Iterable[Path] = (),
) -> None:
    """Validate every file and directory kind before the first mutation."""
    directories = {target.parent for target, _ in rendered_targets}
    for target, _ in rendered_targets:
        if target.exists() and not target.is_file():
            raise IsADirectoryError(f"target is not a regular file: {target}")
    for target in retired_targets:
        if target.exists() and not target.is_file():
            raise IsADirectoryError(f"retired target is not a regular file: {target}")
    if config["memory"]["enabled"]:
        memory_root = _target(root, Path(str(config["memory"]["repository"]["root"])))
        directories.update(
            memory_root / folder
            for folder in ("facts", "decisions", "events", "lessons", "tombstones")
        )
    for directory in directories:
        current = directory
        while current != root:
            if current.exists() and not current.is_dir():
                raise NotADirectoryError(f"path is not a directory: {current}")
            current = current.parent


def _detect_legacy_commands(
    command_targets: Mapping[Path, tuple[str, str]], retired_targets: Iterable[Path]
) -> list[Path]:
    """Return every selected-harness legacy path in stable path order."""
    detected = [target for target in retired_targets if target.exists()]
    for target, (command, rendered) in command_targets.items():
        if (
            command in OVERLAPPING_SDLC_COMMANDS
            and target.exists()
            and target.read_bytes() != rendered.encode("utf-8")
        ):
            detected.append(target)
    return sorted(set(detected), key=lambda path: str(path))


def _initialize_memory_paths(
    root: Path,
    repository: dict[str, object],
    created_directories: list[Path],
) -> None:
    memory_root = _target(root, Path(str(repository["root"])))
    for folder in ("facts", "decisions", "events", "lessons", "tombstones"):
        _ensure_directory(memory_root / folder, root, created_directories)


def _rollback(
    root: Path,
    previous: list[tuple[Path, bool, bytes]],
    created_directories: list[Path],
) -> list[BaseException]:
    """Restore file before-images, then remove transaction-created empty directories."""
    errors: list[BaseException] = []
    for target, existed, content in reversed(previous):
        try:
            _target(root, target.relative_to(root))
            if existed:
                write_atomic_bytes(target, content)
            else:
                target.unlink(missing_ok=True)
            if target.exists() != existed or (existed and target.read_bytes() != content):
                raise RuntimeError(f"failed to verify exact rollback of {target}")
        except BaseException as error:
            errors.append(error)

    directories = sorted(set(created_directories), key=lambda path: len(path.parts), reverse=True)
    for directory in directories:
        try:
            directory.rmdir()
        except FileNotFoundError:
            continue
        except OSError as error:
            if error.errno not in (errno.ENOTEMPTY, errno.EEXIST):
                errors.append(error)
    return errors


def _memory_ignore(root: Path, repository: dict[str, object]) -> str:
    del repository
    cache = _target(root, LOCAL_CACHE)
    ignore = root / ".gitignore"
    entry = f"/{cache.parent.relative_to(root).as_posix()}/"
    existing = ignore.read_text(encoding="utf-8") if ignore.exists() else ""
    if entry in existing.splitlines():
        return existing
    return existing + ("" if not existing or existing.endswith("\n") else "\n") + entry + "\n"


def _smoke_check(root: Path, *, check_memory: bool, check_tdd: bool) -> None:
    issue_skill = root / OPENCODE_SKILLS / "issue-tracking/SKILL.md"
    if not issue_skill.is_file():
        raise RuntimeError("OpenCode issue-tracking skill smoke check failed")

    sdlc_skill = root / OPENCODE_SKILLS / "sdlc/SKILL.md"
    if not sdlc_skill.is_file():
        raise RuntimeError("OpenCode SDLC skill smoke check failed")
    for relative in render_skill_resources(
        "sdlc",
        memory_hooks_enabled=check_memory,
        retrieval_limit=1,
        retrieval_max_chars=1,
        tdd_enabled=check_tdd,
    ):
        if not (root / OPENCODE_SKILLS / "sdlc" / relative).is_file():
            raise RuntimeError(f"OpenCode SDLC resource smoke check failed: {relative}")

    if check_tdd and not (root / OPENCODE_SKILLS / TDD_SKILL).is_file():
        raise RuntimeError("OpenCode develop-tdd skill smoke check failed")

    config, _ = _load_json_object(root / OPENCODE_CONFIG, "OpenCode configuration")
    plugins = config.get("plugin")
    if not isinstance(plugins, list) or OPENCODE_TOOLS_PLUGIN not in plugins:
        raise RuntimeError("OpenCode tools plugin registration smoke check failed")

    if not check_memory:
        return

    memory_skill = root / OPENCODE_SKILLS / "memory/SKILL.md"
    if not memory_skill.is_file():
        raise RuntimeError("OpenCode memory skill smoke check failed")


def render_command(
    harness: str,
    command: str,
    *,
    config: Mapping[str, Any] | None = None,
) -> str:
    """Render one supported command for a harness."""
    if command not in COMMANDS:
        raise ValueError(f"unsupported command: {command}")

    return render_prompt(command, harness, config=config)


def main() -> int:
    """Run the installer CLI."""
    parser = argparse.ArgumentParser(description="Install harnessctl SDLC prompts")
    parser.add_argument("--cwd", type=Path, default=Path.cwd())
    parser.add_argument("--harness", choices=["opencode", "pi", "all"], default="all")
    parser.add_argument("--force", action="store_true")
    parser.add_argument(
        "--replace-sdlc-command-set",
        action="store_true",
        help="replace legacy Plan/Verify outputs and delete the 16 retired SDLC commands",
    )
    parser.add_argument(
        "--allow-pi-package-install",
        "--allow-pi-mcp-adapter-install",
        dest="allow_pi_package_install",
        action="store_true",
        help="allow required project-local Pi package installs without an interactive prompt",
    )
    args = parser.parse_args()
    confirmation: Callable[[str], bool] | None = None
    if sys.stdin.isatty():

        def confirm_install(_disclosure: str) -> bool:
            answer = input("Install disclosed project-local Pi package? [y/N] ")
            return answer.strip().lower() in {"y", "yes"}

        confirmation = confirm_install
    try:
        for target in install(
            args.cwd,
            args.harness,
            args.force,
            replace_sdlc_command_set=args.replace_sdlc_command_set,
            allow_pi_package_install=args.allow_pi_package_install,
            confirm_pi_mcp_adapter_install=confirmation,
            disclose_sdlc_replacement=lambda message: print(message, file=sys.stderr),
        ):
            print(f"Installed {target}")
    except (ConfigError, FileExistsError, OSError, RuntimeError, ValueError) as error:
        parser.error(str(error))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
