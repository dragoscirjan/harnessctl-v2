# Skills

Harnessctl skills are generated Markdown guidance for coding agents. A skill can shape
how an agent works, but its presence does not grant permission, register a tool or MCP
server, provide credentials, or prove that an external provider is working.

Use this catalog to choose guidance by outcome. Use [Skill Configuration](configuration.md)
for exact settings, [Harnesses](harnesses.md) for host support, [MCP Servers](mcp-servers.md)
for external capabilities, and [Node Modules](node-modules.md) for implementation packages.
If expected guidance is absent or appears dormant, see
[Troubleshooting](troubleshooting.md#skill-is-missing).

## Choose by goal

| Goal                        | Skill                                         | Choose it when                                                                               |
| --------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Run controlled SDLC phases  | [`sdlc`](#sdlc)                               | Work must stay inside explicit Plan, Build, Verify, Release, Continue, or Refresh boundaries |
| Apply code guidance         | [`sdlc-code`](#sdlc-code)                     | Build work needs repository-aware language, framework, or artifact guidance                  |
| Communicate concisely       | [`sdlc-caveman`](#sdlc-caveman)               | Responses should be compact without dropping technical substance                             |
| Develop with tests first    | [`sdlc-develop-tdd`](#sdlc-develop-tdd)       | Implementation should follow Red-Green-Refactor                                              |
| Retrieve code relationships | [`sdlc-code-index`](#sdlc-code-index)         | A configured code-index service can improve relationship and impact discovery                |
| Reuse project knowledge     | [`sdlc-memory`](#sdlc-memory)                 | Confirmed decisions, events, facts, or lessons should survive sessions                       |
| Manage work items           | [`sdlc-issue-tracking`](#sdlc-issue-tracking) | Issues must follow one configured local or remote authority                                  |
| Work with version control   | [`sdlc-cvs`](#sdlc-cvs)                       | Local and remote version-control actions need provider-specific safety rules                 |

## Read availability precisely

Harnessctl currently ships exactly eight skill templates for OpenCode and Pi. "Always"
below means the skill is generated for each selected supported harness. "When enabled"
means Config v1 controls generation. A retained file can remain discoverable after a
feature is disabled; that does not mean the compiled SDLC policy will load it.

OpenCode and Pi support is currently `working`. Claude and Codex generation is `not
implemented`; see [Harnesses](harnesses.md) for the shared support evidence and scope.
All catalog statuses use the [status and evidence contract](status-and-evidence.md).

## `sdlc`

**Purpose:** Keep delivery Epic-first and separate Plan, Build, Verify, Release, Continue,
and standalone Refresh work.

**Use when:** A repository change needs explicit scope, consent boundaries, authoritative
evidence, phase separation, and a compact result.

**Expected result:** The agent loads one phase reference, performs only the confirmed
phase, records bounded evidence, and stops before crossing into another phase.

**Availability:** Always generated for selected OpenCode and Pi hosts.

**Activation:** Core guidance is always available. Config compiles optional Memory, TDD,
Code Index, Web Retrieval, and Documents context into the generated tree.

**Prerequisites:** An authoritative Epic for lifecycle phases. Refresh is standalone and
does not require or mutate an Epic. See [Harnessctl SDLC](sdlc.md) and the
[command reference](command-reference.md).

**Limits:** The skill does not approve work, create permissions, merge, deploy, operate a
provider, or make retrieved instructions authoritative.

**Status:** `working` for OpenCode and Pi; Claude and Codex are `not implemented`.

**Evidence:** Source: the canonical
[`sdlc` template and phase references](../src/harnessctl/templates/skills/sdlc/SKILL.md.j2).
Automated test: template, installation, command, and release-artifact contract suites.

## `sdlc-code`

**Purpose:** Apply portable clean-code policy and only the ecosystem guidance relevant to
the confirmed Build slice.

**Use when:** Build changes touch a detected language, framework, shell, documentation
format, or infrastructure artifact.

**Expected result:** Repository policy and approved scope remain primary; applicable
guidance is selected from 26 bundled subjects without installing a toolchain or imposing
irrelevant patterns.

**Availability:** Always generated as byte-equivalent trees for selected OpenCode and Pi
hosts.

**Activation:** Build loads the root once and reads only references justified by current
files and repository evidence. There is no Config v1 enable switch; see
[Harnessctl SDLC](sdlc.md) for the phase that applies this guidance.

**Prerequisites:** A confirmed Build slice and enough repository evidence to identify the
actual ecosystem. Ambiguous files require further discovery rather than a guess.

**Limits:** Named tools are alternatives, not cumulative requirements. The skill does not
add dependencies, replace project tooling, broaden scope, or own global skills.

**Status:** `working` for OpenCode and Pi; Claude and Codex are `not implemented`.

**Evidence:** Source: the canonical
[`sdlc-code` template](../src/harnessctl/templates/skills/sdlc-code/SKILL.md.j2) and its 26
bundled references. Automated test: template-resource, installation, and release-artifact
contract suites.

## `sdlc-caveman`

**Purpose:** Make communication concise while preserving exact technical substance.

**Use when:** Responses should remove filler and repetition without losing names, code,
commands, errors, constraints, evidence, or uncertainty.

**Expected result:** Strict mode uses terse technical fragments; balanced mode uses concise
professional sentences. Safety warnings and ordered instructions expand when compression
could cause mistakes.

**Availability:** Generated for OpenCode when `skills.caveman.enabled` is true. Generated
for Pi regardless of that switch, using the configured mode.

**Activation:** Configure mode and OpenCode generation through
[Caveman configuration](caveman.md). The default is enabled, strict mode.

**Prerequisites:** None for communication alone. Repository Memory requires Caveman to be
enabled because stored summaries use its compression rules.

**Limits:** Concision never weakens consent, safety, evidence, or authority rules and never
imposes a hard word or token limit.

**Status:** `working` for the documented OpenCode and Pi conditions; Claude and Codex are
`not implemented`.

**Evidence:** Source: the canonical
[`sdlc-caveman` template](../src/harnessctl/templates/skills/sdlc-caveman/SKILL.md.j2).
Automated test: strict/balanced rendering and host-installation contract suites.

## `sdlc-develop-tdd`

**Purpose:** Enforce Red-Green-Refactor for each implementation behavior slice.

**Use when:** The user requests test-driven development or `skills.tdd.enabled` activates
it for Build.

**Expected result:** Tests fail first for the right reason, minimum implementation makes
them pass, and behavior-preserving refactoring keeps them green.

**Availability:** Generated for selected OpenCode and Pi hosts only when TDD is enabled.

**Activation:** Enable it through [TDD configuration](tdd.md). Disabling TDD does not delete
a previously generated file; the compiled Build guidance leaves that retained copy dormant.

**Prerequisites:** A confirmed Build slice with an observable behavior that can be tested.

**Limits:** The skill does not choose or install a test framework, change runtime policy,
mock internal logic, or authorize implementation outside the confirmed slice.

**Status:** `working` when enabled for OpenCode or Pi; Claude and Codex are `not implemented`.

**Evidence:** Source: the canonical
[`sdlc-develop-tdd` template](../src/harnessctl/templates/skills/sdlc-develop-tdd/SKILL.md.j2).
Automated test: enabled, disabled, retained-file, Build-guidance, and host-installation
contract suites.

## `sdlc-code-index`

**Purpose:** Use a configured code-index MCP service for advisory relationship and impact
retrieval while keeping repository source authoritative.

**Use when:** Relationship-aware symbol, caller, dependency, execution-flow, or impact
evidence would improve discovery.

**Expected result:** The agent inspects live schemas, queries the configured service
narrowly, verifies material findings against source, and falls back to direct search when
the service is unavailable, stale, incomplete, or unsuitable.

**Availability:** Generated for selected OpenCode and Pi hosts only when Code Index is
enabled.

**Activation:** Configure the switch and MCP declaration through
[Code Index configuration](code-intelligence.md). A retained disabled copy can remain
discoverable, but compiled SDLC guidance refuses to load it and Harnessctl warns instead of
deleting it.

**Prerequisites:** The configured MCP name must resolve in the effective registry. The
operator owns service installation, startup, credentials, index data, and availability.

**Limits:** Ordinary lifecycle phases use retrieval only. A repository-scoped refresh is
allowed only through the explicit Refresh exception, live capability evidence, and fresh
consent. Skill presence does not register or operate the server.

**Status:** `working` when enabled for OpenCode or Pi; external provider operation remains
separate evidence. Claude and Codex are `not implemented`.

**Evidence:** Source: the canonical
[`sdlc-code-index` template](../src/harnessctl/templates/skills/sdlc-code-index/SKILL.md.j2).
Automated test: enabled, disabled, dormant-warning, fallback, projection, and host-installation
contract suites.

## `sdlc-memory`

**Purpose:** Retrieve and preserve concise, curated project knowledge without replacing
current repository authority.

**Use when:** Confirmed decisions, events, reusable facts, or repeatable lessons should be
available across sessions or lifecycle phases.

**Expected result:** Retrieval stays narrow and bounded; persistence stores one confirmed
item with provenance; corrections preserve history through supersession.

**Availability:** Generated for OpenCode when `skills.memory.enabled` is true. Generated for
Pi regardless of that switch, with configured retrieval bounds and repository root.

**Activation:** Enable and bound project memory through
[Memory configuration](memory.md). Core SDLC checkpoint hooks follow the configured Memory
switch even when a Pi skill file is discoverable.

**Prerequisites:** Caveman must be enabled. The repository backend is the only implemented
canonical backend; its local cache remains disposable.

**Limits:** Memory is advisory. It cannot prove current state, store secrets or transcripts,
override source, or broaden scope and consent.

**Status:** `working` for repository memory under the documented OpenCode and Pi conditions;
other backends remain `not implemented`. Claude and Codex are `not implemented`.

**Evidence:** Source: the canonical
[`sdlc-memory` template](../src/harnessctl/templates/skills/sdlc-memory/SKILL.md.j2).
Automated test: configuration dependency, bounded rendering, persistence-tool, and
host-installation contract suites.

## `sdlc-issue-tracking`

**Purpose:** Keep issue reads and mutations inside one configured filesystem or remote
provider authority.

**Use when:** Work needs initiatives, Epics, Stories, Tasks, Bugs, comments, relationships,
status transitions, or provider issue operations.

**Expected result:** The generated skill exposes only configured routes, requires exact
revision evidence where applicable, verifies provider context and capabilities, and stops
on ambiguity or terminal mutation results.

**Availability:** Always generated for selected OpenCode and Pi hosts.

**Activation:** Select filesystem or remote behavior through
[Issues configuration](issues.md). Provider-specific CLI and optional MCP context are
compiled into the skill.

**Prerequisites:** A valid configured provider and its declared tools. Remote work also
requires explicit repository context and authentication outside the skill.

**Limits:** The skill does not install a CLI, log in, store credentials, switch providers,
retry ambiguous mutations through another route, or make issue content authoritative.

**Status:** `working` for configured filesystem and supported remote routes on OpenCode and
Pi; live provider capability still requires current evidence. Claude and Codex are `not
implemented`.

**Evidence:** Source: the canonical
[`sdlc-issue-tracking` template](../src/harnessctl/templates/skills/sdlc-issue-tracking/SKILL.md.j2).
Automated test: provider rendering, revision safety, remote routing, migration, and
host-installation contract suites.

## `sdlc-cvs`

**Purpose:** Apply safe local and remote version-control rules using only configured tools.

**Use when:** Work needs status or diff inspection, branching, commits, pushes, pull or merge
requests, reviews, or another provider-backed version-control operation.

**Expected result:** Local operations use the configured VCS; opt-in Git Epic workspace
operations use normalized safety-gated tools; remote operations choose one verified CLI or
MCP route before mutation; merge always requires fresh explicit consent.

**Availability:** Always generated for selected OpenCode and Pi hosts.

**Activation:** Select local VCS and remote provider routes through
[CVS configuration](cvs.md). Optional MCP context is compiled only when its configured
declaration is available.

**Prerequisites:** Valid local repository context. Epic workspaces additionally require
`skills.cvs.workspaces: true`, local Git, a clean primary checkout, and committed canonical
Epic authority. Remote operations require the configured provider, repository,
authentication, and live capability evidence.

**Limits:** The skill does not configure remotes, install or authenticate provider tools,
expose credential values, infer commands, force-remove worktrees, delete retained workspace
branches, retry a mutation through another route, publish without request, or merge without
fresh consent.

**Status:** `working` for configured OpenCode and Pi routes; remote provider operation
remains separate evidence. Claude and Codex are `not implemented`.

**Evidence:** Source: the canonical
[`sdlc-cvs` template](../src/harnessctl/templates/skills/sdlc-cvs/SKILL.md.j2).
Automated test: provider rendering, credential boundaries, workspace state-engine and adapter
parity, remote routing, merge consent, and host-installation contract suites.

## Compatibility notes

Fresh installs generate only canonical IDs. Five legacy support IDs map to current names:
`caveman` to `sdlc-caveman`, `cvs` to `sdlc-cvs`, `develop-tdd` to
`sdlc-develop-tdd`, `issue-tracking` to `sdlc-issue-tracking`, and `memory` to
`sdlc-memory`. Existing `sdlc`, `sdlc-code`, and `sdlc-code-index` IDs are unchanged.

Legacy trees are preserved unless the operator explicitly requests the bounded replacement
workflow. The retired `sdlc-documents` output is not a current skill: Documents and Web
Retrieval are configuration domains compiled into SDLC behavior. See
[Documents configuration](documents.md) and
[Web Retrieval configuration](web-retrieval.md).
