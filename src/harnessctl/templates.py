"""Canonical prompt loading and harness-specific rendering."""

from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

TEMPLATE_ROOT = Path(__file__).resolve().parent / "templates"
TEMPLATES = {
    "work-new": "sdlc/work-new.md.j2",
    "work-explore": "sdlc/work-explore.md.j2",
    "work-plan": "sdlc/work-plan.md.j2",
}
DESCRIPTIONS = {
    "work-new": "Start a human-guided work intake",
    "work-explore": "Gather repository evidence for a work contract",
    "work-plan": "Propose an implementation plan for human approval",
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
