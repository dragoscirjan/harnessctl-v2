---
id: "doc-00013"
title: "Repository-local SDLC design document management"
kind: hld
status: approved
version: 4
created_at: "2026-08-27T20:11:30.311Z"
updated_at: "2026-08-27T23:44:58.450Z"
created_by: "OpenCode"
metadata: {"legacy_spec":{"source_path":".specs/hld-00011-repository-local-sdlc-design-document-management-v3.md","source_sha256":"1da675042004ab8f0921da72e203e71d909e093781b06d89611a1d19013d5aac","decoder_version":1,"original_status":"approved","field_conversions":{"type":"kind","id":"migration_mapping","status":"approved","author":"created_by","timestamps":"canonical_utc_or_intent_timestamp"},"frontmatter":{"id":"00011","type":"hld","title":"Repository-local SDLC design document management","version":3,"status":"approved","opencode-agent":"OpenCode"},"rewrites":[]}}
---

# Repository-local SDLC design document management

## Status And Supersession

This version supersedes HLD v3. Harnessctl is unreleased and has no external repositories requiring a `.specs` upgrade. This repository's one-time conversion is complete. The Documents domain is the product; migration was repository bootstrap history and is not a shipped capability.

All unaffected repository-local Documents decisions remain authoritative: `.harnessctl/documents` is the only live authority; kinds are exactly `hld`, `lld`, `design-overview`, and `gdd`; the nine normalized lifecycle operations remain; complete proposed-state validation, exact revisions, locking, atomic publication, ordinary Documents journal recovery, archive/restore, issue-reference preflights, disposable SQLite projection, SDLC Plan integration, and thin OpenCode/Pi adapters remain required.

## Context

The repository previously held design records under `.specs`. Nineteen source-derived canonical records now exist across 14 lineages, structured issue links target canonical paths, and every converted record retains namespaced `metadata.legacy_spec` provenance. HLD and LLD v4 add two successors, so Plan completion has 21 direct active files while the preservation set remains the 19 completion-mapped records.

The reusable migration runtime, packaged runner, Python bridge, streaming publisher, completion protocol, and release provenance were built from an incorrect assumption that released installations would need an upgrade path. Maintaining that subsystem adds security, recovery, packaging, platform, and release complexity unrelated to ongoing document creation and maintenance. Because no released consumer depends on it, compatibility is unnecessary.

## Goals

- Deliver repository-local creation and maintenance of canonical SDLC design documents.
- Preserve the 19 converted records, 14 lineages, canonical issue links, embedded legacy provenance, v1-v3 history, v4 successors, and `.specs-v1` evidence.
- Remove every shipped `.specs` migration API, CLI, runtime, bridge, transaction engine, package resource, generated artifact, build hook, and active operational instruction.
- Retain ordinary Documents lifecycle safety, cache reconstruction, adapter parity, provider isolation, and privacy guarantees.
- Ensure `.specs` and `.ai.tmp` are not live authorities or accepted new-link targets.

## Non-Goals

- Supporting migration or upgrades from `.specs` in any repository.
- Retaining a reusable or one-time migration script after the completed repository conversion.
- Retaining migration consent, Node resolution, packaged runners, migration journals, completion reruns, or migration provenance carriers.
- Rewriting superseded designs, immutable issue comments, memory, changelog history, or `.specs-v1` merely to remove historical strings.
- Changing the canonical Documents codec, lifecycle tools, ordinary transaction recovery, CVS/Issues behavior, or host configuration.

## Architecture

Canonical active Markdown remains directly under `.harnessctl/documents`; archived records and ordinary private transaction state remain beneath that fixed root. SQLite remains disposable and can be rebuilt only from a completely validated Documents, Issues, and Memory graph.

The product exposes exactly nine normalized lifecycle operations: `document_id`, `document_create`, `document_list`, `document_get`, `document_update`, `document_version`, `document_validate`, `document_archive`, and `document_restore`. OpenCode and Pi remain thin adapters over the same generic implementation.

Migration-only code and packaging are absent. Installer APIs and help expose no migration option. Generic-tools exports and package bins expose no migration entry point. Python wheel/sdist and npm tarballs contain no migration bridge, runner, resources, transaction engine, or provenance carrier. Current documentation states that no `.specs` or `.ai.tmp` migration/compatibility is shipped; `.specs-v1` is inert repository history.

Ordinary Documents transaction recovery remains. It protects lifecycle mutations and must not be removed with the migration-only streaming publisher.

## Preservation Boundary

Before removal work, Build must prove:

- the migration completion record contains exactly 19 mappings into 14 valid lineages;
- each mapping target exists at its canonical path and matches the recorded target SHA-256;
- every mapped target retains complete `metadata.legacy_spec` evidence matching source path and source digest;
- the two v4 successors exist separately, yielding 21 direct active files at Plan completion;
- canonical structured issue links resolve and normalized issue validation passes;
- `.specs` contains no remaining source files, `.specs-v1` remains unchanged, and no in-flight migration transaction exists.

Before deleting the completion record, Build must bind its exact 19 source paths, target paths, source digests, target digests, and lineage identities into an immutable checked-in preservation fixture or constants. Tests must validate that persistent evidence against canonical metadata and files both before and after completion-state deletion. Canonical metadata, the persistent fixture, tests, and Git history then preserve the inventory without a shipped migration subsystem. The ordinary `.harnessctl/documents/.control` root remains.

## Verification Strategy

Verification covers Documents lifecycle behavior, complete proposed-state limits, exact-revision safety, archive/restore, issue-reference preflights, ordinary journal recovery, cache cold/corrupt rebuild, adapter parity, hostile `HOME`, provider isolation, package parity, and stale active surfaces.

The checked-in preservation fixture remains after completion-state deletion and proves all 19 converted target paths/digests and matching legacy metadata. Package and source audits prove absence of migration APIs, options, exports, bins, scripts, resources, generated outputs, current guidance, and active-design requirements. Historical immutable evidence is excluded from executable stale-string gates.

## Delivery

1. Freeze converted-authority, completion-mapping, and dirty-worktree evidence.
2. Approve this HLD and its LLD successor.
3. Reconcile `hrn-00135`, `hrn-00139`, `hrn-00140`, `hrn-00142`, and `hrn-00145` without creating new issues.
4. Remove migration runtime and migration-only streaming code.
5. Remove build, package, resource, CLI, installer, and provenance surfaces.
6. Revalidate mapping targets, create and validate the persistent preservation fixture, then remove obsolete completion state and empty `.specs`.
7. Revise tests, current docs, and Changeset; rebuild all artifacts.
8. Run complete quality, build, package, artifact, Documents, and Issues validation.

## Risks

- Accidental loss of converted documents: gate cleanup on completion mappings, target digests, persistent preservation evidence, canonical metadata, lineage validation, and issue validation.
- Accidental removal of ordinary Documents recovery: delete only migration-specific streaming code and retain lifecycle journal tests.
- Stale generated/package output: rebuild and inspect npm tarballs, wheel, sdist, and sdist-built wheel.
- Dirty-worktree collision: inventory ownership, avoid reset/clean operations, and review final diff for unrelated loss.
