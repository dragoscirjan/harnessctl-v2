---
id: "doc-00019"
title: "Git Epic Workspace Primitives"
kind: lld
status: approved
version: 1
created_at: "2026-09-03T17:27:44.173Z"
updated_at: "2026-09-03T17:29:10.616Z"
created_by: "OpenCode"
metadata: {"epic":"hrn-00209","capability":"git-epic-workspaces"}
---

# Git Epic Workspace Primitives

## Purpose

Define deterministic, enforceable, opt-in Git worktree primitives for one isolated workspace per canonical Epic. This design is implemented by `@harnessctl/generic-tools` and projected through OpenCode and Pi without changing canonical Issue, Document, or Memory authority boundaries.

## Configuration Contract

Config v1 adds required boolean `skills.cvs.workspaces`, default `false`. This repository explicitly enables it. `workspaces: true` is valid only when `skills.cvs.enabled: true` and `skills.cvs.local: git`; TypeScript and Python loaders report the exact invalid path. The canonical Zod schema generates both contract copies, defaults, and fingerprints. Installer rendering passes the setting to both `sdlc-cvs` projections.

When disabled, workspace operations fail as unavailable without creating Git or metadata state. Existing Git and Jujutsu behavior remains unchanged.

## Normalized Tools

The adapters expose identical contracts and route host cwd to generic-tools:

- `workspace_ensure(epic_id)` creates or returns the one deterministic workspace.
- `workspace_status(epic_id)` returns verified mapping, current-cwd relationship, cleanliness, and lifecycle state without mutation.
- `workspace_mark_cleanup_ready(epic_id)` transitions a matching clean active workspace without removing it.
- `workspace_cleanup(epic_id)` physically removes an eligible workspace from the primary checkout and records closure.

Results are structured and identify canonical Epic ID, repository, primary path, workspace path, branch, lifecycle state, current-cwd match, and actionable blockers. Errors distinguish configuration, repository discovery, authority, conflict, unsafe state, Git execution, and synchronization failures.

## Repository And Epic Preconditions

Operations require a non-bare Git repository with one discoverable primary checkout. Git topology is read using `git worktree list --porcelain -z`. Paths are canonicalized before comparison. The requested ID must resolve to an active canonical Epic in the configured filesystem Issue authority.

First creation runs from the primary checkout, requires it to be clean, and requires the Epic authority file to exist in primary `HEAD`. An uncommitted or branch-local Epic is rejected because a new worktree would not contain its planning authority. Calling ensure inside the exact existing Epic workspace is allowed and returns its verified status; calling it from another location returns the required primary or Epic path.

## Deterministic Mapping

The branch is `harnessctl/epic/<canonical-epic-id>`. The workspace is a sibling of the primary checkout:

`<primary-parent>/<primary-name>--workspaces/<canonical-epic-id>`

Workspaces are never nested under tracked `.harnessctl`. Canonical Epic validation and argument-vector process execution prevent path/ref injection. Existing unrelated branches, directories, registered worktrees, or metadata at either deterministic identity are conflicts and are never overwritten or adopted without mechanically provable ownership.

## Shared State

Schema-versioned local metadata lives below the resolved Git common directory in a Harnessctl-owned workspace-state directory. It is local operational state, not Git-tracked project authority. One record per Epic contains repository identity, Epic ID, deterministic branch/path, lifecycle state, and timestamps. Lifecycle states are:

`creating -> active -> cleanup_ready -> closed`

A common-directory lock serializes Harnessctl workspace mutations across linked worktrees. Metadata writes are atomic and directory-synchronized. Readers validate the complete record before trusting it. Unknown schema versions, malformed records, identity mismatches, or stale Git topology fail closed.

Creation writes a recoverable `creating` intent while holding the shared lock, invokes Git, re-reads authoritative Git topology, then promotes only the exact mapping to `active`. A competing ensure re-reads after lock acquisition and converges on an exact active mapping. Interrupted creation is recovered only when branch, registered path, lock reason or ownership evidence, and metadata all prove the deterministic association; otherwise status reports stale state requiring operator action.

## Git Execution Boundary

Generic-tools invokes the configured `git` executable directly with argument arrays, never through a shell. Commands have bounded runtime and captured output. Git version/help capability is checked where required; no guessed flags are used. Expected nonzero results become typed errors with bounded, sanitized diagnostics. Ambiguous timeout or process termination is followed only by read-only reconciliation, never blind mutation retry.

New worktrees are created with the deterministic branch and a Harnessctl ownership lock/reason where supported. Force/reset flags are forbidden. Worktree creation never copies uncommitted files or rewrites an existing branch.

## Status And Safety

Status reconciles metadata against Git topology and filesystem reality. It verifies repository/common-dir identity, Epic authority, primary path, workspace path, branch attachment, HEAD availability, registration, lifecycle state, current cwd, and tracked/untracked cleanliness. It reports absent, creating, active, cleanup-ready, closed, or stale/mismatched state without automatic repair.

Ready transition is allowed only from the exact matching active workspace with a clean worktree. It atomically records `cleanup_ready` and does not change cwd, branch, worktree registration, or files.

Cleanup is allowed only from the exact primary checkout. It requires a matching `cleanup_ready` record, exact registered branch/path, and a clean target. It refuses the current cwd, descendants of the target cwd, locked/mismatched/unregistered targets, or any state that could remove unrelated or uncommitted files. It removes only the worktree, retains the Epic branch for open, merged, rebased, or squash-merged PR history, verifies absence, and records `closed`. Branch deletion and workspace reopening are out of scope.

## Failure And Recovery Rules

No mutation is retried after an ambiguous result. The tool re-reads metadata and Git topology and reports the verified state. Stale external moves, removals, branch changes, metadata edits, or lock contention fail closed. Manual recovery guidance identifies evidence and expected paths but does not authorize deletion, reset, force, or metadata rewriting.

Disabling workspace support leaves worktrees, branches, and metadata intact. Older Harnessctl versions ignore common-dir state. Once created, rollback must never automatically remove workspace directories or branches.

## Verification

Tests use temporary real Git repositories plus focused process-boundary tests. Coverage includes disabled and invalid config, strict generated contract parity, clean and dirty primary preconditions, committed Epic authority, deterministic paths with spaces, concurrent same/different-Epic ensure, interrupted creation, branch/path collisions, wrong cwd, detached/wrong branch, external moves/removals, ready transition, active-cwd cleanup refusal, clean primary cleanup, branch retention, malformed/unknown metadata, timeout reconciliation, OpenCode/Pi schema and behavior parity, installer projections, documentation, package builds, and repository quality gates.

## Documentation And Release

Update Config Schema, CVS, Skills, installation/projection documentation, generated contracts, repository config, and relevant examples. Release through the repository's normal Changesets and PR process for affected public packages; determine exact version bumps during Build from shipped API impact. No daemon, remote provider mutation, automatic branch deletion, canonical authority migration, or automatic cwd switching is introduced.
