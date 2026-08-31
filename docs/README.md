# harnessctl documentation

Harnessctl helps people use LLMs through a deliberate software development lifecycle.
It turns a goal into bounded, reviewable work while keeping approvals, repository
authority, remote actions, and destructive operations under human control.

Start with [Getting started](getting-started.md). You will install the supported harness
commands, plan one real outcome, and follow it through Build, Verify, and Release.

## Guides

- [Getting started](getting-started.md): install harnessctl and run your first workflow.
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
