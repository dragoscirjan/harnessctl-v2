---
id: "doc-01M1PZMXJ99DRRW65A1E22G7TH"
title: "Session-Bound Workspace Execution Routing"
kind: lld
status: approved
version: 2
created_at: "2026-09-04T19:52:05.961Z"
updated_at: "2026-09-04T23:47:43.333Z"
created_by: "OpenCode"
metadata: {"initiative":"hrn-00207","epic":"hrn-01M1PX20Z7J3A6RX95P7DGXF33","parent_document":"doc-01M1PX3FGJKTHDVZJFQ7S9J8YX","baseline_document":"doc-00019","compatibility_policy":"Use latest installed OpenCode and Pi harnesses; verify required runtime capabilities without patch-version matrices or named version fixtures; review major host releases deliberately.","supersedes_requirements":["minimum and known-compatible host version fixtures","patch-version compatibility ranges","version-specific compatibility tests"]}
---

# Session-Bound Workspace Execution Routing

## Purpose

Implement the approved session-bound workspace architecture while OpenCode and Pi remain launched from the primary checkout. This LLD defines the execution-context state, routing boundary, deterministic operation machinery, host adapters, compatibility behavior, migration, and verification required by Epic `hrn-01M1PX20Z7J3A6RX95P7DGXF33`.

## Constraints

- Deliver while `skills.cvs.workspaces` is disabled.
- Do not require host process `chdir`, tab relaunch, or persistent shell switching.
- Preserve the deterministic Git primitives and common-directory state delivered by `doc-00019` unless this document explicitly extends them.
- Preserve existing v1 workspace records without automatic rewrite, rename, or deletion.
- Do not implement the lifecycle policy owned by `hrn-00210`.
- Do not hot-load harness code built in an Epic workspace. Activation follows merge, rebuild/install, and intentional host reload.
- Treat current authority, binding state, Git topology, configuration, and provider results as inputs; model text is never authority or execution proof.

## Components

### Execution Context Resolver

Add a host-neutral resolver in `extensions/generic-tools` with these inputs:

- control root supplied by the host adapter;
- host identifier: `opencode` or `pi`;
- opaque host session ID;
- optional expected binding generation;
- requested operation class: `control` or `project`.

The resolver discovers the primary repository and Git common directory from the control root, hashes the opaque session ID, reads the current binding under lock, validates its workspace record and Git topology, and returns an immutable execution context. Project-facing generic operations receive `execution_root`; control-plane workspace discovery, binding coordination, integration, and cleanup receive `primary_root` explicitly.

Resolved context fields:

```text
repository_id
primary_root
workspace_id
execution_root
branch
base_revision
epic_id | null
binding_generation
workspace_generation
workspace_lifecycle
host
session_key
```

No adapter or downstream operation may infer the execution root again from process cwd after resolution.

### State Layout

Store control-plane state below the Git common directory:

```text
harnessctl/workspaces/v2/<workspace-id>.json
harnessctl/session-bindings/v1/<host>/<sha256-session-id>.json
harnessctl/locks/execution-context.lock
```

Opaque session IDs never appear in filenames, logs, errors, memory, or model-visible state. The SHA-256 digest is namespaced by host. Records use strict schemas and reject unknown fields.

Workspace v2 record:

```text
schema_version: 2
workspace_id: ws-<ULID>
repository_id: <stable repository fingerprint>
primary_path: <canonical absolute path>
workspace_path: <canonical absolute path>
branch: harnessctl/workspace/<workspace-id>
base_revision: <full commit SHA>
epic_id: <canonical Epic ID or null>
lifecycle: creating | active | cleanup_ready | closed
generation: <positive integer>
created_at: <UTC timestamp>
updated_at: <UTC timestamp>
```

Session binding v1 record:

```text
schema_version: 1
host: opencode | pi
session_key: <sha256 digest>
repository_id: <stable repository fingerprint>
workspace_id: ws-<ULID>
epic_id: <canonical Epic ID or null>
generation: <positive integer>
workspace_generation: <positive integer>
created_at: <UTC timestamp>
updated_at: <UTC timestamp>
```

The repository fingerprint is derived programmatically from the canonical Git common-directory identity and must not depend on a movable display path alone.

All multi-record changes use one repository-scoped lock, validate current generations, write temporary files with exclusive creation, fsync where supported, and atomically rename. A failed multi-record transition leaves the previous valid generation authoritative. Readers reject partial, malformed, future-schema, or mismatched records.

### Workspace Identity and Provisional Allocation

A provisional workspace uses `ws-<26-character ULID>` as stable identity. Its deterministic branch is `harnessctl/workspace/<workspace-id>` and its deterministic sibling path is `<primary-name>--workspaces/<workspace-id>`. Allocation requires an exact clean primary topology and applies the existing bounded Git execution rules from `doc-00019`; it does not require committed Epic authority.

New-Epic Plan flow:

1. Allocate provisional workspace and v2 record.
2. Bind the current host session to its workspace ID.
3. Route Plan authority creation to that execution root.
4. Attach the newly created Epic ID under lock.
5. Verify workspace authority, repository identity, branch, and generations.
6. Continue Plan in the same host session without renaming the branch or path.

Existing-Epic flow resolves an exact existing v2 record or performs explicit adoption of a v1 record. Adoption is legal only when repository, canonical primary/workspace paths, branch, Epic ID, lifecycle, and clean topology match. Adoption creates a v2 identity and binding record but does not rewrite or delete the v1 record, rename the branch/path, or alter commits. Ambiguous or conflicting candidates fail closed.

### Binding Lifecycle and Recovery

Binding transitions are `unbound -> bound -> rebound | released`. Every transition increments binding generation and records the current workspace generation. Rebinding requires explicit intent and exact expected generations; it cannot silently move a live session between workspaces.

Every project operation resolves and validates the binding immediately before execution. It rejects:

- absent or malformed binding while workspace routing is required;
- stale expected generation;
- missing or non-worktree execution root;
- repository fingerprint mismatch;
- canonical path mismatch or symlink escape;
- branch or HEAD topology drift outside the operation's legal state;
- Epic mismatch after attachment;
- closed or otherwise illegal workspace lifecycle;
- an unsupported host capability or tool.

OpenCode and Pi recovery evidence may point to `{repository_id, workspace_id, epic_id, generation}` but common-directory state remains authoritative. Recovery accepts one exact live match; ambiguity or drift requires explicit reconciliation.

### Root Containment

All project-relative paths are joined to the resolved execution root and checked after canonicalization. Existing path ancestors and final targets are realpath-checked. New targets are validated by resolving the nearest existing ancestor and then appending validated relative segments. `..`, NUL, platform-invalid segments, and symlink escapes are rejected.

Absolute paths are rejected for project operations unless they canonically remain below the execution root. Access to the primary checkout while bound requires a registered `control` or `integration` operation; it is never inferred from an absolute argument. Cross-workspace paths always fail.

Generic config, issue, document, repository-memory, source/file, artifact, and task interfaces receive the resolved root explicitly. Disposable caches are namespaced consistently with their owning workspace authority.

### Typed Operation Registry

Add a versioned compile-time operation registry. Each descriptor defines:

```text
operation_id
input_schema
operation_class
legal_workspace_states
approval_class
executable | task_mapping_key
argv_builder
cwd_policy
environment_allowlist
timeout_ms
max_output_bytes
idempotency_policy
state_transition
evidence_schema
```

The model may request an operation ID and supply schema-valid domain inputs. Program code selects the executable or repository task, constructs argv, resolves cwd, classifies approval, enforces state and idempotency, performs transitions, and emits structured evidence. Descriptor changes after consent invalidate that consent.

Processes use argv arrays with `shell: false`, a bounded environment allowlist, explicit execution-root cwd, timeout, output limits, and redacted structured errors. Routine Plan/bootstrap and later lifecycle command sequences cannot be composed as free-form shell by the model.

An exceptional command is legal only when it is either verbatim user-supplied or displayed as an immutable invocation descriptor and separately approved immediately before execution. It is never a fallback for a missing registered operation, never obtains trusted defaults, and never performs hidden state transitions.

### Repository Task Mapping

Extend Config v1 with an optional `automation` section:

```yaml
automation:
  runner: auto
  tasks: {}
```

`runner` is a strict supported enum selected by program code from configured and checked-in repository evidence. `tasks` maps registered semantic task keys to checked-in target names; values are validated as single target identifiers, not shell text. Neutral defaults execute nothing and preserve existing behavior.

For this repository, mappings refer to checked-in `mise.toml` targets for setup, formatting, linting, tests, build, quality, integration, and prompt installation. The registry chooses when each target is legal. Configuration changes must update TypeScript schema/defaults/contracts, Python-generated schema/default/fingerprint artifacts and generator behavior, `.harnessctl/config.yaml`, documentation, and conformance tests together.

### Plan and Bootstrap Coordinator

Implement a deterministic coordinator that derives the next legal operation from fresh issue authority, workspace/binding generations, Git topology, configuration, and recorded evidence. It rejects stale, repeated, reordered, skipped, or cross-workspace transitions.

Required semantic transitions include:

```text
workspace.allocate_provisional
session.bind
workspace.attach_epic
workspace.adopt_v1
session.recover
repository.task.run
bootstrap.install
session.release
```

Authority tools remain typed tools routed through the execution context rather than shell operations. The coordinator records operation ID, immutable descriptor digest, input digest, before/after generations, bounded result, and evidence references. It does not claim success from model narration.

### OpenCode Adapter

Use `ToolContext.sessionID` as the opaque binding identity and `directory`/`worktree` only as control-root discovery inputs. All harnessctl custom tools resolve a fresh execution context before calling generic operations.

Use `tool.execute.before` only for a version-tested allowlist whose path/cwd argument semantics are known and mutable before execution. For each supported built-in, the adapter either rewrites validated path arguments to the execution root or rejects the call. Unknown, external, or semantically unrouteable tools fail while bound; there is no permissive fallback to primary.

Free-form shell and Git mechanics used by Plan/bootstrap are replaced by registered semantic operations. If a user invokes an exceptional shell command, it follows the exceptional-command consent boundary and receives an explicit execution-root cwd from program code.

Capability probes and contract tests must establish session identity, hook ordering, argument mutation behavior, rejection behavior, and relevant built-in inventories for the documented minimum and known-compatible OpenCode versions. Runtime startup fails with a compatibility diagnostic when required capabilities are absent.

### Pi Adapter

Use `sessionManager.getSessionId()` as binding identity. Append a custom session entry containing non-authoritative recovery evidence `{repository_id, workspace_id, epic_id, generation}` after successful binding transitions; never place opaque session IDs or sensitive state in model context.

Override supported built-ins using Pi's exported `createReadToolDefinition`, `createWriteToolDefinition`, `createEditToolDefinition`, `createGrepToolDefinition`, `createFindToolDefinition`, `createLsToolDefinition`, and `createBashToolDefinition` factories. Resolve fresh binding state for each invocation and create or dispatch a definition bound to the current execution root. Use `tool_call` to reject stale, unsupported, or escaped operations. Argument mutation alone is not a trust boundary because Pi does not revalidate mutated input.

Exceptional user shell follows the same immutable descriptor and consent rules. Capability tests cover session start, switch, fork, resume, compaction/reload evidence, dynamic root selection, built-in overrides, rejection, and supported version ranges. Missing capabilities fail closed with actionable diagnostics.

## Compatibility and Migration

When `skills.cvs.workspaces` is false, no binding/workspace v2 state is created or consulted and existing adapters preserve current root behavior. Enabling routing is an explicit future policy action outside this Epic's implementation execution.

Existing v1 Epic workspace records remain readable through `workspace_status`. They are adopted only by the explicit, exact-match operation. Unknown future schemas are not modified. Failed adoption leaves all original state untouched.

Host adapters declare required capabilities plus minimum and supported version ranges. Exact package versions remain pinned only in lockfiles and reproducible CI/integration fixtures. Runtime capability detection, not architecture-level exact equality, controls compatibility.

## Failure Taxonomy

Expose stable typed failures for no binding, stale generation, repository mismatch, topology drift, path escape, Epic mismatch, illegal lifecycle, unsupported schema, unsupported host capability, unsupported tool, undeclared task, invalid operation state, consent descriptor mismatch, timeout, bounded-output overflow, and atomic-state failure. Messages include safe identifiers and remediation but no opaque session IDs, unrestricted command output, or secret-like values.

## Security and Concurrency

- Treat issue/document/memory content, model output, host arguments, config values, and tool output as untrusted input.
- Use strict schemas and reject unknown state/config fields.
- Never execute configuration values as shell fragments.
- Keep lock ownership bounded and recover stale locks using the existing safe lock policy.
- Verify generations again immediately before mutation and state commit.
- Redact configured secret patterns and bound command output before evidence persistence.
- Never silently route a bound session to primary after any error.

## Delivery Slices

1. Workspace identity and session binding core.
2. Execution-root containment and recovery.
3. Typed operation registry and bootstrap coordinator.
4. OpenCode session routing adapter.
5. Pi session routing adapter.
6. Compatibility, projections, documentation, and integration gates.

Each slice is independently testable and depends on all preceding shared-core slices. OpenCode and Pi adapter slices may proceed in parallel after slice 3.

## Verification

Required focused tests:

- strict state schemas, hashing, atomic writes, lock contention, generation conflicts, and failure recovery;
- provisional allocation, Epic attachment without rename, exact v1 adoption, ambiguous adoption rejection, and untouched legacy state;
- independent concurrent sessions bound to distinct workspaces from one primary-launched host;
- custom issue/document/memory/config operations receiving execution roots;
- path traversal, symlink escape, absolute primary, cross-workspace, missing worktree, branch drift, Epic mismatch, and stale generation rejection;
- operation descriptor determinism, immutable consent binding, argv ownership, `shell: false`, task mapping validation, idempotency, time/output limits, and evidence schemas;
- proof that model text cannot alter executable, argv, cwd, approval class, state transition, or evidence;
- OpenCode allowlist routing/rejection and Pi built-in override/recovery behavior across minimum and known-compatible fixtures;
- disabled-mode parity with no binding records;
- Config v1 TypeScript/Python/default/fingerprint parity and generated projection checks;
- repository formatting, lint, package tests, build, quality, docs, and fresh-process integration targets.

A fresh-process integration scenario must launch the host from primary, create or adopt two isolated workspaces, bind separate sessions, mutate and read workspace-local authorities/files, execute declared tasks in the correct roots, restart/recover the sessions, prove isolation, and leave primary project data unchanged.

## Documentation

Update architecture and SDLC documentation to distinguish control root from execution root, explain provisional and existing-Epic flows, list supported host capability ranges, document deterministic operations and exceptional commands, describe migration/adoption and rollback, and state the post-merge rebuild/install/reload requirement for harness self-development.

## Rollback

Disable workspace routing and session binding through configuration while preserving all worktrees, branches, v1/v2 workspace records, and binding records for diagnosis or later recovery. Do not delete or rewrite state automatically. Sessions that were bound before disablement must surface the policy change and require explicit recovery; they must not silently continue against primary.

## Estimates and Risks

Overall estimate: L, 5-9 engineering days. Uncertainty is high because OpenCode interception semantics and complete host built-in inventories require compatibility proof. Principal risks are incomplete tool coverage, host API drift, multi-record concurrency, path-containment mistakes, and accidental primary fallback. Fail-closed routing, capability fixtures, immutable descriptors, and fresh-process isolation tests are mandatory mitigations.
