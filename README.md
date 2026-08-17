# harnessctl

Harness-neutral SDLC prompts and tooling for existing coding harnesses.

`harnessctl` is not another coding harness, agent runtime, scheduler, issue tracker,
or autonomous software-delivery platform. It distributes workflow instructions and
supporting tools into coding harnesses such as OpenCode and Pi.

The project exists to make development work:

- clearer to resume after interruptions;
- safer through explicit human approval boundaries;
- more inspectable through evidence and structured outputs;
- more economical through staged model usage and local-model support;
- portable across coding harnesses instead of being coupled to one runtime.

## Documentation

Start with the [documentation index](docs/README.md), then use the focused guides:

- [SDLC commands and approval boundaries](docs/sdlc.md)
- [Generated skills and host boundaries](docs/skills.md)
- [Configuration and tool settings](docs/configuration.md)
- [Repository memory and disposable cache](docs/memory.md)
- [Filesystem issues and configured provider routing](docs/issues.md)
- [Version control and MCP provider setup](docs/cvs.md)

The detailed intended lifecycle remains in [FLOWS.md](FLOWS.md). Topic guides label
implemented behavior separately from plans so roadmap material is not mistaken for a
current capability.

## Product model

The product has four layers:

```text
Canonical SDLC prompts
        │
        ▼
Harness-specific compiled commands
        │
        ├── OpenCode Markdown commands
        └── Pi prompt payloads / future Pi extension
        │
        ▼
Generic filesystem and workflow tools
        │
        ▼
Repository + human decisions + evidence
```

### harnessctl owns

- Harness-neutral workflow vocabulary.
- Prompt contracts and stage boundaries.
- Output structures and evidence requirements.
- Approval and autonomy rules.
- Installation and distribution of prompts.
- Generic filesystem issue and document tooling.
- Future model-tier, retry, escalation, and worker policies.

### The harness owns

- Model sessions and context windows.
- Tool execution and host permissions.
- User interaction and approval UI.
- Agent/extension loading.
- Provider authentication and model connectivity.
- Runtime-specific command dispatch.

Prompts describe a protocol. They are not a security boundary or transactional
workflow engine. Human review, host permissions, and later artifact validation remain
necessary.

## Intended SDLC flow

The conceptual command flow is:

```text
/new
  │
  ▼
/explore
  │
  ▼
/plan ──────────────── human approval required
  │
  ▼
/implement
  │
  ▼
/verify
  │
  ▼
/review ────────────── human review required
  │
  ▼
/finish ────────────── delivery approval required
  │
  ▼
human merge
```

The grouped command names above are the desired workflow vocabulary. Current
OpenCode installation uses the explicit hyphenated form because OpenCode command
files map directly to command names:

```text
/work-new
/work-explore
/work-plan
```

The intended Pi extension will eventually expose the grouped form:

```text
/work new
/work explore
/work plan
/work implement
/work verify
/work review
/work finish
```

The short names (`/new`, `/explore`, etc.) are conceptual shorthand for the stages,
not yet guaranteed host aliases.

## Stage contracts

Each stage consumes a defined output from the previous stage and produces an explicit
output for the next stage. A stage must stop at its boundary instead of silently
continuing into the next one.

### 1. `/new` — work contract

**Purpose:** Turn a natural-language request into a shared, reviewable agreement
between the user and the assistant.

**Consumes:** User request and conversation context.

**Produces:** A confirmed work contract:

```text
Objective
Motivation
Context
Constraints
Scope
Acceptance criteria
Open questions
Suggested next step
```

**Behavior:**

- Ask focused clarification questions one at a time.
- Separate confirmed facts from assumptions.
- Ask the user to confirm the proposed contract.
- Revise it if the user disagrees.
- Stop after confirmation.

**Must not:**

- create files, issues, branches, or specifications;
- classify the request as a bug/task/story/epic;
- explore the repository;
- delegate to workers;
- implement, verify, commit, push, or open a pull request.

### 2. `/explore` — evidence report

**Purpose:** Understand the existing repository and gather evidence before planning.

**Consumes:** Confirmed work contract.

**Produces:** An evidence report:

```text
Question investigated
Confirmed evidence
Relevant files and symbols
Observed behavior
Assumptions
Risks and contradictions
Unanswered questions
Recommendation
```

**Behavior:**

- Use targeted reads and searches.
- Cite files, symbols, commands, and outputs.
- Identify contradictions and missing evidence.
- Recommend whether planning can begin.

**Must not:**

- modify repository files;
- create issues or branches;
- implement a solution;
- claim behavior that was not observed.

### 3. `/plan` — approved implementation plan

**Purpose:** Convert the work contract and evidence into the smallest viable plan.

**Consumes:** Confirmed work contract and evidence report.

**Produces:** A proposed implementation plan:

```text
Problem statement
Confirmed requirements
Evidence used
Files and components likely to change
Implementation steps
Tests and verification
Risks and mitigations
Non-goals
Open decisions
```

**Approval gate:** The assistant must ask explicitly:

```text
Do you approve this plan for implementation?
```

No implementation may begin without a positive human response. The approval should
eventually be tied to the exact plan revision or content hash.

### 4. `/implement` — scoped change execution

**Purpose:** Execute an approved plan.

**Consumes:** Confirmed work contract, evidence report, and approved plan.

**Produces:** Repository changes plus an implementation result:

```text
Work performed
Files changed
Tests added or changed
Commands run
Results
Deviations from the plan
Unresolved risks
Recommendation
```

**Rules:**

- Stay within approved scope.
- Do not silently rewrite the plan.
- Stop on contradictions or missing approval.
- Do not change protected policy, permission, or escalation configuration.
- Do not commit, push, or create a pull request automatically.

### 5. `/verify` — evidence-backed verification

**Purpose:** Determine whether the implementation satisfies the contract and plan.

**Consumes:** Work contract, approved plan, implementation result, and repository
diff.

**Produces:** A verification report:

```text
Commands executed
Exit statuses
Acceptance criteria mapping
Changed files
Observed failures
Unverified claims
Remaining risks
Recommendation
```

Claims without tool-backed evidence must be marked unverified.

### 6. `/review` — human review package

**Purpose:** Prepare a concise review decision for the human.

**Consumes:** All prior artifacts, diff, and verification report.

**Produces:**

```text
What changed
Why it changed
Evidence
Known risks
Remaining concerns
Suggested decision: accept, repair, block, or reject
```

The assistant may recommend a decision but does not merge or override the human.

### 7. `/finish` — delivery preparation

**Purpose:** Prepare delivery metadata after implementation and review.

**Consumes:** Approved work, verification, and human review decision.

**Produces:**

```text
Commit suggestion
Push suggestion
Pull request title/body suggestion
Outstanding warnings
Human actions required
```

It may prepare commands or metadata, but merge remains human-only.

## What is implemented today

### Prompt distribution

Implemented in `src/harnessctl/`:

- Jinja2 prompt rendering with strict undefined-variable handling.
- Atomic prompt installation with rollback on multi-file failure.
- Conflict detection that reports all existing targets.
- Explicit `--force` overwrite behavior.
- OpenCode and Pi target generation.
- Configurable direct Git or Jujutsu guidance and provider-specific CVS routing.
- Fixed-ID GitHub, GitLab, Gitea, and Forgejo MCP projection into OpenCode and Pi host
  files, with independently configured CVS and Issues policies.
- Packaged prompt templates that are included in built wheels.

The current registry contains 18 canonical templates and installs each under the
OpenCode and Pi command directories. See the [SDLC guide](docs/sdlc.md) for the exact
command set and current host boundaries.

### Generic issue tooling

Implemented in `extensions/generic-tools/`:

- One versioned, canonical YAML document per issue under configurable
  `issues.root` (default `.harnessctl/issues`), or its `archived/` child after
  archival.
- Complete issue-managed state in that document, including the Markdown body,
  relationships, metadata, document links, and append-only comments.
- Prefix-based issue ID allocation, defaulting to `hrn-` (`hrn-00001`).
- Multi-ID prompt extraction.
- Structured issue creation and listing.
- Issue retrieval and updates.
- Mandatory revision-aware updates and one shared project-local operation barrier.
- Status transitions.
- Append-only comments.
- Parent/child hierarchy.
- Relationships including directional `supersedes`.
- Document links.
- Validation reports.
- Recursive archive with rollback and archived-descendant handling.

Issue YAML uses a safe, permissive reader: semantically valid formatting, quoting,
and field ordering are accepted, while aliases, merge keys, explicit tags, duplicate
keys, multiple documents, unsafe paths, and invalid schema values are rejected. Tool
writes are deterministic. Parent, child, blocking, and symmetric relationship views
are derived from a single persisted direction rather than duplicated across files.

### Simplified local persistence

Filesystem issues and enabled repository memory are the only canonical local state.
Every issue get/list/validation and memory get/list/search/export operation reads YAML
from the filesystem; SQLite never supplies an agent result or repairs YAML.

Participating local issue and repository-memory operations share one exclusive,
non-reentrant barrier at `.harnessctl/cache/local-operations.lock`. Canonical writes
use same-directory replacement and bounded in-process rollback for ordinary failures.
There are no application transaction journals, projection sinks or change sets,
dirty markers, startup roll-forward, or agent-facing cache tools. A process crash can
leave partial canonical state; later validation reports it for manual correction.

After each successful issue or repository-memory mutation, harnessctl synchronously
refreshes the disposable cache at `.harnessctl/cache/harnessctl.sqlite`. Missing,
stale, corrupt, incompatible, or failed direct synchronization is repaired internally
by rebuilding the complete cache from valid canonical YAML. A failed repair returns an
error even though canonical data may already be committed. The cache uses lazily
loaded runtime-specific SQLite support: `bun:sqlite` on supported Bun and
`node:sqlite` on supported Node. Remote memory backends bypass this local barrier and
cache; only the repository backend is currently implemented by generic-tools.

Installation does not create or initialize the SQLite file. It only ignores the
cache directory when repository memory is installed; the first participating runtime
operation creates or repairs the cache.

#### Canonical issue storage compatibility

Canonical YAML storage operates on an empty configured `issues.root` or a root that
already contains canonical issue files. Legacy `<issues.root>/<id>/issue.md` and mixed
layouts are unsupported and fail closed. Harnessctl provides no legacy migration;
repositories must be converted outside these tools before canonical operations begin.

### Harness adapters

OpenCode and Pi adapters currently register the generic issue/configuration tools and
the normalized repository-memory tools. Adapter tests cover Pi memory registration,
store, search, and validation delegation.

Automatic memory installation supports OpenCode and Pi. Pi receives all 18 commands,
all four skills under `.pi/skills/`, and project-local `@harnessctl/pi-tools`; its
`pi.extensions` package manifest loads the tool extension.

OpenCode and Pi receive generated CVS and Issues skills. Pi MCP host configuration uses
the consent-gated, pinned `npm:pi-mcp-adapter@2.26.0` prerequisite.
Generated guidance enumerates valid CLI and MCP capabilities and lets the agent choose
per operation. It must choose before mutation and never switch routes after mutation
begins.
See the [CVS and MCP guide](docs/cvs.md) for exact formats, per-operation capability
selection, external license boundaries, and residual installation effects.

Both adapters also have model-backed integration coverage for eight workflows:

- configuration creation;
- configuration lookup;
- issue ID extraction;
- issue creation;
- issue listing;
- lifecycle operations;
- relationships/archive;
- document linking.

### Developer tooling

The repository now uses:

- npm workspaces for TypeScript packages;
- uv for all Python dependencies and execution;
- mise as the root cross-language task manager;
- Ruff for Python formatting/linting;
- Pytest for Python tests;
- Vulture for Python dead-code detection;
- ESLint, Prettier, Vitest, Fallow, and jscpd for existing Node workflows;
- ShellCheck for repository Bash scripts;
- Husky hooks invoking root mise tasks.

## What is not implemented yet

The following are intentionally not part of the current slice:

- a Pi extension that exposes `/work new` and grouped subcommands;
- a primary Orchestrator agent definition;
- anonymous worker assignment and result contracts in prompts;
- durable `.harnessctl/tasks/` workflow artifacts;
- plan approval artifacts and revision/hash coupling;
- automatic retry, ensemble, or escalation behavior;
- model-tier routing and cost-aware model selection;
- external issue trackers or hosting integrations;
- direct provider API clients, provider CLI installation/authentication, and automatic
  merge;
- worktrees, automatic commits, automatic pushes, or automatic PR creation;
- automatic merge;
- self-development mode;
- game-development-specific workflows.

The generic issue tools are more advanced than the prompt workflow because they were
implemented as a separate filesystem-management slice. The 18 prompt templates are
currently conversation-only proposals and do not orchestrate those tools.

## Next implementation steps

Current roadmap areas include durable approval artifacts, grouped Pi command
dispatch, model-tier and retry policy, remote provider adapters, and protected
self-development. These remain separate from the installed 18-command prompt set.
See [FLOWS.md](FLOWS.md) for intended sequencing and the
[topic documentation](docs/README.md) for current-versus-planned boundaries.

## Installing prompts

The Python side is uv-only. Use mise as the project-level task runner.

From this repository:

```bash
mise run setup
mise run install-prompts
```

Or invoke the installer directly through uv:

```bash
uv run python -m harnessctl.install --cwd /path/to/project --harness all
```

Supported targets:

```bash
uv run python -m harnessctl.install --cwd . --harness opencode
uv run python -m harnessctl.install --cwd . --harness pi
uv run python -m harnessctl.install --cwd . --harness pi --allow-pi-package-install
uv run python -m harnessctl.install --cwd . --harness all
uv run python -m harnessctl.install --cwd . --harness all --force
```

Pi installs require per-package interactive consent. Noninteractive automation must use
`--allow-pi-package-install`; the legacy adapter-only flag remains an alias.

## Development commands

```bash
mise run format
mise run format-fix
mise run lint
mise run lint-fix
mise run test
mise run quality
mise run node-build
mise run integration
```

For a Pi-only local-model integration run:

```bash
PI_TEST_MODEL=my-provider/my-model \
PI_TEST_BASE_URL=http://127.0.0.1:8000/v1 \
npm run test:integration --workspace @harnessctl/pi-tools
```

`mise run integration` runs both OpenCode and Pi integration suites. Use it only
when both the OpenCode model configuration and the Pi provider environment are
available.

## Node package releases

Published packages:

- `@harnessctl/generic-tools`
- `@harnessctl/opencode-tools`
- `@harnessctl/pi-tools`

Packages version independently through Changesets. Any pull request that changes a
published package must add a changeset:

```bash
npm run changeset
```

Select affected packages and the smallest correct semantic-version bump. Tests,
documentation, and repository-only automation do not need a changeset.

After changes reach `main`, the release workflow creates or updates a version pull
request. Merging that pull request triggers publication of changed packages, npm tags,
and GitHub releases. Do not edit package versions manually.

Repository maintainers must configure:

1. A GitHub environment named `npm`, preferably with required reviewers.
2. An environment secret named `NPM_TOKEN` containing an npm automation/granular token
   allowed to publish the `@harnessctl` scope.
3. Branch protection requiring the cross-platform `CI` checks before merge.

The npm token is exposed only to the protected publish job. Regular CI, version pull
requests, forks, and local development do not receive it. Model-backed integration
tests remain manual and are not part of package publication.

Useful local checks:

```bash
npm run packages:check
npx changeset status --since=main
mise run quality
```

If publication fails, do not republish by manually changing versions. Correct the
token, package metadata, or registry state; then rerun the failed workflow. Changesets
skips package versions already present in npm.

## Returning after a break

When returning after days away:

```bash
git status --short --branch
mise run quality
```

Then read, in order:

1. This README.
2. The relevant current LLD.
3. The active issue or task file, if one exists.
4. The current branch diff.

Before changing product direction, check whether the decision already exists in the
PRD, LLD, issue files, or recent commits. If company work and personal work are being
discussed in the same session, explicitly state which repository/project is active
before taking action.

## Important documents

| Document                                                                                     | Purpose                                       |
| -------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `.specs/00001-prd-human-governed-sdlc-v1.md`                                                 | Product and architecture baseline             |
| `.specs/00002-lld-filesystem-issue-management-v2.md`                                         | Filesystem issue-management design            |
| `.specs/00003-lld-harness-neutral-sdlc-prompt-templates-and-harness-installers-v2.md`        | Prompt templates and installer design         |
| `.harnessctl/issues/00001-initiative-human-governed-extensible-sdlc-for-coding-harnesses.md` | Long-term initiative and roadmap              |
| `mise.toml`                                                                                  | Root tool versions and cross-language tasks   |
| `pyproject.toml`                                                                             | Python dependencies and quality configuration |

## Human-only boundaries

The following remain human-only unless a future approved design changes them:

- approving implementation plans;
- approving delivery actions;
- merging pull requests;
- weakening policy, permission, or escalation controls.

The goal is not maximum automation. The goal is a workflow that remains clear,
recoverable, evidence-oriented, and under human control.
