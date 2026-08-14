---
id: "00015"
type: story
title: Design HLD for generic local SQLite projections
status: done
created_at: 2026-08-14T15:01:18.764Z
updated_at: 2026-08-14T15:11:14.651Z
parent: "00014"
created_by: lead-engineer
assigned_to: sys-architect
documents:
  - .specs/hld-00006-generic-local-sqlite-projections-v1.md
---

# Design HLD for generic local SQLite projections

Given Epic 00014
When architecture is designed
Then a versioned HLD defines provider abstraction, database schema/versioning, runtime-selected drivers, consistency state machine, query/reload/status flows, crash recovery, platform semantics, security, observability, and test strategy.

## Required Decisions

- Authority and canonical/cache transaction boundaries.
- Driver-neutral connection/statement API for Node and Bun.
- Provider registration and external-provider bypass.
- Schema, manifests, dirty markers, compatibility, locking, and atomic replacement.
- Issue and memory projection/query models.
- Write-through failure behavior and repair.
- Retirement of memory JSON cache.
- Cross-runtime/cross-platform verification and rollout.

## Acceptance

- [x] HLD preserves every Epic 00014 criterion.
- [x] Failure/crash states have deterministic recovery.
- [x] Design is implementation-ready for LLD decomposition.
