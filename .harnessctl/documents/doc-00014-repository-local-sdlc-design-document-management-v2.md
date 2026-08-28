---
id: "doc-00014"
title: "Repository-local SDLC design document management"
kind: lld
status: approved
version: 2
created_at: "2026-08-27T20:11:30.311Z"
updated_at: "2026-08-27T20:11:30.311Z"
created_by: "OpenCode"
metadata: {"legacy_spec":{"source_path":".specs/lld-00011-repository-local-sdlc-design-document-management-v2.md","source_sha256":"2a7aff839fe989f9fd34ceb3ca3bd75d1ff0a7d1c8ec759b77971a2392dd2ac1","decoder_version":1,"original_status":"approved","field_conversions":{"type":"kind","id":"migration_mapping","status":"approved","author":"created_by","timestamps":"canonical_utc_or_intent_timestamp"},"frontmatter":{"id":"00011","type":"lld","title":"Repository-local SDLC design document management","version":2,"status":"approved","parent":"00011","opencode-agent":"OpenCode"},"rewrites":[]}}
---

# Repository-local SDLC design document management

## Implementation Scope

This LLD implements Epic `hrn-00135` as a repository-local SDLC design-document
domain. It supersedes HLD/LLD 00011 v1 for active implementation decisions. The
v1 records remain migration inputs and historical evidence.

Implementation retains the established local persistence primitives and nine
normalized lifecycle tools. It removes remote Documents routes, generated
Documents guidance, and legacy-root compatibility; adds safe `.specs`
migration; narrows kinds; and fixes proposed-state capacity validation.

## Fixed Storage Contract

The live layout is fixed:

```text
.harnessctl/documents/
  doc-00001-<slug>-v1.md
  doc-00001-<slug>-v2.md
  archive/
    doc-00002-<slug>-v1.md
  .control/
    transaction.json
    transaction-files/
    specs-to-documents-v1/
      completion.json
      transaction.json
      preimages/
      proposed/
```

Only direct canonical Markdown children of the active and archive directories
are records. `.control` is private recovery state. IDs match
`doc-[0-9]{5,}` and are allocated as the lowest unused positive numeric suffix
across active and archived records. Filenames are
`<id>-<normalized-title>-v<version>.md`.

The root `.harnessctl/documents`, prefix `doc-`, and local tool set are product
constants. Python configuration, TypeScript validation, generated JSON Schema,
installer context, and adapters must reject remote provider keys, remote types,
noncanonical roots, and custom prefixes. A minimal `documents` capability flag
may remain only if existing configuration policy requires enablement; it must
not select authority or storage location.

## Canonical Record

Frontmatter contains exactly:

```yaml
---
id: "doc-00001"
title: "Example architecture"
kind: hld
status: draft
version: 1
created_at: "2026-08-27T00:00:00.000Z"
updated_at: "2026-08-27T00:00:00.000Z"
created_by: "optional attribution"
metadata: {}
---
```

`created_by` and `metadata` are optional. Unknown or duplicate fields fail.
Kinds are exactly `hld`, `lld`, `design-overview`, and `gdd`. Statuses remain
`draft`, `review`, and `approved`. Unsupported legacy kinds fail canonical
decode and every normalized input boundary; they are never relabeled.

The body starts with exactly one matching `# <title>` followed by one blank
line. Tool callers supply content after that heading and may not supply another
level-one heading. LF, UTF-8, canonical YAML, Unicode scalar, metadata, body,
file, aggregate, result, YAML-node, depth, and scalar limits remain those in
`documents-contract.ts` unless a separately approved contract changes them.

Version order derives `superseded`; location derives `archived`. Neither is
stored. Every lineage occupies exactly one location and has contiguous unique
versions beginning at 1.

## Normalized Operations

OpenCode and Pi project these generic contracts without semantic changes.

| Operation           | Inputs                                            | Result and mutation                                                                            |
| ------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `document_id`       | arbitrary text                                    | Extract one canonical ID or reject ambiguity.                                                  |
| `document_create`   | title, kind, optional status/author/body/metadata | Allocate v1 and return the canonical record.                                                   |
| `document_list`     | optional kind/status/location                     | Return bounded deterministic summaries; location is only `active` or `archive`.                |
| `document_get`      | id, optional version                              | Return the selected canonical record; default is latest.                                       |
| `document_update`   | id, expected revision, optional changes           | Replace current version only; prior version number is unchanged.                               |
| `document_version`  | id, expected revision, optional changes           | Publish the next immutable version.                                                            |
| `document_validate` | optional id                                       | Validate one lineage or the complete graph and repair projection only after canonical success. |
| `document_archive`  | id, expected current revision                     | Move the complete active lineage to archive.                                                   |
| `document_restore`  | id, expected current revision                     | Move the complete archived lineage to active.                                                  |

Records expose `id`, repository-relative `path`, canonical metadata, body,
exact-byte `revision`, `location`, `superseded`, and `archived`. Mutation errors
retain bounded categories for configuration, path safety, parse safety, schema,
canonical form, identity ambiguity, resource limit, stale revision, filesystem
durability, and synchronization. No operation retries through a provider or
reads a remote authority.

## Proposed-State Mutation Algorithm

Every mutation executes while holding the shared local barrier:

1. Recover any interrupted managed transaction.
2. Read with no-follow semantics and validate the complete current canonical
   graph.
3. Verify exact expected revisions and issue-reference preconditions.
4. Encode all proposed bytes in memory and calculate destination paths.
5. Apply replacements to an in-memory graph and validate the complete proposed
   graph: identities, contiguous lineages, one location, collisions, canonical
   bytes, per-file/body/frontmatter/YAML limits, total file count, aggregate
   bytes, at most 100 versions per lineage, and output bounds.
6. Publish one recoverable canonical batch only after step 5 succeeds.
7. Synchronize SQLite from a fresh canonical snapshot; if direct sync fails,
   attempt one full rebuild from that snapshot.
8. Return the canonical result. If both projection paths fail after canonical
   commit, report synchronization failure without reverting authority.

`document_create` therefore rejects a valid 2,000-file graph before proposing
file 2,001. `document_version` rejects a valid 100-version lineage before
proposing v101. Tests snapshot canonical file bytes, cache generation, and rows
and prove all remain unchanged after either rejection. Below-limit operations
must still succeed.

Path-changing update rejects referenced source paths before publication.
Archive rejects any referenced member of the lineage. Restore rejects active
collisions. Update and version require the latest exact-byte revision. Prior
versions are never rewritten.

## Publication, Recovery, And Projection

Ordinary lifecycle mutations use `withLocalBarrier`, bounded no-follow reads,
and `applyCanonicalFileBatch`. Lineage moves retain the bounded journal and
backup scheme under `.control`; recovery either completes or restores one
coherent location before normal discovery. Journal paths, counts, revisions,
and backup bytes are validated before use. The one-time `.specs` migration does
not use or raise the limits of this in-memory publisher; it uses the streaming
journal protocol below.

SQLite remains a disposable shared cache. Its Documents rows include canonical
identity, version, title, kind, status, location, path, revision, timestamps,
and cache generation. Reads and results come from canonical records, never
cache-only rows. Missing, stale, extra, malformed, or corrupt cache state is
replaced only from a valid canonical snapshot.

## Safe `.specs` Migration

Build adds one explicit, repository-local migration operation used by the
upgrade/install workflow before `.specs` compatibility is removed. It does not
read `HOME`, `.ai.tmp`, `.specs-v1`, or user-global OpenCode/Pi files.

### Inventory

- Discover bounded direct `.specs/*.md` regular non-symlink files.
- Decode the bounded legacy variants represented by every current HLD/LLD
  fixture. The filename must provide type, numeric identity, and version.
  Nonempty frontmatter `type`/`id`/`version` values must agree; missing or empty
  values fall back to the filename. Title precedence is nonempty frontmatter,
  then the single title H1, then the filename slug. Conflicting nonempty title
  values fail closed instead of silently changing content.
- Accept statuses `draft`, `review`, `approved`, `implemented`, and
  `superseded`. Map `implemented` and `superseded` to canonical `approved`, and
  retain the original status in namespaced metadata. Any other status fails.
- Preserve valid source timestamps. Otherwise use the migration intent
  timestamp captured in the fsynced journal for `created_at`, and use valid
  source `updated_at` or the derived `created_at`. Recovery and rerun reuse that
  same timestamp.
- Preserve every bounded YAML-safe legacy frontmatter field under
  `metadata.legacy_spec.frontmatter`, including `parent`, `opencode-agent`,
  `author`, and `superseded-by`. Also retain source path, source SHA-256, decoder
  version, original status, and the explicit field-conversion map.
- Derive canonical `created_by` from the first nonempty scalar in
  `created_by`, `author`, then `opencode-agent`. Preserve every original field
  regardless; reject a non-scalar selected value rather than stringifying it.
- Reject duplicate source identity/version pairs, malformed metadata, unsafe
  paths, unsupported types, content limits, ambiguous issue references, and a
  preexisting conflicting canonical destination.
- At Plan time 15 files exist. HLD/LLD 00011 v2 make the expected Build-time
  inventory 17, but execution relies on validated discovery rather than a
  hard-coded count.

### Mapping

The migration identity is `specs-to-documents-v1`. Fingerprint the sorted
`(path, SHA-256)` source set. Sort sources by numeric ID, type, version, and path,
then allocate the lowest free `doc-` lineage for each distinct `(type, numeric
ID)` against the validated pre-migration catalog. Persist the allocation in the
journal before publication; never recompute it during recovery. HLD and LLD
sharing an old numeric ID therefore cannot collide.

Preserve the selected title, mapped kind/status, version, author attribution,
all namespaced legacy metadata, and every Markdown section after the source
title H1. Rewrite only exact Markdown destinations or repository-relative path
tokens that name another mapped `.specs` source; preserve surrounding prose and
leave `.specs-v1` references byte-equivalent. Record each rewrite in bounded
migration metadata and retain the original source digest for audit. After
cutover, no latest active migrated version may contain a resolvable `.specs`
authority reference.

If old versions cannot form a valid canonical lineage under one mapped ID, fail
before publication rather than silently renumbering or dropping a file. The
migration must not invent `design-overview` or `gdd` records. Fixture tests cover
all 17 Plan-time sources and prove every source section and safe frontmatter
value is represented by canonical content or namespaced metadata.

### Issue-link reconciliation

Scan active and archived canonical issues under the shared barrier. Replace
only structured `.specs` entries in document arrays and legacy structured
`design`/`spec` metadata when they exactly map to a migrated source. Preserve
all other issue bytes semantically and never rewrite body text, comments,
timestamps unrelated to the normalized mutation, or immutable history.

The implementation uses the canonical issue codec and revision checks rather
than textual YAML replacement. Missing, stale, unsafe, or ambiguous references
fail the entire migration before legacy deletion. After the proposed rewrite,
full issue validation must pass with no live `.specs` or `.ai.tmp` links.

### Commit and rollback

Use `.harnessctl/documents/.control/specs-to-documents-v1/completion.json` as the
bounded completion record,
`.harnessctl/documents/.control/specs-to-documents-v1/transaction.json` as the
authoritative in-flight manifest, the sibling `preimages/` tree for exact
before-images, and `proposed/` for encoded replacement bytes. These migration
files are separate from the ordinary lineage journal. Recovery always resolves
a valid journal before inventorying a new migration.
The manifest contains the migration identity, source-set fingerprint, intent
timestamp, deterministic mapping, expected issue revisions, phase, and one
entry per source, issue, canonical, or control path touched. Each entry records
path, original presence, byte count, whole-file SHA-256, exact revision, and an
indexed preimage-entry path when the original existed. Each logical preimage has
a numeric directory containing fixed 1 MiB zero-padded `.bin` chunks and a
sidecar that binds chunk order, exact lengths, per-chunk SHA-256 values, and the
whole-file digest. The root manifest binds every sidecar digest. No recovery
name is derived from an authority path. Proposed replacements use the same
chunk-and-sidecar format under `proposed/`; their sidecars bind destination,
encoded byte count, chunks, and whole-file digest. Deletions have no proposed
payload.

Migration recovery state has explicit independent bounds derived from at most
2,000 legacy sources and 9,999 canonical Issues: at most 12,000 logical
preimages, 14,000 authority operations including absent destination creations,
16 MiB per logical preimage or proposed replacement, 192,000 MiB aggregate per
preimage or proposed tree, 1 MiB per chunk, 16 KiB per sidecar, 192 MiB aggregate
sidecars per tree, and 16 MiB per root manifest or completion record. Domain
limits still apply to decoded sources and issues. Planning computes encoded
metadata, chunk counts, and exact required bytes and confirms sufficient local
storage, including both trees and bounded temporary/replacement overhead, before
preparation or authority mutation. Exceeding a bound or unavailable capacity
fails before mutation. The complete current 17-file fixture plus every affected
active/archive issue must fit in an integration test; maximum-size Issue,
maximum-operation-count, and aggregate-boundary planner tests prove the product
limits independently without requiring a 192 GiB allocation.

Preparation creates a private owned temporary preimage directory with exclusive
chunk and sidecar files and an equivalent private proposed-output directory.
Migration decodes and validates one bounded source or Issue at a time, writes and
flushes its proposed chunks immediately, and retains only bounded identity,
relationship, revision, path, and digest indexes needed for complete graph
validation. It never retains aggregate authority or proposed bytes. Migration-
owned buffers, indexes, and the single current decoded record have a 512 MiB
working-set ceiling enforced during planning and preparation; projected or
observed excess fails before authority mutation. Preparation verifies all counts,
lengths, and digests, then writes and atomically renames the root manifest last.
The manifest rename is the point at which recovery state becomes authoritative.
Before that point no authority path may change; startup may remove only bounded,
ownership-validated orphan preparation directories when no authoritative
transaction manifest exists.

After `prepared`, a migration-specific streaming publisher processes the
manifest's normalized, case-fold-unique operations in deterministic path order.
For each replacement it re-verifies the current path against manifest evidence,
streams proposed chunks into one private same-directory temporary file, verifies
the written byte count and digest, flushes it, atomically replaces the
destination, completes the required directory barrier, and durably advances a
manifest cursor. Deletions likewise re-verify before removal and advance the
cursor only after the durability barrier. At most one 16 MiB decoded record, one
1 MiB input chunk, one 1 MiB output chunk, the bounded indexes, and constant
publication metadata are live; neither the publisher nor rollback stores an
in-memory before-image map. Failure or interruption restores paths in reverse
cursor order by streaming verified preimage chunks. Recovery also verifies
actual path digests, so a kill between path mutation and cursor advancement is
safe. This publisher accepts at most 14,000 operations and is not exported for
ordinary lifecycle batches.

Durable phases are `prepared`, `published`, `validated`, `restored`, and
`committed`:

1. `prepared`: proposed Documents and Issues graphs, encoded bytes, limits,
   destinations, source deletions, preimages, proposed chunks, storage, and
   working-set estimates validate completely.
2. `published`: the recoverable streaming publisher writes canonical records and
   normalized issues and removes `.specs` sources; every operation cursor and
   required file/directory durability barrier completes before the phase
   advances.
3. `validated`: fresh no-follow discovery validates the published Documents and
   Issues authority, including rewritten internal and structured links.
4. `restored`: pre-commit recovery has restored and freshly verified every
   original presence, byte count, digest, and revision and removed every newly
   proposed path. The updated manifest is flushed and atomically published before
   any preimage cleanup.
5. `committed`: the fsynced completion record stores the source fingerprint,
   mapping, target revisions/digests, and resulting issue revisions. This marker
   is the canonical commit point.

The cross-platform fault model covers process exceptions, reported syscall
failure, process kill, and restart at every phase. On Linux and macOS, each file
is flushed before rename and affected directories are synchronized where the
platform supports it; a reported required flush/rename error aborts or recovers.
On Windows, all paths must share one volume, file and manifest handles are
flushed before close, and same-volume atomic replacement occurs only after the
journal is durable; restart recovery relies on the journal-first ordering.
Windows does not claim directory-fsync or sudden-power-loss durability beyond
the guarantees reported by the filesystem. This is a normal supported Windows
path, not an unconditional refusal. Network, virtual, read-only, locked, or
other filesystems that cannot provide required atomic replacement or successful
file flush fail before publication.

Recovery before `committed` reconstructs exact source, issue, preexisting target,
and control bytes from verified chunks, removes newly proposed paths, verifies
the restored snapshot, durably advances the manifest to `restored`, and leaves
SQLite generation/rows unchanged. Recovery of `restored` first re-verifies every
current path against the manifest's original presence, count, digest, and
revision evidence. It then atomically removes the authoritative manifest and
completes that directory durability barrier before deleting now-orphaned owned
chunks, sidecars, preimage directories, and finally the empty control directory.
After manifest removal, restart cleanup may remove only ownership-validated
orphans and cannot mutate authority. Process-kill tests cover the terminal marker,
manifest removal, every chunk/sidecar/logical-preimage deletion, and final
directory deletion. Recovery at or after `committed` verifies the completion
record and finishes journal/source cleanup; it never restores retired `.specs`
authority. SQLite synchronization starts only after the commit marker. Direct
sync gets one rebuild attempt; double failure returns a synchronization error
while the committed canonical migration remains valid and later initialization
retries repair.

A rerun with no sources is a no-op only when the completion record, every mapped
target digest/location, and all resulting structured issue links verify. A
reappeared or changed source set, missing/divergent/duplicate/archived target,
duplicate migration metadata, changed completion record, or stale issue link
fails closed. Without a valid journal or completion record, even byte-matching
preexisting output is a collision, not evidence of success. Return the stored
bounded old-path to new-path mapping and counts.

`.specs-v1` remains untouched inert history. `.ai.tmp` receives no migration;
any active structured `.ai.tmp` issue link blocks migration with an actionable
error until explicitly reconciled, preventing silent data loss.

## SDLC Plan Integration

The existing `sdlc` Plan references replace the generated Documents skill:

1. Resolve one owning Epic and select the proportionate design kind.
2. Show the proposed artifact and issue-link mutations for confirmation.
3. Create a `draft` record with `document_create`; supplied content omits H1.
4. Use `document_update` for same-version review corrections with the latest
   revision.
5. Use `document_version` for an approved semantic successor; prior versions
   remain immutable and derived-superseded.
6. Set `review` or `approved` only from confirmed lifecycle decisions.
7. Link the active approved path to its issue through normalized Issues tools.
8. Validate the lineage and issue authority before checkpointing.

HLD covers architectural boundaries. LLD covers executable detail and links to
its HLD parent through metadata. `design-overview` is used instead of duplicating
HLD+LLD for small designs. `gdd` is used only in the game-development domain.
No workflow requires all four artifacts.

Tests run with absent and hostile `HOME` values and prove no read, copy, or
template import from `~/.config/opencode` or user Pi configuration.

## Removal Map

Build removes only Documents-specific remote and legacy surfaces:

- Remote branches and fields from Python/TypeScript Documents config and JSON
  Schema; fixed local contract remains.
- Documents provider contracts, wiki capability fixtures, MCP intents, managed
  IDs/reservations, provider lookup, remote guidance, and credentials fields.
- `sdlc-documents` registries, Jinja templates, package resources, smoke checks,
  generated `.opencode`/`.pi` trees, docs, and tests.
- `.specs` and `.ai.tmp` issue-link recognizers, adapter descriptions, and
  current operator guidance after successful migration.
- Kinds `task`, `draft`, and `document` from codec, schemas, filters, adapters,
  cache fixtures, docs, and tests.

Installer cleanup removes an exact previously managed `sdlc-documents` tree in
the same host transaction. A modified tree is preserved byte-for-byte with a
deterministic warning and cannot be reported as removed. Negative assertions
prove no Documents agent or agent manifest is generated.

Do not remove or weaken CVS/Issues Gitea and Forgejo commands, IDs, pins,
environment mappings, deduplication, exact historical migration, modified
historical preservation, raw JSON preservation, or rollback tests. Historical
issue comments, memory, old Changesets/changelogs, `.specs-v1`, and superseded
design content may mention retired behavior but are not package inputs,
generated output, current guidance, or live authority.

## Test Matrix

- Codec: four accepted kinds; three removed kinds and malformed canonical files
  reject before mutation; strict H1/YAML/UTF-8/size behavior remains.
- Lifecycle: deterministic IDs/listing, exact revisions, immutable versions,
  update rename/reference checks, archive/restore, concurrency, interruption,
  journal recovery, and projection repair.
- Proposed state: 2,000-to-2,001 files, 100-to-101 versions, aggregate bytes,
  destination collision, and encoded result limits preserve canonical/cache
  snapshots on rejection.
- Migration: all supported files, shared old IDs across HLD/LLD, multiple
  versions, every legacy field/status variant, internal `.specs` links,
  structured active/archive issue links, clean and completed reruns,
  interrupted reruns at every durable phase, matching output without completion
  evidence, divergent/duplicate/archived mappings, source-set changes,
  malformed or unsupported source, case-folding and Unicode-normalization
  collisions, stale issue revision, `.ai.tmp` blocker, read-only/locked files,
  maximum-size canonical Issues, aggregate preimage planner boundaries,
  maximum 14,000-operation publication, simulated 192,000 MiB streaming with
  bounded physical fixtures, 512 MiB working-set enforcement, insufficient
  storage, interruption before/after each publication cursor and rollback
  cleanup deletion, injected publication/recovery failures, pre-commit exact
  rollback, and post-commit projection failure/repair.
- Integration: equivalent generic/OpenCode/Pi schemas/results; SDLC Plan
  guidance; issue links; absent/hostile `HOME`; no skill/agent/provider output.
- Cleanup: remote config rejects without fallback; no Documents MCP intent,
  managed ID, wiki contract, credential field, provider guidance, or package
  resource remains; exact managed skill cleanup and modified preservation pass.
- Regression: CVS/Issues provider separation and historical Gitea preservation,
  task-root issue links, Memory, external MCP configuration, raw host JSON,
  install/reinstall/force/rollback, package parity, Changeset scope, current
  docs, full quality, and full build remain green.
- Platform matrix: Linux, macOS, and Windows exercise migration replacement,
  interruption, recovery, rollback, path normalization, manifest/preimage
  preparation, and durability failure under the stated fault model; migration
  fails before mutation when required guarantees are unavailable.

## Delivery Order

1. `hrn-00142`: approve this v2 design and align active provenance.
2. `hrn-00136`, then `hrn-00137`: lock provider regression boundaries and
   narrow the local authority.
3. `hrn-00138`, `hrn-00140`, `hrn-00141`, and `hrn-00144`: remove remote
   Documents, migrate legacy specs, and close lifecycle defects.
4. `hrn-00143`: prove historical CVS/Issues Gitea behavior survived cleanup.
5. `hrn-00139`: integrate SDLC guidance, adapters, installer cleanup, current
   docs, packages, and release evidence after all dependencies pass.
