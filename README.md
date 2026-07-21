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
- Packaged prompt templates that are included in built wheels.

Current canonical templates:

```text
src/harnessctl/templates/sdlc/work-new.md.j2
src/harnessctl/templates/sdlc/work-explore.md.j2
src/harnessctl/templates/sdlc/work-plan.md.j2
```

Current installer targets:

```text
.opencode/commands/work-new.md
.opencode/commands/work-explore.md
.opencode/commands/work-plan.md

.pi/commands/work-new.md
.pi/commands/work-explore.md
.pi/commands/work-plan.md
```

### Generic issue tooling

Implemented in `extensions/generic-tools/`:

- Prefix-based issue ID allocation.
- Multi-ID prompt extraction.
- Structured issue creation and listing.
- Issue retrieval and updates.
- Mandatory revision-aware updates and per-issue locking.
- Status transitions.
- Append-only comments.
- Parent/child hierarchy.
- Relationships including directional `supersedes`.
- Document links.
- Validation reports.
- Recursive archive with rollback and archived-descendant handling.

### Harness adapters

OpenCode and Pi adapters currently register the generic issue/configuration tools and
have adapter-level tests.

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

- `/implement`, `/verify`, `/review`, or `/finish` prompt templates;
- a Pi extension that exposes `/work new` and grouped subcommands;
- a primary Orchestrator agent definition;
- anonymous worker assignment and result contracts in prompts;
- durable `.harnessctl/tasks/` workflow artifacts;
- plan approval artifacts and revision/hash coupling;
- automatic retry, ensemble, or escalation behavior;
- model-tier routing and cost-aware model selection;
- external issue trackers or hosting integrations;
- worktrees, automatic commits, automatic pushes, or automatic PR creation;
- automatic merge;
- self-development mode;
- game-development-specific workflows.

The generic issue tools are more advanced than the prompt workflow because they were
implemented as a separate filesystem-management slice. They are available for later
prompt stages but are not yet orchestrated by the prompts.

## Next implementation steps

The recommended order is:

### Immediate

1. Exercise `work-new`, `work-explore`, and `work-plan` manually in OpenCode.
2. Refine the language based on real conversations.
3. Add the Pi extension that loads `.pi/commands/*.md` and exposes grouped `/work`
   subcommands.
4. Decide whether OpenCode should keep hyphenated names or receive aliases such as
   `/work.new`.

### Workflow safety

5. Define a durable artifact layout under `.harnessctl/tasks/<id>/`.
6. Add a plan artifact containing a revision/content hash.
7. Add an explicit human approval artifact tied to that exact plan.
8. Add resume behavior based on artifacts rather than chat history.

### Implementation workflow

9. Write `/implement` with strict scope and protected-file rules.
10. Write `/verify` with command execution and evidence capture.
11. Write `/review` with human decision output.
12. Write `/finish` as metadata/command preparation only.

### Intelligence allocation

13. Add generic model-tier configuration.
14. Start with the cheapest reasonable model.
15. Retry only with concrete feedback.
16. Escalate only on observable failure, contradiction, insufficient evidence, or
    policy-defined risk.
17. Preserve failed attempts and judge findings when escalating.

### Delivery and expansion

18. Add optional commit/push/PR preparation policies.
19. Keep merge human-only.
20. Add external provider adapters only after the local filesystem workflow is stable.
21. Add self-development only with protected policy, permission, escalation, and merge
    controls.

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
uv run python -m harnessctl.install --cwd . --harness all
uv run python -m harnessctl.install --cwd . --harness all --force
```

## Development commands

```bash
mise run format
mise run format-fix
mise run lint
mise run lint-fix
mise run test
mise run quality
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

| Document                                                                              | Purpose                                       |
| ------------------------------------------------------------------------------------- | --------------------------------------------- |
| `.specs/00001-prd-human-governed-sdlc-v1.md`                                          | Product and architecture baseline             |
| `.specs/00002-lld-filesystem-issue-management-v2.md`                                  | Filesystem issue-management design            |
| `.specs/00003-lld-harness-neutral-sdlc-prompt-templates-and-harness-installers-v2.md` | Prompt templates and installer design         |
| `.issues/00001-initiative-human-governed-extensible-sdlc-for-coding-harnesses.md`     | Long-term initiative and roadmap              |
| `mise.toml`                                                                           | Root tool versions and cross-language tasks   |
| `pyproject.toml`                                                                      | Python dependencies and quality configuration |

## Human-only boundaries

The following remain human-only unless a future approved design changes them:

- approving implementation plans;
- approving delivery actions;
- merging pull requests;
- weakening policy, permission, or escalation controls.

The goal is not maximum automation. The goal is a workflow that remains clear,
recoverable, evidence-oriented, and under human control.
