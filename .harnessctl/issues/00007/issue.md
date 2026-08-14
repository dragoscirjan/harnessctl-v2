---
id: "00007"
type: task
title: Define canonical YAML issue contract and codec
status: done
created_at: 2026-08-14T13:43:36.998Z
updated_at: 2026-08-14T13:53:59.853Z
parent: "00004"
created_by: lead-engineer
assigned_to: backend-dev
---

# Define canonical YAML issue contract and codec

Given approved HLD/LLD
When issue entities are encoded or decoded
Then one versioned strict YAML contract preserves all managed state
And serialization, timestamps, scalars, comments, metadata, revisions, and slugs are deterministic.

## Deliverables

- `issues-contract.ts` types, validation, limits, and safe metadata boundary.
- Canonical YAML codec and deterministic UTF-8-safe slugging.
- Tests for malformed YAML, duplicate keys, aliases/tags, limits, precision, timestamps, and canonical byte stability.

## Acceptance

- [x] Contract preserves existing issue fields and embedded comments.
- [x] Re-encoding valid input is byte-stable.
- [x] Unsafe or ambiguous documents fail with actionable errors.
