from copy import deepcopy
from pathlib import Path

import pytest

from harnessctl.config import DEFAULT_CONFIG
from harnessctl.templates import COMMAND_METADATA, DESCRIPTIONS, PHASES, TEMPLATES, render_prompt

COMMANDS = ("work-plan", "work-build", "work-verify", "work-release", "work-continue")
RETIRED_COMMANDS = (
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
    "work-review",
    "work-cvs",
    "work-finish",
)


def _memory_config() -> dict[str, object]:
    config = deepcopy(DEFAULT_CONFIG)
    config["memory"]["enabled"] = True
    config["memory"]["retrieval"]["limit"] = 3
    config["memory"]["retrieval"]["max_chars"] = 2048
    return config


def test_registry_defines_only_five_epic_first_commands() -> None:
    assert tuple(TEMPLATES) == COMMANDS
    assert tuple(COMMAND_METADATA) == COMMANDS
    assert tuple(DESCRIPTIONS) == COMMANDS
    assert PHASES == ("plan", "build", "verify", "release")

    template_root = Path(__file__).parents[1] / "src/harnessctl/templates/sdlc"
    source_commands = tuple(
        path.stem.removesuffix(".md") for path in sorted(template_root.glob("work-*.md.j2"))
    )
    assert source_commands == tuple(sorted(COMMANDS))


@pytest.mark.parametrize("command", RETIRED_COMMANDS)
def test_retired_commands_are_not_renderable(command: str) -> None:
    with pytest.raises(ValueError, match=f"unsupported command: {command}"):
        render_prompt(command, "opencode")


@pytest.mark.parametrize("harness", ("opencode", "pi"))
@pytest.mark.parametrize("command", COMMANDS)
def test_shared_contract_renders_once_without_unresolved_jinja(command: str, harness: str) -> None:
    rendered = render_prompt(command, harness)

    assert rendered.count("# Shared action gate") == 1
    assert rendered.count("## Owning Epic") == 1
    assert rendered.count("## Confirmed checkpoint") == 1
    assert all(
        classification in rendered
        for classification in ("**Required**", "**Recommended**", "**Optional**", "**Not needed**")
    )
    assert "Before any read, tool call, execution, or mutation" in rendered
    assert "add, remove, reject, or reclassify" in rendered
    assert "explicit confirmation" in rendered
    assert "declined safety requirement remains Required" in rendered
    assert "All other commands require an existing Epic" in rendered
    assert "stop and direct the user\nto `work-plan`" in rendered
    assert "Resumable checkpoints are unavailable" in rendered
    assert "memory_" not in rendered
    assert "{%" not in rendered
    assert "{{" not in rendered


@pytest.mark.parametrize("command", COMMANDS)
def test_memory_checkpoint_contract_is_bounded_authoritative_and_compact(command: str) -> None:
    rendered = render_prompt(command, "opencode", config=_memory_config())

    assert rendered.count("## Project memory boundary") == 1
    assert rendered.count("## Project memory exit") == 1
    assert rendered.count("`memory_search`") == 1
    assert "limit 3, maximum 2048" in rendered
    assert "Multiple\nmatches block progress" in rendered
    assert "Never reconcile by timestamp" in rendered
    assert "`memory_supersede` on the selected logical current record" in rendered
    assert "`memory_delete` to\ntombstone each confirmed stale duplicate" in rendered
    assert "`memory_store` only for the first checkpoint" in rendered
    assert "configured topic and\nexact Epic ID" in rendered
    assert "Include Next step only after explicit user confirmation" in rendered
    assert "Exclude proposed plans, candidate actions" in rendered
    assert "transcripts, chain-of-thought" in rendered
    assert "secrets, raw logs, diffs" in rendered
    assert "minimum\ntokens, full technical meaning" in rendered
    assert "separate from the compact workflow checkpoint" in rendered
    assert "authoritative and override\nconflicting memory" in rendered


def test_continue_retains_resolved_phase_and_resumes_one_step() -> None:
    rendered = render_prompt("work-continue", "pi", config=_memory_config())
    normalized = " ".join(rendered.split())

    assert (
        "Resume exactly one authoritative current plan, build, verify, or release phase"
        in normalized
    )
    assert "one user-confirmed next step" in normalized
    assert "Never execute that next step, combine phases" in normalized
    assert "return at most five unfinished Epic checkpoint summaries" in normalized


@pytest.mark.parametrize("harness", ("opencode", "pi"))
def test_release_requires_verified_epic_and_mandatory_satisfied_or_confirmed_sequence(
    harness: str,
) -> None:
    normalized = " ".join(render_prompt("work-release", harness).split())

    assert "Release is Epic-only" in normalized
    assert "successful, current verification evidence" in normalized
    for step in (
        "feature branch",
        "commit containing the intended scope",
        "push of that commit to the intended remote branch",
        "pull request from that branch to the correct base",
    ):
        assert step in normalized
    assert "either prove it **Satisfied** with fresh evidence" in normalized
    assert "Never repeat a satisfied action" in normalized
    assert "Push and pull-request creation or update each require separate, fresh" in normalized


def test_release_merge_deployment_and_closure_are_independently_gated() -> None:
    normalized = " ".join(render_prompt("work-release", "opencode").split())

    assert "leave merge to a human" in normalized
    assert "fresh explicit consent naming the exact pull request and merge action" in normalized
    assert "Never enable auto-merge" in normalized
    assert "deployment **Not needed** unless the user explicitly requests it" in normalized
    assert "existing repository-owned deployment workflow" in normalized
    for evidence in ("environment", "authorization", "migrations", "rollback", "monitoring"):
        assert evidence in normalized
    assert "obtain separate confirmation for each exact remote status transition" in normalized
    assert (
        "merged pull request alone proves neither deployment nor all acceptance criteria"
        in normalized
    )


@pytest.mark.parametrize("harness", ("opencode", "pi"))
def test_continue_prompts_for_optional_id_and_bounds_unfinished_candidates(harness: str) -> None:
    normalized = " ".join(render_prompt("work-continue", harness, config=_memory_config()).split())

    assert "Prompt for an optional Epic, Story, Task, or Bug ID" in normalized
    assert "search narrowly for that Epic's active checkpoint" in normalized
    assert "search active checkpoint records once" in normalized
    assert "at most five unfinished Epic workflows" in normalized
    assert "wait for the user to select one" in normalized
    assert "Never select the newest or otherwise choose automatically" in normalized


def test_continue_reconciles_authority_and_resumes_exactly_one_current_step() -> None:
    normalized = " ".join(
        render_prompt("work-continue", "opencode", config=_memory_config()).split()
    )

    assert "interrupted or duplicate checkpoint records as ambiguous" in normalized
    assert "block resumption until the user resolves ambiguity" in normalized
    assert "only after the replacement is confirmed or independently verified" in normalized
    assert "never choose by timestamp, combine records, or silently discard one" in normalized
    assert "issue hierarchy and status, linked plans and specifications" in normalized
    assert "tests or verification reports, and CVS/provider evidence" in normalized
    assert "If several phases or steps remain plausible, stop for reconciliation" in normalized
    assert "verify and checkpoint only that result, then stop" in normalized
    assert "separate invocation of the next public command" in normalized
    assert "pending next step in the checkpoint only after the user confirms it" in normalized


@pytest.mark.parametrize("harness", ("opencode", "pi"))
def test_plan_supports_prompt_initiative_epic_and_owning_epic_modes(harness: str) -> None:
    rendered = render_prompt("work-plan", harness)
    normalized = " ".join(rendered.split())

    assert (
        "natural-language prompt or mentioned Initiative, Epic, Story, Task, or Bug ID"
        in normalized
    )
    assert (
        "search the configured issue authority for relevant Initiative and Epic candidates"
        in normalized
    )
    assert "Duplicate or ambiguous matches block creation" in normalized
    assert "An Initiative ID enters Initiative mode" in normalized
    assert "An Epic ID enters Epic mode" in normalized
    assert "Story, Task, or Bug ID enters Epic mode only after its owning Epic" in normalized
    assert "prompt may be either one Epic or an Initiative with several Epics" in normalized


def test_plan_initiative_mode_confirms_creation_then_recommends_each_epic() -> None:
    rendered = render_prompt("work-plan", "opencode")
    normalized = " ".join(rendered.split())

    assert "Initiative boundary, each proposed Epic's objective, scope separation" in normalized
    assert "Confirm the Initiative and every Epic individually" in normalized
    assert "using supported hierarchy, and verify the results" in normalized
    assert "`work-plan <epic-id>` recommendation for every created or attached Epic" in normalized
    assert "Never design, decompose, or produce a combined executable plan" in normalized


def test_plan_adapts_classified_steps_and_design_level() -> None:
    rendered = render_prompt("work-plan", "pi")
    normalized = " ".join(rendered.split())

    for concern in (
        "requirement clarification",
        "repository and linked-artifact exploration",
        "dependency, compatibility, migration, and risk analysis",
        "estimates with assumptions, ranges or uncertainty",
        "Story, Task, and pre-existing Bug decomposition",
        "acceptance criteria and verification evidence requirements",
        "release, rollback, documentation, operational, and migration requirements",
    ):
        assert concern in normalized
    assert "Mark irrelevant concerns **Not needed** with reasons" in normalized
    assert "not a fixed waterfall" in normalized
    assert "After each result, revise and reconfirm" in normalized
    for level in ("none", "lightweight", "design document", "HLD", "LLD", "HLD plus LLD", "GDD"):
        assert f"**{level}**" in normalized
    assert "why weaker and stronger choices are Not needed, Optional, or insufficient" in normalized


def test_plan_confirms_each_entity_artifact_and_one_executable_epic_plan() -> None:
    rendered = render_prompt("work-plan", "opencode", config=_memory_config())
    normalized = " ".join(rendered.split())

    assert (
        "obtain current item-level confirmation before each create or relationship mutation"
        in normalized
    )
    assert "Before creating or revising each approved design artifact" in normalized
    assert "Create it only through existing specification tooling" in normalized
    assert "Confirm every entity and relationship before creation" in normalized
    assert "Small Epics may contain direct Tasks or Bugs" in normalized
    assert "Present one `Proposed executable Epic plan`" in normalized
    assert "Only after approval label it `Approved executable Epic plan`" in normalized
    assert "checkpoint the approval" in normalized
    assert "recommend a later `work-build <epic-id>` invocation, and stop" in normalized
    assert "Never implement, verify, release, or plan a second Epic" in normalized


@pytest.mark.parametrize("harness", ("opencode", "pi"))
def test_build_requires_approved_epic_and_resumes_or_selects_ready_work(harness: str) -> None:
    rendered = render_prompt("work-build", harness)
    normalized = " ".join(rendered.split())

    assert "Build is Epic-only" in normalized
    assert "approved executable plan" in normalized
    assert (
        "If the Epic or approved plan is missing, stop and direct the user to `work-plan`"
        in normalized
    )
    assert "offer to resume it without restarting planning or duplicating work" in normalized
    assert "ask which part of the Epic the user wants to start" in normalized
    assert "approved scope, satisfied dependencies, sufficient relevant design" in normalized
    assert "Selection never changes issue status" in normalized


def test_build_selects_supported_items_and_routes_scope_changes_to_plan() -> None:
    rendered = render_prompt("work-build", "opencode")
    normalized = " ".join(rendered.split())

    assert "next ready Story, Task, or pre-existing Bug" in normalized
    assert "user-selected ready Story, Task, or Bug" in normalized
    assert "current verified corrective Bug" in normalized
    assert "only after the user confirms repair" in normalized
    assert "requirement, acceptance-boundary, architecture, or design-scope change" in normalized
    assert "stop and redirect to `work-plan`" in normalized


def test_build_yolo_is_one_time_local_checkpointed_and_bounded() -> None:
    rendered = render_prompt("work-build", "pi", config=_memory_config())
    normalized = " ".join(rendered.split())

    assert "one-time, Epic-scoped consent naming that item set and these limits" in normalized
    assert "using local code, local tests, and compact checkpoints" in normalized
    assert "Checkpoint after every slice before selecting another" in normalized
    for boundary in (
        "blocker",
        "scope change",
        "verification boundary",
        "user stop",
        "ambiguous result",
        "failed required check",
        "exhausted ready work",
    ):
        assert boundary in normalized
    assert "never authorizes remote or destructive actions" in normalized
    assert "do not perform remote or destructive actions in Build" in normalized


def test_build_closure_requires_evidence_and_confirmation_then_stops_at_verify() -> None:
    rendered = render_prompt("work-build", "opencode")
    normalized = " ".join(rendered.split())

    assert "maps every acceptance criterion to a completed result" in normalized
    assert "user separately confirms that exact status transition" in normalized
    assert (
        "Never close an issue from YOLO consent, memory, or an implementation claim" in normalized
    )
    assert "Build never closes the Epic" in normalized
    assert "checkpoint the boundary, and recommend `work-verify`" in normalized
    assert (
        "Never run verification as part of this invocation or continue into Release" in normalized
    )


@pytest.mark.parametrize("harness", ("opencode", "pi"))
def test_verify_recognizes_epic_and_covers_required_review_dimensions(harness: str) -> None:
    rendered = render_prompt("work-verify", harness)
    normalized = " ".join(rendered.split())

    assert "Verify one recognized Epic" in normalized
    assert "Map every Epic acceptance criterion to current authoritative evidence" in normalized
    assert "correctness, maintainability, security and privacy" in normalized
    assert "backward and forward compatibility" in normalized
    assert "Mark each inapplicable check **Not needed** with its reason" in normalized
    assert "never convert absent evidence into a pass" in normalized


def test_verify_diagnoses_distinct_occurrences_and_requires_user_selected_route() -> None:
    rendered = render_prompt("work-verify", "opencode")
    normalized = " ".join(rendered.split())

    for failure_class in (
        "product defects",
        "tooling, environment, dependency, and configuration failures",
        "evidence gaps or ambiguous results",
        "requirement, acceptance-boundary, architecture, design-scope",
    ):
        assert failure_class in normalized
    assert "Group repeated commands and symptoms by distinct defect occurrence" in normalized
    assert (
        "repair now, defer with accepted risk, narrow scope, gather more evidence, or stop"
        in normalized
    )
    assert "Never silently choose a route" in normalized
    assert (
        "defect recurring only after verified resolution is a regression and a new occurrence"
        in normalized
    )


def test_verify_reuses_active_canonical_bug_and_confirms_every_mutation() -> None:
    rendered = render_prompt("work-verify", "pi")
    normalized = " ".join(rendered.split())

    assert (
        "all Bugs owned by the recognized Epic that are provider-discoverable and non-archived"
        in normalized
    )
    assert "regardless of status" in normalized
    assert (
        "exactly one provider-discoverable, non-archived canonical Bug for that occurrence"
        in normalized
    )
    assert "Reuse a matching open or in-progress Bug" in normalized
    assert "Only after confirmation, update it or add a compact evidence comment" in normalized
    assert "do not create a duplicate" in normalized
    assert (
        "Create a Bug only after item-level confirmation of that exact occurrence and proposal"
        in normalized
    )
    assert "Creation, transition, reopen, update, comment, and relationship changes" in normalized
    assert "each require confirmation" in normalized


def test_verify_handles_closed_and_archived_bugs_with_capability_limits() -> None:
    rendered = render_prompt("work-verify", "opencode")
    normalized = " ".join(rendered.split())

    assert (
        "matching done or closed Bug for the same unresolved occurrence blocks creation"
        in normalized
    )
    assert (
        "transition or reopen only when the configured provider and selected tool expose that "
        "capability" in normalized
    )
    assert "remain blocked and offer the separate user-selected route" in normalized
    assert "do not enumerate, unarchive, restore, or require archived Bugs" in normalized
    assert "user-supplied known archived Bug ID may be exact-read only" in normalized
    assert "used only as historical reference" in normalized
    assert "without widening the search" in normalized


def test_verify_regression_reference_parentage_and_routes_are_bounded() -> None:
    rendered = render_prompt("work-verify", "pi")
    normalized = " ".join(rendered.split())

    assert "Reference the prior Bug ID only in the new Bug body" in normalized
    assert "Never add a prior-Bug issue relationship or invent a relationship type" in normalized
    assert "Parent every created Bug to the recognized Epic" in normalized
    assert "optional `relates_to` relationship to an affected Story or Task" in normalized
    assert "it never replaces the Epic parent" in normalized
    assert (
        "Add no issue tool, contract, provider syntax, or direct authority-file edit" in normalized
    )
    assert (
        "eligible for later Build selection, even outside the original planned Task set"
        in normalized
    )
    assert "only after the user confirms repair" in normalized
    assert "design-scope change instead returns to `work-plan`" in normalized
    assert "recommends `work-release <epic-id>`" in normalized
    assert "Never enter Build, Plan, or Release in this invocation" in normalized
