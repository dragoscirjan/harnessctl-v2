---
id: "doc-00013"
title: "Repository-local SDLC design document management"
kind: hld
status: approved
version: 2
created_at: "2026-08-27T20:11:30.311Z"
updated_at: "2026-08-27T20:11:30.311Z"
created_by: "OpenCode"
metadata: {"legacy_spec":{"source_path":".specs/hld-00011-repository-local-sdlc-design-document-management-v2.md","source_sha256":"28709a0fb686c4118e46e1829ef9e5af1563b50bde90a4bce4d504b4de8b33a7","decoder_version":1,"original_status":"approved","field_conversions":{"type":"kind","id":"migration_mapping","status":"approved","author":"created_by","timestamps":"canonical_utc_or_intent_timestamp"},"frontmatter":{"id":"00011","type":"hld","title":"Repository-local SDLC design document management","version":2,"status":"approved","opencode-agent":"OpenCode"},"rewrites":[]}}
---

# Repository-local SDLC design document management

## Context

Harnessctl needs an SDLC-owned design-document domain comparable to its
repository-backed Issues domain. The domain prepares and maintains design
records for Plan work; it is not copied from user-level OpenCode configuration
and does not install agents.

Version 1 mixed the local document lifecycle with remote wiki authorities,
provider MCP configuration, a generated Documents skill, and compatibility
with `.specs` and `.ai.tmp`. Those concerns are not part of the intended
product. This version replaces that architecture while preserving the useful
local lifecycle already implemented.

The repository currently contains supported HLD and LLD records under
`.specs`. They are product data, not disposable compatibility files. Build must
migrate them safely into the new authority before retiring `.specs` support.

## Goals

- Make `.harnessctl/documents` the only live design-document authority.
- Support exactly `hld`, `lld`, `design-overview`, and `gdd` records.
- Let the existing SDLC Plan workflow create, review, approve, version, link,
  validate, archive, and restore design records.
- Expose one normalized local tool contract through thin OpenCode and Pi
  adapters without installing a Documents agent or generated skill.
- Preserve exact-byte optimistic concurrency, immutable prior versions,
  bounded validation, locking, atomic publication, recovery, and disposable
  SQLite projection.
- Migrate every supported `.specs` design record and its structured issue links
  transactionally without deleting document content on failure.
- Remove remote Documents providers and other live legacy surfaces without
  changing CVS or Issues provider behavior.

## Non-Goals

- Remote wiki authorities, provider SDKs, provider MCP routes, credentials,
  local/remote synchronization, or future-provider seams in this release.
- Agents, a generated `sdlc-documents` skill, or reads from
  `~/.config/opencode`.
- Generic drafts, task artifacts, PRDs, requirements, attachments, WYSIWYG
  editing, collaborative editing, or full-text search.
- Importing `.ai.tmp` or making `.specs-v1` a live authority.
- Rewriting immutable issue comments, memory records, changelog entries, or
  other historical evidence that names retired behavior.

## Authority Model

Canonical active records live directly under `.harnessctl/documents`.
Archived records live under `.harnessctl/documents/archive`. Control and
recovery material may live under `.harnessctl/documents/.control` but is never
returned as a document. The root and `doc-` identifier prefix are product
constants, not operator-selectable provider configuration.

The shared SQLite database is a disposable projection. Canonical Markdown is
always authoritative. A missing, stale, or corrupt projection is rebuilt only
from a completely validated canonical graph.

Task artifacts remain under the configured task root. Issues remain canonical
YAML records under `.harnessctl/issues`. `.specs-v1` remains inert historical
evidence and is not discovered by Documents or accepted as a new issue link.

## Components

### SDLC Plan workflow

The existing `sdlc` Plan guidance owns document generation. It selects HLD and
LLD when architecture and implementation detail warrant them, a
`design-overview` for a proportionate single design, and `gdd` only for game
work. It uses normalized tools, requests approval before authoritative
mutation, and links approved records to the owning issue.

### Generic Documents service

The generic TypeScript service owns the canonical codec, discovery, lifecycle,
validation, migration, persistence barrier, recovery, and cache projection. It
provides the existing nine normalized operations:

`document_id`, `document_create`, `document_list`, `document_get`,
`document_update`, `document_version`, `document_validate`,
`document_archive`, and `document_restore`.

### Host adapters

OpenCode and Pi expose equivalent schemas and results for the normalized local
operations. Adapters contain no provider routing, persistence logic, templates,
agent definitions, or home-directory discovery.

### Issues integration

Issues may link active canonical Documents by repository-relative path. The
document service prevents path-changing updates and archive operations from
orphaning live references. The one-time migration rewrites structured legacy
`.specs` links to their canonical targets in the same recoverable transaction.
Issue bodies and comments are historical text and are not rewritten.

## Lifecycle And Failure Boundaries

Create allocates a deterministic repository-local ID. Update rewrites only the
current version after an exact-byte revision check. Version creates a new
immutable version. Archive and restore move a complete lineage and reject
partial lineages, references, or destination collisions. Reads and lists are
deterministic, bounded, and derived from validated canonical files.

Every mutation constructs and validates the complete proposed graph while
holding the shared local barrier and before canonical publication. Validation
includes path containment, no-follow reads, canonical encoding, file and
aggregate bytes, total files, lineage versions, identities, destinations,
issue-reference preflights, and resulting output bounds. A rejected mutation
changes neither canonical bytes nor SQLite evidence.

Canonical publication is an atomic recoverable batch. If projection sync and
rebuild both fail after canonical publication, the canonical result remains
authoritative, the operation reports projection failure, and later
initialization retries repair.

## Migration And Removal

Build provides a one-time explicit local migration for supported `.specs` HLD
and LLD files. At the time this version is authored, 15 supported files exist;
the two version-2 records bring the expected migration inventory to 17. The
migration discovers the actual bounded inventory rather than relying on that
count.

Before publication it validates every source with a bounded legacy decoder that
covers the complete current fixture inventory. Filename identity and version
are mandatory; compatible frontmatter wins when nonempty, then the title H1,
with deterministic status and timestamp conversion. Every safe legacy
frontmatter value and the source digest remain in namespaced metadata. All
Markdown sections are retained, while exact links to migrated `.specs` files
are rewritten to canonical targets; `.specs-v1` text is unchanged.

The migration uses a versioned identity, deterministic allocation, a source-set
fingerprint, and a durable completion record. A bounded manifest binds every
touched path to a digest-bound private preimage, split into fixed-size chunks so
every valid canonical Issue can be preserved. Recovery capacity covers the
combined 2,000 legacy-source and 9,999 canonical-Issue boundaries, while a
migration-specific streaming publisher covers the resulting source deletions,
issue replacements, and canonical creations without retaining aggregate bytes in
memory. Proposed output is also staged as digest-bound chunks. The full required
storage is preflighted before authority mutation, and peak migration working set
is bounded independently of repository size. The manifest is made authoritative
only after all preimages, proposed output, and metadata are flushed. Recovery
runs before a new attempt and either restores every pre-commit byte or completes
an already committed cutover. Source files are removed only in the publication
sequence after the proposed Documents and Issues graphs validate. The commit
marker is written only after published authority validates and the platform
durability protocol completes.

Before the commit marker, any collision, malformed input, stale issue revision,
limit, interruption, or publication failure restores exact source, issue,
preexisting target, and control bytes and leaves SQLite unchanged. Exact
restoration is durably marked before cleanup; the authoritative manifest is
removed before the now-orphaned owned preimages, so interruption at any cleanup
step remains restart-safe. After the commit marker, canonical Documents and
Issues remain authoritative; projection sync/rebuild failure reports a
repairable synchronization error and later initialization retries it. A verified
completion record makes rerun a no-op; changed sources, divergent targets,
duplicate mappings, archived mappings, or stale links fail closed.

`.ai.tmp` is not migrated. `.specs-v1` stays untouched as inert history.
Current runtime, schemas, adapters, and docs stop accepting either legacy root
after successful migration.

Remote Documents configuration, wiki contracts, provider intents, managed IDs,
and provider guidance are removed. Legacy remote Documents configuration fails
closed with a bounded removal instruction and is never translated to local
authority. Documents-specific Gitea and Forgejo code is removed, while existing
CVS and Issues separation and historical-definition preservation remain
regression requirements.

The generated `sdlc-documents` skill is removed from registries, templates,
packages, smoke checks, and generated trees. Installation removes only an exact
previously managed skill tree transactionally. Operator-modified content is
preserved with a warning.

## Security And Privacy

- Resolve all managed paths beneath fixed repository roots and reject absolute,
  escaping, dot-segment, symlink, non-regular, and unsupported paths.
- Require bounded UTF-8, strict unambiguous YAML, canonical Markdown, and
  deterministic output limits.
- Never read user-global OpenCode/Pi configuration or infer templates from
  `HOME`.
- Never store credentials, provider responses, secrets, transcripts, or
  chain-of-thought in Documents.
- Preserve operator-owned host files unless exact managed ownership is proven.

## Delivery Slices

1. Reconcile the approved design and preserve CVS/Issues provider boundaries.
2. Narrow and harden the repository-local authority, including proposed-state
   validation and exact four-kind enforcement.
3. Migrate supported `.specs` records and issue links; remove legacy link
   compatibility and remote Documents surfaces.
4. Integrate the local tools into SDLC Plan, OpenCode, Pi, installation,
   packages, current docs, and release evidence without a Documents skill or
   agent.

## Verification Strategy

Verification covers canonical codec and lifecycle behavior, hostile paths and
`HOME`, all current legacy fixtures and metadata/status variants, internal-link
rewrites, migration success/idempotence/collision/rollback, issue-link
reconciliation, exact kind rejection, 2,000-to-2,001 files and 100-to-101
versions, maximum-size affected Issues, aggregate preimage planning boundaries,
maximum path-count streaming publication, simulated aggregate streaming,
interruption at every durable phase, publication cursor, and cleanup deletion,
pre- versus post-commit cache failure, both host adapters, installer stale-skill
cleanup, remote-config rejection, absence of Documents provider intents or
generated skill/agent output, package parity, and full configured quality/build
gates. Migration
durability runs on Linux, macOS, and Windows. The supported fault model covers
process interruption, forced termination, and reported filesystem failures on
all three. POSIX additionally flushes directory metadata where supported;
Windows uses journal-first same-volume atomic replacement and flushed file
handles, without claiming survival of unacknowledged storage loss or sudden
power loss. Unsupported filesystems or failed required primitives reject before
authority mutation.

Active-surface stale-reference scans cover runtime source, schemas, templates,
adapters, current docs, package resources, generated host output, and
structured issue link metadata. Immutable comments, memory, changelog history,
`.specs-v1`, and superseded design versions may retain historical wording but
must not be executable or discoverable authorities. Latest migrated versions
must contain no resolvable reference to the retired `.specs` authority.
