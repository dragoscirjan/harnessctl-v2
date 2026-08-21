"""Canonical prompt loading and harness-specific rendering."""

from collections.abc import Mapping
from pathlib import Path, PurePosixPath
from typing import Any

from jinja2 import Environment, FileSystemLoader, StrictUndefined

TEMPLATE_ROOT = Path(__file__).resolve().parent / "templates"
PHASES = ("plan", "build", "verify", "release")
TEMPLATES = {
    "work-plan": "sdlc/work-plan.md.j2",
    "work-build": "sdlc/work-build.md.j2",
    "work-verify": "sdlc/work-verify.md.j2",
    "work-release": "sdlc/work-release.md.j2",
    "work-continue": "sdlc/work-continue.md.j2",
}
COMMAND_METADATA = {
    "work-plan": {
        "memory_profile": "priority-entry",
        "phase": "plan",
        "phase_label": "Epic planning",
        "retrieval_intent": (
            "the Epic checkpoint, confirmed scope decisions, known risks, and relevant lessons"
        ),
        "exit_classes": "approved reusable planning decision or verified planning lesson",
    },
    "work-build": {
        "memory_profile": "priority-entry",
        "phase": "build",
        "phase_label": "Epic build",
        "retrieval_intent": (
            "the Epic checkpoint, approved task decisions, compatibility risks, and prior failures"
        ),
        "exit_classes": (
            "confirmed implementation decision or verified implementation event or lesson"
        ),
    },
    "work-verify": {
        "memory_profile": "priority-entry",
        "phase": "verify",
        "phase_label": "Epic verification",
        "retrieval_intent": (
            "the Epic checkpoint, acceptance decisions, verified failures, risks, and lessons"
        ),
        "exit_classes": "verified result event or lesson supported by current check evidence",
    },
    "work-release": {
        "memory_profile": "priority-entry",
        "phase": "release",
        "phase_label": "Epic release",
        "retrieval_intent": (
            "the Epic checkpoint, verified delivery decisions, release risks, and lessons"
        ),
        "exit_classes": "confirmed release decision or delivery event verified by current evidence",
    },
    "work-continue": {
        "memory_profile": "priority-entry",
        "phase": "resolved plan/build/verify/release",
        "phase_label": "Epic continuation",
        "retrieval_intent": (
            "the exact Epic checkpoint, active item, blockers, and last verified event"
        ),
        "exit_classes": "confirmed correction or decision, or event verified by current evidence",
    },
}
DESCRIPTIONS = {
    "work-plan": "Recognize one Epic and produce its approved executable plan",
    "work-build": "Build confirmed bounded work for one Epic",
    "work-verify": "Verify one Epic against current authoritative evidence",
    "work-release": "Deliver one verified Epic through confirmed release actions",
    "work-continue": "Resume one authoritative Epic phase and one next step",
}
SKILL_TEMPLATES = {
    "caveman": "skills/caveman/SKILL.md.j2",
    "cvs": "skills/cvs/SKILL.md.j2",
    "develop-tdd": "skills/develop-tdd/SKILL.md.j2",
    "issue-tracking": "skills/issue-tracking/SKILL.md.j2",
    "memory": "skills/memory/SKILL.md.j2",
    "sdlc": "skills/sdlc/SKILL.md.j2",
}
SKILL_RESOURCE_TEMPLATES = {
    "sdlc": {
        "references/plan.md": "skills/sdlc/references/plan.md.j2",
        "references/plan-initiative.md": "skills/sdlc/references/plan-initiative.md.j2",
        "references/plan-design.md": "skills/sdlc/references/plan-design.md.j2",
        "references/plan-decompose.md": "skills/sdlc/references/plan-decompose.md.j2",
        "references/build.md": "skills/sdlc/references/build.md.j2",
        "references/build-yolo.md": "skills/sdlc/references/build-yolo.md.j2",
        "references/verify.md": "skills/sdlc/references/verify.md.j2",
        "references/verify-defects.md": "skills/sdlc/references/verify-defects.md.j2",
        "references/release.md": "skills/sdlc/references/release.md.j2",
        "references/release-deploy.md": "skills/sdlc/references/release-deploy.md.j2",
        "references/continue.md": "skills/sdlc/references/continue.md.j2",
        "references/continue-reconcile.md": "skills/sdlc/references/continue-reconcile.md.j2",
        "references/checkpoint.md": "skills/sdlc/references/checkpoint.md.j2",
    }
}


def render_prompt(
    command: str,
    harness: str,
    *,
    config: Mapping[str, Any] | None = None,
) -> str:
    """Render a canonical SDLC prompt for a supported harness."""
    _validate_command_metadata()
    template_name = TEMPLATES.get(command)
    if template_name is None:
        raise ValueError(f"unsupported command: {command}")
    environment = Environment(
        loader=FileSystemLoader(TEMPLATE_ROOT),
        undefined=StrictUndefined,
        autoescape=False,
        keep_trailing_newline=True,
    )
    context = _render_context(command, harness, config)
    body = environment.get_template(template_name).render(**context).rstrip("\n") + "\n"
    if harness == "opencode":
        return f"---\ndescription: {DESCRIPTIONS[command]}\n---\n" + body
    if harness == "pi":
        return body
    raise ValueError(f"unsupported harness: {harness}")


def _validate_command_metadata() -> None:
    if COMMAND_METADATA.keys() != TEMPLATES.keys():
        missing = sorted(TEMPLATES.keys() - COMMAND_METADATA.keys())
        unknown = sorted(COMMAND_METADATA.keys() - TEMPLATES.keys())
        raise ValueError(
            f"command metadata must exactly cover templates; missing={missing}, unknown={unknown}"
        )
    if DESCRIPTIONS.keys() != TEMPLATES.keys():
        missing = sorted(TEMPLATES.keys() - DESCRIPTIONS.keys())
        unknown = sorted(DESCRIPTIONS.keys() - TEMPLATES.keys())
        raise ValueError(
            "command descriptions must exactly cover templates; "
            f"missing={missing}, unknown={unknown}"
        )


def _render_context(
    command: str,
    harness: str,
    config: Mapping[str, Any] | None,
) -> dict[str, object]:
    metadata = COMMAND_METADATA[command]
    memory_hooks_enabled = bool(
        harness in {"opencode", "pi"} and config and config["memory"]["enabled"]
    )
    if not memory_hooks_enabled:
        return {"memory_hooks_enabled": False, **metadata}

    memory = config["memory"]
    retrieval = memory["retrieval"]
    return {
        "memory_hooks_enabled": True,
        "retrieval_limit": retrieval["limit"],
        "retrieval_max_chars": retrieval["max_chars"],
        "default_topic": memory["namespace"]["default_topic"],
        **metadata,
    }


def render_skill(skill: str, **context: object) -> str:
    """Render one installable skill with compile-time specialization."""
    template_name = SKILL_TEMPLATES.get(skill)
    if template_name is None:
        raise ValueError(f"unsupported skill: {skill}")
    environment = _skill_environment()
    return environment.get_template(template_name).render(**context)


def render_skill_resources(skill: str, **context: object) -> dict[str, str]:
    """Render validated files nested below one installed skill directory."""
    resources = SKILL_RESOURCE_TEMPLATES.get(skill, {})
    _validate_skill_resource_paths(resources)
    environment = _skill_environment()
    return {
        path: environment.get_template(template).render(**context).rstrip("\n") + "\n"
        for path, template in resources.items()
    }


def _skill_environment() -> Environment:
    return Environment(
        loader=FileSystemLoader(TEMPLATE_ROOT),
        undefined=StrictUndefined,
        autoescape=False,
        keep_trailing_newline=True,
        trim_blocks=True,
        lstrip_blocks=True,
    )


def _validate_skill_resource_paths(resources: Mapping[str, str]) -> None:
    portable: set[str] = set()
    for raw_path in resources:
        path = PurePosixPath(raw_path)
        if (
            not raw_path
            or "\\" in raw_path
            or path.is_absolute()
            or path.parts[:1] != ("references",)
            or any(part in {"", ".", ".."} for part in path.parts)
            or path.suffix != ".md"
        ):
            raise ValueError(f"unsafe skill resource path: {raw_path}")
        key = raw_path.casefold()
        if key in portable:
            raise ValueError(f"duplicate portable skill resource path: {raw_path}")
        portable.add(key)
