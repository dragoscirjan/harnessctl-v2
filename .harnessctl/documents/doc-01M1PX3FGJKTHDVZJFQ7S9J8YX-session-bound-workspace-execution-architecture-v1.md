---
id: "doc-01M1PX3FGJKTHDVZJFQ7S9J8YX"
title: "Session-Bound Workspace Execution Architecture"
kind: hld
status: approved
version: 1
created_at: "2026-09-04T19:07:37.362Z"
updated_at: "2026-09-04T19:28:57.902Z"
created_by: "OpenCode"
metadata: {"initiative":"hrn-00207","routing_epic":"hrn-01M1PX20Z7J3A6RX95P7DGXF33","lifecycle_epic":"hrn-00210","baseline":"doc-00019"}
---

# Session-Bound Workspace Execution Architecture

## Purpose

Define how a long-lived harness launched from a primary Git checkout transparently executes each SDLC session against an isolated workspace. This architecture corrects the caller-cwd assumption in `doc-00019` without discarding its deterministic Git safety primitives.

## Architectural Decision

Separate the harness control plane from the project execution plane.

- The **launch root** is the primary checkout from which the host process starts. The process remains there.
- A **session binding** associates one host session with one repository, workspace identity, optional Epic ID, and execution root.
- The **execution root** is the only root used by project-facing operations after binding.
- The **control plane** discovers repositories, allocates and reconciles workspaces, stores bindings and locks, coordinates integration, and performs proven-safe cleanup.

No command relies on persistent process `chdir`, user relaunch, or repository-global active-workspace state.

## Context Model

A resolved context contains at least:

```text
host
session identity
repository identity
launch root
workspace identity
workspace path
workspace branch
base commit
Epic ID or null
lifecycle state
binding generation
```

Workspace identity is collision-safe and independent of Epic identity. This permits Plan to allocate a provisional workspace before a new Epic exists. Binding the eventual Epic updates control-plane metadata without renaming the workspace path or branch.

Bindings are session-local. Multiple tabs launched from one primary checkout may resolve to different workspaces. Control-plane records live in the Git common directory or equivalent harness-owned operational storage, use schema versions and atomic writes, and are validated against Git topology before use.

## Routing Contract

Once a session is bound, every project-facing operation receives the resolved execution root explicitly. This includes:

- source reads, writes, searches, and generated files;
- shell commands, Git operations, tests, builds, and configured installs;
- filesystem Issues, Documents, repository Memory, comments, links, and checkpoints;
- task artifacts, logs intended for the Epic branch, and project-local caches or build outputs;
- external tools that expose a verifiable repository or working-directory parameter.

Operational run records that cannot belong in project authority may remain in control-plane storage, but they must carry repository, workspace, session, and Epic identity; their processes still execute inside the workspace.

The control plane alone may target the launch root or Git common directory for repository discovery, workspace allocation, binding recovery, integration coordination, and cleanup. Integration operations require an explicit mode and cannot be reached through ordinary project routing.

## Programmatic Orchestration

Routine lifecycle work is selected and executed by typed program logic, not by model-authored command strings.

- A versioned operation registry defines each semantic operation ID, typed inputs, allowed lifecycle states, approval class, executable or repository task target, argument construction, cwd policy, timeout, output bounds, and evidence schema.
- The model may request a semantic operation and supply validated domain inputs. It cannot choose or rewrite the executable, argv, execution root, approval policy, state transition, or evidence contract.
- Deterministic phase coordinators compute the legal next operations from current authority, binding, Git, provider, and verification state. They reject skipped, reordered, duplicated, stale, or cross-workspace transitions.
- Repository automation uses declared task-runner targets where available, such as named `mise` tasks. Discovery and target selection are programmatic and constrained by configuration or a checked-in manifest; the model does not synthesize routine shell pipelines.
- Git and process execution use bounded argument arrays with `shell: false`, explicit execution-root cwd, controlled environment inheritance, timeouts, output limits, and structured results.
- Consent attaches to the resolved operation descriptor shown to the user, not to mutable model prose. A changed descriptor invalidates prior consent.
- Unsupported or unroutable work fails closed with the missing operation capability. It does not fall back to free-form shell.
- An exceptional command path may execute only a command supplied verbatim by the user or separately previewed and explicitly approved for that invocation. It is never inferred as a default, promoted into trusted automation without code review, or used to bypass a missing typed operation.

This contract applies to workspace allocation, authority mutation, bootstrap, checks, builds, installs, Git delivery, integration, cleanup, and evidence collection. The LLM remains responsible for intent interpretation, ambiguity resolution, design reasoning, and presenting choices; program code owns routine mechanics and safety invariants.

## Enforcement

Routing correctness belongs in the tool layer, not agent memory.

- A bound project tool must never silently fall back to the launch root.
- Relative paths resolve under the execution root.
- Canonical and symlink-resolved paths must remain contained by the execution root.
- Absolute paths into the primary checkout are rejected unless the operation is explicitly control-plane or integration work.
- Tools that cannot prove workspace targeting are unavailable while bound.
- External MCP tools require an explicit repository-path capability or a workspace-aware proxy.
- Every mutation revalidates binding generation and current workspace topology to prevent stale-session writes.
- Every executable operation must resolve through the trusted operation registry or the explicit exceptional-command path.

OpenCode integration uses stable host session identity and supported pre-tool interception to route or reject built-in operations. Pi integration uses recoverable extension state and workspace-aware replacements or wrappers for built-in operations. Required capabilities, supported API ranges, and the complete routable tool inventory must be proven in the routing Epic LLD before implementation.

## Workspace Lifecycle

The control-plane lifecycle extends the `doc-00019` state machine to support provisional identity, binding, bootstrap, release, and recovery. Exact names are finalized in the LLD, but behavior must cover:

```text
allocating -> provisional -> bootstrap_required -> active
active -> release_pending -> review_pending -> integrated
integrated -> cleanup_ready -> closed
```

Failure or interruption produces a recoverable nonterminal state, never blind retry or automatic deletion. A lost session binding does not remove a workspace. Continue reconciles current Git topology, binding metadata, workspace authority, and checkpoints before reattachment. Ambiguous ownership requires user selection or operator repair.

## Planning Flows

For an existing Epic, Plan resolves authority from the launch repository, creates or reattaches an eligible workspace, binds the session, then continues immediately through the execution root.

For a request without an Epic, Plan verifies an acceptable primary base, creates a provisional workspace from that commit, binds the session, creates Initiative/Epic authority inside the workspace, records the Epic association, and continues there. New branch-local authority remains intentionally invisible to primary and other workspaces until integration.

A dirty primary checkout blocks new workspace allocation. The harness never silently stashes, commits, copies, resets, or discards primary changes.

## Bootstrap And Install State

A newly created worktree contains committed files, not ignored dependencies or build outputs. It therefore enters an explicit bootstrap state.

Repositories may declare bounded bootstrap operation IDs or task-runner targets. Execution requires normal command consent because bootstrap can run project code, use the network, and consume resources. The trusted executor derives argv and runs with the workspace as cwd; the model never composes the bootstrap command. Missing, undeclared, unroutable, or declined bootstrap remains an actionable blocker.

Branch-dependent state such as `node_modules`, `.venv`, `dist`, generated code, and local build caches remains workspace-local. Content-addressed package download caches may remain shared when the underlying tool supports that safely. Secrets are neither copied nor inferred automatically.

## SDLC Lifecycle

Plan creates or attaches the binding. Build, Verify, Release, and Continue resolve the same binding and execution root without asking the user to change directory. Each phase validates repository, Epic, branch, workspace state, binding generation, and routed root before project mutation.

Each phase invokes a deterministic coordinator that exposes only currently legal semantic operations. Prompt policy cannot replace the coordinator's state machine, command construction, consent enforcement, or completion evidence.

Checkpoints include workspace and binding identity as advisory recovery evidence. Fresh source, authority, Git topology, provider state, and control-plane state remain authoritative.

Release keeps the workspace while a PR, review, checks, or integration is pending. Cleanup is eligible only after integration is proven, intended files are committed, no tracked or untracked state would be lost, the integrated commit is reachable from the target branch, and no live session owns the workspace. Cleanup targets only the registered path and retains or deletes branches solely under explicit repository policy.

## Harness Self-Development

Harnessctl is a bootstrap exception because the controlling process loads the implementation being modified. The routing foundation is delivered with workspace support disabled using the established non-workspace workflow. Proposed packages are built and tested in their implementation checkout and never hot-loaded into the controlling process. After merge, an intentional rebuild/install and host reload activates the new implementation. Subsequent lifecycle integration is then developed and verified through the new routing architecture.

## Compatibility And Migration

`skills.cvs.workspaces: false` preserves current launch-root behavior and creates no binding state. Existing `doc-00019` Epic-keyed workspace records and worktrees are preserved. A migration or adoption operation may associate a mechanically verified existing record with a session only when repository, path, branch, Epic, ownership lock, and lifecycle all match; otherwise it fails closed. No automatic workspace deletion, metadata rewrite, or legacy authority rewrite occurs.

Host adapters use capability detection and explicit supported version ranges rather than architecture-level exact-version binding. Missing required hooks fail closed with a compatibility diagnostic. Minimum and known-compatible host versions are documented and tested; exact versions are pinned only in dependency lockfiles and reproducible CI or integration fixtures.

Rollback disables new binding and routing while preserving worktrees, branches, and common-directory state for later recovery. It never redirects a bound session to primary silently.

## Security And Concurrency

Control-plane records are bounded regular files with restrictive permissions, schema validation, atomic publication, and common-directory locking. Host/session keys are namespaced to prevent collisions. User-controlled IDs never become unchecked filesystem paths or shell text. Commands use argument vectors and explicit cwd. Concurrent workspace allocation, binding, release, and cleanup serialize only the shared state they mutate.

Operation descriptors and consent evidence are immutable for one invocation. Domain inputs are schema-validated before argv construction, and model text never crosses directly into a shell interpreter.

The architecture prevents filesystem and authority collisions between sessions. It does not eliminate semantic Git conflicts; synchronization and integration surface those conflicts inside an isolated workspace before primary mutation.

## Delivery Decomposition

`hrn-00208` provides collision-safe authority identities. `hrn-00209` provides the implemented deterministic Git baseline. `hrn-01M1PX20Z7J3A6RX95P7DGXF33` adds session binding, provisional identity, execution-root routing, typed operation orchestration, containment, bootstrap, recovery, and host adapters while workspaces are disabled. After merge and reload, `hrn-00210` integrates deterministic SDLC phase coordinators with that foundation.

## Verification Direction

Verification must cover concurrent sessions from one launch root, existing and provisional Epic flows, every project authority adapter, built-in tools, external-tool refusal, path and symlink containment, stale binding generations, host restart recovery, dirty-primary refusal, bootstrap consent and cwd, disabled compatibility, existing-record adoption, release retention, integration proof, cleanup ownership, generated projections, documentation, package builds, and fresh-process integration tests.

Automation tests must prove the same state and typed inputs always resolve to the same operation descriptor; model-controlled text cannot alter executable, argv, cwd, consent class, transition, or evidence schema; illegal order and stale generation fail before process execution; repository task targets run only through declared mappings; and exceptional commands require fresh invocation-specific approval.

Compatibility tests must exercise required adapter capabilities at the documented minimum and known-compatible host versions, reject missing or incompatible capabilities deterministically, and pin exact host versions only within reproducible test fixtures.

## Open Design Work

The routing Epic LLD must enumerate required OpenCode and Pi session/interception capabilities, define minimum and supported API ranges plus runtime detection and fail-closed diagnostics, define the binding schema and generation rules, finalize lifecycle state names, inventory routable built-in and external tools, define provisional workspace branch/path mapping, specify the typed operation registry and deterministic phase coordinator interfaces, map supported repository task runners and bootstrap targets, define the exceptional-command boundary, and provide recovery and migration algorithms.
