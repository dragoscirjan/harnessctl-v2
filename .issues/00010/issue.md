---
id: "00010"
type: task
title: Refactor issue operations for single-file YAML
status: done
created_at: 2026-08-14T13:43:53.556Z
updated_at: 2026-08-14T14:17:03.949Z
parent: "00004"
depends_on:
  - "00009"
created_by: lead-engineer
assigned_to: backend-dev
---

# Refactor issue operations for single-file YAML

Given the canonical storage layer
When issue tools create, get, list, update, transition, comment, relate, unrelate, or link documents
Then operations preserve unrelated state and write one YAML document per issue.

## Deliverables

- Refactored `issues.ts` façade and operation wiring.
- Embedded append-only comments with stable identity/author/time/body.
- Deterministic optimistic revisions and metadata preservation.

## Acceptance

- [x] Existing public operation signatures remain compatible unless LLD explicitly changes them.
- [x] Title updates rename files while relationships retain IDs.
- [x] Comment operations cannot overwrite prior comments.
