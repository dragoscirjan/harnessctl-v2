---
id: "00005"
type: story
title: Design HLD for canonical YAML issue storage
status: done
created_at: 2026-08-14T12:56:07.159Z
updated_at: 2026-08-14T13:26:10.848Z
parent: "00004"
created_by: product-owner
assigned_to: tech-advisor
documents:
  - .specs/hld-00004-canonical-yaml-issue-storage-v1.md
---

# Design HLD for canonical YAML issue storage

## Story

As a technical delivery team
I want an approved HLD for canonical YAML issue storage
So that implementation tasks preserve existing issue behavior while safely changing the persistence model.

## Design Request

Design the high-level solution for Epic #00004. The HLD must establish:

- Versioned YAML issue and embedded-comment contracts.
- Canonical serialization and validation boundaries.
- Deterministic `<id>-<title-slug>.yml` naming and collision handling.
- Active and archived discovery by stable issue ID.
- Atomic create, rewrite, title-driven rename, and recursive archive behavior.
- Append-only embedded comment semantics.
- Optimistic revision calculation and concurrent mutation behavior.
- Preservation of custom metadata and all managed hierarchy, relationship, body, link, and attribution fields.
- Error and rollback behavior for multi-issue mutations.
- Provider projection boundaries required by the later generic SQLite cache.
- Cross-platform filesystem behavior and test strategy.
- Delivery sequencing that explicitly excludes legacy migration but prevents accidental rollout before separate migration work exists.

## Acceptance Criteria

### Scenario: Complete design coverage

Given Epic #00004 and its acceptance criteria
When the HLD is reviewed
Then every issue operation and storage transition has an explicit design path
And unresolved choices, assumptions, and risks are identified.

### Scenario: Canonical contract

Given the HLD defines issue persistence
When reviewers inspect the contract
Then one YAML document contains all issue-managed state
And canonical serialization, versioning, validation, and unknown-field behavior are unambiguous.

### Scenario: Safe filesystem mutation

Given create, update, rename, comment, relationship, and archive operations
When the HLD describes failure handling
Then partial-write prevention, concurrency checks, rollback limits, and recovery behavior are testable.

### Scenario: Cache-ready abstraction

Given the SQLite Epic consumes issue entities
When the issue HLD defines its provider boundary
Then filesystem discovery, canonical decoding, entity projection, and mutation notifications are separable from host adapters and cache drivers.

### Scenario: Test decomposition readiness

Given the HLD is approved
When implementation planning begins
Then work can be decomposed into ordered, independently verifiable tasks without reopening product-level storage decisions.
