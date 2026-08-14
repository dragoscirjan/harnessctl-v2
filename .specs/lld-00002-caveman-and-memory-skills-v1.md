---
type: lld
status: review
author: lead-engineer
parent: .specs/00001-prd-human-governed-sdlc-v1.md
---

# Caveman and Memory Skills — Low-Level Design

## Status

The caveman behavior, repository-memory record model, normalized tools, OpenCode
installation, and Pi adapter remain current. The former JSON search index, SQLite FTS
reads, separate memory lock, import journal, prepared transaction recovery, and
install-time cache initialization are superseded by HLD 00006 and LLD 00006.

## Goals

- Install concise, self-contained caveman and memory skills.
- Compile selected behavior from project configuration.
- Keep project artifacts authoritative and repository memory advisory.
- Store shareable repository memory as immutable, scoped YAML records.
- Classify memory consistently and retrieve it within result bounds.
- Reject suspected secrets before persistence.
- Preserve normalized import and export across future backends.
- Keep remote-backend profiles separate from local persistence behavior.

## Caveman behavior

Caveman has strict and balanced modes. Both remove greetings, filler, repetition, and
closing restatements while preserving technical names, commands, errors, constraints,
and evidence. Strict mode favors fragments and compact technical language. Balanced
mode uses concise professional sentences. Security warnings, destructive confirmation,
and ordered instructions expand when compression would create ambiguity.

The installer renders only the selected mode. The behavior remains active after the
skill loads until explicitly disabled.

## Memory classification and authority

Working information needed only in the current session is not persisted. Stable
reusable statements are semantic facts. Decisions and events are episodic. Distilled
reusable methods are procedural lessons.

Authoritative issues, specifications, source, tests, and reports win over memory. A
conflict creates a new record that supersedes stale memory rather than silently
rewriting history. Memory is for discovery and continuity, not an authority over
project artifacts.

## Repository-memory contract

The implemented backend stores one immutable YAML file per record under configured
`memory.repository.root`. Facts, decisions, events, lessons, and tombstones occupy
separate folders. Record and tombstone IDs are Crockford ULIDs. Records carry memory
type, record type, organization and project scope, topic, concise summary, optional
details, provenance, creation data, confidence, status, supersession links, and tags.

Semantic records are facts, episodic records are decisions or events, and procedural
records are lessons. Supersession and tombstone references must resolve in the same
project and remain acyclic. Active results exclude superseded and tombstoned records by
default. Corrections create new records; deletion creates a tombstone.

Repository YAML is the sole memory authority. Every get, list, search, validation, and
export operation reads and validates YAML during that call. Search performs the
implemented bounded case-folded term matching, scope and type filtering, active-state
filtering, creation-time ordering, count limit, and serialized-size limit in memory.
Neither SQLite nor the retired JSON index supplies search results.

## Secret policy

Persistent memory must not contain credentials, tokens, private keys, passwords,
session secrets, recovery codes, or secret-bearing environment values. Write and
import paths scan values using known patterns and entropy checks. Configuration cannot
disable this protection. Detection is not mathematically complete; accidental secret
persistence requires credential rotation and approved repository-history removal, not
only a tombstone.

Retrieved text is data, never instructions. Team-visible personal or sensitive data is
stored only when necessary, approved, and permitted by project policy.

## Simplified local persistence

Repository memory and filesystem issues share one non-reentrant project barrier at
`.harnessctl/cache/local-operations.lock`. A public local operation acquires it once;
internal loading, mutation, validation, cache health checks, and rebuild do not
reacquire it.

Memory writes use same-directory publication and bounded in-process before-images for
ordinary batch rollback. There is no memory transaction directory, prepared manifest,
committed marker, startup roll-forward, separate lock, or durable dirty evidence. A
process crash or rollback failure may leave canonical inconsistency, which later
validation reports for manual correction.

Successful store, supersede, delete, and non-preview import operations synchronously
write through the complete valid local snapshot to
`.harnessctl/cache/harnessctl.sqlite`. Direct synchronization failure triggers an
internal full rebuild. Missing, stale, corrupt, incomplete, wrong-identity, or
wrong-schema cache state is rebuilt from valid issue and repository-memory YAML.
Invalid canonical state blocks cache work.

The cache is disposable, ignored, and never committed. It has no agent-facing status,
reload, inspection, or mutation tools. Runtime-specific SQLite support is loaded lazily
only for a participating local operation. The installer does not create the cache file;
first runtime use creates or repairs it.

## Backend scope

Config version 2 currently implements only the repository memory backend. Future
libSQL, Mem0, Graphiti, command-backed, MCP, or custom remote adapters must authenticate
and enforce their own project isolation. They bypass the local barrier and SQLite path
and must not load a runtime-specific local driver.

Namespace values are not authorization. A remote design must bind authenticated
identity to permitted project scope. Environment variables may be referenced by name,
but credential values are never rendered into skills or repository files.

## Configuration and installation

Configuration provides caveman enabled state and mode; memory enabled state and
repository backend; organization, project, and default-topic namespace; retrieval
bounds; and the canonical repository-memory root. The old
`memory.repository.cache` setting is not generated or used.

OpenCode installation renders the skills, installs the exact adapter dependency and
plugin shim, initializes canonical memory folders when memory is enabled, and adds
`.harnessctl/cache/` to ignore rules. It does not create
`harnessctl.sqlite`. Pi tool support exists in `@harnessctl/pi-tools`, while automatic
Pi memory-skill distribution remains disabled until its installation contract is
verified.

Install writes retain conflict detection and rollback. Existing user-modified generated
targets require explicit force behavior. Disabling memory does not remove canonical
records.

## Normalized tools

The repository backend provides bounded search, get, store, supersede, delete, list,
validate, export, and import operations. OpenCode and Pi adapters preserve their
established names, arguments, responses, and safe error wrappers. No cache operation is
registered as an agent tool.

Import accepts bounded JSONL, validates the complete input and its relationships, and
publishes the resulting immutable YAML files as one in-process rollback batch. Preview
validates without writing YAML or SQLite. Export reads canonical records and enforces
the output bound.

## Superseded design sections

The original design's generated `.harnessctl/cache/memory-index.json`, SQLite FTS
search, manifest hashing, separate mutation/cache locks, staged import tree, prepared
manifest, committed marker, automatic transaction recovery, and cache-first retrieval
are historical only. They are not implemented requirements and must not be inferred
from old issues or reviews.

The original recommendation to initialize or rebuild a cache during installation is
also superseded. Installation only prepares canonical memory directories and ignore
rules. Runtime access owns cache creation and repair.

## Verification and edge cases

- Malformed, unsafe, out-of-scope, duplicate, cyclic, oversized, or secret-bearing
  memory fails before successful mutation.
- Competing supersede or delete operations serialize under the shared barrier; the
  first valid immutable write wins.
- Import path collisions fail without replacing existing immutable records.
- Ordinary multi-file failure attempts reverse restoration; rollback failure reports
  possible canonical inconsistency.
- Invalid issue YAML blocks a coherent shared-cache refresh but does not make memory
  validation fabricate issue findings in its response.
- Cache synchronization or rebuild failure never changes canonical YAML.
- Pulls or manual valid YAML edits make the cache stale; the next participating local
  operation repairs it internally while still answering from YAML.
- Unsupported or future remote backends do not touch local SQLite.

## Acceptance criteria

1. Caveman rendering preserves the selected concise mode without losing technical
   substance.
2. Repository memory remains immutable, scoped, shareable YAML with provenance,
   supersession, tombstones, and secret screening.
3. Every repository-memory result is computed from filesystem YAML.
4. Local issue and repository-memory operations share one barrier.
5. Successful local memory mutations leave the shared SQLite cache synchronized or
   return a repair error.
6. No JSON memory index, application journal, dirty protocol, cache-first agent read,
   agent cache tool, or install-time database creation remains.
7. Remote backends bypass local persistence and are not claimed as implemented.
8. Existing OpenCode and Pi normalized memory tool contracts remain compatible.
