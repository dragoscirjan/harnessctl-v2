"""Documentation consistency checks."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"


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
    markdown_files = [ROOT / "README.md", *DOCS.glob("*.md")]
    for source in markdown_files:
        text = source.read_text(encoding="utf-8")
        for target in re.findall(r"\[[^]]+\]\(([^)]+)\)", text):
            if "://" in target or target.startswith("#"):
                continue
            path = (source.parent / target.split("#", 1)[0]).resolve()
            assert path.exists(), f"broken link in {source.relative_to(ROOT)}: {target}"


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
    assert "Automatic Pi adapter/skill install" in memory
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

    for value in ("git", "jj", "auto", "cli", "mcp"):
        assert f"`{value}`" in cvs
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
        ".opencode/opencode.json",
        ".pi/mcp.json",
        ".pi/settings.json",
    ):
        assert path in cvs
    assert "npm:pi-mcp-adapter@2.26.0" in cvs
    assert "forgejo-mcp` 2.33.0" in cvs
    assert "Environment-variable names only" in cvs
    assert "Pi CVS skill generation is **unsupported**" in cvs
