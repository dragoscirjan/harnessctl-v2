---
id: "doc-00005"
title: "Canonical YAML Issue Storage"
kind: lld
status: approved
version: 1
created_at: "2026-08-27T20:11:30.311Z"
updated_at: "2026-08-27T20:11:30.311Z"
created_by: "lead-engineer"
metadata: {"legacy_spec":{"source_path":".specs/lld-00005-canonical-yaml-issue-storage-v1.md","source_sha256":"4b6f59257748186ad8e1d2f43253fe0ed5a7d96bc1aaa5a2f93e9e3fe70207cd","decoder_version":1,"original_status":"superseded","field_conversions":{"type":"kind","id":"migration_mapping","status":"approved","author":"created_by","timestamps":"canonical_utc_or_intent_timestamp"},"frontmatter":{"id":"00005","type":"lld","title":"Canonical YAML Issue Storage","version":1,"status":"superseded","parent":"00004","opencode-agent":"lead-engineer","superseded-by":".specs/lld-00006-simplified-local-persistence-and-sqlite-write-through-cache-v1.md"},"rewrites":[]}}
---

# Canonical YAML Issue Storage

## Supersession notice

This LLD is retained for design lineage. LLD 00006 is the as-built implementation
contract. The former requirements for `issues-transactions.ts`, transaction manifests,
staged after-images, committed markers, roll-forward recovery, projection records,
projection sinks, acknowledgements, dirty state, provider recovery APIs, exact-decimal
metadata handling, reciprocal relationship fields, and separate issue locking are
superseded and are not compatibility obligations.

## Retained issue contract

The implementation under `extensions/generic-tools/` keeps one versioned `.yml` file
per issue. Active files are directly below configured `issues.root`; archived files are
below its `archived` child. Defaults are `.harnessctl/issues` and `hrn-`.

The document retains ID, type, title, status, timestamps, optional attribution and
assignee, optional parent, persisted relationship directions, document links, custom
metadata, body, and ordered embedded comments. Unknown managed top-level fields fail;
custom values belong under metadata. Comments remain append-only through the public
tool contract.

The reader is safe and permissive about presentation. Valid alternate quoting,
whitespace, and field order are accepted. Unsafe YAML features, duplicate keys,
multiple documents, malformed text, unsupported values, unsafe paths, identity
ambiguity, and configured bounds are rejected. Writes use deterministic ordering and
format. Revisions hash the exact source bytes, so a valid manual formatting edit still
invalidates an earlier expected revision.

Parent references are authoritative for child views. Dependency references provide
blocking views. Symmetric relations are stored once under a deterministic owner and
derived for both endpoints. `supersedes` remains directional. Create-with-parent and
parent changes therefore write the child rather than reciprocal parent data.

## Implemented operation boundary

`extensions/generic-tools/issues.ts` preserves the issue façade and adapters.
`issues-contract.ts` owns decoding, validation, deterministic encoding, revisions, and
filenames. `issues-storage.ts` owns discovery, path checks, the issue façade over the
shared barrier, same-directory publication, bounded file batches, and in-process
before-image rollback. `local-persistence.ts` owns the common barrier, local snapshots,
SQLite health, synchronization, and rebuild.

Each participating public issue operation enters the common local barrier once. It
validates filesystem state before using the cache. Reads compute results from issue
files. Mutations validate fresh state, apply bounded replacements, reload canonical
state, and synchronously refresh the shared SQLite cache before success.

There is no on-disk issue transaction protocol. Ordinary batch failure attempts reverse
restoration from in-memory before-images. Process termination can leave inconsistent
canonical files; a later operation reports the inconsistency and does not infer a
roll-forward or rollback.

## Cache and runtime behavior

The fixed cache path is `.harnessctl/cache/harnessctl.sqlite`. It combines projections
of filesystem issues and enabled repository memory. It is never queried for issue
results. Missing, stale, corrupt, wrong-identity, wrong-schema, or incomplete state is
rebuilt internally from valid canonical YAML.

The database implementation is loaded lazily in `local-persistence.ts`. Supported Bun
uses `bun:sqlite`; supported Node uses `node:sqlite`. Importing generic tools or running
configuration-only work does not load either module. Future remote providers do not
enter this local persistence path.

No agent cache tools exist. The installer may add the cache directory to ignore rules
but does not create the SQLite file. First participating runtime use creates or repairs
it.

## Compatibility and failure handling

OpenCode and Pi keep their established issue tool names, required arguments, result
shapes, and safe error envelopes. Expected revision remains required for update and
transition. Archive retains its opaque response token without giving it journal or
cache semantics.

Legacy and mixed issue layouts fail closed. There is no legacy migration, fallback
reader, automatic prefix conversion, or cache import.

Cache synchronization failure first causes a full synchronous rebuild. If repair also
fails, the operation returns a synchronization error and warns that canonical state may
already be committed. Cache failures never modify canonical YAML. Invalid canonical
state blocks cache repair.

## Delivery status

The superseding implementation is complete in the existing generic-tools issue,
storage, contract, memory, and local-persistence modules with OpenCode and Pi adapters.
Future work must use LLD 00006 and must not revive this document's superseded internal
machinery.
