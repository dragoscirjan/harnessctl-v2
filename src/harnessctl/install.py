"""Install compiled harnessctl prompts into a project."""

from __future__ import annotations

import argparse
import contextlib
import errno
import hashlib
import json
import os
import secrets
import shutil
import stat
import subprocess
import sys
import tempfile
import warnings
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import CODE_INDEX_SKILL_ID, ConfigError, load_config
from .mcp import (
    OUTPUT_GUARD,
    ServerIntent,
    deduplicate_server_intents,
    recognized_server_intents,
    render_opencode_mcp,
    render_pi_mcp,
    required_server_intents,
)
from .templates import (
    SKILL_ID_MIGRATIONS,
    TEMPLATES,
    render_prompt,
    render_skill,
    render_skill_resources,
)

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
PI_SKILLS = Path(".pi/skills")
CODE_INDEX_SKILL = Path("sdlc-code-index/SKILL.md")
TDD_SKILL = Path("sdlc-develop-tdd/SKILL.md")
OPENCODE_PLUGIN = Path(".opencode/plugins/harnessctl-memory.js")
LEGACY_PLUGIN_CONTENT = "export { CustomToolsPlugin } from '@harnessctl/opencode-tools';\n"
OPENCODE_TOOLS_VERSION = "0.1.10"
OPENCODE_TOOLS_PLUGIN = f"@harnessctl/opencode-tools@{OPENCODE_TOOLS_VERSION}"
LOCAL_CACHE = Path(".harnessctl/cache/harnessctl.sqlite")
MCP_PROVENANCE = Path(".harnessctl/mcp-provenance-v1.json")
OPENCODE_CONFIG = Path(".opencode/opencode.json")
PI_MCP_CONFIG = Path(".pi/mcp.json")
PI_SETTINGS = Path(".pi/settings.json")
PI_ADAPTER = "npm:pi-mcp-adapter@2.26.0"
PI_ASK_USER_QUESTION = "npm:@juicesharp/rpiv-ask-user-question@2.7.1"
PI_TOOLS_VERSION = "0.1.10"
PI_TOOLS = f"npm:@harnessctl/pi-tools@{PI_TOOLS_VERSION}"
PI_TIMEOUT_SECONDS = 120
PI_RESIDUAL_EFFECTS = (
    "project-local .pi/npm, package-manager metadata, downloads, caches, "
    "lifecycle-script effects, and other external state may remain"
)
PI_HOME_ENVIRONMENT_VARIABLES = frozenset(
    {"HOME", "HOMEDRIVE", "HOMEPATH", "USERPROFILE", "XDG_CONFIG_HOME"}
)
PI_AGENT_DIRECTORY_ENVIRONMENT_VARIABLE = "PI_CODING_AGENT_DIR"
RETIRED_DOCUMENT_SKILL = Path("sdlc-documents")
RETIRED_DOCUMENT_SKILL_SIZE = 2713
RETIRED_DOCUMENT_SKILL_SHA256 = "46e4530daf5ef7cc5052eab84e4710ad4e8cc843b373928ae9b1c8bb65f4faa9"


@dataclass(frozen=True)
class _PathIdentity:
    device: int
    inode: int
    ctime_ns: int


@dataclass(frozen=True)
class _RetiredDocumentSkillCleanup:
    directory: Path
    file: Path
    directory_identity: _PathIdentity
    file_identity: _PathIdentity


def install(
    cwd: Path,
    harness: str,
    force: bool = False,
    *,
    replace_sdlc_command_set: bool = False,
    replace_sdlc_skill_set: bool = False,
    allow_pi_package_install: bool = False,
    allow_pi_mcp_adapter_install: bool = False,
    confirm_pi_mcp_adapter_install: Callable[[str], bool] | None = None,
    disclose_sdlc_replacement: Callable[[str], None] | None = None,
    disclose_skill_replacement: Callable[[str], None] | None = None,
) -> list[Path]:
    """Install prompt files for one harness or all supported harnesses."""
    if harness == "all":
        harnesses: Iterable[str] = tuple(TARGETS)
    elif harness in TARGETS:
        harnesses = (harness,)
    else:
        raise ValueError(f"unsupported harness: {harness}")

    root = cwd.resolve(strict=True)
    if not root.is_dir():
        raise NotADirectoryError(f"installation root is not a directory: {root}")
    config = load_config(root)
    if harness in ("opencode", "all") and config["mcp"]["output_limit_mode"] == "hard":
        raise ConfigError("mcp.output_limit_mode=hard is supported only by Pi")

    retired_document_skill_cleanups = _plan_retired_document_skill_cleanup(root, harnesses)

    intents = deduplicate_server_intents(required_server_intents(config, harness))
    intents = _available_server_intents(intents)
    recognized_intents = recognized_server_intents(config, harness)
    provenance_path = _target(root, MCP_PROVENANCE)
    provenance, provenance_original = _load_mcp_provenance(provenance_path)
    next_provenance = {host: dict(definitions) for host, definitions in provenance.items()}
    rendered_targets: list[tuple[Path, str]] = []
    command_targets: dict[Path, tuple[str, str]] = {}
    retired_targets: list[Path] = []
    conflicts: list[Path] = []
    code_index = config["skills"][CODE_INDEX_SKILL_ID]
    code_index_enabled = bool(code_index["enabled"])
    code_index_skill_content = (
        render_skill("sdlc-code-index", mcp_server=code_index["mcpName"])
        if code_index_enabled
        else ""
    )
    dormant_code_index_skills: list[Path] = []
    if not code_index_enabled:
        for selected_harness in harnesses:
            skill_root = OPENCODE_SKILLS if selected_harness == "opencode" else PI_SKILLS
            relative_skill = skill_root / CODE_INDEX_SKILL
            if _target(root, relative_skill).is_file():
                dormant_code_index_skills.append(relative_skill)
    tdd_enabled = bool(config["skills"]["tdd"]["enabled"])
    tdd_skill_content = render_skill("sdlc-develop-tdd")
    sdlc_context = {
        "memory_hooks_enabled": bool(config["skills"]["memory"]["enabled"]),
        "retrieval_limit": config["skills"]["memory"]["retrieval"]["limit"],
        "retrieval_max_chars": config["skills"]["memory"]["retrieval"]["max_chars"],
        "tdd_enabled": tdd_enabled,
        "code_index_enabled": code_index_enabled,
        "documents_root": config["skills"]["documents"]["root"],
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
            OPENCODE_SKILLS / "sdlc-code",
            "sdlc-code",
            {},
        )
        _append_skill_tree(
            rendered_targets,
            root,
            OPENCODE_SKILLS / "sdlc",
            "sdlc",
            sdlc_context,
        )
        cvs = config["skills"]["cvs"]
        cvs_remote = cvs["provider"]
        cvs_mcp_id = _mcp_id(intents, "cvs", cvs_remote["type"])
        rendered_targets.append(
            (
                _target(root, OPENCODE_SKILLS / "sdlc-cvs/SKILL.md"),
                render_skill(
                    "sdlc-cvs",
                    local=cvs["local"],
                    provider=cvs_remote["type"],
                    tools=cvs_remote["tools"],
                    remote_url=cvs_remote["url"],
                    token_env=cvs_remote["token_env"],
                    mcp_id=cvs_mcp_id,
                    mcp_available=cvs_mcp_id is not None,
                ),
            )
        )
        issues = config["skills"]["issues"]
        issue_provider = issues["provider"]
        issue_context: dict[str, object] = {
            "provider": issue_provider["type"],
            "tools": issue_provider["tools"],
        }
        if issue_provider["type"] == "filesystem":
            issue_context.update(issue_root=issues["root"], issue_prefix=issues["prefix"])
        else:
            issue_mcp_id = _mcp_id(intents, "issues", issue_provider["type"])
            issue_context.update(
                remote_url=issue_provider["url"],
                token_env=issue_provider["token_env"],
                mcp_id=issue_mcp_id,
                mcp_available=issue_mcp_id is not None,
            )
        rendered_targets.append(
            (
                _target(root, OPENCODE_SKILLS / "sdlc-issue-tracking/SKILL.md"),
                render_skill("sdlc-issue-tracking", **issue_context),
            )
        )
        communication = config["skills"]["caveman"]
        if communication["enabled"]:
            rendered_targets.append(
                (
                    _target(root, OPENCODE_SKILLS / "sdlc-caveman/SKILL.md"),
                    render_skill("sdlc-caveman", mode=communication["mode"]),
                )
            )
        memory = config["skills"]["memory"]
        if memory["enabled"]:
            retrieval = memory["retrieval"]
            rendered_targets.extend(
                [
                    (
                        _target(root, OPENCODE_SKILLS / "sdlc-memory/SKILL.md"),
                        render_skill(
                            "sdlc-memory",
                            retrieval_limit=retrieval["limit"],
                            max_chars=retrieval["max_chars"],
                            repository_root=memory["root"],
                        ),
                    ),
                ]
            )
        if tdd_enabled:
            rendered_targets.append((_target(root, OPENCODE_SKILLS / TDD_SKILL), tdd_skill_content))
        if code_index_enabled:
            rendered_targets.append(
                (_target(root, OPENCODE_SKILLS / CODE_INDEX_SKILL), code_index_skill_content)
            )
    if harness in ("pi", "all"):
        _append_skill_tree(
            rendered_targets,
            root,
            PI_SKILLS / "sdlc-code",
            "sdlc-code",
            {},
        )
        _append_skill_tree(
            rendered_targets,
            root,
            PI_SKILLS / "sdlc",
            "sdlc",
            sdlc_context,
        )
        cvs = config["skills"]["cvs"]
        cvs_remote = cvs["provider"]
        cvs_mcp_id = _mcp_id(intents, "cvs", cvs_remote["type"])
        rendered_targets.append(
            (
                _target(root, PI_SKILLS / "sdlc-cvs/SKILL.md"),
                render_skill(
                    "sdlc-cvs",
                    local=cvs["local"],
                    provider=cvs_remote["type"],
                    tools=cvs_remote["tools"],
                    remote_url=cvs_remote["url"],
                    token_env=cvs_remote["token_env"],
                    mcp_id=cvs_mcp_id,
                    mcp_available=cvs_mcp_id is not None,
                ),
            )
        )
        issues = config["skills"]["issues"]
        issue_provider = issues["provider"]
        issue_context = {
            "provider": issue_provider["type"],
            "tools": issue_provider["tools"],
        }
        if issue_provider["type"] == "filesystem":
            issue_context.update(issue_root=issues["root"], issue_prefix=issues["prefix"])
        else:
            issue_mcp_id = _mcp_id(intents, "issues", issue_provider["type"])
            issue_context.update(
                remote_url=issue_provider["url"],
                token_env=issue_provider["token_env"],
                mcp_id=issue_mcp_id,
                mcp_available=issue_mcp_id is not None,
            )
        rendered_targets.extend(
            [
                (
                    _target(root, PI_SKILLS / "sdlc-issue-tracking/SKILL.md"),
                    render_skill("sdlc-issue-tracking", **issue_context),
                ),
                (
                    _target(root, PI_SKILLS / "sdlc-caveman/SKILL.md"),
                    render_skill("sdlc-caveman", mode=config["skills"]["caveman"]["mode"]),
                ),
                (
                    _target(root, PI_SKILLS / "sdlc-memory/SKILL.md"),
                    render_skill(
                        "sdlc-memory",
                        retrieval_limit=config["skills"]["memory"]["retrieval"]["limit"],
                        max_chars=config["skills"]["memory"]["retrieval"]["max_chars"],
                        repository_root=config["skills"]["memory"]["root"],
                    ),
                ),
            ]
        )
        if tdd_enabled:
            rendered_targets.append((_target(root, PI_SKILLS / TDD_SKILL), tdd_skill_content))
        if code_index_enabled:
            rendered_targets.append(
                (_target(root, PI_SKILLS / CODE_INDEX_SKILL), code_index_skill_content)
            )
    if config["skills"]["memory"]["enabled"]:
        rendered_targets.append(
            (
                _target(root, Path(".gitignore")),
                _memory_ignore(root),
            )
        )
    if harness in ("opencode", "all"):
        opencode_path = _target(root, OPENCODE_CONFIG)
        previous_opencode = provenance["opencode"]
        recognized_opencode = _merge_recognized_mcp_definitions(
            _recognized_mcp_definitions(recognized_intents, render_opencode_mcp),
            previous_opencode,
        )
        opencode_content = _merge_opencode_json(
            opencode_path,
            intents,
            recognized=recognized_opencode,
            generated=previous_opencode,
            force=force,
        )
        next_provenance["opencode"] = _next_generic_mcp_provenance(
            opencode_path,
            "mcp",
            intents,
            render_opencode_mcp,
            previous_opencode,
        )
        if opencode_content is not None:
            rendered_targets.append((opencode_path, opencode_content))

    pi_state: _PiPackageState | None = None
    pi_executable: str | None = None
    required_pi_packages: tuple[str, ...] = ()
    if harness in ("pi", "all"):
        previous_pi = provenance["pi"]
        recognized_pi = _merge_recognized_mcp_definitions(
            _recognized_mcp_definitions(recognized_intents, render_pi_mcp),
            previous_pi,
        )
        if intents or recognized_pi:
            pi_mcp_path = _target(root, PI_MCP_CONFIG)
            pi_content = _merge_pi_json(
                pi_mcp_path,
                intents,
                recognized=recognized_pi,
                generated=previous_pi,
                force=force,
            )
            next_provenance["pi"] = _next_generic_mcp_provenance(
                pi_mcp_path,
                "mcpServers",
                intents,
                render_pi_mcp,
                previous_pi,
            )
            if pi_content is not None:
                rendered_targets.append((pi_mcp_path, pi_content))
        required_pi_packages = (
            PI_TOOLS,
            PI_ASK_USER_QUESTION,
            *((PI_ADAPTER,) if intents else ()),
        )
        pi_settings_path = _target(root, PI_SETTINGS)
        pi_settings_content = _merge_pi_settings(pi_settings_path)
        if pi_settings_content is not None:
            rendered_targets.append((pi_settings_path, pi_settings_content))
        pi_state = _inspect_pi_packages(root)
        if any(source not in pi_state.configured for source in required_pi_packages):
            pi_executable = _preflight_pi_launcher()

    if provenance_original is not None or any(next_provenance.values()):
        provenance_content = _render_mcp_provenance(next_provenance)
        if provenance_original != provenance_content.encode("utf-8"):
            rendered_targets.append((provenance_path, provenance_content))

    mergeable_targets = {
        _target(root, Path(".gitignore")),
        _target(root, OPENCODE_CONFIG),
        _target(root, PI_MCP_CONFIG),
        _target(root, PI_SETTINGS),
        provenance_path,
    }
    _validate_plan(root, rendered_targets, config, harness, retired_targets)
    legacy_skill_roots = _detect_legacy_skill_roots(root, harnesses)
    legacy_skill_directories: list[Path] = []
    legacy_skill_files: list[Path] = []
    if replace_sdlc_skill_set:
        legacy_skill_directories, legacy_skill_files = _validate_legacy_skill_trees(
            legacy_skill_roots
        )
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
    if legacy_skill_roots:
        joined = "\n".join(f"- {path}" for path in legacy_skill_roots)
        if replace_sdlc_skill_set:
            disclosure = (
                "Replacing legacy SDLC support skill directories. These directories may contain "
                f"custom changes and will be deleted:\n{joined}"
            )
            if disclose_skill_replacement is None:
                warnings.warn(disclosure, UserWarning, stacklevel=2)
            else:
                disclose_skill_replacement(disclosure)
        else:
            warnings.warn(
                "Legacy SDLC support skill directories remain unchanged and discoverable alongside "
                "the new sdlc-prefixed skills. Remove them manually or rerun with "
                f"--replace-sdlc-skill-set:\n{joined}",
                UserWarning,
                stacklevel=2,
            )
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
            *(legacy_skill_files if replace_sdlc_skill_set else ()),
        ]
    )
    deleted_retired_document_skills: list[tuple[_RetiredDocumentSkillCleanup, bytes]] = []
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
        if replace_sdlc_skill_set:
            for target in reversed(legacy_skill_files):
                mutation_started = True
                _target(root, target.relative_to(root))
                target.unlink()
            for directory in sorted(
                legacy_skill_directories, key=lambda path: len(path.parts), reverse=True
            ):
                mutation_started = True
                _target(root, directory.relative_to(root))
                directory.rmdir()
        if config["skills"]["memory"]["enabled"]:
            mutation_started = True
            _initialize_memory_paths(
                root,
                config["skills"]["memory"],
                created_directories,
            )
        if harness in ("opencode", "all"):
            _smoke_check(
                root,
                check_memory=config["skills"]["memory"]["enabled"],
                check_tdd=tdd_enabled,
                check_code_index=code_index_enabled,
                documents_root=config["skills"]["documents"]["root"],
            )
        if harness in ("pi", "all"):
            _smoke_check_pi(root, required_pi_packages, rendered_targets)
        _smoke_check_mcp(root, harness, intents)
        for relative_skill in dormant_code_index_skills:
            warnings.warn(
                f"sdlc-code-index is disabled, but {relative_skill.as_posix()} remains "
                "discoverable and active-capable; remove it manually to deactivate it",
                UserWarning,
                stacklevel=2,
            )
        for cleanup in retired_document_skill_cleanups:
            mutation_started = True
            _remove_retired_document_skill(root, cleanup, deleted_retired_document_skills)
    except BaseException as error:
        rollback_errors: list[BaseException] = []
        for source in reversed(installed_pi_packages):
            try:
                _run_pi_package_action(root, "remove", source)
            except BaseException as cleanup_error:
                rollback_errors.append(cleanup_error)
        if mutation_started:
            rollback_errors.extend(
                _rollback(
                    root,
                    previous,
                    created_directories,
                    legacy_skill_directories if replace_sdlc_skill_set else (),
                )
            )
            rollback_errors.extend(
                _restore_retired_document_skills(root, deleted_retired_document_skills)
            )
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
class _ManagedPackageSource:
    source: str
    prefix: str
    package: str
    version: str | None

    @property
    def is_default_latest(self) -> bool:
        return self.version in (None, "latest")


@dataclass(frozen=True)
class _PiPackageState:
    configured: frozenset[str]


def _parse_managed_package_source(
    source: str, package: str, *, prefix: str = ""
) -> _ManagedPackageSource | None:
    if not source.startswith(prefix):
        return None
    specifier = source[len(prefix) :]
    if specifier == package:
        return _ManagedPackageSource(source=source, prefix=prefix, package=package, version=None)
    if not specifier.startswith(f"{package}@"):
        return None
    version = specifier[len(package) + 1 :]
    if not version:
        return None
    return _ManagedPackageSource(source=source, prefix=prefix, package=package, version=version)


def _is_managed_package_source(source: str, package: str, *, prefix: str = "") -> bool:
    return _parse_managed_package_source(source, package, prefix=prefix) is not None


def _available_server_intents(intents: list[ServerIntent]) -> list[ServerIntent]:
    """Omit local MCP servers whose operator-installed executable is unavailable."""
    availability = {
        command: shutil.which(command) is not None
        for command in {intent.command for intent in intents if intent.command is not None}
    }
    return [
        intent
        for intent in intents
        if intent.provider == "generic"
        or intent.command is None
        or availability.get(intent.command, False)
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


def _mcp_id(intents: list[ServerIntent], route: str, provider: str) -> str | None:
    """Return the projected MCP server ID referenced by one configured route."""
    del provider  # Provider metadata selects guidance; it never defines MCP transport intent.
    return next(
        (intent.server_id for intent in intents if route in intent.requesting_routes),
        None,
    )


def _reject_duplicate_members(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, member in pairs:
        if key in value:
            raise ValueError(f"duplicate JSON member: {key}")
        value[key] = member
    return value


def _json_values_equal(left: Any, right: Any) -> bool:
    """Compare JSON values without Python's bool-number coercion."""
    if type(left) is not type(right):
        return False
    if isinstance(left, dict):
        return left.keys() == right.keys() and all(
            _json_values_equal(left[key], right[key]) for key in left
        )
    if isinstance(left, list):
        return len(left) == len(right) and all(
            _json_values_equal(left_item, right_item)
            for left_item, right_item in zip(left, right, strict=True)
        )
    return left == right


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


def _raw_json_object_members(source: str) -> dict[str, str]:
    """Return each object member's exact JSON value text."""
    decoder = json.JSONDecoder()
    length = len(source)

    def skip_whitespace(index: int) -> int:
        while index < length and source[index].isspace():
            index += 1
        return index

    index = skip_whitespace(0)
    if index >= length or source[index] != "{":
        return {}
    index += 1
    members: dict[str, str] = {}
    while True:
        index = skip_whitespace(index)
        if index < length and source[index] == "}":
            return members
        key, index = decoder.raw_decode(source, index)
        if not isinstance(key, str):
            raise ValueError("JSON object member name must be a string")
        index = skip_whitespace(index)
        if index >= length or source[index] != ":":
            raise ValueError("JSON object member must contain a colon")
        value_start = skip_whitespace(index + 1)
        _, value_end = decoder.raw_decode(source, value_start)
        members[key] = source[value_start:value_end]
        index = skip_whitespace(value_end)
        if index < length and source[index] == ",":
            index += 1
            continue
        if index < length and source[index] == "}":
            return members
        raise ValueError("JSON object members must be separated by commas")


def _dump_json_preserving_unchanged_members(
    document: dict[str, Any], original: bytes | None
) -> str:
    """Render JSON while preserving exact values outside changed owned paths."""
    rendered = json.dumps(document, indent=2, ensure_ascii=False)
    if original is None:
        return rendered + "\n"

    original_text = original.decode("utf-8")
    top_level = _raw_json_object_members(original_text)
    preserved_top_level = {
        key: raw_value
        for key, raw_value in top_level.items()
        if key in document
        and _json_values_equal(
            json.loads(raw_value, object_pairs_hook=_reject_duplicate_members), document[key]
        )
    }

    preserved_nested: dict[str, dict[str, str]] = {}
    for top_key, raw_object in top_level.items():
        current_object = document.get(top_key)
        if top_key in preserved_top_level or not isinstance(current_object, dict):
            continue
        preserved_members = {
            key: raw_value
            for key, raw_value in _raw_json_object_members(raw_object).items()
            if key in current_object
            and _json_values_equal(
                json.loads(raw_value, object_pairs_hook=_reject_duplicate_members),
                current_object[key],
            )
        }
        if preserved_members:
            preserved_nested[top_key] = preserved_members
    if not preserved_top_level and not preserved_nested:
        return rendered + "\n"

    staged = dict(document)
    replacements: list[tuple[str, str]] = []

    def preserve(target: dict[str, Any], key: str, raw_value: str) -> None:
        sentinel = f"__harnessctl_preserved_json_member_{len(replacements)}__"
        while sentinel in rendered or sentinel in original_text:
            sentinel += "_"
        target[key] = sentinel
        replacements.append((json.dumps(sentinel), raw_value))

    for key, raw_value in preserved_top_level.items():
        preserve(staged, key, raw_value)
    for top_key, preserved_members in preserved_nested.items():
        current_object = document[top_key]
        assert isinstance(current_object, dict)
        staged_object = dict(current_object)
        staged[top_key] = staged_object
        for key, raw_value in preserved_members.items():
            preserve(staged_object, key, raw_value)

    rendered = json.dumps(staged, indent=2, ensure_ascii=False)
    for sentinel, raw_value in replacements:
        rendered = rendered.replace(sentinel, raw_value, 1)
    return rendered + "\n"


def _merge_host_json(
    path: Path,
    container_name: str,
    required: Mapping[str, Mapping[str, Any]],
    *,
    recognized: Mapping[str, tuple[Mapping[str, Any], ...]] | None = None,
    generated: Mapping[str, Mapping[str, Any]] | None = None,
    force: bool,
) -> str | None:
    """Merge only fixed IDs, preserving unrelated top-level and sibling values."""
    recognized = recognized or {}
    if not required and not recognized:
        return None
    document, original = _load_json_object(path, "host MCP configuration")
    container = document.get(container_name)
    if container is None:
        if not required:
            return None
        container = {}
        document[container_name] = container
    if not isinstance(container, dict):
        raise ValueError(f"{container_name} must be a JSON object in {path}")
    changed = original is None
    changed |= _reconcile_owned_mcp_entries(
        container,
        required,
        recognized,
        generated or {},
        provenance_ids=set(),
        path=path,
        force=force,
    )
    if not changed:
        return None
    return _dump_json_preserving_unchanged_members(document, original)


def _merge_opencode_json(
    path: Path,
    intents: list[ServerIntent],
    *,
    recognized: Mapping[str, tuple[Mapping[str, Any], ...]] | None = None,
    generated: Mapping[str, Mapping[str, Any]] | None = None,
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
        source
        for source in plugins
        if _is_managed_package_source(source, "@harnessctl/opencode-tools")
    ]
    if len(managed) > 1:
        raise ValueError(f"duplicate harnessctl OpenCode plugin entries in {path}: {managed}")
    if not managed:
        plugins.append(OPENCODE_TOOLS_PLUGIN)
        changed = True
    else:
        managed_source = _parse_managed_package_source(managed[0], "@harnessctl/opencode-tools")
        if managed_source is None:
            raise ValueError(f"malformed harnessctl OpenCode plugin in {path}: {managed[0]}")
        if managed[0] != OPENCODE_TOOLS_PLUGIN:
            plugins[plugins.index(managed[0])] = OPENCODE_TOOLS_PLUGIN
            changed = True

    required = {intent.server_id: render_opencode_mcp(intent) for intent in intents}
    recognized = recognized or {}
    if required or recognized:
        container = document.get("mcp")
        if container is None:
            if not required:
                container = None
            else:
                container = {}
                document["mcp"] = container
        if container is not None and not isinstance(container, dict):
            raise ValueError(f"mcp must be a JSON object in {path}")
        if container is not None:
            changed |= _reconcile_owned_mcp_entries(
                container,
                required,
                recognized,
                generated or {},
                provenance_ids={
                    intent.server_id for intent in intents if intent.provider == "generic"
                },
                path=path,
                force=force,
            )

    if not changed:
        return None
    return _dump_json_preserving_unchanged_members(document, original)


def _merge_pi_json(
    path: Path,
    intents: list[ServerIntent],
    *,
    recognized: Mapping[str, tuple[Mapping[str, Any], ...]] | None = None,
    generated: Mapping[str, Mapping[str, Any]] | None = None,
    force: bool,
) -> str | None:
    """Merge Pi servers and the sole harnessctl-owned adapter setting."""
    recognized = recognized or {}
    if not intents and not recognized:
        return None
    document, original = _load_json_object(path, "Pi MCP configuration")
    servers = document.get("mcpServers")
    if servers is None and intents:
        servers = {}
        document["mcpServers"] = servers
    if servers is not None and not isinstance(servers, dict):
        raise ValueError(f"mcpServers must be a JSON object in {path}")
    settings = document.get("settings")
    if settings is None and intents:
        settings = {}
        document["settings"] = settings
    if settings is not None and not isinstance(settings, dict):
        raise ValueError(f"settings must be a JSON object in {path}")

    changed = original is None and bool(intents)
    if servers is not None:
        required = {intent.server_id: render_pi_mcp(intent) for intent in intents}
        changed |= _reconcile_owned_mcp_entries(
            servers,
            required,
            recognized,
            generated or {},
            provenance_ids={intent.server_id for intent in intents if intent.provider == "generic"},
            path=path,
            force=force,
        )
    if intents:
        assert settings is not None
        current_guard = settings.get("outputGuard")
        if current_guard != OUTPUT_GUARD:
            if current_guard is not None and not force:
                raise FileExistsError(f"conflicting settings.outputGuard in {path}")
            settings["outputGuard"] = dict(OUTPUT_GUARD)
            changed = True
    if not changed:
        return None
    return _dump_json_preserving_unchanged_members(document, original)


def _recognized_mcp_definitions(
    intents: list[ServerIntent],
    renderer: Callable[[ServerIntent], Mapping[str, Any]],
) -> dict[str, tuple[Mapping[str, Any], ...]]:
    definitions: dict[str, list[Mapping[str, Any]]] = {}
    for intent in intents:
        rendered = renderer(intent)
        server_definitions = definitions.setdefault(intent.server_id, [])
        if not any(_json_values_equal(rendered, value) for value in server_definitions):
            server_definitions.append(rendered)
    return {server_id: tuple(values) for server_id, values in definitions.items()}


def _load_mcp_provenance(
    path: Path,
) -> tuple[dict[str, dict[str, Mapping[str, Any]]], bytes | None]:
    """Load exact generic host definitions previously generated by harnessctl."""
    document, original = _load_json_object(path, "MCP provenance")
    if original is None:
        return {"opencode": {}, "pi": {}}, None
    if document.keys() != {"version", "hosts"} or document.get("version") != 1:
        raise ValueError(f"invalid MCP provenance contract in {path}")
    hosts = document.get("hosts")
    if not isinstance(hosts, dict) or hosts.keys() != {"opencode", "pi"}:
        raise ValueError(f"invalid MCP provenance hosts in {path}")
    result: dict[str, dict[str, Mapping[str, Any]]] = {}
    for host in ("opencode", "pi"):
        definitions = hosts[host]
        if not isinstance(definitions, dict) or not all(
            isinstance(server_id, str) and isinstance(definition, dict)
            for server_id, definition in definitions.items()
        ):
            raise ValueError(f"invalid {host} MCP provenance definitions in {path}")
        result[host] = dict(definitions)
    return result, original


def _render_mcp_provenance(
    hosts: Mapping[str, Mapping[str, Mapping[str, Any]]],
) -> str:
    """Render deterministic, credential-reference-only generic MCP provenance."""
    document = {
        "version": 1,
        "hosts": {
            host: {server_id: definition for server_id, definition in sorted(hosts[host].items())}
            for host in ("opencode", "pi")
        },
    }
    return json.dumps(document, indent=2, ensure_ascii=False) + "\n"


def _merge_recognized_mcp_definitions(
    historical: Mapping[str, tuple[Mapping[str, Any], ...]],
    generated: Mapping[str, Mapping[str, Any]],
) -> dict[str, tuple[Mapping[str, Any], ...]]:
    """Combine fixed historical values with exact prior generic projections."""
    merged = {server_id: list(definitions) for server_id, definitions in historical.items()}
    for server_id, definition in generated.items():
        definitions = merged.setdefault(server_id, [])
        if not any(_json_values_equal(definition, current) for current in definitions):
            definitions.append(definition)
    return {server_id: tuple(definitions) for server_id, definitions in merged.items()}


def _next_generic_mcp_provenance(
    path: Path,
    container_name: str,
    intents: list[ServerIntent],
    renderer: Callable[[ServerIntent], Mapping[str, Any]],
    previous: Mapping[str, Mapping[str, Any]],
) -> dict[str, Mapping[str, Any]]:
    """Retain provenance only where generation or exact prior ownership is proven."""
    document, _ = _load_json_object(path, "host MCP configuration")
    current = document.get(container_name, {})
    if not isinstance(current, dict):
        raise ValueError(f"{container_name} must be a JSON object in {path}")
    next_definitions: dict[str, Mapping[str, Any]] = {}
    for intent in intents:
        if intent.provider != "generic":
            continue
        desired = renderer(intent)
        server_id = intent.server_id
        if server_id not in current:
            next_definitions[server_id] = desired
            continue
        historical = previous.get(server_id)
        if historical is not None and _json_values_equal(current[server_id], historical):
            next_definitions[server_id] = desired
    return next_definitions


def _reconcile_owned_mcp_entries(
    container: dict[str, Any],
    required: Mapping[str, Mapping[str, Any]],
    recognized: Mapping[str, tuple[Mapping[str, Any], ...]],
    generated: Mapping[str, Mapping[str, Any]],
    *,
    provenance_ids: set[str],
    path: Path,
    force: bool,
) -> bool:
    del force  # MCP ownership cannot be reclaimed by a force path.
    changed = False
    for server_id, expected in required.items():
        current = container.get(server_id)
        if _json_values_equal(current, expected):
            previous = generated.get(server_id)
            if server_id in provenance_ids and (
                previous is None or not _json_values_equal(current, previous)
            ):
                _warn_operator_owned_mcp(server_id, path)
            continue
        historical = recognized.get(server_id, ())
        if any(_json_values_equal(current, definition) for definition in historical):
            container[server_id] = dict(expected)
            changed = True
            continue
        if server_id in container:
            _warn_operator_owned_mcp(server_id, path)
            continue
        container[server_id] = dict(expected)
        changed = True
    for server_id, definitions in recognized.items():
        if server_id in required or server_id not in container:
            continue
        current = container[server_id]
        if any(_json_values_equal(current, definition) for definition in definitions):
            del container[server_id]
            changed = True
            continue
        _warn_operator_owned_mcp(server_id, path)
    return changed


def _warn_operator_owned_mcp(server_id: str, path: Path) -> None:
    """Report a collision without including declaration or credential values."""
    warnings.warn(
        f"preserving modified MCP ID {server_id} in host target {path}; the entry is "
        "operator-owned and unchanged. Remove or rename that host entry manually to let "
        "harnessctl manage this ID",
        UserWarning,
        stacklevel=4,
    )


def _merge_pi_settings(path: Path) -> str | None:
    settings, original = _load_json_object(path, "Pi project settings")
    packages = settings.get("packages")
    if packages is None:
        return None
    if not isinstance(packages, list):
        raise ValueError(f"packages must be an array in {path}")
    changed = False
    for entry in packages:
        if isinstance(entry, str):
            source = entry
        elif isinstance(entry, dict) and isinstance(entry.get("source"), str):
            source = entry["source"]
            if entry.get("autoload") is False or "extensions" in entry:
                continue
        else:
            raise ValueError(f"malformed package entry in {path}")
        if not _is_managed_package_source(source, "@harnessctl/pi-tools", prefix="npm:"):
            continue
        if source == PI_TOOLS:
            continue
        if isinstance(entry, str):
            packages[packages.index(entry)] = PI_TOOLS
        else:
            entry["source"] = PI_TOOLS
        changed = True
    if not changed:
        return None
    return _dump_json_preserving_unchanged_members(settings, original)


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
        (PI_ASK_USER_QUESTION, "@juicesharp/rpiv-ask-user-question"),
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

    pi_tools_sources = [
        source
        for source in sources
        if _is_managed_package_source(source, "@harnessctl/pi-tools", prefix="npm:")
    ]
    if len(pi_tools_sources) > 1:
        raise ValueError(
            f"duplicate Pi package entries for @harnessctl/pi-tools in {settings_path}"
        )
    if pi_tools_sources:
        if pi_tools_sources[0] in extension_filtered_sources:
            raise ValueError(f"Pi package {PI_TOOLS} must load all extensions in {settings_path}")
        if pi_tools_sources[0] == PI_TOOLS:
            configured.add(PI_TOOLS)
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
    if source not in {PI_ADAPTER, PI_ASK_USER_QUESTION, PI_TOOLS}:
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
    with tempfile.TemporaryDirectory(prefix="harnessctl-pi-agent-") as agent_directory:
        environment = {
            name: value
            for name, value in os.environ.items()
            if name not in PI_HOME_ENVIRONMENT_VARIABLES
        }
        environment[PI_AGENT_DIRECTORY_ENVIRONMENT_VARIABLE] = agent_directory
        try:
            result = subprocess.run(
                invocation,
                cwd=root,
                env=environment,
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
            if intent.server_id not in document.get("mcp", {}):
                raise RuntimeError(f"OpenCode MCP smoke check failed for {intent.server_id}")
    if harness in ("pi", "all") and intents:
        document, _ = _load_json_object(_target(root, PI_MCP_CONFIG), "Pi MCP configuration")
        for intent in intents:
            if intent.server_id not in document.get("mcpServers", {}):
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
    for skill in (
        "sdlc-cvs",
        "sdlc-issue-tracking",
        "sdlc-caveman",
        "sdlc-memory",
        "sdlc",
        "sdlc-code",
    ):
        skill_path = _target(root, Path(f".pi/skills/{skill}/SKILL.md"))
        if not skill_path.is_file():
            raise RuntimeError(f"Pi {skill} skill smoke check failed")
    for target, expected in rendered_targets:
        if target == root / ".pi" or root / ".pi" not in target.parents:
            continue
        if target.read_bytes() != expected.encode("utf-8"):
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
    if config["skills"]["memory"]["enabled"]:
        memory_root = _target(root, Path(str(config["skills"]["memory"]["root"])))
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


def _detect_legacy_skill_roots(root: Path, harnesses: Iterable[str]) -> list[Path]:
    """Detect selected-host legacy roots without inspecting operator-owned entries."""
    roots: list[Path] = []
    for harness in harnesses:
        skill_root = OPENCODE_SKILLS if harness == "opencode" else PI_SKILLS
        managed_root = _target(root, skill_root)
        for legacy in SKILL_ID_MIGRATIONS:
            legacy_root = managed_root / legacy
            if os.path.lexists(legacy_root):
                roots.append(legacy_root)
    return sorted(set(roots), key=lambda path: str(path))


def _plan_retired_document_skill_cleanup(
    root: Path, harnesses: Iterable[str]
) -> list[_RetiredDocumentSkillCleanup]:
    """Select only exact one-file Documents skill trees for transactional removal."""
    cleanups: list[_RetiredDocumentSkillCleanup] = []
    for harness in harnesses:
        skill_root = OPENCODE_SKILLS if harness == "opencode" else PI_SKILLS
        host_skill_root = _target(root, skill_root)
        retired_root = host_skill_root / RETIRED_DOCUMENT_SKILL
        if not os.path.lexists(retired_root):
            continue
        snapshot = _retired_document_skill_snapshot(retired_root)
        if snapshot is None:
            _warn_preserved_retired_document_skill(root, retired_root, stacklevel=3)
            continue
        cleanups.append(snapshot[0])
    return cleanups


def _retired_document_skill_snapshot(
    retired_root: Path,
) -> tuple[_RetiredDocumentSkillCleanup, bytes] | None:
    """Authenticate the historical one-file tree and return its exact path identities."""
    try:
        directory_metadata = os.lstat(retired_root)
    except OSError:
        return None
    if not stat.S_ISDIR(directory_metadata.st_mode):
        return None
    try:
        with os.scandir(retired_root) as iterator:
            entries = list(iterator)
    except OSError:
        return None
    if len(entries) != 1:
        return None
    entry = entries[0]
    if entry.name != "SKILL.md" or entry.is_symlink() or not entry.is_file(follow_symlinks=False):
        return None
    path = Path(entry.path)
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
        with os.fdopen(descriptor, "rb") as stream:
            metadata = os.fstat(stream.fileno())
            if (
                not stat.S_ISREG(metadata.st_mode)
                or metadata.st_size != RETIRED_DOCUMENT_SKILL_SIZE
            ):
                return None
            content = stream.read(RETIRED_DOCUMENT_SKILL_SIZE + 1)
        path_metadata = os.lstat(path)
        final_directory_metadata = os.lstat(retired_root)
    except OSError:
        return None
    if len(content) != RETIRED_DOCUMENT_SKILL_SIZE:
        return None
    if hashlib.sha256(content).hexdigest() != RETIRED_DOCUMENT_SKILL_SHA256:
        return None
    directory_identity = _path_identity(directory_metadata)
    file_identity = _path_identity(metadata)
    if (
        _path_identity(path_metadata) != file_identity
        or _path_identity(final_directory_metadata) != directory_identity
    ):
        return None
    return (
        _RetiredDocumentSkillCleanup(
            directory=retired_root,
            file=path,
            directory_identity=directory_identity,
            file_identity=file_identity,
        ),
        content,
    )


def _path_identity(metadata: os.stat_result) -> _PathIdentity:
    return _PathIdentity(
        device=metadata.st_dev,
        inode=metadata.st_ino,
        ctime_ns=metadata.st_ctime_ns,
    )


def _warn_preserved_retired_document_skill(
    root: Path, retired_root: Path, *, stacklevel: int
) -> None:
    relative = retired_root.relative_to(root).as_posix()
    with contextlib.suppress(UserWarning):
        warnings.warn(
            f"preserving modified retired Documents skill tree {relative}",
            UserWarning,
            stacklevel=stacklevel,
        )


def _remove_retired_document_skill(
    root: Path,
    cleanup: _RetiredDocumentSkillCleanup,
    deleted: list[tuple[_RetiredDocumentSkillCleanup, bytes]],
) -> bytes | None:
    """Remove one still-owned tree through a private atomic quarantine."""
    current = _retired_document_skill_snapshot(cleanup.directory)
    if current is None or current[0] != cleanup:
        _warn_preserved_retired_document_skill(root, cleanup.directory, stacklevel=3)
        return None

    quarantine = cleanup.directory.with_name(
        f".{cleanup.directory.name}.harnessctl-retiring-{secrets.token_hex(16)}"
    )
    _target(root, cleanup.directory.relative_to(root))
    _target(root, quarantine.relative_to(root))
    rollback_entry: tuple[_RetiredDocumentSkillCleanup, bytes] | None = None
    try:
        os.rename(cleanup.directory, quarantine)
        warned_about_operator_state = os.path.lexists(cleanup.directory)
        renamed_directory_identity = _path_identity(os.lstat(quarantine))
        if (
            renamed_directory_identity.device != cleanup.directory_identity.device
            or renamed_directory_identity.inode != cleanup.directory_identity.inode
        ):
            _restore_retired_document_skill_quarantine(cleanup.directory, quarantine)
            _warn_preserved_retired_document_skill(root, cleanup.directory, stacklevel=3)
            return None
        quarantined_cleanup = _RetiredDocumentSkillCleanup(
            directory=quarantine,
            file=quarantine / cleanup.file.name,
            directory_identity=renamed_directory_identity,
            file_identity=cleanup.file_identity,
        )
        quarantined = _retired_document_skill_snapshot(quarantine)
        if quarantined is None or quarantined[0] != quarantined_cleanup:
            _restore_retired_document_skill_quarantine(cleanup.directory, quarantine)
            _warn_preserved_retired_document_skill(root, cleanup.directory, stacklevel=3)
            return None
        rollback_entry = (cleanup, current[1])
        deleted.append(rollback_entry)
        quarantined_cleanup.file.unlink()
        quarantined_cleanup.directory.rmdir()
    except BaseException:
        restored = False
        try:
            if os.path.lexists(quarantine):
                if not os.path.lexists(quarantine / cleanup.file.name):
                    _write_exclusive_bytes(quarantine / cleanup.file.name, current[1])
                _restore_retired_document_skill_quarantine(cleanup.directory, quarantine)
                restored = True
        finally:
            if restored and rollback_entry is not None:
                deleted.remove(rollback_entry)
        raise
    if warned_about_operator_state or os.path.lexists(cleanup.directory):
        _warn_preserved_retired_document_skill(root, cleanup.directory, stacklevel=3)
    return current[1]


def _restore_retired_document_skill_quarantine(original: Path, quarantine: Path) -> None:
    """Restore quarantined state without replacing operator-created state."""
    if not os.path.lexists(quarantine):
        return
    if os.path.lexists(original):
        raise RuntimeError(
            "cannot restore retired Documents skill quarantine without replacing "
            f"operator state: {original} (quarantine: {quarantine})"
        )
    os.rename(quarantine, original)


def _restore_retired_document_skills(
    root: Path, deleted: Iterable[tuple[_RetiredDocumentSkillCleanup, bytes]]
) -> list[BaseException]:
    """Restore deleted managed trees without overwriting recreated operator paths."""
    errors: list[BaseException] = []
    for cleanup, content in reversed(tuple(deleted)):
        try:
            _target(root, cleanup.directory.relative_to(root))
            if os.path.lexists(cleanup.directory):
                raise RuntimeError(
                    "cannot restore retired Documents skill without replacing operator state: "
                    f"{cleanup.directory}"
                )
            cleanup.directory.mkdir()
            _write_exclusive_bytes(cleanup.file, content)
            restored = _retired_document_skill_snapshot(cleanup.directory)
            if restored is None:
                raise RuntimeError(
                    f"failed to verify retired Documents skill rollback: {cleanup.directory}"
                )
        except BaseException as error:
            errors.append(error)
    return errors


def _write_exclusive_bytes(path: Path, content: bytes) -> None:
    """Create one rollback file without following or replacing a competing path."""
    flags = (
        os.O_WRONLY
        | os.O_CREAT
        | os.O_EXCL
        | getattr(os, "O_BINARY", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    descriptor = os.open(path, flags, 0o600)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())


def _validate_legacy_skill_trees(roots: Iterable[Path]) -> tuple[list[Path], list[Path]]:
    """Validate explicitly authorized legacy trees before any mutation."""
    directories: list[Path] = []
    files: list[Path] = []
    for legacy_root in roots:
        if legacy_root.is_symlink():
            raise ValueError(f"legacy SDLC support skill root must not be a symlink: {legacy_root}")
        if not legacy_root.is_dir():
            raise NotADirectoryError(
                f"legacy SDLC support skill path is not a directory: {legacy_root}"
            )
        _collect_legacy_skill_tree(legacy_root, directories, files)
    return (
        sorted(set(directories), key=lambda path: str(path)),
        sorted(set(files), key=lambda path: str(path)),
    )


def _collect_legacy_skill_tree(directory: Path, directories: list[Path], files: list[Path]) -> None:
    """Collect regular entries without following links or accepting special files."""
    directories.append(directory)
    with os.scandir(directory) as entries:
        for entry in entries:
            path = Path(entry.path)
            if entry.is_symlink():
                raise ValueError(
                    f"legacy SDLC support skill tree must not contain symlinks: {path}"
                )
            if entry.is_dir(follow_symlinks=False):
                _collect_legacy_skill_tree(path, directories, files)
            elif entry.is_file(follow_symlinks=False):
                files.append(path)
            else:
                raise ValueError(
                    f"legacy SDLC support skill tree must contain only regular files: {path}"
                )


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
    deleted_directories: Iterable[Path] = (),
) -> list[BaseException]:
    """Restore file before-images, then remove transaction-created empty directories."""
    errors: list[BaseException] = []
    for directory in sorted(set(deleted_directories), key=lambda path: len(path.parts)):
        try:
            _target(root, directory.relative_to(root))
            directory.mkdir(exist_ok=True)
        except BaseException as error:
            errors.append(error)
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


def _memory_ignore(root: Path) -> str:
    cache = _target(root, LOCAL_CACHE)
    ignore = root / ".gitignore"
    entry = f"/{cache.parent.relative_to(root).as_posix()}/"
    existing = ignore.read_text(encoding="utf-8") if ignore.exists() else ""
    if entry in existing.splitlines():
        return existing
    return existing + ("" if not existing or existing.endswith("\n") else "\n") + entry + "\n"


def _smoke_check(
    root: Path,
    *,
    check_memory: bool,
    check_tdd: bool,
    check_code_index: bool,
    documents_root: str,
) -> None:
    issue_skill = root / OPENCODE_SKILLS / "sdlc-issue-tracking/SKILL.md"
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
        code_index_enabled=check_code_index,
        documents_root=documents_root,
    ):
        if not (root / OPENCODE_SKILLS / "sdlc" / relative).is_file():
            raise RuntimeError(f"OpenCode SDLC resource smoke check failed: {relative}")

    sdlc_code_skill = root / OPENCODE_SKILLS / "sdlc-code/SKILL.md"
    if not sdlc_code_skill.is_file():
        raise RuntimeError("OpenCode sdlc-code skill smoke check failed")
    for relative in render_skill_resources("sdlc-code"):
        if not (root / OPENCODE_SKILLS / "sdlc-code" / relative).is_file():
            raise RuntimeError(f"OpenCode sdlc-code resource smoke check failed: {relative}")

    if check_tdd and not (root / OPENCODE_SKILLS / TDD_SKILL).is_file():
        raise RuntimeError("OpenCode develop-tdd skill smoke check failed")

    config, _ = _load_json_object(root / OPENCODE_CONFIG, "OpenCode configuration")
    plugins = config.get("plugin")
    if not isinstance(plugins, list) or not any(
        isinstance(plugin, str) and _is_managed_package_source(plugin, "@harnessctl/opencode-tools")
        for plugin in plugins
    ):
        raise RuntimeError("OpenCode tools plugin registration smoke check failed")

    if not check_memory:
        return

    memory_skill = root / OPENCODE_SKILLS / "sdlc-memory/SKILL.md"
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
        "--replace-sdlc-skill-set",
        action="store_true",
        help="delete disclosed legacy unprefixed SDLC support skill directories",
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
            replace_sdlc_skill_set=args.replace_sdlc_skill_set,
            allow_pi_package_install=args.allow_pi_package_install,
            confirm_pi_mcp_adapter_install=confirmation,
            disclose_sdlc_replacement=lambda message: print(message, file=sys.stderr),
            disclose_skill_replacement=lambda message: print(message, file=sys.stderr),
        ):
            print(f"Installed {target}")
    except (ConfigError, FileExistsError, OSError, RuntimeError, ValueError) as error:
        parser.error(str(error))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
