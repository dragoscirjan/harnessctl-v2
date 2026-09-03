# Changelog

## Unreleased

- Establish Config v1 as the first stable public configuration contract, generated from
  one TypeScript authority and consumed by both TypeScript and Python. Unreleased Config
  v2/v3 files require manual rewrite with explicit `version: 1`; no compatibility reader
  or automatic migration ships.
- Add credential-reference-only URL and command `mcpServers` declarations with host-native
  OpenCode/Pi inference. Exact generated entries remain managed; pre-existing or edited
  entries remain operator-owned and unchanged, including under `--force`.
- Add a repository-local Documents authority, defaulting to `.harnessctl/documents` with
  safe custom Config v1 roots, for HLD, LLD, design-overview, and GDD records with nine
  normalized lifecycle tools and thin OpenCode and Pi adapters.
- Integrate Documents creation, review, versioning, validation, and issue linking into the
  existing SDLC Plan reference without generating a Documents agent or skill.
- Ship no `.specs` or `.ai.tmp` migration or link compatibility; `.specs-v1` remains inert
  repository history rather than live authority.
- Remove remote Documents providers, wiki routes, MCP identities, and configuration. Exact
  previously generated `sdlc-documents` trees are removed transactionally; modified trees
  are preserved with a warning.
- Add patch Changesets for all three runtime packages; package versions and dependency
  ranges remain unchanged until release versioning.
- Add opt-in Git Epic workspaces with deterministic branches and sibling paths, explicit
  readiness and cleanup transitions, fail-closed recovery, and equivalent OpenCode/Pi tools.

## 0.2.0

- **Breaking:** replace the 18-command SDLC surface with `work-plan`, `work-build`,
  `work-verify`, `work-release`, and `work-continue`; deprecated aliases are not installed.
- Add explicit `--replace-sdlc-command-set` migration consent. Migration replaces overlapping
  Plan/Verify outputs and removes the 16 retired outputs only for selected harnesses.
- Preserve normal conflict handling for unrelated customized outputs and exact transactional
  rollback on migration failure.
- **Breaking:** namespace five generated support skills under `sdlc-`: `caveman`, `cvs`,
  `develop-tdd`, `issue-tracking`, and `memory`. Existing `sdlc`, `sdlc-code`, and
  `sdlc-code-index` skill IDs, configuration key `skills.codeIndex`, and external MCP
  IDs remain unchanged.
- Fresh installs generate only current skill IDs. Normal and `--force` upgrades preserve
  the five legacy support roots without traversal and disclose exact paths;
  `--replace-sdlc-skill-set` removes selected-host legacy support trees after symlink and
  special-entry validation, with transactional rollback of file bytes, existence, and
  directory topology.
- **Breaking:** rename harnessctl-owned CVS MCP IDs from `cvs_github`, `cvs_gitlab`,
  `cvs_gitea`, and `cvs_forgejo` to the corresponding `sdlc_cvs_*` IDs. Fresh installs
  emit only canonical IDs. Upgrades transactionally remove exact generated legacy
  definitions; modified legacy or operator entries remain byte-for-byte unchanged with a
  warning. No compatibility aliases are installed.

This release builds Python wheel and source distributions as CI artifacts and includes a patch
changeset for `@harnessctl/generic-tools`; Changesets will propagate required exact-range adapter
dependency updates. It does not publish artifacts to PyPI or npm.
