---
id: "00006"
type: hld
title: "Simplified Canonical Issues and Local SQLite Cache"
version: 1
status: approved
parent: "00014"
opencode-agent: sys-architect
---

# Simplified Canonical Issues and Local SQLite Cache

## Purpose and authority

This is the approved KISS architecture for local persistence. Filesystem issue YAML and
enabled repository-memory YAML are the sole canonical state. Every local agent read is
answered from those files. One disposable SQLite database at
`.harnessctl/cache/harnessctl.sqlite` is synchronously maintained as an internal
write-through copy, never as an authority, query source, migration source, or repair
source for YAML.

This document supersedes conflicting persistence requirements in HLD 00004, LLD 00002,
LLD 00005, older issue descriptions, and earlier revisions of the SQLite design.

## Goals

- Preserve one safe YAML file per issue and one immutable YAML file per memory record
  or tombstone.
- Accept safe semantically valid YAML presentation while producing deterministic
  output on tool writes.
- Keep all issue and repository-memory reads filesystem-only.
- Serialize participating local operations through one project barrier.
- Synchronize the complete disposable cache after successful local mutations.
- Repair missing, stale, corrupt, incomplete, or incompatible cache state internally
  from valid canonical YAML.
- Preserve OpenCode and Pi tool names, inputs, successful response shapes, and bounded
  diagnostics.
- Load only the current runtime's built-in SQLite support and only when local
  persistence needs it.

## Non-goals

- Cache-first reads, agent cache status, reload, inspection, or mutation tools.
- Application transaction journals, staged after-images, committed markers,
  roll-forward recovery, projection sinks, change sets, acknowledgements, provider
  generations, dirty markers, or activation protocols.
- Crash-atomic multi-file canonical changes or automatic repair of partial YAML state.
- Reader and writer parallelism, nested locks, multiple provider locks, stale-owner
  inference, or lock stealing.
- Legacy issue migration, old cache import, prefix conversion, or mixed-layout support.
- Local caching for remote memory or issue providers.
- A general projection platform, provider registry, ORM, or database migration
  framework.

## Architectural decisions

1. Canonical YAML always wins. SQLite may be deleted without losing unique state.
2. Every participating local read parses canonical files before any cache maintenance.
3. One exclusive, non-reentrant, cross-process barrier covers issue and repository
   memory reads, writes, validation coordination, cache health checks, synchronization,
   and rebuild.
4. Ordinary multi-file failures use bounded in-process before-image rollback. No
   durable operation evidence survives a process crash.
5. A successful local mutation requires valid canonical post-state and a synchronized
   cache, either by direct refresh or immediate complete rebuild.
6. Cache repair runs only from a complete valid canonical snapshot and never changes
   canonical files.
7. Relationship source directions are stored once; compatible inverse views are
   derived for callers.
8. Runtime selection precedes lazy loading of `bun:sqlite` or `node:sqlite`. Remote
   backends bypass the local barrier and driver.
9. Public adapter contracts are compatibility surfaces. Prior internal projection,
   transaction, and reciprocal-field shapes are not.
10. Installation prepares configuration, skills, canonical memory directories, and
    cache ignore rules but does not create the database.

## System responsibilities

Host adapters preserve tool contracts and expose no cache-specific agent operations.
Issue and memory domains own validation, relationships, lifecycle rules, expected
revision behavior, search bounds, and response construction.

The shared local persistence boundary owns the project barrier, coherent snapshots,
cache identity and health, synchronous refresh, full rebuild, and runtime-specific
driver loading. Filesystem storage owns discovery, safe paths, same-directory file
publication, and bounded ordinary-failure rollback.

Remote providers select their own persistence before any local barrier or SQLite module
is touched. Only repository memory is currently implemented by generic-tools; remote
profiles remain future contracts rather than shipped providers.

## Canonical YAML contract

Issue files are directly below configured `issues.root`, or below its `archived` child.
The default root is `.harnessctl/issues`; the default prefix is `hrn-`; names follow the
stable ID plus deterministic title slug and `.yml` convention. Complete issue state,
body, metadata, links, and append-only comments remain in one file.

Safe permissive reading accepts valid differences in whitespace, quoting, and field
order. It rejects aliases, merge keys, explicit or custom tags, duplicate keys,
multiple documents, non-scalar keys, malformed UTF-8, unsupported top-level fields,
invalid schema values, unsafe paths, symlinks, identity ambiguity, and resource-limit
violations. Tool writes emit deterministic YAML. Exact source bytes form the revision,
so any manual byte edit invalidates an earlier expected revision.

Issues persist parent, dependency, directional relation, deterministic symmetric
relation, document, metadata, body, and comment state without reciprocal copies.
Children and blocking views are derived. Symmetric relation views are derived from one
stored owner.

Repository memory remains immutable YAML grouped as facts, decisions, events, lessons,
and tombstones. Search, filtering, active-state derivation, ordering, export, and
validation operate on YAML loaded for that call.

## Read flow

A local read resolves configuration, enters the shared barrier once, loads and validates
canonical filesystem state, ensures the cache is healthy from that same valid state,
computes the requested result from YAML, and returns the existing response. SQLite rows
never contribute candidates, filters, search matches, hierarchy, validation findings,
or returned entities.

Validation tools retain diagnostic behavior. Invalid canonical state is returned in the
existing issue or memory report shape and blocks cache creation or repair. Cache
operational failure remains an error rather than a canonical finding.

## Mutation flow

A local mutation enters the barrier, validates fresh canonical state and cache health,
checks arguments and expected revision where exposed, applies bounded deterministic
file changes, and reloads complete canonical state. It then refreshes all cache rows in
one SQLite transaction.

If direct refresh fails, harnessctl closes owned database resources, reloads valid
canonical state, and performs a synchronous full rebuild. The operation reports success
only if refresh or repair verifies successfully. If repair fails, the error states that
canonical state may already be committed. Canonical YAML is not rolled back merely
because the disposable cache failed.

## Cache lifecycle

The cache contains bounded issue and repository-memory representations plus identity,
schema, fingerprint, digest, generation, and count metadata. Its current implementation
schema is version 2. Cache health verifies file safety, SQLite integrity, foreign keys,
application identity, schema version, required tables, complete counts, canonical
fingerprint, and projected digest.

Any failed health condition causes a complete rebuild from a valid canonical snapshot.
Rebuild creates and verifies a same-directory candidate, closes it, flushes it where
supported, and replaces the disposable active database. There is no schema migration,
old-cache import, prior generation, activation manifest, or candidate adoption.

There is no eager initializer. First participating runtime use creates the cache
directory and database as needed. The installer only adds the cache directory to ignore
rules when installing repository memory.

## Concurrency and crash behavior

The barrier path is `.harnessctl/cache/local-operations.lock`. It is non-reentrant,
waits for a bounded period, contains no owner protocol, and is removed on normal exit.
A lock left by abrupt termination requires manual removal only after confirming no
operation remains active.

Same-directory file replacement provides the platform's available namespace atomicity.
Ordinary file-batch failure attempts reverse restoration from bounded in-memory
before-images while the barrier is held. A process or host crash, or failed rollback,
may leave partial canonical state. The next operation validates and reports the
inconsistency; it does not infer completion or reversal. Cache repair remains blocked
until canonical YAML is valid.

## Runtime and remote bypass

Supported Bun versions use `bun:sqlite`; supported Node versions use `node:sqlite`.
Selection and loading are lazy. Importing packages, reading configuration, or using a
future remote backend does not load either module. Both local drivers use the same
database identity and format.

Remote libSQL, Mem0, Graphiti, GitHub, MCP, command-backed, and custom providers do not
use the local barrier or database. This is a routing requirement for future providers,
not a claim that those adapters are implemented.

## Migration and compatibility

Legacy issue directories and roots mixing legacy and canonical representations fail
closed. No harnessctl operation reads, converts, imports, retires, or repairs legacy
storage. Existing obsolete cache and control artifacts are not migration inputs.

OpenCode and Pi issue and memory tools keep their established external contracts. No
agent cache tools are added. Archive response tokens remain opaque compatibility data
without journal, acknowledgement, or cache semantics.

## Risks and accepted tradeoffs

- One barrier limits concurrency. This is accepted for the bounded small-project
  envelope in exchange for simpler consistency.
- Multi-file canonical changes are not crash-atomic. Ordinary rollback and actionable
  validation are accepted instead of durable recovery machinery.
- Canonical and SQLite commits cannot be physically atomic. Canonical state remains
  authoritative, and immediate or next-use rebuild repairs only the cache.
- Runtime and platform SQLite behavior differs. A narrow lazy boundary and shared
  health checks constrain divergence.
- The disposable cache contains sensitive projections. Safe paths, private creation
  where supported, no extension loading, parameterized values, and redacted diagnostics
  reduce exposure.

## Completion criteria

- Every local issue and repository-memory result comes from filesystem YAML.
- Safe non-canonical YAML presentation reads successfully and tool writes are
  deterministic.
- One shared barrier covers every participating local operation without nesting.
- Successful local mutations synchronize or synchronously rebuild the shared cache.
- Invalid canonical state blocks cache work and is never repaired from SQLite.
- No application journal, projection sink, change set, dirty protocol, cache-first
  agent read, agent cache tool, install-time database creation, or legacy migration
  exists.
- Lazy Bun and Node SQLite loading and future remote-backend bypass remain enforced.
