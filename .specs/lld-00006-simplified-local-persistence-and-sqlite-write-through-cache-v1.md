---
id: "00006"
type: lld
title: "Simplified Local Persistence and SQLite Write-Through Cache"
version: 1
status: implemented
parent: "00006"
opencode-agent: lead-engineer
---

# Simplified Local Persistence and SQLite Write-Through Cache

## Status and scope

This is the as-built LLD for the approved KISS persistence model in HLD 00006. It
describes the current implementation under `extensions/generic-tools/`, not the earlier
planned module split.

Filesystem issue YAML and enabled repository-memory YAML remain canonical. Reads use
those files only. The synchronous disposable cache is fixed at
`.harnessctl/cache/harnessctl.sqlite`. It combines the two implemented local domains,
never answers an agent read, and never repairs YAML.

Future remote backends bypass this local path. Generic-tools currently implements only
repository memory, so named remote providers are routing constraints rather than
shipped adapter behavior.

## Superseded designs

The following are explicitly absent: `issues-transactions.ts`, application transaction
manifests, staged after-images, committed markers, startup roll-forward, projection
sinks, projection records and change sets, acknowledgements, dirty markers, cache-first
reads, provider or cache locks, JSON memory indexes, import journals, agent cache tools,
cache schema migration, legacy issue migration, and install-time database creation.

Earlier LLD 00006 sections that proposed separate `local-barrier.ts`, `atomic-files.ts`,
and `local-sqlite.ts` files are superseded by the consolidated implementation in
`local-persistence.ts` and the issue batch behavior in `issues-storage.ts`.

## Current source responsibilities

`extensions/generic-tools/local-persistence.ts` owns the common barrier, local snapshot,
canonical fingerprint, cache health checks, full snapshot synchronization, rebuild,
SQLite schema, and lazy Bun or Node database adapter.

`extensions/generic-tools/issues-contract.ts` owns safe permissive issue decoding,
semantic validation, deterministic encoding, exact-byte revisions, metadata checks,
limits, and canonical filenames.

`extensions/generic-tools/issues-storage.ts` owns issue-root validation, discovery,
storage classification, identity cataloging, the issue wrapper over the shared barrier,
same-directory publication, and bounded in-process file-batch rollback.

`extensions/generic-tools/issues.ts` owns the public filesystem issue provider, domain
rules, derived relationship views, expected revision checks, response construction,
and cache coordination around every issue operation.

`extensions/generic-tools/memory.ts` owns repository-memory domain validation, secret
screening, filesystem reads and search, immutable writes, import and export, ordinary
batch rollback, and cache coordination through the shared local persistence boundary.

OpenCode and Pi adapters retain tool registration and response wrapping. They expose no
cache-specific tools.

## Shared barrier

Every participating local issue and repository-memory public operation enters
`withLocalBarrier` exactly once. The fixed lock directory is
`.harnessctl/cache/local-operations.lock`. The barrier is exclusive across processes,
non-reentrant within a process, and bounded to a five-second wait.

The lock has no owner metadata, PID checks, age inference, recovery manifest, or steal
behavior. Normal release removes it. Abrupt process termination can leave it behind;
manual removal is the recovery only after confirming no live operation still owns it.

Custom issue and memory roots do not create more locks. Internal loaders, validators,
writers, cache checks, and rebuilds receive the existing lease and do not reacquire.

## Issue persistence

Configured issue storage defaults to `.harnessctl/issues` with prefix `hrn-`. Active
and archived candidates together are capped at 9,999. Legacy issue directories and
mixed roots are classified as unsupported and fail closed without conversion.

Issue decoding accepts semantically valid alternate quoting, whitespace, and field
order. It rejects unsafe YAML presentation, duplicate keys, multiple documents,
malformed UTF-8, invalid schema, unsupported top-level fields, unsafe paths,
non-regular files, symlinks, identity ambiguity, and resource-limit violations.
Encoding is deterministic. Revisions hash exact source bytes.

Persisted relationships are parent, dependency, symmetric relations under one
deterministic owner, and directional supersession. Child and blocking views are
derived. Create-with-parent and parent change write only the child. Symmetric relation
calls from either endpoint update the same stored owner.

Update and transition require the established expected revision and compare it with
fresh exact bytes under the barrier. Other public tools retain their existing argument
contracts.

## Repository-memory persistence

Memory records and tombstones remain immutable YAML under configured
`memory.repository.root`. Reads scan canonical record folders, validate scope,
references, cycles, schema, file bounds, and active state, then compute get, list,
search, validation, and export results in memory.

Search uses case-folded term inclusion, topic and memory-type filters, active-only
default behavior, newest-first ordering, a result count from one to one hundred, and a
bounded serialized result size. SQLite and the retired JSON index are not consulted.

Store, supersede, and delete publish immutable YAML files. Non-preview import validates
the complete bounded JSONL payload and publishes one ordered batch. Preview writes
nothing. Ordinary batch failure restores in-memory before-images where possible. There
is no staged import tree or startup recovery.

## Canonical publication and failure

Issue and memory batches validate all paths and retain bounded existing bytes before
the first change. Issue batches reject more than 10,000 paths or 256 MiB of before
images. Existing immutable memory targets cannot be overwritten.

Each file publication writes a unique private same-directory temporary, flushes and
closes it, renames it to the target, and synchronizes the containing directory where
supported. Deletion removes the validated regular file and applies the same supported
directory synchronization.

On ordinary failure, applied paths are restored in reverse order while the barrier is
still held. Successful restoration returns the original or categorized failure.
Restoration failure states that canonical data may be inconsistent. No on-disk
transaction evidence is written. A process crash may leave partial canonical state,
which later validation reports without automatic completion or reversal.

## Filesystem-only reads and operation ordering

An issue operation validates the issue graph, loads the complete local snapshot,
ensures cache health, computes its result or applies its mutation, and after mutation
reloads canonical state and synchronizes the cache. Issue get and list always compute
their responses from issue candidates and decoded YAML.

A memory operation loads canonical memory state, validates the configured canonical
issue graph needed for a coherent shared snapshot, loads the local snapshot, ensures
cache health, computes its result or applies its mutation, and after mutation reloads
and synchronizes. Memory get, list, search, validate, and export always compute their
responses from memory YAML.

Validation retains existing report semantics. Invalid issue or memory state is reported
without using SQLite as evidence or repair. Cache work occurs only when the configured
local canonical domains are valid enough to form a coherent snapshot.

## SQLite cache

The cache implementation uses application identity `harnessctl-local-cache`, a fixed
application ID, and schema version 2. It stores metadata, provider fingerprints, active
and archived issues, persisted issue relationships, issue documents and comments,
memory records, supersession links, tags, and tombstones. It has no full-text search
table because agent search is filesystem-based.

Cache health requires a regular non-symlink database, successful open and integrity
checks, no foreign-key violations, matching application and schema identity, all
required tables, matching canonical fingerprint, matching projection digest, matching
provider generations, complete counts, and row bounds.

Any failed condition is treated as an internal repair case. Rebuild creates a unique
same-directory candidate, creates schema version 2, replaces all projection rows in one
SQLite transaction, verifies it, closes it, flushes it, and renames it over the active
database. A failed candidate is closed and removed where possible. There is no old
cache migration or adoption of leftover candidates.

Routine post-mutation synchronization also replaces the complete snapshot in one
SQLite transaction. Incremental events are intentionally absent. If direct refresh or
post-refresh verification fails, the implementation reloads canonical state and
performs a complete synchronous rebuild. Success is returned only when the resulting
cache verifies.

If both synchronization and rebuild fail after canonical publication, the error states
that canonical state may already be committed and the next initialization will retry.
The cache failure does not trigger canonical rollback.

## Lazy runtime selection

SQLite loading occurs inside `local-persistence.ts` through runtime selection and
`createRequire`. Supported Bun versions at or above 1.3.13 load only `bun:sqlite`.
Supported Node 22 versions at or above 22.13.0, and Node 24 or newer, load only
`node:sqlite`. Unsupported runtimes return synchronization failure for participating
local operations.

There are no static runtime-specific imports. Package import, configuration reads, and
future remote-provider operations avoid loading SQLite. Both local drivers are adapted
to the same synchronous database contract and file format.

## Initialization and installer behavior

There is no eager startup service. The first participating issue or enabled
repository-memory operation creates `.harnessctl/cache/` if needed and then creates or
repairs `harnessctl.sqlite` under the barrier.

The Python installer initializes canonical repository-memory folders and adds
`/.harnessctl/cache/` to `.gitignore` when installing repository memory. It does not
create the cache directory or database and does not write a memory cache setting.

## Public compatibility

OpenCode and Pi preserve their issue and memory tool names, input schemas, successful
response shapes, and safe error envelopes. No `harnessctl_cache_status`,
`harnessctl_cache_reload`, or equivalent tool exists. Archive's optional operation
token remains opaque response compatibility data with no journal or cache role.

Config version 2 defaults the issue root and prefix and accepts repository memory.
`memory.repository.cache` is not generated or used. Remote backend support must route
before local persistence and remains outside the current generic-tools implementation.

## Resource envelope

- Active and archived issue files combined: 9,999.
- Memory records and tombstones combined: 10,000 files.
- Aggregate memory YAML: 256 MiB.
- One managed YAML file: 16 MiB.
- Cache projection rows: 1,000,000.
- Memory import or export payload: 64 MiB.
- Memory search query: 16 KiB.
- One issue file batch: 10,000 paths and 256 MiB retained before-images.
- One cache candidate: 512 MiB.

Crossing a bound fails explicitly. Canonical and cache results are not silently
truncated, except for the existing caller-selected memory result count and serialized
result-size semantics.

## Error and repair contract

- Barrier contention returns a retryable bounded busy error.
- Unsafe path, YAML, schema, identity, relationship, or resource state fails before
  successful mutation and blocks cache repair.
- Expected revision mismatch writes nothing.
- Ordinary publication failure attempts restoration; failed restoration reports
  possible canonical inconsistency.
- Missing, stale, corrupt, incomplete, wrong-identity, or wrong-schema cache state
  rebuilds internally from valid YAML.
- Failed direct refresh triggers immediate full rebuild.
- Failed rebuild after canonical mutation returns synchronization error and never
  changes canonical YAML.
- Unsupported runtime SQLite returns synchronization error only on participating local
  use.
- Legacy and mixed issue storage remains unsupported with no migration.

## Verification coverage

Current tests cover safe permissive issue parsing, deterministic writes, relationship
derivation, expected revisions, archive behavior, shared-cache write-through, missing
and corrupt cache repair, failed synchronization followed by rebuild, repair failure,
memory filesystem reads, absence of the JSON index, obsolete transaction artifacts,
schema and row integrity, and runtime selection. Adapter tests preserve tool contracts.

## Acceptance checklist

- [x] Local issue and repository-memory reads are filesystem-only.
- [x] One shared exclusive barrier serializes participating local operations.
- [x] Safe valid YAML presentation is accepted and writes are deterministic.
- [x] Successful mutations synchronize or synchronously rebuild
      `.harnessctl/cache/harnessctl.sqlite`.
- [x] Cache defects repair internally only from valid canonical YAML.
- [x] Application journals, projection sinks, change sets, dirty protocols, JSON
      memory cache, cache-first reads, and agent cache tools are absent.
- [x] Remote-provider routing bypasses local persistence by contract; only repository
      memory is currently implemented.
- [x] Runtime-specific SQLite loading is lazy.
- [x] Installation does not create the cache.
- [x] Defaults remain `.harnessctl/issues` and `hrn-`.
- [x] No legacy migration is provided.
