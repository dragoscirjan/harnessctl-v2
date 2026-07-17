"""Install compiled harnessctl prompts into a project."""

from __future__ import annotations

import argparse
import contextlib
import os
import tempfile
from collections.abc import Iterable
from pathlib import Path

TARGETS = {
    "opencode": Path(".opencode/commands"),
    "pi": Path(".pi/commands"),
}
COMMANDS = ("work-new", "work-explore", "work-plan")


def install(cwd: Path, harness: str, force: bool = False) -> list[Path]:
    """Install prompt files for one harness or all supported harnesses."""
    if harness == "all":
        harnesses: Iterable[str] = TARGETS
    elif harness in TARGETS:
        harnesses = (harness,)
    else:
        raise ValueError(f"unsupported harness: {harness}")

    root = cwd.resolve()
    rendered_targets: list[tuple[Path, str]] = []
    conflicts: list[Path] = []
    for selected_harness in harnesses:
        relative_directory = TARGETS[selected_harness]
        for command in COMMANDS:
            relative_target = relative_directory / f"{command}.md"
            target = (root / relative_target).resolve()
            if root not in target.parents:
                raise ValueError(f"target escapes project root: {relative_target}")
            if target.exists() and not force:
                conflicts.append(target)
            rendered_targets.append((target, render_command(selected_harness, command)))
    if conflicts:
        joined = "\n".join(f"- {target}" for target in conflicts)
        raise FileExistsError(f"refusing to overwrite existing files:\n{joined}")

    previous: list[tuple[Path, bool, str]] = []
    try:
        for target, content in rendered_targets:
            target.parent.mkdir(parents=True, exist_ok=True)
            existed = target.exists()
            if existed and not target.is_file():
                raise IsADirectoryError(f"target is not a regular file: {target}")
            previous.append(
                (target, existed, target.read_text(encoding="utf-8") if existed else "")
            )
            write_atomic(target, content)
    except BaseException:
        for target, existed, content in reversed(previous):
            if existed:
                write_atomic(target, content)
            else:
                target.unlink(missing_ok=True)
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


def render_command(harness: str, command: str) -> str:
    """Render one supported command for a harness."""
    if command not in COMMANDS:
        raise ValueError(f"unsupported command: {command}")
    from .templates import render_prompt

    return render_prompt(command, harness)


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
    except (FileExistsError, OSError, ValueError) as error:
        parser.error(str(error))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
