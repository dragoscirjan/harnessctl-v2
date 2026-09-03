---
id: "doc-00018"
title: "Collision-Safe Canonical Authority Identities"
kind: lld
status: approved
version: 1
created_at: "2026-09-03T13:33:57.558Z"
updated_at: "2026-09-03T13:59:46.106Z"
created_by: "OpenCode"
metadata: {"epic":"hrn-00208"}
---

# Collision-Safe Canonical Authority Identities

## Purpose

Define collision-safe repository-local identifiers for canonical Issues and Documents so independent Git worktrees can create authority records without coordinating a numeric sequence.

## Context

Issue and Document creation currently derives the next numeric identifier from the files visible in one working tree. Worktree-local locks cannot coordinate independent branches, so concurrent creation can select the same identifier and canonical path. Memory already uses cryptographically random Crockford ULIDs.

This design changes identity allocation and parsing only. Canonical YAML authority, locations, revisions, locking, relationships, archive behavior, disposable cache projection, and thin adapter boundaries remain unchanged.

## Identity Contract

New Issue IDs use the configured Issue prefix followed by exactly 26 uppercase Crockford Base32 characters. With the default prefix, the form is `hrn-<ULID>`.

New Document IDs use `doc-<ULID>`.

Readers accept two suffix forms:

- Legacy Issue suffix: one or more decimal digits, preserving the existing contract.
- Legacy Document suffix: at least five decimal digits, preserving the existing contract.
- New suffix: exactly 26 uppercase Crockford characters from `0-9A-HJKMNP-TV-Z`.

Lowercase ULIDs and ambiguous Crockford characters `I`, `L`, `O`, and `U` are invalid. Prefix validation remains unchanged.

## Generation

Extract Memory's existing ULID logic into a small shared generic-tools identifier module. Production generation uses the current 48-bit millisecond timestamp and 80 bits from cryptographic randomness. Tests receive deterministic clock and entropy inputs without weakening production defaults.

Issue and Document creation always generate ULIDs. Numeric allocation remains readable compatibility code only and is not used for new records.

Canonical publication remains exclusive and fail-closed. An identity or path collision must never overwrite authority. A bounded retry may be used only for a detected generated-identity collision and must otherwise preserve the existing error behavior.

## Parsing And Discovery

Centralize escaped-prefix identity matching so Issue contracts, Issue storage discovery, Documents, document-link validation, and local persistence use the same suffix rules.

Canonical filename validation continues to require metadata identity and filename identity to match exactly. ULID suffixes contain no hyphen, preserving unambiguous extraction with valid configured Issue prefixes.

Comment IDs remain `<issue-id>-C####`; only base Issue validation changes. Comment sequence allocation remains numeric and local to its Issue.

## Ordering

Mixed catalogs use a deterministic total order:

1. Legacy numeric IDs before ULID IDs.
2. Legacy IDs ordered by numeric suffix, with existing codepoint fallback for ties.
3. ULID IDs ordered lexicographically by uppercase suffix.

This preserves familiar ordering for existing repositories while keeping new records chronologically sortable under normal ULID generation.

## Persistence And Compatibility

SQLite projection columns already store IDs as strings; no cache schema migration is required. Rebuildable cache loaders must accept both identity forms.

Existing canonical files are never rewritten automatically. Archive, restore, version lineage, parent/dependency relationships, Issue-to-Document links, validation, and adapter transport treat IDs as opaque validated strings after parsing.

Dual-format reading becomes a permanent compatibility requirement after a ULID authority record is committed. A rollback may stop generating ULIDs but cannot restore numeric-only readers without breaking persisted authority.

ULIDs eliminate independent-worktree allocation and path collisions. They do not solve concurrent semantic mutation of the same authority record; revisions and Git reconciliation continue to govern that case.

## Implementation Areas

- Shared generic-tools ULID generation and identity predicates.
- Issue creation, contracts, storage discovery, sorting, comments, and document-link checks.
- Document creation, parsing, discovery, lineage, archive, restore, and validation.
- Local Issue and Document cache projection.
- OpenCode and Pi adapter unit and integration expectations.
- Public identity documentation, generated artifact checks, and Changeset metadata.

## Verification

- Deterministic ULID generation and strict alphabet/length tests.
- New Issue and Document creation emits ULIDs only.
- Existing numeric fixtures and repositories remain readable and valid.
- Mixed identity catalogs discover, validate, sort, link, archive, restore, and project correctly.
- Invalid, lowercase, ambiguous, mismatched, and collision cases fail closed.
- Comment IDs work with both base identity forms.
- OpenCode and Pi expose equivalent behavior.
- Typecheck, lint, format, build, generated-contract checks, focused suites, integration suites, and configured repository quality checks pass.

## Non-Goals

- Git workspace primitives or lifecycle routing owned by `hrn-00209` and `hrn-00210`.
- Rewriting existing Issue or Document identifiers.
- Changing remote-provider identifiers.
- Redesigning canonical storage, locks, revisions, comments, or cache schemas.
- Providing a daemon or central allocator.
