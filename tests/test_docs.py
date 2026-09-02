"""Documentation consistency checks."""

import copy
import hashlib
import json
import re
import runpy
import tomllib
from pathlib import Path

import pytest
import yaml

from harnessctl.install import TARGETS
from harnessctl.mcp import CVS_MCP_SERVER_IDS
from harnessctl.templates import (
    SKILL_ID_MIGRATIONS,
    SKILL_IDS,
    SKILL_RESOURCE_TEMPLATES,
    SKILL_TEMPLATES,
)

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
PROVIDER_EVIDENCE_POLICY = ROOT / ".harnessctl" / "tasks" / "hrn-00110" / "evidence-policy.md"
GRAPH_PROVIDER_RESEARCH = ROOT / ".harnessctl" / "tasks" / "hrn-00111" / "research.md"
CONTEXT_PROVIDER_RESEARCH = ROOT / ".harnessctl" / "tasks" / "hrn-00112" / "research.md"
PROVIDER_GUIDE = DOCS / "code-intelligence-providers.md"
SDLC_TEMPLATES = ROOT / "src" / "harnessctl" / "templates" / "sdlc"
SDLC_SKILL_TEMPLATES = ROOT / "src" / "harnessctl" / "templates" / "skills" / "sdlc"
AUTHORITATIVE_TITLE = "Harnessctl command transitions"
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
PUBLIC_MARKDOWN = {
    "README.md",
    "caveman.md",
    "changelog.md",
    "code-intelligence-providers.md",
    "code-intelligence.md",
    "command-reference.md",
    "config-schema.md",
    "configuration.md",
    "cvs.md",
    "docs-overview.md",
    "documents.md",
    "faq.md",
    "getting-started.md",
    "harnesses.md",
    "installation.md",
    "issues.md",
    "mcp-servers.md",
    "memory.md",
    "node-modules.md",
    "sdlc-introduction.md",
    "sdlc.md",
    "skills.md",
    "status-and-evidence.md",
    "troubleshooting.md",
    "tdd.md",
    "web-retrieval.md",
}
EXPECTED_NAV = [
    {"Home": "README.md"},
    {
        "SDLC": [
            {"Introduction to SDLC": "sdlc-introduction.md"},
            {"Harnessctl SDLC": "sdlc.md"},
        ]
    },
    {"Harnesses": "harnesses.md"},
    {
        "Tools": [
            {"Skills": "skills.md"},
            {"Node Modules": "node-modules.md"},
            {"MCP Servers": "mcp-servers.md"},
        ]
    },
    {
        "Docs": [
            {"Overview": "docs-overview.md"},
            {"Installation": "installation.md"},
            {"Getting Started": "getting-started.md"},
            {
                "Reference": [
                    {"Config File": "configuration.md"},
                    {"Config Schema": "config-schema.md"},
                    {"Command Reference": "command-reference.md"},
                    {
                        "Skill Configuration": [
                            {"Issues": "issues.md"},
                            {"Documents": "documents.md"},
                            {"Memory": "memory.md"},
                            {"Caveman": "caveman.md"},
                            {"TDD": "tdd.md"},
                            {
                                "Code Index": [
                                    {"Overview": "code-intelligence.md"},
                                    {"Providers": "code-intelligence-providers.md"},
                                ]
                            },
                            {"Web Retrieval": "web-retrieval.md"},
                            {"CVS": "cvs.md"},
                        ]
                    },
                    {"Status and Evidence": "status-and-evidence.md"},
                ]
            },
            {"Troubleshooting": "troubleshooting.md"},
            {"FAQ": "faq.md"},
            {"Changelog": "changelog.md"},
        ]
    },
]
STRUCTURAL_STUBS = {
    "changelog.md": ("Changelog", "hrn-00178"),
    "faq.md": ("FAQ", "hrn-00178"),
    "node-modules.md": ("Node Modules", "hrn-00177"),
    "troubleshooting.md": ("Troubleshooting", "hrn-00178"),
}
SKILL_ENTRY_FIELDS = (
    "Purpose",
    "Use when",
    "Expected result",
    "Availability",
    "Activation",
    "Prerequisites",
    "Limits",
    "Status",
    "Evidence",
)
SKILL_CONFIGURATION_LINKS = {
    "sdlc": "command-reference.md",
    "sdlc-code": "sdlc.md",
    "sdlc-caveman": "caveman.md",
    "sdlc-develop-tdd": "tdd.md",
    "sdlc-code-index": "code-intelligence.md",
    "sdlc-memory": "memory.md",
    "sdlc-issue-tracking": "issues.md",
    "sdlc-cvs": "cvs.md",
}
MCP_ENTRY_FIELDS = (
    "Purpose",
    "Capabilities",
    "Ownership",
    "Limits and fallback",
    "Status",
    "Evidence",
)


class _MkDocsConfigLoader(yaml.SafeLoader):
    """Load trusted MkDocs callable references as inspectable names."""


_MkDocsConfigLoader.add_multi_constructor(
    "tag:yaml.org,2002:python/name:",
    lambda _loader, suffix, _node: suffix,
)


def _provider_section(document: str, provider: str) -> str:
    match = re.search(
        rf"^## {re.escape(provider)}\n(?P<section>.*?)(?=^## |\Z)",
        document,
        re.MULTILINE | re.DOTALL,
    )
    assert match is not None
    return match.group("section")


def _skill_section(document: str, skill_id: str) -> str:
    match = re.search(
        rf"^## `{re.escape(skill_id)}`\n(?P<section>.*?)(?=^## |\Z)",
        document,
        re.MULTILINE | re.DOTALL,
    )
    assert match is not None
    return match.group("section")


def _mcp_server_section(document: str, server_id: str) -> str:
    match = re.search(
        rf"^### `{re.escape(server_id)}`\n(?P<section>.*?)(?=^### |^## |\Z)",
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


def _assert_exact_set(actual: set[str], expected: set[str], label: str) -> None:
    assert actual == expected, (
        f"{label} mismatch: missing={sorted(expected - actual)}, extra={sorted(actual - expected)}"
    )


def test_documentation_set_and_root_index_exist() -> None:
    _assert_exact_set({path.name for path in DOCS.glob("*.md")}, PUBLIC_MARKDOWN, "public docs")
    assert "docs/README.md" in (ROOT / "README.md").read_text(encoding="utf-8")


def test_exact_inventory_gates_reject_added_members() -> None:
    for current, added, label in (
        (PUBLIC_MARKDOWN, "unexpected.md", "public docs"),
        (PUBLIC_COMMANDS, "work-unplanned", "prompt commands"),
        (
            {"issues", "documents", "memory", "caveman", "tdd", "codeIndex", "webRetrieval", "cvs"},
            "unconfiguredSkill",
            "skill configuration",
        ),
    ):
        with pytest.raises(AssertionError, match=label):
            _assert_exact_set(current | {added}, current, label)


def _navigation_pages(items: list[object]) -> set[str]:
    pages: set[str] = set()
    for item in items:
        if isinstance(item, str):
            pages.add(item)
        elif isinstance(item, dict):
            for value in item.values():
                if isinstance(value, str):
                    pages.add(value)
                elif isinstance(value, list):
                    pages.update(_navigation_pages(value))
    return pages


def test_documentation_site_configuration_covers_canonical_guides() -> None:
    config = yaml.load(
        (ROOT / "mkdocs.yml").read_text(encoding="utf-8"),
        Loader=_MkDocsConfigLoader,
    )
    assert config["strict"] is True
    assert config["docs_dir"] == "docs"
    assert config["site_dir"] == "site"
    assert config["theme"]["name"] == "material"
    assert {
        "content.code.copy",
        "navigation.footer",
        "navigation.indexes",
        "navigation.sections",
        "navigation.tabs",
        "navigation.tabs.sticky",
        "navigation.top",
        "search.highlight",
        "search.suggest",
    } <= set(config["theme"]["features"])
    assert len(config["theme"]["palette"]) == 2
    assert config["hooks"] == ["scripts/mkdocs_hooks.py"]
    assert config["extra_css"] == ["stylesheets/extra.css"]
    assert config["extra_javascript"] == ["javascripts/mermaid.mjs"]
    superfences = config["markdown_extensions"][-1]["pymdownx.superfences"]
    assert superfences["custom_fences"] == [
        {
            "name": "mermaid",
            "class": "mermaid",
            "format": "pymdownx.superfences.fence_code_format",
        }
    ]
    assert config["nav"] == EXPECTED_NAV
    assert _navigation_pages(config["nav"]) == PUBLIC_MARKDOWN
    serialized_nav = repr(config["nav"])
    for legacy_group in ("Use harnessctl", "Project authority", "MCP and integrations"):
        assert legacy_group not in serialized_nav

    mermaid_module = (DOCS / "javascripts" / "mermaid.mjs").read_text(encoding="utf-8")
    assert "mermaid@11.16.1/dist/mermaid.esm.min.mjs" in mermaid_module
    assert "startOnLoad: false" in mermaid_module
    assert "globalThis.mermaid = mermaid" in mermaid_module


def test_documentation_tasks_include_strict_build_in_quality() -> None:
    config = tomllib.loads((ROOT / "mise.toml").read_text(encoding="utf-8"))
    assert config["tasks"]["docs-generate"]["run"] == [
        "uv run python scripts/generate_reference_docs.py",
        "uv run python scripts/generate_llms.py",
    ]
    assert config["tasks"]["docs-build"]["run"] == [
        "uv run python scripts/generate_reference_docs.py --check",
        "uv run python scripts/generate_llms.py --check",
        "uv run mkdocs build --strict",
    ]
    assert config["tasks"]["docs-serve"]["depends"] == ["docs-generate"]
    assert config["tasks"]["docs-serve"]["run"] == "uv run mkdocs serve"
    parallel_quality_tasks = config["tasks"]["quality"]["run"][1]["tasks"]
    assert "docs-build" in parallel_quality_tasks
    eslint_config = (ROOT / "eslint.config.mjs").read_text(encoding="utf-8")
    assert "'.venv/**'" in eslint_config
    assert "'site/**'" in eslint_config


def test_structural_stubs_declare_only_page_state_and_owner() -> None:
    for filename, (title, owner) in STRUCTURAL_STUBS.items():
        stub = (DOCS / filename).read_text(encoding="utf-8")
        assert stub.startswith(
            f"# {title}\n\n> **Page status:** Planned content\n> **Content owner:** `{owner}`\n\n"
        )
        assert all(line == line.rstrip() for line in stub.splitlines())
        assert stub.count("\n#") == 0
        assert "**Status:**" not in stub
        assert len(stub.splitlines()) <= 10


def test_sdlc_introduction_teaches_harness_neutral_fundamentals() -> None:
    introduction = (DOCS / "sdlc-introduction.md").read_text(encoding="utf-8")
    headings = set(re.findall(r"^## (.+)$", introduction, re.MULTILINE))

    assert introduction.startswith("# Introduction to SDLC\n")
    assert "Planned content" not in introduction
    assert {
        "Why use a lifecycle",
        "Core lifecycle activities",
        "Feedback is part of the process",
        "Evidence supports decisions",
        "Roles and decision boundaries",
        "Common failure modes",
        "Choose the next activity",
        "How Harnessctl applies these ideas",
    }.issubset(headings)
    for activity in ("Discover", "Plan", "Build", "Verify", "Deliver", "Learn"):
        assert re.search(rf"^\|\s*{activity}\s*\|", introduction, re.MULTILINE)
    assert "](sdlc.md)" in introduction
    assert "](command-reference.md)" in introduction
    assert re.search(r"\bwork-[a-z-]+\b", introduction) is None


def test_harnessctl_sdlc_owns_controlled_epic_lifecycle_guidance() -> None:
    guide = (DOCS / "sdlc.md").read_text(encoding="utf-8")
    normalized = " ".join(guide.split())

    assert guide.startswith("# Harnessctl SDLC\n")
    assert "](sdlc-introduction.md)" in guide
    assert "](command-reference.md)" in guide
    for command in PUBLIC_COMMANDS:
        alias = command.removeprefix("work-")
        assert f"`{command}` / `/work {alias}`" in guide
    for phase in ("Plan", "Build", "Verify", "Release"):
        assert f"### {phase}\n" in guide
    assert "### Continue\n" in guide
    assert "### Refresh\n" in guide
    for boundary in (
        "Approval is always bounded",
        "Checkpoints record compact, confirmed progress",
        "Contradictory or ambiguous state causes a stop",
        "Local approval never implies remote or destructive consent",
        "YOLO is one-time, Epic-scoped, bounded consent",
        "Red, Green, and Refactor",
        "Merge remains a human action by default",
    ):
        assert boundary in normalized


def test_visual_shell_has_accessible_maintainable_extensions() -> None:
    stylesheet = (DOCS / "stylesheets" / "extra.css").read_text(encoding="utf-8")
    package = (ROOT / "package.json").read_text(encoding="utf-8")
    prettier_config = (ROOT / "prettier.config.mjs").read_text(encoding="utf-8")
    assert ":focus-visible" in stylesheet
    assert "prefers-reduced-motion" in stylesheet
    assert "max-width: 82rem" in stylesheet
    assert "table:not([class])" in stylesheet
    assert "color-mix" in stylesheet
    assert '"prettier": "./prettier.config.mjs"' in package
    assert "...baseConfig" in prettier_config
    assert "parser: 'css'" in prettier_config


def test_llm_indexes_are_current_and_follow_public_navigation() -> None:
    generator = runpy.run_path(str(ROOT / "scripts" / "generate_llms.py"))
    rendered = generator["render_outputs"]()
    for path, expected in rendered.items():
        assert path.read_text(encoding="utf-8") == expected

    compact = (DOCS / "llms.txt").read_text(encoding="utf-8")
    full = (DOCS / "llms-full.txt").read_text(encoding="utf-8")
    compact_routes = re.findall(r"^- \[[^]]+\]\(([^)]+)\):", compact, re.MULTILINE)
    full_routes = re.findall(r"^Source: (.+)$", full, re.MULTILINE)
    assert compact_routes == full_routes
    assert len(compact_routes) == len(PUBLIC_MARKDOWN)
    assert compact_routes[0] == "./"
    assert full.count("\n## Page: ") == len(PUBLIC_MARKDOWN)
    assert ".harnessctl/documents/" not in "\n".join(full_routes)


def test_config_schema_reference_is_generated_with_exact_property_coverage() -> None:
    generator = runpy.run_path(str(ROOT / "scripts" / "generate_reference_docs.py"))
    rendered = generator["render_config_schema"]()
    schema = json.loads(
        (ROOT / "extensions" / "generic-tools" / "contracts" / "config-v1.schema.json").read_text(
            encoding="utf-8"
        )
    )

    assert (DOCS / "config-schema.md").read_text(encoding="utf-8") == rendered
    schema_paths = generator["_schema_property_paths"](schema)
    assert generator["_rendered_property_paths"](schema) == schema_paths
    assert set(generator["DESCRIPTIONS"]) == schema_paths
    assert "Start with the change you need" not in rendered
    assert "[Config File guide](configuration.md)" in rendered
    assert "## Config\n" in rendered
    assert "## MCP servers\n" in rendered
    assert "## Skills\n" in rendered
    for skill in (
        "Issues",
        "Documents",
        "CVS",
        "Caveman",
        "TDD",
        "Code Index",
        "Web Retrieval",
        "Memory",
    ):
        assert f"### {skill}\n" in rendered
    assert "One of `filesystem`, `github`, `gitlab`, `gitea`, `forgejo`, `bitbucket`." in rendered
    assert "This page is generated from the schema and defaults" in rendered


def test_config_reference_drift_gates_reject_contract_mutations() -> None:
    generator = runpy.run_path(str(ROOT / "scripts" / "generate_reference_docs.py"))
    schema = json.loads(
        (ROOT / "extensions/generic-tools/contracts/config-v1.schema.json").read_text(
            encoding="utf-8"
        )
    )
    defaults = json.loads(
        (ROOT / "extensions/generic-tools/contracts/config-v1.defaults.json").read_text(
            encoding="utf-8"
        )
    )
    descriptions = generator["DESCRIPTIONS"]

    changed_schema = copy.deepcopy(schema)
    changed_schema["properties"]["undocumented"] = {"type": "string"}
    with pytest.raises(ValueError, match="omitted=.*undocumented"):
        generator["_validate_property_coverage"](changed_schema, descriptions)

    incomplete_descriptions = dict(descriptions)
    incomplete_descriptions.pop("workflow.default_task_type")
    with pytest.raises(ValueError, match="missing_descriptions"):
        generator["_validate_property_coverage"](schema, incomplete_descriptions)

    changed_defaults = copy.deepcopy(defaults)
    changed_defaults["workflow"]["default_task_type"] = "story"
    assert generator["render_config_schema"](schema, changed_defaults) != (
        DOCS / "config-schema.md"
    ).read_text(encoding="utf-8")


def test_feature_status_contract_is_complete_and_textual() -> None:
    guide = (DOCS / "status-and-evidence.md").read_text(encoding="utf-8")
    normalized_guide = " ".join(guide.lower().split())
    for status in (
        "working",
        "working but untested",
        "partially implemented",
        "not implemented",
        "unknown/stale",
    ):
        assert re.search(rf"^\|\s*`{re.escape(status)}`\s*\|", guide, re.MULTILINE)
    for evidence_class in (
        "Source",
        "Generated contract",
        "Automated test",
        "Approved design",
        "Active configuration",
        "Dated provider observation",
    ):
        assert re.search(rf"^\|\s*{evidence_class}\s*\|", guide, re.MULTILINE)
    assert "**Status:**" in guide
    assert "**Evidence:**" in guide
    assert "observation date" in guide
    assert "intent is not implementation" in normalized_guide
    assert "configuration does not prove successful provider operation" in normalized_guide
    assert "## How to use the evidence" in guide
    assert "## Page conventions" in guide
    assert "## Accessible presentation" in guide
    assert "Do not skip heading levels" in guide
    assert "Styling may decorate" not in guide
    assert "## Writing a feature entry" not in guide
    assert "## Repository example" not in guide


def test_documentation_home_is_for_users_not_site_contributors() -> None:
    home = (DOCS / "README.md").read_text(encoding="utf-8")
    assert "helps people use LLMs" in home
    assert "Getting started" in home
    assert "## Work on this website" not in home
    assert "mise run docs-build" not in home
    assert "mise run docs-serve" not in home
    assert "Formal Verify" not in home


def test_onboarding_docs_lead_to_a_supported_plan_only_first_success() -> None:
    home = (DOCS / "README.md").read_text(encoding="utf-8")
    overview = (DOCS / "docs-overview.md").read_text(encoding="utf-8")
    installation = (DOCS / "installation.md").read_text(encoding="utf-8")
    getting_started = (DOCS / "getting-started.md").read_text(encoding="utf-8")
    normalized_getting_started = " ".join(getting_started.split())

    assert "](installation.md)" in home
    assert "](getting-started.md)" in home
    assert "Planned content" not in overview + installation
    for content_type in (
        "**Tutorials**",
        "**Explanatory guides**",
        "**Catalogs**",
        "**Exact references**",
        "**Troubleshooting and help**",
    ):
        assert content_type in overview
    for canonical_route in (
        "getting-started.md",
        "sdlc-introduction.md",
        "harnesses.md",
        "command-reference.md",
        "troubleshooting.md",
    ):
        assert f"]({canonical_route})" in overview
    assert "`uv` is required" in installation
    assert "`mise` toolchain declares and provisions it" in installation
    for host, status in (
        ("OpenCode", "supported"),
        ("Pi", "supported"),
        ("Claude", "not implemented"),
        ("Codex", "not implemented"),
    ):
        assert re.search(rf"{host}.*{status}|{status}.*{host}", installation)
    for boundary in (
        "--allow-pi-package-install",
        "--force",
        "--replace-sdlc-skill-set",
        "Reload or restart",
        "Roll back",
    ):
        assert boundary in installation
    assert "/work-plan Add a health endpoint" in getting_started
    assert "grouped `/work` dispatch is not an installed command" in normalized_getting_started
    assert "stops with an approved executable plan" in normalized_getting_started
    assert "No source implementation, formal verification, release, push, or deployment" in (
        normalized_getting_started
    )


def test_public_documentation_avoids_implementation_runtime_details() -> None:
    prohibited = re.compile(
        r"(?i)\bpython\b|\bpytest\b|pyproject\.toml|requirements\.txt|pypi\.org|"
        r"\buv run\b|(?:^|[/`])[^\s`/]+\.py(?:[)#`\s]|$)"
    )
    for path in DOCS.glob("*.md"):
        content = path.read_text(encoding="utf-8")
        visible_content = re.sub(r"\]\((?:<[^>]*>|[^)]*)\)", "]", content)
        match = prohibited.search(visible_content)
        assert match is None, (
            f"{path.name} exposes implementation runtime detail: {match.group(0)!r}"
        )


def test_public_documentation_contains_no_literal_credentials() -> None:
    secret_patterns = {
        "private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
        "GitHub token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
        "OpenAI-style key": re.compile(r"\bsk-[A-Za-z0-9]{20,}\b"),
        "AWS access key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    }
    credential_assignment = re.compile(
        r"^\s*(?:token|api[_-]?key|password|secret)\s*:\s*"
        r"(?!\{env:[A-Z][A-Z0-9_]*\}\s*$|[A-Z][A-Z0-9_]*\s*$|<[^>]+>\s*$)\S+",
        re.IGNORECASE | re.MULTILINE,
    )

    for path in DOCS.glob("*.md"):
        content = path.read_text(encoding="utf-8")
        for label, pattern in secret_patterns.items():
            assert pattern.search(content) is None, f"{path.name} contains a possible {label}"
        assert credential_assignment.search(content) is None, (
            f"{path.name} contains a possible literal credential assignment"
        )


def test_harness_guide_states_current_support() -> None:
    guide = (DOCS / "harnesses.md").read_text(encoding="utf-8")
    normalized_guide = " ".join(guide.split())
    matrix = guide.split("## Support matrix", maxsplit=1)[1].split("\n## ", maxsplit=1)[0]
    rows = dict(re.findall(r"^\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|", matrix, re.MULTILINE))
    harness_names = {"opencode": "OpenCode", "pi": "Pi"}
    expected_statuses = {harness_names[harness]: "working" for harness in TARGETS}
    expected_statuses.update({"Claude": "not implemented", "Codex": "not implemented"})

    assert rows == expected_statuses
    assert "coding harness is the application in which you work with an LLM" in guide
    for dimension in (
        "Installation",
        "Commands or prompts",
        "Skills",
        "Project tools",
        "MCP projection",
        "Configuration",
        "Prerequisites",
        "Current limitation",
    ):
        assert dimension in matrix
    for state in ("Generated", "Installed", "Registered", "Configured", "Operational"):
        assert f"**{state}**" in guide
    for link in (
        "installation.md",
        "skills.md",
        "node-modules.md",
        "mcp-servers.md",
        "configuration.md",
        "command-reference.md",
        "status-and-evidence.md",
    ):
        assert f"]({link}" in guide
    for evidence_link in (
        "../src/harnessctl/install.py#L41-L44",
        "../tests/test_install.py",
        "../tests/test_install.py#L1716-L1718",
    ):
        assert f"]({evidence_link})" in guide
    assert re.search(r"\*\*Evidence review date:\*\* \d{4}-\d{2}-\d{2}", guide)
    assert "source and automated-test evidence" in normalized_guide
    assert "not the host product or a provider service" in normalized_guide
    assert guide.count("makes no claim about") == 2
    assert guide.count("has no Claude installation target") == 2
    assert guide.count("has no Codex installation target") == 2


def test_rendered_evidence_links_leave_docs_without_mutating_examples() -> None:
    rewrite_links = runpy.run_path(str(ROOT / "scripts" / "mkdocs_hooks.py"))[
        "rewrite_out_of_docs_links"
    ]
    markdown = """\
[Configuration](configuration.md)
[Root](../README.md#getting-started)
[Design](<../.harnessctl/documents/doc-00017.md>)
[flow]: ../FLOWS.md#build "Build flow"

```markdown
[Example](../README.md)
```
"""
    rendered = rewrite_links(markdown, "status-and-evidence.md")
    repository = "https://github.com/dragoscirjan/harnessctl-v2/blob/main"
    assert "[Configuration](configuration.md)" in rendered
    assert f"[Root]({repository}/README.md#getting-started)" in rendered
    assert f"[Design](<{repository}/.harnessctl/documents/doc-00017.md>)" in rendered
    assert f'[flow]: {repository}/FLOWS.md#build "Build flow"' in rendered
    assert "```markdown\n[Example](../README.md)\n```" in rendered


def test_document_docs_cover_fixed_authority_and_removed_legacy_links() -> None:
    documents = (DOCS / "documents.md").read_text(encoding="utf-8")
    issues = (DOCS / "issues.md").read_text(encoding="utf-8")
    public_docs = "\n".join(path.read_text(encoding="utf-8") for path in DOCS.glob("*.md"))

    assert "safe project-relative" in documents
    assert "another safe repository-local root" in documents
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
        "dac8e2ec74d388f88a552060dcaa0534c56a34ef57550222035b6a1b19f46c8f"
    )


def test_plan_design_reference_owns_document_lifecycle_on_both_hosts() -> None:
    template = (SDLC_SKILL_TEMPLATES / "references/plan-design.md.j2").read_text(encoding="utf-8")
    rendered = template.replace("{{ documents_root }}", ".harnessctl/documents")
    generated = [
        (ROOT / host / "skills/sdlc/references/plan-design.md").read_text(encoding="utf-8")
        for host in (".opencode", ".pi")
    ]

    assert generated == [rendered, rendered]
    assert "`{{ documents_root }}`" in template
    for kind in ("hld", "lld", "design-overview", "gdd"):
        assert kind in rendered.lower()
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
        assert f"`{tool}`" in rendered
    assert "specification tooling" not in rendered
    normalized = " ".join(rendered.split())
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
    issues = (DOCS / "issues.md").read_text(encoding="utf-8")
    memory = (DOCS / "memory.md").read_text(encoding="utf-8")

    for provider in ("filesystem", "github", "gitlab", "gitea", "forgejo"):
        assert provider in issues.lower()
    for backend in ("libsql", "mem0", "graphiti", "custom"):
        assert backend in memory.lower()
    assert "NOT IMPLEMENTED" in memory
    assert "Repository YAML" in memory
    assert "Shared local SQLite" in memory
    assert "Disposable internal cache; not a backend" in memory
    assert "project-local `@harnessctl/pi-tools`" in memory
    assert "Only `skills.memory.backend: repository` is accepted today" in memory
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
    skills = (DOCS / "skills.md").read_text(encoding="utf-8")
    sdlc = (DOCS / "sdlc.md").read_text(encoding="utf-8")
    normalized_sdlc = " ".join(sdlc.split())

    tdd_entry = _skill_section(skills, "sdlc-develop-tdd")
    assert "Generated for selected OpenCode and Pi hosts only when TDD is enabled" in tdd_entry
    assert "does not delete" in tdd_entry
    assert "leaves any previously installed TDD skill dormant" in normalized_sdlc
    assert "`skills.tdd.enabled`" in sdlc
    assert "Red, Green, and Refactor" in normalized_sdlc


def test_config_file_reference_owns_file_mechanics_not_schema_catalog() -> None:
    configuration = (DOCS / "configuration.md").read_text(encoding="utf-8")
    normalized = " ".join(configuration.split())

    for phrase in (
        "Start with the change you need",
        "Common recipes",
        "Change the default work item",
        "Enable TDD",
        "Enable project memory",
        "Enable code and web retrieval",
        "Use GitLab for issues",
        "Move repository authority",
        "`.harnessctl/config.yaml`",
        "numeric `version: 1`",
        "fresh in-memory copy of the generated defaults",
        "`config_create` tool writes the complete default file only when it is absent",
        "read-only `config_get` tool",
        "Mappings merge recursively",
        "Scalars and arrays replace their default values",
        "`mcpServers: {}` disables all default declarations",
        "Changing a skill provider's `type` replaces the complete provider mapping",
        "duplicate keys",
        "deepest available dotted path",
        "does not migrate or repair another version",
        "does not read, render, log, snapshot, or persist the credential value",
        "Documentation explains how to use those contracts but does not replace them",
        "Know what each layer proves",
        "Declared Config",
        "Generated harness output",
        "Harness registration",
        "External provider state",
        "Verified operation",
        "does not prove that an external provider is available or working",
    ):
        assert phrase in normalized
    for target in (
        "config-schema.md",
        "issues.md",
        "documents.md",
        "memory.md",
        "code-intelligence.md",
        "cvs.md",
        "caveman.md",
        "tdd.md",
        "web-retrieval.md",
    ):
        assert f"]({target})" in configuration
    assert "## Config v1 reference" not in configuration
    assert "### Generic MCP declarations" not in configuration
    assert "### TDD settings" not in configuration
    assert "## Remote issue routing" not in configuration
    assert "| Key" not in configuration


def test_mcp_server_catalog_matches_managed_and_selected_contracts() -> None:
    catalog = (DOCS / "mcp-servers.md").read_text(encoding="utf-8")
    defaults = json.loads(
        (ROOT / "src/harnessctl/contracts/config-v1.defaults.json").read_text(encoding="utf-8")
    )
    selected_servers = {
        defaults["skills"][domain]["mcpName"] for domain in ("codeIndex", "webRetrieval")
    }
    expected_servers = set(CVS_MCP_SERVER_IDS.values()) | selected_servers
    headings = re.findall(r"^### `([^`]+)`$", catalog, re.MULTILINE)

    _assert_exact_set(set(headings), expected_servers, "MCP server catalog")
    assert len(headings) == len(expected_servers) == 6
    assert selected_servers <= set(defaults["mcpServers"])

    for server_id in expected_servers:
        section = _mcp_server_section(catalog, server_id)
        labels = re.findall(r"^\*\*([^:]+):\*\*", section, re.MULTILINE)
        assert labels == list(MCP_ENTRY_FIELDS)
        assert "`working`" in section
        assert "`unknown/stale`" in section

    for target in (
        "configuration.md",
        "config-schema.md",
        "skills.md",
        "cvs.md",
        "code-intelligence.md",
        "code-intelligence-providers.md",
        "web-retrieval.md",
        "status-and-evidence.md",
    ):
        assert f"]({target})" in catalog


def test_mcp_server_catalog_separates_configuration_from_live_operation() -> None:
    catalog = (DOCS / "mcp-servers.md").read_text(encoding="utf-8")
    normalized = " ".join(catalog.split())

    for state in (
        "Declared",
        "Registered",
        "Routed",
        "Authenticated",
        "Operational",
        "Stale or unavailable",
    ):
        assert state in catalog
    for boundary in (
        "Skills reference declarations; they do not create or operate providers",
        "The operator owns provider installation",
        (
            "A declaration can therefore be valid while registration, authentication, "
            "or operation is absent"
        ),
        "provider output remains advisory evidence",
        "retrieved text as untrusted data",
        "does not prove authentication or service availability",
        "does not prove a running or fresh index",
        "do not prove the process version, startup, or result quality",
    ):
        assert boundary in normalized

    assert "Authorization: Bearer {env:GH_TOKEN}" in catalog
    assert "token value stays outside the file" in normalized
    assert "ghp_" not in catalog
    assert "glpat-" not in catalog


def test_command_reference_exactly_covers_installed_prompt_commands() -> None:
    reference = (DOCS / "command-reference.md").read_text(encoding="utf-8")
    entries = set(re.findall(r"^## `(work-[a-z-]+)`$", reference, re.MULTILINE))
    templates = {path.name.removesuffix(".md.j2") for path in SDLC_TEMPLATES.glob("work-*.md.j2")}

    _assert_exact_set(entries, PUBLIC_COMMANDS, "documented prompt commands")
    _assert_exact_set(templates, PUBLIC_COMMANDS, "installed prompt commands")
    assert "not terminal or shell commands" in reference
    assert "exactly one authoritative, non-archived Epic" in reference
    assert "Refresh is" in reference and "standalone" in reference
    assert "never combines phases or auto-selects workflow" in reference
    assert "ready pull request by default" in reference
    assert "It never merges automatically" in reference
    assert "defect guidance loads only after a failure exists" in reference
    assert "YOLO guidance loads only when YOLO is explicitly offered or" in reference
    assert "deployment guidance loads only after an explicit deployment" in reference
    assert reference.count("**Checkpoint:**") == len(PUBLIC_COMMANDS)


def test_skill_configuration_routes_match_config_v1_domains() -> None:
    defaults = json.loads(
        (ROOT / "extensions/generic-tools/contracts/config-v1.defaults.json").read_text(
            encoding="utf-8"
        )
    )
    domain_pages = {
        "issues": "issues.md",
        "documents": "documents.md",
        "memory": "memory.md",
        "caveman": "caveman.md",
        "tdd": "tdd.md",
        "codeIndex": "code-intelligence.md",
        "webRetrieval": "web-retrieval.md",
        "cvs": "cvs.md",
    }

    _assert_exact_set(set(defaults["skills"]), set(domain_pages), "skill configuration")
    for domain, page_name in domain_pages.items():
        page = (DOCS / page_name).read_text(encoding="utf-8")
        assert f"`skills.{domain}`" in page
        assert "config-schema.md#" in page

    nav_pages = _navigation_pages(EXPECTED_NAV)
    assert set(domain_pages.values()).issubset(nav_pages)


def test_skills_catalog_matches_registry_templates_and_entry_contract() -> None:
    catalog = (DOCS / "skills.md").read_text(encoding="utf-8")
    template_root = ROOT / "src" / "harnessctl" / "templates" / "skills"
    registered = set(SKILL_IDS)
    template_ids = {path.parent.name for path in template_root.glob("*/SKILL.md.j2")}
    headings = re.findall(r"^## `([^`]+)`$", catalog, re.MULTILINE)

    _assert_exact_set(set(headings), registered, "Skills catalog")
    _assert_exact_set(template_ids, registered, "skill templates")
    _assert_exact_set(set(SKILL_TEMPLATES), registered, "skill registry")
    assert len(headings) == len(registered) == 8

    availability_contracts = {
        "sdlc": "Always generated for selected OpenCode and Pi hosts",
        "sdlc-code": "Always generated as byte-equivalent trees for selected OpenCode and Pi hosts",
        "sdlc-caveman": (
            "Generated for OpenCode when `skills.caveman.enabled` is true. "
            "Generated for Pi regardless"
        ),
        "sdlc-develop-tdd": "Generated for selected OpenCode and Pi hosts only when TDD is enabled",
        "sdlc-code-index": (
            "Generated for selected OpenCode and Pi hosts only when Code Index is enabled"
        ),
        "sdlc-memory": (
            "Generated for OpenCode when `skills.memory.enabled` is true. "
            "Generated for Pi regardless"
        ),
        "sdlc-issue-tracking": "Always generated for selected OpenCode and Pi hosts",
        "sdlc-cvs": "Always generated for selected OpenCode and Pi hosts",
    }
    for skill_id in registered:
        section = _skill_section(catalog, skill_id)
        labels = re.findall(r"^\*\*([^:]+):\*\*", section, re.MULTILINE)
        assert labels == list(SKILL_ENTRY_FIELDS)
        assert availability_contracts[skill_id] in " ".join(section.split())
        assert f"skills/{skill_id}/SKILL.md.j2" in section
        assert SKILL_CONFIGURATION_LINKS[skill_id] in section
        assert "**Status:**" in section
        assert "**Evidence:** Source:" in section
        assert "Automated test:" in section
        assert f"](#{skill_id})" in catalog

    assert len(SKILL_RESOURCE_TEMPLATES["sdlc-code"]) == 26
    assert len(SKILL_RESOURCE_TEMPLATES["sdlc"]) == 14
    assert "26 bundled subjects" in catalog
    for legacy_id, canonical_id in SKILL_ID_MIGRATIONS.items():
        assert f"`{legacy_id}` to `{canonical_id}`" in " ".join(catalog.split())

    for distinction in (
        "does not grant permission",
        "register a tool or MCP server",
        "provide credentials",
        "prove that an external provider is working",
        "OpenCode and Pi support is currently `working`",
        "Claude and Codex generation is `not implemented`",
        "Documents and Web Retrieval are configuration domains",
    ):
        assert distinction in " ".join(catalog.split())


def test_current_config_examples_use_v1_paths_and_document_root_semantics() -> None:
    memory = (DOCS / "memory.md").read_text(encoding="utf-8")
    code_index = (DOCS / "code-intelligence.md").read_text(encoding="utf-8")
    providers = (DOCS / "code-intelligence-providers.md").read_text(encoding="utf-8")
    documents = (DOCS / "documents.md").read_text(encoding="utf-8")

    assert "repository:\n      root: .harnessctl/memory" not in memory
    assert "version: 1\nskills:\n  codeIndex:" in code_index
    assert "version: 1\nskills:\n  codeIndex:" in providers
    assert "`skills.documents.root`, which defaults to `.harnessctl/documents`" in documents
    assert "another safe repository-local root" in documents


def test_docs_describe_sdlc_code_guidance_and_installation() -> None:
    skills = (DOCS / "skills.md").read_text(encoding="utf-8")
    sdlc = (DOCS / "sdlc.md").read_text(encoding="utf-8")
    root = (ROOT / "README.md").read_text(encoding="utf-8")
    normalized = " ".join((skills + sdlc + root).split())

    for phrase in (
        "26 bundled subjects",
        "byte-equivalent trees for selected OpenCode and Pi hosts",
        "Named tools are alternatives, not cumulative requirements",
        "global skills under `~/.config/opencode`",
    ):
        assert phrase in normalized
    assert ".opencode/skills/sdlc-code/" in root
    assert ".pi/skills/sdlc-code/" in root
    assert "--force" in root
    assert "remove any renamed support-skill directories that version does not manage" in normalized


def test_docs_describe_sdlc_code_index_opt_in_and_operator_boundaries() -> None:
    skills = (DOCS / "skills.md").read_text(encoding="utf-8")
    guide = (DOCS / "code-intelligence.md").read_text(encoding="utf-8")
    root = (ROOT / "README.md").read_text(encoding="utf-8")
    normalized = " ".join(guide.split())
    code_index_entry = " ".join(_skill_section(skills, "sdlc-code-index").split())

    assert "`skills.codeIndex` mapping" in guide
    assert "`mcpName`" in guide
    assert "`cvs_` is permitted" in normalized
    assert "retained disabled copy can remain discoverable" in code_index_entry
    assert "compiled SDLC guidance refuses to load it" in code_index_entry
    assert "does not register or operate the server" in code_index_entry
    assert "does not register or run that server" in normalized
    assert "user-owned under normal, forced, migration, and rollback paths" in normalized
    assert "advisory retrieval evidence, never source authority" in normalized
    assert "Glob" in guide and "Grep" in guide
    assert "load `sdlc-code-index`" in normalized
    for phrase in (
        "top-level `mcpServers` registry",
        "audit `.opencode/opencode.json` and `.pi/mcp.json` manually",
        "old provider package may be uninstalled",
        "separate user-authorized operation",
        "user-owned",
    ):
        assert phrase in normalized
    normalized_root = " ".join(root.split())
    assert "provider metadata never synthesizes a server definition" in normalized_root
    assert "references the exact `mcpServers` key" in normalized_root
    assert (
        "Host registration is compiled only from that explicit registry declaration"
        in normalized_root
    )
    assert "harnessctl never projects or manages them" not in normalized_root
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
    assert "optional `mcpName` configuration" in normalized
    assert "Omitting `mcpName` produces no managed MCP projection" in normalized
    assert "omitting `mcpName` produces CLI-only guidance" in normalized
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
    assert "npm:@juicesharp/rpiv-ask-user-question@2.7.1" in cvs
    assert "ask_user_question" in cvs
    assert "interactive TTY and RPC/ACP modes" in normalized
    assert "does not manage this file" in normalized
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
    assert "npm:@harnessctl/pi-tools@0.1.10" in cvs
    assert "every skill in the current managed registry" in normalized


def test_documents_docs_cover_local_lifecycle_and_removed_remote_surfaces() -> None:
    documents = (DOCS / "documents.md").read_text(encoding="utf-8")
    normalized_documents = " ".join(documents.split())
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
    assert "Git provider mappings are accepted configuration" in normalized_documents
    assert "exactly eight skill templates" in skills
    assert "Documents and Web Retrieval are configuration domains" in " ".join(skills.split())


def test_current_design_links_use_canonical_documents_paths() -> None:
    current_docs = "\n".join(path.read_text(encoding="utf-8") for path in sorted(DOCS.glob("*.md")))
    documents = (DOCS / "documents.md").read_text(encoding="utf-8")
    root = (ROOT / "README.md").read_text(encoding="utf-8")

    assert "../.specs/" not in current_docs
    assert "--migrate-specs" not in root
    assert "migration runner" not in root
    for path in (
        "doc-00013-repository-local-sdlc-design-document-management-v4.md",
        "doc-00014-repository-local-sdlc-design-document-management-v4.md",
    ):
        assert f"../.harnessctl/documents/{path}" in documents
