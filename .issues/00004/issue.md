---
id: "00004"
type: epic
title: Adopt canonical single-file YAML issues
status: open
created_at: 2026-08-14T12:55:37.125Z
updated_at: 2026-08-14T13:44:08.068Z
parent: "00001"
created_by: product-owner
children:
  - "00005"
  - "00007"
  - "00008"
  - "00009"
  - "00010"
  - "00011"
  - "00012"
  - "00013"
documents:
  - .specs/lld-00005-canonical-yaml-issue-storage-v1.md
---

# Adopt canonical single-file YAML issues

## Problem

Filesystem issues currently spread one logical issue across a Markdown/frontmatter document and zero or more comment files. This increases filesystem operations, complicates atomic updates, and creates an awkward source model for caching and validation.

## Outcome

Each issue becomes one versioned, canonical YAML document whose readable filename combines stable identity with a deterministic title slug.

## User Value

- Review one file to understand the complete issue state.
- Move, archive, synchronize, and index issues as cohesive entities.
- Reduce filesystem discovery and parsing overhead.
- Preserve Git-friendly, human-readable canonical storage.

## In Scope

- Active issue path: `.issues/<id>-<title-slug>.yml`.
- Archived issue path: `.issues/archived/<id>-<title-slug>.yml`.
- One YAML contract for identity, type, title, status, timestamps, attribution, assignment, hierarchy, relationships, document links, custom metadata, body content, and embedded append-only comments.
- Deterministic, filesystem-safe slug generation.
- Atomic rename when title changes; issue ID remains stable.
- Atomic canonical writes and deterministic optimistic revision checks.
- Updated behavior for issue ID allocation, create, get, list, update, transition, comment, relate, unrelate, document linking, validation, and recursive archive.
- A provider projection boundary usable by the later SQLite-cache Epic.
- Tests covering active, archived, related, commented, renamed, invalid, and concurrent issue states.

## Out of Scope

- Converting existing Markdown/frontmatter issues; migration will be delivered separately.
- Automatic legacy compatibility or silent conversion.
- SQLite implementation.
- Remote issue providers.

## Dependencies

- Parent Initiative: #00001.
- Composition request: #00002.
- This Epic establishes the issue representation consumed by the SQLite-cache Epic.
- Rollout is blocked by migration Story #00006; migration implementation remains separately scoped.

## Assumptions and Boundaries

- Canonical YAML is authoritative; projections are disposable.
- Mixed legacy/YAML storage is rejected with actionable diagnostics, never merged implicitly.
- All managed paths are validated as repository-relative, symlink-safe, and traversal-free.
- YAML parsing uses duplicate-key rejection, alias/custom-tag rejection, and bounded file/document/string/collection limits.
- Single-file mutations use same-directory durable temporary writes and atomic replacement where supported.
- Multi-file operations use one project mutation lock, prepared manifests, idempotent recovery, and explicit rollback limits.
- Projection consistency is owned by the filesystem provider mutation boundary; later caches consume successful canonical changes.

## Risks

- Filesystem rename/fsync semantics differ across Windows and POSIX; platform-specific durability behavior requires tests and documentation.
- Crashes during recursive archive can leave prepared work requiring deterministic roll-forward recovery.
- Manual edits can create duplicate IDs, unsafe names, broken references, or non-canonical YAML; validation must report without mutation.
- Symlink races and oversized YAML can become security or availability risks unless checked at discovery and mutation boundaries.
- Existing repositories cannot roll out this format until Story #00006 migration is delivered.

## Acceptance Criteria

### Scenario: Create one canonical issue file

Given filesystem issue storage is configured
When a user creates an issue
Then exactly one `.issues/<id>-<title-slug>.yml` canonical issue file is created
And the complete initial issue state validates against the versioned issue contract
And no issue-specific directory is created.

### Scenario: Keep comments in the issue document

Given an issue already exists
When a user appends a comment
Then the comment is appended to the issue document with stable identity, author, timestamp, and body
And previous comments cannot be overwritten through the comment operation
And no separate comments directory or file is created.

### Scenario: Rename after title change

Given an issue title changes
When the update succeeds
Then the canonical file is atomically renamed using the new deterministic slug
And the old path no longer exists
And issue relationships continue referencing the unchanged ID.

### Scenario: Preserve all managed state

Given an issue has hierarchy, relationships, links, metadata, body content, and comments
When any supported issue tool reads or updates it
Then unrelated fields and unknown permitted metadata remain intact
And the resulting YAML remains canonical and valid.

### Scenario: Enforce optimistic concurrency

Given a caller holds an outdated revision
When it attempts a mutation requiring the revision
Then the operation rejects the stale update
And canonical issue state remains unchanged.

### Scenario: Archive an issue tree

Given an issue and active descendants are eligible for archival
When recursive archive succeeds
Then each canonical YAML file moves to `.issues/archived/` with its filename convention preserved
And unrelated active issues remain untouched
And partial failure does not leave an unreported mixed result.

### Scenario: Reject malformed or ambiguous storage

Given malformed YAML, duplicate issue IDs, unsafe filenames, conflicting filenames for one ID, broken hierarchy, or invalid relationships exist
When issue validation runs
Then it reports actionable findings without mutating canonical files.

### Scenario: Exclude migration

Given legacy Markdown issue storage exists
When this Epic is delivered
Then no legacy file is silently converted
And implementation clearly identifies migration as separately required before rollout to an existing repository.
