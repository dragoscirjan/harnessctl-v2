---
id: "00003"
type: lld
title: "GitHub CI and independent npm package releases"
version: 1
status: review
opencode-agent: lead-engineer
---

# GitHub CI and independent npm package releases

## 1. Goal

Add GitHub Actions CI and npm CD for this npm-workspace monorepo. Adapt useful
patterns from `templ-project/typescript`, while using Changesets instead of its
single-package conventional-commit version bump.

Publish these public packages independently:

- `@harnessctl/generic-tools`
- `@harnessctl/opencode-tools`
- `@harnessctl/pi-tools`

## 2. Decisions

- Registry: public npm registry.
- Authentication: repository secret `NPM_TOKEN` containing a granular npm
  access token authorized for the `@harnessctl` organization and all three
  packages.
- Versioning: independent Changesets versions. No `fixed` or `linked` package
  group.
- Release flow: each feature PR carries a changeset when publishable package
  behavior changes. Pushes to `main` create or update one Changesets version
  PR. Merging that PR publishes changed packages.
- Package dependency changes count as package changes. If a generic-tools bump
  requires an adapter dependency range update, that adapter receives its own
  release; otherwise unchanged packages are not published.
- CI supports pull requests, `main` pushes, and manual dispatch.
- Releases run only from `main`, under a serialized GitHub environment named
  `npm`.
- No automatic retry workflow. Deterministic failures remain visible.
- No model-backed integration tests in mandatory CI because they require
  external credentials and incur cost. Unit and package smoke tests remain
  mandatory.

## 3. Prerequisites

Before first release:

1. Merge the package build and memory adapter stack into `main`.
2. Confirm npm organization `@harnessctl` exists and publisher account belongs
   to it.
3. Create granular npm token with read/write access limited to the three
   packages; store only as GitHub environment secret `NPM_TOKEN`.
4. Configure GitHub environment `npm`; optional required reviewer provides a
   human release gate.
5. Protect `main` and require the CI workflow.

The workflow never writes the token to repository files or logs. It uses
`NODE_AUTH_TOKEN` through `actions/setup-node` registry configuration.

## 4. Files

### New

- `.github/actions/setup/action.yml` — composite setup for mise, Node/npm cache,
  `npm ci`, and `uv sync --locked`.
- `.github/workflows/ci.yml` — orchestration and platform matrix.
- `.github/workflows/ci.quality.yml` — reusable quality workflow.
- `.github/workflows/release.yml` — Changesets version PR or npm publication.
- `.changeset/config.json` — independent public package release policy.
- `.changeset/README.md` — contributor instructions.
- `.changeset/pre.json` is not committed; prereleases remain future work.
- `.github/release.yml` — generated GitHub release-note categories only if
  Changesets GitHub releases need repository-specific formatting.
- `scripts/check-packages.mjs` — deterministic package metadata/tarball checks.

### Modified

- Root `package.json` and lockfile — Changesets dependencies and scripts.
- Three package manifests — complete publish metadata and build/prepack scripts.
- Build configs where required for declaration/runtime output.
- `mise.toml` — pinned Node release and package verification tasks.
- `README.md` — install commands, release process, and required secret.

## 5. Package Contract

Each publishable package must provide:

- `license`, `repository`, `homepage`, and `bugs` metadata.
- Node engine compatible with `node:sqlite` used by generic-tools.
- `main`, `types`, and `exports` pointing only to packaged build output.
- `files` allowlist containing runtime output and required generated contracts.
- `publishConfig.access = "public"` and npm registry URL.
- `build` that starts from a clean output directory.
- `prepack` that regenerates contracts where applicable, builds, and validates
  package contents.
- No test files, source maps containing private paths, caches, coverage, or
  repository memory in tarballs.

Adapters keep generic-tools as a normal runtime dependency. Changesets updates
internal dependency ranges according to its configured policy. Initial release
uses current `0.1.0` versions unless npm already contains that version; package
existence checks fail before publishing rather than overwrite an immutable npm
version.

## 6. Changesets Configuration

`.changeset/config.json`:

- schema from `@changesets/config`.
- `access: "public"`.
- `baseBranch: "main"`.
- `fixed: []`, `linked: []`, `ignore: []`.
- `updateInternalDependencies: "patch"`.
- changelog generation enabled through the Changesets GitHub changelog package.
- private root package is never published.

Root scripts:

- `changeset` — create release intent.
- `version-packages` — apply changesets and update changelogs/lockfile.
- `release` — run package verification, then `changeset publish`.
- `packages:build` — build all publishable workspaces in dependency order.
- `packages:check` — pack each workspace with `--dry-run --json`, verify
  metadata/output, and reject unexpected files.

## 7. Continuous Integration

`ci.yml` defines a Linux/macOS/Windows matrix and calls `ci.quality.yml`.
Platform behavior:

- All platforms: dependency install, format, lint, unit tests, and strict
  TypeScript checking.
- Linux only: Python dead-code, duplication, package build/tarball checks, npm
  audit report, and uploaded coverage artifacts.
- Python and Node versions come from pinned project configuration.
- `npm ci` and `uv sync --locked` enforce lockfiles.
- Concurrency cancels stale runs for the same PR/branch.
- Permissions default to `contents: read`.

The reusable workflow retains the reference repository's separation of setup
and quality jobs, but uses this repository's mise tasks rather than unavailable
Taskfile targets. Action versions are pinned to immutable commit SHAs, with a
version comment for maintainability.

## 8. Continuous Delivery

`release.yml` triggers on pushes to `main` and manual dispatch. One serialized
job:

1. Checkout full history.
2. Set up pinned Node and npm registry.
3. Install with `npm ci`.
4. Run mandatory quality and package checks before mutation/publication.
5. Run `changesets/action`:
   - pending changesets -> create/update version PR;
   - version PR merged -> execute `npm run release`;
   - create package tags and GitHub releases.
6. Publish only versions absent from npm.

Permissions: `contents: write`, `pull-requests: write`; all others `none`.
`NPM_TOKEN` is available only to the release job/environment. Fork PRs and CI
never receive it.

Partial publication cannot be transactionally rolled back because npm versions
are immutable. Recovery reruns `changeset publish`; already published versions
are skipped and remaining packages publish. Package checks and dependency-order
publishing minimize this risk.

## 9. Validation

- Parse every workflow and Changesets JSON.
- Run Actions lint (`actionlint`) locally/through mise.
- Run complete quality and strict typecheck.
- Build all packages from a clean checkout.
- Inspect all three `npm pack --dry-run --json` manifests.
- Install each tarball into an isolated fixture and import its public entrypoint.
- Confirm adapter packages resolve the packed generic-tools dependency.
- Run `changeset status` with and without a sample changeset.
- Exercise release workflow with `workflow_dispatch` in validation-only mode;
  first real publish still requires the `npm` environment gate.

## 10. Acceptance Criteria

1. Every PR runs deterministic cross-platform CI with no publishing secret.
2. Package-changing PRs can declare independent semantic-version bumps.
3. Main pushes create/update one release PR when changesets exist.
4. Merging the release PR publishes only changed packages to npmjs.org.
5. All packages are public, importable, typed, and contain only intended files.
6. Generic-tools dependency updates propagate only when required by declared
   ranges and Changesets policy.
7. Failed validation prevents publication.
8. Release reruns safely continue after a partial publish.
9. No long-lived credential appears in repository content, artifacts, or logs.
10. README documents installation in OpenCode and Pi projects plus release
    operator setup.

## 11. Implementation Order

1. Make all package manifests/build outputs publishable and add tarball checks.
2. Add Changesets config/scripts and one initial changeset.
3. Add reusable setup and quality workflows.
4. Add release workflow and npm environment contract.
5. Add documentation and local action/workflow validation.
6. Run full verification, then review generated PR diff before push.
