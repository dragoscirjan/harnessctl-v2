"""Install compiled harnessctl prompts into a project."""

from __future__ import annotations

import argparse
import contextlib
import errno
import json
import os
import tempfile
from collections.abc import Iterable, Mapping
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any

from .config import ConfigError, load_config
from .templates import TEMPLATES, render_prompt, render_skill

TARGETS = {
    "opencode": Path(".opencode/commands"),
    "pi": Path(".pi/commands"),
}
COMMANDS = tuple(TEMPLATES.keys())
OPENCODE_SKILLS = Path(".opencode/skills")
OPENCODE_PACKAGE = Path(".opencode/package.json")
OPENCODE_PLUGIN = Path(".opencode/plugins/harnessctl-memory.js")
PLUGIN_CONTENT = "export { CustomToolsPlugin } from '@harnessctl/opencode-tools';\n"
LOCAL_CACHE = Path(".harnessctl/cache/harnessctl.sqlite")


def install(cwd: Path, harness: str, force: bool = False) -> list[Path]:
    """Install prompt files for one harness or all supported harnesses."""
    if harness == "all":
        harnesses: Iterable[str] = TARGETS
    elif harness in TARGETS:
        harnesses = (harness,)
    else:
        raise ValueError(f"unsupported harness: {harness}")

    root = cwd.resolve()
    config = load_config(root)
    if config["memory"]["enabled"] and harness in ("pi", "all"):
        raise RuntimeError(
            "Pi memory tools are implemented, but automatic Pi extension and skill "
            "installation is not yet verified; install with --harness opencode or "
            "register @harnessctl/pi-tools manually."
        )
    rendered_targets: list[tuple[Path, str]] = []
    conflicts: list[Path] = []
    for selected_harness in harnesses:
        relative_directory = TARGETS[selected_harness]
        for command in COMMANDS:
            relative_target = relative_directory / f"{command}.md"
            target = (root / relative_target).resolve()
            if root not in target.parents:
                raise ValueError(f"target escapes project root: {relative_target}")
            rendered_targets.append(
                (target, render_command(selected_harness, command, config=config))
            )
    if harness in ("opencode", "all"):
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
                    (_target(root, OPENCODE_PLUGIN), PLUGIN_CONTENT),
                    (_target(root, OPENCODE_PACKAGE), _merge_package(root, force)),
                ]
            )
            rendered_targets.append(
                (_target(root, Path(".gitignore")), _memory_ignore(root, repository))
            )
    mergeable_targets = {_target(root, OPENCODE_PACKAGE), _target(root, Path(".gitignore"))}
    for target, _ in rendered_targets:
        if target.exists() and target not in mergeable_targets and not force:
            conflicts.append(target)
    if conflicts:
        joined = "\n".join(f"- {target}" for target in conflicts)
        raise FileExistsError(f"refusing to overwrite existing files:\n{joined}")
    _validate_plan(root, rendered_targets, config, harness)

    previous: list[tuple[Path, bool, bytes]] = []
    created_directories: list[Path] = []
    try:
        for target, content in rendered_targets:
            _ensure_directory(target.parent, root, created_directories)
            existed = target.exists()
            if existed and not target.is_file():
                raise IsADirectoryError(f"target is not a regular file: {target}")
            previous.append((target, existed, target.read_bytes() if existed else b""))
            write_atomic(target, content)
        if config["memory"]["enabled"] and harness in ("opencode", "all"):
            _initialize_memory_paths(root, config["memory"]["repository"], created_directories)
            _smoke_check(root)
    except BaseException as error:
        rollback_errors = _rollback(previous, created_directories)
        if rollback_errors:
            raise BaseExceptionGroup(
                "installation failed and rollback was incomplete",
                [error, *rollback_errors],
            ) from error
        raise
    return [target for target, _ in rendered_targets]


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
    target = (root / relative).resolve()
    if root not in target.parents:
        raise ValueError(f"target escapes project root: {relative}")
    return target


def _package_version() -> str:
    try:
        return version("harnessctl")
    except PackageNotFoundError:
        return "0.1.0"


def _merge_package(root: Path, force: bool) -> str:
    path = _target(root, OPENCODE_PACKAGE)
    package: dict[str, object] = {}
    if path.exists():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise ValueError(f"invalid OpenCode package file {path}: {error}") from error
        if not isinstance(loaded, dict):
            raise ValueError(f"OpenCode package file must contain an object: {path}")
        package = loaded
    dependencies = package.setdefault("dependencies", {})
    if not isinstance(dependencies, dict):
        raise ValueError(f"dependencies must be an object in {path}")
    expected = _package_version()
    current = dependencies.get("@harnessctl/opencode-tools")
    if current not in (None, expected) and not force:
        raise FileExistsError(
            "incompatible @harnessctl/opencode-tools version "
            f"in {path}: {current}; expected {expected}"
        )
    dependencies["@harnessctl/opencode-tools"] = expected
    return json.dumps(package, indent=2, sort_keys=False) + "\n"


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
) -> None:
    """Validate every file and directory kind before the first mutation."""
    directories = {target.parent for target, _ in rendered_targets}
    for target, _ in rendered_targets:
        if target.exists() and not target.is_file():
            raise IsADirectoryError(f"target is not a regular file: {target}")
    if config["memory"]["enabled"] and harness in ("opencode", "all"):
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


def _initialize_memory_paths(
    root: Path,
    repository: dict[str, object],
    created_directories: list[Path],
) -> None:
    memory_root = _target(root, Path(str(repository["root"])))
    for folder in ("facts", "decisions", "events", "lessons", "tombstones"):
        _ensure_directory(memory_root / folder, root, created_directories)


def _rollback(
    previous: list[tuple[Path, bool, bytes]], created_directories: list[Path]
) -> list[BaseException]:
    """Restore file before-images, then remove transaction-created empty directories."""
    errors: list[BaseException] = []
    for target, existed, content in reversed(previous):
        try:
            if existed:
                write_atomic_bytes(target, content)
            else:
                target.unlink(missing_ok=True)
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


def _smoke_check(root: Path) -> None:
    package = json.loads((root / OPENCODE_PACKAGE).read_text(encoding="utf-8"))
    dependency = package.get("dependencies", {}).get("@harnessctl/opencode-tools")
    plugin_valid = (root / OPENCODE_PLUGIN).read_text(encoding="utf-8") == PLUGIN_CONTENT
    skills_valid = all(
        (root / OPENCODE_SKILLS / skill / "SKILL.md").is_file() for skill in ("caveman", "memory")
    )
    if dependency != _package_version() or not plugin_valid or not skills_valid:
        raise RuntimeError("OpenCode memory adapter registration smoke check failed")


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
    args = parser.parse_args()
    try:
        for target in install(args.cwd, args.harness, args.force):
            print(f"Installed {target}")
    except (ConfigError, FileExistsError, OSError, RuntimeError, ValueError) as error:
        parser.error(str(error))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
