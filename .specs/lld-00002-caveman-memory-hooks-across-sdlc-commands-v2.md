---
id: "00002"
type: lld
title: "Caveman Memory Hooks Across SDLC Commands"
version: 2
status: review
parent: "00002"
opencode-agent: lead-engineer
---

# Caveman Memory Hooks Across SDLC Commands

## Status and design authority

This LLD extends LLD 00002 only for SDLC command integration, caveman persistence policy, installation, and validation. LLD 00002 remains authoritative for repository-memory storage, security, normalized tools, and cache behavior.

Issues, specifications, task artifacts, source, tests, verification reports, and current tool observations remain authoritative. Memory is advisory discovery context. A conflict must be resolved from authoritative evidence; stale memory may then be superseded with explicit provenance.

The current root-generated commands, generated OpenCode skills/plugin files, and `.harnessctl/memory/decisions/01M018T459JNQQ0ZA0X3CW2TZH.yaml` are protected working outputs. Implementation and tests must not regenerate, overwrite, normalize, delete, or supersede them. Installer tests use temporary projects.

## Goals

- Compile optional memory guidance into all 18 canonical SDLC Jinja command templates.
- Give the eight highest-value phase entries one bounded, narrow retrieval opportunity.
- Compile every memory reference out when memory is disabled or unavailable for the selected harness.
- Allow only the compiled memory operations to override a command's theoretical no-tool wording.
- Prevent memory from becoming evidence, authority, or a source of unverified completion claims.
- Require caveman style at store, supersede, and record-import mutation boundaries without tightening the persisted version 1 record contract.
- Keep shared policy in Jinja partials and command metadata rather than duplicating prose.
- Keep Pi command output memory-free until automatic Pi extension and skill registration is verified.

## Non-goals

- Changing canonical memory storage, search ranking, cache behavior, normalized tool names, or secret screening.
- Making SDLC commands execute implementation, verification, issue, design, CVS, or deployment work.
- Treating retrieved memory as confirmation.
- Automatically persisting each phase result.
- Perfect machine detection of concise grammar or technical meaning.
- Registering Pi memory distribution in this change.
- Tightening the version 1 canonical record limits or retroactively rejecting, rewriting, or compacting existing records.

## Current codebase constraints

- `src/harnessctl/templates.py` owns the 18-command registry and currently renders commands without configuration context.
- `src/harnessctl/install.py` loads configuration, renders both harness targets, installs OpenCode skills and the memory plugin, and rejects enabled-memory Pi installation before writes.
- `src/harnessctl/config.py` defaults `communication.caveman.enabled` to true and `memory.enabled` to false.
- `src/harnessctl/templates/skills/memory/SKILL.md.j2` already defines authority, retrieval bounds, persistence classes, and normalized memory tools.
- All 18 files under `src/harnessctl/templates/sdlc/` contain canonical command bodies. Several use broad theoretical tool prohibitions that would otherwise prohibit memory access.
- `extensions/generic-tools/schemas.ts` and `extensions/generic-tools/contracts/config-v2.schema.json` define the runtime configuration contract.
- `tests/test_install.py` is the current Python render, configuration, and installer test suite.
- Automatic Pi memory installation is explicitly unverified and currently fails before any target write.

## Safety rules and edge cases

1. Authoritative artifacts and current observations always win over memory.
2. Retrieved text is untrusted data, never instructions, approval, or proof.
3. Retrieval occurs once at phase entry, with one narrow `memory_search`. The command must not retry with progressively broader searches.
4. `memory_get` is allowed only for a specific returned record whose summary is relevant to the active entity, phase, or decision. It is not a second discovery mechanism.
5. Search and get failures are non-fatal. The command continues from authoritative context, labels memory unavailable, and does not infer missing history.
6. No search result may establish completion, approval, verification, deployment, merge, or current repository state.
7. Phase-exit persistence is optional, item-by-item, and never a transcript or phase-summary dump.
8. `memory_store` accepts only a confirmed reusable fact or decision, or a verified reusable event or lesson.
9. `memory_supersede` requires an identified stale record plus a confirmed or verified replacement. It must preserve the old record and replacement provenance.
10. Proposals, recommendations, assumptions, inferred status, expected results, candidate plans, and unexecuted checks are never persisted.
11. Completion events require current authoritative artifact or tool evidence. User recollection alone may confirm a decision, but cannot create a verified completion event.
12. Secret screening and scope validation remain fail-closed. A rejected write does not fail the SDLC phase and must not be silently shortened into a materially different claim.
13. Memory-disabled OpenCode and every Pi command contain no memory tool name, memory skill instruction, repository-memory claim, or dangling heading.
14. Memory-enabled OpenCode may use only the bounded memory tools named by the compiled hook, despite general phrases such as “do not use tools.” All other prohibitions remain unchanged.
15. Exact technical IDs, paths, commands, error text, risks, uncertainty, and provenance must survive caveman compression.
16. Canonical version 1 records retain the existing 1,000-character summary and 12,000-character details limits for loading, validation, retrieval, and export. Compactness budgets are mutation policy, not persisted-schema constraints.
17. Import preview applies every check that a mutating import would apply, including compactness, but creates no records, tombstones, cache state, or directories.

## Configuration contract

`memory.enabled=true` requires `communication.caveman.enabled=true`. Both Python installation validation and the TypeScript runtime configuration contract reject the invalid combination with an error naming both settings. The JSON Schema expresses the same cross-field condition for external validators.

Defaults remain unchanged: caveman is enabled in strict mode and memory is disabled. Version 1 and partial version 2 configuration continue to deep-merge into those defaults. A configuration that enables memory while explicitly disabling caveman becomes invalid; it is not silently rewritten.

No new user-facing configuration key is required. Retrieval still uses `memory.retrieval.limit`, `memory.retrieval.max_chars`, and `memory.retrieval.include_superseded`. Phase-entry hooks always request active records unless an explicit correction workflow needs a known superseded record.

## Render-context design

`src/harnessctl/templates.py` gains one command metadata mapping keyed by the existing 18 command names. Each entry declares a memory profile, phase label, retrieval intent, and eligible exit classes. The renderer validates complete, exact coverage against `TEMPLATES`; missing or unknown metadata fails tests and rendering rather than silently selecting a default.

The effective render context contains:

| Field | Meaning |
|---|---|
| Harness | `opencode` or `pi` from the existing renderer contract. |
| Memory hooks enabled | True only when project memory is enabled and the selected harness has verified automatic memory registration. Initially, only OpenCode qualifies. |
| Memory profile | `priority-entry` or `exit-only`. |
| Phase label | Compact command-specific search context. |
| Retrieval limit | Existing configured result-count bound. |
| Retrieval character bound | Existing configured serialized-size bound. |
| Default topic | Existing configured topic used to narrow search when no better entity topic exists. |
| Exit classes | The confirmed or verified record classes potentially valid for that phase. |

`render_prompt` and `render_command` retain a memory-disabled default for direct callers. The installer passes the validated configuration-derived context explicitly. This preserves existing callers while preventing enabled installation from accidentally using default-disabled rendering.

For Pi, effective memory hooks remain false regardless of project memory configuration. The existing pre-write rejection for `--harness pi` and `--harness all` with enabled memory remains. If that guard changes later, Pi still receives memory-free commands until separate tests prove automatic extension registration, tool exposure, skill discovery, and invocation.

## Shared Jinja structure

Add shared partials under `src/harnessctl/templates/sdlc/_partials/`:

- `memory-entry.md.j2` owns authority, one-search retrieval, exact-get relevance, bounded-tool exception, and failure behavior.
- `memory-exit.md.j2` owns eligibility, evidence, supersession, caveman compression, and prohibited-claim guidance.

Each of the 18 command templates includes the shared entry and exit partial at stable phase boundaries. The partials emit nothing when hooks are disabled. The entry partial emits retrieval instructions only for `priority-entry`; for `exit-only`, it emits only the narrowly scoped memory-tool exception needed for eligible exit persistence. The exit partial emits one shared policy shaped by metadata rather than command-specific copies.

The includes must not weaken each command's existing read-only or theoretical behavior. They establish a specific exception for the emitted memory operations only. They do not permit repository reads, issue access, code edits, command execution, artifact creation, or other tools.

## Command matrix

All commands receive optional compiled hooks. “Entry search” means one bounded phase-entry `memory_search`. “Exit candidate” means persistence is allowed only when the listed item independently satisfies the confirmation and provenance rules.

| Command | Profile | Entry search intent | Exit candidates |
|---|---|---|---|
| `work-new` | exit-only | None; avoid contaminating new intake with unrelated history. | User-confirmed reusable scope decision only. |
| `work-explore` | priority-entry | Prior verified facts, known risks, and relevant decisions for the investigation question. | Newly observed verified fact or reusable lesson; never a recommendation. |
| `work-plan` | priority-entry | Approved constraints, prior decisions, known risks, and lessons relevant to the planned scope. | Explicitly approved reusable decision; never a proposed plan. |
| `work-resume` | priority-entry | Active entity ID, prior decisions, blockers, and last verified events. | User-confirmed correction or decision; verified event only with current evidence. |
| `work-start-initiative` | exit-only | None. | User-approved durable initiative boundary or decision; never proposed Epics. |
| `work-start-epic` | exit-only | None. | User-confirmed durable Epic decision; never expected documentation or work. |
| `work-start-from` | priority-entry | Exact active entity, parent, dependencies, decisions, and last verified event. | Confirmed correction or decision; no inferred progress. |
| `work-write-stories` | exit-only | None. | User-approved durable decomposition decision; never uncreated Story claims. |
| `work-start-story` | exit-only | None. | User-confirmed durable Story decision; never expected Tasks or designs. |
| `work-design-doc` | exit-only | None. | Explicitly confirmed reusable design decision; never the proposal itself. |
| `work-hld` | priority-entry | Existing architecture decisions, constraints, risks, migrations, and operational lessons. | Explicitly confirmed architecture decision; never an unapproved HLD. |
| `work-lld` | priority-entry | Approved HLD decisions, interface constraints, known failures, compatibility risks, and lessons. | Explicitly confirmed technical decision; never an unapproved LLD. |
| `work-write-tasks` | exit-only | None. | Explicitly approved sequencing or dependency decision; never uncreated Task claims. |
| `work-implement` | priority-entry | Approved task decisions, known compatibility risks, prior failures, and implementation lessons. | Confirmed deviation decision; verified event or lesson only from current authoritative evidence. |
| `work-verify` | priority-entry | Acceptance decisions, prior verified failures, known risks, and verification lessons. | Verified result event or lesson only when checks actually ran and evidence is cited; theoretical plans produce no write. |
| `work-review` | exit-only | None. | User-confirmed accepted-risk decision; verified review event only with actual review evidence. |
| `work-cvs` | exit-only | None. | User-confirmed delivery decision; verified event only after current CVS evidence. |
| `work-finish` | exit-only | None. | Confirmed release decision or verified delivery event; never inferred merge, deployment, or completion. |

The priority list is intentionally limited to resume, start-from, explore, plan, HLD, LLD, implement, and verify. A later expansion requires evidence that another entry search improves outcomes enough to justify context and latency.

## Retrieval interaction

At priority phase entry, the command derives one compact query from the current entity ID, phase, and blocking decision or risk. It performs one search using configured limits and topic scope. Generic searches such as “all project context” are prohibited.

The command screens summaries before requesting exact records. It gets only records that directly affect current scope, compatibility, a blocking decision, a known risk, or verification interpretation. Irrelevant results are ignored. Full memory listing, export, import, validation, and broad superseded-history retrieval are outside normal SDLC hooks.

Retrieved statements are labeled advisory until corroborated. When an artifact contradicts memory, the command cites the artifact, ignores the stale claim for current decisions, and may offer a superseding write only after the replacement is confirmed or verified.

## Phase-exit interaction

Before a write, the command applies four gates:

1. Reusability: another session would benefit without needing the current transcript.
2. Class: confirmed fact or decision, or verified event or lesson.
3. Authority: provenance identifies user confirmation, artifact revision, or current tool observation.
4. Compression: wording is caveman style without loss of technical meaning.

If any gate fails, no write occurs. Silence is preferable to low-confidence persistence. One record contains one reusable item. Artifact bodies, reports, test logs, plans, and task descriptions stay in their authoritative locations; memory stores a compact pointer and conclusion only.

Corrections use `memory_supersede`, not a second conflicting active record. The replacement identifies source kind, source reference, and revision when available. Failure to persist does not alter the phase result or permit a false success statement.

## Mandatory caveman record policy

The memory skill explicitly states that every record submitted through `memory_store`, every replacement submitted through `memory_supersede`, and every record proposed by `memory_import` must use caveman style: minimum tokens with full technical meaning. This is a write-boundary policy only. Tombstones retain their existing contract.

Caveman records remove greetings, filler, repetition, hedging, transcript narration, and duplicated artifact text. They preserve exact IDs, paths, symbols, commands, errors, risks, uncertainty, source references, revisions, and causal qualifiers. Compression must not turn “not verified” into “verified,” remove a condition, or broaden scope.

Structural checks provide useful but incomplete enforcement:

- The canonical persisted `memoryRecordSchema` remains unchanged at 1,000 Unicode characters for summary and 12,000 for details. It continues to govern discovery, loading, `memory_get`, list, search, `memory_validate`, and `memory_export`, so every previously valid version 1 record remains valid and exportable.
- A separate mutation-input compactness check limits summaries to 240 Unicode characters and details to 2,000 Unicode characters and 12 non-empty lines. It runs only for `memory_store`, the replacement input to `memory_supersede`, and record entries supplied to `memory_import`. It must not be reused by canonical loading or repository validation.
- Store and supersede reject before record creation or filesystem mutation. Errors identify the operation, field, observed size, and allowed limit. Existing schema, namespace, secret, and source checks retain their current errors and ordering where practical.
- Import parses and validates the complete batch before mutation. Each compactness error identifies the JSONL line, record ID when available, field, observed size, and allowed limit. One invalid record rejects the entire mutating batch. Tombstones receive existing validation only.
- Preview import runs the same parsing, canonical-schema, namespace, relationship, duplicate-ID, secret, and compactness checks as mutating import. Success reports candidate record and tombstone counts; failure returns a non-valid report with the same actionable diagnostics. Preview performs no canonical write, cache synchronization, or directory creation.
- Existing long canonical records may still be loaded, validated, and exported unchanged. Re-importing one is a proposed mutation and therefore fails compactness validation until the caller intentionally supplies a compact replacement; no automatic truncation or normalization occurs.
- If exact technical material cannot fit without losing meaning, it remains in the authoritative artifact and memory stores only its reference and confirmed conclusion; otherwise no record is persisted.
- Semantic concision remains an agent and reviewer obligation. Character counts, line counts, or banned-phrase lists cannot prove good grammar, truth, or full technical meaning and must not be presented as doing so.

No new destructive normalization is allowed. The current memory decision record remains untouched.

## OpenCode installation

When memory is enabled for OpenCode, installation renders all 18 commands with hooks, installs the caveman skill, installs the memory skill, installs the existing plugin shim, and merges the existing `@harnessctl/opencode-tools` dependency. The configuration invariant guarantees caveman cannot be omitted in this mode.

The installation plan remains conflict-first and transactional. Rendering and validation complete before target writes. Before mutation, installation records file before-images and which parent and memory directories do not yet exist. On any write, initialization, or smoke-check failure, it restores exact bytes and file presence, then removes only transaction-created directories, deepest first, and only while empty. It never recursively deletes, removes a pre-existing directory, or masks the original failure; a rollback failure is reported alongside it. The resulting project tree must equal the pre-install tree, including when `.opencode`, `.harnessctl`, or the configured memory root did not previously exist.

Existing user-modified targets still require explicit force behavior. The smoke check expands from dependency and plugin presence to verify both required skill targets are present; it does not invoke network installation or create the SQLite cache.

When memory is disabled, OpenCode commands render without memory text, and memory skill/plugin/package changes are not introduced. Existing canonical memory is never deleted. Existing installed memory files are not automatically removed because uninstall semantics are outside this change.

## Pi behavior

This implementation chooses safe compile-out. Pi command rendering contains no memory references under any direct renderer call. Enabled-memory Pi and all-harness installation retain the current pre-write error and leave both harness target trees unchanged.

Pi hooks may be enabled only by a later design that verifies all of the following together: extension package distribution, project-local registration, normalized tool availability, memory skill discovery, startup loading, disabled-mode behavior, and end-to-end invocation from an installed command. Existing adapter unit registration alone is insufficient.

## Files and responsibilities

| File or group | Change responsibility |
|---|---|
| `src/harnessctl/templates.py` | Command metadata, render context, complete-matrix validation, and memory-disabled direct-call compatibility. |
| `src/harnessctl/install.py` | Pass validated context, compile OpenCode hooks, retain Pi guard, install both skills/plugin, extend smoke checks, and roll back files plus transaction-created empty directories. |
| `src/harnessctl/config.py` | Enforce memory-to-caveman cross-field invariant while preserving defaults and migration. |
| `src/harnessctl/templates/sdlc/_partials/memory-entry.md.j2` | Shared bounded retrieval and narrow tool-exception prose. |
| `src/harnessctl/templates/sdlc/_partials/memory-exit.md.j2` | Shared write gates, authority, supersession, and claim restrictions. |
| `src/harnessctl/templates/sdlc/work-*.md.j2` | Include shared hooks at phase boundaries; retain command-specific behavior. |
| `src/harnessctl/templates/skills/memory/SKILL.md.j2` | Mandatory caveman policy for store, supersede, and import. |
| `extensions/generic-tools/schemas.ts` | Runtime configuration invariant while retaining the version 1 persisted record limits of 1,000 and 12,000 characters. |
| `extensions/generic-tools/contracts/config-v2.schema.json` | External config invariant matching runtime behavior. |
| `extensions/generic-tools/contracts/memory-record-v1.schema.json` | Remain at the backward-compatible persisted limits; parity tests prevent accidental compactness tightening. |
| `extensions/generic-tools/generate-contracts.ts` and `extensions/generic-tools/schemas.spec.ts` | Generated-contract freshness and runtime/JSON Schema parity for every changed canonical schema. |
| `extensions/generic-tools/config.spec.ts` | Defaults, migration, and invalid-combination coverage. |
| `extensions/generic-tools/memory.ts` and `extensions/generic-tools/memory.spec.ts` | Separate mutation-input compactness from canonical validation; provide store, supersede, preview-import, and atomic import diagnostics. |
| `tests/test_install.py` | Render matrix, installer, compile-out, conflicts, rollback, and protected-root behavior. |
| `pyproject.toml` | Declare Python package data explicitly if artifact inspection shows templates or partials are absent. |
| `tests/test_release_artifacts.py` | Build and inspect wheel and source distribution, install the wheel in isolation, verify packaged rendering resources, and exercise installed CLI safeguards. |
| `mise.toml` | Add release-artifact verification to the existing quality or build gate without duplicating unit tests. |

## Testing strategy

### Render tests

- Assert metadata keys exactly equal all 18 `TEMPLATES` keys.
- Render all 18 OpenCode commands with memory disabled and assert no normalized memory tool name, memory heading, or unrendered Jinja remains.
- Render all 18 Pi commands and assert the same absence regardless of supplied memory context.
- Render all 18 memory-enabled OpenCode commands and assert shared authority and exit policy appear once.
- Assert exactly the eight priority commands contain one `memory_search` instruction and bounded search values.
- Assert the other ten commands contain no entry-search instruction.
- Assert priority commands allow `memory_get` only after relevance screening.
- Assert all theoretical tool prohibitions remain and the exception names only compiled memory operations.
- Snapshot or focused-string checks verify command-specific prose is not copied into every template.

### Configuration tests

- Defaults remain caveman true, strict mode, and memory false in Python and TypeScript.
- Memory true with caveman false fails with a stable cross-field error.
- Memory false with caveman false remains valid.
- Version 1 and partial version 2 inputs retain deep-merge behavior.
- Generated JSON Schema accepts and rejects the same cross-field combinations as runtime validation.
- Regenerating each changed contract in memory produces byte-equivalent structured JSON to the committed file. The freshness check fails when canonical schemas change without committed generated artifacts.
- Persisted runtime and generated memory schemas continue accepting summaries through 1,000 characters and details through 12,000 characters.

### Installer tests

- Enabled-memory OpenCode installation creates 18 hooked commands, both skills, the plugin shim, and the package dependency in a temporary project.
- Disabled-memory OpenCode installation produces 18 memory-free commands and does not install memory integration.
- Enabled-memory Pi and all-harness installation fail before creating or changing either target tree.
- Conflict detection lists command and skill conflicts before writes; failures injected during command writes, memory-directory initialization, and smoke checks restore exact prior bytes, file kinds, and paths.
- Tree-manifest assertions cover an initially empty project, pre-existing `.opencode` and `.harnessctl` parents, a custom memory root, and partially pre-existing memory directories. Rollback removes newly created empty parents and memory subdirectories deepest first while preserving every pre-existing directory and unrelated file.
- Smoke-check failure restores the complete pre-install tree and does not create the SQLite cache.
- Tests never install into the repository root and never touch current generated outputs or canonical memory.

### Memory-policy tests

- The rendered memory skill names store, supersede, and imported records in the caveman requirement.
- Store, supersede replacement, preview import, and mutating import share the 240-character summary, 2,000-character details, and 12-line compactness outcomes at their mutation boundaries.
- Boundary tests prove 240/2,000/12 are accepted and the next unit is rejected with operation, field, observed size, and limit. Import diagnostics also include JSONL line and available record ID.
- Preview returns candidate counts when valid, returns a non-valid report with mutating-import-equivalent diagnostics when invalid, and leaves canonical files, cache state, and directories unchanged.
- Batch import validates all records before writing and rejects one invalid record without partial mutation.
- Existing canonical records at the 1,000/12,000 persisted limits load, validate, retrieve, and export without normalization or compactness errors.
- An exported legacy-sized record is rejected by preview and mutating import as a new mutation, with no truncation and no write.
- Technical IDs, commands, errors, risk qualifiers, and provenance survive accepted compact records.
- Tests explicitly state that structural validation does not certify grammar, truth, or semantic completeness.

### Release artifact tests

- Build both wheel and source distribution from a clean checkout state and fail on missing or unexpected build outputs.
- Inspect both archives for all canonical SDLC templates, the new shared partials, both skill templates, and required Python modules; reject protected generated project outputs.
- Install the wheel into a fresh isolated environment without importing source from the checkout. Render all commands through the installed package to prove Jinja includes resolve from packaged resources.
- Run the installed module CLI against temporary projects. Memory-disabled OpenCode and Pi installation succeeds with memory-free commands; memory-enabled installs produce hooked commands and skills for both harnesses. Pi package mutation remains consent-gated.
- Exercise conflict refusal and a forced OpenCode install from the isolated package. Artifact verification uses local build outputs only and performs no network package installation.

### Quality verification

Run the repository's existing Python tests, TypeScript tests, lint, format, duplicate check, audit, build, validation, generated-contract freshness, and release-artifact tasks. Verify generated OpenCode commands and skills plus Pi prompts and skills match current renderers.

## Migration and compatibility

- Configuration version remains 2; no new required key is added.
- Existing memory-disabled configurations and direct rendering callers keep memory-free output.
- Existing configurations with memory enabled and caveman omitted remain valid because the current default is true.
- Existing configurations that explicitly combine memory enabled with caveman disabled become invalid with actionable guidance to enable caveman or disable memory.
- Existing repository records, including records longer than guidance targets, are not rewritten or deleted. Reads and exports remain compatible.
- The persisted version 1 memory contract and generated portable schema keep the existing 1,000-character summary and 12,000-character details limits. No record migration or schema-version change is required.
- Compactness applies only when a caller proposes new canonical state through store, supersede, or import. Preview exposes whether the same import would be accepted without mutating the project.
- Normalized memory tool names, arguments, responses, and OpenCode plugin package remain unchanged.
- Command filenames, descriptions, front matter, and non-memory output contracts remain unchanged except for compiled hook sections.
- Disabling memory does not remove existing records or previously installed files. A clean uninstall requires separate design.
- Pi remains fail-closed for enabled-memory installation and memory-free for command rendering.

## Ordered implementation plan

Each subtask changes one to three files or one cohesive template group. Later steps depend on earlier contracts.

1. Define the configuration invariant in `src/harnessctl/config.py` and `extensions/generic-tools/schemas.ts`; regenerate `extensions/generic-tools/contracts/config-v2.schema.json`. Confirm defaults and migration before prompt work.
2. Add cross-field and generated-contract freshness/parity tests in `extensions/generic-tools/config.spec.ts`, `extensions/generic-tools/schemas.spec.ts`, and `tests/test_install.py`. Lock the memory contract at its existing 1,000/12,000 persisted limits.
3. Define command metadata and backward-compatible render context in `src/harnessctl/templates.py`; add matrix coverage in `tests/test_install.py`.
4. Add `memory-entry.md.j2` and `memory-exit.md.j2`; render-test enabled, disabled, priority, and exit-only profiles before integrating commands.
5. Integrate partials into `work-new`, `work-resume`, and `work-start-from`; verify no-tool exception wording and confirmation safeguards.
6. Integrate partials into `work-explore`, `work-plan`, and `work-design-doc`; verify evidence and proposal boundaries.
7. Integrate partials into `work-hld`, `work-lld`, and `work-write-tasks`; verify approval and artifact authority language.
8. Integrate partials into `work-start-initiative`, `work-start-epic`, and `work-write-stories`; verify uncreated-entity claims cannot be stored.
9. Integrate partials into `work-start-story`, `work-implement`, and `work-verify`; verify expected and unexecuted outcomes cannot be stored.
10. Integrate partials into `work-review`, `work-cvs`, and `work-finish`; verify review, merge, deployment, and completion claims require evidence.
11. Update `src/harnessctl/templates/skills/memory/SKILL.md.j2`, `extensions/generic-tools/memory.ts`, and `extensions/generic-tools/memory.spec.ts` for a separate mutation-input compactness check, clear diagnostics, side-effect-free preview, and legacy-sized canonical record coverage.
12. Update `src/harnessctl/install.py` and `tests/test_install.py` for config-aware rendering, both OpenCode skills, plugin smoke checks, disabled compile-out, Pi fail-closed behavior, and exact-tree rollback including created directories.
13. Add `tests/test_release_artifacts.py` and wire it through `mise.toml`; adjust `pyproject.toml` only if archive inspection proves package-data declaration is required.
14. Run generated-contract freshness, release-artifact verification, and repository quality tasks; inspect changed paths. Do not regenerate or stage protected root outputs or the existing memory record.

## Acceptance criteria

1. All 18 canonical SDLC templates contain optional shared memory hooks without duplicated policy prose.
2. Memory-disabled OpenCode output and all Pi output contain no memory references.
3. Enabled-memory OpenCode output permits only compiled bounded memory operations despite general theoretical tool prohibitions.
4. Exactly the eight priority commands perform at most one narrow phase-entry search; exact gets require relevant search results.
5. Retrieved memory remains advisory and cannot prove approval, completion, verification, merge, deployment, or current state.
6. Phase-exit writes contain only confirmed reusable facts or decisions, or verified reusable events or lessons, with provenance.
7. No proposal, inference, expected result, unexecuted check, or unsupported completion claim is persisted.
8. Every store input, superseding replacement, and imported record is required to use caveman style while preserving technical identifiers, commands, errors, risks, uncertainty, and provenance.
9. Structural compactness checks are consistent across mutation inputs and preview, provide actionable field and import-line errors, and are documented as incomplete semantic enforcement.
10. `memory.enabled=true` with `communication.caveman.enabled=false` fails in Python, TypeScript, and JSON Schema validation; defaults remain caveman true and memory false.
11. Enabled-memory OpenCode installation compiles hooked commands and installs both skills plus the existing plugin/dependency.
12. Pi enabled-memory installation remains pre-write fail-closed, and Pi commands remain memory-free.
13. Existing canonical memory and dirty generated outputs remain byte-for-byte untouched by implementation and tests.
14. Existing command names, normalized memory tool contracts, canonical storage, and config version remain compatible.
15. Existing version 1 records up to 1,000 summary characters and 12,000 details characters still load, validate, retrieve, and export; generated memory-schema parity prevents accidental tightening.
16. Any installer failure restores the exact pre-install tree, including removal of newly created empty parent and memory directories without deleting pre-existing content.
17. Wheel and source distribution contain every required template and partial; an isolated wheel install renders commands and enforces OpenCode/Pi CLI safeguards without checkout imports.

## Risks and mitigations

- Prompt conflict: broad no-tool text may override hooks. Mitigation: the shared entry partial states a precise memory-only exception and tests every affected command.
- Context inflation: hooks may consume more tokens than they save. Mitigation: only eight entry searches, one search each, configured bounds, relevance-screened gets, and shared compact prose.
- Memory laundering: stale claims may appear authoritative. Mitigation: advisory labeling, artifact precedence, provenance, and explicit completion prohibitions.
- Excessive writes: agents may persist every phase summary. Mitigation: four exit gates, one-item records, no-write default, and proposal exclusions.
- False compactness assurance: validators cannot judge language quality. Mitigation: enforce only objective structure and disclose semantic limits.
- Accidental persisted-schema tightening: reusing mutation checks could invalidate repository history. Mitigation: separate validators, explicit 1,000/12,000 compatibility tests, and generated-contract parity checks.
- Compatibility break from the new invariant: explicit memory-on/caveman-off projects fail. Mitigation: actionable error, unchanged defaults, and no silent migration.
- Pi leakage: generic rendering could expose unavailable tools. Mitigation: harness capability controls effective context, Pi-specific absence tests, and retained installer guard.
- Accidental root regeneration: installer tests could overwrite dirty outputs. Mitigation: temporary-project-only tests and changed-path acceptance checks.
- Incomplete rollback: file restoration can leave empty installer-created directories. Mitigation: track absent directories before writes, remove only transaction-created empty directories deepest first, and compare complete tree manifests in fault tests.
- Source-tree-only success: editable tests can hide missing package resources. Mitigation: inspect both archives and run CLI/render checks from an isolated wheel installation.

## Deferred decisions

- Changing the mutation-only 240-character summary or 2,000-character, 12-line details budgets requires compatibility evidence. These objective limits must never be moved into the persisted version 1 schema or described as complete grammar or meaning enforcement.
- Automatic Pi memory distribution requires a separate verified installation design.
- Uninstall and stale generated-file cleanup require an explicit ownership manifest and are outside this change.
