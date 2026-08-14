---
id: "00001"
type: initiative
title: Modernize local filesystem persistence
status: open
created_at: 2026-08-14T12:51:33.526Z
updated_at: 2026-08-14T15:01:15.305Z
created_by: product-owner
children:
  - "00002"
  - "00003"
  - "00004"
  - "00006"
  - "00014"
---

# Modernize local filesystem persistence

## Problem

Harnessctl local providers repeatedly discover and parse many small files. Issue data is also split between Markdown issue files and separate comment files, increasing filesystem operations and making indexing harder.

## Goal

Provide a simple, extensible local-persistence model where each issue is one canonical YAML file and every configured filesystem-backed provider maintains a disposable, cache-first SQLite projection.

## User Value

- Faster issue and memory listing, lookup, filtering, validation, and search.
- One reviewable, Git-friendly file per issue.
- A reusable cache contract for future local providers.
- No unnecessary cache layer around remote providers that already own indexed storage.

## Scope

- Replace issue Markdown/frontmatter and comment directories with one YAML file per issue.
- Use `<id>-<title-slug>.yml` for active and archived issue files.
- Store comments and all issue-managed state inside that YAML document.
- Add a generic project SQLite cache for configured filesystem-backed providers.
- Integrate filesystem issues and repository memory with write-through mutation and cache-first query behavior.
- Add generic cache status and reload tools.
- Support Node through `node:sqlite` and Bun through `bun:sqlite`, loaded lazily at runtime.

## Out of Scope

- Migrating existing Markdown issues to YAML; migration will be requested separately.
- Caching GitHub, MCP, command-backed, or other remote providers.
- Indexing arbitrary repository files that are not managed by a registered harnessctl filesystem provider.
- Making SQLite authoritative; canonical YAML remains the source of truth.

## Epic Breakdown

1. Canonical single-file YAML issues.
2. Generic SQLite cache with issue and memory adoption.

## Acceptance Criteria

### Scenario: Consolidated issue storage

Given a filesystem-backed issue provider
When an issue and its comments are created or changed
Then all issue-managed data is stored in one canonical `<id>-<title-slug>.yml` file
And no comments directory is required.

### Scenario: Synchronized local persistence

Given a configured filesystem-backed provider
When a harnessctl mutation succeeds
Then the canonical file and SQLite projection represent the same resulting state.

### Scenario: Cache-first queries

Given a synchronized local cache
When issue or memory tools list, search, filter, validate, or resolve entities
Then they query SQLite before performing filesystem discovery or parsing.

### Scenario: Cache restoration

Given the cache is missing, dirty, corrupt, or explicitly reloaded
When cache restoration runs
Then all configured filesystem providers are rebuilt from canonical files
And the replacement cache becomes active only after a complete successful build.

### Scenario: Remote provider boundary

Given a provider is not filesystem-backed
When its tools execute
Then the local SQLite cache is neither required nor updated.
