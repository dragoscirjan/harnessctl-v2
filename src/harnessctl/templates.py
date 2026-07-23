"""Canonical prompt loading and harness-specific rendering."""

from pathlib import Path

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


def render_work_new(harness: str) -> str:
    """Render the canonical work-intake prompt for a supported harness."""
    return render_prompt("work-new", harness)


def render_prompt(command: str, harness: str) -> str:
    """Render a canonical SDLC prompt for a supported harness."""
    template_name = TEMPLATES.get(command)
    if template_name is None:
        raise ValueError(f"unsupported command: {command}")
    environment = Environment(
        loader=FileSystemLoader(TEMPLATE_ROOT),
        undefined=StrictUndefined,
        autoescape=False,
        keep_trailing_newline=True,
    )
    body = environment.get_template(template_name).render()
    if harness == "opencode":
        return f"---\ndescription: {DESCRIPTIONS[command]}\n---\n" + body
    if harness == "pi":
        return body
    raise ValueError(f"unsupported harness: {harness}")
