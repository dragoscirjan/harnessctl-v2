---
id: "00012"
type: task
title: Add issue projection boundary and adapter compatibility
status: done
created_at: 2026-08-14T13:44:04.551Z
updated_at: 2026-08-14T14:32:29.877Z
parent: "00004"
depends_on:
  - "00011"
created_by: lead-engineer
assigned_to: backend-dev
---

# Add issue projection boundary and adapter compatibility

Given host adapters and a future local cache
When issue entities are queried or mutated
Then filesystem decoding/projection and mutation notifications remain separate from OpenCode/Pi registration.

## Deliverables

- Cache-ready issue provider projection boundary.
- OpenCode/Pi adapter compatibility, including lossless metadata handling.
- Adapter tests across all issue tools.

## Acceptance

- [x] Provider exposes deterministic projected entities and successful mutation notifications.
- [x] Remote providers remain outside local persistence behavior.
- [x] Adapter payloads preserve accepted metadata semantics.
