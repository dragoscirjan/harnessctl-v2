---
id: "00003"
type: story
title: Compose Epic for generic local SQLite caching
status: open
created_at: 2026-08-14T12:52:22.275Z
updated_at: 2026-08-14T12:52:48.054Z
parent: "00001"
created_by: product-owner
assigned_to: product-owner
depends_on:
  - "00002"
---

# Compose Epic for generic local SQLite caching

## Story

As a product owner
I want an Epic defining a generic SQLite projection for local persistence providers
So that filesystem-backed issue and memory tools avoid repeated discovery and parsing while canonical files remain authoritative.

## Requested Epic Scope

- Introduce one disposable project cache at `.harnessctl/cache/harnessctl.sqlite`.
- Define an abstract local-provider projection contract for discovery, parsing, indexing, write-through updates, removal, archive state, and full rebuild.
- Register filesystem issues and repository memory as initial providers.
- Load `node:sqlite` under Node and `bun:sqlite` under Bun through lazy runtime-selected drivers; do not statically load the incompatible module.
- Make every successful local issue or memory mutation update canonical files and SQLite before reporting success.
- Make issue and memory lookup, list, search, filter, validation, and relationship traversal cache-first whenever they otherwise require filesystem discovery or parsing.
- Add `harnessctl_cache_status` and `harnessctl_cache_reload` tools to OpenCode and Pi adapters.
- Let reload target `all`, `issues`, or `memory`; index every configured filesystem-backed provider in `all` scope.
- Rebuild into a temporary database and atomically activate it only after complete validation.
- Detect missing, dirty, corrupt, and incompatible cache state and repair it without treating SQLite as canonical.
- Retire the existing memory JSON search cache after SQLite coverage is verified.
- Bypass local cache behavior for GitHub, MCP, command-backed, and future remote providers.
- Request an HLD Design Story before implementation tasks are composed.

## Explicit Exclusions

- Caching arbitrary repository files outside registered harnessctl providers.
- Making SQLite a shared or canonical datastore.
- Migrating legacy Markdown issues to the new YAML format.
- Adding a standalone cache service or MCP server.

## Acceptance Criteria

### Scenario: Epic is actionable

Given this Story is refined into an Epic
When the Epic is reviewed
Then it defines provider contracts, consistency guarantees, recovery boundaries, runtime support, and testable acceptance criteria
And it includes a Design Story requesting an HLD.

### Scenario: Write-through success invariant

Given an issue or memory provider is filesystem-backed
When a mutation reports success
Then its canonical file state and SQLite projection represent the same result.

### Scenario: Recoverable cache failure

Given a canonical write succeeds but cache synchronization fails
When the tool responds
Then it reports a synchronization failure
And marks the affected provider dirty
And a later reload can restore consistency from canonical files.

### Scenario: Cache-first query

Given a synchronized cache
When a tool would otherwise discover or parse issue or memory files
Then it obtains candidates and indexed state from SQLite first
And avoids full filesystem scanning during normal operation.

### Scenario: Generic reload

Given one or more configured filesystem providers
When `harnessctl_cache_reload` runs for a requested scope
Then it rebuilds those providers from canonical files
And reports indexed, removed, skipped, and invalid entities
And preserves the previous active database if rebuild validation fails.

### Scenario: Runtime portability

Given the tools execute under Node or Bun
When the cache is first needed
Then only that runtime's SQLite module is loaded
And both drivers operate on the same project database format.

### Scenario: Remote provider bypass

Given an issue or memory provider delegates storage to an external system
When its tools execute
Then they do not require, query, or mutate the local SQLite cache.
