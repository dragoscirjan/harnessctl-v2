# Getting started

This tutorial uses the installed `/work-plan` prompt command to turn one safe software
goal into an approved, executable Epic plan. It intentionally stops before Build. You
remain in control of every proposed read, issue mutation, remote action, and destructive
operation.

## 1. Confirm installation

Complete [Installation](installation.md), reload or restart OpenCode or Pi, and open the
project you want to plan. Confirm that the harness exposes `/work-plan`.

Harnessctl installs six separate prompt commands. Conceptual `/work plan` wording may
appear in lifecycle explanations, but grouped `/work` dispatch is not an installed
command.

## 2. Choose a bounded outcome

Use a small, reversible outcome that can be accepted from repository evidence. For
example:

```text
Add a health endpoint with a focused automated check and usage documentation.
```

Avoid credentials, production mutations, deployments, or broad cleanup in a first run.

## 3. Run Plan

Enter the outcome after the installed command:

```text
/work-plan Add a health endpoint with a focused automated check and usage documentation
```

Plan first presents a bounded action set classified as Required, Recommended, Optional,
or Not needed. Review the proposed reads and local operations, narrow them if needed, and
approve only that set. Declining optional work does not authorize a broader alternative.

Plan then resolves one existing Epic or proposes the issue hierarchy needed for the
outcome. Review objectives, scope, acceptance criteria, dependencies, estimates, risks,
and non-goals. Issue, relationship, and document mutations require exact approval before
they occur.

## 4. Check the result

A successful run stops with an approved executable plan. Its compact result identifies:

- **Epic:** the authoritative Epic ID.
- **Phase:** `Plan`.
- **Done and Evidence:** what was confirmed and where the plan is recorded.
- **Next:** normally the installed `/work-build` command for that Epic.
- **Blockers:** unresolved authority, dependencies, or ambiguity, if any.
- **Checkpoint:** whether compact confirmed progress was stored.

No source implementation, formal verification, release, push, or deployment belongs to
this first success.

## Resume or recover

If Plan stops on ambiguity, answer the stated blocker and run `/work-plan` again with the
Epic ID or clarified outcome. If a known Plan step was interrupted after a checkpoint,
use `/work-continue <epic-id>` and approve its newly bounded action set. Treat current
issues, documents, source, Git state, and tests as authority when they disagree with a
checkpoint.

When you deliberately continue later, use the exact Epic ID with the separate
`/work-build`, `/work-verify`, and `/work-release` commands. Each phase asks for its own
bounded approval and stops at its own boundary.

## What stays under your control

Remote and destructive operations require fresh, action-specific consent. Approval for
Plan does not authorize Build, issue closure, remote work, or destructive work. A plan,
checkpoint, memory record, or provider response never overrides current repository
authority or your decision.

Read the [command reference](command-reference.md) for exact stopping points or the
[SDLC guide](sdlc.md) for lifecycle behavior.
