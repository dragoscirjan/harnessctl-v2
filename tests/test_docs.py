"""Documentation consistency checks."""

import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
PROVIDER_EVIDENCE_POLICY = ROOT / ".harnessctl" / "tasks" / "hrn-00110" / "evidence-policy.md"
GRAPH_PROVIDER_RESEARCH = ROOT / ".harnessctl" / "tasks" / "hrn-00111" / "research.md"
CONTEXT_PROVIDER_RESEARCH = ROOT / ".harnessctl" / "tasks" / "hrn-00112" / "research.md"
PROVIDER_GUIDE = DOCS / "code-intelligence-providers.md"
SDLC_TEMPLATES = ROOT / "src" / "harnessctl" / "templates" / "sdlc"
SDLC_SKILL_TEMPLATES = ROOT / "src" / "harnessctl" / "templates" / "skills" / "sdlc"
AUTHORITATIVE_TITLE = "Authoritative template-derived command transitions"
PUBLIC_COMMANDS = {
    "work-build",
    "work-continue",
    "work-plan",
    "work-refresh",
    "work-release",
    "work-verify",
}
COMMAND_NODE_IDS = {
    "work-plan": "plan",
    "work-build": "build",
    "work-verify": "verify",
    "work-release": "release",
    "work-continue": "continueWork",
    "work-refresh": "refresh",
}
PROVIDER_HEADINGS = [
    "Status and version",
    "License",
    "Install and update",
    "MCP applicability",
    "OpenCode",
    "Pi",
    "Server mapping",
    "Lifecycle and storage",
    "Credentials, privacy, telemetry, and security",
    "Capabilities and limitations",
    "Stale-index behavior",
    "Removal",
    "Sources",
]
PROVIDER_MATRIX_HEADER = (
    "| Provider | Version/evidence date | MCP applicability | License/component | "
    "OpenCode | Pi | Index/storage ownership | Network/data egress | Telemetry | "
    "Stale-index behavior | Evidence limitations |"
)
CITATION_FIELDS = (
    "Claim supported",
    "Evidence status",
    "Source URL",
    "Source kind",
    "Access date",
    "Provider version, tag, or commit",
    "Applicable component",
    "Evidence excerpt or location",
    "Qualification",
)
EVIDENCE_STATUSES = {"Supported", "Unsupported", "Ambiguous", "Unknown", "Stale"}


def _provider_section(document: str, provider: str) -> str:
    match = re.search(
        rf"^## {re.escape(provider)}\n(?P<section>.*?)(?=^## |\Z)",
        document,
        re.MULTILINE | re.DOTALL,
    )
    assert match is not None
    return match.group("section")


def _assert_provider_structure(document: str, providers: tuple[str, ...]) -> None:
    assert document.count(PROVIDER_MATRIX_HEADER) == 1
    for provider in providers:
        section = _provider_section(document, provider)
        headings = re.findall(r"^### \d+\. (.+)$", section, re.MULTILINE)
        assert headings == PROVIDER_HEADINGS
        assert "pi-mcp-adapter" in section
        assert "2.26.0" in section
        assert ".pi/mcp.json" in section
        assert '"mcpServers"' in section


def test_documentation_set_and_root_index_exist() -> None:
    expected = {
        "README.md",
        "sdlc.md",
        "skills.md",
        "configuration.md",
        "memory.md",
        "issues.md",
        "documents.md",
        "cvs.md",
        "code-intelligence.md",
        "code-intelligence-providers.md",
    }
    assert {path.name for path in DOCS.glob("*.md")} == expected
    assert "docs/README.md" in (ROOT / "README.md").read_text(encoding="utf-8")


def test_document_docs_cover_fixed_authority_and_removed_legacy_links() -> None:
    documents = (DOCS / "documents.md").read_text(encoding="utf-8")
    issues = (DOCS / "issues.md").read_text(encoding="utf-8")
    public_docs = "\n".join(path.read_text(encoding="utf-8") for path in DOCS.glob("*.md"))

    assert "fixed repository-local" in documents
    assert ".harnessctl/documents" in documents
    assert "No `.specs` or `.ai.tmp` migration command or link compatibility ships" in documents
    assert "`.specs-v1` is inert repository history" in documents
    assert "--migrate-specs" not in public_docs
    assert "migration runner" not in public_docs
    assert "retired legacy roots are rejected" in issues
    assert ".ai.tmp/*.md" not in public_docs
    assert "remain linkable" not in documents


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
    if cell in {"User request", "Prompt or issue ID"}:
        return "request"
    for prefix, node_id in (
        ("`USER CONFIRMATION`", "confirmation"),
        ("`INITIATIVE MODE STOP`", "initiativeStop"),
        ("`BLOCKED OR STOPPED`", "blocked"),
        ("`HUMAN MERGE OR COMPLETE`", "complete"),
        ("`SAME PHASE STOP`", "samePhaseStop"),
        ("`REFRESH REPORT`", "refreshReport"),
        ("`BLOCKED`", "blocked"),
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
    assert {template.name.removesuffix(".md.j2") for template in templates} == PUBLIC_COMMANDS
    for template in templates:
        installed = template.name.removesuffix(".md.j2")
        conceptual = installed.removeprefix("work-")
        assert installed in section
        assert f"/work {conceptual}" in section
        assert f"/{installed}" in flows
        assert f"/work {conceptual}" in flows


def test_command_template_changes_force_transition_documentation_review() -> None:
    """Snapshot command shells and progressively disclosed SDLC policy."""
    commands = sorted(
        SDLC_TEMPLATES.glob("work-*.md.j2"),
        key=lambda template: template.relative_to(ROOT).as_posix(),
    )
    assert {template.name.removesuffix(".md.j2") for template in commands} == PUBLIC_COMMANDS
    templates = [
        *commands,
        *sorted(
            SDLC_SKILL_TEMPLATES.rglob("*.md.j2"),
            key=lambda template: template.relative_to(ROOT).as_posix(),
        ),
    ]
    assert len(templates) == 21
    digest = hashlib.sha256()
    for template in templates:
        digest.update(template.relative_to(ROOT).as_posix().encode())
        digest.update(b"\0")
        # Normalize checkout line endings so this review guard is stable on Windows.
        digest.update(template.read_text(encoding="utf-8").encode())
        digest.update(b"\0")

    # Any shell or disclosed-policy change requires reviewing the graph and edge table
    # before deliberately updating this complete digest.
    assert digest.hexdigest() == (
        "65210fc0b88d3dab24981bf0a55828e47492214cdef73b76074b453207b677ac"
    )


def test_plan_design_reference_owns_document_lifecycle_on_both_hosts() -> None:
    template = (SDLC_SKILL_TEMPLATES / "references/plan-design.md.j2").read_text(encoding="utf-8")
    generated = [
        (ROOT / host / "skills/sdlc/references/plan-design.md").read_text(encoding="utf-8")
        for host in (".opencode", ".pi")
    ]

    assert generated == [template, template]
    for kind in ("hld", "lld", "design-overview", "gdd"):
        assert kind in template.lower()
    for tool in (
        "document_list",
        "document_get",
        "document_create",
        "document_update",
        "document_version",
        "document_validate",
        "issue_link_document",
        "issue_validate",
    ):
        assert f"`{tool}`" in template
    assert "specification tooling" not in template
    normalized = " ".join(template.split())
    assert "Separately confirm the transition to `review`" in normalized
    assert "separately confirm the transition to `approved`" in normalized
    assert "fresh exact revision immediately before mutation" in normalized
    assert "approved active canonical path" in normalized
    assert "before checkpointing" in normalized


def test_docs_describe_standalone_refresh_contract() -> None:
    sdlc = (DOCS / "sdlc.md").read_text(encoding="utf-8")
    flows = (ROOT / "FLOWS.md").read_text(encoding="utf-8")
    memory = (DOCS / "memory.md").read_text(encoding="utf-8")
    code_index = (DOCS / "code-intelligence.md").read_text(encoding="utf-8")
    normalized = " ".join((sdlc + flows + memory + code_index).split())

    for phrase in (
        "does not require an Epic",
        "cannot be resumed by Continue",
        "reconciliation, not remote or bidirectional synchronization",
        "`memory_validate`",
        "Only returned `rebuilt` evidence proves cache repair",
        "active decision or event",
        "loads `sdlc-code-index`",
        "compiled configured server and boundaries",
        "live-schema support",
        "current evidence freshness",
        "current-repository scope",
        "fresh consent naming the provider, operation, and repository",
        "Unsupported capability is reported",
    ):
        assert phrase in normalized
    for status in ("refreshed", "skipped", "unsupported", "stale", "blocked"):
        assert f"`{status}`" in normalized


def test_docs_describe_current_issue_skill_and_future_memory_backends() -> None:
    skills = (DOCS / "skills.md").read_text(encoding="utf-8")
    issues = (DOCS / "issues.md").read_text(encoding="utf-8")
    memory = (DOCS / "memory.md").read_text(encoding="utf-8")

    assert ".opencode/skills/sdlc-issue-tracking/SKILL.md" in skills
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


def test_docs_describe_configurable_tdd_behavior() -> None:
    configuration = (DOCS / "configuration.md").read_text(encoding="utf-8")
    skills = (DOCS / "skills.md").read_text(encoding="utf-8")
    sdlc = (DOCS / "sdlc.md").read_text(encoding="utf-8")
    normalized_sdlc = " ".join(sdlc.split())

    assert "`workflow.tdd.enabled`" in configuration
    assert "default is `false`" in configuration
    assert "workflow:\n  tdd:\n    enabled: true" in configuration
    for path in (
        ".opencode/skills/sdlc-develop-tdd/SKILL.md",
        ".pi/skills/sdlc-develop-tdd/SKILL.md",
    ):
        assert path in skills
    assert "does not delete" in skills
    assert "existing skill untouched and dormant" in configuration
    assert "remains dormant" in normalized_sdlc
    assert "`workflow.tdd.enabled`" in sdlc
    assert "loads `sdlc-develop-tdd` before implementation" in normalized_sdlc
    assert "Red, Green, and Refactor" in normalized_sdlc
    assert "`work-continue` resumes Build" in normalized_sdlc


def test_docs_describe_sdlc_code_installation_and_build_boundaries() -> None:
    skills = (DOCS / "skills.md").read_text(encoding="utf-8")
    sdlc = (DOCS / "sdlc.md").read_text(encoding="utf-8")
    root = (ROOT / "README.md").read_text(encoding="utf-8")
    normalized = " ".join((skills + sdlc + root).split())

    for phrase in (
        "26 bundled references",
        "Explicit repository policy and approved scope take precedence",
        "Named tools are alternatives, not cumulative installation requirements",
        "Ambiguous `.h` and `.sh` files require repository evidence",
        "TSX combines TypeScript with React guidance only when React is established",
        "GDScript as distinct from Python",
        "Plan, Verify, Release, and non-Build Continue do not activate `sdlc-code`",
        "byte-equivalent OpenCode and Pi trees",
        "global skills under `~/.config/opencode`",
    ):
        assert phrase in normalized
    assert ".opencode/skills/sdlc-code/" in root
    assert ".pi/skills/sdlc-code/" in root
    assert "--force" in root
    assert "remove any renamed support-skill directories that version does not manage" in normalized


def test_docs_describe_sdlc_code_index_opt_in_and_operator_boundaries() -> None:
    configuration = (DOCS / "configuration.md").read_text(encoding="utf-8")
    skills = (DOCS / "skills.md").read_text(encoding="utf-8")
    guide = (DOCS / "code-intelligence.md").read_text(encoding="utf-8")
    root = (ROOT / "README.md").read_text(encoding="utf-8")
    normalized = " ".join(guide.split())
    normalized_skills = " ".join(skills.split())

    assert "`skills.sdlc-code-index.enabled`" in configuration
    assert "default is `false`" in configuration
    assert "`skills.sdlc-code-index.mcp_server`" in configuration
    assert "reserved `cvs_` prefix" in configuration
    for path in (
        ".opencode/skills/sdlc-code-index/SKILL.md",
        ".pi/skills/sdlc-code-index/SKILL.md",
    ):
        assert path in skills
    assert "byte-equivalent" in skills
    assert "loads `sdlc-code-index`" in " ".join(skills.split())
    assert "never deletes it automatically" in " ".join(skills.lower().split())
    assert "remains active-capable" in skills
    assert "does not inspect or change host MCP entries" not in normalized_skills
    assert "does not inspect or change code-index MCP entries" in normalized_skills
    assert "generic CVS and issue MCP projection remains active" in normalized_skills
    assert "does not register or run that server" in normalized
    assert "user-owned under normal, forced, migration, and rollback paths" in normalized
    assert "advisory retrieval evidence, never source authority" in normalized
    assert "Glob" in guide and "Grep" in guide
    assert "load `sdlc-code-index`" in normalized
    for phrase in (
        "old top-level `code_index` key",
        "all `mcp.servers` mappings are rejected",
        "audit `.opencode/opencode.json` and `.pi/mcp.json` manually",
        "old provider package may be uninstalled",
        "separate user-authorized operation",
        "user-owned",
    ):
        assert phrase in normalized
    assert "harnessctl never projects or manages them" in " ".join(root.split())
    assert "release-gated on `hrn-00085`" not in root
    assert "docs/code-intelligence.md" in root


def test_code_index_provider_evidence_policy_is_complete() -> None:
    policy = PROVIDER_EVIDENCE_POLICY.read_text(encoding="utf-8")
    normalized = " ".join(policy.split())
    normalized_lower = normalized.lower()

    for field in (
        "Source URL",
        "Source kind",
        "Access date",
        "Provider version, tag, or commit",
        "Claim supported",
    ):
        assert field in policy
    assert "within 7 calendar days" in normalized
    assert "recheck every cited claim during formal verify" in normalized_lower
    assert "mark the evidence stale and narrow or remove the claim" in normalized_lower

    for field in (
        "SPDX identifier or exact license identity",
        "Applicable component and release",
        "Exceptions or dual licensing",
        "Redistribution constraints",
    ):
        assert field in policy
    for topic in (
        "Network exposure",
        "Authentication and authorization",
        "Filesystem and process permissions",
        "Data egress",
        "Supply-chain posture",
        "Telemetry",
        "Credentials",
        "Retention",
        "Storage",
        "Models and databases",
        "Sandboxing",
        "Remote services",
    ):
        assert topic in policy

    for status in ("Supported", "Unsupported", "Ambiguous", "Unknown", "Stale"):
        assert f"`{status}`" in policy
    provider_headings = [
        "Status and version",
        "License",
        "Install and update",
        "MCP applicability",
        "OpenCode",
        "Pi",
        "Server mapping",
        "Lifecycle and storage",
        "Credentials, privacy, telemetry, and security",
        "Capabilities and limitations",
        "Stale-index behavior",
        "Removal",
        "Sources",
    ]
    provider_template = policy.split("## Provider research template", 1)[1].split(
        "## Comparison matrix schema", 1
    )[0]
    assert re.findall(r"^\d+\. (.+)$", provider_template, re.MULTILINE) == provider_headings

    assert "## Source precedence" in policy
    assert "When sources conflict" in policy
    assert "mark the result `Ambiguous`" in normalized
    assert "`Search record` with the repositories, documentation areas" in normalized
    assert "Use `Not found` as the Source URL only" in normalized
    assert "Do not infer behavior from silence" in policy
    assert "Do not install, execute, probe, index, watch, update, or remove" in normalized
    assert "provider, package, process, model, database, or index" in normalized
    assert "Do not mutate external MCP configuration" in normalized
    assert "credentials, storage, or provider-owned state" in normalized
    assert "Do not perform a live handshake" in normalized
    assert "required research handoff for `hrn-00111` and `hrn-00112`" in normalized
    assert "Provide the structured records to `hrn-00113`" in normalized


def test_graph_provider_research_satisfies_the_evidence_policy() -> None:
    research = GRAPH_PROVIDER_RESEARCH.read_text(encoding="utf-8")
    _assert_provider_structure(
        research,
        ("CodeGraphContext", "GitNexus", "Graphify"),
    )

    source_header = "| ID | " + " | ".join(CITATION_FIELDS) + " |"
    assert research.count(source_header) == 3
    citation_rows = re.findall(
        r"^\| ((?:CGC|GN|GF)-(?:U)?\d+) \|.*?\| "
        r"(Supported|Unsupported|Ambiguous|Unknown|Stale) \|",
        research,
        re.MULTILINE,
    )
    citation_ids = [citation_id for citation_id, _ in citation_rows]
    assert len(citation_ids) >= 100
    assert len(citation_ids) == len(set(citation_ids))
    assert {status for _, status in citation_rows} <= EVIDENCE_STATUSES
    referenced_ids = set(re.findall(r"\b(?:CGC|GN|GF)-(?:U)?\d+\b", research))
    assert referenced_ids <= set(citation_ids)
    assert all(
        re.search(
            rf"^\| {re.escape(citation_id)} \|.*\| 2026-\d{{2}}-\d{{2}} \|",
            research,
            re.MULTILINE,
        )
        for citation_id in citation_ids
    )
    for line in research.splitlines():
        if not re.match(r"^\| (?:CGC|GN|GF)-(?:U)?\d+ \|", line):
            continue
        fields = [field.strip() for field in line.strip("|").split("|")]
        if fields[2] == "Unknown":
            assert fields[4] == "Search record"

    assert "repository-local `<repo>/.gitnexus/`" in research
    assert "`~/.gitnexus/registry.json` is global discovery metadata" in research
    assert "~/.gitnexus/<repo>" not in research
    assert "python -m graphify.serve graphify-out/graph.json" in research
    assert "`.graphify-out/`" not in research
    assert "`graphify mcp`" not in research
    assert "inadvertently invoked `list_repos`" in research
    assert "entire output is quarantined" in research
    assert "must be carried into formal Verify" in research
    assert re.search(
        r"^\| GN-04 \| General commercial production use is granted.*\| Unsupported \|",
        research,
        re.MULTILINE,
    )
    gitnexus = _provider_section(research, "GitNexus")
    install_section = gitnexus.split("### 3. Install and update", 1)[1].split("### 4.", 1)[0]
    assert install_section.count("npm install -g gitnexus@1.6.9") == 1
    assert "update procedure was not established" in install_section


def test_context_provider_research_satisfies_the_evidence_policy() -> None:
    research = CONTEXT_PROVIDER_RESEARCH.read_text(encoding="utf-8")
    _assert_provider_structure(
        research,
        ("Repomix", "FastCode", "CocoIndex"),
    )

    citation_matches = list(
        re.finditer(
            r"^#{3,4} \[(?P<id>[RFCH]\d+)\].*?\n"
            r"(?P<body>.*?)(?=^#{3,4} \[|^## |\Z)",
            research,
            re.MULTILINE | re.DOTALL,
        )
    )
    citation_ids = [match.group("id") for match in citation_matches]
    assert len(citation_ids) >= 80
    assert len(citation_ids) == len(set(citation_ids))
    referenced_ids = set(re.findall(r"\[([RFCH]\d+)\]", research))
    assert referenced_ids <= set(citation_ids)
    for match in citation_matches:
        body = match.group("body")
        for field in CITATION_FIELDS:
            assert body.count(f"| {field} |") == 1
        status_match = re.search(r"^\| Evidence status \| (.+) \|$", body, re.MULTILINE)
        assert status_match is not None
        assert status_match.group(1) in EVIDENCE_STATUSES
        assert re.search(r"^\| Access date \| 2026-\d{2}-\d{2} \|$", body, re.MULTILINE)
        if status_match.group(1) == "Unknown":
            assert "| Source kind | Search record |" in body

    repomix = _provider_section(research, "Repomix")
    fastcode = _provider_section(research, "FastCode")
    cocoindex = _provider_section(research, "CocoIndex")
    assert "Persistent code-index applicability is **Unknown**" in repomix
    assert "Provider version, tag, or commit | Unknown; unversioned page" in repomix
    for section in (repomix, fastcode, cocoindex):
        assert "| Filesystem / process permissions | **Unknown** |" in section
        assert "| Storage location / ownership | **Unknown** |" in section
    assert "| Credentials / secrets | **Unknown** |" in repomix
    assert "| Remote / hosted processing | **Unknown** |" in repomix
    assert "License is **Ambiguous**" in research
    assert "root `LICENSE`" in fastcode
    assert "README says MIT" in fastcode
    assert "Pi core has no native MCP host syntax" in research
    assert "separately maintained `pi-mcp-adapter` v2.26.0" in research
    assert "No provider software was installed, executed, probed, indexed" in research
    assert "no live MCP handshake was performed" in research
    assert "Version pinning is preferable" not in research
    assert "Prefer sandbox mode" not in research
    assert "Suggested mapping" not in research
    assert "Suggested skill mapping" not in research


def test_external_code_index_provider_guide_is_complete_and_neutral() -> None:
    guide = PROVIDER_GUIDE.read_text(encoding="utf-8")
    root = (ROOT / "README.md").read_text(encoding="utf-8")
    docs_index = (DOCS / "README.md").read_text(encoding="utf-8")
    neutral_guide = (DOCS / "code-intelligence.md").read_text(encoding="utf-8")
    normalized = " ".join(guide.split())

    for index in (root, docs_index, neutral_guide):
        assert "code-intelligence-providers.md" in index

    providers = (
        "CodeGraphContext",
        "GitNexus",
        "Graphify",
        "Repomix",
        "FastCode",
        "CocoIndex",
    )
    assert re.findall(r"^## (.+)$", guide, re.MULTILINE) == [
        "Evidence boundary",
        "Comparison matrix",
        "Shared host boundary",
        *providers,
        "Migration and manual cleanup",
    ]
    for provider in providers:
        section = _provider_section(guide, provider)
        headings = re.findall(r"^### \d+\. (.+)$", section, re.MULTILINE)
        assert headings == PROVIDER_HEADINGS

    assert guide.count("## Comparison matrix") == 1
    for column in (
        "Version/evidence date",
        "MCP applicability",
        "License/component",
        "Index/storage ownership",
        "Network/data egress",
        "Evidence limitations",
    ):
        assert column in guide

    assert "Plan-authorized, nonprecedential research exception" in normalized
    assert "read-only GitNexus" not in guide
    assert "output is excluded from claims, citations, search inputs" in normalized
    assert "Provider retention, egress, and remote state" in normalized
    assert "authorizes no later provider call" in normalized
    assert "No intended mutation was observed" in guide

    assert "Pi core is **Unsupported**" in guide
    assert "`pi-mcp-adapter` `2.26.0`" in guide
    assert "**Supported** at the documented syntax level but untested" in normalized
    assert ".pi/mcp.json" in guide

    for fact in (
        "package/source `0.6.5`, GitHub release `v0.5.7`",
        "PolyForm Noncommercial 1.0.0",
        "repository-local `<repo>/.gitnexus/`",
        "`graphifyy[mcp]`",
        "`graphify-out/`",
        "persistent index are **Unknown**",
        "root license absent at checked commits",
        "`cocoindex-code` `0.2.41`",
        "generic CocoIndex framework `1.0.20`",
    ):
        assert fact in normalized

    assert "## Migration and manual cleanup" in guide
    assert "Audit user-owned `.opencode/opencode.json` and `.pi/mcp.json`" in normalized
    assert "Harnessctl performs none of these actions" in normalized
    assert "recommending or endorsing a provider" in guide
    assert "default provider" not in guide.lower()
    assert "suggested mapping" not in guide.lower()
    assert "prefer " not in guide.lower()

    reference_ids = set(re.findall(r"\[((?:CGC|GN|GF)-(?:U)?\d+|[RFCH]\d+)\]", guide))
    defined_ids = set(re.findall(r"^\[((?:CGC|GN|GF)-(?:U)?\d+|[RFCH]\d+)\]:", guide, re.MULTILINE))
    assert reference_ids <= defined_ids

    changeset_policy = (ROOT / ".changeset" / "README.md").read_text(encoding="utf-8")
    assert "Documentation, tests, and repository-only automation changes need no changeset" in (
        changeset_policy
    )


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
        ("GitHub", "sdlc_cvs_github", "gh"),
        ("GitLab", "sdlc_cvs_gitlab", "glab"),
        ("Gitea", "sdlc_cvs_gitea", "tea"),
        ("Forgejo", "sdlc_cvs_forgejo", "forgejo-cli"),
    ):
        assert provider in cvs
        assert server_id in cvs
        assert f"`{cli}`" in cvs
    for path in (
        ".opencode/skills/sdlc-cvs/SKILL.md",
        ".pi/skills/sdlc-cvs/SKILL.md",
        ".opencode/opencode.json",
        ".pi/mcp.json",
        ".pi/settings.json",
    ):
        assert path in cvs
    assert "npm:pi-mcp-adapter@2.26.0" in cvs
    assert "gitea-mcp` 1.6.0" in cvs
    assert "forgejo-mcp` 2.33.0" in cvs
    assert '"command": ["gitea-mcp", "--transport", "stdio", "--host"' in cvs
    assert '"command": ["forgejo-mcp", "--transport", "stdio", "--url"' in cvs
    assert "A previously generated Forgejo-backed Gitea definition" in normalized
    assert (
        "modified historical definition under either `cvs_gitea` or `sdlc_cvs_gitea` "
        "remains byte-preserved with a warning and blocks planned canonical replacement "
        "under force and non-force" in normalized
    )
    assert "Recognition requires the old local `forgejo-mcp` executable signature" in normalized
    assert "Environment-variable names only" in cvs
    assert "npm:@harnessctl/pi-tools@latest" in cvs
    assert "every skill in the current managed registry" in normalized


def test_documents_docs_cover_local_lifecycle_and_removed_remote_surfaces() -> None:
    documents = (DOCS / "documents.md").read_text(encoding="utf-8")
    normalized_documents = " ".join(documents.split())
    configuration = (DOCS / "configuration.md").read_text(encoding="utf-8")
    skills = (DOCS / "skills.md").read_text(encoding="utf-8")
    current_docs = "\n".join(path.read_text(encoding="utf-8") for path in DOCS.glob("*.md"))

    for fact in (
        "`hld`, `lld`, `design-overview`, and `gdd`",
        "`document_id`, `document_create`, `document_list`",
        "`document_update`, `document_version`, `document_validate`",
        "`document_archive`, and `document_restore`",
        "existing SDLC Plan reference",
        "latest exact-byte `expectedRevision`",
        "separately confirmed transitions",
        "approved active canonical path",
        "both `document_validate` and `issue_validate`",
        "No `.specs` or `.ai.tmp` migration command or link compatibility ships",
        "`.specs-v1` is inert repository history",
        "exact previously managed one-file output",
        "`--force` does not weaken this fingerprint rule",
    ):
        assert fact in normalized_documents
    for removed in (
        "documents.remote",
        "sdlc_documents_gitea",
        "sdlc_documents_forgejo",
        "GitHub Wiki",
        "GitLab Wiki",
        "Gitea Wiki",
        "Forgejo Wiki",
    ):
        assert removed not in current_docs
    assert "remote providers are removed" in configuration
    assert "currently registers eight" in skills
    assert "No Documents agent or skill is generated" in skills


def test_current_design_links_use_canonical_documents_paths() -> None:
    docs_index = (DOCS / "README.md").read_text(encoding="utf-8")
    root = (ROOT / "README.md").read_text(encoding="utf-8")

    assert "../.specs/" not in docs_index
    assert "--migrate-specs" not in root
    assert "migration runner" not in root
    for path in (
        "doc-00013-repository-local-sdlc-design-document-management-v4.md",
        "doc-00014-repository-local-sdlc-design-document-management-v4.md",
    ):
        assert f"../.harnessctl/documents/{path}" in docs_index


def test_current_document_release_notes_do_not_advertise_migration() -> None:
    root_changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    generic_changelog = (ROOT / "extensions/generic-tools/CHANGELOG.md").read_text(encoding="utf-8")
    current_notes = (
        root_changelog.split("## Unreleased", 1)[1].split("## 0.2.0", 1)[0]
        + generic_changelog.split("## Unreleased", 1)[1].split("## 0.1.8", 1)[0]
        + (ROOT / ".changeset/bright-documents-link.md").read_text(encoding="utf-8")
    )

    assert "repository-local Documents lifecycle" in current_notes
    assert "safe issue document links" in current_notes
    for retired_surface in ("--migrate-specs", "packaged runner", "migration runtime and CLI"):
        assert retired_surface not in current_notes
