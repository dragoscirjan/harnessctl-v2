---
id: "doc-00012"
title: "Compact progressively disclosed SDLC prompts"
kind: lld
status: review
version: 1
created_at: "2026-08-27T20:11:30.311Z"
updated_at: "2026-08-27T20:11:30.311Z"
created_by: "lead-engineer"
metadata: {"legacy_spec":{"source_path":".specs/lld-00010-compact-progressively-disclosed-sdlc-prompts-v1.md","source_sha256":"0646c8d4b7eddd7ce073ed5101c57393a7063e399a87a4d0cc4fccfeed2d7e2c","decoder_version":1,"original_status":"review","field_conversions":{"type":"kind","id":"migration_mapping","status":"review","author":"created_by","timestamps":"canonical_utc_or_intent_timestamp"},"frontmatter":{"id":"00010","type":"lld","title":"Compact progressively disclosed SDLC prompts","version":1,"status":"review","parent":"00009","opencode-agent":"lead-engineer"},"rewrites":[{"from":".specs/lld-00009-simplified-epic-first-sdlc-command-set-delta-v1.md","to":".harnessctl/documents/doc-00011-simplified-epic-first-sdlc-command-set-delta-v1.md"},{"from":".specs/lld-00002-caveman-memory-hooks-across-sdlc-commands-v2.md","to":".harnessctl/documents/doc-00002-caveman-memory-hooks-across-sdlc-commands-v2.md"}]}}
---

# Compact progressively disclosed SDLC prompts

Implementation-ready. User authorized immediate YOLO implementation and waived the approval wait.

## Parent designs

- `.harnessctl/documents/doc-00011-simplified-epic-first-sdlc-command-set-delta-v1.md`
- `.harnessctl/documents/doc-00002-caveman-memory-hooks-across-sdlc-commands-v2.md`

This delta changes prompt delivery, not the five-command lifecycle or public behavior.

## Problem

Memory-enabled OpenCode renders currently cost about 2,432–3,451 tokens per command before user input, tools, skills, or repository context. Shared inline governance, Epic, memory, and checkpoint prose contributes about 1,860 tokens to every command. Jinja partials improve source maintenance but are expanded before the model sees them.

## Goals

1. Keep `work-plan`, `work-build`, `work-verify`, `work-release`, and `work-continue` behavior compatible.
2. Reduce every installed command shell to at most 140 words and 900 UTF-8 bytes excluding OpenCode frontmatter.
3. Use Agent Skills progressive disclosure on OpenCode and Pi: compact core first, one phase reference next, conditional references only when needed.
4. Preserve Epic-first authority, confirmation, remote/destructive consent, evidence rules, memory checkpoints, provider boundaries, and stop boundaries.
5. Add deterministic budgets and freshness tests so prompt growth fails CI.

## Non-goals

- No generic autonomous workflow executor.
- No hidden mutation, provider selection, issue/CVS replacement, or confirmation bypass.
- No new MCP server. Existing skills and normalized tools already provide context with less host/runtime risk. MCP may be reconsidered only for a concrete external context source.
- No public command rename, config migration, or package-major bump.

## Architecture

### Tiny command shells

Each command contains only:

1. activate the installed `sdlc` skill;
2. read one phase reference;
3. apply it to current input;
4. stop at that phase boundary;
5. emit the shared compact result.

If the skill/reference is unavailable, stop and name the missing path. Never fall back to an embedded large protocol.

### One progressively disclosed `sdlc` skill

Installed identically for both hosts:

```text
.opencode/skills/sdlc/
├── SKILL.md
└── references/
    ├── plan.md
    ├── plan-initiative.md
    ├── plan-design.md
    ├── plan-decompose.md
    ├── build.md
    ├── build-yolo.md
    ├── verify.md
    ├── verify-defects.md
    ├── release.md
    ├── release-deploy.md
    ├── continue.md
    ├── continue-reconcile.md
    └── checkpoint.md
```

Pi receives the same tree under `.pi/skills/sdlc/`.

`SKILL.md` contains only universal rules and a reference routing table. Phase references contain the normal path. Conditional references contain rare/expensive branches and are loaded only after their condition is observed.

### Routing

| Command  | Required reference | Conditional references                                  |
| -------- | ------------------ | ------------------------------------------------------- |
| Plan     | `plan.md`          | Initiative mode, design work, issue decomposition       |
| Build    | `build.md`         | YOLO only when offered/requested                        |
| Verify   | `verify.md`        | defect diagnosis/Bug handling only after failure        |
| Release  | `release.md`       | deployment only after explicit request                  |
| Continue | `continue.md`      | checkpoint reconciliation only for ambiguity/duplicates |

`checkpoint.md` is loaded immediately before checkpoint retrieval/mutation, not at command entry. Existing `memory` skill remains the authority for normalized memory tool semantics, eligibility, secret screening, and compact mutation limits.

### Compact common result

Every phase returns only present fields:

```text
Epic: <id or blocker>
Phase: <plan|build|verify|release>
Done: <verified step>
Evidence: <compact refs>
Next: <confirmed/recommended next step>
Blockers: <none or list>
Checkpoint: <stored|superseded|missed|unavailable>
```

Phase references add a field only when behavior requires it; they do not restate the schema.

## Behavior preservation

`SKILL.md` preserves:

- exactly one authoritative non-archived owning Epic; non-Plan commands redirect missing Epic to Plan;
- authority order: current issues/specs/source/Git/tests/provider evidence over memory;
- one bounded action set classified Required/Recommended/Optional/Not needed;
- explicit confirmation of the displayed set; fresh action-specific consent for remote/destructive operations;
- configured tools/providers only; no direct authority-file edits, guessed syntax, secret reads, route switching after mutation, or inferred completion;
- command boundary: one phase and one confirmed step/slice where the parent design requires it.

Phase/conditional references preserve every current parent-LLD rule, including adaptive Plan, bounded Build and YOLO limits, Verify occurrence-Bug handling, Release branch/commit/push/PR gates and merge consent, Continue ambiguity handling, and confirmed compact checkpoints.

## Rendering and installation

### Python registry

Extend `src/harnessctl/templates.py`:

```python
SKILL_RESOURCE_TEMPLATES: dict[str, dict[str, str]]

def render_skill_resources(skill: str, **context: object) -> dict[str, str]: ...
```

Keys are POSIX relative paths below the skill directory. Validation rejects absolute paths, `..`, backslashes, duplicate portable names, and paths outside `references/`. Jinja uses existing `StrictUndefined` behavior and final newline normalization.

The `sdlc` skill and references are compiled with current memory-enabled context. Memory-disabled renders omit memory tool instructions but retain the honest `Checkpoint: unavailable` behavior.

### Installer

`src/harnessctl/install.py` adds every rendered `sdlc` skill resource to the existing selected-harness target transaction. Existing prevalidation, conflict/force handling, before-images, symlink defense, exact rollback, and smoke checks apply to every resource. Registry-driven smoke checks replace hard-coded skill lists where practical.

No host-global files, external commands, package installs, or MCP changes are needed.

### Packaging

Templates remain below `src/harnessctl/templates/` and ship in wheel/sdist. Release-artifact tests enumerate every skill resource, install the wheel in isolation, render/install both harnesses, and verify byte equality.

## Token budgets

Tests use deterministic UTF-8 bytes and whitespace-delimited words; approximate tokens are reporting only.

| Artifact                      |                   Maximum |
| ----------------------------- | ------------------------: |
| command body                  |     140 words / 900 bytes |
| `sdlc/SKILL.md`               |   400 words / 2,800 bytes |
| required phase reference      |   550 words / 4,000 bytes |
| conditional reference         |   350 words / 2,600 bytes |
| command + core + normal phase | 1,050 words / 7,500 bytes |

Budgets include memory-enabled variants, which are the largest. CI reports old/new size deltas. A budget increase requires explicit test update and documentation justification.

## Files

### Add

- `src/harnessctl/templates/skills/sdlc/SKILL.md.j2`
- `src/harnessctl/templates/skills/sdlc/references/*.md.j2`
- focused resource/budget tests in `tests/test_templates.py`, `tests/test_install.py`, and `tests/test_release_artifacts.py`

### Change

- five `src/harnessctl/templates/sdlc/work-*.md.j2` shells
- `src/harnessctl/templates.py`
- `src/harnessctl/install.py`
- generated `.opencode/commands/*`, `.pi/prompts/*`, `.opencode/skills/sdlc/**`, `.pi/skills/sdlc/**`
- README/FLOWS/docs only where prompt-delivery architecture or measured budgets are described
- root changelog/Changeset only if package release policy requires it

### Remove

- old inline SDLC checklist partials after behavioral tests prove all rules moved:
  `governance`, `epic-context`, phase checklists, `memory-entry`, `memory-exit`, `checkpoint`.

## Tests

1. All five command shells satisfy hard budgets with memory enabled and disabled on both hosts.
2. Core + normal phase references satisfy aggregate budget.
3. Every parent-design invariant appears exactly once in core or correct phase/conditional reference.
4. Conditional policy is absent from normal references and present in its dedicated file.
5. Skill resource paths reject traversal, collisions, and unsupported names.
6. OpenCode and Pi installs contain identical rendered skill trees and byte-exact five commands.
7. Conflict, force, symlink, rollback, idempotence, and selected-harness tests include nested resources.
8. Wheel/sdist isolated tests prove every resource ships and installs.
9. Existing issue/CVS/memory tool and adapter tests remain unchanged/passing.
10. Full quality, package build/check, Node/Bun runtime smoke, Mermaid/docs drift checks pass.

## Implementation order

1. Add budget/invariant characterization tests against current behavior.
2. Add skill resource renderer and safe path validation.
3. Write compact core and references by migrating one rule set at a time.
4. Replace five command templates with shells.
5. Extend installer/package/smoke/rollback tests.
6. Re-render both harnesses and update docs/digests.
7. Run reviews and full verification.

## Acceptance

- Five public commands unchanged by name and phase boundary.
- Every command body is at least 80% smaller by bytes than its pre-change memory-enabled render and meets budget.
- Typical command + core + normal phase is below 1,050 words and 7,500 bytes.
- Rare policy loads only after its condition.
- OpenCode and Pi install/discover the same compact skill tree.
- No safety, authority, confirmation, Bug, YOLO, release, Continue, or checkpoint regression.
- No new MCP/server/external dependency.
- Full repository quality and release-artifact verification pass.
