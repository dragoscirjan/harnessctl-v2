---
id: "00013"
type: task
title: "Implement locked SQLite memory search cache"
status: done
parent: "00006"
depends: ["00012"]
opencode-agent: lead-engineer
opencode-assignee: lead-engineer
---

# Implement locked SQLite memory search cache

Given canonical repository records
When memory is searched
Then a disposable manifest-bound SQLite FTS cache returns bounded active results.

## Technical Requirements

- Build cache under lock using unique temporary DB and atomic replacement.
- Hash sorted paths, bytes, record schema, and index schema.
- Rebuild stale/corrupt cache; never silently use stale state.

## Acceptance Criteria

- [ ] Active-only scoped search respects result and character limits.
- [ ] Pull/change simulation triggers rebuild.
- [ ] Concurrent cache tests pass without corrupting prior cache.


## Comments

- 2026-08-11: Implemented manifest-bound disposable SQLite/FTS cache, atomic replacement, active scoped bounded search, and cache tests.
