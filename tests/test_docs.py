"""Documentation consistency checks."""

import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
SDLC_TEMPLATES = ROOT / "src" / "harnessctl" / "templates" / "sdlc"
AUTHORITATIVE_TITLE = "Authoritative template-derived command transitions"
COMMAND_NODE_IDS = {
    "work-new": "new",
    "work-explore": "explore",
    "work-plan": "plan",
    "work-resume": "resume",
    "work-start-from": "startFrom",
    "work-start-initiative": "startInitiative",
    "work-start-epic": "startEpic",
    "work-write-stories": "stories",
    "work-start-story": "startStory",
    "work-design-doc": "design",
    "work-hld": "hld",
    "work-lld": "lld",
    "work-write-tasks": "tasks",
    "work-implement": "implement",
    "work-verify": "verify",
    "work-review": "review",
    "work-cvs": "cvs",
    "work-finish": "finish",
}


def test_documentation_set_and_root_index_exist() -> None:
    expected = {
        "README.md",
        "sdlc.md",
        "skills.md",
        "configuration.md",
        "memory.md",
        "issues.md",
        "cvs.md",
    }
    assert {path.name for path in DOCS.glob("*.md")} == expected
    assert "docs/README.md" in (ROOT / "README.md").read_text(encoding="utf-8")


def test_local_markdown_links_resolve() -> None:
    markdown_files = [ROOT / "README.md", ROOT / "FLOWS.md", *DOCS.glob("*.md")]
    for source in markdown_files:
        text = source.read_text(encoding="utf-8")
        for target in re.findall(r"\[[^]]+\]\(([^)]+)\)", text):
            if "://" in target or target.startswith("#"):
                continue
            path = (source.parent / target.split("#", 1)[0]).resolve()
            assert path.exists(), f"broken link in {source.relative_to(ROOT)}: {target}"


def test_mermaid_diagrams_have_accessibility_metadata() -> None:
    markdown_files = [ROOT / "README.md", ROOT / "FLOWS.md", *DOCS.glob("*.md")]
    for source in markdown_files:
        text = source.read_text(encoding="utf-8")
        diagrams = re.findall(r"^```mermaid\s*\n(.*?)^```\s*$", text, re.MULTILINE | re.DOTALL)
        for block_number, diagram in enumerate(diagrams, start=1):
            location = f"{source.relative_to(ROOT)} Mermaid block {block_number}"
            assert re.search(r"^\s*accTitle:\s*\S", diagram, re.MULTILINE), location
            assert re.search(r"^\s*accDescr:\s*\S", diagram, re.MULTILINE), location


def test_one_authoritative_transition_graph_has_equivalent_table() -> None:
    markdown_files = [ROOT / "README.md", ROOT / "FLOWS.md", *DOCS.glob("*.md")]
    matches: list[tuple[Path, str, str]] = []
    heading_count = 0
    for source in markdown_files:
        text = source.read_text(encoding="utf-8")
        heading_count += text.count("## Authoritative command transitions")
        for diagram in re.findall(r"^```mermaid\s*\n(.*?)^```\s*$", text, re.MULTILINE | re.DOTALL):
            if f"accTitle: {AUTHORITATIVE_TITLE}" in diagram:
                matches.append((source, diagram, text))

    assert heading_count == 1, "expected exactly one authoritative transition section"
    assert len(matches) == 1, "expected exactly one authoritative transition graph"
    source, diagram, text = matches[0]
    assert source == DOCS / "sdlc.md"
    assert "accessible edge-equivalent of the graph" in text

    graph_edges: set[tuple[str, str, str]] = set()
    for line in diagram.splitlines():
        solid = re.match(r"^\s*(\w+).*?-->\|([^|]+)\|\s*(\w+)", line)
        dashed = re.match(r'^\s*(\w+).*?-\.\s*"([^"]+)"\s*\.->\s*(\w+)', line)
        edge = solid or dashed
        if edge:
            graph_edges.add((edge.group(1), edge.group(2), edge.group(3)))

    table_text = text.split("accessible edge-equivalent of the graph", 1)[1]
    table_text = table_text.split("\n\n## ", 1)[0]
    table_edges: set[tuple[str, str, str]] = set()
    for line in table_text.splitlines():
        if not line.startswith("|") or "---" in line:
            continue
        source, condition, destination = [cell.strip() for cell in line.split("|")[1:-1]]
        if source == "Source":
            continue
        source_id = _table_node_id(source)
        destination_id = (
            source_id if destination.startswith("Same command") else _table_node_id(destination)
        )
        table_edges.add((source_id, condition.replace("`", ""), destination_id))

    assert table_edges == graph_edges, (
        f"table-only edges: {sorted(table_edges - graph_edges)}; "
        f"graph-only edges: {sorted(graph_edges - table_edges)}"
    )


def _table_node_id(cell: str) -> str:
    command = re.search(r"`(work-[a-z-]+)`", cell)
    if command:
        return COMMAND_NODE_IDS[command.group(1)]
    if cell == "User request":
        return "request"
    for prefix, node_id in (
        ("`STOP — COMMAND BOUNDARY`", "intakeBoundary"),
        ("`CONTEXTUAL CLARIFICATION OUTCOME`", "clarification"),
        ("`STOPPED`", "stopped"),
        ("`STOP — APPROVED PLAN OUTCOME`", "approvedPlan"),
        ("`CONTEXTUAL NEXT COMMAND`", "contextualNext"),
        ("`BLOCKED`", "blocked"),
        ("`CONTEXTUAL RECOMMENDATION`", "contextualRecommendation"),
        ("`STOP — APPROVAL PROPOSAL`", "approvalBoundary"),
        ("`COMPLETE`", "complete"),
    ):
        if cell.startswith(prefix):
            return node_id
    raise AssertionError(f"unknown transition-table node: {cell}")


def test_authoritative_transitions_label_all_installed_and_conceptual_commands() -> None:
    text = (DOCS / "sdlc.md").read_text(encoding="utf-8")
    section = text.split("## Authoritative command transitions", 1)[1]
    section = section.split("## Planned or future", 1)[0]
    flows = (ROOT / "FLOWS.md").read_text(encoding="utf-8")
    templates = sorted(SDLC_TEMPLATES.glob("work-*.md.j2"))
    assert len(templates) == 18
    for template in templates:
        installed = template.name.removesuffix(".md.j2")
        conceptual = installed.removeprefix("work-")
        assert installed in section
        assert f"/work {conceptual}" in section
        assert f"/{conceptual}" in section
        assert f"/{installed}" in flows
        assert f"/work {conceptual}" in flows


def test_command_template_changes_force_transition_documentation_review() -> None:
    """Snapshot all command templates; partials are intentionally excluded."""
    templates = sorted(SDLC_TEMPLATES.glob("work-*.md.j2"))
    assert len(templates) == 18
    digest = hashlib.sha256()
    for template in templates:
        digest.update(template.name.encode())
        digest.update(b"\0")
        digest.update(template.read_bytes())
        digest.update(b"\0")

    # Any command-template change requires reviewing the graph and edge table before
    # deliberately updating this complete 18-template digest.
    assert digest.hexdigest() == (
        "adb2814aff1a3a5c099a044eb51b85aaa0da88486039abbfd7b5647eab8b67d0"
    )


def test_docs_describe_current_issue_skill_and_future_memory_backends() -> None:
    skills = (DOCS / "skills.md").read_text(encoding="utf-8")
    issues = (DOCS / "issues.md").read_text(encoding="utf-8")
    memory = (DOCS / "memory.md").read_text(encoding="utf-8")

    assert ".opencode/skills/issue-tracking/SKILL.md" in skills
    for provider in ("filesystem", "github", "gitlab", "gitea", "forgejo"):
        assert provider in issues.lower()
    for backend in ("libsql", "mem0", "graphiti", "custom"):
        assert backend in memory.lower()
    assert "NOT IMPLEMENTED" in memory
    assert "Repository YAML" in memory
    assert "Shared local SQLite" in memory
    assert "Disposable internal cache; not a backend" in memory
    assert "project-local `@harnessctl/pi-tools`" in memory
    assert "Only `memory.backend: repository` is accepted today" in memory
    for token_env in (
        "HARNESSCTL_LIBSQL_TOKEN",
        "MEM0_API_KEY",
        "GRAPHITI_TOKEN",
        "HARNESSCTL_MEMORY_TOKEN",
    ):
        assert token_env in memory
    assert "enabled: false" in memory
    assert "project_id: payments-api" in memory
    assert "Minimal deep-merge override" in memory


def test_cvs_docs_cover_supported_routes_and_host_boundaries() -> None:
    cvs = (DOCS / "cvs.md").read_text(encoding="utf-8")
    normalized = " ".join(cvs.split())

    for value in ("git", "jj"):
        assert f"`{value}`" in cvs
    assert "exact configured provider CLI" in normalized
    assert "fixed-ID MCP service" in normalized
    assert "There is no configured selector" in normalized
    assert "no mandatory MCP-first or CLI-first order" in normalized
    assert "must choose before invoking a mutation" in normalized
    assert "must never switch" in normalized
    for provider, server_id, cli in (
        ("GitHub", "cvs_github", "gh"),
        ("GitLab", "cvs_gitlab", "glab"),
        ("Gitea", "cvs_gitea", "tea"),
        ("Forgejo", "cvs_forgejo", "forgejo-cli"),
    ):
        assert provider in cvs
        assert server_id in cvs
        assert f"`{cli}`" in cvs
    for path in (
        ".opencode/skills/cvs/SKILL.md",
        ".pi/skills/cvs/SKILL.md",
        ".opencode/opencode.json",
        ".pi/mcp.json",
        ".pi/settings.json",
    ):
        assert path in cvs
    assert "npm:pi-mcp-adapter@2.26.0" in cvs
    assert "forgejo-mcp` 2.33.0" in cvs
    assert "Environment-variable names only" in cvs
    assert "npm:@harnessctl/pi-tools@latest" in cvs
