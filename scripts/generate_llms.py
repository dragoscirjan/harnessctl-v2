"""Generate LLM-friendly indexes from the canonical MkDocs navigation."""

from __future__ import annotations

import argparse
import re
from collections.abc import Iterator
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
CONFIG = ROOT / "mkdocs.yml"
OUTPUTS = {
    DOCS / "llms.txt": "compact",
    DOCS / "llms-full.txt": "full",
}


class _MkDocsConfigLoader(yaml.SafeLoader):
    """Load trusted MkDocs callable references as inspectable names."""


_MkDocsConfigLoader.add_multi_constructor(
    "tag:yaml.org,2002:python/name:",
    lambda _loader, suffix, _node: suffix,
)


def _navigation_pages(items: list[object]) -> Iterator[tuple[str, Path]]:
    for item in items:
        if isinstance(item, str):
            path = Path(item)
            yield _page_title(path), path
            continue
        if not isinstance(item, dict):
            raise ValueError(f"unsupported navigation item: {item!r}")
        for label, value in item.items():
            if isinstance(value, str):
                yield str(label), Path(value)
            elif isinstance(value, list):
                yield from _navigation_pages(value)
            else:
                raise ValueError(f"unsupported navigation value for {label!r}: {value!r}")


def _page_title(path: Path) -> str:
    source = (DOCS / path).read_text(encoding="utf-8")
    heading = re.search(r"^#\s+(.+)$", source, re.MULTILINE)
    if heading is None:
        raise ValueError(f"{path.as_posix()} has no level-one heading")
    return heading.group(1).strip()


def _page_route(path: Path) -> str:
    if path.as_posix() == "README.md":
        return "./"
    return f"./{path.with_suffix('').as_posix()}/"


def _plain_text(markdown: str) -> str:
    text = re.sub(r"!\[([^]]*)\]\([^)]+\)", r"\1", markdown)
    text = re.sub(r"\[([^]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"[`*_]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _page_description(path: Path) -> str:
    source = (DOCS / path).read_text(encoding="utf-8")
    paragraphs: list[str] = []
    current: list[str] = []
    in_fence = False

    for line in source.splitlines()[1:]:
        stripped = line.strip()
        if stripped.startswith(("```", "~~~")):
            in_fence = not in_fence
            continue
        if in_fence or stripped.startswith(("#", ">", "|", "- ", "* ")):
            if current:
                paragraphs.append(" ".join(current))
                current.clear()
            continue
        if stripped:
            current.append(stripped)
        elif current:
            paragraphs.append(" ".join(current))
            current.clear()
    if current:
        paragraphs.append(" ".join(current))

    for paragraph in paragraphs:
        description = _plain_text(paragraph)
        if description:
            return description
    raise ValueError(f"{path.as_posix()} has no descriptive paragraph")


def render_outputs() -> dict[Path, str]:
    """Return generated output keyed by repository path."""
    config = yaml.load(CONFIG.read_text(encoding="utf-8"), Loader=_MkDocsConfigLoader)
    pages = list(_navigation_pages(config["nav"]))
    site_name = str(config["site_name"])
    site_description = str(config["site_description"])

    compact = [f"# {site_name}", "", f"> {site_description}", ""]
    full = [f"# {site_name}", "", f"> {site_description}", ""]
    for label, path in pages:
        route = _page_route(path)
        compact.append(f"- [{label}]({route}): {_page_description(path)}")
        full.extend(
            [
                "---",
                "",
                f"## Page: {label}",
                "",
                f"Source: {route}",
                "",
                (DOCS / path).read_text(encoding="utf-8").rstrip(),
                "",
            ]
        )

    return {
        DOCS / "llms.txt": "\n".join(compact).rstrip() + "\n",
        DOCS / "llms-full.txt": "\n".join(full).rstrip() + "\n",
    }


def generate(*, check: bool) -> None:
    """Write generated indexes, or fail when checked-in output is stale."""
    stale: list[Path] = []
    for path, content in render_outputs().items():
        if path.exists() and path.read_text(encoding="utf-8") == content:
            continue
        if check:
            stale.append(path.relative_to(ROOT))
        else:
            path.write_text(content, encoding="utf-8")

    if stale:
        paths = ", ".join(path.as_posix() for path in stale)
        raise SystemExit(f"generated documentation indexes are stale: {paths}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail instead of writing stale output")
    args = parser.parse_args()
    generate(check=args.check)


if __name__ == "__main__":
    main()
