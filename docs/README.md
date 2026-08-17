# harnessctl documentation

These guides explain how the repository behaves now and label roadmap concepts as
planned. They route to authoritative material rather than repeating the product
overview in the [root README](../README.md) or the complete intended lifecycle in
[FLOWS.md](../FLOWS.md).

## Guides

- [SDLC](sdlc.md): 18 rendered commands, stage boundaries, and approval gates.
- [Skills](skills.md): caveman, memory, and issue-tracking guidance.
- [Configuration](configuration.md): defaults, overlay behavior, and every current
  setting.
- [Memory](memory.md): canonical YAML, immutable records, security, and cache limits.
- [Issues](issues.md): canonical filesystem workflow and configured remote CLI routing.

## Authority and status

For exact behavior, source and current approved designs take precedence over these
guides. Tests define verified compatibility. Topic guides provide user-facing
orientation. [FLOWS.md](../FLOWS.md) describes the detailed intended lifecycle and may
include work not yet delivered. Roadmap sections explicitly say “not implemented.”

The designs most relevant to these pages are the
[configuration design](../.specs/lld-00001-generic-configuration-tools-and-harness-adapters-v1.md),
[skills and memory design](../.specs/lld-00002-caveman-and-memory-skills-v1.md),
[SDLC memory-hooks design](../.specs/lld-00002-caveman-memory-hooks-across-sdlc-commands-v2.md),
[local persistence design](../.specs/lld-00006-simplified-local-persistence-and-sqlite-write-through-cache-v1.md),
and [documentation and issue-routing design](../.specs/lld-00007-documentation-set-and-configured-issue-tracking-skill-v1.md).

## Product boundary

harnessctl distributes workflow instructions and generic tools into coding harnesses.
It is not an agent runtime, authorization system, remote issue adapter, credential
store, or autonomous merge service. Host permissions, provider authentication, human
approvals, and authoritative repository evidence remain outside prompt guarantees.
