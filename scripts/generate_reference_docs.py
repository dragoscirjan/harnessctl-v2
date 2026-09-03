"""Generate source-aligned operator reference pages."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "extensions" / "generic-tools" / "contracts"
SCHEMA_PATH = CONTRACTS / "config-v1.schema.json"
DEFAULTS_PATH = CONTRACTS / "config-v1.defaults.json"
OUTPUT = ROOT / "docs" / "config-schema.md"


@dataclass(frozen=True)
class Section:
    path: str
    title: str
    introduction: str
    mode: str = "object"


SECTIONS = (
    Section("", "Config", "The project configuration root."),
    Section("paths", "Paths", "Repository-local authority and report locations."),
    Section("workflow", "Workflow", "Defaults used when creating SDLC work."),
    Section("mcp", "MCP output", "Shared behavior for MCP responses."),
    Section(
        "mcpServers",
        "MCP servers",
        "A registry keyed by server identity. Each declaration uses either the URL shape "
        "or the command shape.",
        "mcp",
    ),
    Section("skills", "Skills", "Configuration domains compiled into Harnessctl guidance."),
    Section("skills.issues", "Issues", "Issue authority and provider selection."),
    Section(
        "skills.issues.provider",
        "Issue provider",
        "Choose filesystem storage or one supported remote collaboration provider.",
        "union",
    ),
    Section("skills.documents", "Documents", "Canonical design-document authority."),
    Section(
        "skills.documents.provider",
        "Document provider",
        "Choose filesystem storage or a provider-owned remote route.",
        "union",
    ),
    Section("skills.cvs", "CVS", "Local version control and remote collaboration provider."),
    Section(
        "skills.cvs.provider",
        "CVS provider",
        "Choose one remote collaboration provider.",
        "union",
    ),
    Section("skills.caveman", "Caveman", "Controls concise-response guidance."),
    Section("skills.tdd", "TDD", "Controls availability of Red-Green-Refactor guidance."),
    Section("skills.codeIndex", "Code Index", "Selects advisory relationship-aware retrieval."),
    Section("skills.webRetrieval", "Web Retrieval", "Selects advisory researched web retrieval."),
    Section("skills.memory", "Memory", "Configures repository-backed shared project memory."),
    Section("skills.memory.namespace", "Memory namespace", "Scopes reusable records."),
    Section("skills.memory.retrieval", "Memory retrieval", "Bounds each memory query."),
)

DESCRIPTIONS = {
    "version": "Config contract version. Config v1 is the only accepted value.",
    "paths": "Shared repository paths used by Harnessctl.",
    "workflow": "Defaults for SDLC work creation.",
    "mcp": "Shared MCP response behavior.",
    "mcpServers": "Complete registry of portable MCP connection declarations.",
    "skills": "Capability-specific configuration.",
    "paths.root": "Root for Harnessctl-managed project authority.",
    "paths.tasks": "Directory for task artifacts.",
    "paths.reports": "Directory for generated reports.",
    "workflow.default_task_type": "Issue type used when a command needs a default work item type.",
    "mcp.output_limit_mode": "How MCP output limits are communicated to agents.",
    "mcpServers.<name>.url": "HTTPS endpoint for a remote MCP server.",
    "mcpServers.<name>.headers": "HTTP headers; values may contain `{env:NAME}` placeholders.",
    "mcpServers.<name>.command": "Executable for a local MCP server.",
    "mcpServers.<name>.args": "Arguments passed to the local MCP executable.",
    "mcpServers.<name>.environment": (
        "Maps process variables to operator environment-variable names."
    ),
    "mcpServers.<name>.cwd": "Optional project-relative working directory for the command.",
    "mcpServers.<name>.opencode": (
        "JSON-compatible OpenCode settings that do not replace connection fields."
    ),
    "mcpServers.<name>.pi": "JSON-compatible Pi settings that do not replace connection fields.",
    "skills.issues": "Issue authority, naming, tools, and provider.",
    "skills.documents": "Design-document authority, naming, tools, and provider.",
    "skills.cvs": "Local version control and remote collaboration route.",
    "skills.caveman": "Concise-response behavior used by generated guidance.",
    "skills.tdd": "Red-Green-Refactor guidance availability.",
    "skills.codeIndex": "Relationship-aware code retrieval guidance.",
    "skills.webRetrieval": "Researched web retrieval guidance.",
    "skills.memory": "Repository-backed shared memory behavior.",
    "skills.issues.enabled": "Whether issue-tracking guidance is active.",
    "skills.issues.root": "Canonical filesystem issue root.",
    "skills.issues.prefix": "Prefix used for generated issue IDs.",
    "skills.issues.provider": "Filesystem or remote issue provider mapping.",
    "skills.documents.enabled": "Whether document guidance is active.",
    "skills.documents.root": "Canonical filesystem document root.",
    "skills.documents.prefix": "Fixed prefix used for document IDs.",
    "skills.documents.provider": "Filesystem or provider-owned document route.",
    "skills.cvs.enabled": "Whether CVS guidance is active.",
    "skills.cvs.local": "Local version-control executable family.",
    "skills.cvs.workspaces": "Whether normalized Git Epic workspace tools are enabled.",
    "skills.cvs.provider": "Remote collaboration provider mapping.",
    "skills.caveman.enabled": "Whether concise-response guidance is active.",
    "skills.caveman.mode": "Strict or balanced compression policy.",
    "skills.tdd.enabled": "Whether TDD guidance is installed and available.",
    "skills.codeIndex.enabled": "Whether code-index guidance may be loaded.",
    "skills.codeIndex.mcpName": "MCP registry key used for code-index retrieval.",
    "skills.webRetrieval.enabled": "Whether web-retrieval guidance may be loaded.",
    "skills.webRetrieval.mcpName": "Fixed MCP registry key used for web retrieval.",
    "skills.memory.enabled": "Whether repository memory participates in SDLC commands.",
    "skills.memory.root": "Canonical repository memory root.",
    "skills.memory.backend": "Current canonical memory backend.",
    "skills.memory.namespace": "Organization, project, and default-topic scope.",
    "skills.memory.retrieval": "Query result and serialization bounds.",
    "skills.memory.namespace.organization_id": "Stable organization scope for records.",
    "skills.memory.namespace.project_id": "Stable project scope for records.",
    "skills.memory.namespace.default_topic": "Topic used when a write does not supply one.",
    "skills.memory.retrieval.limit": "Maximum records returned by one query.",
    "skills.memory.retrieval.max_chars": "Maximum serialized characters returned by one query.",
    "skills.memory.retrieval.include_superseded": (
        "Whether queries include inactive record history."
    ),
}

for provider in ("skills.issues.provider", "skills.documents.provider", "skills.cvs.provider"):
    DESCRIPTIONS.update(
        {
            f"{provider}.type": "Selected provider identity.",
            f"{provider}.tools": "Exact CLI or normalized tool capability list for that provider.",
            f"{provider}.mcpName": "Optional MCP registry key used by the provider route.",
            f"{provider}.url": "Provider service URL.",
            f"{provider}.token_env": "Name of the environment variable containing the credential.",
        }
    )

CONSTRAINT_NOTES = {
    "version": "Exactly `1`.",
    "paths.root": "Safe, non-empty project-relative path.",
    "paths.tasks": "Safe, non-empty project-relative path.",
    "paths.reports": "Safe, non-empty project-relative path.",
    "mcpServers.<name>.url": "Safe HTTPS URL without embedded credentials.",
    "mcpServers.<name>.headers": (
        "Valid header names; literal text or `{env:UPPER_CASE_NAME}` placeholders."
    ),
    "mcpServers.<name>.environment": "Variable names map to upper-case environment-variable names.",
    "mcpServers.<name>.cwd": "Safe, non-empty project-relative path.",
    "skills.issues.root": "Safe, non-empty project-relative path.",
    "skills.documents.root": "Safe, non-empty project-relative path.",
    "skills.memory.root": "Safe, non-empty project-relative path.",
    "skills.issues.prefix": "Letters, numbers, `_`, or `-`.",
    "skills.cvs.workspaces": "Requires CVS to be enabled with `local: git`.",
    "skills.codeIndex.mcpName": "1-64 lower-case letters, numbers, `_`, or `-`; alphanumeric ends.",
    "skills.webRetrieval.mcpName": "Exactly `sdlc_web_crawl`.",
    "skills.memory.backend": "Exactly `repository`.",
    "skills.memory.namespace.organization_id": "Non-empty text.",
    "skills.memory.namespace.project_id": "Non-empty text.",
    "skills.memory.namespace.default_topic": "Non-empty text.",
    "skills.memory.retrieval.limit": "Integer from 1 through 100.",
    "skills.memory.retrieval.max_chars": "Integer from 256 through 100000.",
}

for provider in ("skills.issues.provider", "skills.documents.provider", "skills.cvs.provider"):
    CONSTRAINT_NOTES[f"{provider}.mcpName"] = (
        "1-64 lower-case letters, numbers, `_`, or `-`; alphanumeric ends."
    )
    CONSTRAINT_NOTES[f"{provider}.token_env"] = "Upper-case environment-variable name."


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _schema_node(schema: dict[str, Any], path: str) -> dict[str, Any]:
    node = schema
    for part in filter(None, path.split(".")):
        node = node["properties"][part]
    return node


def _default(defaults: dict[str, Any], path: str) -> Any:
    node: Any = defaults
    for part in filter(None, path.split(".")):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


def _object_variants(node: dict[str, Any]) -> list[dict[str, Any]]:
    if node.get("type") == "object" and "properties" in node:
        return [node]
    variants: list[dict[str, Any]] = []
    for child in node.get("anyOf", []):
        variants.extend(_object_variants(child))
    return variants


def _merge_property_schemas(nodes: list[dict[str, Any]]) -> dict[str, Any]:
    unique: list[dict[str, Any]] = []
    for node in nodes:
        if node not in unique:
            unique.append(node)
    return unique[0] if len(unique) == 1 else {"anyOf": unique}


def _union_properties(node: dict[str, Any]) -> tuple[dict[str, Any], dict[str, set[int]], int]:
    property_variants: dict[str, list[dict[str, Any]]] = {}
    required_by: dict[str, set[int]] = {}
    variants = _object_variants(node)
    for index, variant in enumerate(variants, start=1):
        required = set(variant.get("required", []))
        for name, property_schema in variant.get("properties", {}).items():
            property_variants.setdefault(name, []).append(property_schema)
            if name in required:
                required_by.setdefault(name, set()).add(index)
    properties = {name: _merge_property_schemas(nodes) for name, nodes in property_variants.items()}
    return properties, required_by, len(variants)


def _section_properties(
    schema: dict[str, Any], section: Section
) -> tuple[dict[str, Any], dict[str, str]]:
    node = _schema_node(schema, section.path)
    if section.mode == "object":
        required = set(node.get("required", []))
        return node["properties"], {
            name: "Yes" if name in required else "No" for name in node["properties"]
        }
    if section.mode == "union":
        properties, required_by, variant_count = _union_properties(node)
        return properties, {
            name: (
                "Yes"
                if len(required_by.get(name, set())) == variant_count
                else "Depends on provider"
                if name in required_by
                else "No"
            )
            for name in properties
        }

    properties, _, _ = _union_properties(node["additionalProperties"])
    order = ("url", "headers", "command", "args", "environment", "cwd", "opencode", "pi")
    ordered = {name: properties[name] for name in order}
    return ordered, {
        name: (
            "URL declaration"
            if name == "url"
            else "Command declaration"
            if name == "command"
            else "No"
        )
        for name in ordered
    }


def _property_path(section: Section, name: str) -> str:
    prefix = "mcpServers.<name>" if section.mode == "mcp" else section.path
    return ".".join(filter(None, (prefix, name)))


def _type_label(node: dict[str, Any]) -> str:
    if "const" in node:
        return f"literal `{json.dumps(node['const'])}`"
    if "enum" in node:
        return "enum"
    if "anyOf" in node:
        variants = node["anyOf"]
        if variants and all("const" in variant for variant in variants):
            return "provider-specific literal"
        types = {variant.get("type") for variant in variants}
        if len(types) == 1 and None not in types:
            return str(types.pop())
        return "provider union" if _object_variants(node) else "union"
    value = node.get("type", "JSON value")
    if value == "array":
        item_type = node.get("items", {}).get("type", "value")
        return f"array of {item_type}"
    return str(value)


def _constraint(path: str, node: dict[str, Any]) -> str:
    if path in CONSTRAINT_NOTES:
        return CONSTRAINT_NOTES[path]
    if "const" in node:
        return f"Exactly `{json.dumps(node['const'])}`."
    if "enum" in node:
        return "One of " + ", ".join(f"`{value}`" for value in node["enum"]) + "."
    if "anyOf" in node:
        variants = node["anyOf"]
        constants = [variant.get("const") for variant in variants if "const" in variant]
        if len(constants) == len(variants):
            return "One of " + ", ".join(f"`{value}`" for value in constants) + "."
        if path.endswith(".url"):
            return "Provider-specific safe HTTPS URL without embedded credentials."
    minimum = node.get("minimum")
    maximum = node.get("maximum")
    if minimum is not None or maximum is not None:
        return f"From {minimum} through {maximum}."
    if node.get("additionalProperties") is False:
        return "Unknown properties are rejected."
    return "See the selected object shape."


def _default_label(defaults: dict[str, Any], path: str) -> str:
    value = _default(defaults, path)
    if value is None:
        return "No default"
    if isinstance(value, dict):
        return "Object shown below"
    if isinstance(value, list):
        return f"`{json.dumps(value)}`"
    return f"`{json.dumps(value)}`"


def _render_table(
    schema: dict[str, Any],
    defaults: dict[str, Any],
    section: Section,
    descriptions: dict[str, str],
) -> list[str]:
    properties, requirements = _section_properties(schema, section)
    rows = []
    for name, node in properties.items():
        path = _property_path(section, name)
        if path not in descriptions:
            raise ValueError(f"missing Config reference description: {path}")
        default_path = path.replace("mcpServers.<name>", "mcpServers")
        if section.mode == "mcp":
            default_value = "Varies by declaration"
        else:
            default_value = _default_label(defaults, default_path)
        rows.append(
            (
                f"`{name}`",
                requirements[name],
                _type_label(node),
                default_value,
                descriptions[path],
                _constraint(path, node),
            )
        )
    headings = ("Property", "Required", "Type", "Default", "Description", "Constraint")
    widths = tuple(
        max(len(headings[index]), *(len(row[index]) for row in rows))
        for index in range(len(headings))
    )

    def render_row(row: tuple[str, ...]) -> str:
        return (
            "| "
            + " | ".join(value.ljust(width) for value, width in zip(row, widths, strict=True))
            + " |"
        )

    separator = tuple("-" * width for width in widths)
    return [render_row(headings), render_row(separator), *(render_row(row) for row in rows)]


def _rendered_property_paths(schema: dict[str, Any]) -> set[str]:
    paths: set[str] = set()
    for section in SECTIONS:
        properties, _ = _section_properties(schema, section)
        paths.update(_property_path(section, name) for name in properties)
    return paths


def _schema_property_paths(node: dict[str, Any], path: str = "") -> set[str]:
    paths: set[str] = set()
    for variant in node.get("anyOf", []):
        paths.update(_schema_property_paths(variant, path))
    for name, child in node.get("properties", {}).items():
        child_path = ".".join(filter(None, (path, name)))
        paths.add(child_path)
        paths.update(_schema_property_paths(child, child_path))
    if path == "mcpServers":
        paths.update(_schema_property_paths(node["additionalProperties"], f"{path}.<name>"))
    return paths


def _validate_property_coverage(schema: dict[str, Any], descriptions: dict[str, str]) -> None:
    expected = _schema_property_paths(schema)
    rendered = _rendered_property_paths(schema)
    described = set(descriptions)
    if rendered != expected or described != expected:
        omitted = sorted(expected - rendered)
        unsupported = sorted(rendered - expected)
        missing = sorted(expected - described)
        extra = sorted(described - expected)
        raise ValueError(
            "Config reference must match properties; "
            f"omitted={omitted}, unsupported={unsupported}, "
            f"missing_descriptions={missing}, extra_descriptions={extra}"
        )


def render_config_schema(
    schema: dict[str, Any] | None = None,
    defaults: dict[str, Any] | None = None,
    descriptions: dict[str, str] | None = None,
) -> str:
    """Render the complete object-first Config v1 reference."""
    schema = schema or _load_json(SCHEMA_PATH)
    defaults = defaults or _load_json(DEFAULTS_PATH)
    descriptions = descriptions or DESCRIPTIONS
    _validate_property_coverage(schema, descriptions)

    lines = [
        "# Config Schema",
        "",
        "Use this page to look up an exact Config v1 field after choosing the behavior "
        "you need in the [Config File guide](configuration.md). The tables follow the "
        "YAML object hierarchy; dotted paths appear only in cross-field rules and error "
        "examples.",
        "",
        "Every object is closed: properties not listed for that object are rejected. "
        "Project files may omit defaulted values because Harnessctl merges the file over "
        "the generated defaults before validation.",
        "",
        "## Minimal file",
        "",
        "```yaml",
        "version: 1",
        "```",
        "",
    ]
    for section in SECTIONS:
        level = "##" if not section.path or "." not in section.path else "###"
        lines.extend([f"{level} {section.title}", "", section.introduction, ""])
        lines.extend(_render_table(schema, defaults, section, descriptions))
        lines.append("")

    lines.extend(
        [
            "## Cross-field rules",
            "",
            "- Enabling Memory requires `skills.caveman.enabled: true`.",
            "- Every enabled CVS, remote Issues, remote Documents, Code Index, or Web "
            "Retrieval MCP reference must name a key in the effective `mcpServers` registry.",
            "- Supplying `mcpServers` replaces the default registry; it does not deep-merge "
            "declarations.",
            "- Changing a provider `type` replaces that provider mapping, so all required "
            "fields for the new provider must be supplied.",
            "- Host overrides must be JSON-compatible and cannot replace adapter-owned "
            "connection or authentication fields.",
            "",
            "## Provider shapes",
            "",
            "Issues and Documents accept `filesystem`, `github`, `gitlab`, `gitea`, "
            "`forgejo`, or `bitbucket`. CVS accepts the five remote collaboration providers. "
            "`tools`, URL, and required credential environment name are fixed or constrained "
            "by the selected provider; `mcpName` is optional where supported. Bitbucket is "
            "CLI-only.",
            "",
            "See [Issues](issues.md), [Documents](documents.md), and [CVS](cvs.md) for "
            "complete provider examples and operational boundaries.",
            "",
            "## Source and freshness",
            "",
            "The hand-maintained [Config v1 contract](../extensions/generic-tools/schemas.ts) "
            "generates the [JSON Schema](../extensions/generic-tools/contracts/"
            "config-v1.schema.json), [defaults](../extensions/generic-tools/contracts/"
            "config-v1.defaults.json), and fingerprint manifest. This page is generated from "
            "the schema and defaults; documentation checks fail when its property or "
            "description coverage becomes stale.",
            "",
        ]
    )
    return "\n".join(lines)


def generate(*, check: bool) -> None:
    content = render_config_schema()
    if OUTPUT.exists() and OUTPUT.read_text(encoding="utf-8") == content:
        return
    if check:
        raise SystemExit(f"generated reference is stale: {OUTPUT.relative_to(ROOT)}")
    OUTPUT.write_text(content, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail instead of writing stale output")
    args = parser.parse_args()
    generate(check=args.check)


if __name__ == "__main__":
    main()
