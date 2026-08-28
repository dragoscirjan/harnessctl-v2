---
id: "doc-00013"
title: "Repository-local SDLC design document management"
kind: hld
status: approved
version: 3
created_at: "2026-08-27T20:11:30.311Z"
updated_at: "2026-08-27T20:11:30.311Z"
created_by: "OpenCode"
metadata: {"legacy_spec":{"source_path":".specs/hld-00011-repository-local-sdlc-design-document-management-v3.md","source_sha256":"1da675042004ab8f0921da72e203e71d909e093781b06d89611a1d19013d5aac","decoder_version":1,"original_status":"approved","field_conversions":{"type":"kind","id":"migration_mapping","status":"approved","author":"created_by","timestamps":"canonical_utc_or_intent_timestamp"},"frontmatter":{"id":"00011","type":"hld","title":"Repository-local SDLC design document management","version":3,"status":"approved","opencode-agent":"OpenCode"},"rewrites":[]}}
---

# Repository-local SDLC design document management

## Status And Supersession

This version supersedes HLD 00011 v2 for migration distribution, invocation,
and cleanup ordering. All unaffected v2 decisions remain authoritative:
`.harnessctl/documents` is the only live Documents authority; the four design
kinds, nine normalized operations, proposed-state validation, transactional
`.specs` conversion, thin OpenCode/Pi adapters, and CVS/Issues provider
protections are unchanged.

## Context

The TypeScript migration service and its dedicated CLI exist, but an installed
Python `harnessctl` release cannot locate or authenticate that npm executable
offline. OpenCode resolves its plugin after installation, while Pi package
installation occurs inside the installer transaction. PATH lookup, `npx`, npm
resolution, host caches, and checkout-relative execution therefore cannot be a
safe prerequisite.

The current implementation also retires `.specs` issue-link recognition before
the repository migration has run. Before this HLD and its LLD were created, the
repository contained 17 direct legacy records. It now contains 19 records in the
same 14 HLD/LLD lineages plus structured issue links, so issue and memory cache
projection currently fails. Runtime discovery and the persisted source
fingerprint, never that fixture count, remain authoritative.

## Goals

- Ship the TypeScript migration implementation with every Python wheel and
  source distribution as one immutable, self-contained runner.
- Let Python verify and invoke that runner offline without implementing any
  migration behavior itself.
- Require explicit migration consent when `.specs` sources exist.
- Recover or verify every existing migration state before installer work.
- Complete migration and cache repair before retiring any legacy surface.
- Preserve the v2 transaction, data-preservation, provider, privacy, and
  platform contracts.

## Non-Goals

- Reimplementing the migration codec or transaction engine in Python.
- Resolving a migration CLI from PATH, npm, `npx`, network services, adapter
  packages, host caches, user configuration, or repository checkout files.
- Bundling Node itself, automatically granting migration consent, or treating
  `--force` or Pi package consent as migration consent.
- Changing the canonical Documents lifecycle, adding a tenth host tool, adding
  an agent, or creating another Bug for the same `hrn-00140` occurrence.

## Distribution Architecture

The Python distribution owns a private migration resource consisting of a
self-contained `.mjs` runner and a canonical JSON manifest. A deterministic
build target bundles the dedicated generic-tools migration CLI with one exact,
directly declared esbuild version. All non-Node dependencies are embedded. The
runner may import only `node:crypto`, `node:fs`, `node:path`, `node:module`, and
`node:sqlite` and has no source map, checkout-dependent path, npm runtime
dependency, or network behavior. `node:module` may load only the literal
`node:sqlite`; generation rejects every other external or dynamic target,
including network, subprocess, worker, VM, and addon-loading capabilities.

The generated runner, manifest, canonical dependency inventory, and third-party
notice are checked in as Python package resources and shipped byte-identically
in wheel and source distribution. CI regenerates them from a clean locked
install and rejects any byte drift. Unknown, missing, denied, or uncovered
dependency licenses block generation and release.

The manifest binds at least:

- manifest schema and runner format versions;
- migration identity `specs-to-documents-v1`;
- source package name and exact version;
- entry identity and compatible Node range;
- exact esbuild version and lock integrity;
- canonical bundle-input, dependency-inventory, and notice digests;
- canonical npm provenance-carrier digest;
- runner byte length and SHA-256.

Python fixes the expected manifest identity and version independently of the
resource. Before invocation it validates the manifest, expected identities,
runner size, and digest. This detects package-resource drift; trusted wheel and
source-distribution provenance remains the authenticity boundary.

## Runtime Boundary

The only external prerequisite is a compatible system Node runtime. Python may
resolve the Node launcher, but it resolves it once, checks the reported version,
and invokes that absolute executable with only the verified packaged runner and
resolved repository root. It never invokes a shell or searches for a migration
CLI.

The public Python API adds `migrate_specs=False`; the installer CLI adds
`--migrate-specs`. Consent is explicit and non-interactive. Before configuration
loading, rendering, host inspection, package planning, stale-tree planning,
before-image capture, or mutation, the installer classifies bounded local
migration state:

- No `.specs`, transaction, or completion state: skip without requiring Node.
- `.specs` without consent: fail with an actionable instruction.
- `.specs` with consent: verify the resource and Node, then migrate.
- In-flight transaction: invoke verified journal recovery before evaluating
  surviving sources; transaction-owned recovery never requires fresh consent.
- Completion state: invoke verification and cache repair before continuing.
- Reappeared `.specs` after completion: require consent, then fail closed if
  completion verification identifies stale or divergent authority.

If pre-completion recovery restores `.specs`, the recovered transaction is
finished first. The invocation then treats the restored inventory as a fresh
migration request: without `--migrate-specs` it rejects, and with consent it may
prepare a new transaction. A completion-bearing recovery verifies committed
authority and never restores `.specs`.

Missing consent, unsafe state, missing or incompatible Node, invalid resources,
runner failure, timeout, malformed report, or ambiguous exit blocks all
installer work. Migration-owned journal recovery is the only recovery mechanism
for a process failure after migration authority changes; installer rollback
never attempts to reverse a committed migration.

## Ordering And Authority Recovery

The migration bridge is a prerequisite boundary, not part of stale cleanup.
Verified migration completion and cache repair must precede retired skill
selection, provider or link cleanup, rendering, host reads, Pi package actions,
and host writes for `opencode`, `pi`, and `all`.

Build creates and approves HLD/LLD v3 before migration. It then builds and tests
the packaged runner and bridge without issue mutation, executes the migration
with explicit consent, reruns completion verification, and validates Documents,
Issues, and cache. Only after normalized issue authority works may Build update
Epic/Bug links and comments or finish stale-surface cleanup.

## Security And Privacy

- Use fixed bridge limits: 16 MiB runner, 16 KiB manifest, 256 bytes Node
  version stdout, 4 KiB Node version stderr, 5-second version probe, 16 MiB JSON
  report, 16 MiB plus one LF migration stdout, 64 KiB migration stderr,
  60-minute migration runtime, 5-second terminate grace, 2,000 mapping entries,
  4 KiB UTF-8 per mapped path, and 4 KiB surfaced error text.
- Drain child pipes incrementally. Any overflow, truncation, timeout, or invalid
  UTF-8 makes success impossible; terminate, kill if necessary, and reap on
  POSIX and Windows. A timeout may leave only migration-owned recoverable state.
- Reject missing, unreadable, non-regular, replaced, or digest-mismatched
  resources before installer planning.
- Accept exactly one schema-validated JSON report with the expected migration
  identity, outcome, counts, and bounded mapping.
- Terminate and reap timed-out children. Treat signals and ambiguous exits as
  failure and rely on the next journal recovery invocation.
- Materialize one already verified in-memory runner payload into an exclusively
  created file in a private process-owned temporary directory. Require
  no-follow regular-file checks, restrictive process-owner access, flush and
  close, identity/digest rechecks, and deterministic post-reap cleanup. Reject
  observable replacement or metadata change. The portable threat model covers
  package tampering and races through the final pre-spawn identity check; it
  does not claim protection from a same-identity privileged actor after that
  check.
- Resolve one canonical absolute regular Node executable, not a shell alias,
  script, or package-manager shim. Accept only stable `vMAJOR.MINOR.PATCH`
  output satisfying `>=22.13.0 <23.0.0` or `>=24.0.0`; reject prereleases,
  build metadata, extra output, and changed executable identity.
- Invoke Node with an empty environment on POSIX and only validated
  `SystemRoot`/`WINDIR` on Windows. Never inherit `HOME`, `PATH`, `NODE_OPTIONS`,
  `NODE_PATH`, preload/package-manager variables, credentials, network state,
  host package storage, or checkout configuration.
- Treat the private temporary runner tree as transient bridge state explicitly
  exempt from the pre-installer repository/host mutation prohibition. It is
  never an installer output, before-image, or rollback participant. Clean only
  the current invocation's owned tree after reap; never scan or delete unrelated
  or stale temporary trees during startup.
- Keep `.specs-v1`, immutable issue text/history, and operator-modified stale
  skill trees outside migration and cleanup.

## Verification Strategy

Release evidence must prove deterministic regeneration, static absence of
unresolved package imports, runtime operation without npm or checkout access,
manifest and runner tamper rejection, dependency license coverage, and
byte-identical source-tree, source-distribution, direct-wheel, and
sdist-rebuilt-wheel resources. Building either Python artifact and installing
the sdist-built wheel performs no JavaScript regeneration and requires no Node,
npm, workspace, registry, or network access.

Changesets applies the generic-tools version before bundle generation. One clean
release tree then generates the runner, manifest, inventory, and notice; updates
the independently fixed Python expectations; emits canonical
`dist/specs-migration-provenance.json`; builds the npm tarball, wheel, and sdist;
and rebuilds a wheel from that isolated sdist. The carrier binds package
name/version, bundle-input digest, and the canonical digest of the packed
migration CLI JavaScript closure. `npm pack` extraction must reproduce that
closure digest and match the Python manifest's carrier digest. Release gates
require the same generic-tools version and bundle-input digest across the
manifest, carrier, package, npm tarball, Python expectations, and all Python
artifacts. Esbuild `0.28.1` and its lockfile integrity are reviewed provenance
inputs, not a transitive implementation accident.

Isolated wheel and source-distribution tests cover fresh skip without Node,
missing consent, all migration states, compatible and incompatible Node,
bounded child-process failures, 19-source-to-14-lineage conversion, completion
rerun, cache repair, and identical behavior for `opencode`, `pi`, and `all`.
Instrumentation proves no installer planning or mutation begins before migration
verification. All v2 lifecycle, fault-injection, platform, hostile-`HOME`,
CVS/Issues Gitea/Forgejo, stale-skill, and release regressions remain required.

## Delivery Slices

1. Pin and generate the self-contained runner, manifest, drift checks, and
   canonical dependency/license evidence while retaining every legacy surface.
2. Add Python state classification, consent, resource verification, Node
   invocation, report validation, and isolated artifact tests.
3. Execute and verify the repository migration, then repair and validate cache.
4. Restore normalized issue operations and link the migrated v3 records.
5. Only then complete stale-surface cleanup and full Build gates.

## Risks

- A checked-in generated bundle can drift; deterministic regeneration is a
  release blocker.
- Manifest and bundle co-modification is not authenticity; release provenance
  and Python-fixed identity remain required.
- Node remains an external prerequisite for legacy upgrades, so failures must be
  early and actionable.
- Bundling increases Python artifacts and carries third-party notice duties.
- Timeout may occur after migration writes; journal convergence must be proven.
- Any cleanup or issue mutation before completion can strand authority; ordering
  tests and delivery gates are mandatory.
