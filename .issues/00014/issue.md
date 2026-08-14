---
id: "00014"
type: epic
title: Add generic local SQLite projections
status: open
created_at: 2026-08-14T15:01:15.303Z
updated_at: 2026-08-14T15:02:56.417Z
parent: "00001"
depends_on:
  - "00004"
created_by: lead-engineer
assigned_to: lead-architect
children:
  - "00015"
---

# Add generic local SQLite projections

## Outcome

Filesystem-backed issues and memory use one disposable `.harnessctl/cache/harnessctl.sqlite` projection, while canonical YAML files remain authoritative.

## Scope

- Generic local-provider discovery, decode, projection, write-through, removal, archive, status, and rebuild contract.
- Initial providers: canonical YAML issues and repository YAML memory.
- Lazy runtime-selected `node:sqlite` or `bun:sqlite`; no incompatible static imports.
- Cache-first lookup/list/search/filter/validation/hierarchy where filesystem scans would otherwise be required.
- `harnessctl_cache_status` and `harnessctl_cache_reload`; scopes `all|issues|memory`.
- Temporary complete rebuild and atomic activation only after validation.
- Dirty/corrupt/incompatible detection and canonical repair.
- Retire memory JSON cache after verified parity.
- External/remote providers bypass local cache.

## Boundaries

- SQLite is disposable projection, never canonical/shared state.
- Canonical writes commit first; cache sync must complete before success. Sync failure reports error and durable provider-dirty evidence.
- Provider reload preserves current active DB if validation fails.
- No legacy issue migration, arbitrary repository indexing, remote service, or MCP cache service.

## Risks

- Node/Bun driver API differences and SQLite format/extension compatibility.
- Atomic DB replacement and open-handle semantics differ by platform.
- Crash windows between canonical commit, cache update, and dirty marker.
- Cache-first correctness requires deterministic manifest/version checks and explicit bypass/fallback policy.

## Acceptance Criteria

### Write-through success
Given a filesystem issue or memory mutation
When it reports success
Then canonical files and SQLite represent the same result.

### Recoverable sync failure
Given canonical commit succeeds but cache sync fails
When the tool responds
Then it returns a synchronization error, durably marks the provider dirty, and reload repairs from canonical files.

### Cache-first query
Given synchronized compatible cache
When lookup/list/search/filter/validation/hierarchy runs
Then candidates and indexed state come from SQLite without a full canonical scan.

### Atomic reload
Given reload scope `all`, `issues`, or `memory`
When provider indexing and validation succeed
Then a temporary DB is atomically activated and reports indexed/removed/skipped/invalid counts
And failed rebuild leaves prior active DB unchanged.

### Runtime portability
Given Node or Bun execution
When cache is first needed
Then only that runtime SQLite module loads
And both drivers operate on the same database schema and file.

### Repair
Given missing, dirty, corrupt, or incompatible cache
When status/reload or a local query handles it
Then state is reported accurately and repair uses canonical files without treating cache as authority.

### Remote bypass
Given external provider storage
When tools execute
Then no local SQLite load/query/mutation is required.

## Design Constraints

- Minimal provider contract: `id`, `kind=filesystem|external`, canonical discovery/decode, projection rows, mutation events, and full rebuild. External providers never receive a cache handle.
- Minimal driver contract: open/close, exec, prepared run/get/all, transaction, integrity check, and checkpoint. Runtime factory checks Bun first, then Node, and lazily `createRequire`s only `bun:sqlite` or `node:sqlite`.
- A durable provider-dirty marker is written within the canonical mutation transaction boundary before success can be returned. Startup/query/status checks marker before trusting SQLite.
- Synchronized compatible cache is mandatory for cache-first reads. Missing/stale/dirty/corrupt/incompatible state fails with actionable reload guidance; it never silently returns partial cache data or treats cache as authority.
- Reload holds one project cache lock, builds requested provider scope in a unique temporary database, validates schema/integrity/counts/manifests, closes all handles, then activates. POSIX rename may replace; Windows uses a recoverable previous/new swap manifest because open-file replacement is not portable.
- Scope reload copies untouched valid providers into the candidate DB; `all` discovers every configured filesystem provider. Failure preserves active DB and dirty evidence.
- Managed paths remain project-relative and symlink-safe; SQL is parameterized; bounded canonical parsing precedes indexing; cache files use private permissions where supported.
- Structured results/errors include provider, state, scope, generation, indexed/removed/skipped/invalid counts, repair action, and cause without canonical content or secrets.
