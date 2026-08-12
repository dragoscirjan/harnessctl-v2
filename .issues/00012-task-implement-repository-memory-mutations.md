---
id: "00012"
type: task
title: "Implement repository memory mutations"
status: done
parent: "00006"
depends: ["00011"]
opencode-agent: lead-engineer
opencode-assignee: lead-engineer
---

# Implement repository memory mutations

Given a repository memory namespace
When records are stored, superseded, or deleted
Then immutable durable files preserve history with deterministic concurrency behavior.

## Technical Requirements

- Implement ULIDs, Git-friendly folder mapping, exclusive creation, and project mutation lock.
- Implement active-state checks, supersession, and tombstones.
- Never overwrite canonical records.

## Acceptance Criteria

- [ ] Store/get/list/supersede/delete tests pass.
- [ ] Competing mutations produce first-writer-wins conflicts.
- [ ] Canonical directory writes are durable.


## Comments

- 2026-08-11: Implemented ULID records, exclusive durable writes, mutation locking, immutable supersession/tombstones, active-state conflicts, and history tests.
