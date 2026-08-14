---
id: "00011"
type: task
title: Implement issue validation and recursive archive
status: done
created_at: 2026-08-14T13:43:57.499Z
updated_at: 2026-08-14T14:24:29.456Z
parent: "00004"
depends_on:
  - "00010"
created_by: lead-engineer
assigned_to: backend-dev
---

# Implement issue validation and recursive archive

Given canonical issue graphs
When validation or recursive archive runs
Then graph defects are reported without mutation and eligible trees move transactionally to archived storage.

## Deliverables

- Full schema/storage/hierarchy/relationship/link validation.
- Recursive archive planning and recoverable multi-file transaction.
- Tests for descendants, cycles, broken links, partial failures, and unrelated issues.

## Acceptance

- [x] Validation reports malformed/ambiguous state without changing files.
- [x] Archive moves only eligible issue trees.
- [x] Interrupted archive recovers to a reported deterministic result.
