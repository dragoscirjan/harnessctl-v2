"""MkDocs hooks that preserve repository-relative documentation evidence links."""

import posixpath
import re
from typing import Any
from urllib.parse import quote, urlsplit, urlunsplit

REPOSITORY_BLOB_PATH = "/dragoscirjan/harnessctl-v2/blob/main/"
INLINE_LINK = re.compile(
    r"(?P<prefix>\]\(\s*)"
    r"(?P<destination><[^>\n]+>|[^\s)\n]+)"
    r"(?P<suffix>(?:\s+(?:\"[^\"\n]*\"|'[^'\n]*'|\([^\n)]*\)))?\s*\))"
)
REFERENCE_LINK = re.compile(
    r"^(?P<prefix>[ \t]{0,3}\[[^]\n]+\]:[ \t]*)"
    r"(?P<destination><[^>\n]+>|\S+)"
    r"(?P<suffix>[^\n]*)$",
    re.MULTILINE,
)
FENCE = re.compile(r"^[ \t]{0,3}(?P<marker>`{3,}|~{3,})")


def _repository_url(destination: str, source_path: str) -> str:
    """Return a repository URL for a link that resolves outside the docs tree."""
    wrapped = destination.startswith("<") and destination.endswith(">")
    target = destination[1:-1] if wrapped else destination
    parts = urlsplit(target)
    if parts.scheme or parts.netloc or not parts.path or parts.path.startswith("/"):
        return destination

    source_directory = posixpath.dirname(posixpath.join("docs", source_path))
    repository_path = posixpath.normpath(posixpath.join(source_directory, parts.path))
    if repository_path == "docs" or repository_path.startswith("docs/"):
        return destination
    if repository_path == ".." or repository_path.startswith("../"):
        return destination

    rewritten = urlunsplit(
        (
            "https",
            "github.com",
            f"{REPOSITORY_BLOB_PATH}{quote(repository_path)}",
            parts.query,
            parts.fragment,
        )
    )
    return f"<{rewritten}>" if wrapped else rewritten


def _rewrite_links(markdown: str, source_path: str) -> str:
    def replace(match: re.Match[str]) -> str:
        destination = _repository_url(match.group("destination"), source_path)
        return f"{match.group('prefix')}{destination}{match.group('suffix')}"

    return REFERENCE_LINK.sub(replace, INLINE_LINK.sub(replace, markdown))


def rewrite_out_of_docs_links(markdown: str, source_path: str) -> str:
    """Rewrite evidence links without changing fenced examples."""
    output: list[str] = []
    buffered: list[str] = []
    active_fence: str | None = None

    for line in markdown.splitlines(keepends=True):
        fence = FENCE.match(line)
        if active_fence is None and fence:
            output.append(_rewrite_links("".join(buffered), source_path))
            buffered.clear()
            active_fence = fence.group("marker")[0]
            output.append(line)
        elif active_fence is not None:
            output.append(line)
            if fence and fence.group("marker")[0] == active_fence:
                active_fence = None
        else:
            buffered.append(line)

    output.append(_rewrite_links("".join(buffered), source_path))
    return "".join(output)


def on_page_markdown(markdown: str, page: Any, **_: Any) -> str:
    """Rewrite rendered links while keeping canonical Markdown repository-relative."""
    return rewrite_out_of_docs_links(markdown, page.file.src_path)
