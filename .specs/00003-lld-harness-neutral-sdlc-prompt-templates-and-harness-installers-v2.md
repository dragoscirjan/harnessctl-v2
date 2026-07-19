---
id: ""
type: lld
title: "Harness-Neutral SDLC Prompt Templates and Harness Installers"
version: 2
status: draft
parent: "00001"
opencode-agent: lead-engineer
---

# Harness-Neutral SDLC Prompt Templates and Harness Installers

## 1. Purpose

Define the first harness-neutral prompt distribution slice for harnessctl. Canonical
SDLC instructions live once in the repository and are compiled into host-specific
artifacts by an installer. The first command is the human-governed intake command
`/work new`.

This LLD extends the PRD's harness boundary without introducing an orchestration
runtime. The installer distributes prompts; the host harness remains responsible for
sessions, model execution, tools, and UI behavior.

## 2. Scope

### In scope

- Canonical Markdown prompt sources under `src/harnessctl/templates/sdlc/`.
- Jinja2 compilation with a small, explicit host context.
- A Python installer entry point under `src/`.
- Project-local OpenCode installation at `.opencode/commands/work-{new,explore,plan}.md`.
- Project-local Pi installation at `.pi/commands/work-{new,explore,plan}.md`.
- Idempotent installation and conflict detection.
- Unit tests for rendering and installation into temporary directories.
- The `work-new`, `work-explore`, and `work-plan` prompts only.
- Python quality tooling integrated with the existing Node quality workflow.

### Out of scope

- Issue creation, planning, exploration, implementation, verification, or delivery
  commands.
- Pi extension code. Pi prompt discovery is sufficient for this first slice; a later
  extension can provide a true `/work new` command and additional runtime behavior.
- Model routing, worker delegation, permissions, MCP configuration, or `.harnessctl`
  state generation.
- Global user installation. The first installer targets the current project's
  `.opencode/` and `.pi/` directories.

## 3. Repository layout

```text
src/
  harnessctl/
    __init__.py
    install.py              # installer CLI and rendering orchestration
    templates.py            # template discovery and rendering helpers
    templates/
      sdlc/
        work-new.md.j2       # packaged harness-neutral prompt body
        work-explore.md.j2
        work-plan.md.j2
tests/
  test_install.py
pyproject.toml                 # uv project and Python dependencies
uv.lock                        # committed reproducible environment
mise.toml                      # root cross-language task orchestration
```

The canonical template must not contain OpenCode frontmatter, Pi SDK objects, or
host-specific command syntax. Host adapters supply only the output wrapper and
command name.

## 4. Host output contract

The canonical command identifiers are `work-new`, `work-explore`, and `work-plan`.
The user-facing syntax differs by host:

| Host | First-slice output | Invocation |
|---|---|---|
| OpenCode | `.opencode/commands/work-{new,explore,plan}.md` with Markdown frontmatter and rendered bodies | `/work-new`, `/work-explore`, `/work-plan` |
| Pi | `.pi/commands/work-{new,explore,plan}.md` with rendered prompt content | Loaded by a later Pi extension that exposes `/work new`, `/work explore`, `/work plan` |

OpenCode's current command documentation confirms project Markdown commands under
`.opencode/commands/`; the filename becomes the command name and the body is the
prompt template. Pi's current SDK documentation confirms prompt templates are
discovered from `cwd/.pi/prompts/` and represented internally as `PromptTemplate`
objects. Therefore Pi receives the same rendered Markdown content now, without
pretending that a Markdown file is already a Pi command extension.

The rendered OpenCode file has only host-required frontmatter:

```yaml
---
description: Start a human-guided work intake
---
```

The first Pi output intentionally uses the same project-local directory shape as the
OpenCode output: `.pi/commands/work-new.md`. It is a compiled prompt payload only;
the later Pi extension will load this file and expose the `/work new` command. The
installer must not pretend that Pi will execute this Markdown file directly.

## 5. Template contract

`work-new.md.j2` implements the confirmed work-contract intake behavior. `work-explore.md.j2`
implements read-only evidence gathering. `work-plan.md.j2` implements plan generation
with explicit human approval. Each template must:

1. Consume the output contract of the preceding stage.
2. Produce its own explicit, structured output contract.
3. Stop before the next stage.

The prompt must explicitly prohibit file creation, issue creation, specification
creation, branch changes, worker delegation, implementation, verification, commits,
and pull requests. It must end with an intake-complete message and state that no
files were created or modified.

The first templates accept no custom Jinja variables. This keeps the canonical
prompt deterministic and prevents host context from leaking into the workflow
contract. Future templates may declare variables through a validated manifest.

## 6. Python installer

The installer exposes a small CLI:

```text
uv run python -m harnessctl.install --cwd PATH --harness opencode
uv run python -m harnessctl.install --cwd PATH --harness pi
uv run python -m harnessctl.install --cwd PATH --harness all
```

`uv` is mandatory for the Python side of the project. The installer and tests are
not supported through bare `python`, `pip`, or an unmanaged virtual environment.
Dependency installation and test execution must use `uv sync`, `uv run`, or an
equivalent uv-managed command. CI must install uv and run the same commands.

Defaults:

- `--cwd .`
- `--harness all`
- template source resolved relative to the installed source package, not the caller's
  current directory.

The installer must:

- Resolve the target path beneath the supplied project root.
- Render with `StrictUndefined` and an empty context.
- Create only the required parent directory.
- Refuse to overwrite an existing file unless `--force` is explicitly supplied.
- Write through a temporary file and atomic rename.
- Report every installed path and every conflict.
- Return a non-zero exit code for invalid harness names, render failures, or
  conflicts.
- Never execute rendered prompt content.

`--force` is intentionally explicit and applies only to the generated target files;
it must not delete directories or modify unrelated host configuration.

## 7. Dependency and packaging decision

Jinja2 is the only required runtime dependency for this slice. `pyproject.toml` and
`uv.lock` define the reproducible Python environment; `pytest` is a development
dependency. Node workspace tooling remains independent; this Python installer does
not import the TypeScript extension packages.

## 8. Python quality workflow

Python tooling is uv-managed and must participate in the repository's existing
quality gates.

### Tools

- **Ruff** is the Python formatter and linter. It provides the Python equivalent of
  the existing Prettier/ESLint combination without adding separate Black, isort, or
  Flake8 stacks. Prettier remains responsible for Markdown, YAML, JSON, and other
  repository text formats; it is not used to format Python source.
- **Pytest** runs installer and template tests.
- **Vulture** provides the closest Python equivalent to Fallow's dead-code scan.
  It must be configured with an explicit confidence threshold and reviewed for
  dynamic-import false positives.
- **jscpd** scans `src/**/*.py` and `tests/**/*.py` alongside existing TypeScript and
  JavaScript paths.

### Commands and configuration

Ruff, Pytest, and Vulture configuration live in `pyproject.toml`. The expected
commands are:

```text
uv run ruff format src tests
uv run ruff format --check src tests
uv run ruff check src tests
uv run pytest
uv run vulture src tests --min-confidence 80
```

The root `mise.toml` is the canonical cross-language task manager. It combines the
Node workspace commands, uv-backed Python commands, shellcheck, jscpd, tests, and
dead-code checks. Extension package scripts remain unchanged and continue to belong
to their individual npm workspaces; only root-project orchestration moves to mise.
No Python command may silently fall back to the system interpreter.

### Husky integration

- **Pre-commit** invokes root `mise run format-fix` and `mise run lint-fix`; those
  tasks cover Node and Python sources.
- **Pre-push** invokes root `mise run node-dupcheck` and `mise run test`; the latter
  covers Node and Python tests.
- A full repository quality target runs Node quality plus Python format checking,
  Ruff linting, Pytest, Vulture, and jscpd.
- If the optional integration-test switch is enabled, the existing OpenCode/Pi
  integration tests remain part of pre-push after the Python checks.

These hooks must fail fast when `uv` is unavailable. They must not install tools or
silently skip Python checks.

## 9. Acceptance criteria

- Rendering the canonical template for OpenCode produces valid Markdown command
  frontmatter and the complete intake prompt.
- Rendering for Pi produces the same prompt body and no OpenCode-only frontmatter.
- Installing `all` into a temporary project creates exactly six files:
  - `.opencode/commands/work-new.md`
  - `.opencode/commands/work-explore.md`
  - `.opencode/commands/work-plan.md`
  - `.pi/commands/work-new.md`
  - `.pi/commands/work-explore.md`
  - `.pi/commands/work-plan.md`
- Reinstalling without `--force` reports conflicts and does not change either file.
- Reinstalling with `--force` replaces only the generated files.
- Invalid harness names and missing template resources fail clearly.
- The rendered prompt contains no unresolved Jinja expressions.
- Tests verify objective, clarifying-question, stop/no-files, and output-structure
  instructions are present.
- No issue, task, branch, `.harnessctl` artifact, or repository source file is
  created by installation.
- `uv run ruff format --check src tests`, `uv run ruff check src tests`, and
  `uv run pytest` are represented in the repository quality workflow.
- jscpd scans Python and existing Node source paths.
- Vulture is run through uv and its findings are visible in quality output.
- Pre-commit and pre-push invoke the Python checks and fail when uv or a check is
  unavailable.

## 10. Deferred decisions

- Whether canonical templates should eventually be split into reusable Jinja partials.
- A manifest describing command names, descriptions, variables, and target paths.
- Global installation under user configuration directories.
- A Pi extension that registers `/work` and dispatches subcommands such as `new`.
- Additional prompts for explore, plan, implement, verify, review, and finish.
