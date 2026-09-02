# harnessctl documentation

Harnessctl helps people use LLMs through a deliberate software development lifecycle.
It turns a software goal into bounded, reviewable work while keeping approvals,
repository authority, remote actions, and destructive operations under human control.
Use it when you want an LLM coding session to follow explicit Plan, Build, Verify, and
Release boundaries instead of making an open-ended change.

## Start here

1. [Install harnessctl](installation.md) into a project for OpenCode or Pi.
2. [Getting started](getting-started.md) plans your first outcome and stops with an
   approved Epic plan.
3. Use the [command reference](command-reference.md) when you are ready for another
   lifecycle phase.

## Guides and reference

- [Docs overview](docs-overview.md): choose the shortest route for your current task.
- [SDLC](sdlc.md): understand and use the four Epic lifecycle phases.
- [Configuration](configuration.md): defaults, overlay behavior, and every current
  setting.
- [Skills](skills.md): choose the guidance available during each kind of work.
- [Harnesses](harnesses.md): OpenCode, Pi, Claude, and Codex support status.
- [Memory](memory.md): canonical YAML, immutable records, security, and cache limits.
- [Issues](issues.md): canonical filesystem workflow and remote CLI/MCP capabilities.
- [Documents](documents.md): configurable repository-local design authority and lifecycle.
- [CVS and MCP providers](cvs.md): Git/Jujutsu, per-operation remote capability selection, generated
  OpenCode/Pi configuration, consent, and security boundaries.
- [Code intelligence](code-intelligence.md): opt-in external MCP retrieval, source
  authority, fallback, migration, and user-owned lifecycle boundaries.
- [External code-intelligence providers](code-intelligence-providers.md): sourced,
  non-endorsing provider comparison, host examples, limitations, and manual cleanup.
- [Feature status and evidence](status-and-evidence.md): shared status labels,
  evidence classes, and freshness rules.

## Product boundary

harnessctl does not replace your coding harness, model, issue tracker, or source-control
provider. It coordinates how they are used. Keep credentials outside project
configuration and review every requested mutation before approving it.
