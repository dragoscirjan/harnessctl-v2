---
id: "00007"
type: task
title: "Add config v2 memory settings and migration"
status: done
parent: "00006"
opencode-agent: lead-engineer
opencode-assignee: lead-engineer
---

# Add config v2 memory settings and migration

Given an existing v1 project config
When config is loaded or created
Then backward-compatible v2 communication and memory settings are validated consistently.

## Technical Requirements

- Add canonical config v2 schema, defaults, migration, and shared fixtures per LLD.
- Accept only `repository` memory backend in v2.
- Reject unsafe paths, invalid namespaces, and unsupported modes.

## Acceptance Criteria

- [ ] Python and TypeScript agree on valid and invalid fixtures.
- [ ] Existing v1 config remains usable with documented defaults.
- [ ] Config tests pass.


## Comments

- 2026-08-11: Added config v2 defaults/schema, v1 migration, validation, fixtures, and passing focused tests/typecheck.
