"""Canonical prompt loading and harness-specific rendering."""

from collections.abc import Mapping
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, StrictUndefined

TEMPLATE_ROOT = Path(__file__).resolve().parent / "templates"
TEMPLATES = {
    "work-new": "sdlc/work-new.md.j2",
    "work-explore": "sdlc/work-explore.md.j2",
    "work-plan": "sdlc/work-plan.md.j2",
    "work-resume": "sdlc/work-resume.md.j2",
    "work-start-initiative": "sdlc/work-start-initiative.md.j2",
    "work-start-epic": "sdlc/work-start-epic.md.j2",
    "work-start-from": "sdlc/work-start-from.md.j2",
    "work-write-stories": "sdlc/work-write-stories.md.j2",
    "work-start-story": "sdlc/work-start-story.md.j2",
    "work-design-doc": "sdlc/work-design-doc.md.j2",
    "work-hld": "sdlc/work-hld.md.j2",
    "work-lld": "sdlc/work-lld.md.j2",
    "work-write-tasks": "sdlc/work-write-tasks.md.j2",
    "work-implement": "sdlc/work-implement.md.j2",
    "work-verify": "sdlc/work-verify.md.j2",
    "work-review": "sdlc/work-review.md.j2",
    "work-cvs": "sdlc/work-cvs.md.j2",
    "work-finish": "sdlc/work-finish.md.j2",
}
COMMAND_METADATA = {
    "work-new": {
        "memory_profile": "exit-only",
        "phase_label": "work intake",
        "retrieval_intent": "",
        "exit_classes": "user-confirmed reusable scope decision only",
    },
    "work-explore": {
        "memory_profile": "priority-entry",
        "phase_label": "exploration",
        "retrieval_intent": (
            "prior verified facts, known risks, and relevant decisions for the "
            "investigation question"
        ),
        "exit_classes": "newly observed verified fact or reusable lesson; never a recommendation",
    },
    "work-plan": {
        "memory_profile": "priority-entry",
        "phase_label": "planning",
        "retrieval_intent": (
            "approved constraints, prior decisions, known risks, and lessons relevant "
            "to the planned scope"
        ),
        "exit_classes": "explicitly approved reusable decision; never a proposed plan",
    },
    "work-resume": {
        "memory_profile": "priority-entry",
        "phase_label": "work resumption",
        "retrieval_intent": "active entity ID, prior decisions, blockers, and last verified events",
        "exit_classes": (
            "user-confirmed correction or decision; verified event only with current evidence"
        ),
    },
    "work-start-initiative": {
        "memory_profile": "exit-only",
        "phase_label": "initiative start",
        "retrieval_intent": "",
        "exit_classes": (
            "user-approved durable initiative boundary or decision; never proposed Epics"
        ),
    },
    "work-start-epic": {
        "memory_profile": "exit-only",
        "phase_label": "Epic start",
        "retrieval_intent": "",
        "exit_classes": (
            "user-confirmed durable Epic decision; never expected documentation or work"
        ),
    },
    "work-start-from": {
        "memory_profile": "priority-entry",
        "phase_label": "active work selection",
        "retrieval_intent": (
            "exact active entity, parent, dependencies, decisions, and last verified event"
        ),
        "exit_classes": "confirmed correction or decision; no inferred progress",
    },
    "work-write-stories": {
        "memory_profile": "exit-only",
        "phase_label": "Story decomposition",
        "retrieval_intent": "",
        "exit_classes": (
            "user-approved durable decomposition decision; never uncreated Story claims"
        ),
    },
    "work-start-story": {
        "memory_profile": "exit-only",
        "phase_label": "Story start",
        "retrieval_intent": "",
        "exit_classes": "user-confirmed durable Story decision; never expected Tasks or designs",
    },
    "work-design-doc": {
        "memory_profile": "exit-only",
        "phase_label": "design document",
        "retrieval_intent": "",
        "exit_classes": "explicitly confirmed reusable design decision; never the proposal itself",
    },
    "work-hld": {
        "memory_profile": "priority-entry",
        "phase_label": "high-level design",
        "retrieval_intent": (
            "existing architecture decisions, constraints, risks, migrations, and "
            "operational lessons"
        ),
        "exit_classes": "explicitly confirmed architecture decision; never an unapproved HLD",
    },
    "work-lld": {
        "memory_profile": "priority-entry",
        "phase_label": "low-level design",
        "retrieval_intent": (
            "approved HLD decisions, interface constraints, known failures, compatibility "
            "risks, and lessons"
        ),
        "exit_classes": "explicitly confirmed technical decision; never an unapproved LLD",
    },
    "work-write-tasks": {
        "memory_profile": "exit-only",
        "phase_label": "Task decomposition",
        "retrieval_intent": "",
        "exit_classes": (
            "explicitly approved sequencing or dependency decision; never uncreated Task claims"
        ),
    },
    "work-implement": {
        "memory_profile": "priority-entry",
        "phase_label": "implementation",
        "retrieval_intent": (
            "approved task decisions, known compatibility risks, prior failures, and "
            "implementation lessons"
        ),
        "exit_classes": (
            "confirmed deviation decision; verified event or lesson only from current "
            "authoritative evidence"
        ),
    },
    "work-verify": {
        "memory_profile": "priority-entry",
        "phase_label": "verification",
        "retrieval_intent": (
            "acceptance decisions, prior verified failures, known risks, and verification lessons"
        ),
        "exit_classes": (
            "verified result event or lesson only when checks ran and evidence is cited; "
            "theoretical plans produce no write"
        ),
    },
    "work-review": {
        "memory_profile": "exit-only",
        "phase_label": "review",
        "retrieval_intent": "",
        "exit_classes": (
            "user-confirmed accepted-risk decision; verified review event only with "
            "actual review evidence"
        ),
    },
    "work-cvs": {
        "memory_profile": "exit-only",
        "phase_label": "version-control delivery",
        "retrieval_intent": "",
        "exit_classes": (
            "user-confirmed delivery decision; verified event only after current CVS evidence"
        ),
    },
    "work-finish": {
        "memory_profile": "exit-only",
        "phase_label": "final delivery",
        "retrieval_intent": "",
        "exit_classes": (
            "confirmed release decision or verified delivery event; never inferred merge, "
            "deployment, or completion"
        ),
    },
}
DESCRIPTIONS = {
    "work-new": "Start a human-guided work intake",
    "work-explore": "Gather repository evidence for a work contract",
    "work-plan": "Propose an implementation plan for human approval",
    "work-resume": "Resume an interrupted work item",
    "work-start-initiative": "Understand and split an initiative",
    "work-start-epic": "Understand an epic and choose the next path",
    "work-start-from": "Select an active work context",
    "work-write-stories": "Split an epic into stories",
    "work-start-story": "Understand a story and choose the next path",
    "work-design-doc": "Propose a general design document",
    "work-hld": "Propose a high-level design",
    "work-lld": "Propose a low-level design",
    "work-write-tasks": "Split an approved design into tasks",
    "work-implement": "Propose implementation of approved tasks",
    "work-verify": "Propose verification of implemented work",
    "work-review": "Review implemented work",
    "work-cvs": "Propose version-control delivery",
    "work-finish": "Propose final delivery or deployment",
}
SKILL_TEMPLATES = {
    "caveman": "skills/caveman/SKILL.md.j2",
    "memory": "skills/memory/SKILL.md.j2",
}


def render_work_new(harness: str, config: Mapping[str, Any] | None = None) -> str:
    """Render the canonical work-intake prompt for a supported harness."""
    return render_prompt("work-new", harness, config=config)


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


def _render_context(
    command: str,
    harness: str,
    config: Mapping[str, Any] | None,
) -> dict[str, object]:
    metadata = COMMAND_METADATA[command]
    memory_hooks_enabled = bool(harness == "opencode" and config and config["memory"]["enabled"])
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
    environment = Environment(
        loader=FileSystemLoader(TEMPLATE_ROOT),
        undefined=StrictUndefined,
        autoescape=False,
        keep_trailing_newline=True,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    return environment.get_template(template_name).render(**context)
