---
id: "doc-00014"
title: "Repository-local SDLC design document management"
kind: lld
status: approved
version: 3
created_at: "2026-08-27T20:11:30.311Z"
updated_at: "2026-08-27T20:11:30.311Z"
created_by: "OpenCode"
metadata: {"legacy_spec":{"source_path":".specs/lld-00011-repository-local-sdlc-design-document-management-v3.md","source_sha256":"69d2dbac873562c4b08b194e86afda36c0ae4f7941c7baf2756fe52de39f284d","decoder_version":1,"original_status":"approved","field_conversions":{"type":"kind","id":"migration_mapping","status":"approved","author":"created_by","timestamps":"canonical_utc_or_intent_timestamp"},"frontmatter":{"id":"00011","type":"lld","title":"Repository-local SDLC design document management","version":3,"status":"approved","parent":"00011","opencode-agent":"OpenCode"},"rewrites":[]}}
---

# Repository-local SDLC design document management

## Purpose And Inherited Contract

This LLD supersedes LLD 00011 v2 only for migration packaging, the Python
bridge, and migration-before-cleanup ordering. It retains the v2 canonical
Documents codec and lifecycle, complete proposed-state validation, streaming
transaction protocol, bounds, durability phases, issue relinking, cache
semantics, adapter contracts, provider protections, and cleanup ownership rules.

## Build Artifacts

Add one exact direct esbuild development dependency and lock its integrity. A
deterministic script builds the dedicated generic-tools migration CLI into:

```text
src/harnessctl/resources/specs-migration/
  specs-to-documents-v1.mjs
  manifest.json
  dependencies.json
  THIRD_PARTY_NOTICES.txt
```

The bundle target is ESM for the minimum supported Node runtime. It bundles
`yaml`, `zod`, and every other non-Node dependency. Node built-ins remain
external only for this exact allowlist: `node:crypto`, `node:fs`, `node:path`,
`node:module`, and `node:sqlite`. The generated closure may use `node:module`
only to load the literal `node:sqlite`; it must not retain the Bun branch or any
other computed or dynamic target. Static metafile and emitted-code inspection
fail on every other external import, `require`, or dynamic import, explicitly
including `node:http`, `node:https`, `node:http2`, `node:net`, `node:dgram`,
`node:dns`, `node:tls`, `node:child_process`, `node:cluster`,
`node:worker_threads`, `node:vm`, and native-addon loading. Allowlist and
denylist drift tests are release gates. The build emits no source map, absolute
path, timestamp, random value, or checkout-specific identifier. A clean locked
regeneration to a temporary directory must compare byte-for-byte with the
checked-in resources.

The root package declares esbuild `0.28.1` directly and exactly; the lockfile
integrity for that package is reviewed and pinned. The bundle script rejects
unresolved bare package imports and emits canonical `dependencies.json` plus
`THIRD_PARTY_NOTICES.txt` for esbuild and every bundled module. Each inventory
entry contains package name, exact version, license expression, source URL,
whether its code is bundled, and the SHA-256 of included license/notice text.
Allowed licenses are MIT, ISC, BSD-2-Clause, BSD-3-Clause, and Apache-2.0;
denied, unknown, missing, ambiguous, or text-uncovered licenses fail generation.
Required notices ship in every Python release artifact. Package and release
checks treat resource, inventory, or notice drift as failure.

## Manifest Contract

`manifest.json` is canonical bounded UTF-8 JSON with sorted keys and exactly:

```json
{
  "schema_version": 1,
  "migration_id": "specs-to-documents-v1",
  "source_package": "@harnessctl/generic-tools",
  "source_version": "<exact package version>",
  "entry": "specs-migration-cli",
  "runner_format": 1,
  "node_range": "^22.13.0 || >=24.0.0",
  "esbuild_version": "0.28.1",
  "esbuild_integrity": "<lockfile integrity>",
  "bundle_inputs_sha256": "<64 lowercase hex characters>",
  "dependencies_sha256": "<64 lowercase hex characters>",
  "notices_sha256": "<64 lowercase hex characters>",
  "npm_provenance_sha256": "<64 lowercase hex characters>",
  "bytes": 0,
  "sha256": "<64 lowercase hex characters>"
}
```

The real byte count is positive. Unknown, missing, duplicate, noncanonical, or
oversized members fail. Python code fixes the expected schema version, migration
ID, package identity/version, entry, runner format, Node range, esbuild
provenance, and all resource digests; accepting co-modified resources is
prohibited. The bundle-input digest covers the canonical sorted relative paths
and bytes of the TypeScript entry closure, relevant package manifests, and
lockfile. Version updates regenerate and review the Python expectation,
manifest, runner, inventory, and notice together.

Before invocation, Python reads all resources through `importlib.resources`,
rejects non-files, validates bounded bytes and canonical JSON, checks every
fixed identity, byte count, and digest, and retains the verified runner payload
in memory. `BRIDGE_RUNNER_MAX_BYTES` is 16 MiB and
`BRIDGE_MANIFEST_MAX_BYTES` is 16 KiB.

Python creates a private process-owned temporary directory using the platform
temporary-file API. On POSIX it requires mode `0700`; on Windows it requires a
directory created for the current security principal and rejects an observable
reparse point or ownership/type change. Within it, Python creates the runner
exclusively with no-follow semantics where supported, writes only the already
verified in-memory payload, flushes and closes it, applies owner-only access,
then reopens no-follow and verifies file identity, size, mode/type, and digest.
It repeats identity/type/size/digest checks at the final pre-spawn hook and
removes the private tree after the child is reaped. Any observable replacement
or metadata change fails closed. Portable guarantees cover package tampering and
materialization races through that hook; same-identity privileged replacement
after the final check is outside the supported attacker model.

The private runner directory is transient bridge state and the sole explicit
exception to the no-pre-installer-mutation rule. It is never a repository or
host output, installer before-image, package action, or rollback participant.
Cleanup targets only the current process's retained directory path after reap.
Startup performs no broad temporary-directory scan and never removes an
unrelated or stale tree; process-crash leftovers remain an operating-system or
operator cleanup concern.

## Npm Provenance Carrier

The generic-tools build emits canonical bounded
`dist/specs-migration-provenance.json`, included by the existing `dist` package
file rule, with exactly:

```json
{
  "schema_version": 1,
  "package": "@harnessctl/generic-tools",
  "version": "<exact package version>",
  "bundle_inputs_sha256": "<64 lowercase hex characters>",
  "cli_closure_sha256": "<64 lowercase hex characters>"
}
```

`cli_closure_sha256` hashes canonical sorted `(tar-relative path, byte length,
SHA-256)` records for every packed JavaScript file statically reachable from
`dist/specs-migration-cli.js`; the carrier itself is excluded. The Python
manifest records the carrier's canonical-byte digest. After `npm pack`, release
tests extract the tarball, require exact package name/version, recompute the
reachable closure from packed import specifiers, verify every file remains
inside `package/dist`, reject missing, extra, or portable-colliding closure
members, and match both carrier digests to the Python manifest. Production from
the same working tree without these checks is not digest binding.

## Public Installer Contract

The Python API becomes:

```python
install(..., migrate_specs: bool = False) -> list[Path]
```

The CLI adds `--migrate-specs`. The default remains false. `--force`, SDLC
replacement flags, Pi package flags, interactive package approval, and harness
`all` never imply migration consent.

The bridge runs before `load_config`, retired-skill planning, intent rendering,
binary probing, host inspection, package inspection, before-image capture, or
any repository or host output mutation outside migration-owned control state.
The verified private runner tree described above is transient bridge state and
the only permitted external filesystem mutation before completion.

## State Classification

Resolve the repository root once. Inspect only these no-follow bounded paths:

```text
.specs/
.harnessctl/documents/.control/specs-to-documents-v1/transaction.json
.harnessctl/documents/.control/specs-to-documents-v1/completion.json
```

Reject symlink, non-directory `.specs`, unsafe control ancestors, non-regular
control files, and ambiguous path state without starting Node.

| Sources | Transaction | Completion | Consent | Action                                                                           |
| ------- | ----------- | ---------- | ------- | -------------------------------------------------------------------------------- |
| absent  | absent      | absent     | either  | Skip; Node not required.                                                         |
| present | absent      | absent     | false   | Reject with `--migrate-specs` instruction.                                       |
| present | absent      | absent     | true    | Verify runner/Node and migrate.                                                  |
| either  | present     | either     | either  | Verify runner/Node and recover first; no fresh consent is required for recovery. |
| absent  | absent      | present    | either  | Verify runner/Node, completion, targets, links, and cache repair.                |
| present | absent      | present    | false   | Reject for consent before stale-state verification.                              |
| present | absent      | present    | true    | Invoke and let completion verification fail closed on reappeared sources.        |

Any state not represented above fails closed before installer planning.

After transaction recovery, classify the converged state again. If rollback
restored sources and no completion exists, those sources are now a fresh
inventory: reject without consent or begin a new migration with consent. If a
completion marker governs the recovered transaction, verify committed targets,
links, and cache and never restore `.specs`. Tests cover every journal phase,
with and without surviving sources and without fresh consent, proving recovery
always precedes fresh inventory handling.

## Node Resolution And Invocation

Resolve `node` once using `shutil.which("node")` against the installer's initial
process PATH, then canonicalize it with strict real-path resolution. This is
launcher discovery only, never migration-CLI discovery. POSIX requires a
regular executable file. Windows accepts only a regular `.exe` or `.com` file;
`.cmd`, `.bat`, PowerShell, shell aliases/functions, and package-manager shims
are rejected. Symlinks are allowed only when strict resolution ends at a regular
executable; record final path identity and reject a type or identity change
before either child invocation.

Invoke the absolute executable with `--version`. Accept exactly one ASCII line
matching `v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)` plus one optional
terminal LF. Reject CR, leading zeros, prerelease/build suffixes, extra output,
and versions outside `>=22.13.0 <23.0.0` or `>=24.0.0`. Range evaluation is an
internal integer-tuple comparison, not npm or shell evaluation. Missing and
unsupported diagnostics include only the canonical executable path and bounded
reported stable version.

Invoke exactly:

```text
<absolute-node> <verified-packaged-runner> <absolute-repository-root>
```

Do not set a shell, inspect npm, or prepend package paths. POSIX children receive
an empty environment. Windows children receive only bounded, absolute,
NUL-free `SystemRoot` and `WINDIR` copied from the parent when required to start
the resolved executable; all other variables are absent. In particular, never
inherit `HOME`, `USERPROFILE`, `PATH`, `NODE_OPTIONS`, `NODE_PATH`, preload/test
hooks, `NPM_CONFIG_*`, npm/yarn/pnpm variables, credentials, proxy variables, or
temporary package paths. The runner performs no network or host discovery.

Named bridge limits are:

- `NODE_VERSION_STDOUT_MAX_BYTES = 256`;
- `NODE_VERSION_STDERR_MAX_BYTES = 4 * 1024`;
- `NODE_VERSION_TIMEOUT_SECONDS = 5`;
- `MIGRATION_REPORT_MAX_BYTES = 16 * 1024 * 1024`;
- `MIGRATION_STDOUT_MAX_BYTES = MIGRATION_REPORT_MAX_BYTES + 1` for one LF;
- `MIGRATION_STDERR_MAX_BYTES = 64 * 1024`;
- `MIGRATION_TIMEOUT_SECONDS = 60 * 60`;
- `PROCESS_TERMINATE_GRACE_SECONDS = 5`;
- `SURFACED_ERROR_MAX_BYTES = 4 * 1024`.

Drain stdout and stderr incrementally and concurrently into bounded buffers;
never use unbounded `capture_output`. On timeout or either-pipe overflow, stop
accepting success, send terminate, wait the grace period, send kill if still
running, and reap. On POSIX this means `SIGTERM`, bounded wait, `SIGKILL`, wait;
on Windows it means `TerminateProcess` through the subprocess API, bounded wait,
then forceful kill and wait. Truncation, overflow, nonzero exit, signal, timeout,
invalid UTF-8, multiple JSON values, trailing non-whitespace, or success without
one valid report is failure. Surface only sanitized phase context and at most
`SURFACED_ERROR_MAX_BYTES`; never reinterpret truncated output as a report. A
timeout may leave only the migration-owned v2 journal for the next recovery.

## Report Contract

Accept exactly one JSON object containing the expected migration identity and
one outcome from `migrated`, `already-complete`, or `recovered`. Counts are
bounded nonnegative integers. The old-path/new-path mapping is bounded by source
limits, contains canonical repository-relative paths, has no duplicate or
portable-colliding keys or values, and agrees with completion verification.

`MIGRATION_MAPPING_MAX_ENTRIES = 2_000` and every key or value is at most 4 KiB
of UTF-8. The complete canonical JSON report is at most
`MIGRATION_REPORT_MAX_BYTES`. Limit and limit-plus-one behavior is mandatory for
every scalar, mapping, report, pipe, runtime, and surfaced-error bound.

The bridge treats process success as provisional. Before installer work, the
migration service must have validated canonical Documents and Issues and either
synchronized or rebuilt the disposable cache. A post-commit cache error blocks
installation while retaining committed authority; a completion rerun must
repair it.

## Installer Ordering

The exact sequence for `opencode`, `pi`, and `all` is:

1. Resolve root and classify migration state.
2. If transaction state exists, verify resources/Node and recover it without
   requiring fresh consent; then classify the converged state again.
3. Enforce consent for a new source inventory or reappeared post-completion
   sources.
4. Verify packaged manifest and runner when migration/completion work remains.
5. Resolve and verify compatible Node.
6. Invoke migration execution or completion verification.
7. Validate the bounded report and successful canonical/cache outcome.
8. Only now load configuration and begin ordinary installer planning.
9. Plan exact managed stale-skill cleanup, provider/link/schema cleanup,
   rendering, packages, and host writes.
10. Apply the existing installer transaction.

No installer before-image includes migration authority. Installer rollback does
not restore `.specs` after the migration completion marker. Failure in steps
1-7 leaves every installer output unchanged, although migration-owned journal
state may require the next invocation to recover.

## Repository Cutover

The two v3 records raise the current complete fixture to 19 direct `.specs`
files across 14 lineages. HLD 00011 and LLD 00011 each contain contiguous
versions 1 through 3. Runtime inventory remains bounded discovery, not a
hard-coded count.

Build order for this repository is strict:

1. Generate and test the packaged resources while legacy runtime surfaces stay
   available.
2. Implement and test the Python bridge without issue mutation or stale cleanup.
3. Build isolated wheel and source distribution and exercise the bridge offline.
4. Invoke installation with explicit migration consent.
5. Rerun the completion path; verify 19 mappings, 14 lineages, structured links,
   source removal, completion evidence, Documents, Issues, and cache.
6. Only after issue authority succeeds, update `hrn-00135` and `hrn-00140` and
   link canonical v3 paths through normalized tools.
7. Complete legacy recognizer, stale skill, provider, schema, guidance, and
   package cleanup.

Until step 5 succeeds, direct edits to canonical issue files and attempts to use
broken issue/cache mutation tools are prohibited.

## Failure And Recovery

The v2 migration journal remains the sole authority for process interruption.
A timeout or process kill can occur after an authority mutation but before a
cursor update. The bridge must not claim that installer outputs being unchanged
means migration authority is unchanged. The next invocation detects transaction
state and runs journal recovery before any new inventory or installer work.

Completion is still the commit point. Before completion, recovery restores
exact source, issue, target, and control bytes. At or after completion, recovery
never restores `.specs`; it verifies canonical targets and links, finishes owned
cleanup, and repairs cache.

## Test Matrix

### Deterministic resource

- Exact pinned esbuild dependency and lockfile integrity.
- Clean locked regeneration is byte-identical.
- Bundle has no source map, absolute checkout paths, unresolved package import,
  npm lookup, network path, or nonallowlisted external or dynamic module. Static
  tests enforce the exact five-built-in allowlist, literal-only `node:sqlite`
  loading, and the explicit network/process/worker/VM/addon denylist.
- Missing resource, unreadable/non-regular resource, replacement race, byte
  count, digest, schema, identity, version, entry, format, and Node-range
  mismatches all fail before installer planning.
- Canonical dependency inventory and notice text cover esbuild and every bundled
  dependency; unknown, denied, missing, ambiguous, and uncovered licenses fail.
- Reviewed provenance fixes esbuild `0.28.1` and its exact lockfile integrity.
- Changesets versions generic-tools before generation. Manifest, Python fixed
  expectations, npm tarball, source tree, direct wheel, sdist, and wheel rebuilt
  from sdist agree on package version, bundle-input digest, resource bytes, and
  dependency/notice digests.
- `npm pack` contains `dist/specs-migration-provenance.json`; extraction
  recomputes the canonical reachable CLI-closure digest and ties package
  name/version, carrier bytes, closure bytes, and bundle-input digest to the
  Python manifest.

### Isolated release artifacts

- Source tree, source distribution, direct wheel, and wheel rebuilt from the
  isolated source distribution contain identical runner, manifest, inventory,
  and notice bytes.
- Installed wheel runs migration with checkout, npm workspace, node_modules,
  network, host caches, and user-global configuration unavailable.
- Python sdist creation, direct wheel creation, wheel creation from the isolated
  sdist, and installation perform no JavaScript regeneration and require no
  Node, npm, workspace, registry, or network. Runtime migration separately
  requires only the verified compatible system Node.
- Package-resource materialization and immediate digest recheck are exercised.

### Consent and state

- Fresh state skips without Node for each harness selection.
- Sources without consent reject before config, rendering, host reads, cleanup
  planning, package actions, or mutation.
- Sources with consent migrate identically for `opencode`, `pi`, and `all`.
- Every transaction phase, with and without surviving sources and without fresh
  consent, invokes recovery before fresh inventory; restored fresh sources then
  enforce current consent. Completion states always invoke verification.
- `--force`, Pi consent, and interactive input never imply migration consent.
- Missing and incompatible Node fail early; supported Node succeeds.
- Resolver tests cover POSIX executables, Windows `.exe`/`.com`, rejected
  scripts/shims, strict symlink resolution, identity changes, exact version
  grammar, prerelease/build rejection, range boundaries, and probe limits.
- PATH migration-CLI, npm/npx, network, adapter-cache, checkout, and hostile
  `HOME`, npm variables, `NODE_OPTIONS`, preload, and `NODE_PATH` traps remain
  untouched under the exact child-environment allowlist.

### Child process and report

- Every named process/report/error limit passes at the limit and fails at
  limit-plus-one. Nonzero exit, signal, timeout, process loss,
  malformed/multiple/oversized JSON, invalid UTF-8, trailing data, pipe overflow,
  invalid identity/outcome/count, and mapping collision fail before installer
  work. Overflow tests prove incremental draining, terminate/kill/reap, bounded
  diagnostics, and impossibility of success after truncation.
- Timeout and kill tests prove the next invocation converges through journal
  recovery.
- Package tamper, private-directory/file type, permissions, identity, digest,
  final pre-spawn replacement, and deterministic post-reap cleanup tests cover
  the stated materialization threat model without claiming impossible portable
  same-privilege post-check protection.

### Migration and ordering

- The complete fixture migrates 19 sources into 14 lineages and preserves every
  HLD/LLD 00011 version.
- Completion rerun verifies targets and structured links and repairs missing,
  stale, malformed, or corrupt cache state.
- Divergent source, completion, target, mapping, link, or migration identity
  fails closed.
- Instrumented calls prove migration verification precedes retired-skill
  planning, provider/link/schema cleanup, rendering, Pi actions, before-image
  capture, and host writes.
- Exact managed stale trees are removed only after completion; modified trees
  remain byte-preserved.
- Every v2 transaction/platform/bounds test and CVS/Issues Gitea/Forgejo,
  `.specs-v1`, immutable-history, hostile-`HOME`, package, quality, and build
  regression remains green.

## Delivery And Rollback

Deliver the resource generator and drift checks before the bridge, and the
bridge before any cleanup. Keep reviewable gates between packaged runtime,
installer prerequisite, repository cutover, and stale cleanup. Cleanup must not
be releasable independently of the prerequisite.

Before migration completion, rollback uses the v2 journal. After completion,
rollback means shipping a forward repair; restoring `.specs` or reverting issue
links is prohibited. A Python release can stop invoking the bridge only after
the supported upgrade window and completion policy are separately revised.

## Issue Disposition

Reuse open Bug `hrn-00140`; do not create another bridge Bug. `hrn-00139`
remains downstream of migration and cleanup. Because normalized issue authority
is currently unavailable, defer all issue comments, body changes, relations,
and v3 links until Build completes migration and cache repair.
