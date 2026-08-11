---
id: "00011"
type: task
title: "Add canonical memory contracts and secret screening"
status: done
parent: "00006"
depends: ["00010"]
opencode-agent: lead-engineer
opencode-assignee: lead-engineer
---

# Add canonical memory contracts and secret screening

Given candidate memory records or tombstones
When validated
Then canonical schema, scope, provenance, links, and mandatory secret policy are enforced.

## Technical Requirements

- Add authoritative JSON schemas and byte-identical Python/npm package copies.
- Implement strict YAML parsing, canonical serialization, and link validation.
- Scan every string using field, format, marker, entropy, and deny-pattern checks.

## Acceptance Criteria

- [ ] Shared valid/invalid fixtures pass in both runtimes.
- [ ] Representative secrets fail before mutation.
- [ ] Schema copy hash verification passes.


## Comments

- 2026-08-11: Added canonical schemas/package source, strict runtime validation, YAML safety checks, project scope/provenance rules, and mandatory secret screening with tests.
