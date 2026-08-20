---
id: "00009"
type: lld
title: "Simplified Epic-First SDLC Command Set Delta"
version: 1
status: review
parent: "00003"
opencode-agent: lead-engineer
---

# Simplified Epic-First SDLC Command Set Delta

## 1. Delta authority

This document defines only the change from 18 public SDLC commands to five public commands. The archived baseline `.specs-v1/00003-lld-harness-neutral-sdlc-prompt-templates-and-harness-installers-v2.md` remains the source for harness-neutral rendering, installation safety, and package-resource principles. The current `.specs/lld-00002-caveman-memory-hooks-across-sdlc-commands-v2.md` remains authoritative for normalized memory tools, repository YAML authority, cache behavior, schema limits, secret screening, provenance, compactness, and advisory-memory rules.

Where this delta conflicts with the current LLD on SDLC command names, command profiles, retrieval timing, or checkpoint frequency, this delta supersedes those command-integration details. It also supersedes the predecessor's prohibition on workflow-state persistence only for the compact, confirmed checkpoints defined here. A checkpoint persists no proposal: a next step is eligible only after the user confirms it, and completed state requires current authority. Existing reusable-memory eligibility and write policy remain authoritative for every non-checkpoint write. This delta does not redesign memory, Issues, CVS, MCP, host permissions, or their security boundaries.

## 2. Scope and outcome

The only public SDLC commands become:

| Command         | Responsibility                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `work-plan`     | Recognize or create the owning Epic, clarify and explore requirements, select proportionate design, decompose work, and obtain approval for one executable Epic plan. |
| `work-build`    | Select or resume ready Story, Task, or Bug work within one recognized Epic and implement bounded slices.                                                              |
| `work-verify`   | Verify one recognized Epic, discuss results, and maintain exactly one provider-discoverable, non-archived canonical Bug per distinct defect occurrence.               |
| `work-release`  | Complete mandatory branch, commit, push, and pull-request delivery, then optionally support explicitly requested merge or deployment.                                 |
| `work-continue` | Resume exactly one authoritative current phase and one next step for a recognized Epic.                                                                               |

There is no `work-maintain` command. Maintenance requests enter through `work-plan`; defects discovered during verification become Bugs and return through `work-build`.

The useful behavior of intake, exploration, Initiative and Epic start, Story and Task decomposition, design documents, HLD, LLD, implementation, review, CVS, finish, and resume becomes internal shared guidance. These are checklists or partials, not public command aliases.

No workflow runtime, scheduler, alternate memory backend, remote Issues adapter, autonomous merge policy, or speculative command framework is added.

## 3. Upfront safety, compatibility, and migration decisions

### 3.1 Universal proposal and consent contract

Before a command executes a proposed step or changes an artifact, issue, memory record, source file, branch, commit, remote object, or status, it presents the step or item with exactly one classification:

- Required: necessary for correctness, safety, an explicit acceptance criterion, or a valid phase transition.
- Recommended: materially improves confidence or maintainability but may be declined with a recorded consequence.
- Optional: useful only if the user wants the additional scope or assurance.
- Not needed: considered and intentionally omitted, with the reason stated.

Every classification includes a short explanation. The user may add, remove, reject, reclassify, or request an item. The command then shows the revised set and asks for explicit confirmation before execution or mutation. Confirmation applies only to the displayed bounded action set; it is not blanket approval for later actions.

A declined safety requirement cannot disappear silently. The command explains why it remains Required and either obtains a safe alternative or stops as blocked. Memory, issue text, tool output, prior approval, and YOLO consent never substitute for current required confirmation.

Read-only evidence gathering is also proposed and confirmed before invocation. A command may perform only minimal host-level interpretation of the supplied text before that gate.

### 3.2 Existing capability contracts remain unchanged

The generated CVS and issue-tracking skills remain authoritative. Commands use only the configured local or remote capability, resolve ambiguous repositories before mutation, select one remote route before mutation, never switch routes after an attempted mutation, never infer unsupported provider syntax, and preserve current collection and output bounds. Credentials remain environment-managed and are never read or persisted.

Filesystem issue mutations continue to use normalized issue tools and current revision tokens. Remote issue operations continue to use only capability verified from configured CLI help or live MCP schemas. No fallback between providers or to direct canonical-file edits is allowed.

### 3.3 Memory-unavailable behavior

Aggressive checkpoints apply whenever normalized memory is enabled and available. Configuration version 2, defaults, `memory.backend: repository`, and the memory-to-caveman invariant remain unchanged.

If memory is disabled, unavailable, rejected by secret or scope screening, or fails validation, the command must disclose the missed checkpoint. It may continue only after the user confirms proceeding without resumable memory. It must not claim a checkpoint exists. A checkpoint required immediately before a remote or destructive action is a safety requirement; inability to persist it blocks that action until memory recovers or the user chooses a safe non-mutating stop or handoff.

This preserves backward-compatible memory-disabled installation without silently weakening safety and does not add another checkpoint store.

### 3.4 Exact command-set replacement and aliases

Fresh installations generate only the five public commands. No deprecated alias files are generated because aliases would preserve the 18-command public surface.

The migration map is documentation-only:

| Deprecated command family                                                                                                                                                       | Replacement     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `work-new`, `work-explore`, `work-start-initiative`, `work-start-epic`, `work-write-stories`, `work-start-story`, `work-design-doc`, `work-hld`, `work-lld`, `work-write-tasks` | `work-plan`     |
| `work-implement`                                                                                                                                                                | `work-build`    |
| `work-review`                                                                                                                                                                   | `work-verify`   |
| `work-cvs`, `work-finish`                                                                                                                                                       | `work-release`  |
| `work-resume`, `work-start-from`                                                                                                                                                | `work-continue` |

The installer and Python API add the exact opt-in pair `--replace-sdlc-command-set` and `replace_sdlc_command_set=False`. The new set is plan, build, verify, release, and continue. The known legacy set is the current 18-command registry. Its plan and verify paths overlap the new set; the other 16 paths are retired.

Without the replacement flag, detecting any selected-harness legacy output fails before mutation and lists every detected path. Any of the 16 retired filenames is legacy. An overlapping plan or verify file is current only when it is byte-exact with the newly rendered output; otherwise it is a legacy or customized overlap and blocks. With the flag, the selected harness alone is migrated: `opencode` affects only `.opencode/commands`, `pi` affects only `.pi/prompts`, and `all` applies the same plan independently to both. The flag explicitly authorizes replacement of byte-different plan and verify overlaps and deletion of the 16 retired filenames in scope. It does not imply `--force` for unrelated files or customized build, release, or continue targets.

Preflight identifies all selected-harness legacy and new targets, rejects symlinks, directories, unreadable files, escapes, and internally conflicting targets, and completes rendering before mutation. It captures every write and deletion before-image. Writes and deletions share the existing transaction; any failure restores exact bytes and presence and removes only installer-created empty directories. Cross-platform deletion uses path operations rather than shell commands, including on Windows.

The replacement flag is the explicit destructive authorization after the CLI discloses all affected paths and that retired files may be customized. `--force` alone never deletes retired files. A mixed legacy/current tree is either fully prevalidated and replaced or left unchanged. Re-running replacement against an exact current five-command set is a no-op; byte-different current targets remain conflicts unless their replacement is explicitly covered above or separately authorized by `--force`. An unselected harness remains byte-for-byte untouched.

## 4. Epic recognition contract

Every command establishes exactly one owning Epic before phase work.

### 4.1 Accepted input resolution

`work-plan` accepts a natural-language prompt, Initiative ID, Epic ID, or a prompt mentioning either ID. The other four commands accept an Epic ID or input that resolves unambiguously to one Epic under the rules below. `work-verify` may also accept a prompt, but that prompt must resolve to an existing Epic before verification.

An Initiative input resolves to its attached Epics. An Epic input resolves directly. A Story, Task, or Bug input is followed through authoritative parent relationships to its owning Epic. A prompt mentioning multiple candidate Epics, broken hierarchy, missing parent, archived-only owner, or contradictory provider result is ambiguous and blocks mutation until the user chooses or repairs the authority.

### 4.2 Missing-Epic rule

For `work-build`, `work-verify`, `work-release`, and `work-continue`, absence of an authoritative Epic stops the command and redirects to `work-plan`. These commands do not create an Epic as a convenience. This is decision 1B.

### 4.3 Plan creation modes

For a new prompt, `work-plan` searches for relevant Initiative and Epic candidates through the configured issue authority, presents duplicates and boundaries, classifies the proposed entity action, and obtains confirmation before creation.

It may create either:

- one Epic; or
- one Initiative with multiple attached Epics.

Initiative mode first presents the Initiative boundary, proposed Epic set, scope separation, dependencies, and creation order. After confirmation it creates the Initiative and attached Epics through issue tools. It then recommends a separate `work-plan <epic-id>` invocation for each Epic and stops; it does not design or decompose several Epics in one run.

Epic mode recognizes or creates one Epic and continues into analysis, design selection, and decomposition for that Epic.

## 5. Shared internal workflow contract

### 5.1 Shared partial responsibilities

All five templates include shared guidance for:

- classification, explanation, revision, confirmation, and safety refusal;
- Epic resolution and owning-Epic validation;
- authoritative-source precedence and configured tool capability boundaries;
- checkpoint retrieval, validation, storage, supersession, and failure handling.

Command-specific internal checklists retain useful old behavior without exposing extra commands:

- Planning checklist: intake, clarification, exploration, dependency and risk review, estimate discussion, design-level choice, linked artifact handling, Story, Task, and Bug decomposition, verification requirements, and release requirements.
- Build checklist: readiness, dependency, changed-scope, implementation, testing, evidence, issue progress, and bounded YOLO rules.
- Verify checklist: acceptance mapping, quality checks, independent review perspectives, defect separation, Bug proposals, and release readiness.
- Release checklist: CVS prerequisites, branch, commit, push, pull request, merge, deployment, issue closure, rollback, and delivery evidence.

The partials state policy and interaction order. They do not add an orchestration engine or duplicate capability instructions owned by generated skills.

### 5.2 Output discipline

Each command reports the recognized Epic, current phase, authoritative evidence used, classified proposed items, confirmation requested or received, completed step, next permitted step, blockers, and checkpoint result. It never claims completion from memory alone.

## 6. Command behavior

### 6.1 `work-plan`

After Epic recognition, planning adaptively offers and classifies:

- requirement clarification;
- repository and artifact exploration;
- dependency, compatibility, migration, and risk analysis;
- estimates, including uncertainty and assumptions;
- design work;
- Story, Task, and pre-existing Bug decomposition;
- verification evidence and acceptance requirements;
- release, rollback, documentation, and operational requirements.

Ordering follows discovered dependencies rather than a fixed waterfall. For example, a blocking compatibility question may require exploration before clarification closes, while a small known change may need only lightweight decomposition.

The model recommends or asks the user to choose exactly one proportionate design level: none, lightweight, design document, HLD, LLD, HLD plus LLD, or GDD. The recommendation explains why stronger and weaker levels are Not needed, Optional, or insufficient. GDD remains reserved for game-domain work and follows existing domain skill boundaries.

Approved design artifacts are created through existing specification tooling and linked through issue tooling. The command does not duplicate document bodies into issue or memory records. Decomposition creates only user-confirmed Stories, Tasks, or Bugs, with explicit parentage, dependencies, acceptance criteria, and linked artifacts. Small Epics may have direct Tasks or Bugs when valid under the existing hierarchy; unnecessary Stories are marked Not needed.

The final output is one approved, executable Epic plan: recognized Epic, approved scope, selected design level and artifact paths, ordered ready work, dependencies, acceptance criteria, verification and release requirements, estimates with uncertainty, risks, and explicit non-goals. Approval is checkpointed. Implementation requires a later `work-build` invocation.

### 6.2 `work-build`

`work-build` accepts one recognized Epic. It reconciles issue state, linked plan and design artifacts, source state, Git state, tests, and the current checkpoint. If implementation already started, it offers to resume the exact unfinished slice in the same manner as `work-continue` rather than selecting duplicate work.

Otherwise it presents these choices, as applicable:

- select the next unfinished ready Story, Task, or Bug;
- resume a user-selected ready item;
- ask the user which part of the Epic to implement;
- enter explicit YOLO mode.

Readiness requires approved scope, satisfied dependencies, sufficient design, unambiguous ownership, and no unresolved safety blocker. Selection does not silently mark an issue in progress; that status mutation is separately confirmed.

YOLO is one-time, Epic-scoped, bounded consent. The confirmation identifies the eligible item set and permits continuous selection and implementation of ready slices only. It ends at the first blocker, scope change, verification boundary, user stop, ambiguous result, or exhausted ready work. It never authorizes remote or destructive actions, issue closure, merge, deployment, safety-requirement removal, or work outside the confirmed Epic. A compact checkpoint is required after every slice before another slice begins.

Each implementation slice has a stated item, bounded objective, expected files or component boundary, tests, and stop condition. Scope expansion returns to user confirmation. Detailed Tasks and Stories close only after current evidence maps their acceptance criteria to completed work and the user confirms the status transition. Epic closure is not a Build responsibility.

The command stops at a verification boundary and recommends `work-verify`; it does not enter verification within the same invocation.

### 6.3 `work-verify`

`work-verify` accepts a prompt or Epic input, resolves the recognized Epic, confirms the verification set, and evaluates relevant acceptance, tests, integration, formatting, lint, typing, security, privacy, dependencies, configuration, duplication, dead code, changed scope, documentation, operational, and release checks. Not-applicable checks are explicitly classified Not needed with reasons.

Failures are grouped by distinct defect occurrence, not by failed command line or repeated symptom. An occurrence is one unresolved manifestation of a defect; a regression after verified resolution is a new occurrence. The command discusses evidence, impact, uncertainty, and multiple actions with the user, such as repair now, defer with accepted risk, narrow scope, gather more evidence, or stop. It never creates a Bug from an unconfirmed interpretation.

For each distinct defect occurrence, Verify searches all provider-discoverable, non-archived Bugs owned by the recognized Epic, regardless of status, and compares defect identity, affected behavior, evidence, scope, occurrence timing, and known resolution history. A matching open or in-progress Bug is reused and, after confirmation, updated or commented with new evidence. This enforces decision 2A as exactly one non-archived canonical Bug per distinct defect occurrence among provider-discoverable issues, with at most one open or in-progress Bug for that occurrence.

If a matching done or closed, non-archived Bug represents the same still-unresolved occurrence, Verify stops before creation and asks whether to transition or reopen it only when the configured provider and selected tool expose that capability. The mutation requires confirmation and current evidence. If the capability is unavailable, Verify returns blocked and offers the user the separate path of establishing and confirming a regression or new occurrence; it never silently duplicates the unresolved occurrence.

Archived Bug history is outside automated deduplication because the existing normalized tools cannot enumerate or unarchive it. Verify never requires an archived search or restoration. If the user supplies a known prior archived Bug ID and the configured exact-get capability can read it, Verify may use it only as historical reference; it never restores or mutates that archived Bug.

If current evidence proves a prior occurrence was resolved and the defect later regressed or occurred anew, Verify treats that as a new occurrence and may propose one new Bug. Creation requires confirmation. The new regression Bug references the prior Bug ID in its body and, when applicable, existing supported document links only. It does not add or invent an issue relationship type for the prior-Bug reference.

Each occurrence Bug is parented to the recognized Epic. When useful, it adds an optional supported `relates_to` relationship to the affected Story or Task; the relationship never replaces the Epic parent. The proposal includes title, observed behavior, expected behavior, occurrence evidence, prior resolution or regression evidence when applicable, severity or priority if supported by the configured provider, acceptance criteria, and matching provider-discoverable candidates. Creation, transition, reopen, update, comment, and relationship mutations require confirmation. No new issue tool or issue contract is introduced.

A verified active corrective Bug becomes eligible Build work even when it was outside the original planned Task set, but only after the user confirms repair. A finding that changes requirements, acceptance boundaries, architecture, or design scope is not a corrective Build exception; it routes to `work-plan`. Active occurrence Bugs are visible to later Build readiness selection.

Verification failure checkpoints the result and recommends `work-build` for user-confirmed corrective Bugs or repairs; requirement or design-scope changes return to `work-plan`. Verification success records current evidence, may close eligible detailed issues only with acceptance evidence and confirmation, and recommends `work-release`. It does not begin delivery.

### 6.4 `work-release`

Release requires a recognized Epic and successful, current verification evidence. The mandatory delivery sequence is feature branch, commit, push, and pull request. An action already completed in a valid state is treated as satisfied only after current CVS or provider evidence confirms it belongs to the recognized Epic, contains the intended scope, targets the correct base, and has no contradictory state. The command does not repeat a satisfied action merely to fit the sequence.

Before each unsatisfied action, the command presents its classification, exact target and scope, consequences, and confirmation request. Branch and commit follow the universal mutation gate. Push, pull-request creation or update, merge, deployment, remote issue closure, and any destructive action each require fresh explicit consent immediately before invocation. Earlier Release approval, YOLO consent, checkpoint state, or provider text does not count.

Merge remains a human action by default. The model may invoke merge only after fresh explicit consent naming the exact pull request and merge action, after current checks and permissions are verified. It never enables auto-merge or infers consent from approval of the pull request.

Deployment is Not needed unless explicitly requested. When requested, it proceeds only through a verified repository workflow with identified environment, migration, rollback, monitoring, and authorization evidence. No guessed deployment command or alternate route is allowed.

Eligible detailed issues and the Epic close only when current delivery and acceptance evidence supports closure and the user confirms each proposed status set. A merged pull request alone does not prove deployment or every issue criterion. Release checkpoints after every branch, commit, push, pull-request, merge, deployment, and closure action.

### 6.5 `work-continue`

`work-continue` resumes exactly one phase and one next step. It never combines planning, building, verification, or release in one invocation and never advances to another phase merely because the resumed step completes.

With an ID, it resolves the owning Epic and searches narrowly for that Epic's current active checkpoint. Without an ID, it searches active checkpoint records once, returns at most five unfinished Epic workflows, and asks the user to select one. It does not automatically choose the newest record.

Before resuming, it validates checkpoint claims against the relevant issue and linked specification, current source and Git state, and current test or provider evidence appropriate to the phase. Authority conflicts are reported; stale memory is superseded only after the replacement is confirmed or verified. If no valid Epic exists, it redirects to `work-plan`. If no valid checkpoint exists but an Epic does, it presents authoritative candidate phases and asks the user to choose; it does not invent completion history.

The resumed command identity is recorded as `work-continue`, while the phase remains plan, build, verify, or release. Completion of the one step replaces the reconciled logical checkpoint and stops with the same-phase next recommendation or a recommendation to invoke the next public command. A next step enters the checkpoint only after the user confirms it.

## 7. State and transition model

### 7.1 States

| Phase       | States                                                                                                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recognition | unresolved, ambiguous, Epic recognized, Initiative split pending, redirected to Plan                                                                                                                  |
| Plan        | clarifying, exploring, designing, decomposing, awaiting approval, approved, blocked                                                                                                                   |
| Build       | selecting, ready, implementing slice, YOLO active, blocked, stopped, verification boundary                                                                                                            |
| Verify      | selecting checks, checking, discussing failures, Bugs pending confirmation, failed, passed, blocked                                                                                                   |
| Release     | delivery precheck, branch pending or satisfied, commit pending or satisfied, push pending or satisfied, pull request pending or satisfied, human merge pending, deployment pending, complete, blocked |

### 7.2 Allowed transitions

- New request to `work-plan`; Initiative mode ends after confirmed Initiative and Epic creation.
- Epic Plan moves among analysis activities adaptively, then from awaiting approval to approved only by explicit user approval.
- Approved Plan recommends Build.
- Build selects or resumes one ready item, implements slices, and either remains in Build, stops blocked, or reaches a verification boundary.
- Verify failure reuses or creates canonical confirmed Bugs and recommends Build for corrective work; requirement or design-scope change returns to Plan. Verify pass recommends Release.
- Release advances through mandatory delivery actions, accepting current valid evidence for already-satisfied actions, then stops at human merge by default or completes an explicitly authorized merge or deployment.
- Continue re-enters exactly one stored phase and one step; it cannot itself transition into another phase.

Any missing Epic, invalid dependency, unsupported capability, authority conflict, declined Required safety item, failed checkpoint at a remote/destructive boundary, ambiguous mutation result, or scope change produces a blocked or stopped state with no silent transition.

## 8. Checkpoint contract

### 8.1 Frequency

When memory is enabled and available, a checkpoint is written after every confirmed step, artifact creation or revision, issue status change, implementation slice, test batch, phase transition, blocker, user stop, handoff, and delivery action. Several unrelated events are not collapsed into one vague summary. A mutation result is verified before being checkpointed as complete.

### 8.2 Logical current-checkpoint rule

The workflow targets one logical current checkpoint by the configured topic and exact Epic ID; it does not claim database uniqueness or atomic compare-and-swap behavior. One checkpoint record is one episodic workflow-state item containing compact IDs, state, and authoritative pointers. It is not a collection of copied plan, issue, test, or delivery bodies and is not a general multi-item memory summary.

Checkpoint discovery uses existing `memory_search`. The first known checkpoint uses `memory_store`; replacement of one validated current record uses `memory_supersede`. `memory_delete` creates tombstones for confirmed stale duplicate records during reconciliation. No backend, schema, cache interface, or normalized tool is added.

An interruption or concurrent session may leave multiple active checkpoint records. A later phase entry or Continue must detect this condition, fail visibly, validate every candidate against issue, specification, source, Git, and test authority, and ask for confirmation of the reconciled state. It then supersedes the selected logical current record and tombstones confirmed stale records. It must not choose by timestamp or continue while duplicates remain unresolved. Failure partway through reconciliation remains visible and requires the next resume to repeat authority validation.

### 8.3 Compact checkpoint content

The summary identifies the Epic ID, phase, active item, and completed step within the current mutation compactness limit. Details use concise labeled lines only when values exist:

| Field             | Meaning                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Epic              | Exact recognized Epic ID.                                                                                                   |
| Command and phase | Public command plus plan, build, verify, or release phase.                                                                  |
| Active item       | Story, Task, Bug, artifact, check batch, branch, commit, pull request, or delivery target.                                  |
| Completed step    | Confirmed or verified result only.                                                                                          |
| Next step         | User-confirmed intended next step only, clearly not claimed complete. An unconfirmed recommendation or proposal is omitted. |
| Decisions         | Confirmed decisions and accepted consequences.                                                                              |
| Blockers          | Current blockers, uncertainty, and required resolution.                                                                     |
| Artifacts         | Authoritative issue, task, specification, report, or source paths; no copied bodies.                                        |
| Delivery          | Branch, commit, and pull-request identifiers when verified.                                                                 |
| Verification      | Current pass, fail, partial, or not-run status with authoritative reference.                                                |

Source kind, source reference, source revision, confidence, tags, and namespace retain the existing normalized contract. A checkpoint stores no proposed plan, candidate action, unconfirmed next step, or inferred completion. Caveman style removes transcript narration and repetition while preserving IDs, paths, qualifiers, errors, evidence, and uncertainty. Secret values, raw logs, diffs, artifact bodies, user transcripts, and chain-of-thought are prohibited. Existing reusable-memory policy remains unchanged for all other stores, supersessions, imports, and deletions.

## 9. Issue and artifact interactions

- Discovery uses bounded issue listing or provider search, then exact reads. Similar Initiative and Epic candidates are shown before creation.
- Filesystem creation uses `issue_create`; revision-sensitive updates and transitions use a fresh `issue_get` revision. Relationships and document links use their normalized tools.
- Remote hierarchy and issue-type behavior is used only when the selected capability proves support. Otherwise the command presents the provider-supported representation and asks the user, or stops if the Epic contract cannot be represented safely.
- Epic ownership is authoritative from issue hierarchy, not memory or prompt wording.
- Stories, Tasks, and Bugs are created only after item-level confirmation. Dependencies use supported issue relationships. Verify searches all provider-discoverable, non-archived Epic Bugs regardless of status; reuses a matching open or in-progress Bug; and asks to transition or reopen a matching done or closed Bug only through an existing supported capability. Archived Bugs are neither enumerated nor restored. A user-supplied archived ID may be exact-read only as history when supported. Regression Bugs reference prior IDs in body or existing document links, never through a new issue relationship type. No normalized issue tool contract changes.
- Progress comments remain compact and point to artifacts and evidence. They do not duplicate checkpoints or reports.
- Design artifacts use current specification creation conventions and are linked with `issue_link_document`. Existing approved artifacts are reused after relevance and revision checks.
- Status changes require acceptance evidence and confirmation. Detailed issue closure may occur in Build, Verify, or Release at the phase that obtains sufficient evidence; Epic closure belongs to Release.

## 10. Rendering, installer, and configuration delta

### 10.1 Registry and generated paths

`src/harnessctl/templates.py` contains exactly five command registry entries and matching descriptions and metadata. Complete registry-to-metadata validation remains fail-closed.

OpenCode installation generates exactly:

- `.opencode/commands/work-plan.md`
- `.opencode/commands/work-build.md`
- `.opencode/commands/work-verify.md`
- `.opencode/commands/work-release.md`
- `.opencode/commands/work-continue.md`

Pi installation generates exactly:

- `.pi/prompts/work-plan.md`
- `.pi/prompts/work-build.md`
- `.pi/prompts/work-verify.md`
- `.pi/prompts/work-release.md`
- `.pi/prompts/work-continue.md`

Host skill, plugin, package, MCP, conflict-first planning, consent-gated Pi package installation, atomic writes, smoke checks, and rollback behavior remain as currently implemented.

### 10.2 Configuration

No new configuration key or version is required. Existing Issues, CVS, MCP output, paths, communication, and memory settings retain their meaning. Memory-disabled rendering still compiles memory operations out, but the command includes the explicit unavailable-checkpoint disclosure and safety stop behavior that does not name unavailable tools.

The API parameter `replace_sdlc_command_set` and CLI flag `--replace-sdlc-command-set` are migration consent mechanisms, not persistent workflow configuration. Both default to false. There is no command alias configuration and no maintain-mode setting.

### 10.3 Python distribution and release impact

This breaking change is scoped to the static Python `harnessctl` installer and packaged templates. `pyproject.toml` moves from version 0.1.0 to 0.2.0, `uv.lock` is refreshed, and a root `CHANGELOG.md` records the five-command set, explicit replacement flag, migration behavior, and absence of aliases.

The Python package continues to include all active templates, partials, and command-set migration metadata in wheel and source distribution. Isolated artifact tests verify exactly five public templates, the legacy and current set metadata, CLI flag, API default, OpenCode and Pi rendering and replacement behavior, version 0.2.0 metadata, and exclusion of protected generated output.

Linux CI builds both wheel and source distribution after quality checks and uploads them together as the named artifact `harnessctl-python-0.2.0-linux-ci`. This is an operator/source distribution artifact, not publication to PyPI or another registry. Registry publication remains separate explicit operator work.

The repository's Changesets workflow is npm-only. No npm package, npm changelog, Changeset, or Node package version changes for this prompt and Python-installer delta unless implementation actually changes npm code. No new runtime dependency is introduced.

## 11. Errors and consent boundaries

The five commands use these stable error categories in user-facing language:

- Epic missing: stop and direct to `work-plan`.
- Epic ambiguous: list bounded candidates and ask the user to select or repair hierarchy.
- Required authority unavailable: stop; never infer current issue, source, CVS, or verification state from memory.
- Unsupported provider capability: stop or offer a non-mutating documented alternative; never switch provider.
- Confirmation absent or rejected: make no proposed mutation and retain the last authoritative state.
- Scope change: stop the active slice or phase and return the delta for confirmation; YOLO ends.
- Mutation failure or ambiguity: do not retry through another route; report the exact result and checkpoint only what can be verified.
- Checkpoint failure: disclose it; block remote or destructive action and otherwise ask whether to continue without resumable memory.
- Stale or duplicate checkpoint: fail visibly, reconcile every candidate against authority, then supersede and tombstone only confirmed stale records; unresolved duplicates block resume.
- Verification defect duplication: search all provider-discoverable non-archived Epic Bugs regardless of status, reuse the matching open or in-progress Bug, and block on a matching done or closed occurrence until a supported confirmed transition or a confirmed regression/new occurrence is chosen.
- Archived Bug reference: never enumerate, unarchive, or restore archived Bugs. A user-supplied archived ID may be exact-read as history only when supported; failure or unavailable capability is reported without widening the search.
- Requirement or design-scope finding: stop corrective Build routing and return to Plan.
- Deprecated generated commands detected: without `--replace-sdlc-command-set`, stop before writes and list selected-harness paths.
- Command-set replacement failure: restore exact selected-harness before-images and remove only transaction-created empty directories; never mutate an unselected harness.

Remote and destructive actions never share blanket consent. Push, pull-request mutation, merge, deployment, remote issue closure, deletion, history rewrite, and cleanup each require fresh action-specific confirmation. YOLO never reaches these actions.

## 12. Expected changed files

### 12.1 Registry and installer

- `src/harnessctl/templates.py`
- `src/harnessctl/install.py`
- `pyproject.toml`
- `uv.lock`
- `mise.toml`
- `.github/workflows/ci.quality.yml`
- `CHANGELOG.md`

### 12.2 Active command templates

- `src/harnessctl/templates/sdlc/work-plan.md.j2`
- `src/harnessctl/templates/sdlc/work-build.md.j2`
- `src/harnessctl/templates/sdlc/work-verify.md.j2`
- `src/harnessctl/templates/sdlc/work-release.md.j2`
- `src/harnessctl/templates/sdlc/work-continue.md.j2`

### 12.3 Shared partials and internal checklists

- `src/harnessctl/templates/sdlc/_partials/governance.md.j2`
- `src/harnessctl/templates/sdlc/_partials/epic-context.md.j2`
- `src/harnessctl/templates/sdlc/_partials/memory-entry.md.j2`
- `src/harnessctl/templates/sdlc/_partials/memory-exit.md.j2`
- `src/harnessctl/templates/sdlc/_partials/checkpoint.md.j2`
- `src/harnessctl/templates/sdlc/_partials/plan-checklist.md.j2`
- `src/harnessctl/templates/sdlc/_partials/build-checklist.md.j2`
- `src/harnessctl/templates/sdlc/_partials/verify-checklist.md.j2`
- `src/harnessctl/templates/sdlc/_partials/release-checklist.md.j2`

### 12.4 Deleted public templates

- `src/harnessctl/templates/sdlc/work-new.md.j2`
- `src/harnessctl/templates/sdlc/work-explore.md.j2`
- `src/harnessctl/templates/sdlc/work-resume.md.j2`
- `src/harnessctl/templates/sdlc/work-start-initiative.md.j2`
- `src/harnessctl/templates/sdlc/work-start-epic.md.j2`
- `src/harnessctl/templates/sdlc/work-start-from.md.j2`
- `src/harnessctl/templates/sdlc/work-write-stories.md.j2`
- `src/harnessctl/templates/sdlc/work-start-story.md.j2`
- `src/harnessctl/templates/sdlc/work-design-doc.md.j2`
- `src/harnessctl/templates/sdlc/work-hld.md.j2`
- `src/harnessctl/templates/sdlc/work-lld.md.j2`
- `src/harnessctl/templates/sdlc/work-write-tasks.md.j2`
- `src/harnessctl/templates/sdlc/work-implement.md.j2`
- `src/harnessctl/templates/sdlc/work-review.md.j2`
- `src/harnessctl/templates/sdlc/work-cvs.md.j2`
- `src/harnessctl/templates/sdlc/work-finish.md.j2`

### 12.5 Tests and documentation

- `tests/test_install.py`
- `tests/test_release_artifacts.py`
- `tests/test_docs.py`
- `README.md`
- `FLOWS.md`
- `docs/sdlc.md`
- `docs/skills.md`
- `docs/memory.md`
- `docs/cvs.md`
- `docs/configuration.md`

No generic memory, issue, CVS, schema, contract, adapter, or cache source file is expected to change. Discovery of such a need is a scope change requiring design review.

## 13. Test strategy

### 13.1 Render and contract tests

- Registry, descriptions, and metadata contain exactly the five public commands.
- All five commands render for OpenCode and Pi with valid host wrappers and no unresolved Jinja.
- Shared governance, Epic recognition, capability authority, and phase-boundary guidance appear exactly once per command.
- Memory-disabled output contains no normalized memory tool name or dangling memory heading, yet clearly discloses that resumable checkpoints are unavailable when relevant.
- Memory-enabled output contains bounded retrieval, one logical current-checkpoint target, duplicate detection and reconciliation, authority precedence, caveman compactness, no proposals, confirmed-next-step gating, secret exclusions, and every required checkpoint trigger.
- No deleted command is renderable or packaged as a public template.
- Prompt assertions cover all four classifications, explanation, user revision rights, confirmation before reads or mutation, and non-skippable safety behavior.

### 13.2 Epic and command scenario tests

- Plan handles prompt, Initiative ID, Epic ID, and prompts mentioning either; duplicate and ambiguous matches block creation.
- New prompt can create one Epic or one Initiative with confirmed attached Epics. Initiative mode stops and recommends one Plan invocation per Epic.
- Story, Task, and Bug inputs resolve the owning Epic; broken or multiple ownership blocks.
- Build, Verify, Release, and Continue redirect to Plan when no Epic exists.
- Plan adaptively classifies every offered activity and supports each design level, including justified none and HLD plus LLD choices.
- Build selects only ready unfinished items, resumes started work, stops at verification, and closes detailed issues only with evidence and confirmation.
- YOLO requires one-time bounded consent, checkpoints every slice, and stops on each specified boundary without remote or destructive action.
- Verify separates defect occurrences, searches every provider-discoverable non-archived Epic Bug regardless of status, reuses a matching open or in-progress Bug, and maintains exactly one non-archived canonical Bug per occurrence.
- A matching done or closed Bug for the same unresolved occurrence blocks duplicate creation and permits transition or reopen only when the configured provider and selected tool support it; otherwise Verify returns blocked and offers confirmation of a regression/new occurrence.
- Tests prove archived Bugs are not enumerated, unarchived, restored, or required for deduplication. A user-supplied archived ID is exact-read only when supported and is used only as history.
- Verified regression or new-occurrence evidence permits one confirmed new Bug whose body or existing document links reference the prior Bug ID; tests reject prior-Bug issue relations, invented relationship types, and new issue-tool requirements.
- User-confirmed corrective Bugs may enter Build outside the original Task set; requirement or design-scope changes route to Plan.
- Verify pass recommends Release and does not invoke it.
- Release accepts valid existing branch, commit, push, or pull-request evidence as satisfied; otherwise confirms and performs the mandatory sequence.
- Each remote or destructive Release action requires fresh consent. Merge defaults to human-only. Deployment occurs only after explicit request and verified workflow.
- Continue with no ID returns no more than five unfinished candidates, waits for selection, validates authority, resumes one step in one phase, checkpoints, and stops.
- Checkpoint scenarios prove unconfirmed proposals and next steps are omitted, each record is one compact episodic state item, non-checkpoint writes retain predecessor eligibility, and interrupted duplicate records block until authority-backed reconciliation and tombstones complete.

### 13.3 Installer and migration tests

- Clean OpenCode, Pi, and all-harness installs produce exactly five command files per selected harness while retaining current skills, tools, MCP configuration, and package behavior.
- The CLI exposes `--replace-sdlc-command-set`; the API exposes `replace_sdlc_command_set=False`.
- Without the flag, any selected-harness retired path or byte-different plan or verify overlap fails before mutation and lists every path; `--force` does not bypass or delete it.
- With the flag, only the selected harness replaces overlapping plan and verify and deletes the 16 retired paths. `all` applies both harness plans in the existing transaction.
- Fresh, full legacy, mixed legacy/current, customized retired, exact current, selected-harness, all-harness, Windows path deletion, injected rollback, and repeated replacement scenarios have explicit coverage.
- Customized unrelated current targets remain conflicts; unselected harnesses and unrelated host configuration remain byte-exact.
- Prevalidation precedes mutation; all before-images restore exactly after failure; only installer-created empty directories are removed.
- Exact current five-command output makes repeated replacement a no-op. Renderer snapshots and installed output freshness are byte-exact for both hosts.

### 13.4 Package, docs, and quality tests

- Wheel and source distribution report version 0.2.0, contain exactly the five public templates, all referenced partials, and migration metadata, and omit deleted public templates and protected generated project output.
- Isolated wheel and source-distribution checks exercise the CLI replacement flag, API default, OpenCode and Pi byte-exact rendering, and selected-harness migration.
- Linux CI uploads wheel and source distribution as `harnessctl-python-0.2.0-linux-ci`; no test or documentation claims PyPI publication.
- Root Python changelog documents the breaking migration. npm package files, Changesets, and npm changelogs remain unchanged unless npm code changes.
- Documentation transition graph and accessible table cover exactly five commands, their gates, repair loop, Continue behavior, and terminal outcomes.
- Documentation consistently says five, contains the migration map, and contains no claim that old aliases remain installed.
- Existing Python, TypeScript, lint, format, duplication, audit, build, generated-contract, integration, and release-artifact quality gates pass without weakening exclusions.

## 14. Ordered implementation plan

Each subtask is limited to one to three files or one cohesive template group and depends on preceding contracts.

1. Update `src/harnessctl/templates.py` and focused registry assertions in `tests/test_install.py` to define exactly five commands, descriptions, phase metadata, and deleted-name rejection.
2. Add `governance.md.j2`, `epic-context.md.j2`, and `checkpoint.md.j2`; update render tests for universal classification, confirmation, Epic resolution, authority, memory-enabled checkpoints, and memory-disabled disclosure.
3. Revise `memory-entry.md.j2` and `memory-exit.md.j2` to target one logical Epic checkpoint with existing search, store, supersede, and delete tools; prohibit proposals, gate next step on confirmation, and test visible duplicate reconciliation while preserving every other memory contract.
4. Add `plan-checklist.md.j2` and rewrite `work-plan.md.j2`; test prompt, Initiative, Epic, child-item resolution, entity creation choices, adaptive ordering, design levels, decomposition, artifact links, and approved-plan boundary.
5. Add `build-checklist.md.j2` and `work-build.md.j2`; test readiness, started-work resume, bounded slices, YOLO limits, checkpoint frequency, scope changes, evidence, and detailed issue closure gates.
6. Add `verify-checklist.md.j2` and rewrite `work-verify.md.j2`; test all-status provider-discoverable non-archived Bug search; open or in-progress reuse; supported done or closed transition; unsupported-transition blocking and regression option; user-supplied archived-ID historical exact-get only; regression body or document reference; unchanged issue tools; corrective Build eligibility; Plan routing; and success routing.
7. Add `release-checklist.md.j2` and `work-release.md.j2`; test satisfied-action evidence, mandatory delivery sequence, action-specific consent, human-default merge, explicit deployment, rollback concerns, and closure gates.
8. Add `work-continue.md.j2`; test bounded candidate discovery, user selection, authority reconciliation, stale-record supersession, same-phase one-step resume, and missing-Epic redirect.
9. Delete the 16 obsolete public templates only after all five replacements and shared checklists pass render tests. Assert no old registry, include, description, or packaged resource remains.
10. Update `src/harnessctl/install.py` and installer tests for `replace_sdlc_command_set=False`, `--replace-sdlc-command-set`, exact legacy/new metadata, selected-harness replacement, five-target smoke checks, preflight, byte-exact rollback, Windows-safe deletion, idempotence, and unchanged skill, package, MCP, and force contracts.
11. Bump `pyproject.toml` and `uv.lock` to Python package 0.2.0; add root `CHANGELOG.md` with the breaking command-set and operator migration note.
12. Update `tests/test_release_artifacts.py` for isolated wheel and source-distribution verification of the five-command resources, migration metadata, CLI and API contract, both harnesses, version, and protected-output exclusions.
13. Add a persistent Python distribution task in `mise.toml`; update `.github/workflows/ci.quality.yml` to build wheel and source distribution on Linux and upload `harnessctl-python-0.2.0-linux-ci` without registry publication.
14. Rewrite `docs/sdlc.md` and `tests/test_docs.py` for the five-command authoritative transition graph, accessible edge table, and template-drift guard.
15. Update `README.md`, `FLOWS.md`, and `docs/skills.md` for the public vocabulary, Epic-first lifecycle, internalized behaviors, and absence of aliases or Maintain.
16. Update `docs/memory.md`, `docs/cvs.md`, and `docs/configuration.md` only for five-command counts, checkpoint compatibility, exact replacement flag, and unchanged underlying capability contracts.
17. Run release-artifact verification and the full repository quality workflow. Inspect changed paths and packaged members; do not regenerate or modify project-root generated commands, canonical issues, canonical memory, npm versions, or Changesets as a side effect of tests.

## 15. Acceptance criteria

1. Exactly five public commands are registered, rendered, installed, documented, and packaged for both hosts.
2. No Maintain command or deprecated command alias is generated.
3. Every proposed item uses one of Required, Recommended, Optional, or Not needed, explains why, supports user revision, and receives confirmation before execution or mutation.
4. A safety requirement cannot be silently removed, including checkpoint safety before remote or destructive actions.
5. Every command recognizes one authoritative Epic before phase work; non-Plan commands without one stop and redirect to Plan.
6. Plan supports prompt, Initiative, Epic, and child-item resolution; confirmed new work creates either one Epic or one Initiative with attached Epics.
7. Initiative mode stops after decomposition and recommends a separate Plan invocation for every Epic; Epic mode produces one approved executable Epic plan.
8. Plan adaptively offers all required analysis, design, decomposition, verification, and release concerns and supports all seven stated design levels.
9. Build selects or resumes only ready unfinished Epic work, supports bounded one-time YOLO, checkpoints every slice, and stops at verification or another defined boundary.
10. Verify discusses failures and options, searches all provider-discoverable non-archived Epic Bugs regardless of status, and maintains exactly one non-archived canonical Epic-parent Bug per distinct defect occurrence.
11. A matching open or in-progress Bug is reused. A matching done or closed Bug is not duplicated; Verify asks for transition or reopen only when the configured provider and selected tool support it, otherwise returns blocked and offers a confirmed regression/new-occurrence path.
12. Archived Bugs are outside automated deduplication: Verify never enumerates, unarchives, or restores them. A user-supplied known archived ID may be exact-read only when supported and used only as historical reference.
13. Evidence of verified prior resolution followed by regression or a new occurrence permits one confirmed new Bug that references the prior Bug ID only in its body or existing document links, with no invented relationship type or new issue-tool contract.
14. Requirement, acceptance-boundary, architecture, or design-scope findings return to Plan rather than entering Build as corrective Bugs.
15. Successful Verify recommends Release without entering it.
16. Release requires valid branch, commit, push, and pull request evidence; each unsatisfied action is performed only after its required consent.
17. Merge is human by default and model-invoked only with fresh explicit consent. Deployment requires explicit request and a verified workflow.
18. Detailed issue and Epic closure requires current evidence and explicit confirmation.
19. Continue finds at most five candidates without an ID, waits for selection, validates authority, and resumes exactly one step in one phase.
20. Enabled memory targets one logical compact episodic checkpoint per topic and Epic, stores no proposal, stores next step only after user confirmation, and uses existing search, store, supersede, and delete tools.
21. Duplicate active checkpoints are possible after interruption; the next entry fails visibly, validates authority, and reconciles or tombstones stale records before resuming.
22. Memory remains advisory; issues, specifications, source, Git, tests, reports, approvals, and current provider observations remain authoritative. Existing reusable-memory policy governs every non-checkpoint write.
23. Memory-disabled or failed checkpoint behavior is disclosed, never falsely claimed, and blocks unsafe remote or destructive continuation.
24. Existing normalized memory, issue, CVS, MCP, configuration, cache, compactness, secret-screening, and provider capability contracts remain unchanged.
25. `--replace-sdlc-command-set` and `replace_sdlc_command_set=False` implement selected-harness replacement of legacy plan and verify plus deletion of 16 retired files; without opt-in, retired output blocks mutation.
26. Replacement is fully prevalidated, captures all before-images, restores exact bytes and presence on failure, removes only installer-created empty directories, and is idempotent on exact current output.
27. Python package version is 0.2.0 with root release notes; Linux CI uploads named wheel and source-distribution artifacts without claiming registry publication.
28. npm package versions, npm changelogs, and Changesets remain unchanged unless npm implementation changes.
29. Full quality and isolated wheel/source-distribution tests pass, and tests do not mutate protected generated outputs or canonical project records.

## 16. Risks and mitigations

- Five commands may become oversized. Shared partials and phase-specific checklists keep policy single-sourced while each command includes only relevant guidance.
- Epic-first routing may frustrate small fixes. Plan can create one lightweight Epic with design marked none or lightweight; hierarchy is retained without forcing unnecessary Stories or documents.
- Mandatory checkpoint frequency may create memory churn. One logical topic-and-Epic target, compact episodic state, artifact pointers, supersession, and no transcripts keep active context bounded while preserving immutable history.
- Interrupted checkpoint replacement may leave duplicates. Every entry detects multiple active records, fails visibly, validates authority, and reconciles with supersession and tombstones before work resumes; no atomic uniqueness is claimed.
- Checkpoints may launder stale claims. Every Continue and phase entry reconciles memory with issue, specification, source, Git, test, and provider authority before action.
- YOLO may be mistaken for general autonomy. Its one-time Epic and slice boundary, prohibited remote/destructive actions, checkpoint-after-slice rule, and explicit stop conditions make the limit visible and testable.
- Defect counts may inflate because archived history is not discoverable. Verify deduplicates across all provider-discoverable non-archived statuses, blocks unsupported reopen cases, uses user-supplied archived IDs only as optional history, and permits a new Bug only for a confirmed regression/new occurrence with body or document prior-ID reference.
- Removing old commands may delete custom files. Upgrade stops first, lists every path, separates deletion from force, discloses ownership uncertainty, and requires explicit migration consent with rollback.
- Release wording may imply automatic merge or deployment. Human-default merge and explicit per-action consent are stated in both shared governance and Release-specific tests.
- Prompt rules are not a security boundary. Existing host permissions, skills, provider authorization, and human review remain required.
