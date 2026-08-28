---
id: "doc-00014"
title: "Repository-local SDLC design document management"
kind: lld
status: approved
version: 4
created_at: "2026-08-27T20:11:30.311Z"
updated_at: "2026-08-27T23:44:58.639Z"
created_by: "OpenCode"
metadata: {"legacy_spec":{"source_path":".specs/lld-00011-repository-local-sdlc-design-document-management-v3.md","source_sha256":"69d2dbac873562c4b08b194e86afda36c0ae4f7941c7baf2756fe52de39f284d","decoder_version":1,"original_status":"approved","field_conversions":{"type":"kind","id":"migration_mapping","status":"approved","author":"created_by","timestamps":"canonical_utc_or_intent_timestamp"},"frontmatter":{"id":"00011","type":"lld","title":"Repository-local SDLC design document management","version":3,"status":"approved","parent":"00011","opencode-agent":"OpenCode"},"rewrites":[]}}
---

# Repository-local SDLC design document management

## Purpose And Inherited Contract

This LLD supersedes LLD v3. It removes migration packaging, the Python bridge, migration-only streaming transaction, consent, recovery, completion, and provenance design. Harnessctl is unreleased, no external repository needs an upgrade path, and this repository's one-time `.specs` conversion is complete.

The fixed Documents codec and lifecycle remain unchanged: four kinds, nine operations, complete proposed-state validation, exact revisions, locking, bounded no-follow reads, atomic lifecycle publication, ordinary Documents journal recovery, archive/restore, issue-link preflights, disposable cache, Plan workflow, thin adapters, provider separation, and hostile-environment privacy.

## Preservation Inventory

Before migration code or control evidence is removed, Build validates the existing completion record as temporary bootstrap evidence:

- exactly 19 mappings target 19 source-derived canonical records across 14 valid lineages;
- every mapped target path exists and its bytes match `targetSha256`;
- every target retains `metadata.legacy_spec.source_path` and `source_sha256` matching the mapping, plus original frontmatter/status, decoder version, field conversions, and rewrites;
- HLD/LLD v4 exist as two additional successors, so 21 direct active files exist at Plan completion;
- canonical structured issue links resolve with no live `.specs` or `.ai.tmp` target;
- no direct `.specs/*.md` source or migration `transaction.json` remains;
- `.specs-v1` remains byte-unchanged inert history;
- normalized Documents and Issues validation passes.

Before deleting the completion record, Build generates or verifies an immutable checked-in preservation fixture or constants containing the exact 19 source paths, target paths, source digests, target digests, and lineage identities. Tests validate this persistent evidence against canonical metadata and files before deletion and continue doing so after deletion. The 21 canonical files, their bodies and metadata, issue links, immutable comments, the persistent preservation evidence, and `.specs-v1` are preservation authority. SQLite is disposable.

## Runtime Removal

Delete migration-only runtime files:

- `src/harnessctl/specs_migration_bridge.py`;
- `extensions/generic-tools/specs-migration-cli-arguments.ts`;
- `extensions/generic-tools/specs-migration-cli.ts`;
- `extensions/generic-tools/specs-migration.ts`;
- `extensions/generic-tools/streaming-transaction.ts`.

Remove migration/streaming exports from `extensions/generic-tools/index.ts`. Remove the bridge import, `migrate_specs` API parameter, prerequisite invocation, `--migrate-specs` CLI option, and forwarding from `src/harnessctl/install.py`.

Do not remove ordinary Documents lifecycle transactions in `extensions/generic-tools/documents.ts`, including its private control, transaction-file, recovery, archive, and restore behavior.

## Build And Package Removal

Delete the three migration resource scripts and `src/harnessctl/resources/specs-migration/`. Remove root migration scripts and hooks, the generic-tools provenance build hook, package-audit migration branch, migration-specific ignore entries, `harnessctl-specs-migrate` bin, and lockfile entry. Remove the exact direct esbuild dependency if no longer directly required; regenerate the lockfile.

Rebuild package outputs. Generic-tools tarballs contain no migration CLI, service, streaming transaction, or provenance output. Python wheel, sdist, and sdist-built wheel contain no bridge or migration resource.

## Test Removal And Replacement

Delete `tests/test_specs_migration_bridge.py`, `extensions/generic-tools/specs-migration.spec.ts`, and `extensions/generic-tools/streaming-transaction.spec.ts`. Remove only migration consent/ordering tests from installer tests and migration bridge/resource/provenance/execution assertions from release-artifact tests. Replace positive migration guidance assertions with active stale-surface absence assertions.

Retain tests for canonical Documents create/list/get/update/version/validate/archive/restore, exact revisions, proposed-state limits, issue-reference preflights, ordinary Documents transaction recovery, cache cold/corrupt rebuild, OpenCode/Pi parity, CVS/Issues preservation, stale managed-skill handling, hostile `HOME`, and package parity.

Before deleting completion state, add a persistent checked-in preservation fixture or constants derived from the completion record. Tests first prove that all 19 source paths, target paths, source digests, target digests, and lineage identities agree with the temporary completion record, canonical targets, and `metadata.legacy_spec`; after deletion, the same tests validate the persistent fixture directly against canonical targets and metadata without reading `completion.json`. Add absence assertions for installer signatures/help, generic exports, package bins/tarballs, Python artifacts, root scripts, current docs, active designs, and generated outputs. Historical/superseded documents, immutable comments, memory, changelog history, `.specs-v1`, and the bounded preservation fixture are stale-scan exclusions.

## Current Documentation And Changeset

Remove installer migration instructions and the migration operational section from current docs. State only that no live `.specs`/`.ai.tmp` compatibility or migration command ships and `.specs-v1` is inert history. Point current guidance to HLD/LLD v4. Revise the active Changeset to announce repository-local Documents lifecycle and canonical issue links without migration.

## Issue Reconciliation

Reuse existing issues only:

- `hrn-00135`: replace migration-platform scope and acceptance with Documents product and migration-absence acceptance.
- `hrn-00139`: remove migration from current documentation acceptance; require lifecycle, canonical links, package parity, and migration-surface absence.
- `hrn-00140`: retitle to `Retire completed repository-only .specs migration machinery`; preserve converted authority while removing all shipped migration surfaces and completion state.
- `hrn-00142`: retitle to `Reconcile Documents design after repository-only migration`; require v4 design/issue/current-guidance consistency and no active migration requirement.
- `hrn-00145`: retitle to `Remove migration-only streaming transaction and stale control surfaces`; replace obsolete recovery acceptance with deletion while retaining ordinary Documents recovery.

Create no issue. Keep immutable comments as history.

## Repository Cleanup

After persistent preservation evidence and validators pass again, remove only `.harnessctl/documents/.control/specs-to-documents-v1/completion.json`, its now-empty migration-specific directory, and empty `.specs`. Retain `.harnessctl/documents/.control/` for ordinary lifecycle journals and retain `.specs-v1` unchanged. No migration helper remains; canonical per-document provenance, the checked-in preservation fixture, tests, and Git history are sufficient.

## Ordered Build Slices

1. Capture exact Git status/diff and fence unrelated changes.
2. Verify completion mappings, target digests, legacy metadata, 19 converted records, 14 lineages, two v4 successors, issue links, and `.specs-v1`; create and validate persistent preservation evidence.
3. Reconcile the five existing issues and link approved v4 designs.
4. Remove migration runtime and migration-only streaming code.
5. Remove build, package, resource, installer, and generated surfaces; regenerate lock and packages.
6. Revalidate persistent preservation evidence, then remove migration completion state and empty `.specs`.
7. Revise tests, docs, and Changeset; add stale-surface absence coverage.
8. Exercise cache rebuild from canonical authority.
9. Run focused and complete quality/build/package/artifact checks, Documents/Issues validation, and final dirty-worktree loss review.

## Acceptance

- Temporary completion evidence and the persistent checked-in fixture agree on all 19 converted source/target paths, digests, and 14 lineage identities before completion deletion; after deletion, the fixture still validates all canonical targets and legacy metadata.
- All 19 converted records and 14 lineages remain valid and content-preserved alongside the two v4 successors.
- Every converted record retains complete legacy provenance; `.specs-v1` remains unchanged.
- Canonical issue links remain valid; historical prose remains immutable.
- Exactly four kinds and nine lifecycle tools remain equivalent across generic, OpenCode, and Pi.
- Lifecycle mutation, revision, limits, archive/restore, issue-preflight, ordinary recovery, and cache rebuild tests pass.
- Installer API/help, Python artifacts, npm exports/bin/tarballs, root scripts, lockfile direct declarations, current docs, active designs, and generated outputs contain no migration capability.
- No `.specs` or `.ai.tmp` new-link compatibility exists.
- Full configured quality, build, package, artifact, stale-surface, Documents, Issues, and diff checks pass.

## Failure Rules

If mapping count, target digest, provenance, persistent preservation evidence, lineage validation, issue links, or `.specs-v1` differs, stop before deleting migration code or control state. Never use SQLite as recovery evidence. Never reset or clean the dirty worktree. Any ambiguity over whether a helper belongs to ordinary Documents lifecycle blocks deletion until source/tests prove ownership.
