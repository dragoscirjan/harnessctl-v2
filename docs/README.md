# harnessctl documentation

These guides explain how the repository behaves now and label roadmap concepts as
planned. They route to authoritative material rather than repeating the product
overview in the [root README](../README.md) or the complete intended lifecycle in
[FLOWS.md](../FLOWS.md).

## Guides

- [SDLC](sdlc.md): four Epic lifecycle phases, standalone refresh, and approval gates.
- [Skills](skills.md): coding, caveman, memory, issue-tracking, and host guidance.
- [Configuration](configuration.md): defaults, overlay behavior, and every current
  setting.
- [Memory](memory.md): canonical YAML, immutable records, security, and cache limits.
- [Issues](issues.md): canonical filesystem workflow and remote CLI/MCP capabilities.
- [Documents](documents.md): configurable repository-local design authority and lifecycle.
- [CVS and MCP providers](cvs.md): Git/Jujutsu, per-operation remote capability selection, generated
  OpenCode/Pi configuration, consent, and security boundaries.
- [Code intelligence](code-intelligence.md): opt-in external MCP retrieval, source
  authority, fallback, migration, and user-owned lifecycle boundaries.
- [External code-intelligence providers](code-intelligence-providers.md): sourced,
  non-endorsing provider comparison, host examples, limitations, and manual cleanup.

## Authority and status

The prior configurable transport-selector and deterministic MCP-first/fallback policy is
superseded. Current guidance always enumerates valid CLI capabilities and includes MCP only
when configured and available; the agent chooses per operation before mutation and never
switches routes after mutation begins.

For exact behavior, source and current approved designs take precedence over these
guides. Tests define verified compatibility. Topic guides provide user-facing
orientation. [FLOWS.md](../FLOWS.md) describes the detailed intended lifecycle and may
include work not yet delivered. Roadmap sections explicitly say “not implemented.”

The current Config v1 contract is governed by the approved
[architecture and ownership HLD](../.harnessctl/documents/doc-00015-config-v1-architecture-and-ownership-v2.md)
and
[contract generation and host projection LLD](../.harnessctl/documents/doc-00016-config-v1-contract-generation-and-host-projection-v2.md).
Historical context for non-Config-v1 topics, not current Config v1 authority, includes the
[skills and memory design](../.harnessctl/documents/doc-00002-caveman-and-memory-skills-low-level-design-v1.md),
[SDLC memory-hooks design](../.harnessctl/documents/doc-00002-caveman-memory-hooks-across-sdlc-commands-v2.md),
[local persistence design](../.harnessctl/documents/doc-00007-simplified-local-persistence-and-sqlite-write-through-cache-v1.md),
and [documentation and issue-routing design](../.harnessctl/documents/doc-00008-documentation-set-and-configured-issue-tracking-skill-v1.md).
Documents are governed by the approved
[HLD](../.harnessctl/documents/doc-00013-repository-local-sdlc-design-document-management-v4.md)
and
[LLD](../.harnessctl/documents/doc-00014-repository-local-sdlc-design-document-management-v4.md).

## Product boundary

harnessctl distributes workflow instructions and generic tools into coding harnesses.
It is not an agent runtime, authorization system, remote issue adapter, credential
store, or autonomous merge service. Host permissions, provider authentication, human
approvals, and authoritative repository evidence remain outside prompt guarantees.
