---
id: "00009"
type: task
title: Implement issue mutation locks and recovery
status: done
created_at: 2026-08-14T13:43:48.382Z
updated_at: 2026-08-14T14:09:52.229Z
parent: "00004"
depends_on:
  - "00008"
created_by: lead-engineer
assigned_to: backend-dev
---

# Implement issue mutation locks and recovery

Given concurrent or interrupted issue mutations
When recovery or a new mutation starts
Then one project lock serializes state changes and prepared transactions recover idempotently before classification.

## Deliverables

- `issues-transactions.ts` lock, manifests, staged writes, fsync/rename rules, recovery, conflicts.
- Final destination revalidation before committed marker.
- Cross-platform durability behavior and fault-injection tests.

## Acceptance

- [x] Stale revisions and external edits never overwrite canonical state.
- [x] Exact completed actions roll forward idempotently.
- [x] Mismatched destination bytes produce hard conflicts without overwrite.
