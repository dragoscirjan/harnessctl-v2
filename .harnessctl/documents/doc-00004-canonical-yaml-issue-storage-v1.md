---
id: "doc-00004"
title: "Canonical YAML Issue Storage"
kind: hld
status: approved
version: 1
created_at: "2026-08-27T20:11:30.311Z"
updated_at: "2026-08-27T20:11:30.311Z"
created_by: "sys-architect"
metadata: {"legacy_spec":{"source_path":".specs/hld-00004-canonical-yaml-issue-storage-v1.md","source_sha256":"cd54136d63bee9322050ea6c6ea74a8be9f1636a47f4b7a0976f087ca748abd5","decoder_version":1,"original_status":"superseded","field_conversions":{"type":"kind","id":"migration_mapping","status":"approved","author":"created_by","timestamps":"canonical_utc_or_intent_timestamp"},"frontmatter":{"id":"00004","type":"hld","title":"Canonical YAML Issue Storage","version":1,"status":"superseded","opencode-agent":"sys-architect","superseded-by":".specs/hld-00006-generic-local-sqlite-projections-v1.md"},"rewrites":[]}}
---

# Canonical YAML Issue Storage

## Status

This document records the original canonical-YAML direction. The approved KISS
architecture in HLD 00006 supersedes its transaction journals, staged after-images,
roll-forward recovery, projection sinks, change sets, acknowledgements, dirty markers,
reciprocal relationship persistence, provider-specific locks, and migration gate.
Those mechanisms are not requirements and must not be reintroduced from this history.

## Retained decisions

- Each active issue is one versioned YAML file directly under configured
  `issues.root`; archived issues use its `archived` child.
- The default issue root is `.harnessctl/issues` and the default prefix is `hrn-`.
- The filename contains the immutable ID and a deterministic title slug, ending in
  `.yml`.
- Canonical files contain the complete issue state, Markdown body, metadata, document
  links, and append-only embedded comments.
- Filesystem YAML is authoritative. SQLite is disposable and cannot repair YAML.
- Stable revisions are derived from exact file bytes and are checked against freshly
  read state where the public tool requires an expected revision.
- Paths remain project-relative, contained, non-symlinked, and bounded. Unsafe YAML
  constructs and malformed schema values fail closed.
- Legacy issue directories and mixed layouts are unsupported. No implicit or explicit
  legacy migration is delivered by this design.

## Implemented simplifications

The safe reader accepts semantically valid YAML even when quoting, whitespace, or
field order differs from harnessctl output. Aliases, merge keys, explicit or custom
tags, duplicate keys, multiple documents, non-scalar keys, malformed UTF-8, unsafe
paths, unsupported fields, and resource-limit violations remain rejected. A tool write
normalizes the touched file deterministically; untouched valid formatting remains.

Issues persist only the source direction needed for relationships. Children are
derived from parent references, blocking views from dependency references, and
symmetric relationships from one deterministic owner. This avoids reciprocal writes.

All participating local issue and repository-memory operations share the single
project barrier at `.harnessctl/cache/local-operations.lock`. Canonical file batches
retain bounded before-images in memory and attempt rollback on ordinary failures.
There is no durable operation evidence or automatic crash recovery. A crash or failed
rollback may require manual correction after validation reports canonical
inconsistency.

## Cache interaction

Every issue read remains filesystem-only. After a successful issue mutation, the
complete valid local snapshot is synchronously written to
`.harnessctl/cache/harnessctl.sqlite`. Direct synchronization failure triggers an
internal full rebuild. Success is returned only when synchronization or repair
succeeds. Missing, stale, corrupt, wrong-schema, or wrong-identity cache state is also
rebuilt internally from valid YAML.

No cache status or reload tool is exposed to agents. No install-time database is
created. Runtime-specific SQLite modules are loaded lazily only when a participating
local operation needs them. Future remote providers bypass this local barrier and
cache.

## Compatibility and migration

OpenCode and Pi tool names, arguments, and successful response shapes are the public
compatibility boundary. Earlier internal transaction, projection, control-file, and
reciprocal-field contracts are superseded.

Legacy Markdown issue directories are detected and rejected. Harnessctl does not read,
convert, merge, import, or retire them. Repository owners must establish a valid
canonical root outside these tools before use.

## Failure expectations

- Invalid canonical YAML blocks mutation and cache rebuild.
- Ordinary file-batch failure attempts in-process restoration while the barrier is
  held.
- Failed restoration reports that canonical state may be inconsistent.
- Cache failure never rolls back or repairs canonical YAML.
- Cache repair failure reports that canonical state may already be committed and is
  retried on a later valid local operation.
- Barrier contention returns a bounded busy error; no stale-owner inference or lock
  stealing is performed.

## Acceptance summary

The retained outcome is one safe canonical YAML issue per file, filesystem-only reads,
deterministic writes, stable public tools, one shared local barrier, and synchronous
write-through to a disposable internally repaired cache. All conflicting requirements
from the original revision are superseded by HLD 00006.
